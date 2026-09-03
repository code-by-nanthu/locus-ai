#!/usr/bin/env bash
# Locus Zero-Dependency Universal Installer (PRD §3.1 / DIST-4)
set -e

INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
BINARY_NAME="locus"
REPO="code-by-nanthu/locus-ai"

echo "=== Locus AI Zero-Dependency Installer ==="

# Handle uninstall flag
if [ "$1" = "--uninstall" ]; then
  echo "Uninstalling Locus..."
  if [ -w "$INSTALL_DIR" ]; then
    rm -f "$INSTALL_DIR/$BINARY_NAME"
  else
    sudo rm -f "$INSTALL_DIR/$BINARY_NAME"
  fi
  echo "Locus successfully uninstalled."
  exit 0
fi

# Detect platform and architecture
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$OS" in
  darwin) TARGET_OS="darwin" ;;
  linux) TARGET_OS="linux" ;;
  *) echo "Unsupported operating system: $OS"; exit 1 ;;
esac

case "$ARCH" in
  x86_64) TARGET_ARCH="x64" ;;
  arm64|aarch64) TARGET_ARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

echo "Detected platform: $TARGET_OS ($TARGET_ARCH)"

# If building or installing from local repository
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_BIN="$SCRIPT_DIR/../bin/locus"

if [ -f "$LOCAL_BIN" ]; then
  echo "Found local compiled native binary: $LOCAL_BIN"
  SRC_BIN="$LOCAL_BIN"
else
  # Download precompiled standalone native binary from GitHub Releases
  DOWNLOAD_URL="https://github.com/$REPO/releases/latest/download/locus-$TARGET_OS-$TARGET_ARCH"
  TMP_FILE="$(mktemp /tmp/locus-bin.XXXXXX)"
  echo "Downloading standalone native binary from $DOWNLOAD_URL..."
  if curl -fsSL "$DOWNLOAD_URL" -o "$TMP_FILE"; then
    SRC_BIN="$TMP_FILE"
  else
    echo "Precompiled release binary not found online; building locally with bun..."
    if ! command -v bun >/dev/null 2>&1; then
      echo "Installing bun compiler..."
      curl -fsSL https://bun.sh/install | bash
      export PATH="$HOME/.bun/bin:$PATH"
    fi
    mkdir -p "$SCRIPT_DIR/../bin"
    bun build --compile "$SCRIPT_DIR/../src/index.tsx" --outfile "$LOCAL_BIN" --external playwright --external chromium-bidi
    SRC_BIN="$LOCAL_BIN"
  fi
fi

echo "Installing Locus standalone executable to $INSTALL_DIR/$BINARY_NAME..."
if [ -w "$INSTALL_DIR" ]; then
  cp "$SRC_BIN" "$INSTALL_DIR/$BINARY_NAME"
  chmod +x "$INSTALL_DIR/$BINARY_NAME"
else
  sudo cp "$SRC_BIN" "$INSTALL_DIR/$BINARY_NAME"
  sudo chmod +x "$INSTALL_DIR/$BINARY_NAME"
fi

if [ -n "$TMP_FILE" ] && [ -f "$TMP_FILE" ]; then
  rm -f "$TMP_FILE"
fi

echo ""
echo "✨ Locus installed successfully to $INSTALL_DIR/$BINARY_NAME!"
echo "Run 'locus --help' to get started."
