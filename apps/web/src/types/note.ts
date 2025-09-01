import { BaseEntity, FileAttachment } from './common';

export interface SoapNote extends BaseEntity {
  noteId: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  appointmentId?: string;
  providerId: string;
  providerName: string;
  
  // Note metadata
  noteDate: string;
  noteType: NoteType;
  status: NoteStatus;
  version: number;
  isLocked: boolean;
  lockedAt?: string;
  lockedBy?: string;
  
  // SOAP components
  subjective: SubjectiveSection;
  objective: ObjectiveSection;
  assessment: AssessmentSection;
  plan: PlanSection;
  
  // Additional sections
  reviewOfSystems?: ReviewOfSystemsSection;
  physicalExam?: PhysicalExamSection;
  
  // Addendum and amendments
  addendum?: AddendumEntry[];
  amendments?: AmendmentEntry[];
  
  // Signatures and authentication
  providerSignature?: DigitalSignature;
  cosignature?: DigitalSignature;
  
  // Templates and auto-population
  templateUsed?: string;
  templatedSections?: string[];
  
  // Attachments and references
  attachments: FileAttachment[];
  referencedNotes?: string[];
  
  // Billing and coding
  diagnosisCodes?: DiagnosisCode[];
  procedureCodes?: ProcedureCode[];
  
  // Quality metrics
  completenessScore?: number;
  lastReviewedAt?: string;
  lastReviewedBy?: string;
  
  // Sharing and collaboration
  sharedWith?: SharedAccess[];
  
  // Tags and categorization
  tags?: string[];
  category?: string;
  specialty?: string;
}

export type NoteType = 
  | 'progress-note'
  | 'consultation'
  | 'discharge-summary'
  | 'operative-note'
  | 'history-physical'
  | 'follow-up'
  | 'emergency'
  | 'telephone'
  | 'other';

export type NoteStatus = 'draft' | 'in-review' | 'signed' | 'amended' | 'deleted';

export interface SubjectiveSection {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  reviewOfSystems?: string;
  pastMedicalHistory?: string;
  medications?: string;
  allergies?: string;
  socialHistory?: string;
  familyHistory?: string;
  additionalNotes?: string;
}

export interface ObjectiveSection {
  vitalSigns?: {
    temperature?: string;
    bloodPressure?: string;
    heartRate?: string;
    respiratoryRate?: string;
    oxygenSaturation?: string;
    weight?: string;
    height?: string;
    bmi?: string;
  };
  physicalExamination: string;
  diagnosticResults?: string;
  labResults?: string;
  imagingResults?: string;
  additionalFindings?: string;
}

export interface AssessmentSection {
  primaryDiagnosis: string;
  secondaryDiagnoses?: string[];
  differentialDiagnoses?: string[];
  clinicalImpression: string;
  severity?: 'mild' | 'moderate' | 'severe';
  prognosis?: string;
}

export interface PlanSection {
  treatment: string;
  medications?: MedicationPlan[];
  procedures?: PlannedProcedure[];
  followUp?: FollowUpPlan;
  patientEducation?: string;
  lifestyle?: string;
  monitoring?: string;
  referrals?: ReferralPlan[];
  returnToWork?: string;
  additionalInstructions?: string;
}

export interface ReviewOfSystemsSection {
  constitutional?: string;
  cardiovascular?: string;
  respiratory?: string;
  gastrointestinal?: string;
  genitourinary?: string;
  musculoskeletal?: string;
  neurological?: string;
  psychiatric?: string;
  endocrine?: string;
  hematologic?: string;
  allergicImmunologic?: string;
}

export interface PhysicalExamSection {
  general?: string;
  head?: string;
  eyes?: string;
  ears?: string;
  nose?: string;
  throat?: string;
  neck?: string;
  cardiovascular?: string;
  respiratory?: string;
  abdomen?: string;
  genitourinary?: string;
  musculoskeletal?: string;
  neurological?: string;
  psychiatric?: string;
  skin?: string;
  extremities?: string;
}

export interface MedicationPlan {
  medication: string;
  dosage: string;
  frequency: string;
  duration: string;
  route: string;
  instructions: string;
  quantity?: string;
  refills?: number;
  generic?: boolean;
}

export interface PlannedProcedure {
  procedure: string;
  indication: string;
  scheduledDate?: string;
  location?: string;
  provider?: string;
  instructions?: string;
}

export interface FollowUpPlan {
  timeframe: string;
  provider?: string;
  reason: string;
  instructions: string;
  urgency?: 'routine' | 'urgent' | 'stat';
}

export interface ReferralPlan {
  specialist: string;
  reason: string;
  urgency: 'routine' | 'urgent' | 'stat';
  instructions?: string;
  preferredProvider?: string;
}

export interface DiagnosisCode {
  code: string;
  description: string;
  type: 'ICD-10' | 'ICD-11' | 'SNOMED-CT';
  primary: boolean;
}

export interface ProcedureCode {
  code: string;
  description: string;
  type: 'CPT' | 'HCPCS' | 'ICD-10-PCS';
  modifier?: string;
  units?: number;
}

export interface AddendumEntry {
  id: string;
  content: string;
  addedBy: string;
  addedAt: string;
  reason: string;
}

export interface AmendmentEntry {
  id: string;
  originalContent: string;
  amendedContent: string;
  amendedBy: string;
  amendedAt: string;
  reason: string;
  approved: boolean;
  approvedBy?: string;
  approvedAt?: string;
}

export interface DigitalSignature {
  providerId: string;
  providerName: string;
  signedAt: string;
  signatureHash: string;
  method: 'electronic' | 'digital-certificate' | 'biometric';
  ipAddress?: string;
  location?: string;
}

export interface SharedAccess {
  userId: string;
  userEmail: string;
  accessLevel: 'read' | 'comment' | 'edit';
  sharedAt: string;
  sharedBy: string;
  expiresAt?: string;
}

// Template management
export interface NoteTemplate {
  id: string;
  name: string;
  specialty: string;
  noteType: NoteType;
  isDefault: boolean;
  isShared: boolean;
  createdBy: string;
  template: {
    subjective?: Partial<SubjectiveSection>;
    objective?: Partial<ObjectiveSection>;
    assessment?: Partial<AssessmentSection>;
    plan?: Partial<PlanSection>;
    reviewOfSystems?: Partial<ReviewOfSystemsSection>;
    physicalExam?: Partial<PhysicalExamSection>;
  };
  placeholders?: TemplatePlaceholder[];
  autoText?: AutoTextEntry[];
  version: number;
  isActive: boolean;
}

export interface TemplatePlaceholder {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'textarea';
  required: boolean;
  defaultValue?: string;
  options?: string[];
  validation?: string;
}

export interface AutoTextEntry {
  shortcut: string;
  expansion: string;
  description?: string;
}

// Note creation and editing
export interface CreateNoteRequest {
  patientId: string;
  appointmentId?: string;
  noteType: NoteType;
  templateId?: string;
  noteDate?: string;
  initialData?: Partial<SoapNote>;
}

export interface UpdateNoteRequest {
  noteId: string;
  data: Partial<SoapNote>;
  reason?: string;
  saveAsDraft?: boolean;
}

export interface SignNoteRequest {
  noteId: string;
  signatureMethod: 'electronic' | 'digital-certificate' | 'biometric';
  cosignerRequired?: boolean;
  cosignerId?: string;
}

// Search and filtering
export interface NoteFilters {
  patientId?: string;
  providerId?: string;
  dateFrom?: string;
  dateTo?: string;
  noteType?: NoteType[];
  status?: NoteStatus[];
  specialty?: string[];
  hasAttachments?: boolean;
  isLocked?: boolean;
  tags?: string[];
}

export interface NoteSearchResult {
  noteId: string;
  patientName: string;
  providerName: string;
  noteDate: string;
  noteType: NoteType;
  status: NoteStatus;
  chiefComplaint: string;
  relevanceScore: number;
}

// Voice-to-text integration
export interface VoiceRecording {
  id: string;
  noteId: string;
  section: string;
  audioUrl: string;
  transcription: string;
  confidence: number;
  duration: number;
  recordedAt: string;
  isProcessed: boolean;
}

export interface TranscriptionRequest {
  audioBlob: Blob;
  section: string;
  language?: string;
  medicalContext?: boolean;
}

// Note analytics
export interface NoteStats {
  totalNotes: number;
  byType: Record<NoteType, number>;
  byStatus: Record<NoteStatus, number>;
  averageCompletionTime: number;
  templatesUsed: Array<{
    templateId: string;
    templateName: string;
    usage: number;
  }>;
  qualityMetrics: {
    averageCompletenessScore: number;
    signedWithin24Hours: number;
    amendmentRate: number;
  };
}

// Note sharing and collaboration
export interface NoteCollaboration {
  noteId: string;
  collaborators: Array<{
    userId: string;
    userEmail: string;
    role: 'reviewer' | 'editor' | 'cosigner';
    status: 'pending' | 'active' | 'completed';
    invitedAt: string;
    respondedAt?: string;
  }>;
  comments: NoteComment[];
  reviewStatus: 'not-started' | 'in-progress' | 'completed' | 'approved' | 'rejected';
}

export interface NoteComment {
  id: string;
  userId: string;
  userEmail: string;
  content: string;
  section?: string;
  position?: number;
  createdAt: string;
  isResolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
}