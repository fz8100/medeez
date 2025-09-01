"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FrontendStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const cloudfront = __importStar(require("aws-cdk-lib/aws-cloudfront"));
const cloudfrontOrigins = __importStar(require("aws-cdk-lib/aws-cloudfront-origins"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const s3Deploy = __importStar(require("aws-cdk-lib/aws-s3-deployment"));
const acm = __importStar(require("aws-cdk-lib/aws-certificatemanager"));
const route53 = __importStar(require("aws-cdk-lib/aws-route53"));
const route53targets = __importStar(require("aws-cdk-lib/aws-route53-targets"));
const ssm = __importStar(require("aws-cdk-lib/aws-ssm"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
class FrontendStack extends cdk.Stack {
    constructor(scope, id, props) {
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
            headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Authorization', 'CloudFront-Viewer-Country', 'CloudFront-Is-Mobile-Viewer', 'CloudFront-Is-Tablet-Viewer', 'CloudFront-Is-Desktop-Viewer'),
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
            cookieBehavior: cloudfront.CacheCookieBehavior.allowList('next-auth.session-token', 'next-auth.callback-url', 'next-auth.csrf-token'),
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
        let certificate;
        let domainNames;
        if (config.certificateArn) {
            certificate = acm.Certificate.fromCertificateArn(this, 'Certificate', config.certificateArn);
            domainNames = [
                config.domainName,
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
        staticAssetsBucket.addToResourcePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
            actions: ['s3:GetObject'],
            resources: [`${staticAssetsBucket.bucketArn}/*`],
            conditions: {
                StringEquals: {
                    'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${this.cloudFrontDistribution.distributionId}`,
                },
            },
        }));
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
                target: route53.RecordTarget.fromAlias(new route53targets.CloudFrontTarget(this.cloudFrontDistribution)),
            });
            // WWW subdomain
            if (environment === 'prod') {
                new route53.ARecord(this, 'WWWAliasRecord', {
                    zone: hostedZone,
                    recordName: 'www',
                    target: route53.RecordTarget.fromAlias(new route53targets.CloudFrontTarget(this.cloudFrontDistribution)),
                });
            }
            // Book subdomain for public booking
            new route53.ARecord(this, 'BookingAliasRecord', {
                zone: hostedZone,
                recordName: `book${environment === 'prod' ? '' : `-${environment}`}`,
                target: route53.RecordTarget.fromAlias(new route53targets.CloudFrontTarget(this.cloudFrontDistribution)),
            });
            this.webUrl = `https://${config.domainName}`;
        }
        else {
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
exports.FrontendStack = FrontendStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZnJvbnRlbmQtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9mcm9udGVuZC1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdUVBQXlEO0FBQ3pELHNGQUF3RTtBQUN4RSx1REFBeUM7QUFDekMsd0VBQTBEO0FBQzFELHdFQUEwRDtBQUMxRCxpRUFBbUQ7QUFDbkQsZ0ZBQWtFO0FBRWxFLHlEQUEyQztBQUMzQyx5REFBMkM7QUFZM0MsTUFBYSxhQUFjLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFJMUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUF5QjtRQUNqRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsV0FBVyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLGNBQWMsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUV4RSw4QkFBOEI7UUFDOUIsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQ25FLFVBQVUsRUFBRSxVQUFVLFdBQVcsV0FBVyxJQUFJLENBQUMsT0FBTyxFQUFFO1lBQzFELGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTO1lBQ2pELFVBQVUsRUFBRSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsVUFBVTtZQUMxQyxTQUFTLEVBQUUsSUFBSTtZQUNmLGNBQWMsRUFBRTtnQkFDZDtvQkFDRSxFQUFFLEVBQUUsbUJBQW1CO29CQUN2QiwyQkFBMkIsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7aUJBQ25EO2FBQ0Y7WUFDRCxhQUFhLEVBQUUsV0FBVyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLGFB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QUFDLE1BQU07WUFDbEIsV0FBVyxFQUFFLHFCQUFxQjtZQUNsQyxVQUFVLEVBQUUsZ0JBQWdCLFdBQVcsRUFBRTtTQUMxQyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLDBCQUEwQixFQUFFO1lBQ2xELEtBQUssRUFBRSxJQUFJLENBQUMsc0JBQXNCLENBQUMsY0FBYztZQUNqRCxXQUFXLEVBQUUsNEJBQTRCO1lBQ3pDLFVBQVUsRUFBRSxrQ0FBa0MsV0FBVyxFQUFFO1NBQzVELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsd0JBQXdCLEVBQUU7WUFDaEQsS0FBSyxFQUFFLGtCQUFrQixDQUFDLFVBQVU7WUFDcEMsV0FBVyxFQUFFLDhCQUE4QjtZQUMzQyxVQUFVLEVBQUUsZ0NBQWdDLFdBQVcsRUFBRTtTQUMxRCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF6UkQsc0NBeVJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGNsb3VkZnJvbnQgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQnO1xuaW1wb3J0ICogYXMgY2xvdWRmcm9udE9yaWdpbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQtb3JpZ2lucyc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgczNEZXBsb3kgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzLWRlcGxveW1lbnQnO1xuaW1wb3J0ICogYXMgYWNtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jZXJ0aWZpY2F0ZW1hbmFnZXInO1xuaW1wb3J0ICogYXMgcm91dGU1MyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1Myc7XG5pbXBvcnQgKiBhcyByb3V0ZTUzdGFyZ2V0cyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1My10YXJnZXRzJztcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xuaW1wb3J0ICogYXMgc3NtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zc20nO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgeyBFbnZpcm9ubWVudENvbmZpZyB9IGZyb20gJy4vY29uZmlnJztcblxuaW50ZXJmYWNlIEZyb250ZW5kU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcbiAgY29uZmlnOiBFbnZpcm9ubWVudENvbmZpZztcbiAgYXBpVXJsOiBzdHJpbmc7XG4gIHVzZXJQb29sOiBjb2duaXRvLlVzZXJQb29sO1xuICB1c2VyUG9vbENsaWVudDogY29nbml0by5Vc2VyUG9vbENsaWVudDtcbn1cblxuZXhwb3J0IGNsYXNzIEZyb250ZW5kU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkgY2xvdWRGcm9udERpc3RyaWJ1dGlvbjogY2xvdWRmcm9udC5EaXN0cmlidXRpb247XG4gIHB1YmxpYyByZWFkb25seSB3ZWJVcmw6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogRnJvbnRlbmRTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCB7IGVudmlyb25tZW50LCBjb25maWcsIGFwaVVybCwgdXNlclBvb2wsIHVzZXJQb29sQ2xpZW50IH0gPSBwcm9wcztcblxuICAgIC8vIFMzIEJ1Y2tldCBmb3Igc3RhdGljIGFzc2V0c1xuICAgIGNvbnN0IHN0YXRpY0Fzc2V0c0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ1N0YXRpY0Fzc2V0c0J1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGBtZWRlZXotJHtlbnZpcm9ubWVudH0tc3RhdGljLSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnRGVsZXRlT2xkVmVyc2lvbnMnLFxuICAgICAgICAgIG5vbmN1cnJlbnRWZXJzaW9uRXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gT3JpZ2luIEFjY2VzcyBDb250cm9sIGZvciBDbG91ZEZyb250XG4gICAgY29uc3Qgb3JpZ2luQWNjZXNzQ29udHJvbCA9IG5ldyBjbG91ZGZyb250LlMzT3JpZ2luQWNjZXNzQ29udHJvbCh0aGlzLCAnT0FDJywge1xuICAgICAgZGVzY3JpcHRpb246IGBPQUMgZm9yICR7ZW52aXJvbm1lbnR9IHN0YXRpYyBhc3NldHNgLFxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRGcm9udCBDYWNoZSBQb2xpY2llc1xuICAgIGNvbnN0IHN0YXRpY0Fzc2V0c0NhY2hlUG9saWN5ID0gbmV3IGNsb3VkZnJvbnQuQ2FjaGVQb2xpY3kodGhpcywgJ1N0YXRpY0Fzc2V0c0NhY2hlUG9saWN5Jywge1xuICAgICAgY2FjaGVQb2xpY3lOYW1lOiBgbWVkZWV6LSR7ZW52aXJvbm1lbnR9LXN0YXRpYy1hc3NldHNgLFxuICAgICAgZGVmYXVsdFR0bDogY2RrLkR1cmF0aW9uLmRheXMoMSksXG4gICAgICBtYXhUdGw6IGNkay5EdXJhdGlvbi5kYXlzKDM2NSksXG4gICAgICBtaW5UdGw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDApLFxuICAgICAgaGVhZGVyQmVoYXZpb3I6IGNsb3VkZnJvbnQuQ2FjaGVIZWFkZXJCZWhhdmlvci5ub25lKCksXG4gICAgICBxdWVyeVN0cmluZ0JlaGF2aW9yOiBjbG91ZGZyb250LkNhY2hlUXVlcnlTdHJpbmdCZWhhdmlvci5ub25lKCksXG4gICAgICBjb29raWVCZWhhdmlvcjogY2xvdWRmcm9udC5DYWNoZUNvb2tpZUJlaGF2aW9yLm5vbmUoKSxcbiAgICAgIGVuYWJsZUFjY2VwdEVuY29kaW5nR3ppcDogdHJ1ZSxcbiAgICAgIGVuYWJsZUFjY2VwdEVuY29kaW5nQnJvdGxpOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZHluYW1pY0NvbnRlbnRDYWNoZVBvbGljeSA9IG5ldyBjbG91ZGZyb250LkNhY2hlUG9saWN5KHRoaXMsICdEeW5hbWljQ29udGVudENhY2hlUG9saWN5Jywge1xuICAgICAgY2FjaGVQb2xpY3lOYW1lOiBgbWVkZWV6LSR7ZW52aXJvbm1lbnR9LWR5bmFtaWMtY29udGVudGAsXG4gICAgICBkZWZhdWx0VHRsOiBjZGsuRHVyYXRpb24ubWludXRlcygwKSxcbiAgICAgIG1heFR0bDogY2RrLkR1cmF0aW9uLmRheXMoMSksXG4gICAgICBtaW5UdGw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDApLFxuICAgICAgaGVhZGVyQmVoYXZpb3I6IGNsb3VkZnJvbnQuQ2FjaGVIZWFkZXJCZWhhdmlvci5hbGxvd0xpc3QoXG4gICAgICAgICdBdXRob3JpemF0aW9uJyxcbiAgICAgICAgJ0Nsb3VkRnJvbnQtVmlld2VyLUNvdW50cnknLFxuICAgICAgICAnQ2xvdWRGcm9udC1Jcy1Nb2JpbGUtVmlld2VyJyxcbiAgICAgICAgJ0Nsb3VkRnJvbnQtSXMtVGFibGV0LVZpZXdlcicsXG4gICAgICAgICdDbG91ZEZyb250LUlzLURlc2t0b3AtVmlld2VyJ1xuICAgICAgKSxcbiAgICAgIHF1ZXJ5U3RyaW5nQmVoYXZpb3I6IGNsb3VkZnJvbnQuQ2FjaGVRdWVyeVN0cmluZ0JlaGF2aW9yLmFsbCgpLFxuICAgICAgY29va2llQmVoYXZpb3I6IGNsb3VkZnJvbnQuQ2FjaGVDb29raWVCZWhhdmlvci5hbGxvd0xpc3QoXG4gICAgICAgICduZXh0LWF1dGguc2Vzc2lvbi10b2tlbicsXG4gICAgICAgICduZXh0LWF1dGguY2FsbGJhY2stdXJsJyxcbiAgICAgICAgJ25leHQtYXV0aC5jc3JmLXRva2VuJ1xuICAgICAgKSxcbiAgICAgIGVuYWJsZUFjY2VwdEVuY29kaW5nR3ppcDogdHJ1ZSxcbiAgICAgIGVuYWJsZUFjY2VwdEVuY29kaW5nQnJvdGxpOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gUmVzcG9uc2UgSGVhZGVycyBQb2xpY3lcbiAgICBjb25zdCBzZWN1cml0eUhlYWRlcnNQb2xpY3kgPSBuZXcgY2xvdWRmcm9udC5SZXNwb25zZUhlYWRlcnNQb2xpY3kodGhpcywgJ1NlY3VyaXR5SGVhZGVyc1BvbGljeScsIHtcbiAgICAgIHJlc3BvbnNlSGVhZGVyc1BvbGljeU5hbWU6IGBtZWRlZXotJHtlbnZpcm9ubWVudH0tc2VjdXJpdHktaGVhZGVyc2AsXG4gICAgICBzZWN1cml0eUhlYWRlcnNCZWhhdmlvcjoge1xuICAgICAgICBzdHJpY3RUcmFuc3BvcnRTZWN1cml0eToge1xuICAgICAgICAgIGFjY2Vzc0NvbnRyb2xNYXhBZ2U6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMxNTM2MDAwKSxcbiAgICAgICAgICBpbmNsdWRlU3ViZG9tYWluczogdHJ1ZSxcbiAgICAgICAgICBvdmVycmlkZTogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICAgIGNvbnRlbnRUeXBlT3B0aW9uczoge1xuICAgICAgICAgIG92ZXJyaWRlOiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICAgICAgZnJhbWVPcHRpb25zOiB7XG4gICAgICAgICAgZnJhbWVPcHRpb246IGNsb3VkZnJvbnQuSGVhZGVyc0ZyYW1lT3B0aW9uLkRFTlksXG4gICAgICAgICAgb3ZlcnJpZGU6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgICByZWZlcnJlclBvbGljeToge1xuICAgICAgICAgIHJlZmVycmVyUG9saWN5OiBjbG91ZGZyb250LkhlYWRlcnNSZWZlcnJlclBvbGljeS5TVFJJQ1RfT1JJR0lOX1dIRU5fQ1JPU1NfT1JJR0lOLFxuICAgICAgICAgIG92ZXJyaWRlOiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDbG91ZEZyb250IERpc3RyaWJ1dGlvblxuICAgIGxldCBjZXJ0aWZpY2F0ZTogYWNtLklDZXJ0aWZpY2F0ZSB8IHVuZGVmaW5lZDtcbiAgICBsZXQgZG9tYWluTmFtZXM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXG4gICAgaWYgKGNvbmZpZy5jZXJ0aWZpY2F0ZUFybikge1xuICAgICAgY2VydGlmaWNhdGUgPSBhY20uQ2VydGlmaWNhdGUuZnJvbUNlcnRpZmljYXRlQXJuKHRoaXMsICdDZXJ0aWZpY2F0ZScsIGNvbmZpZy5jZXJ0aWZpY2F0ZUFybik7XG4gICAgICBkb21haW5OYW1lcyA9IFtcbiAgICAgICAgY29uZmlnLmRvbWFpbk5hbWUhLFxuICAgICAgICBgd3d3LiR7Y29uZmlnLmRvbWFpbk5hbWV9YCxcbiAgICAgICAgYGJvb2suJHtjb25maWcuZG9tYWluTmFtZX1gLFxuICAgICAgXTtcbiAgICB9XG5cbiAgICB0aGlzLmNsb3VkRnJvbnREaXN0cmlidXRpb24gPSBuZXcgY2xvdWRmcm9udC5EaXN0cmlidXRpb24odGhpcywgJ0Rpc3RyaWJ1dGlvbicsIHtcbiAgICAgIGRvbWFpbk5hbWVzLFxuICAgICAgY2VydGlmaWNhdGUsXG4gICAgICBtaW5pbXVtUHJvdG9jb2xWZXJzaW9uOiBjbG91ZGZyb250LlNlY3VyaXR5UG9saWN5UHJvdG9jb2wuVExTX1YxXzJfMjAyMSxcbiAgICAgIHNzbFN1cHBvcnRNZXRob2Q6IGNsb3VkZnJvbnQuU1NMTWV0aG9kLlNOSSxcbiAgICAgIHByaWNlQ2xhc3M6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyBjbG91ZGZyb250LlByaWNlQ2xhc3MuUFJJQ0VfQ0xBU1NfQUxMIDogY2xvdWRmcm9udC5QcmljZUNsYXNzLlBSSUNFX0NMQVNTXzEwMCxcbiAgICAgIGVuYWJsZUlwdjY6IHRydWUsXG4gICAgICBjb21tZW50OiBgTWVkZWV6ICR7ZW52aXJvbm1lbnR9IENsb3VkRnJvbnQgRGlzdHJpYnV0aW9uYCxcbiAgICAgIGRlZmF1bHRSb290T2JqZWN0OiAnaW5kZXguaHRtbCcsXG4gICAgICBlcnJvclJlc3BvbnNlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaHR0cFN0YXR1czogNDA0LFxuICAgICAgICAgIHJlc3BvbnNlSHR0cFN0YXR1czogMjAwLFxuICAgICAgICAgIHJlc3BvbnNlUGFnZVBhdGg6ICcvNDA0Lmh0bWwnLFxuICAgICAgICAgIHR0bDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBodHRwU3RhdHVzOiA0MDMsXG4gICAgICAgICAgcmVzcG9uc2VIdHRwU3RhdHVzOiAyMDAsXG4gICAgICAgICAgcmVzcG9uc2VQYWdlUGF0aDogJy9pbmRleC5odG1sJyxcbiAgICAgICAgICB0dGw6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIGRlZmF1bHRCZWhhdmlvcjoge1xuICAgICAgICBvcmlnaW46IGNsb3VkZnJvbnRPcmlnaW5zLlMzQnVja2V0T3JpZ2luLndpdGhPcmlnaW5BY2Nlc3NDb250cm9sKHN0YXRpY0Fzc2V0c0J1Y2tldCwge1xuICAgICAgICAgIG9yaWdpbkFjY2Vzc0NvbnRyb2wsXG4gICAgICAgIH0pLFxuICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5SRURJUkVDVF9UT19IVFRQUyxcbiAgICAgICAgY2FjaGVQb2xpY3k6IGR5bmFtaWNDb250ZW50Q2FjaGVQb2xpY3ksXG4gICAgICAgIHJlc3BvbnNlSGVhZGVyc1BvbGljeTogc2VjdXJpdHlIZWFkZXJzUG9saWN5LFxuICAgICAgICBjb21wcmVzczogdHJ1ZSxcbiAgICAgICAgYWxsb3dlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQWxsb3dlZE1ldGhvZHMuQUxMT1dfR0VUX0hFQURfT1BUSU9OUyxcbiAgICAgIH0sXG4gICAgICBhZGRpdGlvbmFsQmVoYXZpb3JzOiB7XG4gICAgICAgICcvX25leHQvc3RhdGljLyonOiB7XG4gICAgICAgICAgb3JpZ2luOiBjbG91ZGZyb250T3JpZ2lucy5TM0J1Y2tldE9yaWdpbi53aXRoT3JpZ2luQWNjZXNzQ29udHJvbChzdGF0aWNBc3NldHNCdWNrZXQsIHtcbiAgICAgICAgICAgIG9yaWdpbkFjY2Vzc0NvbnRyb2wsXG4gICAgICAgICAgfSksXG4gICAgICAgICAgdmlld2VyUHJvdG9jb2xQb2xpY3k6IGNsb3VkZnJvbnQuVmlld2VyUHJvdG9jb2xQb2xpY3kuUkVESVJFQ1RfVE9fSFRUUFMsXG4gICAgICAgICAgY2FjaGVQb2xpY3k6IHN0YXRpY0Fzc2V0c0NhY2hlUG9saWN5LFxuICAgICAgICAgIHJlc3BvbnNlSGVhZGVyc1BvbGljeTogc2VjdXJpdHlIZWFkZXJzUG9saWN5LFxuICAgICAgICAgIGNvbXByZXNzOiB0cnVlLFxuICAgICAgICAgIGFsbG93ZWRNZXRob2RzOiBjbG91ZGZyb250LkFsbG93ZWRNZXRob2RzLkFMTE9XX0dFVF9IRUFELFxuICAgICAgICB9LFxuICAgICAgICAnL3N0YXRpYy8qJzoge1xuICAgICAgICAgIG9yaWdpbjogY2xvdWRmcm9udE9yaWdpbnMuUzNCdWNrZXRPcmlnaW4ud2l0aE9yaWdpbkFjY2Vzc0NvbnRyb2woc3RhdGljQXNzZXRzQnVja2V0LCB7XG4gICAgICAgICAgICBvcmlnaW5BY2Nlc3NDb250cm9sLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIHZpZXdlclByb3RvY29sUG9saWN5OiBjbG91ZGZyb250LlZpZXdlclByb3RvY29sUG9saWN5LlJFRElSRUNUX1RPX0hUVFBTLFxuICAgICAgICAgIGNhY2hlUG9saWN5OiBzdGF0aWNBc3NldHNDYWNoZVBvbGljeSxcbiAgICAgICAgICByZXNwb25zZUhlYWRlcnNQb2xpY3k6IHNlY3VyaXR5SGVhZGVyc1BvbGljeSxcbiAgICAgICAgICBjb21wcmVzczogdHJ1ZSxcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogY2xvdWRmcm9udC5BbGxvd2VkTWV0aG9kcy5BTExPV19HRVRfSEVBRCxcbiAgICAgICAgfSxcbiAgICAgICAgJy9hcGkvKic6IHtcbiAgICAgICAgICBvcmlnaW46IG5ldyBjbG91ZGZyb250T3JpZ2lucy5IdHRwT3JpZ2luKGFwaVVybC5yZXBsYWNlKCdodHRwczovLycsICcnKS5yZXBsYWNlKCcvYXBpL3YxJywgJycpKSxcbiAgICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5SRURJUkVDVF9UT19IVFRQUyxcbiAgICAgICAgICBjYWNoZVBvbGljeTogY2xvdWRmcm9udC5DYWNoZVBvbGljeS5DQUNISU5HX0RJU0FCTEVELFxuICAgICAgICAgIG9yaWdpblJlcXVlc3RQb2xpY3k6IGNsb3VkZnJvbnQuT3JpZ2luUmVxdWVzdFBvbGljeS5DT1JTX1MzX09SSUdJTixcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogY2xvdWRmcm9udC5BbGxvd2VkTWV0aG9kcy5BTExPV19BTEwsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gVXBkYXRlIFMzIGJ1Y2tldCBwb2xpY3kgZm9yIENsb3VkRnJvbnQgT0FDXG4gICAgc3RhdGljQXNzZXRzQnVja2V0LmFkZFRvUmVzb3VyY2VQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgcHJpbmNpcGFsczogW25ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnY2xvdWRmcm9udC5hbWF6b25hd3MuY29tJyldLFxuICAgICAgICBhY3Rpb25zOiBbJ3MzOkdldE9iamVjdCddLFxuICAgICAgICByZXNvdXJjZXM6IFtgJHtzdGF0aWNBc3NldHNCdWNrZXQuYnVja2V0QXJufS8qYF0sXG4gICAgICAgIGNvbmRpdGlvbnM6IHtcbiAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgICdBV1M6U291cmNlQXJuJzogYGFybjphd3M6Y2xvdWRmcm9udDo6JHt0aGlzLmFjY291bnR9OmRpc3RyaWJ1dGlvbi8ke3RoaXMuY2xvdWRGcm9udERpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25JZH1gLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBQbGFjZWhvbGRlciBmb3Igc3RhdGljIHdlYiBhc3NldHMgZGVwbG95bWVudFxuICAgIC8vIEluIHByb2R1Y3Rpb24sIHRoaXMgd291bGQgYmUgaGFuZGxlZCBieSBhIHNlcGFyYXRlIGRlcGxveW1lbnQgcHJvY2Vzc1xuICAgIGNvbnN0IHBsYWNlaG9sZGVySHRtbCA9IGA8IURPQ1RZUEUgaHRtbD5cbiAgICA8aHRtbD5cbiAgICA8aGVhZD5cbiAgICAgIDx0aXRsZT5NZWRlZXogLSBNZWRpY2FsIFByYWN0aWNlIE1hbmFnZW1lbnQ8L3RpdGxlPlxuICAgICAgPG1ldGEgY2hhcnNldD1cInV0Zi04XCI+XG4gICAgICA8bWV0YSBuYW1lPVwidmlld3BvcnRcIiBjb250ZW50PVwid2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTFcIj5cbiAgICAgIDxzdHlsZT5cbiAgICAgICAgYm9keSB7IGZvbnQtZmFtaWx5OiBBcmlhbCwgc2Fucy1zZXJpZjsgdGV4dC1hbGlnbjogY2VudGVyOyBwYWRkaW5nOiA1MHB4OyB9XG4gICAgICAgIGgxIHsgY29sb3I6ICMyYzNlNTA7IH1cbiAgICAgICAgcCB7IGNvbG9yOiAjN2Y4YzhkOyB9XG4gICAgICA8L3N0eWxlPlxuICAgIDwvaGVhZD5cbiAgICA8Ym9keT5cbiAgICAgIDxoMT5NZWRlZXogSW5mcmFzdHJ1Y3R1cmUgRGVwbG95ZWQgU3VjY2Vzc2Z1bGx5PC9oMT5cbiAgICAgIDxwPkVudmlyb25tZW50OiAke2Vudmlyb25tZW50fTwvcD5cbiAgICAgIDxwPkFQSSBVUkw6ICR7YXBpVXJsfTwvcD5cbiAgICAgIDxwPlRoZSB3ZWIgYXBwbGljYXRpb24gd2lsbCBiZSBkZXBsb3llZCBzZXBhcmF0ZWx5LjwvcD5cbiAgICA8L2JvZHk+XG4gICAgPC9odG1sPmA7XG5cbiAgICBuZXcgczNEZXBsb3kuQnVja2V0RGVwbG95bWVudCh0aGlzLCAnRGVwbG95UGxhY2Vob2xkZXJTaXRlJywge1xuICAgICAgc291cmNlczogW3MzRGVwbG95LlNvdXJjZS5kYXRhKCdpbmRleC5odG1sJywgcGxhY2Vob2xkZXJIdG1sKV0sXG4gICAgICBkZXN0aW5hdGlvbkJ1Y2tldDogc3RhdGljQXNzZXRzQnVja2V0LFxuICAgICAgZGlzdHJpYnV0aW9uOiB0aGlzLmNsb3VkRnJvbnREaXN0cmlidXRpb24sXG4gICAgICBkaXN0cmlidXRpb25QYXRoczogWycvKiddLFxuICAgIH0pO1xuXG4gICAgLy8gUm91dGU1MyBSZWNvcmRzXG4gICAgaWYgKGNvbmZpZy5kb21haW5OYW1lICYmIGNvbmZpZy5ob3N0ZWRab25lSWQpIHtcbiAgICAgIGNvbnN0IGhvc3RlZFpvbmUgPSByb3V0ZTUzLkhvc3RlZFpvbmUuZnJvbUhvc3RlZFpvbmVBdHRyaWJ1dGVzKHRoaXMsICdIb3N0ZWRab25lJywge1xuICAgICAgICBob3N0ZWRab25lSWQ6IGNvbmZpZy5ob3N0ZWRab25lSWQsXG4gICAgICAgIHpvbmVOYW1lOiBjb25maWcuZG9tYWluTmFtZSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBNYWluIGRvbWFpblxuICAgICAgbmV3IHJvdXRlNTMuQVJlY29yZCh0aGlzLCAnQWxpYXNSZWNvcmQnLCB7XG4gICAgICAgIHpvbmU6IGhvc3RlZFpvbmUsXG4gICAgICAgIHJlY29yZE5hbWU6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyAnJyA6IGVudmlyb25tZW50LFxuICAgICAgICB0YXJnZXQ6IHJvdXRlNTMuUmVjb3JkVGFyZ2V0LmZyb21BbGlhcyhcbiAgICAgICAgICBuZXcgcm91dGU1M3RhcmdldHMuQ2xvdWRGcm9udFRhcmdldCh0aGlzLmNsb3VkRnJvbnREaXN0cmlidXRpb24pXG4gICAgICAgICksXG4gICAgICB9KTtcblxuICAgICAgLy8gV1dXIHN1YmRvbWFpblxuICAgICAgaWYgKGVudmlyb25tZW50ID09PSAncHJvZCcpIHtcbiAgICAgICAgbmV3IHJvdXRlNTMuQVJlY29yZCh0aGlzLCAnV1dXQWxpYXNSZWNvcmQnLCB7XG4gICAgICAgICAgem9uZTogaG9zdGVkWm9uZSxcbiAgICAgICAgICByZWNvcmROYW1lOiAnd3d3JyxcbiAgICAgICAgICB0YXJnZXQ6IHJvdXRlNTMuUmVjb3JkVGFyZ2V0LmZyb21BbGlhcyhcbiAgICAgICAgICAgIG5ldyByb3V0ZTUzdGFyZ2V0cy5DbG91ZEZyb250VGFyZ2V0KHRoaXMuY2xvdWRGcm9udERpc3RyaWJ1dGlvbilcbiAgICAgICAgICApLFxuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gQm9vayBzdWJkb21haW4gZm9yIHB1YmxpYyBib29raW5nXG4gICAgICBuZXcgcm91dGU1My5BUmVjb3JkKHRoaXMsICdCb29raW5nQWxpYXNSZWNvcmQnLCB7XG4gICAgICAgIHpvbmU6IGhvc3RlZFpvbmUsXG4gICAgICAgIHJlY29yZE5hbWU6IGBib29rJHtlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gJycgOiBgLSR7ZW52aXJvbm1lbnR9YH1gLFxuICAgICAgICB0YXJnZXQ6IHJvdXRlNTMuUmVjb3JkVGFyZ2V0LmZyb21BbGlhcyhcbiAgICAgICAgICBuZXcgcm91dGU1M3RhcmdldHMuQ2xvdWRGcm9udFRhcmdldCh0aGlzLmNsb3VkRnJvbnREaXN0cmlidXRpb24pXG4gICAgICAgICksXG4gICAgICB9KTtcblxuICAgICAgdGhpcy53ZWJVcmwgPSBgaHR0cHM6Ly8ke2NvbmZpZy5kb21haW5OYW1lfWA7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMud2ViVXJsID0gYGh0dHBzOi8vJHt0aGlzLmNsb3VkRnJvbnREaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZX1gO1xuICAgIH1cblxuICAgIC8vIFN0b3JlIGNvbmZpZ3VyYXRpb24gaW4gUGFyYW1ldGVyIFN0b3JlXG4gICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ1dlYlVybFBhcmFtZXRlcicsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvbWVkZWV6LyR7ZW52aXJvbm1lbnR9L3dlYi11cmxgLFxuICAgICAgc3RyaW5nVmFsdWU6IHRoaXMud2ViVXJsLFxuICAgICAgZGVzY3JpcHRpb246ICdXZWIgYXBwbGljYXRpb24gVVJMJyxcbiAgICB9KTtcblxuICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdDbG91ZEZyb250RGlzdHJpYnV0aW9uSWRQYXJhbWV0ZXInLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL21lZGVlei8ke2Vudmlyb25tZW50fS9jbG91ZGZyb250L2Rpc3RyaWJ1dGlvbi1pZGAsXG4gICAgICBzdHJpbmdWYWx1ZTogdGhpcy5jbG91ZEZyb250RGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbklkLFxuICAgICAgZGVzY3JpcHRpb246ICdDbG91ZEZyb250IERpc3RyaWJ1dGlvbiBJRCcsXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1dlYlVybCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLndlYlVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnV2ViIGFwcGxpY2F0aW9uIFVSTCcsXG4gICAgICBleHBvcnROYW1lOiBgTWVkZWV6V2ViVXJsLSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDbG91ZEZyb250RGlzdHJpYnV0aW9uSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5jbG91ZEZyb250RGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbklkLFxuICAgICAgZGVzY3JpcHRpb246ICdDbG91ZEZyb250IERpc3RyaWJ1dGlvbiBJRCcsXG4gICAgICBleHBvcnROYW1lOiBgTWVkZWV6Q2xvdWRGcm9udERpc3RyaWJ1dGlvbklkLSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTdGF0aWNBc3NldHNCdWNrZXROYW1lJywge1xuICAgICAgdmFsdWU6IHN0YXRpY0Fzc2V0c0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdTdGF0aWMgYXNzZXRzIFMzIGJ1Y2tldCBuYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBNZWRlZXpTdGF0aWNBc3NldHNCdWNrZXROYW1lLSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcbiAgfVxufSJdfQ==