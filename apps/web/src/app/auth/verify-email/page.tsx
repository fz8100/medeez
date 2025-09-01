'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, CheckCircle, AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export default function VerifyEmailPage() {
  const [verificationState, setVerificationState] = useState<'waiting' | 'verifying' | 'success' | 'error'>('waiting');
  const [errorMessage, setErrorMessage] = useState('');
  const { user, verifyEmail } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  useEffect(() => {
    if (token) {
      handleVerification(token);
    }
  }, [token]);

  const handleVerification = async (verificationToken: string) => {
    setVerificationState('verifying');
    
    try {
      const success = await verifyEmail(verificationToken);
      
      if (success) {
        setVerificationState('success');
        // Redirect to dashboard after 3 seconds
        setTimeout(() => {
          router.push('/dashboard');
        }, 3000);
      } else {
        setVerificationState('error');
        setErrorMessage('Invalid or expired verification link.');
      }
    } catch (error: any) {
      console.error('Email verification error:', error);
      setVerificationState('error');
      setErrorMessage(error.message || 'Verification failed. Please try again.');
    }
  };

  const handleResendVerification = async () => {
    // In a real app, this would call an API to resend verification email
    console.log('Resending verification email...');
  };

  // If verifying with token
  if (verificationState === 'verifying') {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-4">
          <LoadingSpinner size="lg" />
          <h1 className="text-3xl font-bold text-gray-900">Verifying your email</h1>
          <p className="text-gray-600">Please wait while we verify your email address...</p>
        </div>
      </div>
    );
  }

  // If verification successful
  if (verificationState === 'success') {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Email verified!</h1>
          <p className="text-gray-600">
            Your email has been successfully verified. You can now access all features.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800 font-medium">
                  Welcome to Medeez! Your account is now fully activated.
                </p>
              </div>
              
              <p className="text-sm text-gray-600">
                Redirecting you to your dashboard in a few seconds...
              </p>
              
              <Button asChild className="w-full" variant="medical">
                <Link href="/dashboard">
                  Go to Dashboard
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If verification failed
  if (verificationState === 'error') {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Verification failed</h1>
          <p className="text-gray-600">{errorMessage}</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 text-sm">
                  The verification link may have expired or been used already. 
                  You can request a new verification email below.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <Button
                  onClick={handleResendVerification}
                  variant="medical"
                  className="w-full"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Send new verification email
                </Button>
                
                <Button asChild variant="outline" className="w-full">
                  <Link href="/auth/login">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to sign in
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Default state - waiting for verification
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
        <div className="w-16 h-16 bg-medical-100 rounded-full flex items-center justify-center mx-auto">
          <Mail className="w-8 h-8 text-medical-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Verify your email</h1>
        <p className="text-gray-600">
          We've sent a verification link to your email address.
        </p>
        {user && (
          <p className="font-medium text-medical-600">{user.email}</p>
        )}
      </div>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            Follow the instructions in the email to verify your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-medical-50 border border-medical-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-medical-600 mt-0.5 shrink-0" />
              <div className="text-sm text-medical-800">
                <p className="font-medium">What to do next:</p>
                <ol className="mt-2 space-y-1 list-decimal list-inside text-medical-700">
                  <li>Check your email inbox and spam folder</li>
                  <li>Click the verification link in the email</li>
                  <li>You'll be automatically signed in</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              onClick={handleResendVerification}
              variant="outline"
              className="w-full"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Resend verification email
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Help */}
      <div className="text-center space-y-4">
        <div className="text-sm text-gray-600">
          Having trouble? Check your spam folder or{' '}
          <button
            onClick={handleResendVerification}
            className="text-medical-600 hover:text-medical-700 font-medium"
          >
            request a new verification email
          </button>
        </div>
        
        <div className="text-sm text-gray-600">
          Need help?{' '}
          <Link
            href="mailto:support@medeez.com"
            className="text-medical-600 hover:text-medical-700 font-medium"
          >
            Contact support
          </Link>
        </div>
      </div>
    </div>
  );
}