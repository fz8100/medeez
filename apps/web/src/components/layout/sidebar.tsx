'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Calendar,
  Users,
  FileText,
  DollarSign,
  Settings,
  Home,
  Stethoscope,
  ClipboardList,
  FolderOpen,
  BarChart3,
  Bell,
  Shield,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Activity
} from 'lucide-react';
import { useAuth, useHasRole } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  roles?: string[];
  children?: NavItem[];
}

const navItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: Home,
  },
  {
    title: 'Patients',
    href: '/dashboard/patients',
    icon: Users,
    badge: 'New',
  },
  {
    title: 'Appointments',
    href: '/dashboard/appointments',
    icon: Calendar,
  },
  {
    title: 'Clinical Notes',
    href: '/dashboard/notes',
    icon: FileText,
    children: [
      {
        title: 'SOAP Notes',
        href: '/dashboard/notes/soap',
        icon: Stethoscope,
      },
      {
        title: 'Templates',
        href: '/dashboard/notes/templates',
        icon: ClipboardList,
      },
    ],
  },
  {
    title: 'Billing',
    href: '/dashboard/billing',
    icon: DollarSign,
    children: [
      {
        title: 'Invoices',
        href: '/dashboard/billing/invoices',
        icon: FileText,
      },
      {
        title: 'Payments',
        href: '/dashboard/billing/payments',
        icon: DollarSign,
      },
    ],
  },
  {
    title: 'Files',
    href: '/dashboard/files',
    icon: FolderOpen,
  },
  {
    title: 'Reports',
    href: '/dashboard/reports',
    icon: BarChart3,
    roles: ['doctor', 'admin'],
  },
  {
    title: 'Administration',
    href: '/dashboard/admin',
    icon: Shield,
    roles: ['admin', 'system_admin'],
    children: [
      {
        title: 'Users',
        href: '/dashboard/admin/users',
        icon: Users,
        roles: ['admin', 'system_admin'],
      },
      {
        title: 'Audit Logs',
        href: '/dashboard/admin/audit',
        icon: Activity,
        roles: ['admin', 'system_admin'],
      },
    ],
  },
  {
    title: 'Settings',
    href: '/dashboard/settings',
    icon: Settings,
  },
];

export default function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const pathname = usePathname();
  const { user } = useAuth();
  const hasRole = useHasRole;

  // Auto-expand items based on current path
  useEffect(() => {
    const shouldExpand: string[] = [];
    navItems.forEach(item => {
      if (item.children?.some(child => pathname.startsWith(child.href))) {
        shouldExpand.push(item.href);
      }
    });
    setExpandedItems(shouldExpand);
  }, [pathname]);

  const toggleExpanded = (href: string) => {
    setExpandedItems(prev => 
      prev.includes(href) 
        ? prev.filter(item => item !== href)
        : [...prev, href]
    );
  };

  const isActiveLink = (href: string) => {
    if (href === '/dashboard') {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  const filteredNavItems = navItems.filter(item => {
    if (!item.roles) return true;
    if (!user) return false;
    return hasRole(item.roles);
  });

  const SidebarContent = () => (
    <>
      {/* Logo/Brand */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-medical-600 rounded-lg flex items-center justify-center">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Medeez</h1>
              {user?.clinicName && (
                <p className="text-sm text-gray-600 truncate max-w-[140px]">
                  {user.clinicName}
                </p>
              )}
            </div>
          </div>
        )}
        
        {/* Desktop collapse toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleCollapse}
          className="hidden lg:flex p-1.5"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </Button>

        {/* Mobile close */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* User info */}
      {!collapsed && user && (
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-medical-100 rounded-full flex items-center justify-center">
              <span className="text-medical-700 font-medium">
                {user.firstName[0]}{user.lastName[0]}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900 truncate">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-sm text-gray-600 truncate">{user.role}</p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {filteredNavItems.map((item) => {
          const hasChildren = item.children && item.children.length > 0;
          const isExpanded = expandedItems.includes(item.href);
          const isActive = isActiveLink(item.href);
          const filteredChildren = item.children?.filter(child => {
            if (!child.roles) return true;
            if (!user) return false;
            return hasRole(child.roles);
          });

          return (
            <div key={item.href}>
              {/* Main nav item */}
              <div className="relative">
                {hasChildren ? (
                  <button
                    onClick={() => toggleExpanded(item.href)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                      isActive
                        ? 'bg-medical-100 text-medical-700 border border-medical-200'
                        : 'text-gray-700 hover:bg-gray-100',
                      collapsed && 'justify-center px-2'
                    )}
                  >
                    <item.icon className="w-5 h-5 shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="flex-1 font-medium">{item.title}</span>
                        {item.badge && (
                          <Badge variant="secondary" className="text-xs">
                            {item.badge}
                          </Badge>
                        )}
                        <ChevronRight 
                          className={cn(
                            'w-4 h-4 transition-transform',
                            isExpanded && 'rotate-90'
                          )}
                        />
                      </>
                    )}
                  </button>
                ) : (
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                      isActive
                        ? 'bg-medical-100 text-medical-700 border border-medical-200'
                        : 'text-gray-700 hover:bg-gray-100',
                      collapsed && 'justify-center px-2'
                    )}
                  >
                    <item.icon className="w-5 h-5 shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="flex-1 font-medium">{item.title}</span>
                        {item.badge && (
                          <Badge variant="secondary" className="text-xs">
                            {item.badge}
                          </Badge>
                        )}
                      </>
                    )}
                  </Link>
                )}

                {/* Active indicator */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-medical-600 rounded-r-full" />
                )}
              </div>

              {/* Children */}
              {hasChildren && isExpanded && !collapsed && filteredChildren && (
                <div className="ml-6 mt-2 space-y-1 border-l-2 border-gray-100">
                  {filteredChildren.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 ml-4 rounded-lg text-sm transition-colors',
                        isActiveLink(child.href)
                          ? 'bg-medical-50 text-medical-700 border border-medical-200'
                          : 'text-gray-600 hover:bg-gray-50'
                      )}
                    >
                      <child.icon className="w-4 h-4 shrink-0" />
                      <span>{child.title}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="p-4 border-t border-gray-200">
          <div className="text-xs text-gray-500">
            <p>Medeez v2.0</p>
            <p>HIPAA Compliant</p>
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile trigger */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-white shadow-md"
      >
        <Menu className="w-5 h-5" />
      </Button>

      {/* Desktop sidebar */}
      <aside 
        className={cn(
          'fixed left-0 top-0 h-full bg-white border-r border-gray-200 z-30 transition-all duration-300 hidden lg:flex flex-col',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      <aside 
        className={cn(
          'fixed left-0 top-0 h-full bg-white border-r border-gray-200 z-50 transition-transform duration-300 flex flex-col lg:hidden w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <SidebarContent />
      </aside>
    </>
  );
}