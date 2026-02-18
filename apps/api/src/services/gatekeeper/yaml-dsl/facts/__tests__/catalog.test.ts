/**
 * Fact Catalog Tests
 * Phase 2.1 - Hybrid Comparator/Fact-Based Approach
 */

import { describe, it, expect } from 'vitest';
import { factCatalog } from '../catalog.js';

describe('FactCatalog', () => {
  it('should have universal facts registered', () => {
    expect(factCatalog.has('scope.workspace')).toBe(true);
    expect(factCatalog.has('scope.repository')).toBe(true);
    expect(factCatalog.has('scope.branch')).toBe(true);
    expect(factCatalog.has('actor.user')).toBe(true);
    expect(factCatalog.has('event.type')).toBe(true);
    expect(factCatalog.has('time.utc')).toBe(true);
  });

  it('should have PR metadata facts registered', () => {
    expect(factCatalog.has('pr.id')).toBe(true);
    expect(factCatalog.has('pr.title')).toBe(true);
    expect(factCatalog.has('pr.labels')).toBe(true);
    expect(factCatalog.has('pr.isDraft')).toBe(true);
    expect(factCatalog.has('pr.approvals.count')).toBe(true);
    expect(factCatalog.has('pr.approvals.users')).toBe(true);
    expect(factCatalog.has('pr.approvals.teams')).toBe(true);
  });

  it('should have diff facts registered', () => {
    expect(factCatalog.has('diff.filesChanged.count')).toBe(true);
    expect(factCatalog.has('diff.filesChanged.paths')).toBe(true);
    expect(factCatalog.has('diff.linesAdded')).toBe(true);
    expect(factCatalog.has('diff.linesDeleted')).toBe(true);
    expect(factCatalog.has('diff.linesChanged')).toBe(true);
  });

  it('should get fact by ID', () => {
    const fact = factCatalog.get('pr.approvals.count');
    expect(fact).toBeDefined();
    expect(fact?.id).toBe('pr.approvals.count');
    expect(fact?.name).toBe('Approval Count');
    expect(fact?.category).toBe('pr');
    expect(fact?.valueType).toBe('number');
  });

  it('should get facts by category', () => {
    const universalFacts = factCatalog.getByCategory('universal');
    expect(universalFacts.length).toBeGreaterThan(0);
    expect(universalFacts.every(f => f.category === 'universal')).toBe(true);

    const prFacts = factCatalog.getByCategory('pr');
    expect(prFacts.length).toBeGreaterThan(0);
    expect(prFacts.every(f => f.category === 'pr')).toBe(true);

    const diffFacts = factCatalog.getByCategory('diff');
    expect(diffFacts.length).toBeGreaterThan(0);
    expect(diffFacts.every(f => f.category === 'diff')).toBe(true);
  });

  it('should get all facts', () => {
    const allFacts = factCatalog.getAll();
    expect(allFacts.length).toBeGreaterThan(15); // At least 15 facts
    expect(allFacts.every(f => f.id && f.name && f.resolver)).toBe(true);
  });

  it('should get catalog version', () => {
    const version = factCatalog.getVersion();
    expect(version).toBe('v1.0.0');
  });

  it('should get catalog version info', () => {
    const versionInfo = factCatalog.getCatalogVersion();
    expect(versionInfo.version).toBe('v1.0.0');
    expect(versionInfo.releaseDate).toBe('2026-02-18');
    expect(versionInfo.facts.length).toBeGreaterThan(0);
    expect(versionInfo.changelog).toBeDefined();
  });

  it('should return undefined for non-existent fact', () => {
    const fact = factCatalog.get('non.existent.fact');
    expect(fact).toBeUndefined();
  });

  it('should count facts correctly', () => {
    const count = factCatalog.count();
    expect(count).toBeGreaterThan(15);
    expect(count).toBe(factCatalog.getAll().length);
  });

  it('should have correct fact structure', () => {
    const fact = factCatalog.get('pr.approvals.count');
    expect(fact).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      description: expect.any(String),
      category: expect.any(String),
      valueType: expect.any(String),
      version: expect.any(String),
      resolver: expect.any(Function),
    });
  });

  it('should have examples for facts', () => {
    const fact = factCatalog.get('pr.approvals.count');
    expect(fact?.examples).toBeDefined();
    expect(Array.isArray(fact?.examples)).toBe(true);
  });
});

