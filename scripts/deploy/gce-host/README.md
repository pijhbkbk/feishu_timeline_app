# Reviewed GCE host components

These files are inputs to an independently authorized, root-owned installation procedure. Their presence in the application checkout does not authorize executing application-controlled code as root. The production controller and final deployment remain pending.

- `timeline-select-lts-kernel.py`: select the newest complete installed GCP 5.15 kernel through a stable GRUB ID. Exact postinst half-configured image state is accepted only for the specified version; its modules must already be installed. Missing or unreadable candidates are excluded; untrusted permissions/symlinks fail closed. The last complete LTS kernel cannot be removed.
- `zz-timeline-lts.cfg`: install as a late `/etc/default/grub.d/` drop-in, regenerate GRUB, verify effective saved-default behavior. Cloud image defaults can override `/etc/default/grub`; do not remove cloud boot settings or rescue kernels.
- `unused-server-protocols.conf`: only after proving SCTP and NFSD unused and unloaded, install under `/etc/modprobe.d/`, update all relevant initramfs files and verify after reboot. Do not unload an in-use module.
- `seccomp-amd64.json`: tested native x86-64 profile; non-native ABI denied. IPv6 socket attempts receive EAFNOSUPPORT to preserve musl address selection behavior. This is not an architecture-independent profile.

On an isolated Jammy GCE VM, exact official kernel image reinstallation showed `linux-image-5.15.0-1115-gcp half-configured` and `linux-modules-5.15.0-1115-gcp installed` inside the postinst hook. Final ordinary reboot verified kernel 5.15.0-1115-gcp, Docker 29.8, module denial, application persistence and proxy/scanner connectivity. This evidence does not prove changes to the original production server.

Reference evidence: `/private/tmp/rc2-production-20260910/evidence/validation-real-kernel-postinst.log` and `validation-final-maintenance-verified.log`. The full runtime/evidence identities belong in the execution ledger and release manifest, not in a self-authorizing installation script.
