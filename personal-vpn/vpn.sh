#!/usr/bin/env bash
# Personal VPN: a WireGuard server that runs on your own rented server.
#
#   sudo bash vpn.sh            first run installs the server, later runs open the menu
#   sudo vpn add <name>         add a device (prints a QR code + a config to paste)
#   sudo vpn show <name>        print a device's QR code / config again
#   sudo vpn remove <name>      revoke a device
#   sudo vpn list               devices, their VPN address and when they were last seen
#   sudo vpn uninstall          stop the VPN and delete its keys and configs
#
# Supported: Ubuntu 20.04+ and Debian 11+. After install the script copies itself to
# /usr/local/bin/vpn, so later you only type `sudo vpn`.
#
# Unattended install (every value is optional):
#   VPN_AUTO=1 VPN_ENDPOINT=vpn.example.com VPN_PORT=51820 VPN_DNS=adguard \
#   VPN_FIRST_CLIENT=phone sudo -E bash vpn.sh install

set -euo pipefail
umask 077

WG_IF="${VPN_INTERFACE:-wgvpn0}"
WG_DIR="/etc/wireguard"
WG_CONF="$WG_DIR/$WG_IF.conf"
PARAMS="$WG_DIR/$WG_IF.params"
CLIENT_DIR="$WG_DIR/$WG_IF-clients"
SYSCTL_FILE="/etc/sysctl.d/99-$WG_IF.conf"
INSTALL_PATH="/usr/local/bin/vpn"
PEER_MARK="### vpn-client:"

# ---------------------------------------------------------------- output helpers

if [[ -t 1 ]]; then
	C_RED=$'\e[31m' C_GREEN=$'\e[32m' C_YELLOW=$'\e[33m' C_BOLD=$'\e[1m' C_OFF=$'\e[0m'
else
	C_RED="" C_GREEN="" C_YELLOW="" C_BOLD="" C_OFF=""
fi

info() { printf '%s\n' "$*"; }
ok() { printf '%s✔ %s%s\n' "$C_GREEN" "$*" "$C_OFF"; }
warn() { printf '%s! %s%s\n' "$C_YELLOW" "$*" "$C_OFF" >&2; }
die() {
	printf '%s✘ %s%s\n' "$C_RED" "$*" "$C_OFF" >&2
	exit 1
}

# Where interactive answers come from. `curl ... | sudo bash` leaves stdin as the
# pipe, so fall back to the terminal; with no terminal at all, take the defaults.
can_prompt() {
	[[ "${VPN_AUTO:-0}" == 1 ]] && return 1
	[[ -t 0 ]] && return 0
	{ : </dev/tty; } 2>/dev/null
}

# ask <prompt> <default>: prints the answer (or the default on Enter / no terminal).
ask() {
	local prompt="$1" default="$2" reply=""
	[[ -n "$default" ]] && prompt+=" [$default]"
	if can_prompt; then
		if [[ -t 0 ]]; then
			read -r -p "$prompt: " reply || true
		else
			read -r -p "$prompt: " reply </dev/tty || true
		fi
	fi
	printf '%s' "${reply:-$default}"
}

confirm() {
	[[ "${VPN_YES:-0}" == 1 ]] && return 0
	local reply
	reply=$(ask "$1 (type yes)" "no")
	[[ "$reply" == "yes" ]]
}

# ---------------------------------------------------------------- checks

need_root() {
	[[ $EUID -eq 0 ]] || die "Run it with sudo:  sudo bash $0 ${*:-}"
}

check_os() {
	[[ -r /etc/os-release ]] || die "Unknown Linux. Use Ubuntu 20.04+ or Debian 11+."
	# shellcheck disable=SC1091
	. /etc/os-release
	local major="${VERSION_ID%%.*}"
	case "${ID:-}" in
	ubuntu) [[ "${major:-0}" -ge 20 ]] || die "Ubuntu $VERSION_ID is too old. Use Ubuntu 20.04 or newer." ;;
	debian) [[ "${major:-0}" -ge 11 ]] || die "Debian $VERSION_ID is too old. Use Debian 11 or newer." ;;
	*)
		[[ " ${ID_LIKE:-} " == *" debian "* || " ${ID_LIKE:-} " == *" ubuntu "* ]] ||
			die "${PRETTY_NAME:-This system} is not supported. Use Ubuntu 20.04+ or Debian 11+."
		warn "${PRETTY_NAME:-This system} is not tested, continuing anyway."
		;;
	esac
}

is_installed() { [[ -f "$PARAMS" && -f "$WG_CONF" ]]; }

valid_port() { [[ "$1" =~ ^[0-9]+$ ]] && ((10#$1 >= 1 && 10#$1 <= 65535)); }

valid_name() { [[ "$1" =~ ^[A-Za-z0-9_-]{1,15}$ ]]; }

port_in_use() { ss -Hlun "sport = :$1" 2>/dev/null | grep -q .; }

# ---------------------------------------------------------------- install

install_packages() {
	local -A want=([wg]=wireguard-tools [qrencode]=qrencode [iptables]=iptables [curl]=curl [ip]=iproute2 [ss]=iproute2)
	local cmd missing=()
	for cmd in "${!want[@]}"; do
		command -v "$cmd" >/dev/null 2>&1 || missing+=("${want[$cmd]}")
	done
	if ((${#missing[@]})); then
		info "Installing: $(printf '%s\n' "${missing[@]}" | sort -u | tr '\n' ' ')"
		export DEBIAN_FRONTEND=noninteractive
		apt-get update -qq
		# shellcheck disable=SC2046
		apt-get install -y -qq --no-install-recommends $(printf '%s\n' "${missing[@]}" | sort -u) >/dev/null
	fi

	# Container-style VPS (LXC/OpenVZ) often has no WireGuard kernel module;
	# wg-quick then falls back to the userspace wireguard-go.
	if ip link add vpnprobe0 type wireguard 2>/dev/null; then
		ip link del vpnprobe0
	elif ! command -v wireguard-go >/dev/null 2>&1; then
		warn "No WireGuard kernel module, installing the userspace version (slower)."
		apt-get install -y -qq wireguard-go >/dev/null 2>&1 ||
			die "This server can't run WireGuard (no kernel module, no wireguard-go). Pick a KVM server instead."
		[[ -c /dev/net/tun ]] || die "This server has no /dev/net/tun. Ask the host to enable TUN, or pick a KVM server."
	fi
}

detect_public_iface() {
	ip -4 route show default | awk '{for (i = 1; i < NF; i++) if ($i == "dev") { print $(i + 1); exit }}'
}

detect_public_ip() {
	local ip url
	for url in https://api.ipify.org https://ifconfig.me/ip https://icanhazip.com; do
		ip=$(curl -4 -fsS --max-time 5 "$url" 2>/dev/null | tr -d '[:space:]') || continue
		if [[ "$ip" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
			printf '%s' "$ip"
			return
		fi
	done
	ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") { print $(i + 1); exit }}'
}

has_public_ipv6() { [[ -n "$(ip -6 route show default 2>/dev/null)" ]]; }

# dns_for <choice> <ipv6 0|1>: prints "label|servers"
dns_for() {
	local v6="$2"
	case "$1" in
	1 | cloudflare) printf 'Cloudflare|1.1.1.1, 1.0.0.1%s' "$([[ $v6 == 1 ]] && echo ', 2606:4700:4700::1111, 2606:4700:4700::1001')" ;;
	2 | adguard) printf 'AdGuard (blocks ads and trackers)|94.140.14.14, 94.140.15.15%s' "$([[ $v6 == 1 ]] && echo ', 2a10:50c0::ad1:ff, 2a10:50c0::ad2:ff')" ;;
	3 | quad9) printf 'Quad9 (blocks malware sites)|9.9.9.9, 149.112.112.112%s' "$([[ $v6 == 1 ]] && echo ', 2620:fe::fe, 2620:fe::9')" ;;
	4 | google) printf 'Google|8.8.8.8, 8.8.4.4%s' "$([[ $v6 == 1 ]] && echo ', 2001:4860:4860::8888, 2001:4860:4860::8844')" ;;
	*) return 1 ;;
	esac
}

save_params() {
	{
		printf 'PUB_IFACE=%q\n' "$PUB_IFACE"
		printf 'ENDPOINT=%q\n' "$ENDPOINT"
		printf 'PORT=%q\n' "$PORT"
		printf 'DNS=%q\n' "$DNS"
		printf 'DNS_LABEL=%q\n' "$DNS_LABEL"
		printf 'IPV6=%q\n' "$IPV6"
		printf 'NET4=%q\n' "$NET4"
		printf 'NET6=%q\n' "$NET6"
		printf 'SERVER_PUB_KEY=%q\n' "$SERVER_PUB_KEY"
	} >"$PARAMS"
}

load_params() {
	# shellcheck disable=SC1090
	. "$PARAMS"
}

install_server() {
	check_os
	[[ -e "$WG_CONF" ]] && die "$WG_CONF already exists (another VPN?). Set VPN_INTERFACE=<other name> to install next to it."

	info "${C_BOLD}Personal VPN setup${C_OFF}  (press Enter to accept the value in [brackets])"
	info ""
	install_packages

	PUB_IFACE=$(detect_public_iface)
	[[ -n "$PUB_IFACE" ]] || die "Could not find this server's internet connection (no default route)."

	NET4="${VPN_NET4_PREFIX:-10.66.66}"
	NET6="${VPN_NET6_PREFIX:-fd66:66:66::}"
	[[ "$NET4" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]] || die "VPN_NET4_PREFIX must look like 10.66.66"
	if ip -4 route | grep -q "^$NET4\."; then
		die "The network $NET4.0/24 is already used on this server. Run again with VPN_NET4_PREFIX=10.77.77"
	fi

	IPV6=0
	has_public_ipv6 && IPV6=1

	local detected
	detected="${VPN_ENDPOINT:-$(detect_public_ip)}"
	ENDPOINT=$(ask "This server's public IP or domain" "$detected")
	[[ "$ENDPOINT" =~ ^[A-Za-z0-9.:-]+$ ]] || die "\"$ENDPOINT\" is not an IP address or domain."

	local default_port
	default_port="${VPN_PORT:-$(shuf -i 20000-60000 -n 1)}"
	while :; do
		PORT=$(ask "UDP port for the VPN" "$default_port")
		valid_port "$PORT" || { warn "A port is a number from 1 to 65535."; can_prompt && continue; die "Bad port: $PORT"; }
		PORT=$((10#$PORT))
		port_in_use "$PORT" || break
		warn "Port $PORT is already used on this server."
		can_prompt || die "Port $PORT is already used. Pick another with VPN_PORT=..."
	done

	info ""
	info "Which DNS should your devices use while connected?"
	info "  1) Cloudflare - fastest, most compatible"
	info "  2) AdGuard    - also blocks ads and trackers"
	info "  3) Quad9      - also blocks known malware sites"
	info "  4) Google"
	local choice picked
	while :; do
		choice=$(ask "Choose 1-4" "${VPN_DNS:-1}")
		picked=$(dns_for "$choice" "$IPV6") && break
		warn "Type 1, 2, 3 or 4."
		can_prompt || die "Unknown VPN_DNS: $choice (use cloudflare, adguard, quad9 or google)"
	done
	DNS_LABEL="${picked%%|*}"
	DNS="${picked#*|}"

	local first_client
	while :; do
		first_client=$(ask "Name of your first device (letters, digits, - or _)" "${VPN_FIRST_CLIENT:-phone}")
		valid_name "$first_client" && break
		warn "Use up to 15 English letters, digits, - or _ (for example: phone, laptop, mom-ipad)."
		can_prompt || die "Bad device name: $first_client"
	done

	info ""
	info "Setting up..."

	mkdir -p "$WG_DIR" "$CLIENT_DIR"
	chmod 700 "$WG_DIR" "$CLIENT_DIR"

	local server_priv
	server_priv=$(wg genkey)
	SERVER_PUB_KEY=$(printf '%s' "$server_priv" | wg pubkey)

	write_server_conf "$server_priv"
	save_params
	enable_forwarding
	start_service
	self_install

	ok "VPN server is running on $ENDPOINT, UDP port $PORT (DNS: $DNS_LABEL)."
	info ""
	add_client "$first_client"
	print_cloud_firewall_note
}

write_server_conf() {
	local priv="$1" addr="$NET4.1/24" ipt fw=()
	[[ "$IPV6" == 1 ]] && addr+=", ${NET6}1/64"

	# Only forward VPN -> internet (not device -> device), so a leaked config can't
	# reach your other devices. INPUT is opened explicitly because some cloud images
	# (Oracle Cloud Ubuntu, for one) ship an iptables policy that rejects everything but SSH.
	for ipt in iptables ip6tables; do
		local net="$NET4.0/24"
		if [[ "$ipt" == ip6tables ]]; then
			[[ "$IPV6" == 1 ]] || continue
			net="${NET6}/64"
		fi
		fw+=(
			"$ipt -I INPUT -p udp --dport $PORT -j ACCEPT"
			"$ipt -I FORWARD -i %i -o $PUB_IFACE -j ACCEPT"
			"$ipt -I FORWARD -i $PUB_IFACE -o %i -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT"
			"$ipt -t nat -A POSTROUTING -s $net -o $PUB_IFACE -j MASQUERADE"
			"$ipt -t mangle -A FORWARD -o %i -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu"
		)
	done

	{
		echo "# Personal VPN server. Manage devices with: sudo vpn"
		echo "[Interface]"
		echo "Address = $addr"
		echo "ListenPort = $PORT"
		echo "PrivateKey = $priv"
		local rule
		for rule in "${fw[@]}"; do echo "PostUp = $rule"; done
		for rule in "${fw[@]}"; do
			rule="${rule/ -I / -D }"
			echo "PostDown = ${rule/ -A / -D }"
		done
	} >"$WG_CONF"
	chmod 600 "$WG_CONF"
}

enable_forwarding() {
	{
		echo "net.ipv4.ip_forward = 1"
		if [[ "$IPV6" == 1 ]]; then
			echo "net.ipv6.conf.all.forwarding = 1"
			# Forwarding turns off router-advertisement learning; keep it so the
			# server doesn't lose its own IPv6 address on providers that use SLAAC.
			echo "net.ipv6.conf.$PUB_IFACE.accept_ra = 2"
		fi
	} >"$SYSCTL_FILE"
	chmod 644 "$SYSCTL_FILE"
	sysctl -q -p "$SYSCTL_FILE" >/dev/null
}

has_systemd() { [[ -d /run/systemd/system ]]; }

start_service() {
	if has_systemd; then
		systemctl enable --now "wg-quick@$WG_IF" >/dev/null 2>&1 ||
			die "WireGuard failed to start. See: journalctl -u wg-quick@$WG_IF"
	else
		warn "No systemd here: the VPN is started now but won't come back after a reboot by itself."
		wg-quick up "$WG_IF" >/dev/null 2>&1 || die "WireGuard failed to start: wg-quick up $WG_IF"
	fi
}

stop_service() {
	if has_systemd; then
		systemctl disable --now "wg-quick@$WG_IF" >/dev/null 2>&1 || true
	fi
	if ip link show "$WG_IF" >/dev/null 2>&1; then
		wg-quick down "$WG_IF" >/dev/null 2>&1 || true
	fi
}

# Push config changes into the running interface without dropping connected devices.
reload_peers() {
	ip link show "$WG_IF" >/dev/null 2>&1 || return 0
	wg syncconf "$WG_IF" <(wg-quick strip "$WG_IF")
}

self_install() {
	local src="${BASH_SOURCE[0]:-}"
	if [[ -f "$src" && "$(readlink -f "$src")" != "$INSTALL_PATH" ]]; then
		install -m 755 "$src" "$INSTALL_PATH"
	fi
}

print_cloud_firewall_note() {
	info ""
	info "${C_BOLD}If your phone doesn't connect:${C_OFF} your cloud provider may have its own firewall."
	info "Open UDP port $PORT there too (Oracle: Security List, AWS: Security Group,"
	info "Google Cloud: VPC firewall, Azure: Network security group). Hetzner and DigitalOcean"
	info "don't block anything unless you added a firewall yourself."
	info ""
	info "Manage devices any time with:  ${C_BOLD}sudo vpn${C_OFF}"
}

# ---------------------------------------------------------------- devices

client_names() {
	awk -v m="$PEER_MARK" 'index($0, m) == 1 { print substr($0, length(m) + 2) }' "$WG_CONF"
}

client_exists() { client_names | grep -qxF "$1"; }

next_free_octet() {
	local used n
	used=$(grep -oE "^AllowedIPs = ${NET4//./\\.}\.[0-9]+/32" "$WG_CONF" | sed -E 's|.*\.([0-9]+)/32|\1|' || true)
	for ((n = 2; n <= 254; n++)); do
		grep -qx "$n" <<<"$used" || {
			echo "$n"
			return
		}
	done
	return 1
}

add_client() {
	local name="${1:-}"
	if [[ -z "$name" ]]; then
		can_prompt || die "Give the device a name:  sudo vpn add <name>"
		name=$(ask "Name for the new device (letters, digits, - or _)" "")
	fi
	valid_name "$name" || die "\"$name\" isn't a valid name. Use up to 15 English letters, digits, - or _."
	client_exists "$name" && die "A device called \"$name\" already exists. Pick another name or remove it first."

	local octet
	octet=$(next_free_octet) || die "The VPN is full (253 devices). Remove one first."

	local priv pub psk addr allowed
	priv=$(wg genkey)
	pub=$(printf '%s' "$priv" | wg pubkey)
	psk=$(wg genpsk)
	addr="$NET4.$octet/32"
	allowed="$NET4.$octet/32"
	if [[ "$IPV6" == 1 ]]; then
		addr+=", ${NET6}$octet/128"
		allowed+=", ${NET6}$octet/128"
	fi

	{
		echo ""
		echo "$PEER_MARK $name"
		echo "[Peer]"
		echo "PublicKey = $pub"
		echo "PresharedKey = $psk"
		echo "AllowedIPs = $allowed"
	} >>"$WG_CONF"

	local endpoint="$ENDPOINT"
	[[ "$endpoint" == *:* ]] && endpoint="[$endpoint]"

	# AllowedIPs always includes ::/0: on an IPv4-only server that deliberately sends
	# the device's IPv6 traffic into the tunnel (where it goes nowhere) instead of
	# letting it leak out around the VPN.
	{
		echo "[Interface]"
		echo "PrivateKey = $priv"
		echo "Address = $addr"
		echo "DNS = $DNS"
		echo ""
		echo "[Peer]"
		echo "PublicKey = $SERVER_PUB_KEY"
		echo "PresharedKey = $psk"
		echo "Endpoint = $endpoint:$PORT"
		echo "AllowedIPs = 0.0.0.0/0, ::/0"
		echo "PersistentKeepalive = 25"
	} >"$CLIENT_DIR/$name.conf"
	chmod 600 "$CLIENT_DIR/$name.conf"

	reload_peers
	ok "Added \"$name\" (VPN address $NET4.$octet)."
	print_client "$name"
}

print_client() {
	local name="$1" file="$CLIENT_DIR/$1.conf"
	[[ -f "$file" ]] || die "No config file for \"$name\" at $file"
	info ""
	info "${C_BOLD}Phone / tablet:${C_OFF} open the WireGuard app, tap + , \"Scan from QR code\", and scan this:"
	info ""
	qrencode -t ansiutf8 -r "$file"
	info ""
	info "${C_BOLD}Computer:${C_OFF} in the WireGuard app choose \"Add empty tunnel\", delete what's there,"
	info "and paste everything between the lines:"
	info "---------------------------------------------------------------------"
	cat "$file"
	info "---------------------------------------------------------------------"
	info "(Saved at $file . Keep it private: whoever has it can use your VPN.)"
}

show_client() {
	local name="${1:-}"
	if [[ -z "$name" ]]; then
		pick_client name "Which device?" || return 0
	fi
	client_exists "$name" || die "No device called \"$name\". See: sudo vpn list"
	print_client "$name"
}

remove_client() {
	local name="${1:-}"
	if [[ -z "$name" ]]; then
		pick_client name "Remove which device?" || return 0
		confirm "Remove \"$name\"? It will stop working right away" || {
			info "Nothing removed."
			return 0
		}
	fi
	client_exists "$name" || die "No device called \"$name\". See: sudo vpn list"

	local tmp
	tmp=$(mktemp "$WG_DIR/.$WG_IF.XXXXXX")
	# Drop the marker line and the [Peer] block under it (up to the next blank line).
	awk -v line="$PEER_MARK $name" '
		$0 == line { skip = 1; next }
		skip && /^[[:space:]]*$/ { skip = 0 }
		!skip
	' "$WG_CONF" | cat -s >"$tmp"
	chmod 600 "$tmp"
	mv "$tmp" "$WG_CONF"
	rm -f "$CLIENT_DIR/$name.conf"

	reload_peers
	ok "Removed \"$name\". That device can no longer connect."
}

# pick_client <var> <prompt>: numbered list of devices, stores the chosen name in <var>.
pick_client() {
	local -n _out="$1"
	local names=() choice
	mapfile -t names < <(client_names)
	if ((${#names[@]} == 0)); then
		info "No devices yet. Add one with: sudo vpn add <name>"
		return 1
	fi
	can_prompt || die "Say which device, e.g.: sudo vpn show ${names[0]}"
	local i
	for i in "${!names[@]}"; do
		printf '  %d) %s\n' "$((i + 1))" "${names[$i]}"
	done
	choice=$(ask "$2" "1")
	if ! [[ "$choice" =~ ^[0-9]+$ ]] || ((choice < 1 || choice > ${#names[@]})); then
		die "No such number: $choice"
	fi
	_out="${names[$((choice - 1))]}"
}

ago() {
	local s="$1"
	if ((s < 60)); then
		echo "${s}s ago"
	elif ((s < 3600)); then
		echo "$((s / 60)) min ago"
	elif ((s < 86400)); then
		echo "$((s / 3600)) h ago"
	else
		echo "$((s / 86400)) days ago"
	fi
}

list_clients() {
	# Devices in the order they were added, from the server config.
	local names=() name="" line
	local -A key_of=() ip_of=()
	while IFS= read -r line; do
		if [[ "$line" == "$PEER_MARK "* ]]; then
			name="${line#"$PEER_MARK "}"
			names+=("$name")
		elif [[ -n "$name" && "$line" == "PublicKey = "* ]]; then
			key_of[$name]="${line#PublicKey = }"
		elif [[ -n "$name" && "$line" == "AllowedIPs = "* ]]; then
			line="${line#AllowedIPs = }"
			ip_of[$name]="${line%%/*}"
		fi
	done <"$WG_CONF"

	local state="stopped"
	ip link show "$WG_IF" >/dev/null 2>&1 && state="running"
	info "VPN $state on $ENDPOINT, UDP port $PORT, DNS: $DNS_LABEL"
	if [[ "$state" == stopped ]]; then
		if has_systemd; then
			info "Start it with:  sudo systemctl restart wg-quick@$WG_IF   (errors: journalctl -u wg-quick@$WG_IF)"
		else
			info "Start it with:  sudo wg-quick up $WG_IF"
		fi
	fi
	info ""

	if ((${#names[@]} == 0)); then
		info "No devices yet. Add one with: sudo vpn add <name>"
		return 0
	fi

	# Live stats per public key. Peer lines of `wg show dump` are:
	# pubkey psk endpoint allowed-ips handshake rx tx keepalive
	local -A hs_of=() rx_of=() tx_of=()
	local key hs rx tx
	if [[ "$state" == running ]]; then
		while IFS=$'\t' read -r key _ _ _ hs rx tx _; do
			hs_of[$key]="$hs" rx_of[$key]="$rx" tx_of[$key]="$tx"
		done < <(wg show "$WG_IF" dump | tail -n +2)
	fi

	local now seen down up fmt="%-16s %-14s %-14s %10s %10s\n"
	now=$(date +%s)
	# shellcheck disable=SC2059
	printf "$fmt" DEVICE "VPN ADDRESS" "LAST SEEN" DOWNLOADED UPLOADED
	for name in "${names[@]}"; do
		key="${key_of[$name]:-}"
		seen="-" down="-" up="-"
		if [[ -n "$key" && -n "${hs_of[$key]:-}" ]]; then
			seen="never"
			((hs_of[$key] > 0)) && seen=$(ago $((now - hs_of[$key])))
			# rx/tx are counted by the server: what it sent is what the device downloaded.
			down=$(numfmt --to=iec --suffix=B "${tx_of[$key]}")
			up=$(numfmt --to=iec --suffix=B "${rx_of[$key]}")
		fi
		# shellcheck disable=SC2059
		printf "$fmt" "$name" "${ip_of[$name]:--}" "$seen" "$down" "$up"
	done
}

uninstall() {
	if ! confirm "Delete the VPN, its keys and every device config?"; then
		info "Nothing changed."
		return 0
	fi
	stop_service
	rm -rf "$CLIENT_DIR"
	rm -f "$WG_CONF" "$PARAMS" "$SYSCTL_FILE"
	[[ -f "$INSTALL_PATH" ]] && grep -q "Personal VPN" "$INSTALL_PATH" && rm -f "$INSTALL_PATH"
	ok "VPN removed. (IP forwarding stays on until the next reboot; the packages stay installed.)"
}

menu() {
	while :; do
		info ""
		list_clients
		info ""
		info "${C_BOLD}What would you like to do?${C_OFF}"
		info "  1) Add a device"
		info "  2) Show a device's QR code / config again"
		info "  3) Remove a device"
		info "  4) Uninstall the VPN"
		info "  5) Exit"
		case "$(ask "Choose 1-5" "5")" in
		1) (add_client "") || true ;;
		2) (show_client "") || true ;;
		3) (remove_client "") || true ;;
		4)
			uninstall
			is_installed || return 0
			;;
		*) return 0 ;;
		esac
	done
}

usage() {
	cat <<'EOF'
Personal VPN: a WireGuard server on your own rented server.

  sudo bash vpn.sh          install (first run) or open the menu
  sudo vpn add <name>       add a device (QR code + config to paste)
  sudo vpn show <name>      show a device's QR code / config again
  sudo vpn remove <name>    revoke a device
  sudo vpn list             devices and when they were last seen
  sudo vpn uninstall        remove the VPN, its keys and configs
EOF
}

main() {
	local cmd="${1:-}"
	case "$cmd" in
	-h | --help | help)
		usage
		return 0
		;;
	esac
	need_root "$@"

	if ! is_installed; then
		case "$cmd" in
		"" | install) install_server ;;
		*) die "The VPN isn't installed yet. Run:  sudo bash $0" ;;
		esac
		return
	fi

	load_params
	case "$cmd" in
	"" | install) menu ;;
	add | new) add_client "${2:-}" ;;
	show | qr) show_client "${2:-}" ;;
	remove | rm | revoke) remove_client "${2:-}" ;;
	list | ls | status) list_clients ;;
	uninstall) uninstall ;;
	*)
		usage
		exit 1
		;;
	esac
}

main "$@"
