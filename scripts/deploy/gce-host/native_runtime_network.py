"""Fixed native runtime network foundation, installed independently as root bytes.

No application container, database, Redis, nginx or unrelated network is changed.
Own nft table is replaced atomically; never flush the global ruleset. No removal
operation is exposed: partial setup stays isolated for diagnosis/recovery.
"""
import hashlib
import ipaddress
import json
import os
import re
from pathlib import Path
import socket
import selectors
import signal
import tempfile
import time
import stat
import subprocess
import sys

INSTALLED = Path('/usr/local/lib/timeline-native-ops')
if Path(__file__).parent == INSTALLED:
    for node in [*reversed(INSTALLED.parents), INSTALLED]:
        info = node.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise RuntimeError('Untrusted installed directory')
    sys.path.insert(0, str(INSTALLED))
import native_backup_controller as backup

CONFIG = Path('/etc/timeline-native-runtime/native-runtime.nft')
FIREWALL_SHA = '31ceb4c0f7a1a334930551592bd85742af0bdfdbe4a3805c9910598f5b5fb822'
TABLE = 'timeline_native_runtime'
LABEL = 'com.timeline.native.network=v1'
NETWORKS = [('timeline-native-api', 'br-tln-api', '172.30.44.0/29', '172.30.44.1'),
            ('timeline-native-web', 'br-tln-web', '172.30.45.0/29', '172.30.45.1')]
require = backup.require


def run(args, *, payload=None, timeout=45):
    # Extended budgets are limited to the fixed native API shutdown chain.
    require(type(timeout) is int and timeout in (45, 80, 110), 'Unsupported command deadline')
    if timeout == 80:
        require(len(args) == 4 and args[:3] == ['/usr/bin/docker', 'stop', '--time=65'] and
                re.fullmatch(r'[a-f0-9]{64}', args[3]), 'Extended Docker deadline is only for bounded API stop')
    if timeout == 110:
        require(args == ['/usr/bin/systemctl', 'stop', 'timeline-native-api.service'],
                'Extended supervisor deadline is only for native API stop')
    require(payload is None or len(payload) <= 8192, 'Network command input exceeds bound')
    # A private anonymous file avoids pipe write/read deadlocks; no secret input.
    with tempfile.TemporaryFile() as source:
        if payload:
            source.write(payload)
        source.seek(0)
        process = subprocess.Popen(args, stdin=source, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   env=backup.ENV, cwd='/', start_new_session=True)
        buffers = [bytearray(), bytearray()]
        deadline = time.monotonic() + timeout
        try:
            with selectors.DefaultSelector() as ready:
                for index, stream in enumerate((process.stdout, process.stderr)):
                    ready.register(stream, selectors.EVENT_READ, index)
                while ready.get_map():
                    remaining = deadline - time.monotonic()
                    require(remaining > 0, 'Network command deadline exceeded')
                    for key, _ in ready.select(remaining):
                        block = os.read(key.fileobj.fileno(), 65536)
                        if not block:
                            ready.unregister(key.fileobj)
                            continue
                        require(sum(map(len, buffers)) + len(block) <= 1024 * 1024, 'Network output exceeds bound')
                        buffers[key.data].extend(block)
                remaining = deadline - time.monotonic()
                require(remaining > 0, 'Network command deadline exceeded')
                require(process.wait(timeout=remaining) == 0, 'Network command failed: ' + Path(args[0]).name)
            return bytes(buffers[0])
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)
            process.stdout.close()
            process.stderr.close()


def firewall():
    fd = backup.directory(CONFIG.parent, trusted=True)
    os.close(fd)
    info = CONFIG.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == 0o644,
            'Firewall configuration rejected')
    raw = CONFIG.read_bytes()
    require(len(raw) < 8192 and hashlib.sha256(raw).hexdigest() == FIREWALL_SHA, 'Firewall configuration differs')
    inventory = json.loads(run(['/usr/sbin/nft', '-j', 'list', 'tables']))['nftables']
    existing = [item['table'] for item in inventory if 'table' in item and item['table']['name'] == TABLE]
    require(len(existing) <= 1, 'Ambiguous firewall table')
    if existing:
        require(existing[0]['family'] == 'inet', 'Unexpected firewall family')
        current = json.loads(run(['/usr/sbin/nft', '-j', 'list', 'table', 'inet', TABLE]))['nftables']
        header = [item['table'] for item in current if 'table' in item]
        require(len(header) == 1 and header[0].get('comment') == 'timeline-native-runtime-v1', 'Unowned firewall table')
        raw = ('delete table inet ' + TABLE + '\n').encode() + raw
    # Syntax-check and then submit one kernel transaction, preserving all other tables.
    run(['/usr/sbin/nft', '--check', '--file', '-'], payload=raw)
    run(['/usr/sbin/nft', '--file', '-'], payload=raw)
    result = json.loads(run(['/usr/sbin/nft', '-j', 'list', 'table', 'inet', TABLE]))['nftables']
    chains = [item['chain'] for item in result if 'chain' in item]
    require({item['name'] for item in chains} == {'input', 'forward'} and len(chains) == 2 and
            all(item['type'] == 'filter' and item['prio'] == -10 and item['policy'] == 'accept' for item in chains),
            'Firewall hooks not proved')
    require(len([item for item in result if 'rule' in item]) == 8, 'Firewall rule inventory differs')


def network_inventory():
    names = run(['/usr/bin/docker', 'network', 'ls', '--format', '{{.Name}}']).decode().splitlines()
    require(len(names) <= 64 and len(set(names)) == len(names), 'Unexpected Docker network inventory')
    if not names:
        return []
    # Existing names are data, always after the command and -- separator.
    return json.loads(run(['/usr/bin/docker', 'network', 'inspect', '--', *names]))


def validate_network(item, expected):
    name, bridge, subnet, gateway = expected
    require(item['Name'] == name and item['Driver'] == 'bridge' and item['Scope'] == 'local' and
            item['Internal'] is True and item['EnableIPv6'] is False and item['Ingress'] is False and
            item.get('Labels', {}).get('com.timeline.native.network') == 'v1', 'Unowned or unisolated runtime network')
    require(item['IPAM']['Driver'] == 'default' and item['IPAM']['Config'] == [{'Subnet': subnet, 'Gateway': gateway}],
            'Runtime network addresses differ')
    require(item['Options'].get('com.docker.network.bridge.name') == bridge and
            item['Options'].get('com.docker.network.bridge.host_binding_ipv4') == '127.0.0.1' and
            item['Options'].get('com.docker.network.bridge.enable_ip_masquerade') == 'false', 'Runtime bridge options differ')
    require(len(item.get('Containers', {})) <= 5, 'Unexpected runtime network occupancy')


def preflight():
    inventory = network_inventory()
    addresses = json.loads(run(['/usr/sbin/ip', '-json', 'address', 'show']))
    routes = json.loads(run(['/usr/sbin/ip', '-json', 'route', 'show', 'table', 'all']))
    for expected in NETWORKS:
        name, bridge, subnet, _ = expected
        matches = [item for item in inventory if item['Name'] == name]
        require(len(matches) <= 1, 'Ambiguous runtime network')
        if matches:
            validate_network(matches[0], expected)
        for item in inventory:
            if item['Name'] == name:
                continue
            require(item.get('Options', {}).get('com.docker.network.bridge.name') != bridge, 'Bridge already owned')
            ranges = item.get('IPAM', {}).get('Config')
            builtin_without_subnet = (item['Name'], item['Driver']) in {('host', 'host'), ('none', 'null')}
            require(isinstance(ranges, list) or (ranges is None and builtin_without_subnet), 'Network address inventory malformed')
            for entry in ranges or []:
                if entry.get('Subnet'):
                    other = ipaddress.ip_network(entry['Subnet'])
                    require(other.version != 4 or not ipaddress.ip_network(subnet).overlaps(other), 'Network range overlaps')
        for interface in addresses:
            if matches and interface['ifname'] == bridge:
                continue
            require(interface['ifname'] != bridge, 'Unowned host interface')
            for address in interface.get('addr_info', []):
                if address['family'] == 'inet':
                    other = ipaddress.ip_network(address['local'] + '/' + str(address['prefixlen']), strict=False)
                    require(not ipaddress.ip_network(subnet).overlaps(other), 'Host interface range overlaps')
        for route in routes:
            if route.get('dst', 'default') == 'default' or (matches and route.get('dev') == bridge):
                continue
            other = ipaddress.ip_network(route['dst'], strict=False)
            require(other.version != 4 or not ipaddress.ip_network(subnet).overlaps(other), 'Host route range overlaps')
    return inventory


def networks(inventory):
    for expected in NETWORKS:
        name, bridge, subnet, gateway = expected
        if any(item['Name'] == name for item in inventory):
            continue
        run(['/usr/bin/docker', 'network', 'create', '--driver=bridge', '--internal', '--label=' + LABEL,
             '--subnet=' + subnet, '--gateway=' + gateway, '--opt=com.docker.network.bridge.name=' + bridge,
             '--opt=com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
             '--opt=com.docker.network.bridge.enable_ip_masquerade=false', name])
        created = json.loads(run(['/usr/bin/docker', 'network', 'inspect', name]))
        require(len(created) == 1, 'Created network identity absent')
        validate_network(created[0], expected)
        inventory.append(created[0])


def scanner_route():
    values = json.loads(run(['/usr/sbin/ip', '-json', 'route', 'show', '172.27.227.2/32']))
    if values:
        require(len(values) == 1 and values[0]['dst'] in ['172.27.227.2', '172.27.227.2/32'] and
                values[0].get('gateway') == '10.138.0.1' and values[0].get('dev') == 'ens4', 'Existing scanner route differs')
    else:
        run(['/usr/sbin/ip', 'route', 'add', '172.27.227.2/32', 'via', '10.138.0.1', 'dev', 'ens4', 'proto', 'static'])
    actual = json.loads(run(['/usr/sbin/ip', '-json', 'route', 'get', '172.27.227.2']))
    require(len(actual) == 1 and actual[0].get('gateway') == '10.138.0.1' and actual[0].get('dev') == 'ens4' and
            actual[0].get('prefsrc') == '10.138.0.2', 'Scanner /32 routing not proved')


def main():
    require(os.geteuid() == 0 and socket.gethostname() == 'instance-20260408-091840' and
            Path(__file__).parent == INSTALLED and sys.argv[1:] == ['setup'], 'Wrong host or operation')
    with backup.locked():
        inventory = preflight()  # Refuse conflicting resources before any firewall mutation.
        firewall()  # Close both container/host and forwarded paths before any network or proxy is usable.
        networks(inventory)
        scanner_route()
    print(json.dumps({'nativeNetworkFoundation': 'PASS', 'applicationStarted': False, 'productionDatabaseChanged': False}))


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        print(json.dumps({'nativeNetworkFoundation': 'FAILED', 'reason': str(error) if isinstance(error, backup.Failure) else type(error).__name__}), file=sys.stderr)
        sys.exit(1)
