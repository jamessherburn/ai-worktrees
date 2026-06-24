#!/usr/bin/env bash
# Recolor the tree icon to dark blue on a white background and rebuild icon.icns (macOS).
#
# The source icon has a solid (opaque) black background; we must not recolor
# that background during tree recoloring or the result becomes a flat blue square.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/build/icon-source-1024.png"
ICONSET="$ROOT/build/icon.iconset"
ICNS="$ROOT/build/icon.icns"
BLUE='#3B7DD8'

python3 - "$SRC" "$BLUE" <<'PY'
import sys

try:
    from PIL import Image
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--user', 'pillow', '-q'])
    from PIL import Image

path, blue_hex = sys.argv[1], sys.argv[2]
r = int(blue_hex[1:3], 16)
g = int(blue_hex[3:5], 16)
b = int(blue_hex[5:7], 16)
img = Image.open(path).convert('RGBA')
px = img.load()
w, h = img.size
for y in range(h):
    for x in range(w):
        rr, gg, bb, a = px[x, y]
        if not a:
            continue
        # Black background becomes white; only recolor non-black (tree) pixels.
        # Threshold is intentionally a little forgiving for antialiasing.
        if rr < 40 and gg < 40 and bb < 40:
            px[x, y] = (255, 255, 255, a)
        else:
            px[x, y] = (r, g, b, a)
img.save(path)
PY

rm -rf "$ICONSET"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$SRC" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$SRC" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
cp "$ICONSET/icon_32x32@2x.png" "$ICONSET/icon_64x64.png"
iconutil -c icns "$ICONSET" -o "$ICNS"
rm -rf "$ICONSET"
echo "Wrote $ICNS"
