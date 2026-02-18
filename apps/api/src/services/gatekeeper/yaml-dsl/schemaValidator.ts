/**
 * JSON Schema Validator for Policy Packs
 * Phase 1.1: JSON Schema Implementation
 * 
 * Provides JSON Schema validation as the first layer of pack validation,
 * before business logic validation in packValidator.ts
 */

import AjvModule from 'ajv';
import type { ErrorObject } from 'ajv';
import addFormatsModule from 'ajv-formats';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ES module compatibility
const Ajv = (AjvModule as any).default || AjvModule;
const addFormats = (addFormatsModule as any).default || addFormatsModule;

// Load schema using fs (works with ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const schemaPath = join(__dirname, '../../../schemas/policypack.v1.schema.json');
const policyPackSchema = JSON.parse(readFileSync(schemaPath, 'utf-8'));

/**
 * Validation result interface matching existing packValidator format
 */
export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
  keyword?: string;
  params?: Record<string, any>;
}

/**
 * Schema Validator Service
 * 
 * Validates policy pack YAML against JSON Schema before business logic validation.
 * This ensures structural correctness and type safety.
 */
export class SchemaValidator {
  private ajv: any;
  private validateFn: any;

  constructor() {
    // Initialize AJV with strict validation
    this.ajv = new Ajv({
      allErrors: true,           // Collect all errors, not just first
      strict: false,             // Allow additional properties in some cases
      validateFormats: true,     // Validate format strings (email, date-time, etc.)
      verbose: true,             // Include schema and data in errors
      $data: true,               // Support $data references
    });

    // Add format validators (date-time, email, uri, etc.)
    addFormats(this.ajv);

    // Compile schema once during initialization
    try {
      this.validateFn = this.ajv.compile(policyPackSchema);
    } catch (error: any) {
      console.error('[SchemaValidator] Failed to compile schema:', error);
      throw new Error(`Schema compilation failed: ${error.message}`);
    }
  }

  /**
   * Validate a parsed policy pack object against JSON Schema
   * 
   * @param packData - Parsed YAML object (not string)
   * @returns ValidationResult with errors if invalid
   */
  validatePack(packData: any): ValidationResult {
    // Validate against schema
    const valid = this.validateFn(packData);

    if (!valid && this.validateFn.errors) {
      return {
        valid: false,
        errors: this.formatErrors(this.validateFn.errors),
      };
    }

    return { valid: true };
  }

  /**
   * Format AJV errors into our standard error format
   * 
   * Converts AJV's ErrorObject[] into user-friendly ValidationError[]
   */
  private formatErrors(ajvErrors: ErrorObject[]): ValidationError[] {
    return ajvErrors.map(err => {
      // Build a user-friendly path
      const path = this.buildErrorPath(err);
      
      // Build a user-friendly message
      const message = this.buildErrorMessage(err);

      return {
        path,
        message,
        keyword: err.keyword,
        params: err.params,
      };
    });
  }

  /**
   * Build a user-friendly path from AJV error
   * 
   * Examples:
   * - "/metadata/id" -> "metadata.id"
   * - "/rules/0/obligations/1/comparator" -> "rules[0].obligations[1].comparator"
   */
  private buildErrorPath(err: ErrorObject): string {
    let path = err.instancePath || '';
    
    // Convert JSON Pointer format to dot notation
    path = path
      .replace(/^\//, '')           // Remove leading slash
      .replace(/\//g, '.')          // Replace slashes with dots
      .replace(/\.(\d+)/g, '[$1]'); // Convert .0 to [0]

    // If path is empty, use schemaPath
    if (!path && err.schemaPath) {
      path = err.schemaPath.split('/').pop() || 'root';
    }

    return path || 'root';
  }

  /**
   * Build a user-friendly error message
   * 
   * Enhances AJV's default messages with context
   */
  private buildErrorMessage(err: ErrorObject): string {
    const baseMessage = err.message || 'Validation error';

    // Add context for specific error types
    switch (err.keyword) {
      case 'required':
        return `Missing required field: ${err.params.missingProperty}`;
      
      case 'enum':
        return `Invalid value. Must be one of: ${err.params.allowedValues?.join(', ')}`;
      
      case 'const':
        return `Must be exactly: ${err.params.allowedValue}`;
      
      case 'type':
        return `Invalid type. Expected ${err.params.type}, got ${typeof err.data}`;
      
      case 'pattern':
        return `Does not match required pattern: ${err.params.pattern}`;
      
      case 'minItems':
        return `Must have at least ${err.params.limit} items`;
      
      case 'oneOf':
        return `Must match exactly one schema (either comparator or comparatorId required)`;
      
      default:
        return baseMessage;
    }
  }
}

/**
 * Singleton instance for use across the application
 */
export const schemaValidator = new SchemaValidator();

