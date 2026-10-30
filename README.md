# Stride tracker (pure static site for Netlify)

No server, no Python. Everything runs in the browser; `public/static/store.js` answers the app's `/api/*` calls
and keeps all data in the browser's IndexedDB.

## Deploy
1. Push this folder to GitHub.
2. Netlify -> Add new site -> Import from GitHub. Publish directory `public`, no build command (netlify.toml sets it).
3. Open the site. Sign in with the default admin account (see store.js) and change the password under Profile right away.

## Important
- Data is stored per browser/device. Clearing site data deletes it. Use "export backup" (bottom-right) regularly;
  "import" restores it, also on another device.
- Accounts are local to the browser. They separate people sharing one device; they are not server security.
- Editing: change files in `src/`, run `./build.sh` (esbuild), commit `public/`.
