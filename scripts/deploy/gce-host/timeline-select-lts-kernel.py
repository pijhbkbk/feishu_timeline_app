#!/usr/bin/python3
"""Keep the saved GRUB default on the newest installed, complete GCP 5.15 kernel."""
import functools
import os
from pathlib import Path
import re
import stat
import sys
import subprocess


def trusted_file(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise RuntimeError('UNTRUSTED_BOOT_FILE')


def select_entry(versions, grub):
    def compare(left, right):
        code = subprocess.run(['dpkg', '--compare-versions', left, 'lt', right]).returncode
        if code not in (0, 1):
            raise RuntimeError('VERSION_COMPARISON_FAILED')
        return -1 if code == 0 else (0 if left == right else 1)
    if not versions:
        raise RuntimeError('NO_COMPLETE_INSTALLED_LTS_KERNEL')
    version = sorted(versions, key=functools.cmp_to_key(compare))[-1]
    submenus = re.findall(r"^submenu .*?\$menuentry_id_option '([^']+)'", grub, re.M)
    entries = re.findall(r"^\s*menuentry .*?\$menuentry_id_option '(gnulinux-" + re.escape(version) + r"-advanced-[^']+)'", grub, re.M)
    if len(submenus) != 1 or len(entries) != 1:
        raise RuntimeError('AMBIGUOUS_LTS_GRUB_ENTRY')
    return version, submenus[0] + '>' + entries[0]


def main():
    if os.geteuid() != 0:
        raise RuntimeError('ROOT_REQUIRED')
    configuring = None
    removing = None
    if len(sys.argv) != 1:
        if len(sys.argv) != 3 or sys.argv[1] not in ('--postinst', '--prerm') or not re.fullmatch(r'5\.15\.\d+-\d+-gcp', sys.argv[2]):
            raise RuntimeError('INVALID_POSTINST_ARGUMENT')
        if sys.argv[1] == '--postinst':
            configuring = sys.argv[2]
        else:
            removing = sys.argv[2]
    boot = Path('/boot')
    versions = []
    for kernel in boot.glob('vmlinuz-5.15.*-gcp'):
        version = kernel.name.removeprefix('vmlinuz-')
        if not re.fullmatch(r'5\.15\.\d+-\d+-gcp', version):
            continue
        if version == removing:
            continue
        state = subprocess.run(['dpkg-query', '-W', '-f=${db:Status-Status}', 'linux-image-' + version], capture_output=True, text=True)
        permitted = state.stdout == 'installed' or (version == configuring and state.stdout == 'half-configured')
        if state.returncode != 0 or not permitted:
            continue
        module_state = subprocess.run(['dpkg-query', '-W', '-f=${db:Status-Status}', 'linux-modules-' + version], capture_output=True, text=True)
        if module_state.returncode != 0 or module_state.stdout != 'installed':
            continue
        initrd = boot / ('initrd.img-' + version)
        modules = Path('/lib/modules') / version
        try:
            for required in (kernel, initrd, modules / 'modules.dep', modules / 'modules.builtin'):
                trusted_file(required)
        except FileNotFoundError:
            print('Skipping incomplete LTS candidate:', version)
            continue
        if subprocess.run(['lsinitramfs', str(initrd)], stdout=subprocess.DEVNULL).returncode != 0:
            print('Skipping unreadable LTS initrd:', version)
            continue
        versions.append(version)
    if removing is not None:
        if not any(version != removing for version in versions):
            raise RuntimeError('REFUSE_REMOVE_LAST_COMPLETE_LTS_KERNEL')
        print('LTS removal prerequisite verified')
        return
    grub = boot / 'grub/grub.cfg'
    trusted_file(grub)
    subprocess.run(['grub-script-check', str(grub)], check=True)
    grub_text = grub.read_text()
    if not re.search(r'^\s*set default="\$\{saved_entry\}"$', grub_text, re.M):
        raise RuntimeError('GENERATED_GRUB_DOES_NOT_USE_SAVED_DEFAULT')
    version, entry = select_entry(versions, grub_text)
    subprocess.run(['grub-set-default', entry], check=True)
    saved = subprocess.check_output(['grub-editenv', 'list'], text=True).splitlines()
    if 'saved_entry=' + entry not in saved:
        raise RuntimeError('SAVED_KERNEL_VERIFY_FAILED')
    print('LTS default verified:', version)


if __name__ == '__main__':
    main()
