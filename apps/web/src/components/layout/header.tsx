'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  Bell, 
  Search, 
  Settings, 
  User, 
  LogOut, 
  Menu,
  Moon,
  Sun,
  Monitor,
  Shield
} from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/theme-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface HeaderProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export default function Header({ sidebarCollapsed, onToggleSidebar }: HeaderProps) {
  const [searchFocused, setSearchFocused] = useState(false);
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const handleLogout = async () => {
    await logout();
  };

  // Mock notifications count - in real app this would come from API
  const notificationsCount = 3;

  return (
    <header className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 lg:px-6 py-3">
      <div className="flex items-center justify-between">
        {/* Left side - Search */}
        <div className="flex items-center gap-4 flex-1">
          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleSidebar}
            className="lg:hidden"
          >
            <Menu className="w-5 h-5" />
          </Button>

          {/* Search */}
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search patients, appointments, notes..."
              className={cn(
                "pl-10 pr-4 py-2 transition-all duration-200",
                searchFocused && "ring-2 ring-medical-500 ring-opacity-20"
              )}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />
          </div>
        </div>

        {/* Right side - User actions */}
        <div className="flex items-center gap-2 lg:gap-4">
          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="relative">
                <Bell className="w-5 h-5" />
                {notificationsCount > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-1 -right-1 h-5 w-5 text-xs flex items-center justify-center p-0"
                  >
                    {notificationsCount}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel className="flex items-center justify-between">
                <span>Notifications</span>
                <Badge variant="secondary">{notificationsCount}</Badge>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              
              {/* Mock notifications */}
              <div className="max-h-96 overflow-y-auto">
                <DropdownMenuItem className="flex-col items-start p-3 cursor-pointer">
                  <div className="flex items-start gap-3 w-full">
                    <div className="w-2 h-2 bg-medical-600 rounded-full mt-2 shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">New appointment booked</p>
                      <p className="text-xs text-gray-600 mt-1">
                        Sarah Johnson scheduled for tomorrow at 2:00 PM
                      </p>
                      <p className="text-xs text-gray-500 mt-1">5 minutes ago</p>
                    </div>
                  </div>
                </DropdownMenuItem>
                
                <DropdownMenuItem className="flex-col items-start p-3 cursor-pointer">
                  <div className="flex items-start gap-3 w-full">
                    <div className="w-2 h-2 bg-orange-600 rounded-full mt-2 shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">Payment overdue</p>
                      <p className="text-xs text-gray-600 mt-1">
                        Invoice #1234 from John Doe is 5 days overdue
                      </p>
                      <p className="text-xs text-gray-500 mt-1">2 hours ago</p>
                    </div>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuItem className="flex-col items-start p-3 cursor-pointer">
                  <div className="flex items-start gap-3 w-full">
                    <div className="w-2 h-2 bg-green-600 rounded-full mt-2 shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">Lab results received</p>
                      <p className="text-xs text-gray-600 mt-1">
                        Blood work results for Emily Davis are ready for review
                      </p>
                      <p className="text-xs text-gray-500 mt-1">1 day ago</p>
                    </div>
                  </div>
                </DropdownMenuItem>
              </div>

              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/notifications" className="cursor-pointer">
                  View all notifications
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Theme Toggle */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Toggle theme</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTheme("light")}>
                <Sun className="mr-2 h-4 w-4" />
                <span>Light</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("dark")}>
                <Moon className="mr-2 h-4 w-4" />
                <span>Dark</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("system")}>
                <Monitor className="mr-2 h-4 w-4" />
                <span>System</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 px-2">
                <Avatar className="w-8 h-8">
                  <div className="w-full h-full bg-medical-100 flex items-center justify-center rounded-full">
                    <span className="text-medical-700 text-sm font-medium">
                      {user?.firstName?.[0]}{user?.lastName?.[0]}
                    </span>
                  </div>
                </Avatar>
                {!sidebarCollapsed && user && (
                  <div className="hidden lg:block text-left">
                    <p className="text-sm font-medium">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-xs text-gray-600">{user.role}</p>
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex flex-col">
                <span>{user?.firstName} {user?.lastName}</span>
                <span className="text-xs font-normal text-gray-600">
                  {user?.email}
                </span>
                <span className="text-xs font-normal text-gray-500 capitalize">
                  {user?.role} • {user?.clinicName}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              
              <DropdownMenuItem asChild>
                <Link href="/dashboard/profile" className="cursor-pointer">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings" className="cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              
              <DropdownMenuItem asChild>
                <Link href="/privacy" className="cursor-pointer">
                  <Shield className="mr-2 h-4 w-4" />
                  Privacy & HIPAA
                </Link>
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              
              <DropdownMenuItem 
                className="cursor-pointer text-red-600 focus:text-red-600"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}