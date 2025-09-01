import { BaseEntity, Address } from './common';

export interface Invoice extends BaseEntity {
  invoiceId: string;
  invoiceNumber: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  appointmentId?: string;
  
  // Invoice details
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  type: InvoiceType;
  
  // Financial details
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  currency: string;
  
  // Line items
  lineItems: InvoiceLineItem[];
  
  // Billing information
  billingAddress: Address;
  
  // Insurance information
  insuranceClaim?: InsuranceClaim;
  
  // Payment information
  payments: PaymentRecord[];
  
  // Notes and references
  notes?: string;
  internalNotes?: string;
  terms?: string;
  
  // Metadata
  tags?: string[];
}

export type InvoiceStatus = 
  | 'draft'
  | 'pending'
  | 'sent'
  | 'viewed'
  | 'partial'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'refunded';

export type InvoiceType = 
  | 'standard'
  | 'insurance-claim'
  | 'self-pay'
  | 'recurring'
  | 'estimate'
  | 'credit-memo'
  | 'debit-memo';

export interface InvoiceLineItem {
  id: string;
  description: string;
  cptCode?: string;
  icdCode?: string;
  serviceDate: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  taxable: boolean;
  modifiers?: string[];
  notes?: string;
}

export interface InsuranceClaim {
  claimId: string;
  primaryInsurance: {
    company: string;
    policyNumber: string;
    groupNumber?: string;
    priorAuthNumber?: string;
    eligibilityVerified: boolean;
    copayAmount?: number;
    deductibleMet?: boolean;
  };
  secondaryInsurance?: {
    company: string;
    policyNumber: string;
    groupNumber?: string;
  };
  claimStatus: ClaimStatus;
  submittedDate?: string;
  processedDate?: string;
  paidDate?: string;
  denialReason?: string;
  approvedAmount?: number;
  patientResponsibility: number;
}

export type ClaimStatus = 
  | 'pending-submission'
  | 'submitted'
  | 'under-review'
  | 'approved'
  | 'partially-approved'
  | 'denied'
  | 'appealed'
  | 'paid';

export interface PaymentRecord {
  id: string;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  transactionId?: string;
  reference?: string;
  status: PaymentStatus;
  processingFee?: number;
  netAmount?: number;
  notes?: string;
}

export type PaymentMethod = 
  | 'cash'
  | 'check'
  | 'credit-card'
  | 'debit-card'
  | 'ach'
  | 'wire-transfer'
  | 'insurance'
  | 'online'
  | 'mobile-payment'
  | 'other';

export type PaymentStatus = 
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'disputed';

// Invoice creation and management
export interface CreateInvoiceRequest {
  patientId: string;
  appointmentId?: string;
  type: InvoiceType;
  dueDate: string;
  lineItems: Omit<InvoiceLineItem, 'id' | 'totalPrice'>[];
  billingAddress: Address;
  discountAmount?: number;
  notes?: string;
  terms?: string;
  sendImmediately?: boolean;
}

export interface UpdateInvoiceRequest extends Partial<CreateInvoiceRequest> {
  invoiceId: string;
  reason?: string;
}

export interface SendInvoiceRequest {
  invoiceId: string;
  method: 'email' | 'postal' | 'portal';
  customMessage?: string;
  scheduleDate?: string;
}

// Payment processing
export interface ProcessPaymentRequest {
  invoiceId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  transactionId?: string;
  reference?: string;
  notes?: string;
}

export interface RefundPaymentRequest {
  invoiceId: string;
  paymentId: string;
  amount: number;
  reason: string;
  refundMethod?: PaymentMethod;
}

// Search and filtering
export interface InvoiceFilters {
  status?: InvoiceStatus[];
  type?: InvoiceType[];
  patientId?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  overdueDays?: number;
  hasInsurance?: boolean;
  tags?: string[];
}

export interface InvoiceSearchResult {
  invoiceId: string;
  invoiceNumber: string;
  patientName: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  totalAmount: number;
  balanceAmount: number;
  relevanceScore: number;
}

// Invoice templates
export interface InvoiceTemplate {
  id: string;
  name: string;
  description?: string;
  type: InvoiceType;
  isDefault: boolean;
  template: {
    terms?: string;
    notes?: string;
    lineItems?: Partial<InvoiceLineItem>[];
    paymentInstructions?: string;
  };
  customFields?: {
    name: string;
    type: 'text' | 'number' | 'date' | 'select';
    required: boolean;
    options?: string[];
  }[];
  isActive: boolean;
}

// Billing reports and analytics
export interface BillingStats {
  totalInvoices: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  averagePaymentTime: number;
  paymentMethods: Record<PaymentMethod, number>;
  statusDistribution: Record<InvoiceStatus, number>;
  monthlyTrends: Array<{
    month: string;
    invoices: number;
    amount: number;
    payments: number;
  }>;
}

export interface AgingReport {
  current: number; // 0-30 days
  thirty: number; // 31-60 days
  sixty: number; // 61-90 days
  ninety: number; // 90+ days
  total: number;
  accounts: Array<{
    patientId: string;
    patientName: string;
    totalBalance: number;
    currentBalance: number;
    thirtyBalance: number;
    sixtyBalance: number;
    ninetyBalance: number;
    oldestInvoiceDate: string;
  }>;
}

// Payment plans
export interface PaymentPlan {
  id: string;
  invoiceId: string;
  totalAmount: number;
  numberOfPayments: number;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  startDate: string;
  endDate: string;
  status: 'active' | 'completed' | 'cancelled' | 'defaulted';
  payments: PaymentPlanInstallment[];
}

export interface PaymentPlanInstallment {
  installmentNumber: number;
  amount: number;
  dueDate: string;
  paidDate?: string;
  paidAmount?: number;
  status: 'pending' | 'paid' | 'overdue' | 'skipped';
}

// Insurance and claims management
export interface InsuranceVerification {
  patientId: string;
  insuranceCompany: string;
  policyNumber: string;
  groupNumber?: string;
  eligibilityStatus: 'active' | 'inactive' | 'pending' | 'terminated';
  effectiveDate: string;
  terminationDate?: string;
  copayAmount?: number;
  deductible?: {
    individual: number;
    family: number;
    met: number;
    remaining: number;
  };
  outOfPocketMax?: {
    individual: number;
    family: number;
    met: number;
    remaining: number;
  };
  coverageLimits?: Array<{
    service: string;
    limit: number;
    used: number;
    remaining: number;
  }>;
  verifiedAt: string;
  verifiedBy: string;
}

// Recurring billing
export interface RecurringBilling {
  id: string;
  patientId: string;
  templateId: string;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'annually';
  startDate: string;
  endDate?: string;
  nextBillingDate: string;
  isActive: boolean;
  generatedInvoices: string[];
}