/**
 * YAML Config Loader
 * 
 * Loads and validates contractpacks.yaml files.
 * Supports:
 * - File system loading
 * - GitHub repository loading
 * - Validation with Zod schemas
 * - Error reporting with line numbers
 */

import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import * as path from 'path';
import { validateContractPacksConfig, type ContractPacksConfig } from './schema.js';
import { ZodError } from 'zod';

// ======================================================================
// TYPES
// ======================================================================

export interface YamlLoadResult {
  success: boolean;
  config?: ContractPacksConfig;
  error?: string;
  validationErrors?: Array<{
    path: string;
    message: string;
  }>;
}

// ======================================================================
// LOADER
// ======================================================================

export class YamlConfigLoader {
  /**
   * Load and validate YAML config from file system
   */
  async loadFromFile(filePath: string): Promise<YamlLoadResult> {
    try {
      // Read file
      const content = await fs.readFile(filePath, 'utf-8');

      // Parse YAML
      const data = yaml.load(content);
      
      // Validate with Zod
      const config = validateContractPacksConfig(data);
      
      return {
        success: true,
        config,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Load and validate YAML config from string
   */
  async loadFromString(content: string): Promise<YamlLoadResult> {
    try {
      // Parse YAML
      const data = yaml.load(content);
      
      // Validate with Zod
      const config = validateContractPacksConfig(data);
      
      return {
        success: true,
        config,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Load and validate YAML config from GitHub repository
   * 
   * @param owner - Repository owner (e.g., "Fredjr")
   * @param repo - Repository name (e.g., "VertaAI")
   * @param ref - Git ref (branch, tag, or commit SHA). Default: "main"
   * @param filePath - Path to YAML file in repo. Default: ".verta/contractpacks.yaml"
   */
  async loadFromGitHub(
    owner: string,
    repo: string,
    ref: string = 'main',
    filePath: string = '.verta/contractpacks.yaml'
  ): Promise<YamlLoadResult> {
    try {
      // Fetch file from GitHub API
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${ref}`;
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.github.v3.raw',
          'User-Agent': 'VertaAI-ContractGate',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return {
            success: false,
            error: `File not found: ${filePath} in ${owner}/${repo}@${ref}`,
          };
        }
        return {
          success: false,
          error: `GitHub API error: ${response.status} ${response.statusText}`,
        };
      }

      const content = await response.text();
      
      // Parse and validate
      return this.loadFromString(content);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Check if YAML config file exists in repository
   */
  async existsInGitHub(
    owner: string,
    repo: string,
    ref: string = 'main',
    filePath: string = '.verta/contractpacks.yaml'
  ): Promise<boolean> {
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${ref}`;
      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'VertaAI-ContractGate',
        },
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  // ======================================================================
  // ERROR HANDLING
  // ======================================================================

  private handleError(error: unknown): YamlLoadResult {
    if (error instanceof ZodError) {
      // Zod validation error
      return {
        success: false,
        error: 'YAML validation failed',
        validationErrors: error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message,
        })),
      };
    }

    if (error instanceof yaml.YAMLException) {
      // YAML parsing error
      return {
        success: false,
        error: `YAML parse error: ${error.message}`,
      };
    }

    if (error instanceof Error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: false,
      error: 'Unknown error loading YAML config',
    };
  }
}

// ======================================================================
// SINGLETON
// ======================================================================

let loaderInstance: YamlConfigLoader | null = null;

export function getYamlConfigLoader(): YamlConfigLoader {
  if (!loaderInstance) {
    loaderInstance = new YamlConfigLoader();
  }
  return loaderInstance;
}

