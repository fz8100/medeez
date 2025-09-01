'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Mail, Loader2, CheckCircle } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { forgotPassword } = useAuth();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setIsLoading(true);

    try {
      const success = await forgotPassword(data.email);
      
      if (success) {
        setIsSuccess(true);
      }
    } catch (error) {
      console.error('Forgot password error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Check your email</h1>
          <p className="text-gray-600">
            We've sent password reset instructions to:
          </p>
          <p className="font-medium text-medical-600">
            {getValues('email')}
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="bg-medical-50 border border-medical-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-medical-600 mt-0.5 shrink-0" />
                  <div className="text-sm text-medical-800">
                    <p className="font-medium">What to do next:</p>
                    <ul className="mt-2 space-y-1 list-disc list-inside text-medical-700">
                      <li>Check your email inbox and spam folder</li>
                      <li>Click the password reset link within 1 hour</li>
                      <li>Create a new secure password</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <Button
                  onClick={() => window.location.reload()}
                  variant="outline"
                  className="w-full"
                >
                  Resend email
                </Button>
                
                <Button asChild className="w-full">
                  <Link href="/auth/login">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to sign in
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="text-center text-sm text-gray-600">
          Didn't receive the email? Check your spam folder or{' '}
          <button
            onClick={() => setIsSuccess(false)}
            className="text-medical-600 hover:text-medical-700 font-medium"
          >
            try a different email address
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/auth/login">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to sign in
          </Link>
        </Button>
      </div>

      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">Forgot your password?</h1>
        <p className="text-gray-600">
          Enter your email address and we'll send you a secure link to reset your password.
        </p>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-medical-600" />
            Reset Password
          </CardTitle>
          <CardDescription>
            We'll send password reset instructions to your email address.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email address"
                autoComplete="email"
                disabled={isLoading}
                {...register('email')}
                className={errors.email ? 'border-red-500' : ''}
              />
              {errors.email && (
                <p className="text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

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
                  Sending reset link...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  Send reset link
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Security notice */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="text-sm text-gray-700">
          <p className="font-medium mb-2">Security Notice:</p>
          <ul className="space-y-1 list-disc list-inside text-gray-600">
            <li>Password reset links expire after 1 hour</li>
            <li>Links can only be used once</li>
            <li>We never send passwords via email</li>
            <li>Contact support if you need additional help</li>
          </ul>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-sm text-gray-600">
        Remember your password?{' '}
        <Link
          href="/auth/login"
          className="text-medical-600 hover:text-medical-700 font-medium"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}