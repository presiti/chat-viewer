#!/bin/sh
# Builds release/latest.json for the Tauri updater from the bundles in src-tauri/target/**/release/bundle.
# Usage: scripts/make-latest-json.sh <base-url> [notes]
#   base-url: where the updater files will be hosted, e.g. https://github.com/<owner>/<repo>/releases/download/vX.Y.Z
# Copies the updater artifacts (*.app.tar.gz, *-setup.exe and their .sig) into release/ as well.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${1:?base url}"; NOTES="${2:-}"
VERSION=$(python3 -c "import json;print(json.load(open('$ROOT/src-tauri/tauri.conf.json'))['version'])")
OUT="$ROOT/release"; mkdir -p "$OUT"
python3 - "$ROOT" "$BASE" "$VERSION" "$NOTES" "$OUT" <<'PY'
import sys, json, glob, os, shutil, datetime
root, base, version, notes, out = sys.argv[1:6]
plat = {}
def add(key, pattern):
    files = sorted(glob.glob(os.path.join(root, "src-tauri/target", pattern), recursive=True))
    files = [f for f in files if not f.endswith(".sig")]
    if not files: return
    f = files[-1]; sig = f + ".sig"
    if not os.path.exists(sig): print(f"skip {key}: no .sig next to {f} (build with TAURI_SIGNING_PRIVATE_KEY)"); return
    name = os.path.basename(f)
    shutil.copy2(f, os.path.join(out, name)); shutil.copy2(sig, os.path.join(out, name + ".sig"))
    plat[key] = {"signature": open(sig).read().strip(), "url": f"{base.rstrip('/')}/{name}"}
    print(f"{key}: {name}")
add("darwin-aarch64", "aarch64-apple-darwin/release/bundle/macos/*.app.tar.gz")
add("darwin-aarch64", "release/bundle/macos/*.app.tar.gz")          # host build without --target
add("darwin-x86_64", "x86_64-apple-darwin/release/bundle/macos/*.app.tar.gz")
add("windows-x86_64", "x86_64-pc-windows-msvc/release/bundle/nsis/*-setup.exe")
add("windows-x86_64", "release/bundle/nsis/*-setup.exe")
doc = {"version": version, "notes": notes, "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "platforms": plat}
json.dump(doc, open(os.path.join(out, "latest.json"), "w"), indent=2, ensure_ascii=False)
print("wrote", os.path.join(out, "latest.json"), "platforms:", list(plat))
PY
