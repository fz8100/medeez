import * as LZString from 'lz-string';
import { AppError } from '@/types';
import { logger } from './logger';

export interface CompressionOptions {
  threshold?: number;    // Minimum string length to compress (default: 1000)
  algorithm?: 'lz' | 'base64'; // Compression algorithm
  level?: number;        // Compression level (future use)
}

export interface CompressedData {
  data: string;
  compressed: boolean;
  originalSize: number;
  compressedSize: number;
  algorithm: string;
  ratio: number;
}

/**
 * Compression service for large text fields (SOAP notes, medical records)
 * Reduces DynamoDB storage costs for large documents
 */
export class CompressionService {
  private defaultOptions: Required<CompressionOptions> = {
    threshold: 1000,
    algorithm: 'lz',
    level: 1
  };

  /**
   * Compress text data if it exceeds threshold
   * Cost optimization: Only compress large strings to save storage
   */
  compress(text: string, options: CompressionOptions = {}): CompressedData {
    const opts = { ...this.defaultOptions, ...options };
    const originalSize = Buffer.byteLength(text, 'utf8');

    // Skip compression if text is below threshold
    if (originalSize < opts.threshold) {
      return {
        data: text,
        compressed: false,
        originalSize,
        compressedSize: originalSize,
        algorithm: 'none',
        ratio: 1.0
      };
    }

    try {
      let compressedData: string;
      
      switch (opts.algorithm) {
        case 'lz':
          compressedData = LZString.compress(text) || text;
          break;
        case 'base64':
          compressedData = LZString.compressToBase64(text) || text;
          break;
        default:
          throw new Error(`Unsupported compression algorithm: ${opts.algorithm}`);
      }

      const compressedSize = Buffer.byteLength(compressedData, 'utf8');
      const ratio = compressedSize / originalSize;

      // If compression didn't help much, return original
      if (ratio > 0.9) {
        return {
          data: text,
          compressed: false,
          originalSize,
          compressedSize: originalSize,
          algorithm: 'none',
          ratio: 1.0
        };
      }

      logger.debug(`Compressed text: ${originalSize} -> ${compressedSize} bytes (${(ratio * 100).toFixed(1)}%)`);

      return {
        data: compressedData,
        compressed: true,
        originalSize,
        compressedSize,
        algorithm: opts.algorithm,
        ratio
      };

    } catch (error) {
      logger.error('Compression failed, returning original text', error);
      
      return {
        data: text,
        compressed: false,
        originalSize,
        compressedSize: originalSize,
        algorithm: 'error',
        ratio: 1.0
      };
    }
  }

  /**
   * Decompress text data
   */
  decompress(compressedData: CompressedData): string {
    if (!compressedData.compressed) {
      return compressedData.data;
    }

    try {
      let decompressed: string | null = null;

      switch (compressedData.algorithm) {
        case 'lz':
          decompressed = LZString.decompress(compressedData.data);
          break;
        case 'base64':
          decompressed = LZString.decompressFromBase64(compressedData.data);
          break;
        default:
          throw new Error(`Unsupported compression algorithm: ${compressedData.algorithm}`);
      }

      if (decompressed === null) {
        throw new Error('Decompression returned null');
      }

      return decompressed;

    } catch (error) {
      logger.error('Decompression failed', { error, algorithm: compressedData.algorithm });
      throw new AppError('Failed to decompress data', 500, 'DECOMPRESSION_FAILED');
    }
  }

  /**
   * Compress SOAP note content for storage
   */
  compressSOAPContent(content: {
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
  }): Record<string, CompressedData> {
    const compressed: Record<string, CompressedData> = {};

    Object.entries(content).forEach(([key, value]) => {
      if (value && typeof value === 'string') {
        compressed[key] = this.compress(value, {
          threshold: 500, // Lower threshold for medical notes
          algorithm: 'lz'
        });
      }
    });

    return compressed;
  }

  /**
   * Decompress SOAP note content
   */
  decompressSOAPContent(compressedContent: Record<string, CompressedData>): {
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
  } {
    const decompressed: any = {};

    Object.entries(compressedContent).forEach(([key, compressedData]) => {
      if (compressedData) {
        decompressed[key] = this.decompress(compressedData);
      }
    });

    return decompressed;
  }

  /**
   * Batch compress multiple text fields
   */
  compressBatch(
    fields: Record<string, string>,
    options: CompressionOptions = {}
  ): Record<string, CompressedData> {
    const results: Record<string, CompressedData> = {};

    Object.entries(fields).forEach(([key, value]) => {
      if (value && typeof value === 'string') {
        results[key] = this.compress(value, options);
      }
    });

    return results;
  }

  /**
   * Batch decompress multiple compressed fields
   */
  decompressBatch(compressedFields: Record<string, CompressedData>): Record<string, string> {
    const results: Record<string, string> = {};

    Object.entries(compressedFields).forEach(([key, compressedData]) => {
      if (compressedData) {
        results[key] = this.decompress(compressedData);
      }
    });

    return results;
  }

  /**
   * Get compression statistics for monitoring
   */
  getCompressionStats(compressedData: CompressedData[]): {
    totalOriginalSize: number;
    totalCompressedSize: number;
    averageRatio: number;
    savings: number;
    savingsPercent: number;
  } {
    const totalOriginalSize = compressedData.reduce((sum, item) => sum + item.originalSize, 0);
    const totalCompressedSize = compressedData.reduce((sum, item) => sum + item.compressedSize, 0);
    const averageRatio = compressedData.reduce((sum, item) => sum + item.ratio, 0) / compressedData.length;
    const savings = totalOriginalSize - totalCompressedSize;
    const savingsPercent = (savings / totalOriginalSize) * 100;

    return {
      totalOriginalSize,
      totalCompressedSize,
      averageRatio,
      savings,
      savingsPercent
    };
  }

  /**
   * Check if text should be compressed based on size and content
   */
  shouldCompress(text: string, threshold: number = 1000): boolean {
    if (!text || typeof text !== 'string') {
      return false;
    }

    const size = Buffer.byteLength(text, 'utf8');
    
    // Don't compress if below threshold
    if (size < threshold) {
      return false;
    }

    // Don't compress if it's mostly random data (low compression ratio expected)
    const entropy = this.calculateEntropy(text);
    if (entropy > 7.5) { // Very high entropy, compression unlikely to help
      return false;
    }

    return true;
  }

  /**
   * Calculate Shannon entropy of text to estimate compression potential
   */
  private calculateEntropy(text: string): number {
    const freq: Record<string, number> = {};
    
    // Count character frequencies
    for (const char of text) {
      freq[char] = (freq[char] || 0) + 1;
    }

    const length = text.length;
    let entropy = 0;

    // Calculate Shannon entropy
    Object.values(freq).forEach(count => {
      const probability = count / length;
      entropy -= probability * Math.log2(probability);
    });

    return entropy;
  }
}

// Singleton instance
export const compressionService = new CompressionService();

// Convenience functions
export function compressData(text: string, options?: CompressionOptions): CompressedData {
  return compressionService.compress(text, options);
}

export function decompressData(compressedData: CompressedData): string {
  return compressionService.decompress(compressedData);
}

export function compressSOAPNote(content: {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
}): Record<string, CompressedData> {
  return compressionService.compressSOAPContent(content);
}

export function decompressSOAPNote(compressedContent: Record<string, CompressedData>): {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
} {
  return compressionService.decompressSOAPContent(compressedContent);
}

export { };