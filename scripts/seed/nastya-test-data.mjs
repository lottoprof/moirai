#!/usr/bin/env node
/*
 * scripts/seed/nastya-test-data.mjs
 *
 * Seeds production D1 with test data для второго instructor'а
 * (nastya.zasypkina@gmail.com). Параллельно к lottoprof seed.
 *
 * Создаёт:
 *   - 13 новых test users (nastya-student1..13@moiraionline.pro)
 *   - 14 enrollments (Group 1: 6 beginner новых; Group 2: 7 новых +
 *     test-student@moiraionline.pro existing → 8 intermediate)
 *   - 14 applications (paid)
 *   - 170 enrollment_modules
 *   - 2 UPDATE slots (instructor_id = nastya)
 *   - 2 UPDATE cohorts (lead_instructor_id = nastya — точечно, не cascade)
 *   - НЕТ submissions (cohorts open, not started)
 *
 * Все UUIDs в scripts/seed/nastya-test-data.json — source of truth для cleanup.
 *
 * Usage:
 *   node scripts/seed/nastya-test-data.mjs --remote [--dry-run]
 *   node scripts/seed/nastya-test-data.mjs --remote --cleanup
 *   node scripts/seed/nastya-test-data.mjs --local [--cleanup]
 *
 * Spec: .agent/plans/active/nastya-test-data.md
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
  console.error('[nastya-seed] specify --local or --remote');
  process.exit(1);
}

// Fixed environment IDs (existing D1 rows, не меняются)
const INSTRUCTOR_ID = '7586e8da-38d8-4e43-9f01-4d96d1af174d'; // nastya
const EXISTING_TEST_STUDENT_ID = '87abbb2d-bcf7-4c88-9228-99cfb75e8a2a'; // test-student@moiraionline.pro
const BEGINNER_SLOT_ID = '1e2ee7f5-df5f-a44a-8e65-03346b6ca27e';
const BEGINNER_COHORT_ID = '813b85be-5604-b3f9-bedd-9b49b9c610fe'; // Jul 14, 2026 open
const INTERMEDIATE_SLOT_ID = '830ff1f3-d3b2-7edd-bd52-ff3733cb6088';
const INTERMEDIATE_COHORT_ID = 'd6329765-dd2b-6836-51a4-decaa972ebfc'; // Jul 28, 2026 open

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

const ids = JSON.parse(readFileSync(
  resolve(__dirname, 'nastya-test-data.json'), 'utf8',
));

// Map enrollment index → student user_id.
// enrollments 1..6 = users[0..5] (beginner)
// enrollments 7..13 = users[6..12] (intermediate 7 new students)
// enrollment 14 = EXISTING test-student (intermediate)
function enrollmentToStudentId(enrollmentN) {
  if (enrollmentN <= 13) return ids.users.find((u) => u.n === enrollmentN).id;
  if (enrollmentN === 14) return EXISTING_TEST_STUDENT_ID;
  throw new Error('unexpected enrollment n=' + enrollmentN);
}

function isBeginnerEnrollment(n) { return n <= 6; }

function genApplySql() {
  const stmts = [];
  const now = Math.floor(Date.now() / 1000);

  // Step 1: assign nastya to both slots
  stmts.push(`UPDATE slots SET instructor_id = '${INSTRUCTOR_ID}', updated_at = unixepoch() WHERE id = '${BEGINNER_SLOT_ID}';`);
  stmts.push(`UPDATE slots SET instructor_id = '${INSTRUCTOR_ID}', updated_at = unixepoch() WHERE id = '${INTERMEDIATE_SLOT_ID}';`);

  // Step 2: assign nastya direct as cohort lead (specific 2 cohorts)
  stmts.push(`UPDATE cohorts SET lead_instructor_id = '${INSTRUCTOR_ID}', updated_at = unixepoch() WHERE id = '${BEGINNER_COHORT_ID}';`);
  stmts.push(`UPDATE cohorts SET lead_instructor_id = '${INSTRUCTOR_ID}', updated_at = unixepoch() WHERE id = '${INTERMEDIATE_COHORT_ID}';`);

  // Step 3: 13 new users + user_roles
  for (const u of ids.users) {
    const email = `nastya-student${u.n.toString()}@moiraionline.pro`;
    const refCode = `nastya-${u.n.toString().padStart(2, '0')}-${u.id.slice(0, 6)}`;
    stmts.push(
      `INSERT INTO users (id, email, email_verified_at, name, locale, referral_code, marketing_opt_in, created_at, updated_at) ` +
      `VALUES ('${u.id}', '${email}', ${now}, 'Nastya Student ${u.n.toString()}', 'en', '${refCode}', 0, ${now}, ${now});`,
    );
    stmts.push(
      `INSERT INTO user_roles (user_id, role, granted_at) VALUES ('${u.id}', 'student', ${now});`,
    );
  }

  // Step 4 + 5: 14 enrollments + applications
  for (const e of ids.enrollments) {
    const studentId = enrollmentToStudentId(e.n);
    const a = ids.applications.find((x) => x.n === e.n);
    const isBeginnerGroup = isBeginnerEnrollment(e.n);
    const programme = isBeginnerGroup ? 'beginner' : 'intermediate';
    const cohortId = isBeginnerGroup ? BEGINNER_COHORT_ID : INTERMEDIATE_COHORT_ID;
    const price = isBeginnerGroup ? 39900 : 49900;

    stmts.push(
      `INSERT INTO enrollments (id, user_id, programme_slug, status, price_paid_amount, price_paid_currency, features_json, lead_instructor_id, enrolled_at, created_at, updated_at) ` +
      `VALUES ('${e.id}', '${studentId}', '${programme}', 'active', ${price.toString()}, 'USD', '{"live_sessions":true}', '${INSTRUCTOR_ID}', ${now}, ${now}, ${now});`,
    );
    stmts.push(
      `INSERT INTO applications (id, user_id, programme_id, cohort_id, enrollment_id, status, age_confirmed, marketing_opt_in, created_at, updated_at) ` +
      `VALUES ('${a.id}', '${studentId}', '${programme}', '${cohortId}', '${e.id}', 'paid', 1, 0, ${now}, ${now});`,
    );
  }

  // Step 6: enrollment_modules (all programme modules per enrollment)
  for (const e of ids.enrollments) {
    const modules = isBeginnerEnrollment(e.n) ? BEGINNER_MODULES : INTERMEDIATE_MODULES;
    for (let j = 0; j < modules.length; j++) {
      stmts.push(
        `INSERT INTO enrollment_modules (enrollment_id, module_slug, order_idx, added_by, added_at) ` +
        `VALUES ('${e.id}', '${modules[j]}', ${j.toString()}, '${INSTRUCTOR_ID}', ${now});`,
      );
    }
  }

  // Step 7: NO submissions (cohorts open, not started)
  return stmts;
}

function genCleanupSql() {
  const stmts = [];

  const enrIds = ids.enrollments.map((e) => `'${e.id}'`).join(',');
  const appIds = ids.applications.map((a) => `'${a.id}'`).join(',');
  const newUserIds = ids.users.map((u) => `'${u.id}'`).join(',');

  // enrollment_modules (FK)
  stmts.push(`DELETE FROM enrollment_modules WHERE enrollment_id IN (${enrIds});`);
  // applications (FK before enrollments)
  stmts.push(`DELETE FROM applications WHERE id IN (${appIds});`);
  // enrollments (ALL 14 including test-student's)
  stmts.push(`DELETE FROM enrollments WHERE id IN (${enrIds});`);
  // user_roles (ONLY 13 new, NOT test-student)
  stmts.push(`DELETE FROM user_roles WHERE user_id IN (${newUserIds}) AND role = 'student';`);
  // users (ONLY 13 new)
  stmts.push(`DELETE FROM users WHERE id IN (${newUserIds});`);
  // Cohort leads → NULL (specific 2)
  stmts.push(`UPDATE cohorts SET lead_instructor_id = NULL, updated_at = unixepoch() WHERE id IN ('${BEGINNER_COHORT_ID}', '${INTERMEDIATE_COHORT_ID}');`);
  // Slot instructor → NULL (specific 2)
  stmts.push(`UPDATE slots SET instructor_id = NULL, updated_at = unixepoch() WHERE id IN ('${BEGINNER_SLOT_ID}', '${INTERMEDIATE_SLOT_ID}');`);

  return stmts;
}

const stmts = isCleanup ? genCleanupSql() : genApplySql();

console.log(`[nastya-seed] mode: ${isLocal ? 'local' : 'remote'}${isDryRun ? ' (dry-run)' : ''}${isCleanup ? ' [CLEANUP]' : ''}`);
console.log(`[nastya-seed] ${stmts.length.toString()} statements ready`);

if (isDryRun) {
  console.log('[nastya-seed] dry-run — first 8 statements:');
  for (const s of stmts.slice(0, 8)) console.log('  ' + s.slice(0, 140) + (s.length > 140 ? '...' : ''));
  process.exit(0);
}

const sqlFile = join(tmpdir(), `nastya-seed-${Date.now().toString()}.sql`);
writeFileSync(sqlFile, stmts.join('\n') + '\n', 'utf8');
console.log(`[nastya-seed] SQL written to ${sqlFile}`);

const exec = spawnSync('corepack', [
  'pnpm', 'exec', 'wrangler', 'd1', 'execute', 'moirai-prod',
  isLocal ? '--local' : '--remote',
  '--file', sqlFile,
], { cwd: repoRoot, encoding: 'utf8', stdio: 'inherit' });

if (exec.status !== 0) {
  console.error('[nastya-seed] failed. SQL file kept at:', sqlFile);
  process.exit(1);
}
