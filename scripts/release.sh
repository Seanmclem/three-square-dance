#!/usr/bin/env bash
# Release SquareDance: compile all targets, sign + notarize the mac apps when a
# Developer ID identity is present (ad-hoc fallback with a warning otherwise),
# and create a DRAFT GitHub release with the artifacts attached.
#
# Usage:  deno task release vX.Y.Z
#
# One-time signing setup (DESKTOP_GUIDE.md §3):
#   1. Developer ID Application certificate in the login Keychain
#      (Xcode → Settings → Accounts → team → Manage Certificates → +)
#   2. xcrun notarytool store-credentials squaredance-notary \
#        --apple-id <appleid-email> --team-id <TEAMID>
set -euo pipefail

TAG="${1:?usage: deno task release vX.Y.Z}"
cd "$(dirname "$0")/.."

NOTARY_PROFILE=squaredance-notary
ENTITLEMENTS=desktop/entitlements.plist

npm run build
deno task compile:mac-arm64
deno task compile:mac-x64
deno task compile:win-x64

IDENTITY=$(security find-identity -v -p codesigning | awk -F'"' '/Developer ID Application/ {print $2; exit}')

sign_app() {
  local app="$1"
  echo "── signing: $app"
  # Inside-out per Apple's guidance (--deep is deprecated and skips
  # entitlements on nested code): libraries → frameworks → helper apps → app.
  find "$app/Contents" \( -name '*.dylib' -o -name '*.so' \) -print0 |
    xargs -0 -n1 codesign --force --options runtime --timestamp --sign "$IDENTITY"
  find "$app/Contents/Frameworks" -maxdepth 1 -name '*.framework' -print0 |
    xargs -0 -n1 codesign --force --options runtime --timestamp --sign "$IDENTITY"
  find "$app/Contents/Frameworks" -maxdepth 1 -name '*.app' -print0 |
    xargs -0 -n1 codesign --force --options runtime --timestamp \
      --entitlements "$ENTITLEMENTS" --sign "$IDENTITY"
  codesign --force --options runtime --timestamp \
    --entitlements "$ENTITLEMENTS" --sign "$IDENTITY" "$app"
  codesign --verify --deep --strict "$app"
}

notarize_app() {
  local app="$1" zip="${app%.app}-notarize.zip"
  echo "── notarizing: $app (this waits on Apple, usually a few minutes)"
  ditto -c -k --keepParent "$app" "$zip"
  xcrun notarytool submit "$zip" --keychain-profile "$NOTARY_PROFILE" --wait
  rm -f "$zip"
  xcrun stapler staple "$app"
}

mkdir -p build/release
ASSETS=()
for app in build/SquareDance.app build/SquareDance-intel.app; do
  if [[ -n "$IDENTITY" ]]; then
    sign_app "$app"
    notarize_app "$app"
  else
    echo "⚠ no Developer ID Application identity in Keychain — $app ships"
    echo "  ad-hoc signed (recipients must right-click → Open the first time)."
  fi
  zip="build/release/$(basename "${app%.app}")-${TAG}-mac.zip"
  ditto -c -k --keepParent "$app" "$zip"   # ditto preserves the framework symlinks
  ASSETS+=("$zip")
done
cp build/SquareDance.msi "build/release/SquareDance-${TAG}-win-x64.msi"
ASSETS+=("build/release/SquareDance-${TAG}-win-x64.msi")

gh release create "$TAG" "${ASSETS[@]}" --draft --title "SquareDance $TAG" --notes \
"SquareDance ${TAG}

- \`SquareDance-${TAG}-mac.zip\` — macOS, Apple Silicon
- \`SquareDance-intel-${TAG}-mac.zip\` — macOS, Intel
- \`SquareDance-${TAG}-win-x64.msi\` — Windows 10/11 x64 (unsigned: SmartScreen will warn)"

echo
echo "✔ DRAFT release ${TAG} created — review and publish it on GitHub:"
gh release view "$TAG" --web >/dev/null 2>&1 || true
