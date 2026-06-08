#!/usr/bin/env bash
set -euo pipefail
h(){ echo -e "\n=== $* ===\n"; }
if [[ ! -f .env ]]; then echo "❌ .env missing"; exit 1; fi
export $(grep -v '^#' .env | grep -E 'GITHUB_PAT|GITHUB_USER' | xargs)
[[ -z "${GITHUB_PAT:-}" ]] && { echo "❌ GITHUB_PAT missing"; exit 1; }
cat > .gitignore <<'EOGI'
.env
.env.*
.secret
config/*.key
*.pem
*.crt
.DS_Store
Thumbs.db
desktop.ini
node_modules/
dist/
build/
__pycache__/
*.pyc
*.class
target/
out/
*.log
*.tmp
tmp/
cache/
logs/
docker-compose.override.yml
EOGI
if [[ ! -d .git ]]; then git init; fi
TARGET_REMOTE="https://github.com/Arc-y7b/arctime.git"
git remote remove origin 2>/dev/null || true
git remote add origin "$TARGET_REMOTE"
if git show-ref --verify --quiet refs/heads/main; then git checkout main; else git checkout -b main; fi
git add .
if ! git diff-index --quiet HEAD --; then git commit -m "Initial commit $(date)"; fi
AUTHED_URL="https://${GITHUB_USER:-${GITHUB_PAT}}:${GITHUB_PAT}@github.com/Arc-y7b/arctime.git"
git push -u "$AUTHED_URL" main
git remote set-url origin "$TARGET_REMOTE"
h "All done – code is on https://github.com/Arc-y7b/arctime (branch main)"
