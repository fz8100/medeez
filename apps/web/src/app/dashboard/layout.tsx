'use client';

import { useState } from 'react';
import { useAuth, useRequireAuth } from '@/providers/auth-provider';
import Sidebar from '@/components/layout/sidebar';
import Header from '@/components/layout/header';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { loading } = useRequireAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar 
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main content area */}
      <div 
        className={`transition-all duration-300 ${
          sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'
        }`}
      >
        {/* Header */}
        <Header 
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Page content */}
        <main className="p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}