/**
 * Unit tests for context expansion module (Phase 4)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { selectFilesForExpansion, fetchExpandedContext } from '../../services/context/expansion.js';

describe('Context Expansion - selectFilesForExpansion', () => {
  it('should select top 3 files by change volume', () => {
    const changedFiles = [
      { filename: 'src/a.ts', additions: 10, deletions: 5, status: 'modified' },
      { filename: 'src/b.ts', additions: 50, deletions: 20, status: 'modified' },
      { filename: 'src/c.ts', additions: 5, deletions: 2, status: 'modified' },
      { filename: 'src/d.ts', additions: 30, deletions: 10, status: 'modified' },
      { filename: 'src/e.ts', additions: 15, deletions: 8, status: 'modified' },
    ];

    const selected = selectFilesForExpansion(changedFiles);

    expect(selected).toHaveLength(3);
    expect(selected).toEqual(['src/b.ts', 'src/d.ts', 'src/e.ts']);
  });

  it('should filter out binary files', () => {
    const changedFiles = [
      { filename: 'src/code.ts', additions: 50, deletions: 20, status: 'modified' },
      { filename: 'assets/logo.png', additions: 100, deletions: 0, status: 'added' },
      { filename: 'src/utils.ts', additions: 30, deletions: 10, status: 'modified' },
    ];

    const selected = selectFilesForExpansion(changedFiles);

    expect(selected).toHaveLength(2);
    expect(selected).toEqual(['src/code.ts', 'src/utils.ts']);
    expect(selected).not.toContain('assets/logo.png');
  });

  it('should handle fewer than 3 eligible files', () => {
    const changedFiles = [
      { filename: 'src/a.ts', additions: 10, deletions: 5, status: 'modified' },
      { filename: 'src/b.ts', additions: 20, deletions: 10, status: 'modified' },
    ];

    const selected = selectFilesForExpansion(changedFiles);

    expect(selected).toHaveLength(2);
    expect(selected).toEqual(['src/b.ts', 'src/a.ts']);
  });

  it('should handle empty input', () => {
    const selected = selectFilesForExpansion([]);
    expect(selected).toHaveLength(0);
  });

  it('should handle all binary files', () => {
    const changedFiles = [
      { filename: 'image1.png', additions: 100, deletions: 0, status: 'added' },
      { filename: 'image2.jpg', additions: 200, deletions: 0, status: 'added' },
      { filename: 'image3.gif', additions: 300, deletions: 0, status: 'added' },
    ];

    const selected = selectFilesForExpansion(changedFiles);
    expect(selected).toHaveLength(0);
  });

  it('should prioritize by total change volume (additions + deletions)', () => {
    const changedFiles = [
      { filename: 'high-additions.ts', additions: 100, deletions: 0, status: 'modified' },
      { filename: 'high-deletions.ts', additions: 0, deletions: 100, status: 'modified' },
      { filename: 'balanced.ts', additions: 60, deletions: 60, status: 'modified' },
      { filename: 'low.ts', additions: 10, deletions: 10, status: 'modified' },
    ];

    const selected = selectFilesForExpansion(changedFiles);

    expect(selected).toHaveLength(3);
    // balanced.ts has 120 total, high-additions and high-deletions have 100 each
    expect(selected[0]).toBe('balanced.ts');
  });

  it('should filter out lock files and minified files', () => {
    const changedFiles = [
      { filename: 'yarn.lock', additions: 1000, deletions: 500, status: 'modified' },
      { filename: 'src/app.min.js', additions: 500, deletions: 200, status: 'modified' },
      { filename: 'src/app.ts', additions: 50, deletions: 20, status: 'modified' },
    ];

    const selected = selectFilesForExpansion(changedFiles);

    expect(selected).toHaveLength(1);
    expect(selected).toEqual(['src/app.ts']);
  });
});

describe('Context Expansion - fetchExpandedContext', () => {
  const mockOctokit = {
    rest: {
      repos: {
        getContent: vi.fn(),
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch file content successfully', async () => {
    const mockContent = Buffer.from('const x = 1;').toString('base64');
    mockOctokit.rest.repos.getContent.mockResolvedValue({
      data: {
        content: mockContent,
        encoding: 'base64',
        type: 'file',
        size: 12,
      },
    });

    const selectedFiles = ['src/test.ts'];
    const allChangedFiles = [
      { filename: 'src/test.ts', additions: 10, deletions: 5, status: 'modified' },
    ];

    const result = await fetchExpandedContext(
      mockOctokit as any,
      'owner',
      'repo',
      'main',
      selectedFiles,
      allChangedFiles
    );

    expect(result.success).toBe(true);
    expect(result.expandedFiles).toHaveLength(1);
    expect(result.expandedFiles[0].filename).toBe('src/test.ts');
    expect(result.expandedFiles[0].content).toBe('const x = 1;');
    expect(result.expandedFiles[0].additions).toBe(10);
    expect(result.expandedFiles[0].deletions).toBe(5);
    expect(result.expandedFiles[0].language).toBe('typescript');
  });

  it('should skip files that are too large', async () => {
    const largeContent = 'x'.repeat(200000); // 200KB
    const mockContent = Buffer.from(largeContent).toString('base64');
    mockOctokit.rest.repos.getContent.mockResolvedValue({
      data: {
        content: mockContent,
        encoding: 'base64',
        type: 'file',
        size: 200000, // 200KB - exceeds default 10KB limit
      },
    });

    const selectedFiles = ['src/large.ts'];
    const allChangedFiles = [
      { filename: 'src/large.ts', additions: 1000, deletions: 500, status: 'modified' },
    ];

    const result = await fetchExpandedContext(
      mockOctokit as any,
      'owner',
      'repo',
      'main',
      selectedFiles,
      allChangedFiles
    );

    expect(result.success).toBe(true);
    expect(result.expandedFiles).toHaveLength(0);
    expect(result.skippedFiles).toContain('src/large.ts');
  });

  it('should handle fetch errors gracefully', async () => {
    mockOctokit.rest.repos.getContent.mockRejectedValue(new Error('Not found'));

    const selectedFiles = ['src/missing.ts'];
    const allChangedFiles = [
      { filename: 'src/missing.ts', additions: 10, deletions: 5, status: 'modified' },
    ];

    const result = await fetchExpandedContext(
      mockOctokit as any,
      'owner',
      'repo',
      'main',
      selectedFiles,
      allChangedFiles
    );

    expect(result.success).toBe(true);
    expect(result.expandedFiles).toHaveLength(0);
    expect(result.skippedFiles).toContain('src/missing.ts');
  });

  it('should skip directories', async () => {
    mockOctokit.rest.repos.getContent.mockResolvedValue({
      data: {
        type: 'dir',
        // No content field for directories
      },
    });

    const selectedFiles = ['src'];
    const allChangedFiles = [
      { filename: 'src', additions: 0, deletions: 0, status: 'modified' },
    ];

    const result = await fetchExpandedContext(
      mockOctokit as any,
      'owner',
      'repo',
      'main',
      selectedFiles,
      allChangedFiles
    );

    expect(result.success).toBe(true);
    expect(result.expandedFiles).toHaveLength(0);
    expect(result.skippedFiles).toContain('src');
  });
});

