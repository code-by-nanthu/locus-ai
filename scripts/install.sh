#!/usr/bin/env bash
# Locus Zero-Dependency Universal Installer (PRD §3.1 / DIST-4)
set -e

# Default install directory: /usr/local/bin if writable, otherwise ~/.local/bin (avoids sudo prompt in pipes)
if [ -n "$INSTALL_DIR" ]; then
  DEST_DIR="$INSTALL_DIR"
elif [ -w "/usr/local/bin" ]; then
  DEST_DIR="/usr/local/bin"
elif [ -t 0 ] && command -v sudo >/dev/null 2>&1; then
  DEST_DIR="/usr/local/bin"
else
  DEST_DIR="$HOME/.local/bin"
fi

BINARY_NAME="locus"
REPO="code-by-nanthu/locus-ai"

echo "=== Locus AI Zero-Dependency Installer ==="

# Handle uninstall flag
if [ "$1" = "--uninstall" ]; then
  echo "Uninstalling Locus..."
  if [ -f "$DEST_DIR/$BINARY_NAME" ]; then
    if [ -w "$DEST_DIR" ]; then
      rm -f "$DEST_DIR/$BINARY_NAME"
    else
      sudo rm -f "$DEST_DIR/$BINARY_NAME"
    fi
  elif [ -f "$HOME/.local/bin/$BINARY_NAME" ]; then
    rm -f "$HOME/.local/bin/$BINARY_NAME"
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

TMP_DIR="$(mktemp -d /tmp/locus-install.XXXXXX)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

# 1. Check if local compiled binary already exists relative to script file
SRC_BIN=""
if [ -n "${BASH_SOURCE[0]}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SCRIPT_PARENT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)"
  if [ -f "$SCRIPT_PARENT/bin/locus" ]; then
    SRC_BIN="$SCRIPT_PARENT/bin/locus"
  fi
fi

# 2. If not found locally, try downloading precompiled release binary
if [ -z "$SRC_BIN" ]; then
  DOWNLOAD_URL="https://github.com/$REPO/releases/latest/download/locus-$TARGET_OS-$TARGET_ARCH"
  TMP_BIN="$TMP_DIR/locus-downloaded"
  echo "Checking for precompiled release binary from $DOWNLOAD_URL..."

  if curl -fsSL "$DOWNLOAD_URL" -o "$TMP_BIN" 2>/dev/null; then
    chmod +x "$TMP_BIN"
    SRC_BIN="$TMP_BIN"
  fi
fi

# 3. If precompiled release binary is not found on GitHub, build from source
if [ -z "$SRC_BIN" ]; then
  echo "Precompiled release binary not yet published online; compiling from repository..."

  # Ensure Bun is available
  export PATH="$HOME/.bun/bin:$PATH"
  if ! command -v bun >/dev/null 2>&1; then
    echo "Installing Bun compiler for native compilation..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
  fi

  # Determine source tree location
  BUILD_DIR="$TMP_DIR/source"
  if [ -f "./src/index.tsx" ]; then
    echo "Using current directory source files..."
    BUILD_DIR="$(pwd)"
  elif [ -n "$SCRIPT_PARENT" ] && [ -f "$SCRIPT_PARENT/src/index.tsx" ]; then
    echo "Using local repository files from $SCRIPT_PARENT..."
    BUILD_DIR="$SCRIPT_PARENT"
  else
    echo "Cloning latest source from GitHub..."
    git clone --depth 1 "https://github.com/$REPO.git" "$BUILD_DIR"
  fi

  COMPILED_BIN="$TMP_DIR/locus-compiled"
  echo "Compiling self-contained native executable..."
  (
    cd "$BUILD_DIR"
    if [ ! -d "node_modules" ]; then
      echo "Resolving dependencies with Bun..."
      bun install
    fi
    if [ ! -d "dist/web" ]; then
      echo "Building web assets..."
      bun run build:web 2>/dev/null || true
    fi
    bun build --compile src/index.tsx --outfile "$COMPILED_BIN" --external playwright --external chromium-bidi
  )
  chmod +x "$COMPILED_BIN"
  SRC_BIN="$COMPILED_BIN"
fi

# 4. Install binary to target destination
echo "Installing Locus executable to $DEST_DIR/$BINARY_NAME..."
if [ ! -d "$DEST_DIR" ]; then
  mkdir -p "$DEST_DIR" 2>/dev/null || sudo mkdir -p "$DEST_DIR"
fi

if [ -w "$DEST_DIR" ]; then
  rm -f "$DEST_DIR/$BINARY_NAME"
  cp "$SRC_BIN" "$DEST_DIR/$BINARY_NAME"
  chmod +x "$DEST_DIR/$BINARY_NAME"
else
  sudo rm -f "$DEST_DIR/$BINARY_NAME"
  sudo cp "$SRC_BIN" "$DEST_DIR/$BINARY_NAME"
  sudo chmod +x "$DEST_DIR/$BINARY_NAME"
fi

echo ""
echo "✨ Locus installed successfully to $DEST_DIR/$BINARY_NAME!"
if [[ ":$PATH:" != *":$DEST_DIR:"* ]]; then
  echo ""
  echo "⚠️  Note: $DEST_DIR is not in your current PATH."
  echo "   Add it with: echo 'export PATH=\"$DEST_DIR:\$PATH\"' >> ~/.zshrc"
fi
echo "Run 'locus --help' to get started."
