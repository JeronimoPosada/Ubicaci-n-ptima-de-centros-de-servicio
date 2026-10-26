#!/usr/bin/env bash
# Arranca el laboratorio de optimización y abre el navegador.
#
# Si el puerto pedido está ocupado, comprueba si ya es esta misma aplicación
# —en cuyo caso basta con abrir el navegador— y si no, busca el siguiente
# puerto libre en vez de fallar.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUERTO="${1:-8777}"

# http.server activa SO_REUSEADDR, así que la comprobación debe hacerlo también:
# de lo contrario un socket en TIME_WAIT se vería como ocupado sin estarlo.
libre() {
  python3 -c '
import socket, sys
s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    s.bind(("", int(sys.argv[1])))
except OSError:
    sys.exit(1)
finally:
    s.close()
' "$1"
}

# ¿Lo que ocupa el puerto ya es esta aplicación?
sirve_la_app() {
  python3 -c '
import sys, urllib.request
try:
    with urllib.request.urlopen("http://localhost:%s/" % sys.argv[1], timeout=2) as r:
        sys.exit(0 if "Valle de Aburr" in r.read(4096).decode("utf-8", "replace") else 1)
except Exception:
    sys.exit(1)
' "$1"
}

abrir() {
  ( sleep 1; command -v xdg-open >/dev/null && xdg-open "$1" >/dev/null 2>&1 || true ) &
}

echo "Red de Cobertura · Valle de Aburrá"

if ! libre "$PUERTO"; then
  if sirve_la_app "$PUERTO"; then
    echo "Ya hay una instancia sirviendo en http://localhost:$PUERTO — abriendo el navegador."
    abrir "http://localhost:$PUERTO"
    wait
    exit 0
  fi
  INICIAL="$PUERTO"
  while ! libre "$PUERTO" && [ "$PUERTO" -lt $((INICIAL + 20)) ]; do
    PUERTO=$((PUERTO + 1))
  done
  if ! libre "$PUERTO"; then
    echo "No se encontró un puerto libre cerca de $INICIAL." >&2
    exit 1
  fi
  echo "El puerto $INICIAL está ocupado por otro proceso; se usará el $PUERTO."
fi

echo "Sirviendo $RAIZ/app en http://localhost:$PUERTO"
echo "Ctrl+C para detener."
echo

abrir "http://localhost:$PUERTO"
exec python3 -m http.server "$PUERTO" --directory "$RAIZ/app"
