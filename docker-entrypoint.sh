#!/bin/sh
set -e
echo "[cos] prisma db push..."
npx prisma db push --skip-generate
echo "[cos] seed admin..."
npx tsx prisma/seed.ts || true
echo "[cos] starting next..."
exec npm start
