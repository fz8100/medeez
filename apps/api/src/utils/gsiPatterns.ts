/**
 * DynamoDB GSI Query Patterns for Medeez v2
 * 
 * Single-table design with 5 GSIs for cost-optimized queries
 * All queries are scoped by clinicId for multi-tenancy
 */

export interface GSIQueryPattern {
  gsiName: string;
  partitionKey: string;
  sortKey?: string;
  useCase: string;
  example: string;
  projectionExpression?: string;
}

/**
 * GSI1: ByEntityType
 * Purpose: Query all entities of a specific type across tenants (admin use)
 * PK: ENTITY#{entityType}
 * SK: {clinicId}#{entityId}
 */
export const GSI1_PATTERNS: GSIQueryPattern[] = [
  {
    gsiName: 'GSI1',
    partitionKey: 'ENTITY#PATIENT',
    useCase: 'List all patients across system (admin)',
    example: 'Query GSI1 where GSI1PK = "ENTITY#PATIENT"',
    projectionExpression: 'clinicId, patientId, firstName, lastName, createdAt'
  },
  {
    gsiName: 'GSI1',
    partitionKey: 'ENTITY#APPOINTMENT',
    sortKey: 'clinic123#appt456',
    useCase: 'List all appointments by clinic',
    example: 'Query GSI1 where GSI1PK = "ENTITY#APPOINTMENT" and begins_with(GSI1SK, "clinic123#")'
  },
  {
    gsiName: 'GSI1',
    partitionKey: 'ENTITY#NOTE',
    useCase: 'List all notes for analytics',
    example: 'Query GSI1 where GSI1PK = "ENTITY#NOTE"'
  }
];

/**
 * GSI2: ByPatient
 * Purpose: Query all records related to a specific patient
 * PK: PATIENT#{patientId}
 * SK: {entityType}#{timestamp}#{entityId}
 */
export const GSI2_PATTERNS: GSIQueryPattern[] = [
  {
    gsiName: 'GSI2',
    partitionKey: 'PATIENT#patient123',
    sortKey: 'APPOINTMENT#2024-01-15T10:00:00Z',
    useCase: 'Get patient appointment history',
    example: 'Query GSI2 where GSI2PK = "PATIENT#patient123" and begins_with(GSI2SK, "APPOINTMENT#")',
    projectionExpression: 'appointmentId, startTime, status, providerId, appointmentType'
  },
  {
    gsiName: 'GSI2',
    partitionKey: 'PATIENT#patient123',
    sortKey: 'NOTE#2024-01-15T14:30:00Z',
    useCase: 'Get patient medical notes chronologically',
    example: 'Query GSI2 where GSI2PK = "PATIENT#patient123" and begins_with(GSI2SK, "NOTE#")'
  },
  {
    gsiName: 'GSI2',
    partitionKey: 'PATIENT#patient123',
    sortKey: 'INVOICE#2024-01-15',
    useCase: 'Get patient billing history',
    example: 'Query GSI2 where GSI2PK = "PATIENT#patient123" and begins_with(GSI2SK, "INVOICE#")'
  }
];

/**
 * GSI3: ByProviderTime
 * Purpose: Query appointments by provider and time for scheduling
 * PK: PROVIDER#{providerId}
 * SK: {startTime}#{appointmentId}
 */
export const GSI3_PATTERNS: GSIQueryPattern[] = [
  {
    gsiName: 'GSI3',
    partitionKey: 'PROVIDER#doctor123',
    sortKey: '2024-01-15T10:00:00Z#appt456',
    useCase: 'Get provider schedule for specific date',
    example: 'Query GSI3 where GSI3PK = "PROVIDER#doctor123" and begins_with(GSI3SK, "2024-01-15")',
    projectionExpression: 'appointmentId, startTime, endTime, patientId, status, appointmentType'
  },
  {
    gsiName: 'GSI3',
    partitionKey: 'PROVIDER#doctor123',
    useCase: 'Get all provider appointments',
    example: 'Query GSI3 where GSI3PK = "PROVIDER#doctor123"'
  },
  {
    gsiName: 'GSI3',
    partitionKey: 'PROVIDER#doctor123',
    sortKey: '2024-01-15T08:00:00Z',
    useCase: 'Find appointment conflicts',
    example: 'Query GSI3 where GSI3PK = "PROVIDER#doctor123" and GSI3SK between "2024-01-15T08:00:00Z" and "2024-01-15T18:00:00Z"'
  }
];

/**
 * GSI4: ByStatus
 * Purpose: Query records by status for workflow management
 * PK: STATUS#{status} or STATE#{state} or ROLE#{role}
 * SK: {clinicId}#{timestamp}#{entityId}
 */
export const GSI4_PATTERNS: GSIQueryPattern[] = [
  {
    gsiName: 'GSI4',
    partitionKey: 'STATUS#SCHEDULED',
    sortKey: 'clinic123#2024-01-15T10:00:00Z#appt456',
    useCase: 'Get all scheduled appointments',
    example: 'Query GSI4 where GSI4PK = "STATUS#SCHEDULED" and begins_with(GSI4SK, "clinic123#")'
  },
  {
    gsiName: 'GSI4',
    partitionKey: 'STATUS#OVERDUE',
    useCase: 'Get overdue invoices for collections',
    example: 'Query GSI4 where GSI4PK = "STATUS#OVERDUE" and begins_with(GSI4SK, "clinic123#")'
  },
  {
    gsiName: 'GSI4',
    partitionKey: 'STATE#CA',
    sortKey: 'clinic123#PATIENT',
    useCase: 'Get patients by state for reporting',
    example: 'Query GSI4 where GSI4PK = "STATE#CA" and begins_with(GSI4SK, "clinic123#PATIENT")'
  },
  {
    gsiName: 'GSI4',
    partitionKey: 'ROLE#DOCTOR',
    useCase: 'Get users by role',
    example: 'Query GSI4 where GSI4PK = "ROLE#DOCTOR" and begins_with(GSI4SK, "clinic123#")'
  }
];

/**
 * GSI5: ExternalIDs
 * Purpose: Query by external identifiers (email, phone, external IDs)
 * PK: EMAIL#{email} or PHONE#{phone} or EXTERNAL#{systemName}#{id}
 * SK: {entityType}
 */
export const GSI5_PATTERNS: GSIQueryPattern[] = [
  {
    gsiName: 'GSI5',
    partitionKey: 'EMAIL#john@example.com',
    sortKey: 'PATIENT',
    useCase: 'Find patient by email address',
    example: 'Query GSI5 where GSI5PK = "EMAIL#john@example.com" and GSI5SK = "PATIENT"'
  },
  {
    gsiName: 'GSI5',
    partitionKey: 'SLUG#abc-medical',
    sortKey: 'CLINIC',
    useCase: 'Find clinic by URL slug',
    example: 'Query GSI5 where GSI5PK = "SLUG#abc-medical" and GSI5SK = "CLINIC"'
  },
  {
    gsiName: 'GSI5',
    partitionKey: 'GOOGLE_CAL#calendar123',
    sortKey: 'APPOINTMENT',
    useCase: 'Find appointment by Google Calendar event ID',
    example: 'Query GSI5 where GSI5PK = "GOOGLE_CAL#calendar123" and GSI5SK = "APPOINTMENT"'
  },
  {
    gsiName: 'GSI5',
    partitionKey: 'DATE#2024-01-15',
    sortKey: 'clinic123#APPOINTMENT',
    useCase: 'Get all appointments for a specific date',
    example: 'Query GSI5 where GSI5PK = "DATE#2024-01-15" and begins_with(GSI5SK, "clinic123#")'
  }
];

/**
 * Query helper functions for common patterns
 */

export class GSIQueryHelper {
  /**
   * Build GSI1 query for entity type
   */
  static buildEntityTypeQuery(entityType: string, clinicId?: string) {
    return {
      indexName: 'GSI1',
      keyCondition: {
        pk: `ENTITY#${entityType}`,
        ...(clinicId && {
          skCondition: 'begins_with(GSI1SK, :clinicPrefix)',
          skValue: `${clinicId}#`
        })
      }
    };
  }

  /**
   * Build GSI2 query for patient records
   */
  static buildPatientRecordsQuery(patientId: string, entityType?: string) {
    return {
      indexName: 'GSI2',
      keyCondition: {
        pk: `PATIENT#${patientId}`,
        ...(entityType && {
          skCondition: 'begins_with(GSI2SK, :entityPrefix)',
          skValue: `${entityType}#`
        })
      }
    };
  }

  /**
   * Build GSI3 query for provider schedule
   */
  static buildProviderScheduleQuery(providerId: string, date?: string) {
    return {
      indexName: 'GSI3',
      keyCondition: {
        pk: `PROVIDER#${providerId}`,
        ...(date && {
          skCondition: 'begins_with(GSI3SK, :datePrefix)',
          skValue: date
        })
      }
    };
  }

  /**
   * Build GSI4 query by status
   */
  static buildStatusQuery(status: string, clinicId: string) {
    return {
      indexName: 'GSI4',
      keyCondition: {
        pk: `STATUS#${status}`,
        skCondition: 'begins_with(GSI4SK, :clinicPrefix)',
        skValue: `${clinicId}#`
      }
    };
  }

  /**
   * Build GSI5 query by external ID
   */
  static buildExternalIdQuery(idType: string, idValue: string, entityType?: string) {
    return {
      indexName: 'GSI5',
      keyCondition: {
        pk: `${idType}#${idValue}`,
        ...(entityType && {
          skCondition: 'GSI5SK = :entityType',
          skValue: entityType
        })
      }
    };
  }

  /**
   * Build date-based query using GSI5
   */
  static buildDateQuery(date: string, clinicId: string, entityType?: string) {
    return {
      indexName: 'GSI5',
      keyCondition: {
        pk: `DATE#${date}`,
        skCondition: 'begins_with(GSI5SK, :clinicPrefix)',
        skValue: entityType ? `${clinicId}#${entityType}` : `${clinicId}#`
      }
    };
  }
}

/**
 * Cost optimization recommendations for GSI queries
 */
export const COST_OPTIMIZATION_TIPS = [
  {
    tip: 'Always use ProjectionExpression to fetch only needed attributes',
    example: 'projectionExpression: "patientId, firstName, lastName, phone, email"'
  },
  {
    tip: 'Use sparse GSIs to reduce storage costs',
    example: 'Only include GSI5PK/SK when external ID exists'
  },
  {
    tip: 'Implement pagination with reasonable limits',
    example: 'Limit: 25 (default), 100 (maximum)'
  },
  {
    tip: 'Use BatchGetItem for multiple specific records',
    example: 'Get multiple patients by ID instead of querying'
  },
  {
    tip: 'Consider using begins_with for efficient prefix matching',
    example: 'begins_with(SK, "APPOINTMENT#") instead of contains'
  },
  {
    tip: 'Use TTL for automatic cleanup of temporary data',
    example: 'Magic links, session tokens, audit logs older than 2 years'
  }
];

export { };