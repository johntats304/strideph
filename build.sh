#!/bin/sh
# Optional: re-minify src/* into public/static/* after editing (needs: npm i -g esbuild).
for f in src/*.js; do esbuild "$f" --minify --target=es2018 --outfile="public/static/$(basename "$f")" --log-level=error; done
for f in src/*.css; do esbuild "$f" --minify --outfile="public/static/$(basename "$f")" --log-level=error; done
