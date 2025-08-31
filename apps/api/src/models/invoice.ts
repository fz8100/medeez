import { z } from 'zod';
import { BaseEntity, InvoiceStatus, EncryptedField } from '@/types';

// Zod schemas
export const InvoiceLineItemSchema = z.object({
  description: z.string().min(1).max(200),
  quantity: z.number().min(1).max(999),
  unitPrice: z.number().min(0),
  cptCode: z.string().max(10).optional(),
  modifiers: z.array(z.string().max(2)).optional(),
  discount: z.number().min(0).max(100).default(0), // percentage
  taxable: z.boolean().default(true)
});

export const CreateInvoiceSchema = z.object({
  patientId: z.string().min(1),
  appointmentId: z.string().min(1).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lineItems: z.array(InvoiceLineItemSchema).min(1),
  notes: z.string().max(1000).optional(),
  discountPercent: z.number().min(0).max(100).default(0),
  taxPercent: z.number().min(0).max(100).default(0),
  paymentTerms: z.string().max(100).default('Due upon receipt')
});

export const UpdateInvoiceSchema = CreateInvoiceSchema.partial();

export const PaymentRecordSchema = z.object({
  amount: z.number().min(0.01),
  method: z.enum(['CASH', 'CHECK', 'CREDIT_CARD', 'BANK_TRANSFER', 'INSURANCE', 'OTHER']),
  reference: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
  paidAt: z.string().datetime().optional()
});

export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof UpdateInvoiceSchema>;
export type PaymentRecordInput = z.infer<typeof PaymentRecordSchema>;

export interface InvoiceLineItem {
  lineItemId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number; // computed: quantity * unitPrice * (1 - discount/100)
  cptCode?: string;
  modifiers?: string[];
  discount: number; // percentage
  taxable: boolean;
}

export interface PaymentRecord {
  paymentId: string;
  amount: number;
  method: 'CASH' | 'CHECK' | 'CREDIT_CARD' | 'BANK_TRANSFER' | 'INSURANCE' | 'OTHER';
  reference?: string; // Check number, transaction ID, etc.
  notes?: string;
  paidAt: string;
  recordedBy: string;
  receiptUrl?: string; // S3 URL to receipt image/document
}

export interface Invoice extends BaseEntity {
  // PK: TENANT#{clinicId}
  // SK: INVOICE#{invoiceId}
  // GSI1PK: ENTITY#INVOICE
  // GSI1SK: {clinicId}#{invoiceId}
  // GSI2PK: PATIENT#{patientId}
  // GSI2SK: INVOICE#{invoiceDate}
  // GSI4PK: STATUS#{status}
  // GSI4SK: {clinicId}#{dueDate}
  
  invoiceId: string;
  invoiceNumber: string; // Human-readable sequential number
  patientId: string;
  appointmentId?: string;
  
  // Billing information
  invoiceDate: string;
  dueDate: string;
  status: InvoiceStatus;
  
  // Patient information (denormalized for invoice display)
  patientName: EncryptedField;
  patientAddress: EncryptedField;
  patientPhone: EncryptedField;
  patientEmail?: EncryptedField;
  
  // Line items
  lineItems: InvoiceLineItem[];
  
  // Financial calculations
  subtotal: number;        // Sum of all line items
  discountPercent: number;
  discountAmount: number;  // Computed from subtotal * discountPercent / 100
  taxPercent: number;
  taxAmount: number;       // Computed from (subtotal - discount) * taxPercent / 100
  totalAmount: number;     // subtotal - discount + tax
  
  // Payment tracking
  paidAmount: number;
  remainingBalance: number; // totalAmount - paidAmount
  paymentRecords: PaymentRecord[];
  
  // Insurance information
  insurance: {
    primary?: {
      company: EncryptedField;
      memberId: EncryptedField;
      claimAmount: number;
      claimStatus: 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'DENIED' | 'PAID';
      claimDate?: string;
      paymentAmount?: number;
      paymentDate?: string;
      denialReason?: string;
    };
    secondary?: {
      company: EncryptedField;
      memberId: EncryptedField;
      claimAmount: number;
      claimStatus: 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'DENIED' | 'PAID';
      claimDate?: string;
      paymentAmount?: number;
      paymentDate?: string;
      denialReason?: string;
    };
  };
  
  // Terms and notes
  paymentTerms: string;
  notes?: EncryptedField;
  internalNotes?: string; // Not shown to patient
  
  // Document generation
  pdfGenerated: boolean;
  pdfUrl?: string; // S3 URL
  pdfGeneratedAt?: string;
  
  // Delivery tracking
  sentToPatient: boolean;
  sentAt?: string;
  sentMethod?: 'EMAIL' | 'MAIL' | 'PORTAL';
  deliveryStatus: 'NOT_SENT' | 'SENT' | 'DELIVERED' | 'VIEWED' | 'FAILED';
  
  // Collections
  isOverdue: boolean; // Computed based on dueDate
  daysPastDue: number; // Computed
  collectionAttempts: {
    attemptId: string;
    method: 'EMAIL' | 'PHONE' | 'MAIL';
    attemptedAt: string;
    attemptedBy: string;
    notes?: string;
    successful: boolean;
  }[];
  
  // Portal access
  portalViewToken?: string;
  portalViewedAt?: string;
  portalPaymentEnabled: boolean;
  portalPaymentUrl?: string;
  
  // Audit trail
  statusHistory: {
    status: InvoiceStatus;
    changedAt: string;
    changedBy: string;
    reason?: string;
  }[];
  
  // External system integration
  externalIds: {
    quickbooksId?: string;
    paddlePaymentId?: string;
    claimMdId?: string;
    syncedAt?: string;
  };
}

// Database key generation helpers
export class InvoiceKeys {
  static primary(clinicId: string, invoiceId: string) {
    return {
      PK: `TENANT#${clinicId}`,
      SK: `INVOICE#${invoiceId}`
    };
  }
  
  static gsi1(clinicId: string, invoiceId: string) {
    return {
      GSI1PK: 'ENTITY#INVOICE',
      GSI1SK: `${clinicId}#${invoiceId}`
    };
  }
  
  static byPatient(patientId: string, invoiceDate: string) {
    return {
      GSI2PK: `PATIENT#${patientId}`,
      GSI2SK: `INVOICE#${invoiceDate}`
    };
  }
  
  static byStatus(status: InvoiceStatus, clinicId: string, dueDate: string) {
    return {
      GSI4PK: `STATUS#${status}`,
      GSI4SK: `${clinicId}#${dueDate}`
    };
  }
  
  static byOverdue(clinicId: string, dueDate: string) {
    return {
      GSI5PK: `OVERDUE#${clinicId}`,
      GSI5SK: dueDate
    };
  }
  
  static forCreation(
    clinicId: string,
    invoiceId: string,
    patientId: string,
    status: InvoiceStatus,
    invoiceDate: string,
    dueDate: string
  ) {
    return {
      ...this.primary(clinicId, invoiceId),
      ...this.gsi1(clinicId, invoiceId),
      ...this.byPatient(patientId, invoiceDate),
      ...this.byStatus(status, clinicId, dueDate)
    };
  }
}

// Helper functions
export function calculateLineItemTotal(item: {
  quantity: number;
  unitPrice: number;
  discount: number;
}): number {
  const subtotal = item.quantity * item.unitPrice;
  const discountAmount = subtotal * (item.discount / 100);
  return subtotal - discountAmount;
}

export function calculateInvoiceTotals(
  lineItems: InvoiceLineItem[],
  discountPercent: number,
  taxPercent: number
): {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
} {
  const subtotal = lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const discountAmount = subtotal * (discountPercent / 100);
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = afterDiscount * (taxPercent / 100);
  const totalAmount = afterDiscount + taxAmount;
  
  return {
    subtotal,
    discountAmount,
    taxAmount,
    totalAmount
  };
}

export function generateInvoiceNumber(clinicId: string, sequence: number): string {
  const year = new Date().getFullYear();
  const clinicPrefix = clinicId.slice(-4).toUpperCase();
  return `INV-${year}-${clinicPrefix}-${sequence.toString().padStart(4, '0')}`;
}

export function calculateDaysPastDue(dueDate: string): number {
  const due = new Date(dueDate);
  const today = new Date();
  const diffTime = today.getTime() - due.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

export function isInvoiceOverdue(dueDate: string): boolean {
  return calculateDaysPastDue(dueDate) > 0;
}

// Status transition rules
export const VALID_INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ['SENT', 'CANCELLED'],
  SENT: ['PAID', 'OVERDUE', 'CANCELLED'],
  PAID: [], // Terminal state
  OVERDUE: ['PAID', 'CANCELLED'],
  CANCELLED: ['DRAFT'] // Can reopen
};

// Default payment terms
export const DEFAULT_PAYMENT_TERMS = [
  'Due upon receipt',
  'Net 15 days',
  'Net 30 days',
  'Due on service date',
  '2% 10, Net 30'
];

// Common CPT codes for quick reference
export const COMMON_CPT_CODES = [
  { code: '99213', description: 'Office visit, established patient, level 3' },
  { code: '99214', description: 'Office visit, established patient, level 4' },
  { code: '99203', description: 'Office visit, new patient, level 3' },
  { code: '99204', description: 'Office visit, new patient, level 4' },
  { code: '90791', description: 'Psychiatric diagnostic evaluation' },
  { code: '90834', description: 'Psychotherapy, 45 minutes' },
  { code: '90837', description: 'Psychotherapy, 60 minutes' }
];

export { };