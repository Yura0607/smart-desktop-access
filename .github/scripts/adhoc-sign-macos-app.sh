#!/usr/bin/env bash
# Ad-hoc sign a macOS app after every file inside it is finished.
# Hardened runtime and timestamps need a Developer ID and make Gatekeeper
# call an ad-hoc app "damaged" once the download is quarantined.

set -euo pipefail

app_path=$1
entitlements=$2

if [[ ! -d "$app_path" ]]; then
  echo "App not found: $app_path" >&2
  exit 1
fi

xattr -cr "$app_path"

sign_leaf() {
  codesign --force --sign - --timestamp=none "$1"
}

# codesign treats the bundle's main executable as the bundle. Signing it
# before helpers such as Contents/MacOS/service fails with "not signed at all".
main_exe="$app_path/Contents/MacOS/$(basename "$app_path" .app)"

while IFS= read -r -d '' path; do
  if [[ "$path" == "$app_path" || "$path" == "$main_exe" ]]; then
    continue
  fi
  if [[ -f "$path" ]] && file -b "$path" | grep -q 'Mach-O'; then
    sign_leaf "$path"
  elif [[ -d "$path" && ( "$path" == *.framework || "$path" == *.app || "$path" == *.xpc ) ]]; then
    sign_leaf "$path"
  fi
done < <(find "$app_path" -depth -print0)

codesign --force --sign - --timestamp=none --generate-entitlement-der \
  --entitlements "$entitlements" "$app_path"

codesign --verify --deep --strict --verbose=2 "$app_path"

scratch=$(mktemp -d)
cleanup() { rm -rf "$scratch"; }
trap cleanup EXIT
copy="$scratch/$(basename "$app_path")"
cp -R "$app_path" "$copy"
xattr -w com.apple.quarantine "0083;$(date +%s);Safari;00000000-0000-0000-0000-000000000000" "$copy"
details=$(codesign -dv "$copy" 2>&1 || true)
printf '%s\n' "$details"
if ! printf '%s\n' "$details" | grep -q 'Signature=adhoc'; then
  echo "Quarantined copy is not an ad-hoc signature" >&2
  exit 1
fi
codesign --verify --deep --strict --verbose=2 "$copy"
