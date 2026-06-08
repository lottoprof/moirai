#!/usr/bin/env node
/*
 * scripts/seed/instructor-test-data.mjs
 *
 * Seeds production D1 with test data для проверки Instructor LK v2
 * (Q2-expansion overview + Q11 cohort matrix).
 *
 * Создаёт:
 *   - 14 test users (test-student1..14@moiraionline.pro)
 *   - 14 enrollments (Group 1: 6 beginner, Group 2: 8 intermediate)
 *   - 14 applications (paid status)
 *   - 50 homework_submissions (varied статусы)
 *   - 2 slot UPDATE (assign lottoprof как instructor)
 *
 * Все UUIDs зафиксированы в scripts/seed/instructor-test-data.json —
 * это **source of truth** для cleanup.
 *
 * Usage:
 *   node scripts/seed/instructor-test-data.mjs --remote [--dry-run]
 *   node scripts/seed/instructor-test-data.mjs --remote --cleanup
 *   node scripts/seed/instructor-test-data.mjs --local [--cleanup]
 *
 * Spec: .agent/plans/active/instructor-lk-v2-test-data.md
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const args = process.argv.slice(2);
const isLocal = args.includes('--local');
const isRemote = args.includes('--remote');
const isDryRun = args.includes('--dry-run');
const isCleanup = args.includes('--cleanup');

if (!isLocal && !isRemote) {
  console.error('[seed-test-data] specify --local or --remote');
  process.exit(1);
}

// Fixed environment IDs (existing D1 rows, не меняются)
const INSTRUCTOR_ID = '556fc3b2-930d-4739-b55d-f14fc284ef47'; // lottoprof
const BEGINNER_SLOT_ID = '148bffa8-0350-ba81-9e67-4bc1feef9ff3';
const BEGINNER_COHORT_ID = '1ba36e98-37d2-1827-e229-4a6e7261a2ee';
const INTERMEDIATE_SLOT_ID = 'e525b9cc-9ba4-6f7a-ecf6-2622e880da7e';
const INTERMEDIATE_COHORT_ID = '27d22323-4596-1724-68f7-fd0c7350c8ac';

const BEGINNER_MODULES = [
  'beg-01-lumiere-frame', 'beg-02-melies-frame', 'beg-03-composition',
  'beg-04-kuleshov-effect', 'beg-05-voiceover', 'beg-06-three-act-structure',
  'beg-07-characters', 'beg-08-dialogue', 'beg-09-sound-editing',
  'beg-10-shot-sizes-editing', 'beg-11-video-editors',
];

const INTERMEDIATE_MODULES = [
  'int-01-dialogue-coverage', 'int-02-chase-scene', 'int-03-pitching',
  'int-04-actor-direction', 'int-05-director-skills', 'int-06-production-phases',
  'int-07-shooting-script', 'int-08-world-building', 'int-09-final-script',
  'int-10-editing-principles', 'int-11-editing-practice', 'int-12-budget',
  'int-13-locations-props',
];

// Load fixed UUIDs from JSON
const ids = JSON.parse(readFileSync(
  resolve(__dirname, 'instructor-test-data.json'), 'utf8',
));

// Generate apply SQL
function genApplySql() {
  const stmts = [];
  const now = Math.floor(Date.now() / 1000);

  // Step 1: assign lottoprof to both slots
  stmts.push(`UPDATE slots SET instructor_id = '${INSTRUCTOR_ID}', updated_at = unixepoch() WHERE id = '${BEGINNER_SLOT_ID}';`);
  stmts.push(`UPDATE slots SET instructor_id = '${INSTRUCTOR_ID}', updated_at = unixepoch() WHERE id = '${INTERMEDIATE_SLOT_ID}';`);

  // Step 2: Create 14 users (test-student1..14)
  for (const u of ids.users) {
    const email = `test-student${u.n.toString()}@moiraionline.pro`;
    const refCode = `test-${u.n.toString().padStart(2, '0')}-${u.id.slice(0, 6)}`;
    stmts.push(
      `INSERT INTO users (id, email, email_verified_at, name, locale, referral_code, marketing_opt_in, created_at, updated_at) ` +
      `VALUES ('${u.id}', '${email}', ${now}, 'Test Student ${u.n.toString()}', 'en', '${refCode}', 0, ${now}, ${now});`,
    );
    // Grant student role
    stmts.push(
      `INSERT INTO user_roles (user_id, role, granted_at) VALUES ('${u.id}', 'student', ${now});`,
    );
  }

  // Step 3 + 4: Enrollments + applications per user
  for (let i = 0; i < ids.users.length; i++) {
    const u = ids.users[i];
    const e = ids.enrollments[i];
    const a = ids.applications[i];
    const isBeginnerGroup = u.n <= 6;
    const programme = isBeginnerGroup ? 'beginner' : 'intermediate';
    const cohortId = isBeginnerGroup ? BEGINNER_COHORT_ID : INTERMEDIATE_COHORT_ID;
    const price = isBeginnerGroup ? 39900 : 49900;

    stmts.push(
      `INSERT INTO enrollments (id, user_id, programme_slug, status, price_paid_amount, price_paid_currency, features_json, lead_instructor_id, enrolled_at, created_at, updated_at) ` +
      `VALUES ('${e.id}', '${u.id}', '${programme}', 'active', ${price.toString()}, 'USD', '{"live_sessions":true}', '${INSTRUCTOR_ID}', ${now}, ${now}, ${now});`,
    );
    stmts.push(
      `INSERT INTO applications (id, user_id, programme_id, cohort_id, enrollment_id, status, age_confirmed, marketing_opt_in, created_at, updated_at) ` +
      `VALUES ('${a.id}', '${u.id}', '${programme}', '${cohortId}', '${e.id}', 'paid', 1, 0, ${now}, ${now});`,
    );
  }

  // Step 5: enrollment_modules — all program modules per student
  for (let i = 0; i < ids.users.length; i++) {
    const u = ids.users[i];
    const e = ids.enrollments[i];
    const modules = u.n <= 6 ? BEGINNER_MODULES : INTERMEDIATE_MODULES;
    for (let j = 0; j < modules.length; j++) {
      stmts.push(
        `INSERT INTO enrollment_modules (enrollment_id, module_slug, order_idx, added_by, added_at) ` +
        `VALUES ('${e.id}', '${modules[j]}', ${j.toString()}, '${INSTRUCTOR_ID}', ${now});`,
      );
    }
  }

  // Step 6: homework_submissions — variety of statuses
  // Group 1 (beginner, on module 3): beg-01 + beg-02 done, beg-03 current
  // Group 2 (intermediate, on module 4): int-01..03 done, int-04 current
  const SUBMISSION_TEMPLATES = [
    { status: 'approved',       comment: '[mock] Strong composition. Approved.', reviewedDelta: -86400 * 2 },
    { status: 'approved',       comment: '[mock] Nice work on rhythm.', reviewedDelta: -86400 * 2 },
    { status: 'needs_revision', comment: '[mock] Please reshoot scene 3 with better lighting.', reviewedDelta: -86400 },
    { status: 'pending',        comment: null, reviewedDelta: null },
    { status: 'auto_approved',  comment: null, reviewedDelta: -86400 * 5 },
  ];

  for (const sub of ids.submissions) {
    const u = ids.users.find((x) => x.n === sub.student);
    if (!u) continue;
    const e = ids.enrollments.find((x) => x.n === sub.student);
    if (!e) continue;
    const modules = u.n <= 6 ? BEGINNER_MODULES : INTERMEDIATE_MODULES;
    const moduleSlug = modules[sub.module_idx - 1];
    const isCurrentModule = (u.n <= 6 && sub.module_idx === 3) || (u.n > 6 && sub.module_idx === 4);

    // Pick template:
    //  - completed earlier modules → mostly approved, занятно variation
    //  - current module → varied: pending / needs_revision / approved
    let tpl;
    if (isCurrentModule) {
      // Mix for current module — index-based variety
      const variants = [SUBMISSION_TEMPLATES[3], SUBMISSION_TEMPLATES[2], SUBMISSION_TEMPLATES[0]]; // pending, needs_revision, approved
      tpl = variants[u.n % 3];
    } else {
      // Completed modules — mostly approved, one auto_approved here and there
      tpl = (u.n % 4 === 0) ? SUBMISSION_TEMPLATES[4] : SUBMISSION_TEMPLATES[0];
    }

    const ext = sub.module_idx % 2 === 0 ? 'mp4' : 'pdf';
    const ctype = ext === 'mp4' ? 'video/mp4' : 'application/pdf';
    const size = ext === 'mp4' ? 5242880 : 1048576;
    const uploadedAt = now - 86400 * (4 - sub.module_idx);
    const idemKey = `test-idem-${sub.id.slice(0, 8)}`;
    const fileKey = `homework/${e.id}/${sub.id}.${ext}`;

    const reviewedAt = tpl.reviewedDelta != null ? (now + tpl.reviewedDelta).toString() : 'NULL';
    const reviewedBy = tpl.reviewedDelta != null ? `'${INSTRUCTOR_ID}'` : 'NULL';
    const commentSql = tpl.comment ? `'${tpl.comment.replace(/'/g, "''")}'` : 'NULL';

    stmts.push(
      `INSERT INTO homework_submissions (id, enrollment_id, module_slug, idempotency_key, file_r2_key, content_type, size_bytes, uploaded_at, is_late, status, priority, reviewed_by, reviewed_at, instructor_comment, created_at, updated_at) ` +
      `VALUES ('${sub.id}', '${e.id}', '${moduleSlug}', '${idemKey}', '${fileKey}', '${ctype}', ${size.toString()}, ${uploadedAt.toString()}, 0, '${tpl.status}', 'normal', ${reviewedBy}, ${reviewedAt}, ${commentSql}, ${uploadedAt.toString()}, ${uploadedAt.toString()});`,
    );
  }

  return stmts;
}

function genCleanupSql() {
  const stmts = [];

  // Submissions
  const subIds = ids.submissions.map((s) => `'${s.id}'`).join(',');
  stmts.push(`DELETE FROM homework_submissions WHERE id IN (${subIds});`);

  // Enrollment_modules
  const enrIds = ids.enrollments.map((e) => `'${e.id}'`).join(',');
  stmts.push(`DELETE FROM enrollment_modules WHERE enrollment_id IN (${enrIds});`);

  // Applications (FK before enrollments)
  const appIds = ids.applications.map((a) => `'${a.id}'`).join(',');
  stmts.push(`DELETE FROM applications WHERE id IN (${appIds});`);

  // Enrollments
  stmts.push(`DELETE FROM enrollments WHERE id IN (${enrIds});`);

  // User roles
  const userIds = ids.users.map((u) => `'${u.id}'`).join(',');
  stmts.push(`DELETE FROM user_roles WHERE user_id IN (${userIds});`);

  // Users
  stmts.push(`DELETE FROM users WHERE id IN (${userIds});`);

  // Unassign instructor from slots
  stmts.push(`UPDATE slots SET instructor_id = NULL, updated_at = unixepoch() WHERE id IN ('${BEGINNER_SLOT_ID}', '${INTERMEDIATE_SLOT_ID}');`);

  return stmts;
}

const stmts = isCleanup ? genCleanupSql() : genApplySql();

console.log(`[seed-test-data] mode: ${isLocal ? 'local' : 'remote'}${isDryRun ? ' (dry-run)' : ''}${isCleanup ? ' [CLEANUP]' : ''}`);
console.log(`[seed-test-data] ${stmts.length.toString()} statements ready`);

if (isDryRun) {
  console.log('[seed-test-data] dry-run — first 5 statements:');
  for (const s of stmts.slice(0, 5)) console.log('  ' + s.slice(0, 120) + (s.length > 120 ? '...' : ''));
  process.exit(0);
}

// Write single SQL file
const sqlFile = join(tmpdir(), `seed-test-data-${Date.now().toString()}.sql`);
writeFileSync(sqlFile, stmts.join('\n') + '\n', 'utf8');
console.log(`[seed-test-data] SQL written to ${sqlFile}`);

const exec = spawnSync('corepack', [
  'pnpm', 'exec', 'wrangler', 'd1', 'execute', 'moirai-prod',
  isLocal ? '--local' : '--remote',
  '--file', sqlFile,
], { cwd: repoRoot, encoding: 'utf8', stdio: 'inherit' });

if (exec.status !== 0) {
  console.error('[seed-test-data] failed. SQL file kept at:', sqlFile);
  process.exit(1);
}

console.log(`[seed-test-data] done${isCleanup ? ' (cleanup)' : ''}.`);
