'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useQuery } from '@tanstack/react-query';
import { 
  Calendar,
  Users,
  FileText,
  DollarSign,
  Activity,
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle,
  Plus,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar } from '@/components/ui/avatar';
import { apiClient } from '@/lib/api-client';
import { formatCurrency, formatDate, getRelativeTime } from '@/lib/utils';
import Link from 'next/link';

// Mock data for dashboard stats - in real app this would come from API
const mockStats = {
  patients: { total: 1247, newThisMonth: 23, active: 1198 },
  appointments: { 
    today: { total: 12, completed: 8, pending: 3, cancelled: 1 },
    thisWeek: { total: 67, scheduled: 52 },
    thisMonth: { total: 284, revenue: 28400 }
  },
  billing: {
    revenue: { thisMonth: 28400, lastMonth: 26200, percentChange: 8.4 },
    outstanding: { total: 5600, count: 23 }
  }
};

// Quick action items based on user role
const getQuickActions = (role: string) => {
  const commonActions = [
    { title: 'New Patient', href: '/dashboard/patients/new', icon: Users, variant: 'medical' as const },
    { title: 'Schedule Appointment', href: '/dashboard/appointments/new', icon: Calendar, variant: 'default' as const },
    { title: 'Create Note', href: '/dashboard/notes/new', icon: FileText, variant: 'default' as const },
  ];

  if (role === 'admin' || role === 'system_admin') {
    return [
      ...commonActions,
      { title: 'Create Invoice', href: '/dashboard/billing/invoices/new', icon: DollarSign, variant: 'default' as const },
      { title: 'View Reports', href: '/dashboard/reports', icon: Activity, variant: 'secondary' as const },
    ];
  }

  return commonActions;
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [selectedTab, setSelectedTab] = useState('overview');

  // Fetch dashboard data
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => apiClient.dashboard.getStats(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: upcomingAppointments } = useQuery({
    queryKey: ['dashboard', 'appointments', 'upcoming'],
    queryFn: () => apiClient.dashboard.getUpcomingAppointments(5),
  });

  const { data: recentActivity } = useQuery({
    queryKey: ['dashboard', 'activity'],
    queryFn: () => apiClient.dashboard.getRecentActivity(10),
  });

  if (!user) return null;

  const quickActions = getQuickActions(user.role);

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back, {user.firstName}!
          </h1>
          <p className="text-gray-600 mt-1">
            {formatDate(new Date(), 'long')} • {user.clinicName}
          </p>
        </div>
        
        {/* Quick Actions */}
        <div className="flex gap-2">
          {quickActions.slice(0, 3).map((action, index) => (
            <Button
              key={action.href}
              asChild
              variant={action.variant}
              size="sm"
              className={index === 0 ? '' : 'hidden sm:inline-flex'}
            >
              <Link href={action.href}>
                <action.icon className="w-4 h-4 mr-2" />
                {action.title}
              </Link>
            </Button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Appointments */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Today's Appointments</p>
                <p className="text-2xl font-bold text-gray-900">
                  {mockStats.appointments.today.total}
                </p>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
                  <span className="flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-green-600" />
                    {mockStats.appointments.today.completed} completed
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-orange-600" />
                    {mockStats.appointments.today.pending} pending
                  </span>
                </div>
              </div>
              <div className="w-12 h-12 bg-medical-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-6 h-6 text-medical-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Patients */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Patients</p>
                <p className="text-2xl font-bold text-gray-900">
                  {mockStats.patients.total.toLocaleString()}
                </p>
                <p className="text-xs text-green-600 mt-2">
                  +{mockStats.patients.newThisMonth} new this month
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Revenue */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Monthly Revenue</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(mockStats.billing.revenue.thisMonth)}
                </p>
                <div className="flex items-center gap-1 mt-2">
                  <TrendingUp className="w-3 h-3 text-green-600" />
                  <span className="text-xs text-green-600">
                    +{mockStats.billing.revenue.percentChange}% from last month
                  </span>
                </div>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Outstanding Payments */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Outstanding</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(mockStats.billing.outstanding.total)}
                </p>
                <p className="text-xs text-orange-600 mt-2">
                  {mockStats.billing.outstanding.count} invoices pending
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="activity">Recent Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upcoming Appointments */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Upcoming Appointments</CardTitle>
                  <CardDescription>Next 5 scheduled appointments</CardDescription>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/appointments">
                    View All
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Mock upcoming appointments */}
                {[
                  {
                    id: '1',
                    patientName: 'Sarah Johnson',
                    time: '2:00 PM',
                    type: 'Follow-up',
                    status: 'confirmed'
                  },
                  {
                    id: '2',
                    patientName: 'Mike Chen',
                    time: '3:30 PM',
                    type: 'Consultation',
                    status: 'pending'
                  },
                  {
                    id: '3',
                    patientName: 'Emma Davis',
                    time: '4:00 PM',
                    type: 'Routine Checkup',
                    status: 'confirmed'
                  },
                ].map((appointment) => (
                  <div key={appointment.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-8 h-8">
                        <div className="w-full h-full bg-gray-200 flex items-center justify-center rounded-full">
                          <span className="text-xs font-medium">
                            {appointment.patientName.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{appointment.patientName}</p>
                        <p className="text-xs text-gray-600">{appointment.type}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-sm">{appointment.time}</p>
                      <Badge 
                        variant={appointment.status === 'confirmed' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {appointment.status}
                      </Badge>
                    </div>
                  </div>
                ))}
                
                {/* Add appointment button */}
                <Button asChild variant="outline" className="w-full">
                  <Link href="/dashboard/appointments/new">
                    <Plus className="w-4 h-4 mr-2" />
                    Schedule New Appointment
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common tasks and shortcuts</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {quickActions.map((action) => (
                  <Button
                    key={action.href}
                    asChild
                    variant="outline"
                    className="w-full justify-start"
                  >
                    <Link href={action.href}>
                      <action.icon className="w-4 h-4 mr-3" />
                      {action.title}
                      <ArrowRight className="w-4 h-4 ml-auto" />
                    </Link>
                  </Button>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="appointments">
          {/* Today's Schedule */}
          <Card>
            <CardHeader>
              <CardTitle>Today's Schedule</CardTitle>
              <CardDescription>
                {formatDate(new Date(), 'long')} • {mockStats.appointments.today.total} appointments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Time slots with appointments */}
                {[
                  { time: '9:00 AM', patient: 'John Doe', type: 'Consultation', status: 'completed' },
                  { time: '10:00 AM', patient: 'Jane Smith', type: 'Follow-up', status: 'completed' },
                  { time: '11:00 AM', patient: null, type: 'Available', status: 'available' },
                  { time: '2:00 PM', patient: 'Sarah Johnson', type: 'Follow-up', status: 'confirmed' },
                  { time: '3:30 PM', patient: 'Mike Chen', type: 'Consultation', status: 'pending' },
                  { time: '4:00 PM', patient: 'Emma Davis', type: 'Routine', status: 'confirmed' },
                ].map((slot, index) => (
                  <div 
                    key={index} 
                    className={`flex items-center justify-between p-4 border rounded-lg ${
                      slot.status === 'completed' ? 'bg-green-50 border-green-200' :
                      slot.status === 'available' ? 'bg-gray-50 border-gray-200' :
                      'bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <p className="font-medium text-sm">{slot.time}</p>
                      </div>
                      <div className="w-px h-8 bg-gray-300" />
                      <div>
                        {slot.patient ? (
                          <>
                            <p className="font-medium">{slot.patient}</p>
                            <p className="text-sm text-gray-600">{slot.type}</p>
                          </>
                        ) : (
                          <p className="text-gray-500 italic">Available slot</p>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant={
                        slot.status === 'completed' ? 'default' :
                        slot.status === 'available' ? 'secondary' :
                        slot.status === 'pending' ? 'outline' :
                        'default'
                      }
                      className={
                        slot.status === 'completed' ? 'bg-green-100 text-green-800' : ''
                      }
                    >
                      {slot.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          {/* Recent Activity Feed */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest actions and updates in your practice</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Mock activity items */}
                {[
                  {
                    type: 'appointment',
                    description: 'Appointment completed with Sarah Johnson',
                    time: '2 hours ago',
                    icon: Calendar,
                    color: 'text-green-600 bg-green-100'
                  },
                  {
                    type: 'payment',
                    description: 'Payment received from John Doe ($150.00)',
                    time: '4 hours ago',
                    icon: DollarSign,
                    color: 'text-green-600 bg-green-100'
                  },
                  {
                    type: 'note',
                    description: 'SOAP note created for Emma Davis',
                    time: '1 day ago',
                    icon: FileText,
                    color: 'text-blue-600 bg-blue-100'
                  },
                  {
                    type: 'patient',
                    description: 'New patient registered: Mike Chen',
                    time: '2 days ago',
                    icon: Users,
                    color: 'text-medical-600 bg-medical-100'
                  },
                  {
                    type: 'appointment',
                    description: 'Appointment scheduled with Lisa Wang',
                    time: '3 days ago',
                    icon: Calendar,
                    color: 'text-blue-600 bg-blue-100'
                  },
                ].map((activity, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${activity.color}`}>
                      <activity.icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">{activity.description}</p>
                      <p className="text-xs text-gray-500 mt-1">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}