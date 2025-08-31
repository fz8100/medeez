import express from 'express';
import serverless from 'serverless-http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { errorHandler } from '@/middleware/errorHandler';
import { requestLogger } from '@/middleware/requestLogger';
import { rateLimiter } from '@/middleware/rateLimiter';
import { authMiddleware } from '@/middleware/authMiddleware';
import { tenantMiddleware, systemAdminTenantOverride } from '@/middleware/tenantMiddleware';
import { auditLogger } from '@/middleware/auditLogger';
import { addRoleContext, validateCrossTenantAccess, logPhiAccess } from '@/middleware/permissionMiddleware';
import { healthRouter } from '@/routes/health';
import { authRouter } from '@/routes/auth';
import { patientsRouter } from '@/routes/patients';
import { appointmentsRouter } from '@/routes/appointments';
import { notesRouter } from '@/routes/notes';
import { invoicesRouter } from '@/routes/invoices';
import { attachmentsRouter } from '@/routes/attachments';
import { integrationsRouter } from '@/routes/integrations';
import { webhooksRouter } from '@/routes/webhooks';
import { jobsRouter } from '@/routes/jobs';
import { dashboardRouter } from '@/routes/dashboard';
import { analyticsRouter } from '@/routes/analytics';
import { settingsRouter } from '@/routes/settings';
import { logger } from '@/utils/logger';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'https://*.medeez.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-clinic-id', 'x-request-id', 'x-target-clinic', 'x-target-clinic-id']
}));

// General middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(requestLogger);
app.use(rateLimiter);

// Health check (no auth required)
app.use('/health', healthRouter);

// Webhook endpoints (no auth required, but signature verification)
app.use('/v1/webhooks', webhooksRouter);

// Authentication required routes
app.use('/v1/auth', authRouter);

// Protected routes (require authentication and tenant scoping)
app.use('/v1/patients', authMiddleware, tenantMiddleware, logPhiAccess('patient'), auditLogger, patientsRouter);
app.use('/v1/appointments', authMiddleware, tenantMiddleware, auditLogger, appointmentsRouter);
app.use('/v1/notes', authMiddleware, tenantMiddleware, logPhiAccess('note'), auditLogger, notesRouter);
app.use('/v1/invoices', authMiddleware, tenantMiddleware, auditLogger, invoicesRouter);
app.use('/v1/attachments', authMiddleware, tenantMiddleware, logPhiAccess('attachment'), auditLogger, attachmentsRouter);
app.use('/v1/integrations', authMiddleware, tenantMiddleware, auditLogger, integrationsRouter);
app.use('/v1/jobs', authMiddleware, tenantMiddleware, jobsRouter);

// Role-adaptive routes with enhanced permissions
app.use('/v1/dashboard', authMiddleware, addRoleContext, validateCrossTenantAccess, systemAdminTenantOverride, auditLogger, dashboardRouter);
app.use('/v1/analytics', authMiddleware, addRoleContext, validateCrossTenantAccess, systemAdminTenantOverride, auditLogger, analyticsRouter);
app.use('/v1/settings', authMiddleware, addRoleContext, validateCrossTenantAccess, systemAdminTenantOverride, auditLogger, settingsRouter);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: 'Endpoint not found',
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use(errorHandler);

// Lambda handler for serverless deployment
export const handler = serverless(app, {
  request(request, event, context) {
    request.context = context;
    request.event = event;
  }
});

// Local development server
if (process.env.NODE_ENV !== 'production') {
  const port = process.env.PORT || 3001;
  app.listen(port, () => {
    logger.info(`Medeez API server running on port ${port}`);
  });
}

export default app;