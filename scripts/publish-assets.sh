#!/usr/bin/env bash
# Publish files that are not the app (Bible packs, song packs) as a GitHub *pre-release*.
# The updater and the download buttons read the latest release, so anything else must never be it
# (the Release guard workflow fixes it if it happens anyway).
#
#   scripts/publish-assets.sh bibles-2026-11 "Bibles: …" path/to/*.json
set -euo pipefail
tag="${1:?tag, e.g. bibles-2026-11}"
title="${2:?title}"
shift 2
[[ "$tag" =~ ^v[0-9] ]] && { echo "Tags starting with v are app releases; use another name." >&2; exit 1; }
[[ $# -gt 0 ]] || { echo "No files to publish." >&2; exit 1; }
gh release create "$tag" --prerelease --latest=false --title "$title" --notes "Data files for Church Studio. Not an app release." "$@"
