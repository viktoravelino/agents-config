# Publish a Dokku app on `<name>.vkav.dev`

Run after `ssh dokku domains:add <app> <name>.vkav.dev` and after the maintainer has confirmed the new public hostname. Zone `vkav.dev`, tunnel `homelab` (remotely managed). The Cloudflare account, zone and tunnel ids live in the private homelab repo (`config/cloudflare/account.json` and `tunnel.json`) and are read from there below; do not copy them into this skill. The login also sees a second account, so never pick the account from `GET /accounts`.

Auth is the global API key in `~/.config/cloudlflare/global-api-key` (the directory name is spelled that way) with the header pair `X-Auth-Email` and `X-Auth-Key`. The email is the Cloudflare login of the maintainer and is not recorded in the homelab repo: ask for it once and put it in `CF_EMAIL`. The key is read inside the `cf` function and never printed; do not `echo` it, `set -x`, or paste curl output that includes request headers.

```bash
CF_EMAIL=<cloudflare-login-email>
NAME=<name>
B=https://api.cloudflare.com/client/v4
H=~/projects/homelab/config/cloudflare
ACCT=$(jq -r .account_id $H/account.json)
TUNNEL=$(jq -r .id $H/tunnel.json)
cf() { curl -sS -H "X-Auth-Email: $CF_EMAIL" -H "X-Auth-Key: $(cat ~/.config/cloudlflare/global-api-key)" -H "Content-Type: application/json" "$@"; }
ZONE=$(jq -r .zone_id $H/account.json)

# 1. Tunnel ingress: insert the hostname before the http_status:404 catch-all, change nothing else.
#    The jq errors out if the hostname already exists, so the PUT never runs on a no-op.
BODY=$(cf "$B/accounts/$ACCT/cfd_tunnel/$TUNNEL/configurations" | jq -c --arg h "$NAME.vkav.dev" '
  .result.config
  | if any(.ingress[]; .hostname == $h) then error("hostname already present") else . end
  | .ingress |= (.[:-1] + [{hostname: $h, service: "http://192.168.2.13:80", originRequest: {}}] + .[-1:])
  | {config: .}') && echo "$BODY" | jq .   # review: the only diff is the new entry
echo "$BODY" | cf -X PUT "$B/accounts/$ACCT/cfd_tunnel/$TUNNEL/configurations" --data @- | jq '{success, errors}'

# 2. Proxied CNAME to the tunnel.
cf -X POST "$B/zones/$ZONE/dns_records" \
  --data "{\"type\":\"CNAME\",\"name\":\"$NAME\",\"content\":\"$TUNNEL.cfargotunnel.com\",\"proxied\":true,\"ttl\":1,\"comment\":\"<app> on Dokku (tunnel homelab)\"}" | jq '{success, errors}'
```

Then check `curl -sI https://$NAME.vkav.dev/` (200, `server: cloudflare`) and refresh the snapshots in the homelab repo: `config/cloudflare/tunnel-ingress.json` (`.result.config` of the GET above) and `config/cloudflare/dns-records.json` (zone records reduced to name/type/content/proxied/ttl/comment); update the counts in `config/README.md` and the hostname list in the homelab `README.md`.

Remove a hostname: the same GET, a jq that drops the entry (`.ingress |= map(select(.hostname != $h))`), PUT the result, then `cf -X DELETE "$B/zones/$ZONE/dns_records/<record-id>"` (record id from `GET $B/zones/$ZONE/dns_records?name=<name>.vkav.dev`). Confirm with the maintainer first.
