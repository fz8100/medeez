"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEnvironmentConfig = getEnvironmentConfig;
exports.getSecretNames = getSecretNames;
exports.getParameterNames = getParameterNames;
const baseConfig = {
    allowedOrigins: ['http://localhost:3000'],
    dynamodb: {
        billingMode: 'PAY_PER_REQUEST',
        pointInTimeRecovery: true,
        encryption: true,
        backupRetentionDays: 35,
    },
    lambda: {
        memorySize: 1024,
        timeout: 30,
        environment: {
            NODE_ENV: 'production',
            LOG_LEVEL: 'info',
        },
    },
    monitoring: {
        alertEmail: process.env.ALERT_EMAIL || 'alerts@medeez.com',
        dashboardName: 'MedeezDashboard',
        logRetentionDays: 30,
    },
    backup: {
        crossRegionReplication: false,
        retentionDays: 90,
    },
    cognito: {
        passwordPolicy: {
            minLength: 12,
            requireUppercase: true,
            requireLowercase: true,
            requireDigits: true,
            requireSymbols: true,
        },
        mfaConfiguration: 'OPTIONAL',
    },
    costThresholds: {
        monthlyBudget: 1000,
        costPerDoctor: 50,
        warningThreshold: 80,
    },
};
function getEnvironmentConfig(environment) {
    const configs = {
        dev: {
            environment: 'dev',
            domainName: 'dev.medeez.com',
            allowedOrigins: ['http://localhost:3000', 'https://dev.medeez.com'],
            dynamodb: {
                ...baseConfig.dynamodb,
                encryption: false, // Disable customer-managed encryption for dev to avoid circular dependency
            },
            lambda: {
                ...baseConfig.lambda,
                memorySize: 512,
                environment: {
                    ...baseConfig.lambda.environment,
                    NODE_ENV: 'development',
                    LOG_LEVEL: 'debug',
                },
            },
            monitoring: {
                ...baseConfig.monitoring,
                logRetentionDays: 7,
            },
            backup: {
                ...baseConfig.backup,
                crossRegionReplication: false,
                retentionDays: 30,
            },
            cognito: {
                ...baseConfig.cognito,
                passwordPolicy: {
                    ...baseConfig.cognito.passwordPolicy,
                    minLength: 8,
                    requireSymbols: false,
                },
                mfaConfiguration: 'OFF',
            },
            costThresholds: {
                monthlyBudget: 200,
                costPerDoctor: 20,
                warningThreshold: 70,
            },
        },
        staging: {
            environment: 'staging',
            domainName: 'staging.medeez.com',
            allowedOrigins: ['https://staging.medeez.com'],
            lambda: {
                ...baseConfig.lambda,
                memorySize: 768,
                environment: {
                    ...baseConfig.lambda.environment,
                    NODE_ENV: 'staging',
                    LOG_LEVEL: 'info',
                },
            },
            monitoring: {
                ...baseConfig.monitoring,
                logRetentionDays: 14,
            },
            backup: {
                ...baseConfig.backup,
                crossRegionReplication: true,
                backupRegion: 'us-west-2',
                retentionDays: 60,
            },
            costThresholds: {
                monthlyBudget: 500,
                costPerDoctor: 35,
                warningThreshold: 75,
            },
        },
        prod: {
            environment: 'prod',
            domainName: 'medeez.com',
            allowedOrigins: ['https://medeez.com'],
            lambda: {
                ...baseConfig.lambda,
                memorySize: 1024,
                reservedConcurrency: 100,
                environment: {
                    ...baseConfig.lambda.environment,
                    NODE_ENV: 'production',
                    LOG_LEVEL: 'warn',
                },
            },
            monitoring: {
                ...baseConfig.monitoring,
                logRetentionDays: 90,
            },
            backup: {
                ...baseConfig.backup,
                crossRegionReplication: true,
                backupRegion: 'us-west-2',
                retentionDays: 365,
            },
            cognito: {
                ...baseConfig.cognito,
                mfaConfiguration: 'REQUIRED',
            },
            costThresholds: {
                monthlyBudget: 2000,
                costPerDoctor: 50,
                warningThreshold: 85,
            },
        },
    };
    const envConfig = configs[environment];
    if (!envConfig) {
        throw new Error(`Unknown environment: ${environment}`);
    }
    return {
        ...baseConfig,
        ...envConfig,
    };
}
function getSecretNames(environment) {
    const prefix = `medeez-${environment}`;
    return {
        databaseUrl: `${prefix}-database-url`,
        jwtSecret: `${prefix}-jwt-secret`,
        paddleApiKey: `${prefix}-paddle-api-key`,
        paddlePublicKey: `${prefix}-paddle-public-key`,
        googleClientSecret: `${prefix}-google-client-secret`,
        slackWebhook: `${prefix}-slack-webhook`,
        sentry: `${prefix}-sentry-dsn`,
    };
}
function getParameterNames(environment) {
    const prefix = `/medeez/${environment}`;
    return {
        domainName: `${prefix}/domain-name`,
        apiUrl: `${prefix}/api-url`,
        webUrl: `${prefix}/web-url`,
        userPoolId: `${prefix}/cognito/user-pool-id`,
        userPoolClientId: `${prefix}/cognito/user-pool-client-id`,
        dynamoTableName: `${prefix}/dynamo/table-name`,
        s3BucketName: `${prefix}/s3/bucket-name`,
        kmsKeyId: `${prefix}/kms/key-id`,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vY29uZmlnLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBdUZBLG9EQXFIQztBQUVELHdDQVdDO0FBRUQsOENBWUM7QUExTEQsTUFBTSxVQUFVLEdBQThGO0lBQzVHLGNBQWMsRUFBRSxDQUFDLHVCQUF1QixDQUFDO0lBQ3pDLFFBQVEsRUFBRTtRQUNSLFdBQVcsRUFBRSxpQkFBaUI7UUFDOUIsbUJBQW1CLEVBQUUsSUFBSTtRQUN6QixVQUFVLEVBQUUsSUFBSTtRQUNoQixtQkFBbUIsRUFBRSxFQUFFO0tBQ3hCO0lBQ0QsTUFBTSxFQUFFO1FBQ04sVUFBVSxFQUFFLElBQUk7UUFDaEIsT0FBTyxFQUFFLEVBQUU7UUFDWCxXQUFXLEVBQUU7WUFDWCxRQUFRLEVBQUUsWUFBWTtZQUN0QixTQUFTLEVBQUUsTUFBTTtTQUNsQjtLQUNGO0lBQ0QsVUFBVSxFQUFFO1FBQ1YsVUFBVSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxJQUFJLG1CQUFtQjtRQUMxRCxhQUFhLEVBQUUsaUJBQWlCO1FBQ2hDLGdCQUFnQixFQUFFLEVBQUU7S0FDckI7SUFDRCxNQUFNLEVBQUU7UUFDTixzQkFBc0IsRUFBRSxLQUFLO1FBQzdCLGFBQWEsRUFBRSxFQUFFO0tBQ2xCO0lBQ0QsT0FBTyxFQUFFO1FBQ1AsY0FBYyxFQUFFO1lBQ2QsU0FBUyxFQUFFLEVBQUU7WUFDYixnQkFBZ0IsRUFBRSxJQUFJO1lBQ3RCLGdCQUFnQixFQUFFLElBQUk7WUFDdEIsYUFBYSxFQUFFLElBQUk7WUFDbkIsY0FBYyxFQUFFLElBQUk7U0FDckI7UUFDRCxnQkFBZ0IsRUFBRSxVQUFVO0tBQzdCO0lBQ0QsY0FBYyxFQUFFO1FBQ2QsYUFBYSxFQUFFLElBQUk7UUFDbkIsYUFBYSxFQUFFLEVBQUU7UUFDakIsZ0JBQWdCLEVBQUUsRUFBRTtLQUNyQjtDQUNGLENBQUM7QUFFRixTQUFnQixvQkFBb0IsQ0FBQyxXQUFt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QzNCLFVBQVUsRUFBRSxHQUFHLE1BQU0sdUJBQXVCO1FBQzVDLGdCQUFnQixFQUFFLEdBQUcsTUFBTSw4QkFBOEI7UUFDekQsZUFBZSxFQUFFLEdBQUcsTUFBTSxvQkFBb0I7UUFDOUMsWUFBWSxFQUFFLEdBQUcsTUFBTSxpQkFBaUI7UUFDeEMsUUFBUSxFQUFFLEdBQUcsTUFBTSxhQUFhO0tBQ2pDLENBQUM7QUFDSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGludGVyZmFjZSBFbnZpcm9ubWVudENvbmZpZyB7XG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG4gIGRvbWFpbk5hbWU/OiBzdHJpbmc7XG4gIGNlcnRpZmljYXRlQXJuPzogc3RyaW5nO1xuICBob3N0ZWRab25lSWQ/OiBzdHJpbmc7XG4gIGFsbG93ZWRPcmlnaW5zOiBzdHJpbmdbXTtcbiAgZHluYW1vZGI6IHtcbiAgICBiaWxsaW5nTW9kZTogJ1BBWV9QRVJfUkVRVUVTVCcgfCAnUFJPVklTSU9ORUQnO1xuICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IGJvb2xlYW47XG4gICAgZW5jcnlwdGlvbjogYm9vbGVhbjtcbiAgICBiYWNrdXBSZXRlbnRpb25EYXlzOiBudW1iZXI7XG4gIH07XG4gIGxhbWJkYToge1xuICAgIG1lbW9yeVNpemU6IG51bWJlcjtcbiAgICB0aW1lb3V0OiBudW1iZXI7XG4gICAgcmVzZXJ2ZWRDb25jdXJyZW5jeT86IG51bWJlcjtcbiAgICBlbnZpcm9ubWVudDogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgfTtcbiAgbW9uaXRvcmluZzoge1xuICAgIGFsZXJ0RW1haWw6IHN0cmluZztcbiAgICBkYXNoYm9hcmROYW1lOiBzdHJpbmc7XG4gICAgbG9nUmV0ZW50aW9uRGF5czogbnVtYmVyO1xuICB9O1xuICBiYWNrdXA6IHtcbiAgICBjcm9zc1JlZ2lvblJlcGxpY2F0aW9uOiBib29sZWFuO1xuICAgIGJhY2t1cFJlZ2lvbj86IHN0cmluZztcbiAgICByZXRlbnRpb25EYXlzOiBudW1iZXI7XG4gIH07XG4gIGNvZ25pdG86IHtcbiAgICBwYXNzd29yZFBvbGljeToge1xuICAgICAgbWluTGVuZ3RoOiBudW1iZXI7XG4gICAgICByZXF1aXJlVXBwZXJjYXNlOiBib29sZWFuO1xuICAgICAgcmVxdWlyZUxvd2VyY2FzZTogYm9vbGVhbjtcbiAgICAgIHJlcXVpcmVEaWdpdHM6IGJvb2xlYW47XG4gICAgICByZXF1aXJlU3ltYm9sczogYm9vbGVhbjtcbiAgICB9O1xuICAgIG1mYUNvbmZpZ3VyYXRpb246ICdPRkYnIHwgJ09QVElPTkFMJyB8ICdSRVFVSVJFRCc7XG4gIH07XG4gIGNvc3RUaHJlc2hvbGRzOiB7XG4gICAgbW9udGhseUJ1ZGdldDogbnVtYmVyO1xuICAgIGNvc3RQZXJEb2N0b3I6IG51bWJlcjtcbiAgICB3YXJuaW5nVGhyZXNob2xkOiBudW1iZXI7XG4gIH07XG59XG5cbmNvbnN0IGJhc2VDb25maWc6IE9taXQ8RW52aXJvbm1lbnRDb25maWcsICdlbnZpcm9ubWVudCcgfCAnZG9tYWluTmFtZScgfCAnY2VydGlmaWNhdGVBcm4nIHwgJ2hvc3RlZFpvbmVJZCc+ID0ge1xuICBhbGxvd2VkT3JpZ2luczogWydodHRwOi8vbG9jYWxob3N0OjMwMDAnXSxcbiAgZHluYW1vZGI6IHtcbiAgICBiaWxsaW5nTW9kZTogJ1BBWV9QRVJfUkVRVUVTVCcsXG4gICAgcG9pbnRJblRpbWVSZWNvdmVyeTogdHJ1ZSxcbiAgICBlbmNyeXB0aW9uOiB0cnVlLFxuICAgIGJhY2t1cFJldGVudGlvbkRheXM6IDM1LFxuICB9LFxuICBsYW1iZGE6IHtcbiAgICBtZW1vcnlTaXplOiAxMDI0LFxuICAgIHRpbWVvdXQ6IDMwLFxuICAgIGVudmlyb25tZW50OiB7XG4gICAgICBOT0RFX0VOVjogJ3Byb2R1Y3Rpb24nLFxuICAgICAgTE9HX0xFVkVMOiAnaW5mbycsXG4gICAgfSxcbiAgfSxcbiAgbW9uaXRvcmluZzoge1xuICAgIGFsZXJ0RW1haWw6IHByb2Nlc3MuZW52LkFMRVJUX0VNQUlMIHx8ICdhbGVydHNAbWVkZWV6LmNvbScsXG4gICAgZGFzaGJvYXJkTmFtZTogJ01lZGVlekRhc2hib2FyZCcsXG4gICAgbG9nUmV0ZW50aW9uRGF5czogMzAsXG4gIH0sXG4gIGJhY2t1cDoge1xuICAgIGNyb3NzUmVnaW9uUmVwbGljYXRpb246IGZhbHNlLFxuICAgIHJldGVudGlvbkRheXM6IDkwLFxuICB9LFxuICBjb2duaXRvOiB7XG4gICAgcGFzc3dvcmRQb2xpY3k6IHtcbiAgICAgIG1pbkxlbmd0aDogMTIsXG4gICAgICByZXF1aXJlVXBwZXJjYXNlOiB0cnVlLFxuICAgICAgcmVxdWlyZUxvd2VyY2FzZTogdHJ1ZSxcbiAgICAgIHJlcXVpcmVEaWdpdHM6IHRydWUsXG4gICAgICByZXF1aXJlU3ltYm9sczogdHJ1ZSxcbiAgICB9LFxuICAgIG1mYUNvbmZpZ3VyYXRpb246ICdPUFRJT05BTCcsXG4gIH0sXG4gIGNvc3RUaHJlc2hvbGRzOiB7XG4gICAgbW9udGhseUJ1ZGdldDogMTAwMCxcbiAgICBjb3N0UGVyRG9jdG9yOiA1MCxcbiAgICB3YXJuaW5nVGhyZXNob2xkOiA4MCxcbiAgfSxcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRFbnZpcm9ubWVudENvbmZpZyhlbnZpcm9ubWVudDogc3RyaW5nKTogRW52aXJvbm1lbnRDb25maWcge1xuICBjb25zdCBjb25maWdzOiBSZWNvcmQ8c3RyaW5nLCBQYXJ0aWFsPEVudmlyb25tZW50Q29uZmlnPj4gPSB7XG4gICAgZGV2OiB7XG4gICAgICBlbnZpcm9ubWVudDogJ2RldicsXG4gICAgICBkb21haW5OYW1lOiAnZGV2Lm1lZGVlei5jb20nLFxuICAgICAgYWxsb3dlZE9yaWdpbnM6IFsnaHR0cDovL2xvY2FsaG9zdDozMDAwJywgJ2h0dHBzOi8vZGV2Lm1lZGVlei5jb20nXSxcbiAgICAgIGR5bmFtb2RiOiB7XG4gICAgICAgIC4uLmJhc2VDb25maWcuZHluYW1vZGIsXG4gICAgICAgIGVuY3J5cHRpb246IGZhbHNlLCAvLyBEaXNhYmxlIGN1c3RvbWVyLW1hbmFnZWQgZW5jcnlwdGlvbiBmb3IgZGV2IHRvIGF2b2lkIGNpcmN1bGFyIGRlcGVuZGVuY3lcbiAgICAgIH0sXG4gICAgICBsYW1iZGE6IHtcbiAgICAgICAgLi4uYmFzZUNvbmZpZy5sYW1iZGEsXG4gICAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICAuLi5iYXNlQ29uZmlnLmxhbWJkYS5lbnZpcm9ubWVudCxcbiAgICAgICAgICBOT0RFX0VOVjogJ2RldmVsb3BtZW50JyxcbiAgICAgICAgICBMT0dfTEVWRUw6ICdkZWJ1ZycsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgbW9uaXRvcmluZzoge1xuICAgICAgICAuLi5iYXNlQ29uZmlnLm1vbml0b3JpbmcsXG4gICAgICAgIGxvZ1JldGVudGlvbkRheXM6IDcsXG4gICAgICB9LFxuICAgICAgYmFja3VwOiB7XG4gICAgICAgIC4uLmJhc2VDb25maWcuYmFja3VwLFxuICAgICAgICBjcm9zc1JlZ2lvblJlcGxpY2F0aW9uOiBmYWxzZSxcbiAgICAgICAgcmV0ZW50aW9uRGF5czogMzAsXG4gICAgICB9LFxuICAgICAgY29nbml0bzoge1xuICAgICAgICAuLi5iYXNlQ29uZmlnLmNvZ25pdG8sXG4gICAgICAgIHBhc3N3b3JkUG9saWN5OiB7XG4gICAgICAgICAgLi4uYmFzZUNvbmZpZy5jb2duaXRvLnBhc3N3b3JkUG9saWN5LFxuICAgICAgICAgIG1pbkxlbmd0aDogOCxcbiAgICAgICAgICByZXF1aXJlU3ltYm9sczogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICAgIG1mYUNvbmZpZ3VyYXRpb246ICdPRkYnLFxuICAgICAgfSxcbiAgICAgIGNvc3RUaHJlc2hvbGRzOiB7XG4gICAgICAgIG1vbnRobHlCdWRnZXQ6IDIwMCxcbiAgICAgICAgY29zdFBlckRvY3RvcjogMjAsXG4gICAgICAgIHdhcm5pbmdUaHJlc2hvbGQ6IDcwLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHN0YWdpbmc6IHtcbiAgICAgIGVudmlyb25tZW50OiAnc3RhZ2luZycsXG4gICAgICBkb21haW5OYW1lOiAnc3RhZ2luZy5tZWRlZXouY29tJyxcbiAgICAgIGFsbG93ZWRPcmlnaW5zOiBbJ2h0dHBzOi8vc3RhZ2luZy5tZWRlZXouY29tJ10sXG4gICAgICBsYW1iZGE6IHtcbiAgICAgICAgLi4uYmFzZUNvbmZpZy5sYW1iZGEsXG4gICAgICAgIG1lbW9yeVNpemU6IDc2OCxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICAuLi5iYXNlQ29uZmlnLmxhbWJkYS5lbnZpcm9ubWVudCxcbiAgICAgICAgICBOT0RFX0VOVjogJ3N0YWdpbmcnLFxuICAgICAgICAgIExPR19MRVZFTDogJ2luZm8nLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG1vbml0b3Jpbmc6IHtcbiAgICAgICAgLi4uYmFzZUNvbmZpZy5tb25pdG9yaW5nLFxuICAgICAgICBsb2dSZXRlbnRpb25EYXlzOiAxNCxcbiAgICAgIH0sXG4gICAgICBiYWNrdXA6IHtcbiAgICAgICAgLi4uYmFzZUNvbmZpZy5iYWNrdXAsXG4gICAgICAgIGNyb3NzUmVnaW9uUmVwbGljYXRpb246IHRydWUsXG4gICAgICAgIGJhY2t1cFJlZ2lvbjogJ3VzLXdlc3QtMicsXG4gICAgICAgIHJldGVudGlvbkRheXM6IDYwLFxuICAgICAgfSxcbiAgICAgIGNvc3RUaHJlc2hvbGRzOiB7XG4gICAgICAgIG1vbnRobHlCdWRnZXQ6IDUwMCxcbiAgICAgICAgY29zdFBlckRvY3RvcjogMzUsXG4gICAgICAgIHdhcm5pbmdUaHJlc2hvbGQ6IDc1LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHByb2Q6IHtcbiAgICAgIGVudmlyb25tZW50OiAncHJvZCcsXG4gICAgICBkb21haW5OYW1lOiAnbWVkZWV6LmNvbScsXG4gICAgICBhbGxvd2VkT3JpZ2luczogWydodHRwczovL21lZGVlei5jb20nXSxcbiAgICAgIGxhbWJkYToge1xuICAgICAgICAuLi5iYXNlQ29uZmlnLmxhbWJkYSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMTAyNCxcbiAgICAgICAgcmVzZXJ2ZWRDb25jdXJyZW5jeTogMTAwLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIC4uLmJhc2VDb25maWcubGFtYmRhLmVudmlyb25tZW50LFxuICAgICAgICAgIE5PREVfRU5WOiAncHJvZHVjdGlvbicsXG4gICAgICAgICAgTE9HX0xFVkVMOiAnd2FybicsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgbW9uaXRvcmluZzoge1xuICAgICAgICAuLi5iYXNlQ29uZmlnLm1vbml0b3JpbmcsXG4gICAgICAgIGxvZ1JldGVudGlvbkRheXM6IDkwLFxuICAgICAgfSxcbiAgICAgIGJhY2t1cDoge1xuICAgICAgICAuLi5iYXNlQ29uZmlnLmJhY2t1cCxcbiAgICAgICAgY3Jvc3NSZWdpb25SZXBsaWNhdGlvbjogdHJ1ZSxcbiAgICAgICAgYmFja3VwUmVnaW9uOiAndXMtd2VzdC0yJyxcbiAgICAgICAgcmV0ZW50aW9uRGF5czogMzY1LFxuICAgICAgfSxcbiAgICAgIGNvZ25pdG86IHtcbiAgICAgICAgLi4uYmFzZUNvbmZpZy5jb2duaXRvLFxuICAgICAgICBtZmFDb25maWd1cmF0aW9uOiAnUkVRVUlSRUQnLFxuICAgICAgfSxcbiAgICAgIGNvc3RUaHJlc2hvbGRzOiB7XG4gICAgICAgIG1vbnRobHlCdWRnZXQ6IDIwMDAsXG4gICAgICAgIGNvc3RQZXJEb2N0b3I6IDUwLFxuICAgICAgICB3YXJuaW5nVGhyZXNob2xkOiA4NSxcbiAgICAgIH0sXG4gICAgfSxcbiAgfTtcblxuICBjb25zdCBlbnZDb25maWcgPSBjb25maWdzW2Vudmlyb25tZW50XTtcbiAgaWYgKCFlbnZDb25maWcpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gZW52aXJvbm1lbnQ6ICR7ZW52aXJvbm1lbnR9YCk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIC4uLmJhc2VDb25maWcsXG4gICAgLi4uZW52Q29uZmlnLFxuICB9IGFzIEVudmlyb25tZW50Q29uZmlnO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2VjcmV0TmFtZXMoZW52aXJvbm1lbnQ6IHN0cmluZykge1xuICBjb25zdCBwcmVmaXggPSBgbWVkZWV6LSR7ZW52aXJvbm1lbnR9YDtcbiAgcmV0dXJuIHtcbiAgICBkYXRhYmFzZVVybDogYCR7cHJlZml4fS1kYXRhYmFzZS11cmxgLFxuICAgIGp3dFNlY3JldDogYCR7cHJlZml4fS1qd3Qtc2VjcmV0YCxcbiAgICBwYWRkbGVBcGlLZXk6IGAke3ByZWZpeH0tcGFkZGxlLWFwaS1rZXlgLFxuICAgIHBhZGRsZVB1YmxpY0tleTogYCR7cHJlZml4fS1wYWRkbGUtcHVibGljLWtleWAsXG4gICAgZ29vZ2xlQ2xpZW50U2VjcmV0OiBgJHtwcmVmaXh9LWdvb2dsZS1jbGllbnQtc2VjcmV0YCxcbiAgICBzbGFja1dlYmhvb2s6IGAke3ByZWZpeH0tc2xhY2std2ViaG9va2AsXG4gICAgc2VudHJ5OiBgJHtwcmVmaXh9LXNlbnRyeS1kc25gLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UGFyYW1ldGVyTmFtZXMoZW52aXJvbm1lbnQ6IHN0cmluZykge1xuICBjb25zdCBwcmVmaXggPSBgL21lZGVlei8ke2Vudmlyb25tZW50fWA7XG4gIHJldHVybiB7XG4gICAgZG9tYWluTmFtZTogYCR7cHJlZml4fS9kb21haW4tbmFtZWAsXG4gICAgYXBpVXJsOiBgJHtwcmVmaXh9L2FwaS11cmxgLFxuICAgIHdlYlVybDogYCR7cHJlZml4fS93ZWItdXJsYCxcbiAgICB1c2VyUG9vbElkOiBgJHtwcmVmaXh9L2NvZ25pdG8vdXNlci1wb29sLWlkYCxcbiAgICB1c2VyUG9vbENsaWVudElkOiBgJHtwcmVmaXh9L2NvZ25pdG8vdXNlci1wb29sLWNsaWVudC1pZGAsXG4gICAgZHluYW1vVGFibGVOYW1lOiBgJHtwcmVmaXh9L2R5bmFtby90YWJsZS1uYW1lYCxcbiAgICBzM0J1Y2tldE5hbWU6IGAke3ByZWZpeH0vczMvYnVja2V0LW5hbWVgLFxuICAgIGttc0tleUlkOiBgJHtwcmVmaXh9L2ttcy9rZXktaWRgLFxuICB9O1xufSJdfQ==