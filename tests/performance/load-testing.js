/**
 * Performance and Load Testing Suite
 * HIPAA-compliant performance testing for Medeez v2 API endpoints
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const authFailureRate = new Rate('auth_failures');
const apiResponseTime = new Trend('api_response_time');
const apiErrorRate = new Rate('api_errors');
const hipaaAuditEvents = new Counter('hipaa_audit_events');

// Test configuration
export const options = {
  // Performance testing stages
  stages: [
    { duration: '2m', target: 10 },   // Ramp up to 10 users
    { duration: '5m', target: 10 },   // Stay at 10 users
    { duration: '2m', target: 20 },   // Ramp up to 20 users
    { duration: '5m', target: 20 },   // Stay at 20 users
    { duration: '2m', target: 50 },   // Ramp up to 50 users
    { duration: '10m', target: 50 },  // Stay at 50 users
    { duration: '2m', target: 0 },    // Ramp down to 0 users
  ],
  
  // Performance thresholds (HIPAA compliance requirements)
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests under 2s
    http_req_failed: ['rate<0.1'],     // Error rate under 10%
    auth_failures: ['rate<0.05'],      // Auth failures under 5%
    api_response_time: ['p(95)<1500'], // API response under 1.5s
    api_errors: ['rate<0.05'],         // API errors under 5%
  },
  
  // Test data and environment
  env: {
    API_BASE_URL: __ENV.API_BASE_URL || 'http://localhost:3001',
    TEST_USER_EMAIL: __ENV.TEST_USER_EMAIL || 'loadtest@example.com',
    TEST_USER_PASSWORD: __ENV.TEST_USER_PASSWORD || 'LoadTest123!',
  },
};

// Test setup
export function setup() {
  console.log('🚀 Starting HIPAA-compliant load testing for Medeez v2...');
  
  // Health check
  const healthResponse = http.get(`${__ENV.API_BASE_URL}/health`);
  check(healthResponse, {
    'Health check status is 200': (r) => r.status === 200,
    'Health check response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  if (healthResponse.status !== 200) {
    throw new Error('Health check failed - API not available');
  }
  
  // Authenticate and get token
  const authData = authenticate();
  if (!authData.token) {
    throw new Error('Authentication failed during setup');
  }
  
  console.log('✅ Load test setup completed successfully');
  return { authToken: authData.token };
}

// Main test function
export default function(data) {
  const authToken = data.authToken;
  const baseUrl = __ENV.API_BASE_URL;
  
  const headers = {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json',
    'x-clinic-id': 'load-test-clinic',
  };

  group('Authentication Performance', () => {
    testAuthenticationEndpoints();
  });

  group('Patient Management Performance', () => {
    testPatientEndpoints(headers, baseUrl);
  });

  group('Appointment Management Performance', () => {
    testAppointmentEndpoints(headers, baseUrl);
  });

  group('Notes Management Performance', () => {
    testNotesEndpoints(headers, baseUrl);
  });

  group('File Upload Performance', () => {
    testFileUploadEndpoints(headers, baseUrl);
  });

  group('Dashboard Performance', () => {
    testDashboardEndpoints(headers, baseUrl);
  });

  // Simulate user think time (HIPAA consideration - realistic usage)
  sleep(Math.random() * 3 + 1); // 1-4 seconds
}

function authenticate() {
  const authPayload = {
    email: __ENV.TEST_USER_EMAIL,
    password: __ENV.TEST_USER_PASSWORD,
  };

  const authResponse = http.post(
    `${__ENV.API_BASE_URL}/v1/auth/login`,
    JSON.stringify(authPayload),
    { headers: { 'Content-Type': 'application/json' } }
  );

  const authSuccess = check(authResponse, {
    'Authentication status is 200': (r) => r.status === 200,
    'Authentication response time < 1000ms': (r) => r.timings.duration < 1000,
    'Authentication returns token': (r) => r.json('data.token') !== undefined,
  });

  authFailureRate.add(!authSuccess);
  apiResponseTime.add(authResponse.timings.duration);

  return {
    token: authSuccess ? authResponse.json('data.token') : null,
  };
}

function testPatientEndpoints(headers, baseUrl) {
  // List patients (most common operation)
  const listResponse = http.get(`${baseUrl}/v1/patients?limit=25`, { headers });
  
  check(listResponse, {
    'List patients status is 200': (r) => r.status === 200,
    'List patients response time < 1500ms': (r) => r.timings.duration < 1500,
    'List patients returns data': (r) => r.json('data') !== undefined,
    'List patients has pagination': (r) => r.json('pagination') !== undefined,
  });

  apiResponseTime.add(listResponse.timings.duration);
  apiErrorRate.add(listResponse.status >= 400);
  
  if (listResponse.status === 200) {
    hipaaAuditEvents.add(1); // Successful PHI access
  }

  // Search patients
  const searchResponse = http.get(`${baseUrl}/v1/patients/search?q=test&limit=10`, { headers });
  
  check(searchResponse, {
    'Search patients status is 200': (r) => r.status === 200,
    'Search patients response time < 2000ms': (r) => r.timings.duration < 2000,
  });

  apiResponseTime.add(searchResponse.timings.duration);
  apiErrorRate.add(searchResponse.status >= 400);

  // Get specific patient (if any exist)
  const patients = listResponse.json('data');
  if (patients && patients.length > 0) {
    const patientId = patients[0].patientId;
    const getResponse = http.get(`${baseUrl}/v1/patients/${patientId}`, { headers });
    
    check(getResponse, {
      'Get patient status is 200': (r) => r.status === 200,
      'Get patient response time < 1000ms': (r) => r.timings.duration < 1000,
      'Get patient returns PHI data': (r) => {
        const patient = r.json('data');
        return patient && patient.firstName && patient.lastName;
      },
    });

    apiResponseTime.add(getResponse.timings.duration);
    apiErrorRate.add(getResponse.status >= 400);
    
    if (getResponse.status === 200) {
      hipaaAuditEvents.add(1); // PHI access event
    }
  }
}

function testAppointmentEndpoints(headers, baseUrl) {
  // List appointments
  const listResponse = http.get(`${baseUrl}/v1/appointments?limit=25`, { headers });
  
  check(listResponse, {
    'List appointments status is 200': (r) => r.status === 200,
    'List appointments response time < 1500ms': (r) => r.timings.duration < 1500,
  });

  apiResponseTime.add(listResponse.timings.duration);
  apiErrorRate.add(listResponse.status >= 400);

  // Get appointments by date range
  const today = new Date().toISOString().split('T')[0];
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const dateRangeResponse = http.get(
    `${baseUrl}/v1/appointments?startDate=${today}&endDate=${nextWeek}`,
    { headers }
  );
  
  check(dateRangeResponse, {
    'Date range appointments status is 200': (r) => r.status === 200,
    'Date range appointments response time < 2000ms': (r) => r.timings.duration < 2000,
  });

  apiResponseTime.add(dateRangeResponse.timings.duration);
  apiErrorRate.add(dateRangeResponse.status >= 400);
}

function testNotesEndpoints(headers, baseUrl) {
  // List notes
  const listResponse = http.get(`${baseUrl}/v1/notes?limit=25`, { headers });
  
  check(listResponse, {
    'List notes status is 200': (r) => r.status === 200,
    'List notes response time < 1500ms': (r) => r.timings.duration < 1500,
  });

  apiResponseTime.add(listResponse.timings.duration);
  apiErrorRate.add(listResponse.status >= 400);
  
  if (listResponse.status === 200) {
    hipaaAuditEvents.add(1); // PHI access (notes contain medical information)
  }
}

function testFileUploadEndpoints(headers, baseUrl) {
  // Test file upload limits and performance
  const smallFile = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  
  const uploadResponse = http.post(
    `${baseUrl}/v1/attachments`,
    {
      file: smallFile,
      filename: 'test-image.png',
      patientId: 'load-test-patient',
    },
    { headers }
  );
  
  check(uploadResponse, {
    'File upload completes': (r) => r.status === 200 || r.status === 201,
    'File upload response time < 5000ms': (r) => r.timings.duration < 5000,
  });

  apiResponseTime.add(uploadResponse.timings.duration);
  apiErrorRate.add(uploadResponse.status >= 400);
}

function testDashboardEndpoints(headers, baseUrl) {
  // Dashboard summary (aggregated data)
  const dashboardResponse = http.get(`${baseUrl}/v1/dashboard/summary`, { headers });
  
  check(dashboardResponse, {
    'Dashboard status is 200': (r) => r.status === 200,
    'Dashboard response time < 3000ms': (r) => r.timings.duration < 3000,
    'Dashboard returns metrics': (r) => {
      const data = r.json('data');
      return data && typeof data === 'object';
    },
  });

  apiResponseTime.add(dashboardResponse.timings.duration);
  apiErrorRate.add(dashboardResponse.status >= 400);

  // Analytics endpoint (potentially heavy queries)
  const analyticsResponse = http.get(`${baseUrl}/v1/analytics/patients-overview`, { headers });
  
  check(analyticsResponse, {
    'Analytics status is 200': (r) => r.status === 200,
    'Analytics response time < 5000ms': (r) => r.timings.duration < 5000,
  });

  apiResponseTime.add(analyticsResponse.timings.duration);
  apiErrorRate.add(analyticsResponse.status >= 400);
}

function testAuthenticationEndpoints() {
  // Test login performance under load
  const authData = authenticate();
  
  if (authData.token) {
    // Test token refresh
    const refreshResponse = http.post(
      `${__ENV.API_BASE_URL}/v1/auth/refresh`,
      JSON.stringify({ token: authData.token }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    check(refreshResponse, {
      'Token refresh status is 200': (r) => r.status === 200,
      'Token refresh response time < 1000ms': (r) => r.timings.duration < 1000,
    });

    apiResponseTime.add(refreshResponse.timings.duration);
    apiErrorRate.add(refreshResponse.status >= 400);
  }
}

// Test teardown
export function teardown(data) {
  console.log('🧹 Load testing completed. Cleaning up...');
  
  // Log final metrics
  console.log(`Total HIPAA audit events: ${hipaaAuditEvents.count}`);
  console.log('✅ Load test teardown completed');
}

export { authFailureRate, apiResponseTime, apiErrorRate, hipaaAuditEvents };