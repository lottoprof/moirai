/*
 * src/lib/server/cron/orphan-cleanup.ts
 *
 * Orphan R2 cleanup cron — Stage F.
 *
 * Trigger: daily 05:00 UTC.
 *
 * Logic: list R2 objects под `homework/`, find ones без соответствующей
 * D1 row (file_r2_key или instructor_annotation_r2_key), delete если
 * uploaded > 24h ago.
 *
 * Uses worker R2 binding `list()` method (HOMEWORK_BUCKET.list).
 *
 * Spec: docs/student-lk-v2-spec.md § 6.5.
 */

import { LK_CONFIG } from '../../config/lk';

export interface OrphanCleanupResult {
  scanned: number;
  deleted: number;
  errors: number;
  duration_ms: number;
}

export async function runOrphanCleanup(env: Cloudflare.Env): Promise<OrphanCleanupResult> {
  const start = Date.now();
  const now = Math.floor(start / 1000);
  const minAgeSec = 86400;

  let scanned = 0;
  let deleted = 0;
  let errors = 0;
  let cursor: string | undefined = undefined;
  const maxObjects = LK_CONFIG.orphan_cleanup_max_objects_per_run;

  while (scanned < maxObjects) {
    const listResult = await env.HOMEWORK_BUCKET.list({
      prefix: 'homework/',
      limit: 1000,
      cursor,
    });
    if (listResult.objects.length === 0) break;

    // Collect keys for D1 batch lookup
    const keys = listResult.objects.map((o) => o.key);
    const placeholders = keys.map(() => '?').join(',');
    const referenced = await env.DB.prepare(
      `SELECT file_r2_key AS key FROM homework_submissions
        WHERE file_r2_key IN (${placeholders})
       UNION
       SELECT instructor_annotation_r2_key AS key FROM homework_submissions
        WHERE instructor_annotation_r2_key IN (${placeholders})`,
    )
      .bind(...keys, ...keys)
      .all<{ key: string }>();

    const referencedSet = new Set(referenced.results.map((r) => r.key));

    for (const obj of listResult.objects) {
      scanned++;
      if (referencedSet.has(obj.key)) continue;

      // Check age
      const uploadedSec = Math.floor(obj.uploaded.getTime() / 1000);
      if (now - uploadedSec < minAgeSec) continue;

      try {
        await env.HOMEWORK_BUCKET.delete(obj.key);
        deleted++;
      } catch (err) {
        console.error('[cron/orphan-cleanup] delete failed:', obj.key, err);
        errors++;
      }
      if (scanned >= maxObjects) break;
    }

    if (!listResult.truncated) break;
    cursor = listResult.cursor;
  }

  return { scanned, deleted, errors, duration_ms: Date.now() - start };
}
