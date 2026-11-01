import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateProfilePhoto } from './migrate.ts';

const path = '11111111-1111-4111-8111-111111111111/perfil/photo.jpg';
const actor = '22222222-2222-4222-8222-222222222222';
const reason = 'Migração sintética de teste LGPD';
const base = 'https://synthetic-project.supabase.co';
const options = () => ({ orphan: false, mismatch: false, cacheStatus: 404, failFinalize: false, existingStatus: 'prepared' });
const fixture = (input: Partial<ReturnType<typeof options>> = {}) => {
  const config = { ...options(), ...input };
  const events: string[] = [];
  const targetPath = config.orphan ? `quarentena/${path}` : path;
  const files = new Map<string, Blob>([[`documentos/${path}`, new Blob(['synthetic-image-bytes'])]]);
  const job = { sourcePath: path, targetPath, partnerId: config.orphan ? null : path.split('/')[0], status: config.existingStatus, sha256: null as string | null };
  const admin = {
    rpc: async (name: string, payload: any) => {
      events.push(name);
      if (name === 'prepare_profile_photo_migration') {
        assert.equal(payload.p_reason, reason); assert.equal(payload.p_actor_id, actor);
        return { data: { ...job }, error: null };
      }
      if (name === 'verify_profile_photo_migration') { job.status = 'verified'; job.sha256 = payload.p_sha256; }
      if (name === 'finalize_profile_photo_migration') {
        if (config.failFinalize) return { error: { message: 'synthetic-failure' } };
        job.status = 'finalized';
      }
      if (name === 'complete_profile_photo_migration') job.status = 'completed';
      return { data: null, error: null };
    },
    storage: { from: (bucket: string) => ({
      download: async (name: string) => {
        events.push(`download:${bucket}`);
        const data = files.get(`${bucket}/${name}`);
        return { data: data || null, error: data ? null : { message: 'not found' } };
      },
      copy: async (from: string, to: string, opts: unknown) => {
        events.push('copy');
        assert.deepEqual(opts, { destinationBucket: 'fotos-perfil' });
        files.set(`fotos-perfil/${to}`, config.mismatch ? new Blob(['corrupted-copy']) : files.get(`${bucket}/${from}`)!);
        return { error: null };
      },
      remove: async (names: string[]) => {
        events.push('remove-public');
        names.forEach(name => files.delete(`${bucket}/${name}`));
        return { error: null };
      },
    }) },
  };
  const fetcher = async (input: any, init: RequestInit | undefined) => {
    events.push('head-public');
    assert.equal(String(input), `${base}/storage/v1/object/public/documentos/${path}`);
    assert.equal(init?.method, 'HEAD');
    return new Response(null, { status: config.cacheStatus });
  };
  return { admin, fetcher: fetcher as typeof fetch, events, files, job, config };
};

test('copia/verifica antes de alterar referência e remover origem pública', async () => {
  const f = fixture();
  const result = await migrateProfilePhoto(f.admin, base, path, actor, reason, f.fetcher);
  assert.deepEqual(result, { completed: true, quarantined: false });
  assert.equal(f.files.has(`documentos/${path}`), false);
  assert.equal(f.files.has(`fotos-perfil/${path}`), true);
  assert.match(f.job.sha256!, /^[0-9a-f]{64}$/);
  const position = (name: string) => f.events.indexOf(name);
  assert.ok(position('copy') < position('verify_profile_photo_migration'));
  assert.ok(position('verify_profile_photo_migration') < position('finalize_profile_photo_migration'));
  assert.ok(position('finalize_profile_photo_migration') < position('remove-public'));
  assert.ok(position('head-public') < position('complete_profile_photo_migration'));
});

test('hash divergente preserva origem e não altera cadastro', async () => {
  const f = fixture({ mismatch: true });
  await assert.rejects(migrateProfilePhoto(f.admin, base, path, actor, reason, f.fetcher), /HASH_MISMATCH/);
  assert.equal(f.files.has(`documentos/${path}`), true);
  assert.ok(!f.events.includes('finalize_profile_photo_migration'));
  assert.ok(!f.events.includes('remove-public'));
});

test('falha ao finalizar mantém origem; retomada usa cópia verificada existente', async () => {
  const f = fixture({ failFinalize: true });
  await assert.rejects(migrateProfilePhoto(f.admin, base, path, actor, reason, f.fetcher));
  assert.ok(f.files.has(`documentos/${path}`));
  f.config.failFinalize = false;
  assert.equal((await migrateProfilePhoto(f.admin, base, path, actor, reason, f.fetcher)).completed, true);
  assert.equal(f.events.filter(event => event === 'copy').length, 1);
});

test('objeto órfão é conservado em quarentena privada, sem conteúdo descartado', async () => {
  const f = fixture({ orphan: true });
  assert.deepEqual(await migrateProfilePhoto(f.admin, base, path, actor, reason, f.fetcher), { completed: true, quarantined: true });
  assert.equal(await f.files.get(`fotos-perfil/quarentena/${path}`)!.text(), 'synthetic-image-bytes');
  assert.equal(f.files.has(`documentos/${path}`), false);
});

test('CDN ainda acessível impede conclusão e permite retomada sem origem', async () => {
  const f = fixture({ cacheStatus: 200 });
  const first = await migrateProfilePhoto(f.admin, base, path, actor, reason, f.fetcher);
  assert.equal(first.completed, false); assert.equal(first.pendingPublicCache, true);
  assert.equal(f.job.status, 'finalized');
  assert.ok(!f.events.includes('complete_profile_photo_migration'));
  f.config.cacheStatus = 404;
  const resumed = await migrateProfilePhoto(f.admin, base, path, actor, reason, f.fetcher);
  assert.equal(resumed.completed, true);
  assert.equal(f.events.filter(event => event === 'copy').length, 1);
});

test('erro de rede no HEAD não é considerado comprovação de revogação', async () => {
  const f = fixture();
  const failedFetch = async () => { throw new Error('synthetic-network-error'); };
  const result = await migrateProfilePhoto(f.admin, base, path, actor, reason, failedFetch);
  assert.equal(result.completed, false);
  assert.equal(f.job.status, 'finalized');
});

for (const scenario of [
  { name: 'not_found legado 404 dentro de HTTP400', status: 400, body: JSON.stringify({ statusCode: '404', error: 'not_found' }), mime: 'application/json', complete: true },
  { name: 'NoSuchKey com statusCode numérico404', status: 400, body: JSON.stringify({ statusCode: 404, code: 'NoSuchKey' }), mime: 'application/json; charset=utf-8', complete: true },
  { name: '400 genérico não comprova revogação', status: 400, body: JSON.stringify({ statusCode: 400, error: 'not_found' }), mime: 'application/json', complete: false },
  { name: 'JSON inválido não comprova revogação', status: 400, body: '{broken', mime: 'application/json', complete: false },
  { name: 'corpo superior a4KB é recusado', status: 400, body: JSON.stringify({ statusCode: 404, error: 'not_found', padding: 'x'.repeat(5000) }), mime: 'application/json', complete: false },
  { name: 'tipo de conteúdo diferente deJSON é recusado', status: 400, body: JSON.stringify({ statusCode: 404, error: 'not_found' }), mime: 'text/plain', complete: false },
  { name: 'GET404 comprova revogação após HEAD400', status: 404, body: '', mime: 'text/plain', complete: true },
]) {
  test(scenario.name, async () => {
    const f = fixture();
    const methods: string[] = [];
    const fetcher: typeof fetch = async (url, init) => {
      assert.equal(String(url), `${base}/storage/v1/object/public/documentos/${path}`);
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.headers, undefined, 'prova deve ser pública, sem credencial');
      assert.equal(init?.cache, undefined, 'não deve contornar cache');
      methods.push(String(init?.method));
      return init?.method === 'HEAD' ? new Response(null, { status: 400 })
        : new Response(scenario.body, { status: scenario.status, headers: { 'Content-Type': scenario.mime } });
    };
    const result = await migrateProfilePhoto(f.admin, base, path, actor, reason, fetcher);
    assert.equal(result.completed, scenario.complete);
    assert.deepEqual(methods, ['HEAD', 'GET']);
    assert.equal(f.events.includes('complete_profile_photo_migration'), scenario.complete);
    assert.ok(f.files.has(`fotos-perfil/${path}`), 'cópia verificada permanece preservada');
  });
}

test('GET200 mantém pendência e cancela corpo sem consumir imagem pública', async () => {
  const f = fixture();
  let canceled = false;
  const stream = new globalThis.ReadableStream({ cancel() { canceled = true; } });
  const fetcher: typeof fetch = async (_url, init) => init?.method === 'HEAD'
    ? new Response(null, { status: 400 }) : new Response(stream, { status: 200 });
  const result = await migrateProfilePhoto(f.admin, base, path, actor, reason, fetcher);
  assert.equal(result.completed, false);
  assert.equal(canceled, true);
  assert.ok(!f.events.includes('complete_profile_photo_migration'));
});

test('redirect ou falha de rede no GET nunca comprova revogação', async () => {
  const f = fixture();
  const fetcher: typeof fetch = async (_url, init) => {
    if (init?.method === 'HEAD') return new Response(null, { status: 400 });
    assert.equal(init?.redirect, 'error');
    throw new Error('synthetic redirect or network error');
  };
  const result = await migrateProfilePhoto(f.admin, base, path, actor, reason, fetcher);
  assert.equal(result.completed, false);
  assert.ok(!f.events.includes('complete_profile_photo_migration'));
});
