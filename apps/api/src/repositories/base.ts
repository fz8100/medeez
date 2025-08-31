import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  QueryCommand,
  BatchGetItemCommand,
  BatchWriteItemCommand,
  TransactWriteItemsCommand,
  ScanCommand
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand as DocQueryCommand,
  BatchGetCommand,
  BatchWriteCommand,
  TransactWriteCommand,
  ScanCommand as DocScanCommand
} from '@aws-sdk/lib-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { BaseEntity, QueryOptions, QueryConfig, AppError, NotFoundError } from '@/types';
import { logger } from '@/utils/logger';
import { compressData, decompressData } from '@/utils/compression';

export interface PaginatedResult<T> {
  items: T[];
  nextToken?: string;
  hasMore: boolean;
  count: number;
}

export interface BatchResult<T> {
  processed: T[];
  unprocessed: any[];
}

export abstract class BaseRepository<T extends BaseEntity> {
  protected client: DynamoDBDocumentClient;
  protected tableName: string;

  constructor() {
    const dynamoClient = new DynamoDBClient({
      region: process.env.AWS_REGION || 'us-east-1',
      maxAttempts: 3
    });
    
    this.client = DynamoDBDocumentClient.from(dynamoClient, {
      marshallOptions: {
        convertEmptyValues: false,
        removeUndefinedValues: true,
        convertClassInstanceToMap: true
      },
      unmarshallOptions: {
        wrapNumbers: false
      }
    });
    
    this.tableName = process.env.DYNAMODB_TABLE_NAME || 'medeez-table';
  }

  // Abstract methods to be implemented by child classes
  protected abstract getEntityType(): string;
  protected abstract validateEntity(entity: Partial<T>): void;
  protected abstract transformForStorage(entity: T): Record<string, any>;
  protected abstract transformFromStorage(item: Record<string, any>): T;

  /**
   * Get single item by primary key with projection
   * Cost optimization: Use ProjectionExpression to fetch only needed attributes
   */
  async get(
    pk: string, 
    sk: string, 
    options: { 
      projectionExpression?: string;
      attributesToGet?: string[];
    } = {}
  ): Promise<T | null> {
    try {
      const params: any = {
        TableName: this.tableName,
        Key: { PK: pk, SK: sk }
      };

      // Cost optimization: Only fetch required attributes
      if (options.projectionExpression) {
        params.ProjectionExpression = options.projectionExpression;
      } else if (options.attributesToGet) {
        params.ProjectionExpression = options.attributesToGet.join(', ');
      }

      const command = new GetCommand(params);
      const result = await this.client.send(command);

      if (!result.Item) {
        return null;
      }

      return this.transformFromStorage(result.Item);
    } catch (error) {
      logger.error(`Failed to get item: ${pk}#${sk}`, error);
      throw new AppError(`Failed to retrieve ${this.getEntityType()}`);
    }
  }

  /**
   * Batch get multiple items - Cost optimization over multiple GetItem calls
   */
  async batchGet(
    keys: Array<{ pk: string; sk: string }>,
    options: {
      projectionExpression?: string;
      attributesToGet?: string[];
    } = {}
  ): Promise<BatchResult<T>> {
    if (keys.length === 0) {
      return { processed: [], unprocessed: [] };
    }

    // DynamoDB BatchGetItem limit is 100 items
    const batchSize = 100;
    const batches = [];
    
    for (let i = 0; i < keys.length; i += batchSize) {
      batches.push(keys.slice(i, i + batchSize));
    }

    const processed: T[] = [];
    const unprocessed: any[] = [];

    for (const batch of batches) {
      try {
        const requestItems: any = {
          [this.tableName]: {
            Keys: batch.map(key => ({ PK: key.pk, SK: key.sk }))
          }
        };

        // Cost optimization: Projection
        if (options.projectionExpression) {
          requestItems[this.tableName].ProjectionExpression = options.projectionExpression;
        } else if (options.attributesToGet) {
          requestItems[this.tableName].ProjectionExpression = options.attributesToGet.join(', ');
        }

        const command = new BatchGetCommand({
          RequestItems: requestItems
        });

        const result = await this.client.send(command);
        
        if (result.Responses?.[this.tableName]) {
          const items = result.Responses[this.tableName].map(item => 
            this.transformFromStorage(item)
          );
          processed.push(...items);
        }

        // Handle unprocessed keys
        if (result.UnprocessedKeys?.[this.tableName]) {
          unprocessed.push(...result.UnprocessedKeys[this.tableName].Keys);
        }

      } catch (error) {
        logger.error('Batch get operation failed', error);
        throw new AppError('Failed to batch retrieve items');
      }
    }

    return { processed, unprocessed };
  }

  /**
   * Put item with automatic key generation and validation
   */
  async create(entity: Omit<T, keyof BaseEntity>): Promise<T> {
    this.validateEntity(entity);

    const now = new Date().toISOString();
    const fullEntity: T = {
      ...entity,
      entityType: this.getEntityType(),
      createdAt: now,
      updatedAt: now
    } as T;

    const item = this.transformForStorage(fullEntity);

    try {
      // Add condition to prevent overwrites
      const command = new PutCommand({
        TableName: this.tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(PK)'
      });

      await this.client.send(command);
      logger.info(`Created ${this.getEntityType()}: ${item.PK}#${item.SK}`);
      
      return fullEntity;
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new AppError(`${this.getEntityType()} already exists`, 409, 'ALREADY_EXISTS');
      }
      logger.error(`Failed to create ${this.getEntityType()}`, error);
      throw new AppError(`Failed to create ${this.getEntityType()}`);
    }
  }

  /**
   * Update item with optimistic locking
   */
  async update(
    pk: string,
    sk: string,
    updates: Partial<T>,
    options: { skipVersionCheck?: boolean } = {}
  ): Promise<T> {
    this.validateEntity(updates);

    const now = new Date().toISOString();
    const updateItem = {
      ...updates,
      updatedAt: now
    };

    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    Object.entries(updateItem).forEach(([key, value], index) => {
      if (value !== undefined) {
        const nameKey = `#attr${index}`;
        const valueKey = `:val${index}`;
        
        updateExpressions.push(`${nameKey} = ${valueKey}`);
        expressionAttributeNames[nameKey] = key;
        expressionAttributeValues[valueKey] = value;
      }
    });

    try {
      const command = new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: pk, SK: sk },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: options.skipVersionCheck ? undefined : 'attribute_exists(PK)',
        ReturnValues: 'ALL_NEW'
      });

      const result = await this.client.send(command);
      
      if (!result.Attributes) {
        throw new NotFoundError(this.getEntityType());
      }

      return this.transformFromStorage(result.Attributes);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new NotFoundError(this.getEntityType());
      }
      logger.error(`Failed to update ${this.getEntityType()}: ${pk}#${sk}`, error);
      throw new AppError(`Failed to update ${this.getEntityType()}`);
    }
  }

  /**
   * Delete item with condition
   */
  async delete(pk: string, sk: string): Promise<void> {
    try {
      const command = new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: pk, SK: sk },
        ConditionExpression: 'attribute_exists(PK)',
        ReturnValues: 'ALL_OLD'
      });

      const result = await this.client.send(command);
      
      if (!result.Attributes) {
        throw new NotFoundError(this.getEntityType());
      }

      logger.info(`Deleted ${this.getEntityType()}: ${pk}#${sk}`);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new NotFoundError(this.getEntityType());
      }
      logger.error(`Failed to delete ${this.getEntityType()}: ${pk}#${sk}`, error);
      throw new AppError(`Failed to delete ${this.getEntityType()}`);
    }
  }

  /**
   * Query with cost optimization
   */
  async query(
    keyCondition: {
      pk: string;
      skCondition?: string; // e.g., "begins_with(SK, :sk)"
      skValue?: any;
    },
    options: QueryOptions & QueryConfig = {}
  ): Promise<PaginatedResult<T>> {
    try {
      const params: any = {
        TableName: this.tableName,
        KeyConditionExpression: `PK = :pk${keyCondition.skCondition ? ` AND ${keyCondition.skCondition}` : ''}`,
        ExpressionAttributeValues: {
          ':pk': keyCondition.pk,
          ...(keyCondition.skValue ? { ':sk': keyCondition.skValue } : {})
        },
        ScanIndexForward: options.sortDirection !== 'desc',
        Limit: Math.min(options.limit || 25, 100) // Cost optimization: Limit results
      };

      // Cost optimization: Projection
      if (options.projectionExpression) {
        params.ProjectionExpression = options.projectionExpression;
      } else if (options.attributesToGet) {
        params.ProjectionExpression = options.attributesToGet.join(', ');
      }

      // GSI query
      if (options.indexName) {
        params.IndexName = options.indexName;
      }

      // Pagination
      if (options.nextToken) {
        try {
          params.ExclusiveStartKey = JSON.parse(Buffer.from(options.nextToken, 'base64').toString());
        } catch {
          // Invalid token, start from beginning
        }
      }

      // Filters
      if (options.filters && Object.keys(options.filters).length > 0) {
        const filterExpressions: string[] = [];
        Object.entries(options.filters).forEach(([key, value], index) => {
          const nameKey = `#filter${index}`;
          const valueKey = `:filter${index}`;
          
          filterExpressions.push(`${nameKey} = ${valueKey}`);
          
          if (!params.ExpressionAttributeNames) {
            params.ExpressionAttributeNames = {};
          }
          params.ExpressionAttributeNames[nameKey] = key;
          params.ExpressionAttributeValues[valueKey] = value;
        });
        
        if (filterExpressions.length > 0) {
          params.FilterExpression = filterExpressions.join(' AND ');
        }
      }

      const command = new DocQueryCommand(params);
      const result = await this.client.send(command);

      const items = (result.Items || []).map(item => this.transformFromStorage(item));
      
      let nextToken: string | undefined;
      if (result.LastEvaluatedKey) {
        nextToken = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
      }

      return {
        items,
        nextToken,
        hasMore: !!result.LastEvaluatedKey,
        count: items.length
      };

    } catch (error) {
      logger.error(`Query failed for ${this.getEntityType()}`, error);
      throw new AppError(`Failed to query ${this.getEntityType()}`);
    }
  }

  /**
   * Batch write operations (create/update/delete)
   */
  async batchWrite(operations: Array<{
    operation: 'PUT' | 'DELETE';
    item?: T;
    key?: { pk: string; sk: string };
  }>): Promise<BatchResult<any>> {
    if (operations.length === 0) {
      return { processed: [], unprocessed: [] };
    }

    const batchSize = 25; // DynamoDB BatchWrite limit
    const batches = [];
    
    for (let i = 0; i < operations.length; i += batchSize) {
      batches.push(operations.slice(i, i + batchSize));
    }

    const processed: any[] = [];
    const unprocessed: any[] = [];

    for (const batch of batches) {
      try {
        const requestItems: any = {
          [this.tableName]: batch.map(op => {
            if (op.operation === 'PUT' && op.item) {
              return {
                PutRequest: {
                  Item: this.transformForStorage(op.item)
                }
              };
            } else if (op.operation === 'DELETE' && op.key) {
              return {
                DeleteRequest: {
                  Key: { PK: op.key.pk, SK: op.key.sk }
                }
              };
            }
            return null;
          }).filter(Boolean)
        };

        const command = new BatchWriteCommand({
          RequestItems: requestItems
        });

        const result = await this.client.send(command);
        processed.push(...batch);

        // Handle unprocessed items
        if (result.UnprocessedItems?.[this.tableName]) {
          unprocessed.push(...result.UnprocessedItems[this.tableName]);
        }

      } catch (error) {
        logger.error('Batch write operation failed', error);
        throw new AppError('Failed to batch write items');
      }
    }

    return { processed, unprocessed };
  }

  /**
   * Transaction write operations
   */
  async transactWrite(operations: Array<{
    operation: 'PUT' | 'UPDATE' | 'DELETE';
    item?: T;
    key?: { pk: string; sk: string };
    updates?: Partial<T>;
    conditionExpression?: string;
  }>): Promise<void> {
    const now = new Date().toISOString();
    
    const transactItems = operations.map(op => {
      switch (op.operation) {
        case 'PUT':
          if (!op.item) throw new AppError('Item required for PUT operation');
          return {
            Put: {
              TableName: this.tableName,
              Item: this.transformForStorage({
                ...op.item,
                updatedAt: now
              } as T),
              ConditionExpression: op.conditionExpression
            }
          };
          
        case 'UPDATE':
          if (!op.key || !op.updates) throw new AppError('Key and updates required for UPDATE operation');
          
          const updateExpressions: string[] = [];
          const expressionAttributeNames: Record<string, string> = {};
          const expressionAttributeValues: Record<string, any> = {};

          Object.entries({ ...op.updates, updatedAt: now }).forEach(([key, value], index) => {
            if (value !== undefined) {
              const nameKey = `#attr${index}`;
              const valueKey = `:val${index}`;
              
              updateExpressions.push(`${nameKey} = ${valueKey}`);
              expressionAttributeNames[nameKey] = key;
              expressionAttributeValues[valueKey] = value;
            }
          });

          return {
            Update: {
              TableName: this.tableName,
              Key: { PK: op.key.pk, SK: op.key.sk },
              UpdateExpression: `SET ${updateExpressions.join(', ')}`,
              ExpressionAttributeNames: expressionAttributeNames,
              ExpressionAttributeValues: expressionAttributeValues,
              ConditionExpression: op.conditionExpression
            }
          };
          
        case 'DELETE':
          if (!op.key) throw new AppError('Key required for DELETE operation');
          return {
            Delete: {
              TableName: this.tableName,
              Key: { PK: op.key.pk, SK: op.key.sk },
              ConditionExpression: op.conditionExpression
            }
          };
          
        default:
          throw new AppError(`Unsupported transaction operation: ${op.operation}`);
      }
    });

    try {
      const command = new TransactWriteCommand({
        TransactItems: transactItems
      });

      await this.client.send(command);
      logger.info(`Transaction completed with ${operations.length} operations`);
    } catch (error) {
      logger.error('Transaction failed', error);
      throw new AppError('Transaction failed');
    }
  }

  /**
   * Scan with filters (use sparingly for cost optimization)
   */
  async scan(
    options: QueryOptions & QueryConfig & {
      filterExpression?: string;
      expressionAttributeNames?: Record<string, string>;
      expressionAttributeValues?: Record<string, any>;
    } = {}
  ): Promise<PaginatedResult<T>> {
    try {
      const params: any = {
        TableName: this.tableName,
        Limit: Math.min(options.limit || 25, 100) // Cost optimization
      };

      // Cost optimization: Projection
      if (options.projectionExpression) {
        params.ProjectionExpression = options.projectionExpression;
      } else if (options.attributesToGet) {
        params.ProjectionExpression = options.attributesToGet.join(', ');
      }

      // GSI scan
      if (options.indexName) {
        params.IndexName = options.indexName;
      }

      // Pagination
      if (options.nextToken) {
        try {
          params.ExclusiveStartKey = JSON.parse(Buffer.from(options.nextToken, 'base64').toString());
        } catch {
          // Invalid token, start from beginning
        }
      }

      // Filters
      if (options.filterExpression) {
        params.FilterExpression = options.filterExpression;
        if (options.expressionAttributeNames) {
          params.ExpressionAttributeNames = options.expressionAttributeNames;
        }
        if (options.expressionAttributeValues) {
          params.ExpressionAttributeValues = options.expressionAttributeValues;
        }
      }

      const command = new DocScanCommand(params);
      const result = await this.client.send(command);

      const items = (result.Items || []).map(item => this.transformFromStorage(item));
      
      let nextToken: string | undefined;
      if (result.LastEvaluatedKey) {
        nextToken = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
      }

      return {
        items,
        nextToken,
        hasMore: !!result.LastEvaluatedKey,
        count: items.length
      };

    } catch (error) {
      logger.error(`Scan failed for ${this.getEntityType()}`, error);
      throw new AppError(`Failed to scan ${this.getEntityType()}`);
    }
  }
}

export { };