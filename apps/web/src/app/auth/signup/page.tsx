'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2, AlertCircle, Check, Building2, User } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import toast from 'react-hot-toast';

const signupSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  confirmPassword: z.string(),
  clinicName: z.string().min(2, 'Clinic name must be at least 2 characters'),
  specialization: z.string().optional(),
  termsAccepted: z.boolean().refine(val => val === true, 'You must accept the terms and conditions'),
  privacyAccepted: z.boolean().refine(val => val === true, 'You must accept the privacy policy'),
  hipaaAccepted: z.boolean().refine(val => val === true, 'You must acknowledge HIPAA compliance'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type SignupFormData = z.infer<typeof signupSchema>;

const specializations = [
  'Family Medicine',
  'Internal Medicine',
  'Pediatrics',
  'Cardiology',
  'Dermatology',
  'Orthopedics',
  'Psychiatry',
  'General Surgery',
  'Obstetrics & Gynecology',
  'Ophthalmology',
  'Neurology',
  'Other',
];

export default function SignupPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { signup } = useAuth();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    setError,
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  });

  const password = watch('password', '');

  // Password strength checker
  const getPasswordStrength = (password: string) => {
    let strength = 0;
    const checks = [
      { regex: /.{8,}/, label: 'At least 8 characters' },
      { regex: /[A-Z]/, label: 'One uppercase letter' },
      { regex: /[a-z]/, label: 'One lowercase letter' },
      { regex: /[0-9]/, label: 'One number' },
      { regex: /[^A-Za-z0-9]/, label: 'One special character' },
    ];

    const passed = checks.map(check => ({
      ...check,
      passed: check.regex.test(password),
    }));

    strength = passed.filter(check => check.passed).length;

    return { strength, checks: passed };
  };

  const { strength, checks } = getPasswordStrength(password);

  const onSubmit = async (data: SignupFormData) => {
    setIsLoading(true);

    try {
      const signupData = {
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        clinicName: data.clinicName,
        role: 'doctor' as const,
      };

      const success = await signup(signupData);
      
      if (success) {
        toast.success('Account created! Please check your email to verify your account.');
        router.push('/auth/verify-email');
      } else {
        setError('root', {
          type: 'manual',
          message: 'Failed to create account. Please try again.',
        });
      }
    } catch (error: any) {
      console.error('Signup error:', error);
      
      if (error?.response?.data?.error?.code === 'USER_ALREADY_EXISTS') {
        setError('email', {
          type: 'manual',
          message: 'An account with this email already exists.',
        });
      } else {
        toast.error('An error occurred during signup. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">Create your account</h1>
        <p className="text-gray-600">
          Start managing your medical practice with Medeez
        </p>
      </div>

      {/* Signup form */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-medical-600" />
            Practice Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Personal Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  placeholder="John"
                  disabled={isLoading}
                  {...register('firstName')}
                  className={errors.firstName ? 'border-red-500' : ''}
                />
                {errors.firstName && (
                  <p className="text-sm text-red-600">{errors.firstName.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  placeholder="Doe"
                  disabled={isLoading}
                  {...register('lastName')}
                  className={errors.lastName ? 'border-red-500' : ''}
                />
                {errors.lastName && (
                  <p className="text-sm text-red-600">{errors.lastName.message}</p>
                )}
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                placeholder="doctor@example.com"
                disabled={isLoading}
                {...register('email')}
                className={errors.email ? 'border-red-500' : ''}
              />
              {errors.email && (
                <p className="text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            {/* Clinic Information */}
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-5 h-5 text-medical-600" />
                <h3 className="font-semibold">Clinic Information</h3>
              </div>

              <div className="space-y-2">
                <Label htmlFor="clinicName">Clinic/Practice Name *</Label>
                <Input
                  id="clinicName"
                  placeholder="Downtown Medical Center"
                  disabled={isLoading}
                  {...register('clinicName')}
                  className={errors.clinicName ? 'border-red-500' : ''}
                />
                {errors.clinicName && (
                  <p className="text-sm text-red-600">{errors.clinicName.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="specialization">Specialization (Optional)</Label>
                <select
                  id="specialization"
                  {...register('specialization')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-500"
                  disabled={isLoading}
                >
                  <option value="">Select a specialization</option>
                  {specializations.map((spec) => (
                    <option key={spec} value={spec}>
                      {spec}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Password */}
            <div className="space-y-4 pt-4 border-t">
              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a strong password"
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

                {/* Password strength indicator */}
                {password && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <div
                            key={level}
                            className={`h-1 w-6 rounded-full ${
                              level <= strength
                                ? strength <= 2
                                  ? 'bg-red-500'
                                  : strength <= 4
                                  ? 'bg-yellow-500'
                                  : 'bg-green-500'
                                : 'bg-gray-200'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs font-medium">
                        {strength <= 2 ? 'Weak' : strength <= 4 ? 'Good' : 'Strong'}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-1">
                      {checks.map((check, index) => (
                        <div
                          key={index}
                          className={`flex items-center gap-2 text-xs ${
                            check.passed ? 'text-green-600' : 'text-gray-500'
                          }`}
                        >
                          <Check className={`w-3 h-3 ${check.passed ? 'text-green-600' : 'text-gray-300'}`} />
                          {check.label}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password *</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm your password"
                    disabled={isLoading}
                    {...register('confirmPassword')}
                    className={errors.confirmPassword ? 'border-red-500' : 'pr-10'}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    disabled={isLoading}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-sm text-red-600">{errors.confirmPassword.message}</p>
                )}
              </div>
            </div>

            {/* Terms and agreements */}
            <div className="space-y-4 pt-4 border-t">
              <div className="space-y-3">
                <div className="flex items-start space-x-2">
                  <input
                    type="checkbox"
                    id="termsAccepted"
                    className="mt-1 rounded border-gray-300 text-medical-600 focus:ring-medical-500"
                    {...register('termsAccepted')}
                    disabled={isLoading}
                  />
                  <Label htmlFor="termsAccepted" className="text-sm leading-relaxed">
                    I agree to the{' '}
                    <Link href="/terms" className="text-medical-600 hover:text-medical-700 font-medium">
                      Terms of Service
                    </Link>
                  </Label>
                </div>
                {errors.termsAccepted && (
                  <p className="text-sm text-red-600 ml-6">{errors.termsAccepted.message}</p>
                )}

                <div className="flex items-start space-x-2">
                  <input
                    type="checkbox"
                    id="privacyAccepted"
                    className="mt-1 rounded border-gray-300 text-medical-600 focus:ring-medical-500"
                    {...register('privacyAccepted')}
                    disabled={isLoading}
                  />
                  <Label htmlFor="privacyAccepted" className="text-sm leading-relaxed">
                    I agree to the{' '}
                    <Link href="/privacy" className="text-medical-600 hover:text-medical-700 font-medium">
                      Privacy Policy
                    </Link>
                  </Label>
                </div>
                {errors.privacyAccepted && (
                  <p className="text-sm text-red-600 ml-6">{errors.privacyAccepted.message}</p>
                )}

                <div className="flex items-start space-x-2">
                  <input
                    type="checkbox"
                    id="hipaaAccepted"
                    className="mt-1 rounded border-gray-300 text-medical-600 focus:ring-medical-500"
                    {...register('hipaaAccepted')}
                    disabled={isLoading}
                  />
                  <Label htmlFor="hipaaAccepted" className="text-sm leading-relaxed">
                    I acknowledge that I understand HIPAA compliance requirements and will ensure
                    proper handling of protected health information (PHI)
                  </Label>
                </div>
                {errors.hipaaAccepted && (
                  <p className="text-sm text-red-600 ml-6">{errors.hipaaAccepted.message}</p>
                )}
              </div>
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
                  Creating account...
                </>
              ) : (
                'Create account'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="text-center space-y-4">
        <div className="text-sm text-gray-600">
          Already have an account?{' '}
          <Link
            href="/auth/login"
            className="text-medical-600 hover:text-medical-700 font-medium"
          >
            Sign in
          </Link>
        </div>
        
        <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
          <Link href="/privacy" className="hover:text-medical-600">
            Privacy Policy
          </Link>
          <span>•</span>
          <Link href="/terms" className="hover:text-medical-600">
            Terms of Service
          </Link>
        </div>
      </div>
    </div>
  );
}