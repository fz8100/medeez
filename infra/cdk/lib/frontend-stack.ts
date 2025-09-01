import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3Deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { EnvironmentConfig } from './config';

interface FrontendStackProps extends cdk.StackProps {
  environment: string;
  config: EnvironmentConfig;
  apiUrl: string;
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
}

export class FrontendStack extends cdk.Stack {
  public readonly cloudFrontDistribution: cloudfront.Distribution;
  public readonly webUrl: string;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const { environment, config, apiUrl, userPool, userPoolClient } = props;

    // S3 Bucket for static assets
    const staticAssetsBucket = new s3.Bucket(this, 'StaticAssetsBucket', {
      bucketName: `medeez-${environment}-static-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      lifecycleRules: [
        {
          id: 'DeleteOldVersions',
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
      ],
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Origin Access Control for CloudFront
    const originAccessControl = new cloudfront.S3OriginAccessControl(this, 'OAC', {
      description: `OAC for ${environment} static assets`,
    });

    // CloudFront Cache Policies
    const staticAssetsCachePolicy = new cloudfront.CachePolicy(this, 'StaticAssetsCachePolicy', {
      cachePolicyName: `medeez-${environment}-static-assets`,
      defaultTtl: cdk.Duration.days(1),
      maxTtl: cdk.Duration.days(365),
      minTtl: cdk.Duration.seconds(0),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    const dynamicContentCachePolicy = new cloudfront.CachePolicy(this, 'DynamicContentCachePolicy', {
      cachePolicyName: `medeez-${environment}-dynamic-content`,
      defaultTtl: cdk.Duration.minutes(0),
      maxTtl: cdk.Duration.days(1),
      minTtl: cdk.Duration.seconds(0),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList(
        'Authorization',
        'CloudFront-Viewer-Country',
        'CloudFront-Is-Mobile-Viewer',
        'CloudFront-Is-Tablet-Viewer',
        'CloudFront-Is-Desktop-Viewer'
      ),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      cookieBehavior: cloudfront.CacheCookieBehavior.allowList(
        'next-auth.session-token',
        'next-auth.callback-url',
        'next-auth.csrf-token'
      ),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    // Response Headers Policy
    const securityHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeadersPolicy', {
      responseHeadersPolicyName: `medeez-${environment}-security-headers`,
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.seconds(31536000),
          includeSubdomains: true,
          override: false,
        },
        contentTypeOptions: {
          override: false,
        },
        frameOptions: {
          frameOption: cloudfront.HeadersFrameOption.DENY,
          override: false,
        },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: false,
        },
      },
    });

    // CloudFront Distribution
    let certificate: acm.ICertificate | undefined;
    let domainNames: string[] | undefined;

    if (config.certificateArn) {
      certificate = acm.Certificate.fromCertificateArn(this, 'Certificate', config.certificateArn);
      domainNames = [
        config.domainName!,
        `www.${config.domainName}`,
        `book.${config.domainName}`,
      ];
    }

    this.cloudFrontDistribution = new cloudfront.Distribution(this, 'Distribution', {
      domainNames,
      certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      sslSupportMethod: cloudfront.SSLMethod.SNI,
      priceClass: environment === 'prod' ? cloudfront.PriceClass.PRICE_CLASS_ALL : cloudfront.PriceClass.PRICE_CLASS_100,
      enableIpv6: true,
      comment: `Medeez ${environment} CloudFront Distribution`,
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/404.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
      defaultBehavior: {
        origin: cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(staticAssetsBucket, {
          originAccessControl,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: dynamicContentCachePolicy,
        responseHeadersPolicy: securityHeadersPolicy,
        compress: true,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
      },
      additionalBehaviors: {
        '/_next/static/*': {
          origin: cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(staticAssetsBucket, {
            originAccessControl,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: staticAssetsCachePolicy,
          responseHeadersPolicy: securityHeadersPolicy,
          compress: true,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        },
        '/static/*': {
          origin: cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(staticAssetsBucket, {
            originAccessControl,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: staticAssetsCachePolicy,
          responseHeadersPolicy: securityHeadersPolicy,
          compress: true,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        },
        '/api/*': {
          origin: new cloudfrontOrigins.HttpOrigin(apiUrl.replace('https://', '').replace('/api/v1', '')),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        },
      },
    });

    // Update S3 bucket policy for CloudFront OAC
    staticAssetsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        actions: ['s3:GetObject'],
        resources: [`${staticAssetsBucket.bucketArn}/*`],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${this.cloudFrontDistribution.distributionId}`,
          },
        },
      })
    );

    // Placeholder for static web assets deployment
    // In production, this would be handled by a separate deployment process
    const placeholderHtml = `<!DOCTYPE html>
    <html>
    <head>
      <title>Medeez - Medical Practice Management</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        h1 { color: #2c3e50; }
        p { color: #7f8c8d; }
      </style>
    </head>
    <body>
      <h1>Medeez Infrastructure Deployed Successfully</h1>
      <p>Environment: ${environment}</p>
      <p>API URL: ${apiUrl}</p>
      <p>The web application will be deployed separately.</p>
    </body>
    </html>`;

    new s3Deploy.BucketDeployment(this, 'DeployPlaceholderSite', {
      sources: [s3Deploy.Source.data('index.html', placeholderHtml)],
      destinationBucket: staticAssetsBucket,
      distribution: this.cloudFrontDistribution,
      distributionPaths: ['/*'],
    });

    // Route53 Records
    if (config.domainName && config.hostedZoneId) {
      const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
        hostedZoneId: config.hostedZoneId,
        zoneName: config.domainName,
      });

      // Main domain
      new route53.ARecord(this, 'AliasRecord', {
        zone: hostedZone,
        recordName: environment === 'prod' ? '' : environment,
        target: route53.RecordTarget.fromAlias(
          new route53targets.CloudFrontTarget(this.cloudFrontDistribution)
        ),
      });

      // WWW subdomain
      if (environment === 'prod') {
        new route53.ARecord(this, 'WWWAliasRecord', {
          zone: hostedZone,
          recordName: 'www',
          target: route53.RecordTarget.fromAlias(
            new route53targets.CloudFrontTarget(this.cloudFrontDistribution)
          ),
        });
      }

      // Book subdomain for public booking
      new route53.ARecord(this, 'BookingAliasRecord', {
        zone: hostedZone,
        recordName: `book${environment === 'prod' ? '' : `-${environment}`}`,
        target: route53.RecordTarget.fromAlias(
          new route53targets.CloudFrontTarget(this.cloudFrontDistribution)
        ),
      });

      this.webUrl = `https://${config.domainName}`;
    } else {
      this.webUrl = `https://${this.cloudFrontDistribution.distributionDomainName}`;
    }

    // Store configuration in Parameter Store
    new ssm.StringParameter(this, 'WebUrlParameter', {
      parameterName: `/medeez/${environment}/web-url`,
      stringValue: this.webUrl,
      description: 'Web application URL',
    });

    new ssm.StringParameter(this, 'CloudFrontDistributionIdParameter', {
      parameterName: `/medeez/${environment}/cloudfront/distribution-id`,
      stringValue: this.cloudFrontDistribution.distributionId,
      description: 'CloudFront Distribution ID',
    });

    // Outputs
    new cdk.CfnOutput(this, 'WebUrl', {
      value: this.webUrl,
      description: 'Web application URL',
      exportName: `MedeezWebUrl-${environment}`,
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.cloudFrontDistribution.distributionId,
      description: 'CloudFront Distribution ID',
      exportName: `MedeezCloudFrontDistributionId-${environment}`,
    });

    new cdk.CfnOutput(this, 'StaticAssetsBucketName', {
      value: staticAssetsBucket.bucketName,
      description: 'Static assets S3 bucket name',
      exportName: `MedeezStaticAssetsBucketName-${environment}`,
    });
  }
}