import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { courseScope } from './course-scope.mjs';
import { loadRevisions } from './load-revisions.mjs';
import { alignmentPatches } from './alignment-patches.mjs';
import { generateAlignmentPublication } from './alignment-publication.mjs';
import { generatePublication, generatePrivateStaging } from './publication-sql.mjs';
import { validateRevision, withPrivateAnswers } from './revision-model.mjs';

export async function preparePublication({ baseline, keyring, privateDirectory, migrationPrefix }) {
  if (!resolve(privateDirectory).startsWith('/private/tmp/') || !/^\d{12}$/.test(migrationPrefix)) {
    throw new Error('Pacotes privados exigem diretório tmp e prefixo de migration explícito.');
  }
  const releases = await loadRevisions();
  const byId = new Map(releases.map(item => [item.revision.courseId, item]));
  const aligned = new Map(alignmentPatches.map(item => [item.courseId, item]));
  const expected = new Set(courseScope.map(item => item.id));
  if (expected.size !== 61 || byId.size !== releases.length || aligned.size !== 3
    || [...byId.keys()].some(id => !expected.has(id) || aligned.has(id))
    || releases.length + aligned.size !== expected.size) {
    throw new Error(`Cobertura incompleta: ${releases.length} revisões e ${aligned.size} preservados para 61 cursos.`);
  }
  for (const course of courseScope) {
    const source = byId.get(course.id)?.revision || aligned.get(course.id);
    if (!source || source.courseName !== course.name || source.hours !== course.hours) {
      throw new Error(`Identidade ou carga divergente: ${course.name}`);
    }
    const before = baseline.find(item => item.id === course.id);
    if (!before || before.nome !== course.name || before.carga_horaria !== course.hours) {
      throw new Error(`Snapshot incompatível: ${course.name}`);
    }
    if (byId.has(course.id)) {
      validateRevision(source);
      withPrivateAnswers(source, keyring);
    } else if (before.config_hash !== source.expectedConfigHash) {
      throw new Error(`Hash do curso preservado diverge: ${course.name}`);
    }
  }
  const batchCount = Math.ceil(releases.length / 5);
  const planned = Array.from({ length: batchCount }, (_, index) =>
    `supabase/migrations/${migrationPrefix}${String(index).padStart(2, '0')}_publish_ead_catalog_batch_${String(index).padStart(2, '0')}.sql`);
  planned.push(`supabase/migrations/${migrationPrefix}${String(batchCount).padStart(2, '0')}_align_preserved_ead_activities.sql`);
  if (planned.some(path => existsSync(path))) {
    throw new Error('Prefixo já possui migration local; não sobrescreva fontes de publicação.');
  }
  await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
  const files = [];
  const rows = [];
  const sorted = [...releases].sort((a, b) => a.revision.courseName.localeCompare(b.revision.courseName, 'pt-BR'));
  for (let start = 0; start < sorted.length; start += 5) {
    const batch = sorted.slice(start, start + 5);
    const sequence = String(files.length).padStart(2, '0');
    const migration = `supabase/migrations/${migrationPrefix}${sequence}_publish_ead_catalog_batch_${sequence}.sql`;
    await writeFile(migration, generatePublication(batch.map(item => item.revision), baseline), { flag: 'wx' });
    files.push(migration);
    for (const { path, revision } of batch) {
      const privateFile = resolve(privateDirectory, `${revision.revisionId}.sql`);
      await writeFile(privateFile, generatePrivateStaging(revision, baseline, keyring), { mode: 0o600 });
      rows.push({ courseId: revision.courseId, courseName: revision.courseName, revision: revision.revisionId,
        entry: path, migration, privateFile, lessons: revision.lessons.length,
        activities: revision.activities.length, questions: revision.exam.length });
    }
  }
  const alignmentFile = `supabase/migrations/${migrationPrefix}${String(files.length).padStart(2, '0')}_align_preserved_ead_activities.sql`;
  await writeFile(alignmentFile, generateAlignmentPublication(alignmentPatches), { flag: 'wx' });
  files.push(alignmentFile);
  const privateManifest = { rows, files, preserved: alignmentPatches.map(item => item.courseName) };
  await writeFile(resolve(privateDirectory, 'manifest.json'), JSON.stringify(privateManifest, null, 2), { mode: 0o600 });
  return { files, rows: rows.map(({ privateFile: _privateFile, ...row }) => row),
    preserved: privateManifest.preserved };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [snapshot, privateAnswers, privateDirectory, migrationPrefix] = process.argv.slice(2);
  if (!snapshot || !privateAnswers || !privateDirectory || !migrationPrefix) {
    throw new Error('Uso: snapshot-MCP.json chaves-privadas.json /private/tmp/pacotes prefixo12dígitos');
  }
  const result = await preparePublication({ baseline: JSON.parse(await readFile(snapshot, 'utf8')),
    keyring: JSON.parse(await readFile(privateAnswers, 'utf8')), privateDirectory, migrationPrefix });
  console.log(JSON.stringify({ revisions: result.rows.length, preserved: result.preserved.length,
    migrations: result.files.length, files: result.files }, null, 2));
}
