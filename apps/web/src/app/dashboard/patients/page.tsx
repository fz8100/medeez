'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { 
  Search, 
  Plus, 
  Filter, 
  MoreHorizontal, 
  Phone, 
  Mail, 
  Calendar,
  User,
  AlertCircle,
  Eye,
  Edit,
  Archive
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiClient } from '@/lib/api-client';
import { formatDate, calculateAge, getPatientInitials, getAvatarColor } from '@/lib/utils';

// Mock patient data - in real app this would come from API
const mockPatients = [
  {
    patientId: '1',
    firstName: 'Sarah',
    lastName: 'Johnson',
    dateOfBirth: '1985-03-15',
    gender: 'female' as const,
    email: 'sarah.johnson@email.com',
    phoneNumbers: [{ type: 'mobile' as const, number: '(555) 123-4567', primary: true }],
    status: 'active' as const,
    lastVisitDate: '2024-01-15',
    nextAppointmentDate: '2024-02-01',
    hasAlerts: false,
    profilePicture: null,
    address: { city: 'San Francisco', state: 'CA' },
    insurance: { primary: { company: 'Blue Cross' } }
  },
  {
    patientId: '2',
    firstName: 'Michael',
    lastName: 'Chen',
    dateOfBirth: '1990-07-22',
    gender: 'male' as const,
    email: 'mike.chen@email.com',
    phoneNumbers: [{ type: 'mobile' as const, number: '(555) 234-5678', primary: true }],
    status: 'active' as const,
    lastVisitDate: '2024-01-20',
    nextAppointmentDate: null,
    hasAlerts: true,
    profilePicture: null,
    address: { city: 'Oakland', state: 'CA' },
    insurance: null
  },
  {
    patientId: '3',
    firstName: 'Emma',
    lastName: 'Davis',
    dateOfBirth: '1978-11-08',
    gender: 'female' as const,
    email: 'emma.davis@email.com',
    phoneNumbers: [{ type: 'home' as const, number: '(555) 345-6789', primary: true }],
    status: 'active' as const,
    lastVisitDate: '2023-12-10',
    nextAppointmentDate: '2024-02-05',
    hasAlerts: false,
    profilePicture: null,
    address: { city: 'Berkeley', state: 'CA' },
    insurance: { primary: { company: 'Kaiser Permanente' } }
  },
];

export default function PatientsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Fetch patients data
  const { data: patientsResponse, isLoading } = useQuery({
    queryKey: ['patients', { search: searchQuery, status: selectedStatus }],
    queryFn: () => apiClient.patients.list({ 
      search: searchQuery,
      filters: selectedStatus !== 'all' ? { status: selectedStatus } : undefined
    }),
    // Use mock data for now
    select: () => ({ data: mockPatients, success: true }),
  });

  const patients = patientsResponse?.data || [];

  const filteredPatients = patients.filter(patient => {
    const matchesSearch = !searchQuery || 
      `${patient.firstName} ${patient.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.phoneNumbers.some(phone => phone.number.includes(searchQuery));
    
    const matchesStatus = selectedStatus === 'all' || patient.status === selectedStatus;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Patients</h1>
          <p className="text-gray-600 mt-1">
            Manage patient records and information
          </p>
        </div>
        
        <Button asChild variant="medical">
          <Link href="/dashboard/patients/new">
            <Plus className="w-4 h-4 mr-2" />
            Add Patient
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Patients</p>
                <p className="text-2xl font-bold text-gray-900">{patients.length}</p>
              </div>
              <User className="w-8 h-8 text-medical-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active</p>
                <p className="text-2xl font-bold text-gray-900">
                  {patients.filter(p => p.status === 'active').length}
                </p>
              </div>
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <div className="w-3 h-3 bg-green-600 rounded-full" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">With Alerts</p>
                <p className="text-2xl font-bold text-gray-900">
                  {patients.filter(p => p.hasAlerts).length}
                </p>
              </div>
              <AlertCircle className="w-8 h-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Upcoming</p>
                <p className="text-2xl font-bold text-gray-900">
                  {patients.filter(p => p.nextAppointmentDate).length}
                </p>
              </div>
              <Calendar className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search patients by name, email, or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <Tabs value={selectedStatus} onValueChange={(value) => setSelectedStatus(value as any)}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="active">Active</TabsTrigger>
                  <TabsTrigger value="inactive">Inactive</TabsTrigger>
                </TabsList>
              </Tabs>
              
              <Button variant="outline" size="sm">
                <Filter className="w-4 h-4 mr-2" />
                More Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Patients List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Patient Records</CardTitle>
              <CardDescription>
                {filteredPatients.length} patient{filteredPatients.length !== 1 ? 's' : ''} found
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
                  <div className="w-12 h-12 bg-gray-200 rounded-full animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-1/4" />
                    <div className="h-3 bg-gray-200 rounded animate-pulse w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredPatients.length === 0 ? (
            <div className="text-center py-8">
              <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No patients found</h3>
              <p className="text-gray-600 mb-4">
                {searchQuery ? 'Try adjusting your search terms' : 'Get started by adding your first patient'}
              </p>
              <Button asChild variant="medical">
                <Link href="/dashboard/patients/new">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Patient
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredPatients.map((patient) => (
                <div
                  key={patient.patientId}
                  className="flex items-center gap-4 p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {/* Avatar */}
                  <div className="relative">
                    <Avatar className="w-12 h-12">
                      <div className={`w-full h-full ${getAvatarColor(`${patient.firstName} ${patient.lastName}`)} flex items-center justify-center rounded-full`}>
                        <span className="text-white text-sm font-medium">
                          {getPatientInitials(patient.firstName, patient.lastName)}
                        </span>
                      </div>
                    </Avatar>
                    {patient.hasAlerts && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-orange-600 rounded-full flex items-center justify-center">
                        <AlertCircle className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Patient Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-gray-900">
                        {patient.firstName} {patient.lastName}
                      </h3>
                      <Badge variant={patient.status === 'active' ? 'default' : 'secondary'}>
                        {patient.status}
                      </Badge>
                      {patient.hasAlerts && (
                        <Badge variant="outline" className="text-orange-600 border-orange-600">
                          Alert
                        </Badge>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        <span>{calculateAge(patient.dateOfBirth)} years old</span>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        <span>{patient.phoneNumbers[0]?.number || 'No phone'}</span>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        <span className="truncate">{patient.email || 'No email'}</span>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>
                          Last visit: {patient.lastVisitDate ? formatDate(patient.lastVisitDate) : 'Never'}
                        </span>
                      </div>
                    </div>

                    {patient.nextAppointmentDate && (
                      <div className="mt-2">
                        <Badge variant="outline" className="text-blue-600 border-blue-600">
                          Next: {formatDate(patient.nextAppointmentDate)}
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/dashboard/patients/${patient.patientId}`}>
                        <Eye className="w-4 h-4" />
                      </Link>
                    </Button>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/patients/${patient.patientId}`}>
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/patients/${patient.patientId}/edit`}>
                            <Edit className="w-4 h-4 mr-2" />
                            Edit Patient
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/appointments/new?patientId=${patient.patientId}`}>
                            <Calendar className="w-4 h-4 mr-2" />
                            Schedule Appointment
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600">
                          <Archive className="w-4 h-4 mr-2" />
                          Archive Patient
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}