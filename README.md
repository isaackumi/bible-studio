# Church Studio

Offline presentation studio for churches: scripture, songs, sermons and the running order of a
service, shown on any number of screens of any shape. A Tauri desktop app (SvelteKit + Rust) for
macOS, Windows and Linux, with a browser demo, and a small license server on Cloudflare Workers.
Sold by HeiTech.

## Layout

| Folder | What it is |
| --- | --- |
| `src/` | The app's interface (SvelteKit, Svelte 5). `src/lib/app/session.svelte.ts` holds the desk's state. |
| `src-tauri/` | The desktop side (Rust): library database, Bibles, screens, voice, downloads, license lease. |
| `server/` | License server (`church-studio.heitechinc.com`, `license.heitechinc.com`): checkout, keys, accounts, admin. See `server/README.md`. |
| `scripts/` | Release notes, Bible pack tools, `publish-assets.sh`. |
| `docs/` | Product and design notes. |

## Develop

```sh
npm ci
npm run tauri dev        # the desktop app
npm run dev              # the browser version only
npm run server:dev       # the license server, locally
```

## Check

```sh
npm run check            # types (src/)
npm run check:server     # types (server/, scripts/)
npm test                 # all TypeScript tests
cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings
```

CI runs all of these on every push and pull request, and builds the app on all three platforms.

## Release the app

1. Bump the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.
2. Add the version's highlights at the top of `src/lib/domain/changelog.ts` (a test fails without them).
3. Push a tag `vX.Y.Z`. The Release workflow tests, builds and signs every platform as a draft,
   then publishes it as the latest release once all three, and `latest.json`, are in.

Installed copies update from the **latest** GitHub release, and the site's download buttons use it
too. So **anything that is not the app must be a pre-release**: publish data packs with
`scripts/publish-assets.sh <tag> "<title>" <files…>`. The Release guard workflow turns any other
non-`v*` release into a pre-release and makes the newest app release the latest again.

## Deploy the server

Pushing to `main` deploys the server, the home page and the browser version (`/app`) whenever
`server/`, `src/` or the web build settings changed (Deploy site workflow). For first-time secrets
and the database, run `server/deploy.sh`; see `server/README.md`.
