#!/usr/bin/env bash
# Prueba manual de la función scrapear-propiedades-externas.
# Uso local (contra `supabase functions serve`):
#   ./scripts/test-scraper-propiedades-externas.sh local
# Uso contra producción/staging ya desplegado:
#   ./scripts/test-scraper-propiedades-externas.sh remote

set -euo pipefail

MODO="${1:-local}"

if [ "$MODO" = "local" ]; then
  URL="http://127.0.0.1:54321/functions/v1/scrapear-propiedades-externas"
else
  URL="https://ymvrddvckmwiajcqaled.supabase.co/functions/v1/scrapear-propiedades-externas"
fi

if [ -z "${SCRAPER_TRIGGER_SECRET:-}" ]; then
  echo "Falta la variable de entorno SCRAPER_TRIGGER_SECRET en tu shell." >&2
  echo "Expórtala primero, ej.: export SCRAPER_TRIGGER_SECRET=<el valor que configuraste con supabase secrets set>" >&2
  exit 1
fi

echo "Llamando a: $URL"
echo "---"

curl -i -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "x-scraper-secret: $SCRAPER_TRIGGER_SECRET" \
  -d '{}'

echo ""
echo "---"
echo "La función responde 200 de inmediato y procesa en background."
echo "Espera unos segundos y revisa los logs con:"
if [ "$MODO" = "local" ]; then
  echo "  (los logs de 'supabase functions serve' salen en la misma terminal donde la corriste)"
else
  echo "  supabase functions logs scrapear-propiedades-externas"
fi
