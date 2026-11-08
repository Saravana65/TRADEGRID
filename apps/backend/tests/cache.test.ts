import { describe, it, expect, beforeEach } from 'vitest';
import {
  InProcessCacheService,
} from '../src/infrastructure/cache/cache.service';

describe('Phase 11A: In-Process Production Cache Service ($0 Operation)', () => {
  let cache: InProcessCacheService;

  beforeEach(() => {
    cache = new InProcessCacheService(5); // Small size for testing eviction
  });

  it('should store, retrieve, check, and delete items', async () => {
    await cache.set('user:1:profile', { id: 1, handle: 'alex' });
    expect(await cache.has('user:1:profile')).toBe(true);

    const profile = await cache.get<{ id: number; handle: string }>('user:1:profile');
    expect(profile).not.toBeNull();
    expect(profile?.handle).toBe('alex');

    await cache.del('user:1:profile');
    expect(await cache.has('user:1:profile')).toBe(false);
    expect(await cache.get('user:1:profile')).toBeNull();
  });

  it('should expire keys based on TTL seconds', async () => {
    // Set with 0.1s TTL (represented as 0s or custom timestamp)
    await cache.set('temp:key', 'quick_value', 1); // 1 second
    expect(await cache.get('temp:key')).toBe('quick_value');

    // Simulate time advancing past expiry
    const futureCache = new InProcessCacheService(10);
    // Manually set an expired entry for deterministic test
    (futureCache as any).cache.set('expired:key', {
      value: 'old_data',
      expiresAt: Date.now() - 500, // already expired 500ms ago
    });

    expect(await futureCache.get('expired:key')).toBeNull();
    expect(await futureCache.has('expired:key')).toBe(false);
  });

  it('should evict oldest entry when capacity limit is reached', async () => {
    // Capacity is 5
    for (let i = 1; i <= 5; i++) {
      await cache.set(`key:${i}`, `value:${i}`);
    }
    expect(cache.size()).toBe(5);
    expect(await cache.get('key:1')).toBe('value:1');

    // Insert 6th key -> key:1 should be evicted
    await cache.set('key:6', 'value:6');
    expect(cache.size()).toBe(5);
    expect(await cache.get('key:1')).toBeNull();
    expect(await cache.get('key:6')).toBe('value:6');
  });

  it('should clear all entries', async () => {
    await cache.set('k1', 'v1');
    await cache.set('k2', 'v2');
    expect(cache.size()).toBe(2);

    await cache.clear();
    expect(cache.size()).toBe(0);
    expect(await cache.get('k1')).toBeNull();
  });
});
