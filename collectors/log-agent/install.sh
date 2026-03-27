#!/usr/bin/env bash
# ============================================================================
# AI Labs Audit — Log Agent Installer
#
# One-command install:
#
#   curl -sL https://raw.githubusercontent.com/sarsator/plugin_ailabsaudit_tracke/main/collectors/log-agent/install.sh | sudo bash -s -- \
#     --api-key "trk_live_xxx" \
#     --secret "xxx" \
#     --client-id "xxx" \
#     --api-url "https://ailabsaudit.com/api/v1"
#
# What this script does:
#   1. Detects your web server (Nginx, Apache, LiteSpeed, Caddy)
#   2. Detects your access log path
#   3. Installs the agent to /opt/ailabsaudit/
#   4. Creates config at /etc/ailabsaudit/agent.conf
#   5. Creates a systemd service that starts on boot
#   6. Starts the agent
#
# Requirements: Linux, Python 3.6+, systemd
# ============================================================================

set -euo pipefail

REPO_URL="https://raw.githubusercontent.com/sarsator/plugin_ailabsaudit_tracke/main/collectors/log-agent"
INSTALL_DIR="/opt/ailabsaudit"
CONFIG_DIR="/etc/ailabsaudit"
LOG_DIR="/var/log/ailabsaudit"
SERVICE_NAME="ailabsaudit-agent"

# Colors.
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# -----------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------

info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
die()   { error "$1"; exit 1; }

# -----------------------------------------------------------------
# Parse arguments
# -----------------------------------------------------------------

API_KEY=""
API_SECRET=""
CLIENT_ID=""
API_URL=""
LOG_PATH=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --api-key)    API_KEY="$2";    shift 2 ;;
        --secret)     API_SECRET="$2"; shift 2 ;;
        --client-id)  CLIENT_ID="$2";  shift 2 ;;
        --api-url)    API_URL="$2";    shift 2 ;;
        --log-path)   LOG_PATH="$2";   shift 2 ;;
        --help|-h)
            echo "Usage: install.sh --api-key KEY --secret SECRET --client-id ID --api-url URL [--log-path PATH]"
            echo ""
            echo "Get your credentials at: https://ailabsaudit.com → Dashboard → API & Integrations"
            exit 0
            ;;
        *) die "Unknown option: $1. Use --help for usage." ;;
    esac
done

# -----------------------------------------------------------------
# Validate
# -----------------------------------------------------------------

echo ""
echo "======================================"
echo "  AI Labs Audit — Log Agent Installer"
echo "======================================"
echo ""

[[ "$(id -u)" -eq 0 ]] || die "This script must be run as root (use sudo)."
[[ -n "$API_KEY" ]]     || die "Missing --api-key. Get it at https://ailabsaudit.com"
[[ -n "$API_SECRET" ]]  || die "Missing --secret. Get it at https://ailabsaudit.com"
[[ -n "$CLIENT_ID" ]]   || die "Missing --client-id. Get it at https://ailabsaudit.com"
[[ -n "$API_URL" ]]     || die "Missing --api-url. Usually: https://ailabsaudit.com/api/v1"

# Check Python 3.
PYTHON=""
for cmd in python3 python; do
    if command -v "$cmd" &>/dev/null; then
        ver=$("$cmd" -c "import sys; print(sys.version_info.major)" 2>/dev/null)
        if [[ "$ver" == "3" ]]; then
            PYTHON="$cmd"
            break
        fi
    fi
done
[[ -n "$PYTHON" ]] || die "Python 3.6+ is required but not found. Install it: apt install python3 / yum install python3"
ok "Python 3 found: $($PYTHON --version)"

# Check systemd.
command -v systemctl &>/dev/null || die "systemd is required but not found."
ok "systemd found"

# -----------------------------------------------------------------
# Detect web server and log path
# -----------------------------------------------------------------

info "Detecting web server..."

WEB_SERVER="unknown"
for name in nginx apache2 httpd lsws litespeed caddy; do
    if pgrep -x "$name" &>/dev/null; then
        WEB_SERVER="$name"
        break
    fi
done

if [[ "$WEB_SERVER" != "unknown" ]]; then
    ok "Detected web server: $WEB_SERVER"
else
    warn "Could not detect a running web server. The agent will still work if you specify --log-path."
fi

if [[ -z "$LOG_PATH" ]]; then
    info "Detecting access log path..."
    CANDIDATE_PATHS=(
        "/var/log/nginx/access.log"
        "/var/log/nginx/access_log"
        "/usr/local/nginx/logs/access.log"
        "/var/log/apache2/access.log"
        "/var/log/apache2/access_log"
        "/var/log/httpd/access_log"
        "/var/log/httpd/access.log"
        "/usr/local/lsws/logs/access.log"
        "/var/log/litespeed/access.log"
        "/var/log/caddy/access.log"
    )

    for p in "${CANDIDATE_PATHS[@]}"; do
        if [[ -f "$p" ]]; then
            LOG_PATH="$p"
            break
        fi
    done

    if [[ -n "$LOG_PATH" ]]; then
        ok "Detected log path: $LOG_PATH"
    else
        die "Could not auto-detect access log. Please re-run with --log-path /path/to/access.log"
    fi
else
    [[ -f "$LOG_PATH" ]] || die "Log file not found: $LOG_PATH"
    ok "Using log path: $LOG_PATH"
fi

# -----------------------------------------------------------------
# Create user
# -----------------------------------------------------------------

if ! id ailabsaudit &>/dev/null; then
    info "Creating system user 'ailabsaudit'..."
    useradd --system --no-create-home --shell /usr/sbin/nologin ailabsaudit
    ok "User created"
fi

# Add to adm group for log access.
if getent group adm &>/dev/null; then
    usermod -aG adm ailabsaudit 2>/dev/null || true
fi

# -----------------------------------------------------------------
# Install agent
# -----------------------------------------------------------------

info "Installing agent to ${INSTALL_DIR}..."

mkdir -p "$INSTALL_DIR"
mkdir -p "$CONFIG_DIR"
mkdir -p "$LOG_DIR"

# Download agent from GitHub.
if command -v curl &>/dev/null; then
    curl -sL "${REPO_URL}/ailabsaudit-agent.py" -o "${INSTALL_DIR}/ailabsaudit-agent.py"
elif command -v wget &>/dev/null; then
    wget -qO "${INSTALL_DIR}/ailabsaudit-agent.py" "${REPO_URL}/ailabsaudit-agent.py"
else
    die "curl or wget is required."
fi

chmod 755 "${INSTALL_DIR}/ailabsaudit-agent.py"
ok "Agent installed"

# -----------------------------------------------------------------
# Write config (credentials stay local, never on GitHub)
# -----------------------------------------------------------------

info "Writing config to ${CONFIG_DIR}/agent.conf..."

cat > "${CONFIG_DIR}/agent.conf" << CONF
{
    "api_key": "${API_KEY}",
    "api_secret": "${API_SECRET}",
    "client_id": "${CLIENT_ID}",
    "api_url": "${API_URL}",
    "log_path": "${LOG_PATH}"
}
CONF

# Secure config — only root and ailabsaudit can read it.
chmod 640 "${CONFIG_DIR}/agent.conf"
chown root:ailabsaudit "${CONFIG_DIR}/agent.conf"
ok "Config written (credentials secured: mode 640)"

# -----------------------------------------------------------------
# Set permissions
# -----------------------------------------------------------------

chown -R ailabsaudit:ailabsaudit "$INSTALL_DIR"
chown -R ailabsaudit:ailabsaudit "$LOG_DIR"

# -----------------------------------------------------------------
# Install systemd service
# -----------------------------------------------------------------

info "Installing systemd service..."

# Download service file from GitHub.
if command -v curl &>/dev/null; then
    curl -sL "${REPO_URL}/ailabsaudit-agent.service" -o "/etc/systemd/system/${SERVICE_NAME}.service"
elif command -v wget &>/dev/null; then
    wget -qO "/etc/systemd/system/${SERVICE_NAME}.service" "${REPO_URL}/ailabsaudit-agent.service"
fi

# Update python path in service file.
sed -i "s|/usr/bin/python3|$(which "$PYTHON")|g" "/etc/systemd/system/${SERVICE_NAME}.service"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
ok "Service installed and enabled on boot"

# -----------------------------------------------------------------
# Start
# -----------------------------------------------------------------

info "Starting agent..."
systemctl start "$SERVICE_NAME"

sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
    ok "Agent is running!"
else
    warn "Agent may not have started. Check: journalctl -u $SERVICE_NAME -f"
fi

# -----------------------------------------------------------------
# Done
# -----------------------------------------------------------------

echo ""
echo "======================================"
echo -e "  ${GREEN}Installation complete!${NC}"
echo "======================================"
echo ""
echo "  Agent:   ${INSTALL_DIR}/ailabsaudit-agent.py"
echo "  Config:  ${CONFIG_DIR}/agent.conf"
echo "  Service: ${SERVICE_NAME}"
echo "  Logs:    journalctl -u ${SERVICE_NAME} -f"
echo "  Tailing: ${LOG_PATH}"
echo ""
echo "  Useful commands:"
echo "    sudo systemctl status ${SERVICE_NAME}    # Check status"
echo "    sudo journalctl -u ${SERVICE_NAME} -f    # View logs"
echo "    sudo systemctl restart ${SERVICE_NAME}   # Restart"
echo "    sudo systemctl stop ${SERVICE_NAME}      # Stop"
echo ""
echo "  To uninstall:"
echo "    curl -sL ${REPO_URL}/uninstall.sh | sudo bash"
echo ""
echo "  Dashboard: https://ailabsaudit.com"
echo ""
