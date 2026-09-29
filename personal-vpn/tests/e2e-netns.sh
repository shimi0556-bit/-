#!/usr/bin/env bash
# End-to-end test for vpn.sh using three network namespaces on one Linux box:
#
#   vpn-cli (198.51.100.2) ── vpn-srv (198.51.100.1 | 203.0.113.2, 2001:db8:1::2) ── vpn-www (203.0.113.1, 2001:db8:1::1)
#
# The client has no route to vpn-www at all, so reaching it proves traffic went
# through the tunnel, and the source address vpn-www sees proves the server NATs it.
#
# Needs root, iproute2, wireguard-tools, iptables, qrencode, curl, python3, and
# either the WireGuard kernel module or wireguard-go. It installs into the real
# /etc/wireguard, so run it on a throwaway machine or container only.
#
#   sudo bash tests/e2e-netns.sh

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VPN="$HERE/../vpn.sh"
TMP="$(mktemp -d)"
PASS=0
FAIL=0

[[ $EUID -eq 0 ]] || {
	echo "run as root" >&2
	exit 1
}
[[ -e /etc/wireguard/wgvpn0.conf ]] && {
	echo "/etc/wireguard/wgvpn0.conf exists; refusing to touch a real install" >&2
	exit 1
}

srv() { ip netns exec vpn-srv env VPN_AUTO=1 "$@"; }
cli() { ip netns exec vpn-cli "$@"; }

check() {
	local what="$1"
	shift
	if "$@"; then
		echo "  PASS  $what"
		PASS=$((PASS + 1))
	else
		echo "  FAIL  $what"
		FAIL=$((FAIL + 1))
	fi
}

cleanup() {
	set +e
	cli wg-quick down "$TMP/vpncli.conf" >/dev/null 2>&1
	srv wg-quick down wgvpn0 >/dev/null 2>&1
	[[ -n "${WWW_PID:-}" ]] && kill "$WWW_PID" 2>/dev/null
	for ns in vpn-cli vpn-srv vpn-www; do ip netns del "$ns" 2>/dev/null; done
	rm -rf /etc/wireguard/wgvpn0.conf /etc/wireguard/wgvpn0.params /etc/wireguard/wgvpn0-clients \
		/etc/sysctl.d/99-wgvpn0.conf "$TMP"
	grep -q "Personal VPN" /usr/local/bin/vpn 2>/dev/null && rm -f /usr/local/bin/vpn
}
trap cleanup EXIT

echo "== network"
for ns in vpn-cli vpn-srv vpn-www; do ip netns add "$ns"; done
ip link add srv-www type veth peer name www0
ip link add srv-cli type veth peer name cli0
ip link set srv-www netns vpn-srv
ip link set www0 netns vpn-www
ip link set srv-cli netns vpn-srv
ip link set cli0 netns vpn-cli
for ns in vpn-cli vpn-srv vpn-www; do ip -n "$ns" link set lo up; done

ip -n vpn-www addr add 203.0.113.1/24 dev www0
ip -n vpn-www link set www0 up
ip -n vpn-srv addr add 203.0.113.2/24 dev srv-www
ip -n vpn-srv addr add 198.51.100.1/24 dev srv-cli
ip -n vpn-srv link set srv-www up
ip -n vpn-srv link set srv-cli up
ip -n vpn-srv route add default via 203.0.113.1

# Some kernels (e.g. sandboxes) have IPv6 disabled: then test the IPv4-only server path.
V6=0
if ip -n vpn-www addr add 2001:db8:1::1/64 dev www0 nodad 2>/dev/null; then
	V6=1
	ip -n vpn-srv addr add 2001:db8:1::2/64 dev srv-www nodad
	ip -n vpn-srv -6 route add default via 2001:db8:1::1
else
	echo "  (no IPv6 in this kernel: testing an IPv4-only server)"
fi

ip -n vpn-cli addr add 198.51.100.2/24 dev cli0
ip -n vpn-cli link set cli0 up

# "Internet" web server that answers with the address it sees the request coming from.
ip netns exec vpn-www python3 -c '
import http.server, socket
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = self.client_address[0].removeprefix("::ffff:").encode()
        self.send_response(200); self.send_header("Content-Length", str(len(body))); self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a): pass
if socket.has_ipv6 and '"$V6"' == 1:
    class S(http.server.HTTPServer):
        address_family = socket.AF_INET6
        def server_bind(self):
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
            super().server_bind()
    S(("::", 8080), H).serve_forever()
else:
    http.server.HTTPServer(("0.0.0.0", 8080), H).serve_forever()
' &
WWW_PID=$!
sleep 1

seen_from() { cli curl -fsS --max-time 5 "$1"; }

check "client can't reach the internet host before the VPN" \
	bash -c "! ip netns exec vpn-cli curl -fsS --max-time 2 http://203.0.113.1:8080/ >/dev/null 2>&1"

echo "== install"
srv env VPN_ENDPOINT=198.51.100.1 VPN_PORT=51820 VPN_DNS=adguard VPN_FIRST_CLIENT=laptop \
	bash "$VPN" install >"$TMP/install.log" 2>&1 || {
	cat "$TMP/install.log"
	exit 1
}
check "install printed a QR code" grep -q "▀" "$TMP/install.log"
check "server interface is up" bash -c "ip -n vpn-srv link show wgvpn0 >/dev/null"
check "server detected IPv6 = $V6" grep -q "^IPV6=$V6" /etc/wireguard/wgvpn0.params
check "client config uses AdGuard DNS" grep -q "^DNS = 94.140.14.14" /etc/wireguard/wgvpn0-clients/laptop.conf
check "client config routes everything" grep -qx "AllowedIPs = 0.0.0.0/0, ::/0" /etc/wireguard/wgvpn0-clients/laptop.conf
check "client config has the endpoint" grep -qx "Endpoint = 198.51.100.1:51820" /etc/wireguard/wgvpn0-clients/laptop.conf
check "files are private" \
	bash -c "[[ \$(stat -c %a /etc/wireguard/wgvpn0.conf) == 600 && \$(stat -c %a /etc/wireguard/wgvpn0-clients/laptop.conf) == 600 ]]"

echo "== connect"
# wg-quick on the test client has no resolvconf, so leave DNS out of its copy; and a
# kernel without IPv6 can't install the ::/0 route (real phones and PCs can).
grep -v '^DNS' /etc/wireguard/wgvpn0-clients/laptop.conf >"$TMP/vpncli.conf"
((V6)) || sed -i 's|, ::/0$||' "$TMP/vpncli.conf"
chmod 600 "$TMP/vpncli.conf"
cli wg-quick up "$TMP/vpncli.conf" >"$TMP/cli-up.log" 2>&1 || { cat "$TMP/cli-up.log"; exit 1; }
check "IPv4 reaches the internet host, NATed to the server's address" \
	bash -c "[[ \$(ip netns exec vpn-cli curl -fsS --max-time 5 http://203.0.113.1:8080/) == 203.0.113.2 ]]"
if ((V6)); then
	check "IPv6 reaches the internet host, NATed to the server's address" \
		bash -c "[[ \$(ip netns exec vpn-cli curl -fsS --max-time 5 'http://[2001:db8:1::1]:8080/') == 2001:db8:1::2 ]]"
fi

srv bash "$VPN" list >"$TMP/list.log" 2>&1
check "list shows the connected device" grep -Eq "^laptop +10\.66\.66\.2 +[0-9]+s ago" "$TMP/list.log"

echo "== manage devices"
srv bash "$VPN" add phone >"$TMP/add.log" 2>&1
if ((V6)); then
	check "second device gets the next address" grep -qx "Address = 10.66.66.3/32, fd66:66:66::3/128" /etc/wireguard/wgvpn0-clients/phone.conf
else
	check "second device gets the next address" grep -qx "Address = 10.66.66.3/32" /etc/wireguard/wgvpn0-clients/phone.conf
	check "IPv4-only server gives IPv4-only DNS" grep -qx "DNS = 94.140.14.14, 94.140.15.15" /etc/wireguard/wgvpn0-clients/phone.conf
fi
check "running server knows the new device" bash -c "[[ \$(ip netns exec vpn-srv wg show wgvpn0 peers | wc -l) == 2 ]]"
check "the laptop stays connected while adding" \
	bash -c "[[ \$(ip netns exec vpn-cli curl -fsS --max-time 5 http://203.0.113.1:8080/) == 203.0.113.2 ]]"
check "duplicate names are refused" bash -c "! ip netns exec vpn-srv env VPN_AUTO=1 bash '$VPN' add phone >/dev/null 2>&1"
check "bad names are refused" bash -c "! ip netns exec vpn-srv env VPN_AUTO=1 bash '$VPN' add 'my phone' >/dev/null 2>&1"
check "show prints the config again" bash -c "ip netns exec vpn-srv env VPN_AUTO=1 bash '$VPN' show phone | grep -q '^Endpoint = 198.51.100.1:51820'"

srv bash "$VPN" remove laptop >/dev/null 2>&1
check "removed device's config is gone" test ! -e /etc/wireguard/wgvpn0-clients/laptop.conf
check "removed device can't use the VPN any more" \
	bash -c "! ip netns exec vpn-cli curl -fsS --max-time 4 http://203.0.113.1:8080/ >/dev/null 2>&1"
check "the other device is still there" grep -q "^### vpn-client: phone$" /etc/wireguard/wgvpn0.conf
srv bash "$VPN" add laptop2 >/dev/null 2>&1
check "freed address is reused" grep -q "^Address = 10.66.66.2/32" /etc/wireguard/wgvpn0-clients/laptop2.conf

echo "== uninstall"
srv bash "$VPN" uninstall >/dev/null 2>&1
check "uninstall without confirmation changes nothing" test -e /etc/wireguard/wgvpn0.conf
srv env VPN_YES=1 bash "$VPN" uninstall >/dev/null 2>&1
check "uninstall removes the interface" bash -c "! ip -n vpn-srv link show wgvpn0 >/dev/null 2>&1"
check "uninstall removes configs and keys" bash -c "[[ ! -e /etc/wireguard/wgvpn0.conf && ! -e /etc/wireguard/wgvpn0-clients ]]"
check "uninstall removes the firewall rules" \
	bash -c "! ip netns exec vpn-srv iptables-save | grep -Eq '51820|10\.66\.66' && ! ip netns exec vpn-srv ip6tables-save 2>/dev/null | grep -q 'fd66'"

echo
echo "$PASS passed, $FAIL failed"
((FAIL == 0))
