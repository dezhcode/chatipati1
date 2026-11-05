#!/usr/bin/env bash
# به روزرسانی chatai روی هاست با یک دستور (مثل عبور):
#
#   bash update.sh            آخرین بیلد شاخه deploy
#   bash update.sh <branch>   آخرین نسخه یک شاخه دیگر
#
# شاخه deploy فقط بیلد آماده است (.next/standalone + app.js)، پس روی هاست نه
# npm install لازم است نه build. کارها:
#   ۱. آخرین بیلد را از گیت هاب می گیرد و فایل ها را با آن یکی می کند
#   ۲. اپ را ری استارت می کند (tmp/restart.txt) و یک بار بیدارش می کند
#   ۳. فضای گیت را جمع می کند (سهمیه هاست کم است)
#
# فایل های شخصی (.env، tmp/، node_modules) در .gitignore هستند و دست نمی خورند.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
BRANCH="${1:-deploy}"
REPO_URL="${CHATAI_REPO:-https://github.com/dezhcode/chatipati1.git}"
APP_URL="${CHATAI_URL:-https://dezhcode.pyho.ir/chatai}"

cd "$APP_DIR"
say() { printf '\n== %s\n' "$*"; }

if [ ! -d .git ]; then
  say "اولین اجرا: وصل کردن پوشه به $REPO_URL"
  git init -q
  git remote add origin "$REPO_URL"
fi
# اگر آدرس مخزن عوض شده باشد
if [ "$(git remote get-url origin 2>/dev/null || true)" != "$REPO_URL" ]; then
  git remote set-url origin "$REPO_URL" 2>/dev/null || git remote add origin "$REPO_URL"
fi

say "گرفتن آخرین بیلد شاخه $BRANCH"
OLD="$(git rev-parse -q --verify HEAD 2>/dev/null || echo none)"
git fetch -q --depth 1 origin "$BRANCH"
git reset -q --hard FETCH_HEAD
git checkout -q -B "$BRANCH"
NEW="$(git rev-parse HEAD)"
if [ "$OLD" = "$NEW" ]; then
  echo "بیلد از قبل به روز بود ($(git log -1 --format='%h %s'))"
else
  echo "به روز شد: ${OLD:0:7} -> ${NEW:0:7}  ($(git log -1 --format='%s'))"
fi

say "ری استارت"
mkdir -p tmp
touch tmp/restart.txt
if command -v curl >/dev/null 2>&1; then
  sleep 2
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 40 "$APP_URL" || true)"
  echo "health: HTTP $code"
fi

git reflog expire --expire=now --all >/dev/null 2>&1 || true
git gc -q --prune=now >/dev/null 2>&1 || true
echo "تمام."
