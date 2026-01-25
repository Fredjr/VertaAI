// Distributed Locking Service using Upstash Redis
// Based on Section 15.10.5 of the spec

import { Redis } from '@upstash/redis';
import { LOCK_TTL_SECONDS } from '../../types/state-machine.js';

// Create Redis client
const getRedisClient = (): Redis | null => {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.warn('[Locking] Upstash Redis not configured - locking disabled');
    return null;
  }
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
};

/**
 * Generate a lock key for a drift
 */
function getLockKey(workspaceId: string, driftId: string): string {
  return `lock:drift:${workspaceId}:${driftId}`;
}

/**
 * Acquire a distributed lock for processing a drift
 * Returns true if lock was acquired, false if already locked
 */
export async function acquireLock(
  workspaceId: string,
  driftId: string
): Promise<boolean> {
  const redis = getRedisClient();
  
  // If Redis not configured, always return true (no locking)
  if (!redis) {
    console.log('[Locking] Redis not configured - skipping lock acquisition');
    return true;
  }

  const lockKey = getLockKey(workspaceId, driftId);
  const lockValue = `${Date.now()}:${Math.random().toString(36).slice(2)}`;

  try {
    // SET NX with expiration - only set if not exists
    const acquired = await redis.set(lockKey, lockValue, {
      nx: true, // Only set if not exists
      ex: LOCK_TTL_SECONDS, // Expire after TTL
    });

    const success = acquired === 'OK';
    if (success) {
      console.log(`[Locking] Acquired lock for drift ${driftId}`);
    } else {
      console.log(`[Locking] Failed to acquire lock for drift ${driftId} - already locked`);
    }
    return success;
  } catch (error) {
    console.error('[Locking] Error acquiring lock:', error);
    // On error, return true to allow processing (fail open)
    return true;
  }
}

/**
 * Release a distributed lock
 */
export async function releaseLock(
  workspaceId: string,
  driftId: string
): Promise<void> {
  const redis = getRedisClient();
  
  if (!redis) {
    return;
  }

  const lockKey = getLockKey(workspaceId, driftId);

  try {
    await redis.del(lockKey);
    console.log(`[Locking] Released lock for drift ${driftId}`);
  } catch (error) {
    console.error('[Locking] Error releasing lock:', error);
    // Don't throw - lock will expire anyway
  }
}

/**
 * Extend a lock's TTL (useful for long-running operations)
 */
export async function extendLock(
  workspaceId: string,
  driftId: string
): Promise<boolean> {
  const redis = getRedisClient();
  
  if (!redis) {
    return true;
  }

  const lockKey = getLockKey(workspaceId, driftId);

  try {
    const result = await redis.expire(lockKey, LOCK_TTL_SECONDS);
    return result === 1;
  } catch (error) {
    console.error('[Locking] Error extending lock:', error);
    return false;
  }
}

/**
 * Check if locking is configured
 */
export function isLockingConfigured(): boolean {
  return !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
}

