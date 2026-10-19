#!/usr/bin/env bash
# Deploy the license server: set its secrets from ~/.church-studio (never printed), deploy, and
# check it answers. Run from anywhere: ./server/deploy.sh
set -euo pipefail
cd "$(dirname "$0")"
dir="$HOME/.church-studio"

test -s "$dir/license-signing.key" || { echo "Missing $dir/license-signing.key" >&2; exit 1; }
if [ ! -s "$dir/admin-token.txt" ]; then
  (umask 077; openssl rand -hex 32 > "$dir/admin-token.txt")
  echo "Made a new admin token in $dir/admin-token.txt"
fi
chmod 600 "$dir/admin-token.txt"

tr -d '\n' < "$dir/license-signing.key" | npx --yes wrangler@4 secret put CHURCH_STUDIO_SIGNING_KEY
tr -d '\n' < "$dir/admin-token.txt" | npx --yes wrangler@4 secret put ADMIN_TOKEN
npx --yes wrangler@4 deploy

url="${CHURCH_STUDIO_SERVER:-https://church-studio-keys.heitech-inc.workers.dev}"
echo "Checking $url ..."
curl -fsS -X POST "$url/v1/hello" -H 'content-type: application/json' \
  -d '{"device":"deploy-check","version":"0.0.0","os":"deploy","plan":"free"}' && echo
curl -fsS -o /dev/null -w "admin stats without a token: %{http_code} (401 expected)\n" "$url/v1/admin/stats" || true
echo "Admin page: $url/admin (token in $dir/admin-token.txt)"
