import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Providers } from '@/providers/providers';
import { Toaster } from 'react-hot-toast';
import '@/styles/globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    template: '%s | Medeez',
    default: 'Medeez - Solo Doctor Practice Management',
  },
  description: 'HIPAA-compliant practice management system designed for solo doctors. Manage patients, appointments, notes, and billing efficiently.',
  keywords: ['medical', 'healthcare', 'practice management', 'HIPAA', 'solo doctor', 'EMR', 'EHR'],
  authors: [{ name: 'Medeez Team' }],
  creator: 'Medeez',
  publisher: 'Medeez',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://app.medeez.com'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    title: 'Medeez - Solo Doctor Practice Management',
    description: 'HIPAA-compliant practice management system designed for solo doctors.',
    siteName: 'Medeez',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Medeez - Solo Doctor Practice Management',
    description: 'HIPAA-compliant practice management system designed for solo doctors.',
    creator: '@medeez',
  },
  robots: {
    index: false, // Medical app shouldn't be indexed
    follow: false,
    noarchive: true,
    nosnippet: true,
    noimageindex: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Prevent FOUC */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark')
                } else {
                  document.documentElement.classList.remove('dark')
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: 'hsl(var(--background))',
                color: 'hsl(var(--foreground))',
                border: '1px solid hsl(var(--border))',
              },
              success: {
                iconTheme: {
                  primary: 'hsl(var(--primary))',
                  secondary: 'hsl(var(--primary-foreground))',
                },
              },
              error: {
                iconTheme: {
                  primary: 'hsl(var(--destructive))',
                  secondary: 'hsl(var(--destructive-foreground))',
                },
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}