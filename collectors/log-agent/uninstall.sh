#!/usr/bin/env bash
# ============================================================================
# AI Labs Audit — Log Agent Uninstaller
#
# Usage:
#   curl -sL https://raw.githubusercontent.com/sarsator/plugin_ailabsaudit_tracke/main/collectors/log-agent/uninstall.sh | sudo bash
# ============================================================================

set -euo pipefail

SERVICE_NAME="ailabsaudit-agent"
INSTALL_DIR="/opt/ailabsaudit"
CONFIG_DIR="/etc/ailabsaudit"
LOG_DIR="/var/log/ailabsaudit"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }

echo ""
echo "======================================"
echo "  AI Labs Audit — Log Agent Uninstaller"
echo "======================================"
echo ""

[[ "$(id -u)" -eq 0 ]] || { echo -e "${RED}[ERROR]${NC} This script must be run as root (use sudo)." >&2; exit 1; }

# Stop and disable service.
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    info "Stopping agent..."
    systemctl stop "$SERVICE_NAME"
    ok "Agent stopped"
fi

if systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
    info "Disabling service..."
    systemctl disable "$SERVICE_NAME"
    ok "Service disabled"
fi

# Remove service file.
if [[ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]]; then
    info "Removing service file..."
    rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
    systemctl daemon-reload
    ok "Service file removed"
fi

# Remove install directory.
if [[ -d "$INSTALL_DIR" ]]; then
    info "Removing ${INSTALL_DIR}..."
    rm -rf "$INSTALL_DIR"
    ok "Install directory removed"
fi

# Remove config.
if [[ -d "$CONFIG_DIR" ]]; then
    info "Removing ${CONFIG_DIR}..."
    rm -rf "$CONFIG_DIR"
    ok "Config removed"
fi

# Remove log directory.
if [[ -d "$LOG_DIR" ]]; then
    info "Removing ${LOG_DIR}..."
    rm -rf "$LOG_DIR"
    ok "Log directory removed"
fi

# Remove user.
if id ailabsaudit &>/dev/null; then
    info "Removing system user 'ailabsaudit'..."
    userdel ailabsaudit 2>/dev/null || true
    ok "User removed"
fi

echo ""
echo "======================================"
echo -e "  ${GREEN}Uninstall complete!${NC}"
echo "======================================"
echo ""
