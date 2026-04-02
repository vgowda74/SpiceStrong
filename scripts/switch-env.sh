#!/bin/bash
# Switch between dev and prod environments
# Usage: ./scripts/switch-env.sh dev   (or prod)

ENV=$1

if [ "$ENV" = "dev" ]; then
  cp .env.development .env
  echo "Switched to DEV environment"
  echo "Supabase: DEV database (safe for testing)"
elif [ "$ENV" = "prod" ]; then
  cp .env.production .env
  echo "Switched to PROD environment"
  echo "WARNING: Connected to production database!"
else
  echo "Usage: ./scripts/switch-env.sh [dev|prod]"
  echo ""
  echo "Current .env points to:"
  grep SUPABASE_URL .env | head -1
  exit 1
fi

echo ""
echo "Restart Expo to apply: npx expo start"
