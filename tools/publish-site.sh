#!/usr/bin/env bash
# Sync the app (no business docs) to the public deploy repo and push.
# The public repo's GitHub Action then redeploys Pages and refreshes the NYT feed daily.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DST="${SITE_DIR:-$SRC/../fair-sudoku-site}"

if [ ! -d "$DST/.git" ]; then
  echo "Deploy repo not found at $DST — clone it first:" >&2
  echo "  gh repo clone Tim1986/fair-sudoku-site \"$DST\"" >&2
  exit 1
fi

rsync -a --delete \
  --exclude ".git" --exclude "docs" --exclude "data" --exclude ".DS_Store" \
  "$SRC/index.html" "$SRC/checker.html" "$SRC/manifest.webmanifest" "$SRC/sw.js" \
  "$SRC/css" "$SRC/js" "$SRC/icons" "$SRC/tools" "$SRC/.github" "$SRC/.gitignore" \
  "$DST/"

cat > "$DST/README.md" <<'EOF'
# Fair Sudoku — deploy mirror

Public deploy repo for [Fair Sudoku](https://tim1986.github.io/fair-sudoku-site/).
Fair puzzles. No guessing. No ads. Ever.

Source of truth lives in a private repo; this mirror is updated by `tools/publish-site.sh`.
A GitHub Action redeploys on push and refreshes the NYT fairness feed daily.
EOF

cd "$DST"
git add -A
if git diff --cached --quiet; then
  echo "Site already up to date."
else
  git commit -m "Publish site $(date -u +%Y-%m-%dT%H:%MZ)"
  git push
  echo "Published."
fi
