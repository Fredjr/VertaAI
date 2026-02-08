// Evidence Bundle Caching Service
// Phase 3 Week 7 Days 34-35: Redis caching for evidence bundles
// Improves performance by caching evidence bundles for 24 hours

import { Redis } from '@upstash/redis';
import { EvidenceBundle } from '../evidence/types.js';

// Cache TTL: 24 hours
const EVIDENCE_CACHE_TTL_SECONDS = 24 * 60 * 60;

// Create Redis client
const getRedisClient = (): Redis | null => {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.warn('[EvidenceCache] Upstash Redis not configured - caching disabled');
    return null;
  }
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
};

/**
 * Generate cache key for evidence bundle
 */
function getEvidenceCacheKey(workspaceId: string, driftId: string): string {
  return `evidence:${workspaceId}:${driftId}`;
}

/**
 * Get evidence bundle from cache
 */
export async function getCachedEvidence(
  workspaceId: string,
  driftId: string
): Promise<EvidenceBundle | null> {
  const redis = getRedisClient();
  if (!redis) {
    return null;
  }

  try {
    const key = getEvidenceCacheKey(workspaceId, driftId);
    const cached = await redis.get<EvidenceBundle>(key);
    
    if (cached) {
      console.log(`[EvidenceCache] Cache hit for drift ${driftId}`);
      return cached;
    }
    
    console.log(`[EvidenceCache] Cache miss for drift ${driftId}`);
    return null;
  } catch (error: any) {
    console.error(`[EvidenceCache] Error getting cached evidence:`, error);
    return null;
  }
}

/**
 * Store evidence bundle in cache
 */
export async function cacheEvidence(
  workspaceId: string,
  driftId: string,
  bundle: EvidenceBundle
): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) {
    return false;
  }

  try {
    const key = getEvidenceCacheKey(workspaceId, driftId);
    await redis.set(key, bundle, {
      ex: EVIDENCE_CACHE_TTL_SECONDS,
    });
    
    console.log(`[EvidenceCache] Cached evidence for drift ${driftId} (TTL: ${EVIDENCE_CACHE_TTL_SECONDS}s)`);
    return true;
  } catch (error: any) {
    console.error(`[EvidenceCache] Error caching evidence:`, error);
    return false;
  }
}

/**
 * Invalidate cached evidence bundle
 */
export async function invalidateEvidenceCache(
  workspaceId: string,
  driftId: string
): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) {
    return false;
  }

  try {
    const key = getEvidenceCacheKey(workspaceId, driftId);
    await redis.del(key);
    
    console.log(`[EvidenceCache] Invalidated cache for drift ${driftId}`);
    return true;
  } catch (error: any) {
    console.error(`[EvidenceCache] Error invalidating cache:`, error);
    return false;
  }
}

/**
 * Get multiple evidence bundles from cache (batch operation)
 */
export async function getCachedEvidenceBatch(
  items: Array<{ workspaceId: string; driftId: string }>
): Promise<Map<string, EvidenceBundle>> {
  const redis = getRedisClient();
  const results = new Map<string, EvidenceBundle>();
  
  if (!redis || items.length === 0) {
    return results;
  }

  try {
    // Use pipeline for batch operations
    const pipeline = redis.pipeline();
    const keys = items.map(item => getEvidenceCacheKey(item.workspaceId, item.driftId));
    
    keys.forEach(key => pipeline.get(key));
    
    const responses = await pipeline.exec();
    
    responses.forEach((response, index) => {
      if (response && typeof response === 'object' && items[index]) {
        const driftId = items[index].driftId;
        results.set(driftId, response as EvidenceBundle);
      }
    });
    
    console.log(`[EvidenceCache] Batch get: ${results.size}/${items.length} cache hits`);
    return results;
  } catch (error: any) {
    console.error(`[EvidenceCache] Error in batch get:`, error);
    return results;
  }
}

/**
 * Check if Redis caching is available
 */
export function isCacheAvailable(): boolean {
  return !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
}

