# Native-account GCE runtime

The immutable application candidate and database-copy preservation proof are
recorded in the native-account acceptance evidence. This directory contains
separately reviewed operational inputs, installed root-owned outside the checkout.
No source file authorizes its own privileged execution.

`native_runtime_network.py setup` first inspects all existing Docker networks,
host interfaces and routes for conflicts. Exact built-in host/none networks may
have null IPAM configuration; bridge networks may not. Only after preflight does
it atomically install its own nft table, create two named internal IPv4 bridges,
and add the scanner's exact /32 route through the existing GCE gateway. It never
flushes another table, changes another network or restarts Docker. Namespace
checks cover permitted proxy traffic, forbidden host/metadata/cross-network
traffic, and unchanged unrelated traffic; actual Docker proof is separate.

API172.30.44.2 may reach gateway172.30.44.1 ports16432/13310 only. Redis is on the
same private bridge with password/ACL protection and no published port. Web is on
a separate172.30.45/29 bridge. Both bridges cannot initiate other host connections
or route to other networks. Host-initiated API/Web traffic and replies remain
possible. Native containers have no extra network capability or Docker socket.

The PG proxy uses bounded systemd-socket-proxyd to existing host PG14 loopback.
The scanner proxy forwards through a separate SSH connection, with an exact host
key, source-restricted key and only127.0.0.1:3310 permitted on the scanner account.
No shell session, agent, remote forwarding or password login is enabled. The
private application key stays root-only on the application host and is provided
to a DynamicUser via systemd LoadCredential. This permanent application dependency
is separate from the temporary Mac/Cloud Shell management key, which is removed
at the end of delivery.

The SSH tunnel retries every10 seconds without a permanent start-limit lockout.
Its local proxy may remain available while the tunnel is down, but requests then
fail; the remote scanner approval and per-scan version checks are unchanged.
A service's active status is not scanner readiness. Maintenance stops both scanner
proxy units and the tunnel together. Boot network setup follows both database
recovery services before any proxy/container starts.

The new Redis version is7.4.11; pin the observed official registry digest, never
reuse the older7.4.9 development pin for production. Configuration explicitly uses
AOF fsync always, forbids truncated AOF loading and eviction, limits Redis data to
64MiB inside a256MiB container, and restricts clients/output/query buffers. The
named application ACL includes only auth keys and exact notification queue key
families and commands. IN_APP delivery still uses the Redis notification queue,
so the runtime sets queue capacity256 instead of the default2000. Never restore
historical Redis sessions alongside a database backup. Test authenticated access,
wrong-password denial, ACL denials, notifications, full-memory errors and confirmed
session deletion through crash/restart before production use.

Candidate ports13000/13301 are local-only preflight endpoints. Final production
keeps the already approved Nginx upstream127.0.0.1:3000/3001 by stopping the old
services and binding the same immutable new images to these ports. Exact-domain
browser acceptance and product-owner confirmation remain separate release gates.
