#!/usr/bin/env bash
set -euo pipefail

echo "Checking PostgreSQL service..."
sudo service postgresql status | sed -n '1,5p'

echo
echo "Checking database connection..."
PGPASSWORD=qa_password psql -h localhost -U qa_user -d qa_dataset_db -c '\conninfo'

echo
echo "Checking backend health endpoint..."
curl -fsS http://localhost:3000/health

echo
echo
echo "Checking backend API docs endpoint..."
curl -I http://localhost:3000/docs | sed -n '1,5p'

echo
echo "Verification complete."
