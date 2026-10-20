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

# Accounts, once the AUTH_DB database is in wrangler.jsonc (README: Accounts): its secret and tables.
if grep -q '"binding": "AUTH_DB"' wrangler.jsonc; then
  if [ ! -s "$dir/auth-secret.txt" ]; then
    (umask 077; openssl rand -hex 32 > "$dir/auth-secret.txt")
    echo "Made a new accounts secret in $dir/auth-secret.txt"
  fi
  tr -d '\n' < "$dir/auth-secret.txt" | npx --yes wrangler@4 secret put BETTER_AUTH_SECRET
  npx --yes wrangler@4 d1 execute church-studio-auth --remote --file auth-schema.sql
fi
npx --yes wrangler@4 deploy

url="${CHURCH_STUDIO_SERVER:-https://license.heitechinc.com}"
echo "Checking $url ..."
curl -fsS -X POST "$url/v1/hello" -H 'content-type: application/json' \
  -d '{"device":"deploy-check","version":"0.0.0","os":"deploy","plan":"free"}' && echo
curl -fsS -o /dev/null -w "admin stats without a token: %{http_code} (401 expected)\n" "$url/v1/admin/stats" || true
if grep -q '"binding": "AUTH_DB"' wrangler.jsonc; then
  curl -fsS -m 15 -o /dev/null -w "accounts (/auth/ok): %{http_code} (200 expected)\n" "$url/auth/ok" || echo "accounts (/auth/ok): no answer"
fi
echo "Admin page: $url/admin (token in $dir/admin-token.txt)"
