#!/bin/bash
# Concatenate the ordered source parts in src/ into the single-file game at the repo root.
set -e; shopt -s nullglob
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; SRC="$ROOT/src"; OUT="$ROOT/index.html"
JS=$(ls "$SRC"/*.js | sort)
cat "$SRC/00_head.html" > "$OUT"
for f in $JS; do echo "// ===== $(basename "$f") =====" >> "$OUT"; cat "$f" >> "$OUT"; echo >> "$OUT"; done
cat "$SRC/99_tail.html" >> "$OUT"
cat $JS > "$ROOT/tools/.all.js" && node --check "$ROOT/tools/.all.js" && rm "$ROOT/tools/.all.js" && echo "JS syntax OK"
wc -c "$OUT" | awk '{printf "index.html: %.1f KB\n", $1/1024}'
