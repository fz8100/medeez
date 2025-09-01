import { redirect } from 'next/navigation';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard',
};

// Root page redirects to dashboard for authenticated users
// or login for unauthenticated users
export default function HomePage() {
  // This will be handled by middleware for auth check
  redirect('/dashboard');
}