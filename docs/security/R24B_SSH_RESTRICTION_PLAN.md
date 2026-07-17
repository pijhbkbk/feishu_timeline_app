# R24B SSH Restriction Plan

## Change status

**AUTHORIZED, EXECUTED AND VERIFIED — see `R24B_SSH_EVIDENCE.md`.**

The read-only audit and this plan were completed before mutation on 2026-07-17. The user subsequently approved the exact IAP plan. The IAP API, instance tag and firewall rules were changed as planned; no IAM policy, SSH metadata, application service or deployment was changed.

## Scope

- Project: `axial-acrobat-492709-r7`
- Network: `default`
- Instance: `instance-20260408-091840`
- Zone: `us-west1-b`
- Target finding: `R24-HOST-001`
- Prohibited activity: production deployment, restart, application/data mutation, or disabling the existing SSH path before the replacement path is proven

## Read-only findings

| Control | Observed state |
|---|---|
| VM inventory | One running VM in the project |
| Target VM network | `default`, internal IPv4 `10.138.0.2`, one external IPv4 |
| Target VM tags | `cpwi-web`, `http-server`, `https-server` |
| Current SSH firewall | `default-allow-ssh`, ingress TCP 22 from `0.0.0.0/0`, priority 65534, enabled, no target tag, logging disabled |
| Current rule impact | Applies to every eligible VM on the `default` network, not only the application VM |
| IAP API | Not currently enabled |
| Current operator authorization | Project Owner; no IAM mutation is proposed for this change |
| SSH metadata | SSH-key metadata is already present at project and instance scope; no key value was read or recorded |
| Repository readiness | Deployment helpers already support `GCE_TUNNEL_THROUGH_IAP=yes` and `--tunnel-through-iap` |

The official IAP TCP-forwarding requirement is an ingress rule from `35.235.240.0/20` to the required port. Google also recommends disabling or deleting the default globally open SSH rule after the replacement path works: <https://docs.cloud.google.com/iap/docs/using-tcp-forwarding>.

## Selected proposal: Option A — IAP TCP forwarding

IAP is the proposed route because no company fixed egress IP or approved bastion CIDR was supplied, the repository already supports IAP, and the IAP source range can replace unrestricted public SSH without affecting ports 80/443.

The firewall rule will use a dedicated network target tag so only the application VM receives IAP-originated TCP 22. The tag controls the firewall target; it does not replace IAP IAM authorization.

### Planned mutations requiring confirmation

1. Enable `iap.googleapis.com` in the project.
2. Add the network tag `iap-ssh` to `instance-20260408-091840` while preserving all existing tags.
3. Create `allow-iap-ssh` on `default`:
   - direction: ingress;
   - action: allow;
   - priority: 1000;
   - source: `35.235.240.0/20` only;
   - protocol/port: TCP 22 only;
   - target tag: `iap-ssh` only;
   - firewall logging: enabled.
4. After two successful replacement-path checks, disable (do not initially delete) `default-allow-ssh`.

No IAM role change, SSH daemon change, instance restart, production deployment, or external-IP removal is included.

## Exact execution sequence

The following commands are the proposed change set. They must not run until the user explicitly confirms the IAP option.

### 1. Capture the before state

```bash
PROJECT=axial-acrobat-492709-r7
INSTANCE=instance-20260408-091840
ZONE=us-west1-b

gcloud compute firewall-rules describe default-allow-ssh \
  --project="$PROJECT" \
  --format='yaml(name,network,direction,priority,sourceRanges,allowed,targetTags,disabled,logConfig)'

gcloud compute instances describe "$INSTANCE" \
  --project="$PROJECT" \
  --zone="$ZONE" \
  --format='yaml(name,tags,networkInterfaces)'
```

The evidence copy must not contain SSH keys, account email addresses, tokens, or other credentials.

### 2. Enable IAP and add the dedicated target tag

```bash
gcloud services enable iap.googleapis.com --project="$PROJECT"

gcloud compute instances add-tags "$INSTANCE" \
  --project="$PROJECT" \
  --zone="$ZONE" \
  --tags=iap-ssh
```

### 3. Add the restricted rule

```bash
gcloud compute firewall-rules create allow-iap-ssh \
  --project="$PROJECT" \
  --network=default \
  --direction=INGRESS \
  --priority=1000 \
  --action=ALLOW \
  --rules=tcp:22 \
  --source-ranges=35.235.240.0/20 \
  --target-tags=iap-ssh \
  --enable-logging \
  --description='R24B: SSH only through Google IAP TCP forwarding'
```

### 4. Verify the replacement path before touching the open rule

Run two new, independent IAP connections. The checks are read-only and do not deploy or restart production:

```bash
gcloud compute ssh "$INSTANCE" \
  --project="$PROJECT" \
  --zone="$ZONE" \
  --tunnel-through-iap \
  --command='set -eu; whoami; sudo -n true; test -d /opt/feishu_timeline_app; systemctl is-active feishu-timeline-api feishu-timeline-web nginx'

gcloud compute ssh "$INSTANCE" \
  --project="$PROJECT" \
  --zone="$ZONE" \
  --tunnel-through-iap \
  --command='set -eu; sudo -n nginx -t; test -x /opt/feishu_timeline_app/scripts/deploy/gce-release-verify.sh || test -d /opt/feishu_timeline_app/scripts/deploy'
```

Acceptance before proceeding:

- both commands establish a new IAP tunnel;
- the remote identity is the expected non-root operator;
- passwordless approved sudo works;
- the application checkout and deployment tooling are readable;
- API, Web, and Nginx remain active;
- Nginx configuration validation succeeds.

If either connection fails, stop. Do not disable `default-allow-ssh` and do not silently grant new IAM roles.

### 5. Disable the global rule

Only after all step-4 checks pass:

```bash
gcloud compute firewall-rules update default-allow-ssh \
  --project="$PROJECT" \
  --disabled
```

The rule is disabled first rather than deleted so that rollback is a single controlled command.

### 6. Post-change positive and negative checks

```bash
gcloud compute ssh "$INSTANCE" \
  --project="$PROJECT" \
  --zone="$ZONE" \
  --tunnel-through-iap \
  --command='set -eu; whoami; sudo -n true; systemctl is-active feishu-timeline-api feishu-timeline-web nginx'

gcloud compute firewall-rules list \
  --project="$PROJECT" \
  --format='table(name,network,direction,sourceRanges,allowed,targetTags,disabled)'

nc -vz -w 5 35.212.246.199 22
```

Required result:

- the new IAP SSH connection succeeds after the global rule is disabled;
- `allow-iap-ssh` is enabled and restricted to `35.235.240.0/20`, TCP 22, target `iap-ssh`;
- `default-allow-ssh` is disabled;
- a new direct TCP 22 connection from the operator's non-IAP public route fails;
- HTTP/HTTPS health remains unchanged;
- there is no production deployment or service restart.

## Rollback

If the post-disable IAP connection or required administrative access fails, immediately re-enable the previous rule:

```bash
gcloud compute firewall-rules update default-allow-ssh \
  --project="$PROJECT" \
  --no-disabled
```

Then verify direct administrative access is restored and stop for investigation. Do not delete `allow-iap-ssh`, remove the `iap-ssh` tag, or disable the IAP API until the failure cause and desired final state are reviewed.

## Alternatives not selected

- **Option B — company egress `/32`:** viable only after the exact stable corporate egress address and its owner are supplied and approved.
- **Option C — approved bastion CIDR:** viable only after the bastion identity, address range, access controls, logging, and operating owner are supplied and approved.

Either alternative requires a revised plan before execution. An arbitrary current residential/public address will not be treated as a company fixed egress address.

## Evidence to produce after an approved execution

`docs/security/R24B_SSH_EVIDENCE.md` will record, without credentials:

- execution start/end time and operator role;
- sanitized before/after firewall and instance-tag state;
- IAP API state;
- both pre-disable IAP checks;
- global-rule disable result;
- post-disable IAP success;
- unauthorized direct TCP 22 failure;
- application/Nginx health;
- whether rollback was needed;
- final status of `R24-HOST-001`.

## Approval checkpoint

The user supplied the required confirmation, and execution completed with all acceptance checks passing. The approval text was:

> Confirm the IAP plan in `docs/security/R24B_SSH_RESTRICTION_PLAN.md`, including enabling the IAP API, adding the `iap-ssh` instance tag, creating `allow-iap-ssh`, validating two IAP sessions, and then disabling (not deleting) `default-allow-ssh` with the documented rollback available.

Final evidence: `docs/security/R24B_SSH_EVIDENCE.md`; rollback was not required.
