#!/bin/bash

echo "Setting up AWS services in LocalStack..."

# Set AWS credentials for LocalStack
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1

# Wait for LocalStack to be ready
until curl -s http://localhost:4566/_localstack/health | grep -q '"s3": "available"'; do
    echo "Waiting for LocalStack to be ready..."
    sleep 2
done

echo "LocalStack is ready, setting up services..."

# Create S3 buckets
echo "Creating S3 buckets..."
awslocal s3 mb s3://medeez-dev-attachments
awslocal s3 mb s3://medeez-dev-exports
awslocal s3 mb s3://medeez-dev-backups

# Set bucket CORS
awslocal s3api put-bucket-cors --bucket medeez-dev-attachments --cors-configuration '{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "POST", "PUT", "DELETE"],
      "AllowedOrigins": ["http://localhost:3000", "http://localhost:3001"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
}'

# Create KMS key
echo "Creating KMS key..."
KMS_KEY=$(awslocal kms create-key --description "Medeez development key" --query 'KeyMetadata.KeyId' --output text)
awslocal kms create-alias --alias-name alias/medeez-dev-key --target-key-id $KMS_KEY

# Create Secrets Manager secrets
echo "Creating secrets..."
awslocal secretsmanager create-secret --name medeez-dev-jwt-secret --secret-string '{"secret":"dev-jwt-secret-key-12345"}'
awslocal secretsmanager create-secret --name medeez-dev-paddle-api-key --secret-string '{"apiKey":"dev-paddle-api-key"}'
awslocal secretsmanager create-secret --name medeez-dev-google-client-secret --secret-string '{"clientSecret":"dev-google-client-secret"}'

# Create SSM parameters
echo "Creating SSM parameters..."
awslocal ssm put-parameter --name "/medeez/dev/domain-name" --value "localhost" --type "String"
awslocal ssm put-parameter --name "/medeez/dev/api-url" --value "http://localhost:3001/api/v1" --type "String"
awslocal ssm put-parameter --name "/medeez/dev/web-url" --value "http://localhost:3000" --type "String"

# Create Cognito User Pool
echo "Creating Cognito User Pool..."
USER_POOL_ID=$(awslocal cognito-idp create-user-pool \
  --pool-name "medeez-dev-users" \
  --policies '{
    "PasswordPolicy": {
      "MinimumLength": 8,
      "RequireUppercase": false,
      "RequireLowercase": true,
      "RequireNumbers": true,
      "RequireSymbols": false
    }
  }' \
  --auto-verified-attributes email \
  --username-attributes email \
  --query 'UserPool.Id' --output text)

# Create User Pool Client
USER_POOL_CLIENT_ID=$(awslocal cognito-idp create-user-pool-client \
  --user-pool-id $USER_POOL_ID \
  --client-name "medeez-dev-client" \
  --generate-secret \
  --explicit-auth-flows ADMIN_NO_SRP_AUTH USER_PASSWORD_AUTH \
  --query 'UserPoolClient.ClientId' --output text)

# Store Cognito details in SSM
awslocal ssm put-parameter --name "/medeez/dev/cognito/user-pool-id" --value "$USER_POOL_ID" --type "String"
awslocal ssm put-parameter --name "/medeez/dev/cognito/user-pool-client-id" --value "$USER_POOL_CLIENT_ID" --type "String"

# Create EventBridge event bus
echo "Creating EventBridge event bus..."
awslocal events create-event-bus --name "medeez-dev-events"

# Create SES verified email for development
echo "Setting up SES..."
awslocal ses verify-email-identity --email-address "noreply@medeez.local"
awslocal ses verify-email-identity --email-address "admin@medeez.local"

echo "LocalStack setup complete!"

# Print summary
echo ""
echo "=== LocalStack Setup Summary ==="
echo "S3 Buckets: medeez-dev-attachments, medeez-dev-exports, medeez-dev-backups"
echo "KMS Key ID: $KMS_KEY"
echo "Cognito User Pool ID: $USER_POOL_ID"
echo "Cognito Client ID: $USER_POOL_CLIENT_ID"
echo "EventBridge Bus: medeez-dev-events"
echo ""
echo "Access services:"
echo "- S3: http://localhost:4566"
echo "- Secrets Manager: awslocal secretsmanager list-secrets"
echo "- SSM: awslocal ssm get-parameters-by-path --path /medeez/dev"
echo "================================"