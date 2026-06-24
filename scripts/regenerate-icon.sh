#!/usr/bin/env bash
# Recolor the tree icon to dark blue and rebuild icon.icns (macOS).
#
# The source icon has a solid (opaque) black background; we must not recolor
# that background or the result becomes a flat blue square. The light dock icon
# uses a transparent background so macOS can apply the standard squircle mask.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/build/icon-source-1024.png"
SRC_LIGHT="$ROOT/build/icon-source-1024-light.png"
ICONSET="$ROOT/build/icon.iconset"
ICONSET_LIGHT="$ROOT/build/icon-light.iconset"
ICNS="$ROOT/build/icon.icns"
ICNS_LIGHT="$ROOT/build/icon-light.icns"
BLUE='#3B7DD8'

python3 - "$SRC" "$SRC_LIGHT" "$BLUE" <<'PY'
import shutil
import sys

try:
    from PIL import Image
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--user', 'pillow', '-q'])
    from PIL import Image

dark_path, light_path, blue_hex = sys.argv[1], sys.argv[2], sys.argv[3]
r = int(blue_hex[1:3], 16)
g = int(blue_hex[3:5], 16)
b = int(blue_hex[5:7], 16)

def recolor_tree(path: str) -> None:
    img = Image.open(path).convert('RGBA')
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            rr, gg, bb, a = px[x, y]
            if not a:
                continue
            # Preserve the opaque background; only recolor non-black (tree)
            # pixels. Threshold is intentionally a little forgiving for antialiasing.
            if rr < 40 and gg < 40 and bb < 40:
                continue
            px[x, y] = (r, g, b, a)
    img.save(path)

def make_light_variant(dark_path: str, light_path: str) -> None:
    shutil.copyfile(dark_path, light_path)
    img = Image.open(light_path).convert('RGBA')
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            rr, gg, bb, a = px[x, y]
            if not a:
                continue
            if rr < 40 and gg < 40 and bb < 40:
                px[x, y] = (0, 0, 0, 0)
    img.save(light_path)

recolor_tree(dark_path)
make_light_variant(dark_path, light_path)
PY

build_icns() {
  local source="$1"
  local iconset="$2"
  local icns="$3"
  rm -rf "$iconset"
  mkdir -p "$iconset"
  for size in 16 32 128 256 512; do
    sips -z "$size" "$size" "$source" --out "$iconset/icon_${size}x${size}.png" >/dev/null
    double=$((size * 2))
    sips -z "$double" "$double" "$source" --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
  done
  cp "$iconset/icon_32x32@2x.png" "$iconset/icon_64x64.png"
  iconutil -c icns "$iconset" -o "$icns"
  rm -rf "$iconset"
}

build_icns "$SRC" "$ICONSET" "$ICNS"
build_icns "$SRC_LIGHT" "$ICONSET_LIGHT" "$ICNS_LIGHT"
echo "Wrote $ICNS and $ICNS_LIGHT"
