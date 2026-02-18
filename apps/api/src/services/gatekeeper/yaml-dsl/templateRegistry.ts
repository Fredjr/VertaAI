/**
 * Template Registry
 * Provides access to starter pack templates
 */

import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { PackYAML } from './types';

export interface PackTemplate {
  id: string;
  name: string;
  description: string;
  category: 'observe' | 'enforce' | 'security' | 'documentation' | 'infrastructure' | 'microservices';
  tags: string[];
  yaml: string;
  parsed: PackYAML;
}

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

/**
 * Derive category from template ID
 */
function getCategoryFromId(id: string): PackTemplate['category'] {
  if (id.includes('observe')) return 'observe';
  if (id.includes('enforce')) return 'enforce';
  if (id.includes('security')) return 'security';
  if (id.includes('documentation')) return 'documentation';
  if (id.includes('infrastructure')) return 'infrastructure';
  if (id.includes('microservices')) return 'microservices';
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

