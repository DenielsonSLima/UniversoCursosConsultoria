import assert from 'node:assert/strict';
import test from 'node:test';
import { signPublicDocumentPhoto } from './access.ts';

const path = '11111111-1111-4111-8111-111111111111/perfil/photo.jpg';
const code = 'DOC-SECRET-CAPABILITY';
const active = {
  code, status: 'ACTIVE', type: 'carteirinha',
  visibleFields: ['studentPhotoUrl'], studentPhotoUrl: `profile-photo://${path}`,
};
const fixture = (result: any = active, rpcError: any = null) => {
  const calls: any[] = [];
  return {
    calls,
    admin: {
      rpc: async (name: string, payload: unknown) => { calls.push({ name, payload }); return { data: result, error: rpcError }; },
      storage: { from: (bucket: string) => ({ createSignedUrl: async (name: string, ttl: number) => {
        calls.push({ bucket, name, ttl }); return { data: { signedUrl: 'https://project.test/signed' }, error: null };
      } }) },
    },
  };
};

test('assina foto por 5min somente após capability documental canônica ativa', async () => {
  const f = fixture();
  assert.deepEqual(await signPublicDocumentPhoto(f.admin, { path, code: code.toLowerCase() }), { signedUrl: 'https://project.test/signed' });
  assert.deepEqual(f.calls, [
    { name: 'validar_documento_por_codigo', payload: { p_codigo: code } },
    { bucket: 'fotos-perfil', name: path, ttl: 300 },
  ]);
});

test('revogação, expiração, política sem foto, tipo e troca de caminho negam assinatura', async () => {
  for (const change of [
    { status: 'REVOKED' }, { status: 'EXPIRED' }, { visibleFields: [] },
    { type: 'diario_classe' }, { code: 'OTHER' },
    { studentPhotoUrl: 'profile-photo://22222222-2222-4222-8222-222222222222/perfil/photo.jpg' },
  ]) {
    const f = fixture({ ...active, ...change });
    assert.equal(await signPublicDocumentPhoto(f.admin, { path, code }), null);
    assert.equal(f.calls.length, 1);
  }
});

test('erro ou ausência da RPC falha fechado; não assina foto arbitrária', async () => {
  for (const f of [fixture(null), fixture(active, { message: 'internal' })]) {
    assert.equal(await signPublicDocumentPhoto(f.admin, { path, code }), null);
    assert.equal(f.calls.length, 1);
  }
  const f = fixture();
  assert.equal(await signPublicDocumentPhoto(f.admin, { path: '../file', code }), null);
  assert.equal(f.calls.length, 0);
});
