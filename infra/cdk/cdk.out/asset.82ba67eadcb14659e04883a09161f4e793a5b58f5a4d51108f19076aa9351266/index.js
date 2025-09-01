const AWS = require('aws-sdk');

exports.handler = async (event, context) => {
    console.log('Event:', JSON.stringify(event, null, 2));
    
    // Basic Lambda handler for API Gateway
    const response = {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        body: JSON.stringify({
            message: 'Medeez API - Infrastructure deployment placeholder',
            timestamp: new Date().toISOString(),
            environment: process.env.ENVIRONMENT || 'unknown',
            version: '1.0.0'
        })
    };
    
    return response;
};