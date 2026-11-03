#!/bin/sh
# Build the pricing agent's E2B sandbox template and record it in backend/.env.
#
#   sh scripts/setup_e2b.sh            (from backend/)
#
# Prompts for the E2B API key without echoing it (or uses $E2B_API_KEY if set),
# builds e2b.Dockerfile as template "priceiq-docgen", then writes E2B_API_KEY and
# E2B_TEMPLATE_ID into backend/.env, replacing any earlier values. Set the same
# two variables on the Railway web AND worker services afterwards.
set -eu

cd "$(dirname "$0")/.."
TEMPLATE="priceiq-docgen"

if [ -z "${E2B_API_KEY:-}" ]; then
  printf "E2B API key (input hidden): "
  stty -echo 2>/dev/null || true
  read -r E2B_API_KEY
  stty echo 2>/dev/null || true
  printf "\n"
fi
case "$E2B_API_KEY" in
  e2b_*) ;;
  *) echo "That doesn't look like an E2B API key (they start with e2b_)." >&2; exit 1 ;;
esac
export E2B_API_KEY

echo "Building E2B template '$TEMPLATE' from e2b.Dockerfile (first build takes several minutes)..."
npx -y @e2b/cli@2.19.1 template create "$TEMPLATE" \
  --dockerfile e2b.Dockerfile --cpu-count 2 --memory-mb 4096

# Replace any existing E2B lines in .env without printing the key.
touch .env
tmp="$(mktemp)"
grep -v -e '^E2B_API_KEY=' -e '^E2B_TEMPLATE_ID=' .env > "$tmp" || true
printf 'E2B_API_KEY=%s\nE2B_TEMPLATE_ID=%s\n' "$E2B_API_KEY" "$TEMPLATE" >> "$tmp"
cat "$tmp" > .env
rm -f "$tmp"

echo ""
echo "Done. Template '$TEMPLATE' is built and backend/.env has E2B_API_KEY and E2B_TEMPLATE_ID."
echo "Next: set E2B_API_KEY and E2B_TEMPLATE_ID=$TEMPLATE on the Railway web AND worker services,"
echo "then restart the local backend."
