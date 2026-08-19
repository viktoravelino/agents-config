#!/usr/bin/env bash
#
# Installs claude-heartbeat: a systemd --user timer that keeps Claude Code's
# 5-hour usage blocks chained end-to-end. See README.md for the why.
#
# Symlinks (rather than copies) the script and units back into this repo, so
# editing them here takes effect immediately.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_TARGET="$HOME/.local/bin/claude-heartbeat"
UNIT_DIR="$HOME/.config/systemd/user"
TOKEN_CONF="$HOME/.config/environment.d/claude-code.conf"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/claude-heartbeat"
BACKUP_SUFFIX=".pre-agents-config-bak"
UNITS=(claude-heartbeat.service claude-heartbeat.timer)

DRY_RUN=0
UNINSTALL=0

for arg in "$@"; do
  case "$arg" in
    -n|--dry-run) DRY_RUN=1 ;;
    --uninstall)  UNINSTALL=1 ;;
    -h|--help)
      cat <<USAGE
Usage: ${BASH_SOURCE[0]##*/} [options]

Links this directory's heartbeat into place and starts the timer:
  claude-heartbeat          -> ~/.local/bin/claude-heartbeat
  claude-heartbeat.service  -> ~/.config/systemd/user/
  claude-heartbeat.timer    -> ~/.config/systemd/user/

Existing real files are backed up with $BACKUP_SUFFIX before linking.

  -n, --dry-run   show what would change, touch nothing
      --uninstall stop the timer and remove the links (state is kept)
  -h, --help      this
USAGE
      exit 0 ;;
    *) echo "unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "  would: $*"
  else
    "$@"
  fi
}

note() { printf '%s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die()  { printf 'error: %s\n' "$*" >&2; exit 1; }

# --- uninstall -------------------------------------------------------------

if [ "$UNINSTALL" -eq 1 ]; then
  note "uninstalling claude-heartbeat"
  if systemctl --user list-unit-files claude-heartbeat.timer >/dev/null 2>&1; then
    run systemctl --user disable --now claude-heartbeat.timer || true
  fi
  for unit in "${UNITS[@]}"; do
    if [ -L "$UNIT_DIR/$unit" ]; then run rm "$UNIT_DIR/$unit"; fi
  done
  if [ -L "$BIN_TARGET" ]; then run rm "$BIN_TARGET"; fi
  run systemctl --user daemon-reload
  note "done — state left in $STATE_DIR"
  exit 0
fi

# --- preflight -------------------------------------------------------------

note "checking prerequisites"

for dep in jq flock /usr/bin/find systemctl; do
  command -v "$dep" >/dev/null 2>&1 || die "missing dependency: $dep"
done

[ -x "$HOME/.local/bin/claude" ] || command -v claude >/dev/null 2>&1 \
  || die "claude CLI not found at ~/.local/bin/claude"

# Headless runs need the long-lived token, not the interactive OAuth grant --
# that grant can expire and silently stop refreshing while `claude auth status`
# still reports loggedIn: true. This is the single most likely thing to break.
if [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] && ! grep -q 'CLAUDE_CODE_OAUTH_TOKEN' "$TOKEN_CONF" 2>/dev/null; then
  die "no CLAUDE_CODE_OAUTH_TOKEN found.
       Run 'claude setup-token' first — headless runs cannot rely on the
       interactive OAuth grant. See README.md > Auth."
fi
note "  ok: long-lived token present"

# Created world-readable by setup-token.
if [ -f "$TOKEN_CONF" ] && [ "$(stat -c '%a' "$TOKEN_CONF")" != "600" ]; then
  note "tightening permissions on $TOKEN_CONF"
  run chmod 600 "$TOKEN_CONF"
fi

# --- link ------------------------------------------------------------------

link() {
  local src="$1" dst="$2"
  if [ -L "$dst" ] && [ "$(readlink -f "$dst")" = "$(readlink -f "$src")" ]; then
    note "  already linked: $dst"
    return
  fi
  if [ -e "$dst" ] && [ ! -L "$dst" ]; then
    note "  backing up existing $dst -> $dst$BACKUP_SUFFIX"
    run mv "$dst" "$dst$BACKUP_SUFFIX"
  elif [ -L "$dst" ]; then
    run rm "$dst"
  fi
  note "  linking $dst"
  run ln -s "$src" "$dst"
}

note "linking files"
run mkdir -p "$HOME/.local/bin" "$UNIT_DIR" "$STATE_DIR/cwd"
link "$SCRIPT_DIR/claude-heartbeat" "$BIN_TARGET"
for unit in "${UNITS[@]}"; do
  link "$SCRIPT_DIR/$unit" "$UNIT_DIR/$unit"
done

# --- enable ----------------------------------------------------------------

# Without lingering the timer only runs while you have an active login session.
if [ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" != "yes" ]; then
  note "enabling linger so the timer runs without an active login session"
  run loginctl enable-linger "$USER" || warn "could not enable linger (may need sudo)"
fi

note "enabling timer"
run systemctl --user daemon-reload
run systemctl --user enable --now claude-heartbeat.timer

if [ "$DRY_RUN" -eq 1 ]; then
  note "dry run — nothing changed"
  exit 0
fi

note ""
note "installed. verifying with a dry run of the heartbeat itself:"
"$BIN_TARGET" || warn "heartbeat reported a problem — check 'journalctl --user -u claude-heartbeat'"
note ""
systemctl --user list-timers claude-heartbeat.timer --no-pager
