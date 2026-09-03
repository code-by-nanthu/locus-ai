#!/usr/bin/env bash
# Locus Universal Installer (D-3)
set -e

INSTALL_DIR="/usr/local/bin"
BINARY_NAME="locus"

echo "=== Locus AI Installer ==="

# Check architecture
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$ARCH" in
  x86_64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

echo "Detected platform: $OS ($ARCH)"

# Handle uninstall flag
if [ "$1" = "--uninstall" ]; then
  echo "Uninstalling Locus..."
  rm -f "$INSTALL_DIR/$BINARY_NAME"
  echo "Locus successfully uninstalled."
  exit 0
fi

# Check Node.js prerequisite
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js (v20+) is required to run Locus. Please install Node.js first."
  exit 1
fi

echo "Linking Locus global command to $INSTALL_DIR/$BINARY_NAME..."
mkdir -p "$INSTALL_DIR"

cat << 'EOF' > "$INSTALL_DIR/$BINARY_NAME"
#!/usr/bin/env bash
LOCUS_CLI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/locus"
if [ -f "$LOCUS_CLI_DIR/dist/index.js" ]; then
  exec node "$LOCUS_CLI_DIR/dist/index.js" "$@"
else
  exec node "$(pwd)/dist/index.js" "$@"
fi
EOF

chmod +x "$INSTALL_DIR/$BINARY_NAME"
echo "Locus installed successfully! Run 'locus --help' to get started."
