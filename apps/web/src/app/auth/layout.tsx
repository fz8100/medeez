import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Authentication | Medeez',
  description: 'Secure login to your medical practice management system',
  robots: {
    index: false,
    follow: false,
  },
};

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className={`min-h-screen bg-gradient-to-br from-medical-50 to-medical-100 ${inter.className}`}>
      <div className="flex min-h-screen">
        {/* Left side - Branding */}
        <div className="hidden lg:flex lg:w-1/2 xl:w-2/3 bg-medical-600 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-medical-600 via-medical-700 to-medical-800" />
          
          {/* Decorative elements */}
          <div className="absolute top-20 left-20 w-72 h-72 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-medical-500/10 rounded-full blur-3xl" />
          
          <div className="relative z-10 flex flex-col justify-center px-12 py-12 text-white">
            <div className="max-w-md">
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-white"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h1 className="text-2xl font-bold">Medeez</h1>
                </div>
                
                <h2 className="text-4xl font-bold leading-tight mb-4">
                  Secure Practice
                  <br />
                  Management
                </h2>
                
                <p className="text-xl text-medical-100 leading-relaxed">
                  HIPAA-compliant platform designed specifically for solo healthcare practitioners.
                  Manage patients, appointments, and billing with confidence.
                </p>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-medical-100">
                  <div className="w-2 h-2 bg-medical-300 rounded-full" />
                  <span>End-to-end encryption for all patient data</span>
                </div>
                <div className="flex items-center gap-3 text-medical-100">
                  <div className="w-2 h-2 bg-medical-300 rounded-full" />
                  <span>Streamlined appointment scheduling</span>
                </div>
                <div className="flex items-center gap-3 text-medical-100">
                  <div className="w-2 h-2 bg-medical-300 rounded-full" />
                  <span>Integrated billing and payment processing</span>
                </div>
                <div className="flex items-center gap-3 text-medical-100">
                  <div className="w-2 h-2 bg-medical-300 rounded-full" />
                  <span>Comprehensive SOAP note templates</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Right side - Auth form */}
        <div className="w-full lg:w-1/2 xl:w-1/3 flex items-center justify-center p-8">
          <div className="w-full max-w-md">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}