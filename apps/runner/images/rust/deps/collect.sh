#!/bin/sh
# Copie les crates pré-compilées et génère les arguments rustc (--extern …).
set -eu
SRC=/build/target
DST=/opt/codemori/deps
mkdir -p "$DST"
find "$SRC" -path "*/release/*" \( -name '*.rlib' -o -name '*.so' \) -exec cp {} "$DST"/ \;
OUT=/opt/codemori/rust-externs
printf -- '-L dependency=%s ' "$DST" > "$OUT"
for c in tokio rand serde serde_json regex; do
  f=$(ls -t "$DST"/lib${c}-*.rlib 2>/dev/null | head -n 1 || true)
  if [ -n "$f" ]; then printf -- '--extern %s=%s ' "$c" "$f" >> "$OUT"; fi
done
echo "Crates disponibles :"; cat "$OUT"; echo
