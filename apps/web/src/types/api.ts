// API response types and interfaces

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: string;
  requestId?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: Pagination;
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
  field?: string;
}

export interface Pagination {
  nextToken?: string;
  hasMore: boolean;
  total?: number;
  limit: number;
  offset?: number;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  nextToken?: string;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
  filters?: Record<string, any>;
  search?: string;
}

export interface RequestConfig {
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
  params?: Record<string, any>;
  skipAuth?: boolean;
}

// API endpoint types
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiEndpoint {
  method: HTTPMethod;
  path: string;
  authenticated?: boolean;
  timeout?: number;
}

// Batch operations
export interface BatchOperation<T = any> {
  operation: 'create' | 'update' | 'delete';
  id?: string;
  data?: T;
}

export interface BatchRequest<T = any> {
  operations: BatchOperation<T>[];
  validateOnly?: boolean;
}

export interface BatchResponse<T = any> {
  results: Array<{
    success: boolean;
    id?: string;
    data?: T;
    error?: ApiError;
  }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

// File upload types
export interface FileUploadRequest {
  file: File;
  fileName?: string;
  description?: string;
  tags?: string[];
  entityType?: string;
  entityId?: string;
  isPrivate?: boolean;
}

export interface FileUploadResponse {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
  thumbnailUrl?: string;
  uploadedAt: string;
}

// Search types
export interface SearchRequest {
  query: string;
  entityTypes?: string[];
  filters?: Record<string, any>;
  limit?: number;
  offset?: number;
  includeArchived?: boolean;
}

export interface SearchResult {
  id: string;
  entityType: string;
  title: string;
  description?: string;
  url?: string;
  relevanceScore: number;
  lastModified: string;
  metadata?: Record<string, any>;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  suggestions?: string[];
  facets?: Record<string, Array<{ value: string; count: number }>>;
}

// Webhook types
export interface WebhookEvent {
  id: string;
  type: string;
  data: any;
  timestamp: string;
  version: string;
}

export interface WebhookSubscription {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  secret: string;
  createdAt: string;
}

// Rate limiting
export interface RateLimit {
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

// API key management
export interface ApiKey {
  id: string;
  name: string;
  key: string;
  permissions: string[];
  isActive: boolean;
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
}

// Health check
export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: Array<{
    name: string;
    status: 'up' | 'down' | 'degraded';
    responseTime?: number;
    lastCheck: string;
  }>;
  version: string;
}