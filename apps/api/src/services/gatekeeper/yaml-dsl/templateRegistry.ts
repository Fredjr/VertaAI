/**
 * Template Registry
 * Provides access to starter pack templates
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'yaml';
import { PackYAML } from './types.js';
import { PolicyPackSetYAML } from './packValidator.js';

export interface PackTemplate {
  id: string;
  name: string;
  description: string;
  category: 'observe' | 'enforce' | 'security' | 'documentation' | 'infrastructure' | 'microservices' | 'api-contract' | 'sbom' | 'database' | 'dependencies' | 'time-based' | 'team-routing' | 'deployment' | 'service-overlay' | 'baseline';
  tags: string[];
  yaml: string;
  parsed: PackYAML;
}

/**
 * PackSet template — distinct from PackTemplate because PolicyPackSet
 * has a different structure (no rules[], uses composition.packs[]).
 */
export interface PackSetTemplate {
  id: string;
  name: string;
  description: string;
  category: 'packset';
  tags: string[];
  yaml: string;
  parsed: PolicyPackSetYAML;
}

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATES_DIR = path.join(__dirname, 'templates');

/**
 * Load all pack templates from the templates directory
 */
export function loadAllTemplates(): PackTemplate[] {
  const templates: PackTemplate[] = [];

  const templateFiles = [
    'observe-core-pack.yaml',
    'enforce-core-pack.yaml',
    'security-focused-pack.yaml',
    'documentation-pack.yaml',
    'infrastructure-pack.yaml',
    'openapi-breaking-changes-pack.yaml',      // Phase 3B.2: Template A1
    'sbom-cve-pack.yaml',                      // Phase 3C.1: Template A7
    'openapi-tests-required-pack.yaml',        // Phase 3C.3: Template A4
    'database-migration-safety-pack.yaml',     // Option C Phase 1: Template A2
    'breaking-change-documentation-pack.yaml', // Option C Phase 1: Template A3
    'high-risk-file-protection-pack.yaml',     // Option C Phase 1: Template A5
    'dependency-update-safety-pack.yaml',      // Option C Phase 1: Template A6
    'time-based-restrictions-pack.yaml',       // Option C Phase 1: Template A9
    'team-based-routing-pack.yaml',            // Option C Phase 1: Template A10
    'deploy-gate-pack.yaml',                   // Option C Phase 2: Template A8
    // Service Overlay Packs — SERVICE_OVERLAY type, service-scoped
    'api-service-overlay-pack.yaml',           // Service Overlay: API Contract Integrity
    'db-service-overlay-pack.yaml',            // Service Overlay: DB Migration Safety
    'infra-service-overlay-pack.yaml',         // Service Overlay: Infrastructure & IaC Safety
    'observability-service-overlay-pack.yaml', // Service Overlay: Observability Integrity
    // Baseline Pack — GLOBAL_BASELINE type, workspace-scoped
    'baseline-contract-integrity.yaml',        // Baseline: Workspace Contract Integrity
  ];

  for (const filename of templateFiles) {
    try {
      const filePath = path.join(TEMPLATES_DIR, filename);
      const yamlContent = fs.readFileSync(filePath, 'utf-8');
      const parsed = yaml.parse(yamlContent) as PackYAML;

      const template: PackTemplate = {
        id: parsed.metadata.id,
        name: parsed.metadata.name,
        description: parsed.metadata.description || '',
        category: getCategoryFromId(parsed.metadata.id),
        tags: parsed.metadata.tags || [],
        yaml: yamlContent,
        parsed,
      };

      templates.push(template);
    } catch (error) {
      console.error(`Failed to load template ${filename}:`, error);
    }
  }

  return templates;
}

/**
 * Get a specific template by ID
 */
export function getTemplateById(templateId: string): PackTemplate | null {
  const templates = loadAllTemplates();
  return templates.find(t => t.id === templateId) || null;
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: string): PackTemplate[] {
  const templates = loadAllTemplates();
  return templates.filter(t => t.category === category);
}

/**
 * Get templates by tag
 */
export function getTemplatesByTag(tag: string): PackTemplate[] {
  const templates = loadAllTemplates();
  return templates.filter(t => t.tags.includes(tag));
}

// ============================================================================
// GAP-O: PolicyPackSet template loader
// PackSet templates are kept separate from PackTemplate because they have a
// different structure (composition.packs[] instead of rules[]).
// ============================================================================

const PACKSET_TEMPLATE_FILES = [
  'starter-microservice-packset.yaml',  // Baseline + all 4 overlays — disabled by default (Starter tier)
  'standard-microservice-packset.yaml', // Baseline + all 4 overlays — all enabled, branch-aware blocking (Standard tier)
  'strict-microservice-packset.yaml',   // Baseline + all 4 overlays — block+approve, regulated environments (Strict tier)
];

/**
 * Load all PackSet templates from the templates directory.
 */
export function loadPackSetTemplates(): PackSetTemplate[] {
  const templates: PackSetTemplate[] = [];

  for (const filename of PACKSET_TEMPLATE_FILES) {
    try {
      const filePath = path.join(TEMPLATES_DIR, filename);
      const yamlContent = fs.readFileSync(filePath, 'utf-8');
      const parsed = yaml.parse(yamlContent) as PolicyPackSetYAML;

      const template: PackSetTemplate = {
        id: parsed.metadata.setId,
        name: parsed.metadata.name,
        description: parsed.metadata.description || '',
        category: 'packset',
        tags: parsed.metadata.labels ? Object.values(parsed.metadata.labels) : [],
        yaml: yamlContent,
        parsed,
      };

      templates.push(template);
    } catch (error) {
      console.error(`Failed to load PackSet template ${filename}:`, error);
    }
  }

  return templates;
}

/**
 * Get a specific PackSet template by setId.
 */
export function getPackSetTemplateById(setId: string): PackSetTemplate | null {
  return loadPackSetTemplates().find(t => t.id === setId) || null;
}

/**
 * Derive category from template ID
 */
function getCategoryFromId(id: string): PackTemplate['category'] {
  if (id.includes('observe')) return 'observe';
  if (id.includes('enforce')) return 'enforce';
  if (id.includes('security') || id.includes('high-risk-file')) return 'security';
  if (id.includes('documentation') || id.includes('breaking-change-documentation')) return 'documentation';
  if (id.includes('infrastructure')) return 'infrastructure';
  if (id.includes('microservices')) return 'microservices';
  if (id.includes('openapi') || id.includes('api-contract')) return 'api-contract';
  if (id.includes('sbom') || id.includes('cve')) return 'sbom';
  if (id.includes('database') || id.includes('migration')) return 'database';
  if (id.includes('dependency') || id.includes('dependencies')) return 'dependencies';
  if (id.includes('time-based') || id.includes('time-restrictions')) return 'time-based';
  if (id.includes('team-based') || id.includes('team-routing')) return 'team-routing';
  if (id.includes('deploy') || id.includes('deployment')) return 'deployment';
  if (id.includes('service-overlay') || id.includes('overlay')) return 'service-overlay';
  if (id.includes('baseline') || id.includes('contract-integrity')) return 'baseline';
  return 'enforce'; // default
}

/**
 * Get template metadata (without full YAML content)
 */
export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  ruleCount: number;
  packMode: string;
  strictness: string;
}

export function getTemplateMetadata(): TemplateMetadata[] {
  const templates = loadAllTemplates();
  return templates.map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    tags: t.tags,
    ruleCount: t.parsed.rules?.length || 0,
    packMode: t.parsed.metadata.packMode || 'enforce',
    strictness: t.parsed.metadata.strictness || 'balanced',
  }));
}

/**
 * Validate that all templates are valid
 */
export function validateAllTemplates(): { valid: boolean; errors: string[] } {
  const templates = loadAllTemplates();
  const errors: string[] = [];

  if (templates.length === 0) {
    errors.push('No templates found in templates directory');
  }

  for (const template of templates) {
    if (!template.parsed.metadata?.id) {
      errors.push(`Template ${template.name} missing metadata.id`);
    }
    if (!template.parsed.rules || template.parsed.rules.length === 0) {
      errors.push(`Template ${template.name} has no rules`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

