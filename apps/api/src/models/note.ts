import { z } from 'zod';
import { BaseEntity, EncryptedField } from '@/types';

// Zod schemas
export const SOAPContentSchema = z.object({
  subjective: z.string().max(10000).optional(),
  objective: z.string().max(10000).optional(),
  assessment: z.string().max(10000).optional(),
  plan: z.string().max(10000).optional()
});

export const CreateNoteSchema = z.object({
  patientId: z.string().min(1),
  appointmentId: z.string().min(1).optional(),
  type: z.enum(['SOAP', 'PROGRESS', 'CONSULTATION', 'PROCEDURE', 'DISCHARGE']),
  title: z.string().min(1).max(200),
  content: SOAPContentSchema,
  templateId: z.string().optional(),
  diagnosis: z.array(z.object({
    code: z.string().min(1).max(10), // ICD-10 code
    description: z.string().min(1).max(500),
    isPrimary: z.boolean().default(false)
  })).optional(),
  procedures: z.array(z.object({
    code: z.string().min(1).max(10), // CPT code
    description: z.string().min(1).max(500),
    quantity: z.number().min(1).default(1),
    modifier: z.string().max(10).optional()
  })).optional(),
  vitals: z.object({
    height: z.object({ value: z.number(), unit: z.string() }).optional(),
    weight: z.object({ value: z.number(), unit: z.string() }).optional(),
    bmi: z.number().optional(),
    bloodPressure: z.object({ systolic: z.number(), diastolic: z.number() }).optional(),
    heartRate: z.number().optional(),
    temperature: z.object({ value: z.number(), unit: z.string() }).optional(),
    respiratoryRate: z.number().optional(),
    oxygenSaturation: z.number().optional(),
    painScale: z.number().min(0).max(10).optional()
  }).optional()
});

export const UpdateNoteSchema = CreateNoteSchema.partial().omit({ patientId: true });

export type CreateNoteInput = z.infer<typeof CreateNoteSchema>;
export type UpdateNoteInput = z.infer<typeof UpdateNoteSchema>;
export type SOAPContent = z.infer<typeof SOAPContentSchema>;

export type NoteType = 'SOAP' | 'PROGRESS' | 'CONSULTATION' | 'PROCEDURE' | 'DISCHARGE';

export interface Note extends BaseEntity {
  // PK: TENANT#{clinicId}
  // SK: NOTE#{noteId}
  // GSI1PK: ENTITY#NOTE
  // GSI1SK: {clinicId}#{noteId}
  // GSI2PK: PATIENT#{patientId}
  // GSI2SK: NOTE#{createdAt}
  // GSI3PK: PROVIDER#{providerId}
  // GSI3SK: {createdAt}#{noteId}
  
  noteId: string;
  patientId: string;
  appointmentId?: string;
  providerId: string;
  
  // Note metadata
  type: NoteType;
  title: string;
  status: 'DRAFT' | 'COMPLETED' | 'SIGNED' | 'AMENDED';
  
  // Note content (PHI - encrypted and compressed)
  content: {
    subjective?: EncryptedField;
    objective?: EncryptedField;
    assessment?: EncryptedField;
    plan?: EncryptedField;
  };
  
  // Medical coding
  diagnosis: {
    code: string;      // ICD-10 code
    description: string;
    isPrimary: boolean;
  }[];
  
  procedures: {
    code: string;      // CPT code
    description: string;
    quantity: number;
    modifier?: string;
  }[];
  
  // Patient vitals (encrypted for privacy)
  vitals?: {
    height?: { value: EncryptedField; unit: string };
    weight?: { value: EncryptedField; unit: string };
    bmi?: EncryptedField;
    bloodPressure?: { 
      systolic: EncryptedField; 
      diastolic: EncryptedField 
    };
    heartRate?: EncryptedField;
    temperature?: { value: EncryptedField; unit: string };
    respiratoryRate?: EncryptedField;
    oxygenSaturation?: EncryptedField;
    painScale?: EncryptedField;
    takenAt: string;
    takenBy: string;
  };
  
  // Body chart annotations
  bodyChart?: {
    front?: string; // JSON string of drawing data
    back?: string;  // JSON string of drawing data
    annotations: {
      id: string;
      x: number;
      y: number;
      text: string;
      type: 'pain' | 'injury' | 'surgery' | 'other';
      severity?: number;
    }[];
  };
  
  // Attachments and media
  attachments: {
    attachmentId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    s3Key: string;
    uploadedAt: string;
    description?: string;
  }[];
  
  // Templates and shortcuts
  templateId?: string;
  smartPhrases: {
    shortcut: string;
    expansion: string;
    usedAt: string;
  }[];
  
  // Patient information (denormalized for quick access)
  patientName: EncryptedField;
  patientDOB: EncryptedField;
  
  // Digital signature
  signature?: {
    providerId: string;
    providerName: string;
    signedAt: string;
    digitalSignature: string; // Encrypted signature data
    ipAddress: string;
  };
  
  // Amendment tracking
  amendments: {
    amendmentId: string;
    amendedAt: string;
    amendedBy: string;
    reason: string;
    originalContent: EncryptedField;
    amendmentContent: EncryptedField;
  }[];
  
  // Version control
  version: number;
  isLatestVersion: boolean;
  parentNoteId?: string; // If this is an amendment
  
  // Auto-save and collaboration
  lastAutoSaveAt?: string;
  isLocked: boolean;
  lockedBy?: string;
  lockedAt?: string;
  
  // Search and indexing (encrypted)
  searchContent: EncryptedField; // Full-text search tokens
  keywords: string[]; // Non-PHI keywords for filtering
  
  // Compliance and audit
  accessLog: {
    userId: string;
    accessedAt: string;
    action: 'VIEW' | 'EDIT' | 'PRINT' | 'EXPORT';
    ipAddress: string;
  }[];
  
  // Integration tracking
  exportedTo: {
    system: string;
    exportedAt: string;
    exportId: string;
  }[];
}

// Database key generation helpers
export class NoteKeys {
  static primary(clinicId: string, noteId: string) {
    return {
      PK: `TENANT#${clinicId}`,
      SK: `NOTE#${noteId}`
    };
  }
  
  static gsi1(clinicId: string, noteId: string) {
    return {
      GSI1PK: 'ENTITY#NOTE',
      GSI1SK: `${clinicId}#${noteId}`
    };
  }
  
  static byPatient(patientId: string, createdAt: string) {
    return {
      GSI2PK: `PATIENT#${patientId}`,
      GSI2SK: `NOTE#${createdAt}`
    };
  }
  
  static byProvider(providerId: string, createdAt: string, noteId: string) {
    return {
      GSI3PK: `PROVIDER#${providerId}`,
      GSI3SK: `${createdAt}#${noteId}`
    };
  }
  
  static byStatus(status: string, clinicId: string, createdAt: string) {
    return {
      GSI4PK: `NOTE_STATUS#${status}`,
      GSI4SK: `${clinicId}#${createdAt}`
    };
  }
  
  static byType(type: NoteType, clinicId: string, createdAt: string) {
    return {
      GSI5PK: `NOTE_TYPE#${type}`,
      GSI5SK: `${clinicId}#${createdAt}`
    };
  }
  
  static forCreation(
    clinicId: string,
    noteId: string,
    patientId: string,
    providerId: string,
    type: NoteType,
    status: string,
    createdAt: string
  ) {
    return {
      ...this.primary(clinicId, noteId),
      ...this.gsi1(clinicId, noteId),
      ...this.byPatient(patientId, createdAt),
      ...this.byProvider(providerId, createdAt, noteId),
      ...this.byStatus(status, clinicId, createdAt),
      GSI5PK: `NOTE_TYPE#${type}`,
      GSI5SK: `${clinicId}#${createdAt}`
    };
  }
}

// Note templates
export interface NoteTemplate {
  templateId: string;
  name: string;
  type: NoteType;
  content: {
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
  };
  smartPhrases: {
    shortcut: string;
    expansion: string;
  }[];
  isSystem: boolean;
  isActive: boolean;
  clinicId: string;
  createdBy: string;
  usageCount: number;
}

// Common smart phrases
export const DEFAULT_SMART_PHRASES = [
  { shortcut: '.normal', expansion: 'Patient appears well, in no acute distress.' },
  { shortcut: '.rr', expansion: 'Return to clinic in' },
  { shortcut: '.fu', expansion: 'Follow up' },
  { shortcut: '.prn', expansion: 'as needed' },
  { shortcut: '.nkda', expansion: 'No known drug allergies' },
  { shortcut: '.ros', expansion: 'Review of systems negative except as noted above.' }
];

// Status transition rules
export const VALID_NOTE_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['COMPLETED', 'SIGNED'],
  COMPLETED: ['SIGNED', 'AMENDED'],
  SIGNED: ['AMENDED'],
  AMENDED: []
};

// Helper functions
export function extractKeywords(content: SOAPContent): string[] {
  const text = [
    content.subjective || '',
    content.objective || '',
    content.assessment || '',
    content.plan || ''
  ].join(' ').toLowerCase();
  
  // Extract medical keywords (simplified example)
  const medicalKeywords = [
    'pain', 'fever', 'headache', 'nausea', 'vomiting', 'diarrhea',
    'hypertension', 'diabetes', 'asthma', 'depression', 'anxiety',
    'infection', 'inflammation', 'medication', 'treatment', 'surgery'
  ];
  
  return medicalKeywords.filter(keyword => text.includes(keyword));
}

export function generateSearchContent(content: SOAPContent): string {
  return [
    content.subjective || '',
    content.objective || '',
    content.assessment || '',
    content.plan || ''
  ].join(' ').toLowerCase().trim();
}

export { };