#!/bin/sh
# Compiles src-tauri/icons/AppIcon.icon (Icon Composer package) into src-tauri/icons/Assets.car
# so the Tauri bundler can copy it without running actool at build time.
# Needs Xcode 26+ once: sudo xcode-select -s /Applications/Xcode.app && sudo xcodebuild -runFirstLaunch
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src-tauri/icons/AppIcon.icon"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
killall ibtoold 2>/dev/null || true   # a stale asset-compiler daemon crashes on Icon Composer packages
xcrun actool "$SRC" --compile "$OUT" --output-format human-readable-text --notices --warnings \
  --output-partial-info-plist "$OUT/assetcatalog_generated_info.plist" \
  --app-icon Icon --include-all-app-icons --enable-on-demand-resources NO \
  --development-region en --target-device mac --minimum-deployment-target 26.0 --platform macosx
cp "$OUT/Assets.car" "$ROOT/src-tauri/icons/Assets.car"
echo "wrote $ROOT/src-tauri/icons/Assets.car"
