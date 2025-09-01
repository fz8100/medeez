import { BaseEntity } from './common';

export type UserRole = 'doctor' | 'admin' | 'staff' | 'system_admin';

export interface User extends BaseEntity {
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
  npiNumber?: string;
  deaNumber?: string;
  settings: UserSettings;
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  notifications: {
    email: boolean;
    sms: boolean;
    push: boolean;
    appointmentReminders: boolean;
    invoiceAlerts: boolean;
    systemAlerts: boolean;
  };
  preferences: {
    defaultCalendarView: 'day' | 'week' | 'month';
    startOfWeek: 'sunday' | 'monday';
    timeZone: string;
    dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
    timeFormat: '12h' | '24h';
    language: 'en' | 'es' | 'fr';
  };
  privacy: {
    shareProfilePicture: boolean;
    shareContactInfo: boolean;
    allowDirectMessages: boolean;
  };
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface SignupData {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  clinicName: string;
  role?: UserRole;
  phoneNumber?: string;
  specialization?: string;
  licenseNumber?: string;
  termsAccepted: boolean;
  privacyAccepted: boolean;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
  confirmPassword: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface EmailVerificationRequest {
  token: string;
}

export interface MagicLinkRequest {
  email: string;
  redirectUrl?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
  isFirstLogin: boolean;
  requiresPasswordChange: boolean;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  clinicId: string;
  exp: number;
  iat: number;
  sub: string;
  aud: string;
  iss: string;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  deviceInfo: {
    userAgent: string;
    ipAddress: string;
    device: string;
    browser: string;
    os: string;
  };
  location?: {
    country: string;
    region: string;
    city: string;
  };
  createdAt: string;
  lastAccessAt: string;
  expiresAt: string;
  isActive: boolean;
}

export interface SecurityEvent {
  id: string;
  userId: string;
  eventType: 'login' | 'logout' | 'failed_login' | 'password_change' | 'profile_update' | 'suspicious_activity';
  ipAddress: string;
  userAgent: string;
  timestamp: string;
  details?: {
    failureReason?: string;
    changedFields?: string[];
    suspicionScore?: number;
  };
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface MFASetup {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export interface MFAVerification {
  token: string;
  backupCode?: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
}

export interface AuthActions {
  login: (credentials: LoginCredentials) => Promise<boolean>;
  logout: () => Promise<void>;
  signup: (data: SignupData) => Promise<boolean>;
  forgotPassword: (email: string) => Promise<boolean>;
  resetPassword: (token: string, password: string) => Promise<boolean>;
  verifyEmail: (token: string) => Promise<boolean>;
  changePassword: (data: ChangePasswordRequest) => Promise<boolean>;
  updateProfile: (data: Partial<User>) => Promise<boolean>;
  refreshToken: () => Promise<boolean>;
  requestMagicLink: (email: string) => Promise<boolean>;
  setupMFA: () => Promise<MFASetup>;
  verifyMFA: (verification: MFAVerification) => Promise<boolean>;
  disableMFA: (password: string) => Promise<boolean>;
}