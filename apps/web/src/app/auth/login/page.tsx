'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2, AlertCircle, Shield } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import toast from 'react-hot-toast';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().default(false),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const redirectTo = searchParams.get('redirect') || '/dashboard';

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);

    try {
      const success = await login(data.email, data.password);
      
      if (success) {
        toast.success('Welcome back!');
        router.push(redirectTo);
      } else {
        setError('root', {
          type: 'manual',
          message: 'Invalid email or password. Please try again.',
        });
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error('An error occurred during login. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">Welcome back</h1>
        <p className="text-gray-600">
          Sign in to your secure medical practice account
        </p>
      </div>

      {/* Security notice */}
      <div className="bg-medical-50 border border-medical-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-medical-600 mt-0.5 shrink-0" />
          <div className="text-sm text-medical-800">
            <p className="font-medium">HIPAA-Compliant Login</p>
            <p className="text-medical-700 mt-1">
              Your login is secured with end-to-end encryption to protect patient data.
            </p>
          </div>
        </div>
      </div>

      {/* Login form */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Email field */}
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="doctor@example.com"
                autoComplete="email"
                disabled={isLoading}
                {...register('email')}
                className={errors.email ? 'border-red-500' : ''}
              />
              {errors.email && (
                <p className="text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            {/* Password field */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  disabled={isLoading}
                  {...register('password')}
                  className={errors.password ? 'border-red-500' : 'pr-10'}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>

            {/* Remember me */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="rememberMe"
                  className="rounded border-gray-300 text-medical-600 focus:ring-medical-500"
                  {...register('rememberMe')}
                  disabled={isLoading}
                />
                <Label htmlFor="rememberMe" className="text-sm">
                  Remember me
                </Label>
              </div>
              
              <Link
                href="/auth/forgot-password"
                className="text-sm text-medical-600 hover:text-medical-700 font-medium"
              >
                Forgot password?
              </Link>
            </div>

            {/* Error message */}
            {errors.root && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <p className="text-sm text-red-800">{errors.root.message}</p>
                </div>
              </div>
            )}

            {/* Submit button */}
            <Button
              type="submit"
              className="w-full"
              variant="medical"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Footer links */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-4 text-sm text-gray-600">
          <Link
            href="/auth/magic-link"
            className="hover:text-medical-600 font-medium"
          >
            Magic Link Login
          </Link>
          <span>•</span>
          <Link
            href="/privacy"
            className="hover:text-medical-600"
          >
            Privacy Policy
          </Link>
        </div>
        
        <div className="text-sm text-gray-600">
          Don't have an account?{' '}
          <Link
            href="/auth/signup"
            className="text-medical-600 hover:text-medical-700 font-medium"
          >
            Sign up for Medeez
          </Link>
        </div>
      </div>

      {/* Demo credentials notice for development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
          <p className="text-sm text-yellow-800">
            <strong>Demo:</strong> Use demo@medeez.com / password123 for testing
          </p>
        </div>
      )}
    </div>
  );
}