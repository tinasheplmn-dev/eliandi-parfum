#!/bin/bash
# Zet de huidige site op de publieke link (GitHub Pages).
#   bash tools/publiceer.sh
#
# De site staat in deze map, maar de publieke link draait op een eigen
# repo: github.com/tinasheplmn-dev/eliandi-parfum. Dit script kopieert
# de bestanden daarheen en zet ze live. Een minuut later staat alles op
# https://tinasheplmn-dev.github.io/eliandi-parfum/
set -e

BRON="$(cd "$(dirname "$0")/.." && pwd)"
KLOON="$HOME/eliandi-parfum-publiek"
REPO="https://github.com/tinasheplmn-dev/eliandi-parfum.git"

if [ ! -d "$KLOON/.git" ]; then
  echo "Publieke map ophalen..."
  git clone -q "$REPO" "$KLOON"
else
  git -C "$KLOON" pull -q --ff-only
fi

rsync -a --delete \
  --exclude='.git' --exclude='.nojekyll' --exclude='node_modules' \
  --exclude='tools/__pycache__' \
  "$BRON/" "$KLOON/"
touch "$KLOON/.nojekyll"

cd "$KLOON"
git add -A
if git diff --cached --quiet; then
  echo "Niets gewijzigd, de publieke link is al bij."
  exit 0
fi
git commit -q -m "Site bijgewerkt op $(date '+%-d %B %Y, %H:%M')"
git push -q
echo "Klaar. Over ongeveer een minuut staat het op:"
echo "https://tinasheplmn-dev.github.io/eliandi-parfum/"
