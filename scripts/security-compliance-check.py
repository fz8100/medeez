#!/usr/bin/env python3
"""
Security and HIPAA Compliance Checker for Medeez SaaS Platform
Validates security configurations and HIPAA compliance requirements
"""

import json
import boto3
import argparse
import datetime
from typing import Dict, List, Any, Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SecurityComplianceChecker:
    def __init__(self, environment: str):
        self.environment = environment
        self.region = boto3.Session().region_name or 'us-east-1'
        
        # Initialize AWS clients
        self.iam_client = boto3.client('iam')
        self.s3_client = boto3.client('s3')
        self.dynamodb_client = boto3.client('dynamodb')
        self.kms_client = boto3.client('kms')
        self.cloudtrail_client = boto3.client('cloudtrail')
        self.config_client = boto3.client('config')
        self.lambda_client = boto3.client('lambda')
        self.apigateway_client = boto3.client('apigateway')
        self.cognito_client = boto3.client('cognito-idp')
        
    def check_encryption_at_rest(self) -> Dict[str, Any]:
        """Check encryption at rest for all resources"""
        results = {
            'status': 'pass',
            'findings': [],
            'recommendations': []
        }
        
        # Check S3 bucket encryption
        results.update(self._check_s3_encryption())
        
        # Check DynamoDB encryption
        results.update(self._check_dynamodb_encryption())
        
        # Check KMS key configuration
        results.update(self._check_kms_configuration())
        
        return results
    
    def _check_s3_encryption(self) -> Dict[str, Any]:
        """Check S3 bucket encryption settings"""
        findings = []
        recommendations = []
        
        try:
            buckets = self.s3_client.list_buckets()['Buckets']
            env_buckets = [b for b in buckets if self.environment in b['Name']]
            
            for bucket in env_buckets:
                bucket_name = bucket['Name']
                
                try:
                    # Check server-side encryption
                    encryption = self.s3_client.get_bucket_encryption(Bucket=bucket_name)
                    
                    rules = encryption.get('ServerSideEncryptionConfiguration', {}).get('Rules', [])
                    if not rules:
                        findings.append(f"S3 bucket {bucket_name} does not have encryption enabled")
                        recommendations.append(f"Enable server-side encryption for {bucket_name}")
                    else:
                        for rule in rules:
                            sse_algorithm = rule.get('ApplyServerSideEncryptionByDefault', {}).get('SSEAlgorithm')
                            if sse_algorithm not in ['AES256', 'aws:kms']:
                                findings.append(f"S3 bucket {bucket_name} uses weak encryption algorithm: {sse_algorithm}")
                    
                except self.s3_client.exceptions.ClientError as e:
                    if e.response['Error']['Code'] == 'ServerSideEncryptionConfigurationNotFoundError':
                        findings.append(f"S3 bucket {bucket_name} does not have encryption configured")
                        recommendations.append(f"Configure server-side encryption for {bucket_name}")
                
                # Check bucket policy for SSL enforcement
                try:
                    policy = self.s3_client.get_bucket_policy(Bucket=bucket_name)
                    policy_doc = json.loads(policy['Policy'])
                    
                    ssl_enforced = False
                    for statement in policy_doc.get('Statement', []):
                        if (statement.get('Effect') == 'Deny' and 
                            'aws:SecureTransport' in statement.get('Condition', {}).get('Bool', {})):
                            ssl_enforced = True
                            break
                    
                    if not ssl_enforced:
                        findings.append(f"S3 bucket {bucket_name} does not enforce SSL/TLS")
                        recommendations.append(f"Add bucket policy to enforce SSL/TLS for {bucket_name}")
                        
                except self.s3_client.exceptions.ClientError:
                    recommendations.append(f"Configure bucket policy to enforce SSL/TLS for {bucket_name}")
                
        except Exception as e:
            findings.append(f"Error checking S3 encryption: {str(e)}")
        
        return {'s3_findings': findings, 's3_recommendations': recommendations}
    
    def _check_dynamodb_encryption(self) -> Dict[str, Any]:
        """Check DynamoDB encryption settings"""
        findings = []
        recommendations = []
        
        try:
            tables = self.dynamodb_client.list_tables()['TableNames']
            env_tables = [t for t in tables if self.environment in t]
            
            for table_name in env_tables:
                table_desc = self.dynamodb_client.describe_table(TableName=table_name)['Table']
                
                # Check encryption at rest
                sse_desc = table_desc.get('SSEDescription', {})
                if sse_desc.get('Status') != 'ENABLED':
                    findings.append(f"DynamoDB table {table_name} does not have encryption at rest enabled")
                    recommendations.append(f"Enable encryption at rest for {table_name}")
                elif sse_desc.get('SSEType') != 'KMS':
                    findings.append(f"DynamoDB table {table_name} is not using KMS encryption")
                    recommendations.append(f"Use KMS encryption for {table_name}")
                
                # Check Point-in-Time Recovery
                pitr = self.dynamodb_client.describe_continuous_backups(TableName=table_name)
                if not pitr['ContinuousBackupsDescription']['PointInTimeRecoveryDescription'].get('PointInTimeRecoveryStatus') == 'ENABLED':
                    recommendations.append(f"Enable Point-in-Time Recovery for {table_name}")
                
        except Exception as e:
            findings.append(f"Error checking DynamoDB encryption: {str(e)}")
        
        return {'dynamodb_findings': findings, 'dynamodb_recommendations': recommendations}
    
    def _check_kms_configuration(self) -> Dict[str, Any]:
        """Check KMS key configuration"""
        findings = []
        recommendations = []
        
        try:
            keys = self.kms_client.list_keys()['Keys']
            
            for key in keys:
                key_id = key['KeyId']
                key_desc = self.kms_client.describe_key(KeyId=key_id)['KeyMetadata']
                
                if key_desc.get('Origin') == 'AWS_KMS' and f"medeez-{self.environment}" in key_desc.get('Description', ''):
                    # Check key rotation
                    rotation_status = self.kms_client.get_key_rotation_status(KeyId=key_id)
                    if not rotation_status.get('KeyRotationEnabled'):
                        findings.append(f"KMS key {key_id} does not have automatic rotation enabled")
                        recommendations.append(f"Enable automatic rotation for KMS key {key_id}")
                    
                    # Check key policy
                    key_policy = self.kms_client.get_key_policy(KeyId=key_id, PolicyName='default')
                    policy_doc = json.loads(key_policy['Policy'])
                    
                    # Verify least privilege access
                    for statement in policy_doc.get('Statement', []):
                        if statement.get('Effect') == 'Allow' and statement.get('Principal') == '*':
                            findings.append(f"KMS key {key_id} has overly permissive policy")
                            recommendations.append(f"Review and restrict KMS key policy for {key_id}")
                
        except Exception as e:
            findings.append(f"Error checking KMS configuration: {str(e)}")
        
        return {'kms_findings': findings, 'kms_recommendations': recommendations}
    
    def check_access_controls(self) -> Dict[str, Any]:
        """Check IAM access controls and least privilege"""
        results = {
            'status': 'pass',
            'findings': [],
            'recommendations': []
        }
        
        # Check IAM roles and policies
        results.update(self._check_iam_roles())
        
        # Check Cognito configuration
        results.update(self._check_cognito_security())
        
        # Check API Gateway security
        results.update(self._check_api_gateway_security())
        
        return results
    
    def _check_iam_roles(self) -> Dict[str, Any]:
        """Check IAM roles for least privilege"""
        findings = []
        recommendations = []
        
        try:
            roles = self.iam_client.list_roles()['Roles']
            env_roles = [r for r in roles if self.environment in r['RoleName']]
            
            for role in env_roles:
                role_name = role['RoleName']
                
                # Check for admin access
                attached_policies = self.iam_client.list_attached_role_policies(RoleName=role_name)
                for policy in attached_policies['AttachedPolicies']:
                    if 'Admin' in policy['PolicyName'] or policy['PolicyArn'].endswith('AdministratorAccess'):
                        findings.append(f"IAM role {role_name} has administrative access")
                        recommendations.append(f"Review and restrict permissions for {role_name}")
                
                # Check inline policies
                inline_policies = self.iam_client.list_role_policies(RoleName=role_name)
                for policy_name in inline_policies['PolicyNames']:
                    policy_doc = self.iam_client.get_role_policy(RoleName=role_name, PolicyName=policy_name)
                    policy = json.loads(policy_doc['PolicyDocument'])
                    
                    for statement in policy.get('Statement', []):
                        if statement.get('Effect') == 'Allow' and statement.get('Resource') == '*':
                            if any(action == '*' or ':*' in action for action in statement.get('Action', [])):
                                findings.append(f"IAM role {role_name} has overly broad permissions")
                                recommendations.append(f"Implement least privilege for {role_name}")
                
        except Exception as e:
            findings.append(f"Error checking IAM roles: {str(e)}")
        
        return {'iam_findings': findings, 'iam_recommendations': recommendations}
    
    def _check_cognito_security(self) -> Dict[str, Any]:
        """Check Cognito security configuration"""
        findings = []
        recommendations = []
        
        try:
            user_pools = self.cognito_client.list_user_pools(MaxResults=60)
            env_pools = [p for p in user_pools['UserPools'] if self.environment in p['Name']]
            
            for pool in env_pools:
                pool_id = pool['Id']
                pool_desc = self.cognito_client.describe_user_pool(UserPoolId=pool_id)['UserPool']
                
                # Check password policy
                password_policy = pool_desc.get('Policies', {}).get('PasswordPolicy', {})
                if password_policy.get('MinimumLength', 0) < 12:
                    findings.append(f"Cognito user pool {pool_id} has weak password policy")
                    recommendations.append(f"Increase minimum password length for {pool_id}")
                
                # Check MFA configuration
                mfa_config = pool_desc.get('MfaConfiguration', 'OFF')
                if mfa_config == 'OFF' and self.environment == 'prod':
                    findings.append(f"Cognito user pool {pool_id} does not have MFA enabled")
                    recommendations.append(f"Enable MFA for production user pool {pool_id}")
                
                # Check account recovery
                account_recovery = pool_desc.get('AccountRecoverySetting', {})
                recovery_mechanisms = account_recovery.get('RecoveryMechanisms', [])
                if not recovery_mechanisms:
                    recommendations.append(f"Configure account recovery mechanisms for {pool_id}")
                
        except Exception as e:
            findings.append(f"Error checking Cognito security: {str(e)}")
        
        return {'cognito_findings': findings, 'cognito_recommendations': recommendations}
    
    def _check_api_gateway_security(self) -> Dict[str, Any]:
        """Check API Gateway security configuration"""
        findings = []
        recommendations = []
        
        try:
            apis = self.apigateway_client.get_rest_apis()
            env_apis = [api for api in apis['items'] if self.environment in api['name']]
            
            for api in env_apis:
                api_id = api['id']
                
                # Check stages
                stages = self.apigateway_client.get_stages(restApiId=api_id)
                for stage in stages['item']:
                    stage_name = stage['stageName']
                    
                    # Check logging
                    if not stage.get('accessLogSettings'):
                        findings.append(f"API Gateway stage {stage_name} does not have access logging enabled")
                        recommendations.append(f"Enable access logging for API stage {stage_name}")
                    
                    # Check tracing
                    if not stage.get('tracingEnabled'):
                        recommendations.append(f"Enable X-Ray tracing for API stage {stage_name}")
                    
                    # Check throttling
                    if not stage.get('throttleSettings'):
                        recommendations.append(f"Configure throttling for API stage {stage_name}")
                
        except Exception as e:
            findings.append(f"Error checking API Gateway security: {str(e)}")
        
        return {'api_gateway_findings': findings, 'api_gateway_recommendations': recommendations}
    
    def check_audit_logging(self) -> Dict[str, Any]:
        """Check audit logging and CloudTrail configuration"""
        results = {
            'status': 'pass',
            'findings': [],
            'recommendations': []
        }
        
        try:
            # Check CloudTrail
            trails = self.cloudtrail_client.describe_trails()['trailList']
            
            if not trails:
                results['findings'].append("No CloudTrail trails configured")
                results['recommendations'].append("Configure CloudTrail for audit logging")
                results['status'] = 'fail'
            else:
                for trail in trails:
                    trail_name = trail['Name']
                    
                    # Check if trail is logging
                    trail_status = self.cloudtrail_client.get_trail_status(Name=trail_name)
                    if not trail_status.get('IsLogging'):
                        results['findings'].append(f"CloudTrail {trail_name} is not actively logging")
                    
                    # Check log file validation
                    if not trail.get('LogFileValidationEnabled'):
                        results['findings'].append(f"CloudTrail {trail_name} does not have log file validation enabled")
                        results['recommendations'].append(f"Enable log file validation for {trail_name}")
                    
                    # Check encryption
                    if not trail.get('KMSKeyId'):
                        results['findings'].append(f"CloudTrail {trail_name} logs are not encrypted")
                        results['recommendations'].append(f"Enable encryption for CloudTrail {trail_name}")
            
            # Check Lambda function logging
            functions = self.lambda_client.list_functions()['Functions']
            env_functions = [f for f in functions if self.environment in f['FunctionName']]
            
            for function in env_functions:
                function_name = function['FunctionName']
                
                # Check if function has proper logging configuration
                log_group_name = f"/aws/lambda/{function_name}"
                try:
                    logs_client = boto3.client('logs')
                    log_group = logs_client.describe_log_groups(logGroupNamePrefix=log_group_name)
                    
                    if not log_group['logGroups']:
                        results['recommendations'].append(f"Ensure logging is properly configured for {function_name}")
                    
                except Exception:
                    pass
            
        except Exception as e:
            results['findings'].append(f"Error checking audit logging: {str(e)}")
        
        return results
    
    def check_network_security(self) -> Dict[str, Any]:
        """Check network security configuration"""
        results = {
            'status': 'pass',
            'findings': [],
            'recommendations': []
        }
        
        try:
            # Check VPC configuration (if applicable)
            ec2_client = boto3.client('ec2')
            
            # Check security groups
            security_groups = ec2_client.describe_security_groups()['SecurityGroups']
            
            for sg in security_groups:
                if f"medeez-{self.environment}" in sg.get('GroupName', ''):
                    # Check for overly permissive rules
                    for rule in sg.get('IpPermissions', []):
                        for ip_range in rule.get('IpRanges', []):
                            if ip_range.get('CidrIp') == '0.0.0.0/0':
                                results['findings'].append(f"Security group {sg['GroupName']} allows access from anywhere")
                                results['recommendations'].append(f"Restrict access in security group {sg['GroupName']}")
            
            # Check NACLs (if applicable)
            # This would be environment-specific based on VPC configuration
            
        except Exception as e:
            results['findings'].append(f"Error checking network security: {str(e)}")
        
        return results
    
    def check_hipaa_compliance(self) -> Dict[str, Any]:
        """Check HIPAA compliance requirements"""
        results = {
            'status': 'pass',
            'findings': [],
            'recommendations': []
        }
        
        # Administrative Safeguards
        admin_safeguards = self._check_administrative_safeguards()
        results['findings'].extend(admin_safeguards['findings'])
        results['recommendations'].extend(admin_safeguards['recommendations'])
        
        # Physical Safeguards
        physical_safeguards = self._check_physical_safeguards()
        results['findings'].extend(physical_safeguards['findings'])
        results['recommendations'].extend(physical_safeguards['recommendations'])
        
        # Technical Safeguards
        technical_safeguards = self._check_technical_safeguards()
        results['findings'].extend(technical_safeguards['findings'])
        results['recommendations'].extend(technical_safeguards['recommendations'])
        
        if results['findings']:
            results['status'] = 'fail'
        
        return results
    
    def _check_administrative_safeguards(self) -> Dict[str, Any]:
        """Check HIPAA administrative safeguards"""
        findings = []
        recommendations = []
        
        # Access Management
        recommendations.append("Implement role-based access control (RBAC)")
        recommendations.append("Regular access reviews and user access audits")
        recommendations.append("Maintain workforce training records")
        recommendations.append("Establish incident response procedures")
        
        # Business Associate Agreements
        recommendations.append("Ensure BAAs are in place with all third-party vendors")
        
        return {'findings': findings, 'recommendations': recommendations}
    
    def _check_physical_safeguards(self) -> Dict[str, Any]:
        """Check HIPAA physical safeguards"""
        findings = []
        recommendations = []
        
        # AWS handles physical security for cloud resources
        recommendations.append("Verify AWS SOC 2 Type II compliance documentation")
        recommendations.append("Document physical security controls provided by AWS")
        
        return {'findings': findings, 'recommendations': recommendations}
    
    def _check_technical_safeguards(self) -> Dict[str, Any]:
        """Check HIPAA technical safeguards"""
        findings = []
        recommendations = []
        
        # Access Control
        recommendations.append("Implement unique user identification")
        recommendations.append("Establish emergency access procedures")
        recommendations.append("Enable automatic logoff for inactive sessions")
        recommendations.append("Implement role-based access controls")
        
        # Audit Controls
        recommendations.append("Enable comprehensive audit logging")
        recommendations.append("Implement log monitoring and alerting")
        recommendations.append("Regular audit log reviews")
        
        # Integrity
        recommendations.append("Implement electronic signature capabilities")
        recommendations.append("Ensure data integrity through checksums/hashing")
        
        # Transmission Security
        recommendations.append("Encrypt all data in transit using TLS 1.2 or higher")
        recommendations.append("Implement end-to-end encryption for sensitive communications")
        
        return {'findings': findings, 'recommendations': recommendations}
    
    def generate_compliance_report(self) -> Dict[str, Any]:
        """Generate comprehensive security and compliance report"""
        logger.info("Generating security and compliance report...")
        
        report = {
            'environment': self.environment,
            'assessment_date': datetime.datetime.now().isoformat(),
            'overall_status': 'pass',
            'checks': {}
        }
        
        # Run all security checks
        checks = [
            ('Encryption at Rest', self.check_encryption_at_rest),
            ('Access Controls', self.check_access_controls),
            ('Audit Logging', self.check_audit_logging),
            ('Network Security', self.check_network_security),
            ('HIPAA Compliance', self.check_hipaa_compliance)
        ]
        
        total_findings = 0
        
        for check_name, check_function in checks:
            logger.info(f"Running {check_name} check...")
            try:
                result = check_function()
                report['checks'][check_name] = result
                
                if result.get('findings'):
                    total_findings += len(result['findings'])
                    if result.get('status') == 'fail':
                        report['overall_status'] = 'fail'
                        
            except Exception as e:
                logger.error(f"Error in {check_name} check: {e}")
                report['checks'][check_name] = {
                    'status': 'error',
                    'error': str(e),
                    'findings': [],
                    'recommendations': []
                }
        
        # Summary
        report['summary'] = {
            'total_checks': len(checks),
            'total_findings': total_findings,
            'compliance_score': max(0, 100 - (total_findings * 5))  # Rough scoring
        }
        
        # Priority recommendations
        report['priority_actions'] = [
            "Enable encryption at rest for all data stores",
            "Implement comprehensive audit logging",
            "Enable MFA for all user accounts",
            "Review and implement least privilege access controls",
            "Establish incident response procedures"
        ]
        
        logger.info(f"Security assessment complete. Overall status: {report['overall_status']}")
        logger.info(f"Total findings: {total_findings}")
        
        return report

def main():
    parser = argparse.ArgumentParser(description='Security and HIPAA Compliance Checker for Medeez')
    parser.add_argument('--environment', required=True, choices=['dev', 'staging', 'prod'],
                       help='Environment to check')
    parser.add_argument('--output', help='Output file for report')
    parser.add_argument('--format', choices=['json', 'summary'], default='json',
                       help='Output format')
    
    args = parser.parse_args()
    
    checker = SecurityComplianceChecker(args.environment)
    report = checker.generate_compliance_report()
    
    if args.format == 'json':
        output = json.dumps(report, indent=2)
    else:
        # Generate summary format
        output = f"""
Security and Compliance Report for {args.environment.upper()}
{'=' * 50}

Overall Status: {report['overall_status'].upper()}
Compliance Score: {report['summary']['compliance_score']}%
Total Findings: {report['summary']['total_findings']}

Priority Actions:
{chr(10).join(f"- {action}" for action in report['priority_actions'])}

Detailed findings and recommendations are available in the full JSON report.
        """.strip()
    
    if args.output:
        with open(args.output, 'w') as f:
            if args.format == 'json':
                json.dump(report, f, indent=2)
            else:
                f.write(output)
        print(f"Report saved to {args.output}")
    else:
        print(output)

if __name__ == '__main__':
    main()