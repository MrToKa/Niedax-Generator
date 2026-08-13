# Local network access

Run `pnpm access:url`. It filters loopback, link-local, Docker/WSL/virtual/VPN adapters when a normal
private adapter is available. A DHCP change changes the URL. The host and Docker must stay awake and
running; there is no public DNS, port forwarding, or remote server.

On Windows, first set the trusted LAN adapter to the Private profile and determine its subnet. Review
this administrator command, replacing the example subnet before approving it:

```powershell
New-NetFirewallRule -DisplayName "Niedax Generator LAN 8080" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080 -RemoteAddress 192.168.5.0/24 -Profile Private
```

Remove only that named rule with `Remove-NetFirewallRule -DisplayName "Niedax Generator LAN 8080"`.
The project never runs either command.

On Linux with UFW, review `sudo ufw allow from 192.168.5.0/24 to any port 8080 proto tcp`. With
firewalld, create a source-scoped rich rule for the actual subnet and TCP 8080. Do not permit
`0.0.0.0/0`.

Docker internal edge/backend networks block normal application and data-service egress. Docker
Desktop requires Gateway to have a non-internal ingress bridge for host port forwarding, which also
leaves a network route from Gateway to public addresses. Caddy has no external proxy target or DNS
configuration, but complete network-level defense in depth requires a reviewed outbound-deny rule
scoped to Docker Desktop's Gateway/VM traffic. Windows Firewall cannot reliably select one Linux
container by name; use the current Docker Desktop/WSL interface and destination/port scope only after
administrator review, ensuring localhost/LAN TCP 8080 remains allowed. Rerun
`pnpm test:runtime-isolation` after any rule. The project does not apply this host rule.
