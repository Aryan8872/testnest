#!/bin/sh
set -e

echo "🚀 [Container Entrypoint] Running Prisma database migrations..."
npx prisma migrate deploy

if [ "$RUN_SEED" = "true" ]; then
  echo "🌱 [Container Entrypoint] RUN_SEED is enabled. Running database seed..."
  node dist/prisma/seed.js || echo "⚠️ Seed skipped or already applied"
fi

echo "✨ [Container Entrypoint] Starting NestJS production application..."
exec node dist/src/main.js
