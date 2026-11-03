#!/usr/bin/env bash
# Deploy the license server: set its secrets from ~/.church-studio (never printed), deploy, and
# check it answers. Run from anywhere: ./server/deploy.sh
set -euo pipefail
cd "$(dirname "$0")"
dir="$HOME/.church-studio"

# Secrets the server already has are kept: a secret is set only from a local copy, or made when
# the server has none yet (the first deploy). Deploying from a second computer, without the files,
# so changes nothing: making new ones there would sign everyone out (BETTER_AUTH_SECRET) or stop
# every key and lease from working (CHURCH_STUDIO_SIGNING_KEY).
# Stop when the list cannot be read (not logged in, offline): guessing "none" would replace them.
existing="$(npx --yes wrangler@4 secret list)" || { echo "Could not list the server's secrets. Run: npx wrangler login" >&2; exit 1; }
on_server() { grep -qw "$1" <<<"$existing"; }

# put_secret NAME FILE [make]: set NAME from FILE; with "make", make FILE when the server lacks NAME too.
put_secret() {
  local name="$1" file="$2" make="${3:-}"
  if [ -s "$file" ]; then
    chmod 600 "$file"
    tr -d '\n' < "$file" | npx --yes wrangler@4 secret put "$name"
  elif on_server "$name"; then
    echo "$name: kept the server's (no $file here)"
  elif [ "$make" = make ]; then
    mkdir -p "$dir"
    (umask 077; openssl rand -hex 32 > "$file")
    echo "Made a new $name in $file"
    tr -d '\n' < "$file" | npx --yes wrangler@4 secret put "$name"
  else
    echo "Missing $file, and the server has no $name. Run: node scripts/license.ts keygen" >&2
    exit 1
  fi
}

put_secret CHURCH_STUDIO_SIGNING_KEY "$dir/license-signing.key"
put_secret ADMIN_TOKEN "$dir/admin-token.txt" make

# Accounts, once the AUTH_DB database is in wrangler.jsonc (README: Accounts): its secret and tables.
if grep -q '"binding": "AUTH_DB"' wrangler.jsonc; then
  put_secret BETTER_AUTH_SECRET "$dir/auth-secret.txt" make
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
echo "Admin page: $url/admin"
