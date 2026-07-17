# R24B SSH Restriction Evidence

## Result

`R24-HOST-001 = FIXED / RETEST PASS`

The globally open SSH rule is disabled, the replacement IAP path is working, and a direct non-IAP SSH session cannot reach the VM's SSH service. The old rule was retained in a disabled state for controlled rollback; no rollback was required.

## Change record

- Authorized by: user confirmation in the R24B execution task
- Operator role: project Owner; account identity omitted from evidence
- Execution start: 2026-07-17 08:43:07 +08:00 (`2026-07-17T00:43:07Z`)
- Final verification: 2026-07-17 08:50:01 +08:00 (`2026-07-17T00:50:01Z`)
- Project: `axial-acrobat-492709-r7`
- Instance: `instance-20260408-091840`
- Zone: `us-west1-b`
- Network: `default`
- Application commit during the SSH-only change: `d86c04e8c016a0241172fb7c608f55d8dfcca5c9`
- Final R24B application/staging commit after later application remediations: `f00703ac7834837f9ad573bc11d779a5caa7c02f`
- Production deployment/restart: none
- Authentication secrets recorded: none

## Before state

| Control | State |
|---|---|
| `default-allow-ssh` | Enabled; ingress TCP 22 from `0.0.0.0/0`; no target tag; priority 65534 |
| `allow-iap-ssh` | Absent |
| IAP API | Disabled |
| Instance tags | `cpwi-web`, `http-server`, `https-server` |
| VM inventory | One running VM in the project |

No SSH key value, token, credential, or account email address was read or recorded.

## Approved changes executed

1. Enabled `iap.googleapis.com`.
2. Added the `iap-ssh` network tag while preserving all existing tags.
3. Created `allow-iap-ssh` with:
   - ingress allow;
   - priority 1000;
   - source `35.235.240.0/20` only;
   - TCP 22 only;
   - target tag `iap-ssh` only;
   - firewall logging enabled.
4. Completed two independent IAP SSH checks before touching the original rule.
5. Disabled, but did not delete, `default-allow-ssh`.
6. Repeated IAP, firewall, direct-path, service, and HTTPS health verification.

## Replacement-path proof before disable

| Check | Result |
|---|---|
| IAP connection 1 | PASS; new tunnel established |
| Remote identity | PASS; expected non-root operator |
| Approved non-interactive sudo | PASS |
| API service | `active` |
| Web service | `active` |
| Nginx service | `active` |
| Application checkout | Present |
| IAP connection 2 | PASS; independent new tunnel established |
| Nginx configuration | Syntax and configuration test successful |
| Deployment tooling | Executable and readable |

The original global rule remained enabled throughout these pre-disable checks.

## Final state

| Rule/control | Final state |
|---|---|
| `allow-iap-ssh` | Enabled; `35.235.240.0/20`; TCP 22; target `iap-ssh`; logging enabled |
| `default-allow-ssh` | Disabled; retained for rollback |
| IAP API | Enabled |
| Instance tags | `cpwi-web`, `http-server`, `https-server`, `iap-ssh` |
| Post-disable IAP SSH | PASS |
| Post-disable remote user/sudo | PASS; non-root identity and approved sudo |
| API/Web/Nginx | All `active` |
| Nginx configuration | PASS |
| HTTPS root | Reachable; HTTP 307 expected application redirect |
| HTTPS health | HTTP 200 |

The effective-firewall view shows no enabled non-IAP TCP 22 allow rule for the target VM.

## Unauthorized direct-path proof

The test runner's public source was programmatically confirmed to be outside `35.235.240.0/20` without recording the address.

Three complementary checks were used:

1. A new non-IAP `gcloud compute ssh` connection timed out before receiving an SSH banner and exited 255.
2. During a separate direct TCP probe, an IAP observer checked the VM's established port-22 sockets. The VM reported zero established SSH connections from outside the IAP source range.
3. The same direct probe received no SSH banner, while a simultaneous independent IAP observer connection succeeded.

The local `nc -z` implementation reported a TCP connect result even after the rule was disabled. This signal was treated as inconclusive rather than hidden: the direct SSH protocol attempt timed out, no SSH banner was returned, and the VM-side socket observation proved that the apparent connection did not reach the VM as a non-IAP SSH session. The GCP effective-firewall view independently showed the global rule disabled and only the tagged IAP rule enabled for TCP 22.

## Rollback readiness

Rollback command retained in the approved plan:

```bash
gcloud compute firewall-rules update default-allow-ssh \
  --project=axial-acrobat-492709-r7 \
  --no-disabled
```

Rollback trigger did not occur because post-disable IAP access, sudo, service status, Nginx validation, and HTTPS health all passed.

## Acceptance

- Replacement SSH path verified before disabling the old path: PASS
- Sudo and deployment-tool access verified: PASS
- Open `0.0.0.0/0:22` rule disabled: PASS
- New non-IAP SSH session blocked from reaching the VM service: PASS
- Application health preserved: PASS
- Rollback available and not required: PASS
- `R24-HOST-001`: **Fixed**

This SSH action changed only the host/configuration finding and did not deploy or restart application code. Later R24B application remediations produced and deployed the final commit recorded above; they do not alter the SSH evidence.
