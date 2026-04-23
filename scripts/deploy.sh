#!/bin/bash
# ─────────────────────────────────────────
# SpiceStrong Deploy Script (Hands-Free)
# Usage:
#   bash scripts/deploy.sh ios          # Build & submit iOS
#   bash scripts/deploy.sh android      # Build & submit Android
#   bash scripts/deploy.sh both         # Build & submit both
#   bash scripts/deploy.sh ios --no-submit  # Build only
# ─────────────────────────────────────────

set -e

PLATFORM=${1:-ios}
NO_SUBMIT=${2:-}
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "╔══════════════════════════════════════════╗"
echo "║  SpiceStrong Deploy                      ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Step 1: Switch to production env
echo "→ Switching to production environment..."
cp "$PROJECT_DIR/.env.production" "$PROJECT_DIR/.env"
echo "  ✓ .env.production → .env"

SUPABASE_URL=$(grep EXPO_PUBLIC_SUPABASE_URL "$PROJECT_DIR/.env" | cut -d= -f2)
echo "  ✓ Supabase: ${SUPABASE_URL:0:40}..."

# Step 2: Show current version
CURRENT_VERSION=$(grep '"version"' "$PROJECT_DIR/app.json" | sed 's/.*: "\(.*\)".*/\1/')
echo ""
echo "→ Version: $CURRENT_VERSION (build number auto-increments)"

# Step 3: Set non-interactive mode
export EXPO_NO_PROMPT=1
export EAS_NO_VCS=1
export CI=1

# Step 4: Build & submit
echo ""
if [ "$NO_SUBMIT" = "--no-submit" ]; then
  SUBMIT_FLAG=""
else
  SUBMIT_FLAG="--auto-submit"
fi

build_platform() {
  local plat=$1
  echo "── Building $plat ──"
  eas build \
    --platform "$plat" \
    --profile production \
    --non-interactive \
    $SUBMIT_FLAG
  echo "  ✓ $plat done"
  echo ""
}

if [ "$PLATFORM" = "both" ]; then
  build_platform ios
  build_platform android
elif [ "$PLATFORM" = "ios" ] || [ "$PLATFORM" = "android" ]; then
  build_platform "$PLATFORM"
else
  echo "ERROR: Unknown platform '$PLATFORM'. Use: ios, android, or both"
  exit 1
fi

echo "╔══════════════════════════════════════════╗"
echo "║  Deploy complete!                        ║"
echo "╚══════════════════════════════════════════╝"
