import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import toast from 'react-hot-toast';

// Types based on API structure
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

export interface QueryOptions {
  limit?: number;
  nextToken?: string;
  sortDirection?: 'asc' | 'desc';
  filters?: Record<string, any>;
}

// API Client Class
class ApiClient {
  private client: AxiosInstance;
  private authToken: string | null = null;
  private clinicId: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
    this.loadAuthFromStorage();
  }

  private setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // Add auth token if available
        if (this.authToken) {
          config.headers.Authorization = `Bearer ${this.authToken}`;
        }

        // Add clinic ID header
        if (this.clinicId) {
          config.headers['x-clinic-id'] = this.clinicId;
        }

        // Add request ID for tracing
        config.headers['x-request-id'] = this.generateRequestId();

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        return response;
      },
      (error: AxiosError) => {
        this.handleApiError(error);
        return Promise.reject(error);
      }
    );
  }

  private handleApiError(error: AxiosError) {
    const response = error.response;
    
    // Handle different error types
    switch (response?.status) {
      case 401:
        // Unauthorized - clear auth and redirect to login
        this.clearAuth();
        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login';
        }
        break;
      
      case 403:
        toast.error('Access denied. You do not have permission to perform this action.');
        break;
      
      case 404:
        toast.error('The requested resource was not found.');
        break;
      
      case 429:
        toast.error('Too many requests. Please try again later.');
        break;
      
      case 500:
        toast.error('Server error. Please try again later.');
        break;
      
      default:
        // Try to extract error message from response
        const errorData = response?.data as ApiResponse;
        const message = errorData?.error?.message || 'An unexpected error occurred';
        toast.error(message);
    }
  }

  private generateRequestId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  private loadAuthFromStorage() {
    if (typeof window === 'undefined') return;
    
    try {
      const token = localStorage.getItem('auth_token');
      const clinicId = localStorage.getItem('clinic_id');
      
      if (token) this.authToken = token;
      if (clinicId) this.clinicId = clinicId;
    } catch (error) {
      console.warn('Failed to load auth from storage:', error);
    }
  }

  // Auth methods
  setAuth(token: string, clinicId: string) {
    this.authToken = token;
    this.clinicId = clinicId;
    
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('auth_token', token);
        localStorage.setItem('clinic_id', clinicId);
      } catch (error) {
        console.warn('Failed to save auth to storage:', error);
      }
    }
  }

  clearAuth() {
    this.authToken = null;
    this.clinicId = null;
    
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('clinic_id');
      } catch (error) {
        console.warn('Failed to clear auth from storage:', error);
      }
    }
  }

  isAuthenticated(): boolean {
    return !!this.authToken;
  }

  getClinicId(): string | null {
    return this.clinicId;
  }

  // Generic HTTP methods
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.client.get(url, config);
    return response.data;
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.client.post(url, data, config);
    return response.data;
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.client.put(url, data, config);
    return response.data;
  }

  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.client.patch(url, data, config);
    return response.data;
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.client.delete(url, config);
    return response.data;
  }

  // Authentication API
  auth = {
    login: async (email: string, password: string) => {
      return this.post('/v1/auth/login', { email, password });
    },
    
    signup: async (data: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      clinicName: string;
    }) => {
      return this.post('/v1/auth/register', data);
    },
    
    forgotPassword: async (email: string) => {
      return this.post('/v1/auth/forgot-password', { email });
    },
    
    resetPassword: async (token: string, password: string) => {
      return this.post('/v1/auth/reset-password', { token, password });
    },
    
    refreshToken: async () => {
      return this.post('/v1/auth/refresh');
    },
    
    logout: async () => {
      const response = await this.post('/v1/auth/logout');
      this.clearAuth();
      return response;
    },
    
    verifyEmail: async (token: string) => {
      return this.post('/v1/auth/verify-email', { token });
    },
  };

  // Patient API
  patients = {
    list: async (options?: QueryOptions) => {
      return this.get<PaginatedResponse<any>>('/v1/patients', { params: options });
    },
    
    get: async (patientId: string) => {
      return this.get(`/v1/patients/${patientId}`);
    },
    
    create: async (data: any) => {
      return this.post('/v1/patients', data);
    },
    
    update: async (patientId: string, data: any) => {
      return this.put(`/v1/patients/${patientId}`, data);
    },
    
    delete: async (patientId: string) => {
      return this.delete(`/v1/patients/${patientId}`);
    },
    
    search: async (query: string) => {
      return this.get('/v1/patients/search', { params: { q: query } });
    },
  };

  // Appointment API
  appointments = {
    list: async (options?: QueryOptions & { date?: string; providerId?: string }) => {
      return this.get<PaginatedResponse<any>>('/v1/appointments', { params: options });
    },
    
    get: async (appointmentId: string) => {
      return this.get(`/v1/appointments/${appointmentId}`);
    },
    
    create: async (data: any) => {
      return this.post('/v1/appointments', data);
    },
    
    update: async (appointmentId: string, data: any) => {
      return this.put(`/v1/appointments/${appointmentId}`, data);
    },
    
    delete: async (appointmentId: string) => {
      return this.delete(`/v1/appointments/${appointmentId}`);
    },
    
    cancel: async (appointmentId: string, reason?: string) => {
      return this.patch(`/v1/appointments/${appointmentId}/cancel`, { reason });
    },
    
    complete: async (appointmentId: string) => {
      return this.patch(`/v1/appointments/${appointmentId}/complete`);
    },
  };

  // Notes API (SOAP notes)
  notes = {
    list: async (patientId: string, options?: QueryOptions) => {
      return this.get<PaginatedResponse<any>>(`/v1/notes`, { 
        params: { patientId, ...options } 
      });
    },
    
    get: async (noteId: string) => {
      return this.get(`/v1/notes/${noteId}`);
    },
    
    create: async (data: any) => {
      return this.post('/v1/notes', data);
    },
    
    update: async (noteId: string, data: any) => {
      return this.put(`/v1/notes/${noteId}`, data);
    },
    
    delete: async (noteId: string) => {
      return this.delete(`/v1/notes/${noteId}`);
    },
  };

  // Invoice API
  invoices = {
    list: async (options?: QueryOptions & { status?: string; patientId?: string }) => {
      return this.get<PaginatedResponse<any>>('/v1/invoices', { params: options });
    },
    
    get: async (invoiceId: string) => {
      return this.get(`/v1/invoices/${invoiceId}`);
    },
    
    create: async (data: any) => {
      return this.post('/v1/invoices', data);
    },
    
    update: async (invoiceId: string, data: any) => {
      return this.put(`/v1/invoices/${invoiceId}`, data);
    },
    
    delete: async (invoiceId: string) => {
      return this.delete(`/v1/invoices/${invoiceId}`);
    },
    
    send: async (invoiceId: string) => {
      return this.post(`/v1/invoices/${invoiceId}/send`);
    },
    
    markPaid: async (invoiceId: string, paymentData?: any) => {
      return this.patch(`/v1/invoices/${invoiceId}/paid`, paymentData);
    },
  };

  // Dashboard API
  dashboard = {
    getStats: async () => {
      return this.get('/v1/dashboard/stats');
    },
    
    getRecentActivity: async (limit = 10) => {
      return this.get('/v1/dashboard/activity', { params: { limit } });
    },
    
    getUpcomingAppointments: async (limit = 5) => {
      return this.get('/v1/dashboard/appointments/upcoming', { params: { limit } });
    },
  };

  // Settings API
  settings = {
    getProfile: async () => {
      return this.get('/v1/settings/profile');
    },
    
    updateProfile: async (data: any) => {
      return this.put('/v1/settings/profile', data);
    },
    
    getClinicSettings: async () => {
      return this.get('/v1/settings/clinic');
    },
    
    updateClinicSettings: async (data: any) => {
      return this.put('/v1/settings/clinic', data);
    },
    
    changePassword: async (currentPassword: string, newPassword: string) => {
      return this.post('/v1/settings/change-password', {
        currentPassword,
        newPassword,
      });
    },
  };
}

// Create and export singleton instance
export const apiClient = new ApiClient();
export default apiClient;