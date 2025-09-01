'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider } from './theme-provider';
import { AuthProvider } from './auth-provider';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale time for medical data (5 minutes)
      staleTime: 5 * 60 * 1000,
      // Cache time for medical data (10 minutes)
      gcTime: 10 * 60 * 1000,
      // Retry failed requests
      retry: (failureCount, error: any) => {
        // Don't retry on 4xx errors (client errors)
        if (error?.response?.status >= 400 && error?.response?.status < 500) {
          return false;
        }
        // Retry up to 3 times for other errors
        return failureCount < 3;
      },
      // Refetch on window focus for critical medical data
      refetchOnWindowFocus: true,
      // Background refetch interval for real-time updates
      refetchInterval: 30 * 1000, // 30 seconds
    },
    mutations: {
      // Retry failed mutations
      retry: 1,
      // Show loading states for mutations
      onError: (error: any) => {
        console.error('Mutation error:', error);
      },
    },
  },
});

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <AuthProvider>
          {children}
          {process.env.NODE_ENV === 'development' && (
            <ReactQueryDevtools
              initialIsOpen={false}
              position="bottom-right"
            />
          )}
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}