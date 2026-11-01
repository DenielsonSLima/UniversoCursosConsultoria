import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { actor, alunoA, alunoB, id, orphan, patch, path, poloB, setup, url } from './lgpd_profile_photos.fixture.mjs';

const { PGlite } = await import(process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite');
const build = async () => { const db = new PGlite(); await setup(db); return db; };
const close = async db => { await db.exec('RESET ROLE'); await db.close(); };
const privateObject = async (db, owner, prefix = '') => {
  await db.exec('RESET ROLE');
  await db.query('INSERT INTO storage.objects(bucket_id,name) VALUES ($1,$2)', ['fotos-perfil', prefix + path(owner)]);
};
const rows = async db => (await db.query("SELECT name FROM storage.objects WHERE bucket_id='fotos-perfil' ORDER BY name")).rows.map(row => row.name);

test('fecha uploads públicos legados e permite apenas dono ou atribuição e polo autorizados', async () => {
  const db = await build();
  try {
    await actor(db);
    assert.equal((await db.query('SELECT public.can_mutate_documentos_storage_object($1) allowed', [path(alunoA)])).rows[0].allowed, true);
    await db.exec('RESET ROLE'); await patch(db);
    await privateObject(db, alunoA); await privateObject(db, alunoB);
    await privateObject(db, orphan, 'quarentena/');
    await actor(db);
    assert.equal((await db.query('SELECT public.can_mutate_documentos_storage_object($1) allowed', [path(alunoA)])).rows[0].allowed, false);
    assert.deepEqual(await rows(db), [path(alunoA)]);
    await actor(db, { uid: alunoA, kind: 'aluno', modules: [] });
    assert.deepEqual(await rows(db), [path(alunoA)]);
    await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES ('fotos-perfil',$1)", [path(alunoA).replace('photo.jpg','new.jpg')]);
    await assert.rejects(() => db.query("INSERT INTO storage.objects(bucket_id,name) VALUES ('fotos-perfil',$1)", [path(alunoB).replace('photo.jpg','new.jpg')]), /row-level security/);
    await actor(db, { polo: poloB });
    assert.deepEqual(await rows(db), [path(alunoB)]);
    await actor(db, { modules: ['inicio'] });
    assert.deepEqual(await rows(db), []);
    await actor(db, { modules: ['secretaria'] });
    assert.deepEqual(await rows(db), [path(alunoA), path(alunoA).replace('photo.jpg','new.jpg')].sort());
    await actor(db, { uid: '', role: 'anon', kind: '', modules: [] });
    assert.deepEqual(await rows(db), []);
  } finally { await close(db); }
});

test('referência persistida não aceita outro cadastro, objeto ausente, URL pública ou URL temporária', async () => {
  const db = await build();
  try {
    await patch(db); await privateObject(db, alunoA); await privateObject(db, alunoB);
    await actor(db, { uid: alunoA, kind: 'aluno' });
    await db.query('UPDATE public.parceiros SET foto_url=$1 WHERE id=$2', [`profile-photo://${path(alunoA)}`, alunoA]);
    for (const reference of [`profile-photo://${path(alunoB)}`, `profile-photo://${path(alunoA).replace('photo','missing')}`, url(alunoA),
      `https://kfekgwyqozhicpfuunpo.supabase.co/storage/v1/object/sign/fotos-perfil/${path(alunoA)}?token=synthetic`]) {
      await assert.rejects(() => db.query('UPDATE public.parceiros SET foto_url=$1 WHERE id=$2', [reference, alunoA]));
    }
    const value = (await db.query('SELECT foto_url FROM public.parceiros WHERE id=$1', [alunoA])).rows[0].foto_url;
    assert.equal(value, `profile-photo://${path(alunoA)}`);
    await db.exec('RESET ROLE');
    const filtered = (await db.query('SELECT public.filtrar_dados_publicos_validacao($1::jsonb,$2::text[]) value', [
      JSON.stringify({ studentPhotoUrl: url(alunoA), hidden: 'synthetic-secret' }), ['studentPhotoUrl'],
    ])).rows[0].value;
    assert.deepEqual(filtered, { studentPhotoUrl: `profile-photo://${path(alunoA)}` });
  } finally { await close(db); }
});

test('journal só service_role: não finaliza sem verificação e permite retomada/replay sem descartar dados', async () => {
  const db = await build();
  try {
    await patch(db);
    for (const role of ['anon', 'authenticated']) {
      await actor(db, { role });
      await assert.rejects(() => db.query('SELECT public.profile_photo_migration_summary()'), /permission denied/);
      await assert.rejects(() => db.query('SELECT public.prepare_profile_photo_migration($1,$2,$3)', [path(alunoA), id(900), 'Migração sintética LGPD']), /permission denied/);
      await assert.rejects(() => db.query('SELECT * FROM internal_privacy.profile_photo_migration_jobs'), /permission denied/);
    }
    await actor(db, { role: 'service_role' });
    assert.deepEqual((await db.query('SELECT public.profile_photo_migration_summary() value')).rows[0].value,
      { pending: 3, quarantineCandidates: 1, completed: 0, publicSourcesRemaining: 3 });
    const prepare = () => db.query('SELECT public.prepare_profile_photo_migration($1,$2,$3) value', [path(alunoA), id(900), 'Migração sintética LGPD']);
    assert.equal((await prepare()).rows[0].value.status, 'prepared');
    await assert.rejects(() => db.query('SELECT public.finalize_profile_photo_migration($1)', [path(alunoA)]), /não verificada/);
    await privateObject(db, alunoA);
    await actor(db, { role: 'service_role' });
    const hash = 'a'.repeat(64);
    await db.query('SELECT public.verify_profile_photo_migration($1,$2)', [path(alunoA), hash]);
    await assert.rejects(() => db.query('SELECT public.verify_profile_photo_migration($1,$2)', [path(alunoA), 'b'.repeat(64)]), /não verificada/);
    await db.query('SELECT public.finalize_profile_photo_migration($1)', [path(alunoA)]);
    assert.equal((await prepare()).rows[0].value.status, 'finalized');
    assert.equal((await db.query('SELECT source_path FROM public.profile_photo_migration_candidates(1)')).rows[0].source_path,
      path(alunoB), 'cache pendente não impede retirar os demais objetos públicos');
    assert.equal((await db.query('SELECT foto_url FROM public.parceiros WHERE id=$1', [alunoA])).rows[0].foto_url, `profile-photo://${path(alunoA)}`);
    await assert.rejects(() => db.query('SELECT public.complete_profile_photo_migration($1)', [path(alunoA)]), /não concluída/);
    await db.query("DELETE FROM storage.objects WHERE bucket_id='documentos' AND name=$1", [path(alunoA)]);
    await db.query('SELECT public.complete_profile_photo_migration($1)', [path(alunoA)]);
    await db.query('SELECT public.complete_profile_photo_migration($1)', [path(alunoA)]);
    await db.query('SELECT public.finalize_profile_photo_migration($1)', [path(alunoA)]);
    assert.equal((await prepare()).rows[0].value.status, 'completed');
    const orphanJob = (await db.query('SELECT public.prepare_profile_photo_migration($1,$2,$3) value', [path(orphan), id(900), 'Quarentena sintética LGPD'])).rows[0].value;
    assert.equal(orphanJob.targetPath, `quarentena/${path(orphan)}`);
    assert.equal(orphanJob.partnerId, null);
    assert.equal((await db.query("SELECT count(*)::integer total FROM storage.objects WHERE bucket_id='fotos-perfil'")).rows[0].total, 1);
    assert.equal((await db.query('SELECT count(*)::integer total FROM public.parceiros')).rows[0].total, 2);
  } finally { await close(db); }
});
