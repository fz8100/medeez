#!/usr/bin/env python3
"""
AWS Cost Optimization Script for Medeez SaaS Platform
Automatically implements cost optimization recommendations
"""

import json
import boto3
import argparse
import datetime
from typing import Dict, List, Any
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CostOptimizer:
    def __init__(self, environment: str, dry_run: bool = True):
        self.environment = environment
        self.dry_run = dry_run
        
        # Initialize AWS clients
        self.s3_client = boto3.client('s3')
        self.dynamodb_client = boto3.client('dynamodb')
        self.lambda_client = boto3.client('lambda')
        self.cloudfront_client = boto3.client('cloudfront')
        self.ce_client = boto3.client('ce')
        
    def optimize_s3_storage(self) -> Dict[str, Any]:
        """Optimize S3 storage costs"""
        results = {'actions': [], 'savings': 0}
        
        try:
            # List buckets for the environment
            buckets = self.s3_client.list_buckets()['Buckets']
            env_buckets = [b for b in buckets if self.environment in b['Name']]
            
            for bucket in env_buckets:
                bucket_name = bucket['Name']
                logger.info(f"Analyzing bucket: {bucket_name}")
                
                # Enable Intelligent Tiering
                if not self.dry_run:
                    try:
                        self.s3_client.put_bucket_intelligent_tiering_configuration(
                            Bucket=bucket_name,
                            Id='EntireBucket',
                            IntelligentTieringConfiguration={
                                'Id': 'EntireBucket',
                                'Status': 'Enabled',
                                'Filter': {'Prefix': ''},
                                'Tierings': [
                                    {
                                        'Days': 1,
                                        'AccessTier': 'ARCHIVE_ACCESS'
                                    },
                                    {
                                        'Days': 90,
                                        'AccessTier': 'DEEP_ARCHIVE_ACCESS'
                                    }
                                ]
                            }
                        )
                        results['actions'].append(f"Enabled Intelligent Tiering for {bucket_name}")
                    except Exception as e:
                        logger.warning(f"Could not enable Intelligent Tiering for {bucket_name}: {e}")
                else:
                    results['actions'].append(f"[DRY RUN] Would enable Intelligent Tiering for {bucket_name}")
                
                # Clean up incomplete multipart uploads
                self._cleanup_multipart_uploads(bucket_name, results)
                
                # Implement lifecycle policies
                self._implement_lifecycle_policies(bucket_name, results)
                
                # Estimate savings (rough estimate)
                results['savings'] += 50  # Estimated monthly savings per bucket
                
        except Exception as e:
            logger.error(f"Error optimizing S3 storage: {e}")
        
        return results
    
    def _cleanup_multipart_uploads(self, bucket_name: str, results: Dict[str, Any]):
        """Clean up incomplete multipart uploads"""
        try:
            uploads = self.s3_client.list_multipart_uploads(Bucket=bucket_name)
            
            if 'Uploads' in uploads:
                cutoff_date = datetime.datetime.now() - datetime.timedelta(days=7)
                
                for upload in uploads['Uploads']:
                    if upload['Initiated'] < cutoff_date.replace(tzinfo=upload['Initiated'].tzinfo):
                        if not self.dry_run:
                            self.s3_client.abort_multipart_upload(
                                Bucket=bucket_name,
                                Key=upload['Key'],
                                UploadId=upload['UploadId']
                            )
                            results['actions'].append(f"Cleaned up incomplete upload: {upload['Key']}")
                        else:
                            results['actions'].append(f"[DRY RUN] Would clean up incomplete upload: {upload['Key']}")
                            
        except Exception as e:
            logger.warning(f"Could not clean up multipart uploads for {bucket_name}: {e}")
    
    def _implement_lifecycle_policies(self, bucket_name: str, results: Dict[str, Any]):
        """Implement S3 lifecycle policies"""
        lifecycle_config = {
            'Rules': [
                {
                    'ID': 'MedeezLifecycleRule',
                    'Status': 'Enabled',
                    'Filter': {'Prefix': ''},
                    'Transitions': [
                        {
                            'Days': 30,
                            'StorageClass': 'STANDARD_IA'
                        },
                        {
                            'Days': 90,
                            'StorageClass': 'GLACIER'
                        },
                        {
                            'Days': 365,
                            'StorageClass': 'DEEP_ARCHIVE'
                        }
                    ],
                    'AbortIncompleteMultipartUpload': {
                        'DaysAfterInitiation': 7
                    }
                }
            ]
        }
        
        try:
            if not self.dry_run:
                self.s3_client.put_bucket_lifecycle_configuration(
                    Bucket=bucket_name,
                    LifecycleConfiguration=lifecycle_config
                )
                results['actions'].append(f"Implemented lifecycle policy for {bucket_name}")
            else:
                results['actions'].append(f"[DRY RUN] Would implement lifecycle policy for {bucket_name}")
                
        except Exception as e:
            logger.warning(f"Could not implement lifecycle policy for {bucket_name}: {e}")
    
    def optimize_dynamodb(self) -> Dict[str, Any]:
        """Optimize DynamoDB costs"""
        results = {'actions': [], 'savings': 0}
        
        try:
            # List tables for the environment
            tables = self.dynamodb_client.list_tables()['TableNames']
            env_tables = [t for t in tables if self.environment in t]
            
            for table_name in env_tables:
                logger.info(f"Analyzing DynamoDB table: {table_name}")
                
                # Get table description
                table_desc = self.dynamodb_client.describe_table(TableName=table_name)['Table']
                
                # Enable Point-in-Time Recovery if not enabled
                if not table_desc.get('PointInTimeRecoveryDescription', {}).get('PointInTimeRecoveryStatus') == 'ENABLED':
                    if not self.dry_run:
                        self.dynamodb_client.update_continuous_backups(
                            TableName=table_name,
                            PointInTimeRecoverySpecification={'PointInTimeRecoveryEnabled': True}
                        )
                        results['actions'].append(f"Enabled PITR for {table_name}")
                    else:
                        results['actions'].append(f"[DRY RUN] Would enable PITR for {table_name}")
                
                # Implement TTL for expired records
                self._implement_dynamodb_ttl(table_name, results)
                
                # Check for On-Demand billing mode
                if table_desc['BillingModeSummary']['BillingMode'] == 'PROVISIONED':
                    results['actions'].append(f"Consider switching {table_name} to On-Demand billing for variable workloads")
                
                # Estimate savings
                results['savings'] += 25  # Estimated monthly savings per table
                
        except Exception as e:
            logger.error(f"Error optimizing DynamoDB: {e}")
        
        return results
    
    def _implement_dynamodb_ttl(self, table_name: str, results: Dict[str, Any]):
        """Implement TTL for DynamoDB table"""
        try:
            # Check if TTL is already enabled
            ttl_desc = self.dynamodb_client.describe_time_to_live(TableName=table_name)
            
            if ttl_desc['TimeToLiveDescription']['TimeToLiveStatus'] != 'ENABLED':
                if not self.dry_run:
                    self.dynamodb_client.update_time_to_live(
                        TableName=table_name,
                        TimeToLiveSpecification={
                            'AttributeName': 'ttl',
                            'Enabled': True
                        }
                    )
                    results['actions'].append(f"Enabled TTL for {table_name}")
                else:
                    results['actions'].append(f"[DRY RUN] Would enable TTL for {table_name}")
                    
        except Exception as e:
            logger.warning(f"Could not implement TTL for {table_name}: {e}")
    
    def optimize_lambda_functions(self) -> Dict[str, Any]:
        """Optimize Lambda function costs"""
        results = {'actions': [], 'savings': 0}
        
        try:
            # List functions for the environment
            functions = self.lambda_client.list_functions()['Functions']
            env_functions = [f for f in functions if self.environment in f['FunctionName']]
            
            for function in env_functions:
                function_name = function['FunctionName']
                logger.info(f"Analyzing Lambda function: {function_name}")
                
                # Check ARM architecture
                if function.get('Architectures', ['x86_64'])[0] == 'x86_64':
                    results['actions'].append(f"Consider switching {function_name} to ARM architecture for better price-performance")
                
                # Check memory allocation
                memory_size = function['MemorySize']
                if memory_size > 1024:
                    results['actions'].append(f"Review memory allocation for {function_name} (currently {memory_size}MB)")
                
                # Check timeout
                timeout = function['Timeout']
                if timeout > 300:  # 5 minutes
                    results['actions'].append(f"Review timeout setting for {function_name} (currently {timeout}s)")
                
                # Estimate savings
                results['savings'] += 10  # Estimated monthly savings per function
                
        except Exception as e:
            logger.error(f"Error optimizing Lambda functions: {e}")
        
        return results
    
    def optimize_cloudfront(self) -> Dict[str, Any]:
        """Optimize CloudFront costs"""
        results = {'actions': [], 'savings': 0}
        
        try:
            # List distributions
            distributions = self.cloudfront_client.list_distributions()
            
            if 'DistributionList' in distributions and 'Items' in distributions['DistributionList']:
                for dist in distributions['DistributionList']['Items']:
                    dist_id = dist['Id']
                    logger.info(f"Analyzing CloudFront distribution: {dist_id}")
                    
                    # Check price class
                    price_class = dist['PriceClass']
                    if price_class == 'PriceClass_All' and self.environment != 'prod':
                        results['actions'].append(f"Consider using PriceClass_100 for {dist_id} in {self.environment} environment")
                    
                    # Check compression
                    default_behavior = dist['DefaultCacheBehavior']
                    if not default_behavior.get('Compress', False):
                        results['actions'].append(f"Enable compression for distribution {dist_id}")
                    
                    # Estimate savings
                    results['savings'] += 15  # Estimated monthly savings per distribution
                    
        except Exception as e:
            logger.error(f"Error optimizing CloudFront: {e}")
        
        return results
    
    def create_cost_budget(self, monthly_limit: float) -> Dict[str, Any]:
        """Create cost budget and alerts"""
        results = {'actions': [], 'savings': 0}
        
        try:
            budgets_client = boto3.client('budgets')
            
            budget_name = f"medeez-{self.environment}-monthly-budget"
            
            budget = {
                'BudgetName': budget_name,
                'BudgetLimit': {
                    'Amount': str(monthly_limit),
                    'Unit': 'USD'
                },
                'TimeUnit': 'MONTHLY',
                'BudgetType': 'COST',
                'CostFilters': {
                    'TagKey': ['Environment'],
                    'TagValue': [self.environment]
                }
            }
            
            # Budget notifications
            notifications = [
                {
                    'Notification': {
                        'NotificationType': 'ACTUAL',
                        'ComparisonOperator': 'GREATER_THAN',
                        'Threshold': 80,
                        'ThresholdType': 'PERCENTAGE'
                    },
                    'Subscribers': [
                        {
                            'SubscriptionType': 'EMAIL',
                            'Address': 'admin@medeez.com'
                        }
                    ]
                },
                {
                    'Notification': {
                        'NotificationType': 'FORECASTED',
                        'ComparisonOperator': 'GREATER_THAN',
                        'Threshold': 100,
                        'ThresholdType': 'PERCENTAGE'
                    },
                    'Subscribers': [
                        {
                            'SubscriptionType': 'EMAIL',
                            'Address': 'admin@medeez.com'
                        }
                    ]
                }
            ]
            
            if not self.dry_run:
                budgets_client.create_budget(
                    AccountId=boto3.client('sts').get_caller_identity()['Account'],
                    Budget=budget,
                    NotificationsWithSubscribers=notifications
                )
                results['actions'].append(f"Created cost budget: {budget_name}")
            else:
                results['actions'].append(f"[DRY RUN] Would create cost budget: {budget_name}")
                
        except Exception as e:
            logger.error(f"Error creating cost budget: {e}")
        
        return results
    
    def run_optimization(self) -> Dict[str, Any]:
        """Run all cost optimization tasks"""
        logger.info(f"Starting cost optimization for environment: {self.environment}")
        logger.info(f"Dry run mode: {self.dry_run}")
        
        optimization_results = {
            'environment': self.environment,
            'dry_run': self.dry_run,
            'timestamp': datetime.datetime.now().isoformat(),
            'optimizations': {},
            'total_estimated_savings': 0,
            'summary': []
        }
        
        # Run optimizations
        optimizations = [
            ('S3 Storage', self.optimize_s3_storage),
            ('DynamoDB', self.optimize_dynamodb),
            ('Lambda Functions', self.optimize_lambda_functions),
            ('CloudFront', self.optimize_cloudfront)
        ]
        
        for name, optimization_func in optimizations:
            logger.info(f"Running {name} optimization...")
            try:
                result = optimization_func()
                optimization_results['optimizations'][name] = result
                optimization_results['total_estimated_savings'] += result['savings']
                
                if result['actions']:
                    optimization_results['summary'].append(
                        f"{name}: {len(result['actions'])} actions, ${result['savings']}/month estimated savings"
                    )
            except Exception as e:
                logger.error(f"Error in {name} optimization: {e}")
                optimization_results['optimizations'][name] = {
                    'error': str(e),
                    'actions': [],
                    'savings': 0
                }
        
        # Create cost budget
        if self.environment == 'prod':
            monthly_limit = 2000
        elif self.environment == 'staging':
            monthly_limit = 500
        else:
            monthly_limit = 200
        
        budget_result = self.create_cost_budget(monthly_limit)
        optimization_results['optimizations']['Cost Budget'] = budget_result
        
        logger.info(f"Optimization complete. Total estimated savings: ${optimization_results['total_estimated_savings']}/month")
        
        return optimization_results

def main():
    parser = argparse.ArgumentParser(description='AWS Cost Optimization for Medeez')
    parser.add_argument('--environment', required=True, choices=['dev', 'staging', 'prod'],
                       help='Environment to optimize')
    parser.add_argument('--execute', action='store_true',
                       help='Execute optimizations (default is dry run)')
    parser.add_argument('--output', help='Output file for results')
    
    args = parser.parse_args()
    
    optimizer = CostOptimizer(args.environment, dry_run=not args.execute)
    results = optimizer.run_optimization()
    
    # Output results
    output = json.dumps(results, indent=2)
    
    if args.output:
        with open(args.output, 'w') as f:
            f.write(output)
        print(f"Results saved to {args.output}")
    else:
        print(output)

if __name__ == '__main__':
    main()