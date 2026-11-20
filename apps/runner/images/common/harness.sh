#!/bin/sh
# Harnais d'exécution Codemori — exécuté DANS le conteneur bac à sable.
#
# Entrée standard : archive tar contenant le fichier source et tests/<n>.in
# Variables : COMPILE_CMD, RUN_CMD, COMPILE_TIMEOUT, RUN_TIMEOUT, OUT_LIMIT
# Sortie : protocole texte, chaque flux est encodé en base64 sur une ligne.
#   @@CM COMPILE <code> <ms>
#   <stdout base64>
#   <stderr base64>
#   @@CM TEST <n> <code> <ms>
#   <stdout base64>
#   <stderr base64>
#   @@CM END
set -u
W=/tmp/w
mkdir -p "$W" && cd "$W" || exit 90
tar -xf - -C "$W" 2>/dev/null || { echo "@@CM ERROR extract"; exit 91; }

OUT_LIMIT=${OUT_LIMIT:-65536}
COMPILE_TIMEOUT=${COMPILE_TIMEOUT:-30}
RUN_TIMEOUT=${RUN_TIMEOUT:-5}

now_ms() { date +%s%3N; }
emit() { head -c "$OUT_LIMIT" "$1" | base64 -w0; echo; }

if [ -n "${COMPILE_CMD:-}" ]; then
  t0=$(now_ms)
  timeout -s KILL "$COMPILE_TIMEOUT" sh -c "$COMPILE_CMD" >/tmp/c.out 2>/tmp/c.err </dev/null
  cs=$?
  t1=$(now_ms)
else
  : >/tmp/c.out; : >/tmp/c.err; cs=0; t0=0; t1=0
fi
echo "@@CM COMPILE $cs $((t1 - t0))"
emit /tmp/c.out
emit /tmp/c.err

if [ "$cs" -eq 0 ] && [ -d tests ]; then
  for f in $(ls tests | sort -n); do
    n=${f%.in}
    t0=$(now_ms)
    timeout -s KILL "$RUN_TIMEOUT" sh -c "$RUN_CMD" <"tests/$f" >/tmp/o 2>/tmp/e
    rs=$?
    t1=$(now_ms)
    echo "@@CM TEST $n $rs $((t1 - t0))"
    emit /tmp/o
    emit /tmp/e
    rm -f /tmp/o /tmp/e
  done
fi
echo "@@CM END"
