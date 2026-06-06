#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="${APP_NAME:-82-0 Coach}"
BUNDLE_IDENTIFIER="${BUNDLE_IDENTIFIER:-com.ccheever.eightytwozero.coach}"
APP_BUNDLE_IDENTIFIER="${APP_BUNDLE_IDENTIFIER:-$BUNDLE_IDENTIFIER}"
EXTENSION_BUNDLE_IDENTIFIER="${EXTENSION_BUNDLE_IDENTIFIER:-$BUNDLE_IDENTIFIER.Extension}"
STAGE_DIR="${STAGE_DIR:-$ROOT/dist/safari-web-extension}"
ZIP_PATH="${ZIP_PATH:-$ROOT/dist/82-0-coach-safari-web-extension.zip}"
PROJECT_LOCATION="${PROJECT_LOCATION:-$ROOT/platforms}"
FORCE="${FORCE:-0}"

command -v xcrun >/dev/null || {
  echo "xcrun is required. Install Xcode, then rerun this script." >&2
  exit 1
}

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/src"

cp "$ROOT/manifest.json" "$STAGE_DIR/manifest.json"
cp "$ROOT/src/content.js" "$STAGE_DIR/src/content.js"
cp "$ROOT/src/overlay.css" "$STAGE_DIR/src/overlay.css"
cp -R "$ROOT/src/lib" "$STAGE_DIR/src/lib"
cp -R "$ROOT/src/data" "$STAGE_DIR/src/data"

if [ -d "$ROOT/icons" ] && find "$ROOT/icons" -type f -print -quit | grep -q .; then
  cp -R "$ROOT/icons" "$STAGE_DIR/icons"
fi

mkdir -p "$(dirname "$ZIP_PATH")"
rm -f "$ZIP_PATH"
(
  cd "$STAGE_DIR"
  zip_items=(manifest.json src)
  if [ -d icons ]; then
    zip_items+=(icons)
  fi
  zip -qr "$ZIP_PATH" "${zip_items[@]}"
)

mkdir -p "$PROJECT_LOCATION"
packager_args=(
  safari-web-extension-packager
  "$STAGE_DIR"
  --project-location "$PROJECT_LOCATION"
  --app-name "$APP_NAME"
  --bundle-identifier "$BUNDLE_IDENTIFIER"
  --ios-only
  --swift
  --copy-resources
  --no-open
  --no-prompt
)

if [ "$FORCE" = "1" ]; then
  packager_args+=(--force)
fi

xcrun "${packager_args[@]}"

PROJECT_DIR="$PROJECT_LOCATION/$APP_NAME"
PBXPROJ="$PROJECT_DIR/$APP_NAME.xcodeproj/project.pbxproj"
if [ -f "$PBXPROJ" ]; then
  # @ref LLP 0006#xcode-project-post-processing — repair bundle IDs derived from the numeric app name.
  APP_BUNDLE_IDENTIFIER="$APP_BUNDLE_IDENTIFIER" \
  EXTENSION_BUNDLE_IDENTIFIER="$EXTENSION_BUNDLE_IDENTIFIER" \
    perl -0pi -e '
      my $app = $ENV{"APP_BUNDLE_IDENTIFIER"};
      my $ext = $ENV{"EXTENSION_BUNDLE_IDENTIFIER"};
      s/PRODUCT_BUNDLE_IDENTIFIER = (?!\"?\Q$ext\E\"?;)(?:\"[^\"]+\"|[^;]+);/PRODUCT_BUNDLE_IDENTIFIER = $app;/g;
    ' "$PBXPROJ"
fi

echo "Safari Web Extension ZIP: $ZIP_PATH"
echo "iOS Xcode project location: $PROJECT_DIR"
