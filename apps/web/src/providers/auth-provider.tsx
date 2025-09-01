'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { jwtDecode } from 'jwt-decode';

// User roles in the system
export type UserRole = 'doctor' | 'admin' | 'staff' | 'system_admin';

// User interface based on the backend user model
export interface User {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  clinicId: string;
  clinicName?: string;
  isEmailVerified: boolean;
  lastLoginAt?: string;
  profilePicture?: string;
  phoneNumber?: string;
  specialization?: string;
  licenseNumber?: string;
  settings?: {
    theme: 'light' | 'dark' | 'system';
    notifications: {
      email: boolean;
      sms: boolean;
      push: boolean;
    };
    defaultCalendarView: 'day' | 'week' | 'month';
  };
}

// JWT Token payload interface
interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  clinicId: string;
  exp: number;
  iat: number;
}

// Auth context state
interface AuthState {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
}

// Auth context actions
interface AuthActions {
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  signup: (data: SignupData) => Promise<boolean>;
  refreshToken: () => Promise<boolean>;
  updateUser: (userData: Partial<User>) => void;
  forgotPassword: (email: string) => Promise<boolean>;
  resetPassword: (token: string, password: string) => Promise<boolean>;
  verifyEmail: (token: string) => Promise<boolean>;
}

type AuthContextValue = AuthState & AuthActions;

// Signup data interface
export interface SignupData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  clinicName: string;
  role?: UserRole;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/auth/login',
  '/auth/signup',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
  '/auth/magic-link',
  '/privacy',
  '/terms',
  '/about',
];

// Routes that require specific roles
const ROLE_ROUTES: Record<string, UserRole[]> = {
  '/admin': ['admin', 'system_admin'],
  '/system': ['system_admin'],
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    loading: true,
    isAuthenticated: false,
  });

  const router = useRouter();
  const pathname = usePathname();

  // Initialize auth on mount
  useEffect(() => {
    initializeAuth();
  }, []);

  // Check route access on path change
  useEffect(() => {
    if (!authState.loading) {
      checkRouteAccess();
    }
  }, [pathname, authState.loading, authState.isAuthenticated, authState.user?.role]);

  const initializeAuth = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      
      if (!token) {
        setAuthState(prev => ({ ...prev, loading: false }));
        return;
      }

      // Validate token
      const payload = jwtDecode<JWTPayload>(token);
      const isExpired = payload.exp * 1000 < Date.now();

      if (isExpired) {
        // Try to refresh token
        const refreshSuccess = await refreshToken();
        if (!refreshSuccess) {
          clearAuth();
          return;
        }
      } else {
        // Token is valid, fetch user profile
        await fetchUserProfile();
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      clearAuth();
    }
  };

  const fetchUserProfile = async () => {
    try {
      const response = await apiClient.settings.getProfile();
      
      if (response.success && response.data) {
        setAuthState(prev => ({
          ...prev,
          user: response.data,
          isAuthenticated: true,
          loading: false,
        }));
      } else {
        clearAuth();
      }
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
      clearAuth();
    }
  };

  const clearAuth = () => {
    apiClient.clearAuth();
    setAuthState({
      user: null,
      loading: false,
      isAuthenticated: false,
    });
  };

  const checkRouteAccess = () => {
    const isPublicRoute = PUBLIC_ROUTES.some(route => pathname.startsWith(route));
    
    if (isPublicRoute) {
      // Redirect authenticated users away from auth pages
      if (authState.isAuthenticated && pathname.startsWith('/auth/')) {
        router.replace('/dashboard');
      }
      return;
    }

    // Check if user is authenticated
    if (!authState.isAuthenticated) {
      router.replace('/auth/login');
      return;
    }

    // Check role-based access
    const requiredRoles = Object.entries(ROLE_ROUTES).find(([route]) =>
      pathname.startsWith(route)
    )?.[1];

    if (requiredRoles && authState.user && !requiredRoles.includes(authState.user.role)) {
      router.replace('/dashboard');
      return;
    }
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      setAuthState(prev => ({ ...prev, loading: true }));
      
      const response = await apiClient.auth.login(email, password);
      
      if (response.success && response.data) {
        const { token, user } = response.data;
        
        // Set auth token in API client and localStorage
        apiClient.setAuth(token, user.clinicId);
        
        setAuthState({
          user,
          loading: false,
          isAuthenticated: true,
        });
        
        router.replace('/dashboard');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Login error:', error);
      setAuthState(prev => ({ ...prev, loading: false }));
      return false;
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await apiClient.auth.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearAuth();
      router.replace('/auth/login');
    }
  };

  const signup = async (data: SignupData): Promise<boolean> => {
    try {
      setAuthState(prev => ({ ...prev, loading: true }));
      
      const response = await apiClient.auth.signup(data);
      
      if (response.success) {
        setAuthState(prev => ({ ...prev, loading: false }));
        router.replace('/auth/verify-email');
        return true;
      }
      
      setAuthState(prev => ({ ...prev, loading: false }));
      return false;
    } catch (error) {
      console.error('Signup error:', error);
      setAuthState(prev => ({ ...prev, loading: false }));
      return false;
    }
  };

  const refreshToken = async (): Promise<boolean> => {
    try {
      const response = await apiClient.auth.refreshToken();
      
      if (response.success && response.data) {
        const { token, user } = response.data;
        
        apiClient.setAuth(token, user.clinicId);
        
        setAuthState({
          user,
          loading: false,
          isAuthenticated: true,
        });
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Token refresh error:', error);
      return false;
    }
  };

  const updateUser = (userData: Partial<User>) => {
    setAuthState(prev => ({
      ...prev,
      user: prev.user ? { ...prev.user, ...userData } : null,
    }));
  };

  const forgotPassword = async (email: string): Promise<boolean> => {
    try {
      const response = await apiClient.auth.forgotPassword(email);
      return response.success;
    } catch (error) {
      console.error('Forgot password error:', error);
      return false;
    }
  };

  const resetPassword = async (token: string, password: string): Promise<boolean> => {
    try {
      const response = await apiClient.auth.resetPassword(token, password);
      return response.success;
    } catch (error) {
      console.error('Reset password error:', error);
      return false;
    }
  };

  const verifyEmail = async (token: string): Promise<boolean> => {
    try {
      const response = await apiClient.auth.verifyEmail(token);
      
      if (response.success && response.data) {
        const { token: authToken, user } = response.data;
        
        apiClient.setAuth(authToken, user.clinicId);
        
        setAuthState({
          user,
          loading: false,
          isAuthenticated: true,
        });
        
        router.replace('/dashboard');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Email verification error:', error);
      return false;
    }
  };

  const contextValue: AuthContextValue = {
    ...authState,
    login,
    logout,
    signup,
    refreshToken,
    updateUser,
    forgotPassword,
    resetPassword,
    verifyEmail,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Helper hooks for role-based access
export const useRequireAuth = (requiredRole?: UserRole) => {
  const { user, isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!isAuthenticated) {
        router.replace('/auth/login');
        return;
      }

      if (requiredRole && user && user.role !== requiredRole) {
        router.replace('/dashboard');
        return;
      }
    }
  }, [isAuthenticated, loading, user, requiredRole, router]);

  return { user, isAuthenticated, loading };
};

export const useHasRole = (roles: UserRole | UserRole[]): boolean => {
  const { user } = useAuth();
  
  if (!user) return false;
  
  const roleArray = Array.isArray(roles) ? roles : [roles];
  return roleArray.includes(user.role);
};