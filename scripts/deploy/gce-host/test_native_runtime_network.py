import copy
import json
import unittest
import sys
from unittest.mock import patch
import native_runtime_network as network
import native_backup_controller as backup


def item(spec):
    name, bridge, subnet, gateway = spec
    return {'Name': name, 'Driver': 'bridge', 'Scope': 'local', 'Internal': True, 'EnableIPv6': False,
            'Ingress': False, 'Labels': {'com.timeline.native.network': 'v1'},
            'IPAM': {'Driver': 'default', 'Config': [{'Subnet': subnet, 'Gateway': gateway}]},
            'Options': {'com.docker.network.bridge.name': bridge,
                        'com.docker.network.bridge.host_binding_ipv4': '127.0.0.1',
                        'com.docker.network.bridge.enable_ip_masquerade': 'false'}, 'Containers': {}}


class IsolationTests(unittest.TestCase):
    def test_builtin_host_and_none_have_observed_null_ipam_without_overlap(self):
        builtins = [{'Name': name, 'Driver': driver, 'Options': {}, 'IPAM': {'Driver': 'default', 'Config': None}}
                    for name, driver in [('host', 'host'), ('none', 'null')]]
        with patch.object(network, 'network_inventory', return_value=builtins), patch.object(network, 'run', return_value=b'[]'):
            self.assertEqual(network.preflight(), builtins)
        builtins[0]['Driver'] = 'bridge'
        with patch.object(network, 'network_inventory', return_value=builtins), patch.object(network, 'run', return_value=b'[]'):
            with self.assertRaisesRegex(backup.Failure, 'inventory malformed'):
                network.preflight()

    def test_existing_network_cannot_silently_weaken_isolation(self):
        spec = network.NETWORKS[0]
        valid = item(spec)
        network.validate_network(valid, spec)
        for key, bad in [('Internal', False), ('EnableIPv6', True), ('Labels', {}),
                         ('IPAM', {'Driver': 'default', 'Config': [{'Subnet': '172.27.0.0/16', 'Gateway': '172.27.0.1'}]}),
                         ('Options', {}), ('Containers', {str(i): {} for i in range(6)})]:
            with self.subTest(key=key):
                changed = copy.deepcopy(valid); changed[key] = bad
                with self.assertRaises(backup.Failure):
                    network.validate_network(changed, spec)

    def test_unrelated_network_is_never_replaced_to_resolve_overlap(self):
        other = item(network.NETWORKS[0]); other['Name'] = 'unrelated'
        other['Options']['com.docker.network.bridge.name'] = 'unrelated-br'
        with patch.object(network, 'network_inventory', return_value=[other]), patch.object(network, 'run', return_value=b'[]') as run:
            with self.assertRaisesRegex(backup.Failure, 'overlaps'):
                network.preflight()
            self.assertTrue(all(call.args[0][0] == '/usr/sbin/ip' for call in run.call_args_list))

    def test_existing_bridge_name_is_not_taken_over(self):
        other = item(network.NETWORKS[0]); other['Name'] = 'unrelated'
        other['IPAM']['Config'] = [{'Subnet': '172.28.0.0/16'}]
        with patch.object(network, 'network_inventory', return_value=[other]), patch.object(network, 'run', return_value=b'[]') as run:
            with self.assertRaisesRegex(backup.Failure, 'already owned'):
                network.preflight()
            self.assertTrue(all(call.args[0][0] == '/usr/sbin/ip' for call in run.call_args_list))

    def test_existing_valid_networks_do_not_mutate_docker(self):
        with patch.object(network, 'network_inventory', return_value=[item(s) for s in network.NETWORKS]), patch.object(network, 'run') as run:
            network.networks([item(s) for s in network.NETWORKS])
            run.assert_not_called()

    def test_host_interface_conflict_precedes_any_firewall_change(self):
        address = [{'ifname': 'unrelated0', 'addr_info': [{'family': 'inet', 'local': '172.30.44.1', 'prefixlen': 29}]}]
        with patch.object(network, 'network_inventory', return_value=[]), patch.object(network, 'run', side_effect=[json.dumps(address).encode(), b'[]']):
            with self.assertRaisesRegex(backup.Failure, 'interface range overlaps'):
                network.preflight()

    def test_main_never_installs_firewall_after_conflicting_preflight(self):
        with patch.object(network.os, 'geteuid', return_value=0), patch.object(network.socket, 'gethostname', return_value='instance-20260408-091840'), \
             patch.object(network, 'INSTALLED', network.Path(network.__file__).parent), patch.object(network.sys, 'argv', ['controller', 'setup']), \
             patch.object(backup, 'locked'), patch.object(network, 'preflight', side_effect=backup.Failure('overlap')), \
             patch.object(network, 'firewall') as firewall, patch.object(network, 'networks') as networks:
            with self.assertRaises(backup.Failure):
                network.main()
            firewall.assert_not_called(); networks.assert_not_called()

    def test_extended_deadline_cannot_apply_to_unrelated_commands(self):
        for args, timeout in [(['/bin/true'], 80), (['/usr/bin/systemctl', 'stop', 'other.service'], 110),
                              (['/usr/bin/docker', 'stop', '--time=65', 'not-a-container-id'], 80), (['/bin/true'], 1000)]:
            with self.subTest(args=args, timeout=timeout), patch.object(network.subprocess, 'Popen') as popen:
                with self.assertRaises(backup.Failure): network.run(args, timeout=timeout)
                popen.assert_not_called()

    def test_streaming_output_bound_reaps_large_writer(self):
        with self.assertRaisesRegex(backup.Failure, 'output exceeds bound'):
            network.run([sys.executable, '-I', '-c', "import os; os.write(1,b'x'*2000000)"])

    def test_conflicting_specific_route_never_replaced(self):
        with patch.object(network, 'run', return_value=json.dumps([{'dst': '172.27.227.2', 'dev': 'br-unrelated'}]).encode()) as run:
            with self.assertRaisesRegex(backup.Failure, 'differs'):
                network.scanner_route()
            self.assertEqual(run.call_count, 1)

    def test_route_repair_is_only_exact_scanner_host_and_verified(self):
        actual = [{'dst': '172.27.227.2', 'gateway': '10.138.0.1', 'dev': 'ens4', 'prefsrc': '10.138.0.2'}]
        with patch.object(network, 'run', side_effect=[b'[]', b'', json.dumps(actual).encode()]) as run:
            network.scanner_route()
            self.assertEqual(run.call_args_list[1].args[0], ['/usr/sbin/ip', 'route', 'add', '172.27.227.2/32', 'via', '10.138.0.1', 'dev', 'ens4', 'proto', 'static'])


if __name__ == '__main__':
    unittest.main()
