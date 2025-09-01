import { Request } from 'express';
import { Context } from 'aws-lambda';

// Core types
export type EntityType = 'CLINIC' | 'USER' | 'PATIENT' | 'APPOINTMENT' | 'NOTE' | 'INVOICE' | 'CLAIM' | 'INTEGRATION' | 'AUDIT';

export type AppointmentStatus = 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export type UserRole = 'SystemAdmin' | 'Admin' | 'Doctor' | 'Staff';

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired';

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export type ClaimStatus = 'DRAFT' | 'SUBMITTED' | 'PENDING' | 'APPROVED' | 'DENIED' | 'PAID';

export type IntegrationType = 'GOOGLE_CALENDAR' | 'TWILIO' | 'SENDGRID' | 'PADDLE' | 'CLAIM_MD';

export type AuditAction = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'EXPORT' | 'PRINT';

// DynamoDB single-table design interfaces
export interface BaseEntity {
  PK: string;           // Partition Key: TENANT#{clinicId}
  SK: string;           // Sort Key: varies by entity
  GSI1PK?: string;      // GSI1: ByEntityType
  GSI1SK?: string;      
  GSI2PK?: string;      // GSI2: ByPatient  
  GSI2SK?: string;
  GSI3PK?: string;      // GSI3: ByProviderTime
  GSI3SK?: string;
  GSI4PK?: string;      // GSI4: ByStatus
  GSI4SK?: string;
  GSI5PK?: string;      // GSI5: ExternalIDs
  GSI5SK?: string;
  entityType: EntityType;
  clinicId: string;
  createdAt: string;
  updatedAt: string;
  ttl?: number;         // For automatic cleanup
}

// Authentication and request context
export interface AuthenticatedRequest extends Request {
  user?: {
    sub: string;
    email: string;
    clinicId: string;
    role: UserRole;
    'cognito:groups'?: string[];
  };
  context?: Context;
  event?: any;
  clinicId?: string;
  requestId?: string;
}

// Encrypted field wrapper
export interface EncryptedField {
  encrypted: string;
  keyId: string;
  context: string;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
  requestId?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    nextToken?: string;
    hasMore: boolean;
    total?: number;
    limit: number;
  };
}

// Query parameters
export interface QueryOptions {
  limit?: number;
  nextToken?: string;
  sortDirection?: 'asc' | 'desc';
  filters?: Record<string, any>;
}

// Cost optimization settings
export interface QueryConfig {
  projectionExpression?: string;
  attributesToGet?: string[];
  limit?: number;
  indexName?: string;
}

// Audit log entry
export interface AuditLogEntry extends BaseEntity {
  userId: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  details?: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  phiAccessed?: boolean;
}

// Error types
export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
  
  public details?: any;
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

// Environment configuration
export interface Config {
  aws: {
    region: string;
    dynamoTable: string;
    kmsKeyId: string;
    s3Bucket: string;
  };
  cognito: {
    userPoolId: string;
    clientId: string;
    region: string;
  };
  encryption: {
    algorithm: string;
    keySize: number;
  };
  rateLimit: {
    windowMs: number;
    max: number;
  };
}

// Webhook payload types
export interface WebhookPayload {
  eventType: string;
  data: any;
  timestamp: string;
  signature?: string;
}

export interface PaddleWebhook extends WebhookPayload {
  eventType: 'subscription.created' | 'subscription.updated' | 'subscription.cancelled' | 'payment.succeeded' | 'payment.failed';
  data: {
    subscriptionId: string;
    customerId: string;
    clinicId: string;
    status: string;
    nextBillDate?: string;
    planId: string;
  };
}

export interface GoogleCalendarWebhook extends WebhookPayload {
  eventType: 'calendar.updated';
  data: {
    calendarId: string;
    resourceId: string;
    resourceUri: string;
    channelId: string;
  };
}

// Authentication types
export interface LoginRequest {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number;
  tokenType: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    clinicId: string;
    permissions: string[];
    onboardingComplete: boolean;
    subscriptionStatus: SubscriptionStatus;
    trialEndDate?: string;
  };
  clinic: {
    id: string;
    name: string;
    subscriptionStatus: SubscriptionStatus;
    subscriptionTier: string;
    trialEndDate?: string;
    features: string[];
  };
}

export interface SignupRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  clinicName?: string;
  invitationCode?: string;
}

export interface SignupResponse {
  success: boolean;
  message: string;
  requiresVerification: boolean;
  userId?: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  confirmationCode: string;
  newPassword: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  idToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface MagicLinkRequest {
  patientEmail: string;
  clinicId: string;
  expiresIn?: number;
}

export interface MagicLinkResponse {
  magicLink: string;
  token: string;
  expiresAt: string;
}

export interface InviteUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  clinicId: string;
  permissions?: string[];
  expiresIn?: number;
}

export interface InviteUserResponse {
  invitationCode: string;
  invitationLink: string;
  expiresAt: string;
}

export interface UserInvitation extends BaseEntity {
  invitationCode: string;
  invitedEmail: string;
  invitedBy: string;
  clinicId: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  permissions?: string[];
  status: 'PENDING' | 'USED' | 'EXPIRED';
  expiresAt: string;
  usedAt?: string;
  usedBy?: string;
}

export interface MagicLinkToken extends BaseEntity {
  token: string;
  patientEmail: string;
  clinicId: string;
  expiresAt: string;
  usedAt?: string;
  metadata?: Record<string, any>;
}

export { };