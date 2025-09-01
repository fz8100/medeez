#!/bin/bash
# Start local development environment for Medeez v2

echo "Starting Medeez v2 local development environment..."

# Start Docker services
docker-compose -f docker-compose.local.yml up -d

# Wait for services to start
echo "Waiting for services to start..."
sleep 10

# Create DynamoDB table
echo "Creating DynamoDB table..."
node scripts/create-local-table.js

# Create S3 buckets
echo "Creating S3 buckets..."
node scripts/create-local-buckets.js

# Generate seed data
echo "Generating seed data..."
node scripts/seed-generator.js generate dev

echo "Local development environment is ready!"
echo "Services available:"
echo "  - DynamoDB Admin: http://localhost:8000"
echo "  - MinIO Console: http://localhost:9001 (admin/admin123)"
echo "  - Redis: localhost:6379"
echo "  - PostgreSQL: localhost:5432"
