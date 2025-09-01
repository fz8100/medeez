import * as cdk from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { EnvironmentConfig } from './config';
interface SecurityStackProps extends cdk.StackProps {
    environment: string;
    config: EnvironmentConfig;
}
export declare class SecurityStack extends cdk.Stack {
    readonly kmsKey: kms.Key;
    readonly apiRole: iam.Role;
    readonly secrets: Record<string, secretsmanager.Secret>;
    constructor(scope: Construct, id: string, props: SecurityStackProps);
    private createSecrets;
    private createWebAcl;
    private createIPWhitelist;
}
export {};
