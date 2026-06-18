#!/usr/bin/env bash
#
# Bob-a-gotchi installer — installs the extension into your editor.
# No Marketplace needed.
#
# One-liner:
#   curl -fsSL https://raw.githubusercontent.com/comacoded/bob-a-gotchi/main/install.sh | bash
#
# Or, if you have the .vsix locally, drop this script next to it and run ./install.sh
set -euo pipefail

RELEASE_VSIX="https://github.com/comacoded/bob-a-gotchi/releases/latest/download/ibm-bob-tamagotchi.vsix"

# Find a local .vsix next to this script (when run as a file), else download the release.
SELF="${BASH_SOURCE[0]:-}"
VSIX=""
TMP=""
if [ -n "$SELF" ] && [ -f "$SELF" ]; then
  HERE="$(cd "$(dirname "$SELF")" && pwd)"
  VSIX="$(ls -1 "$HERE"/ibm-bob-tamagotchi-*.vsix 2>/dev/null | sort -V | tail -1 || true)"
fi

if [ -z "$VSIX" ]; then
  echo "Downloading the latest Bob-a-gotchi build…"
  TMP="$(mktemp -d)"
  VSIX="$TMP/ibm-bob-tamagotchi.vsix"
  if ! curl -fsSL "$RELEASE_VSIX" -o "$VSIX"; then
    echo "✗ Couldn't download the release. Check your connection or grab the .vsix from:"
    echo "  https://github.com/comacoded/bob-a-gotchi/releases/latest"
    exit 1
  fi
fi

echo "Installing $(basename "$VSIX")…"
installed=0

try_cli() {
  local label="$1" bin="$2"
  if [ -n "$bin" ] && command -v "$bin" >/dev/null 2>&1; then
    if "$bin" --install-extension "$VSIX" --force >/dev/null 2>&1; then
      echo "  ✓ $label"
      installed=$((installed + 1))
    fi
  fi
}

# IBM Bob ships its CLI inside the app bundle (not always on PATH).
BOBIDE_APP="/Applications/IBM Bob.app/Contents/Resources/app/bin/bobide"
if [ -x "$BOBIDE_APP" ]; then
  if "$BOBIDE_APP" --install-extension "$VSIX" --force >/dev/null 2>&1; then
    echo "  ✓ IBM Bob"
    installed=$((installed + 1))
  fi
fi

try_cli "VS Code"  code
try_cli "Cursor"   cursor
try_cli "VSCodium" codium
[ -x "$BOBIDE_APP" ] || try_cli "IBM Bob (bobide)" bobide

[ -n "$TMP" ] && rm -rf "$TMP"

if [ "$installed" -eq 0 ]; then
  echo "✗ No supported editor CLI found (IBM Bob / VS Code / Cursor / VSCodium)."
  echo "  In VS Code: Command Palette → 'Shell Command: Install code command in PATH', then re-run."
  exit 1
fi

echo "Done! Reload your editor window and click the hard-hat icon to meet Bob."
