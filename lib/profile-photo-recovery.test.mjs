import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const { QueryClient } = require('@tanstack/react-query');
const origin = 'https://photo-project.supabase.co';
const path = '11111111-1111-4111-8111-111111111111/perfil/photo.jpg';
const source = `${origin}/storage/v1/object/sign/fotos-perfil/${path}?token=expired`;
const renewed = `${origin}/storage/v1/object/sign/fotos-perfil/${path}?token=renewed`;
const sessionA = { access_token: 'synthetic-secret-A', user: { id: 'user-a' } };
const sessionB = { access_token: 'synthetic-secret-B', user: { id: 'user-b' } };
const wait = () => new Promise(done => setTimeout(done, 5));

test('recuperação privada autoriza sessão atual e deduplica somente em voo', async context => {
  let session = sessionA, authCalls = 0;
  let sign = async () => ({ data: { signedUrl: renewed }, error: null });
  const calls = [];
  const old = globalThis.__photoRecoverySdk;
  globalThis.__photoRecoverySdk = { auth: { getSession: async () => { authCalls++; return { data: { session }, error: null }; } },
    storage: { from: bucket => ({ createSignedUrl: async (value, ttl) => { calls.push({ bucket, path: value, ttl }); return sign(); } }) } };
  const result = await build({ stdin: { contents: "export { recoverPartnerPhoto } from './profile-photo-recovery';", resolveDir: dirname(fileURLToPath(import.meta.url)), loader: 'ts' },
    bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external',
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: origin }) },
    plugins: [{ name: 'mock-sdk', setup(plugin) {
      plugin.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'sdk', namespace: 'mock' }));
      plugin.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const supabase=globalThis.__photoRecoverySdk;' }));
    } }],
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  const { recoverPartnerPhoto } = module.exports;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await context.test('origem/path inválidos e sessão ausente não chamam Storage', async () => {
      for (const url of [source.replace(origin, 'https://other.invalid'), source.replace('/object/sign/', '/object/public/'), source.replace(path, '../secret'), 'profile-photo://'+path, 'data:image/png;base64,none']) {
        assert.equal(await recoverPartnerPhoto(client, url), null);
      }
      assert.equal(authCalls, 0); assert.equal(calls.length, 0);
      session = null; assert.equal(await recoverPartnerPhoto(client, source), null); assert.equal(calls.length, 0);
      session = sessionA;
    });
    await context.test('mesma sessão compartilha chamada em voo e não conserva autorização depois', async () => {
      let release;
      sign = () => new Promise(done => { release = () => done({ data: { signedUrl: renewed }, error: null }); });
      const first = recoverPartnerPhoto(client, source), second = recoverPartnerPhoto(client, source);
      for (let i=0; i<50 && calls.length<1; i++) await wait();
      assert.equal(calls.length, 1); assert.deepEqual(calls[0], { bucket: 'fotos-perfil', path, ttl: 300 });
      assert.doesNotMatch(JSON.stringify(client.getQueryCache().getAll().map(query => query.queryKey)), /synthetic-secret/);
      release(); assert.deepEqual(await Promise.all([first, second]), [renewed, renewed]);
      await wait(); assert.equal(client.getQueryCache().getAll().length, 0);
      sign = async () => ({ data: { signedUrl: renewed }, error: null });
      assert.equal(await recoverPartnerPhoto(client, source), renewed); assert.equal(calls.length, 2);
    });
    await context.test('troca de usuário invalida resposta tardia; falha/path externo não repete nem abre acesso', async () => {
      await wait(); calls.length=0; const releases=[];
      sign = () => new Promise(done => releases.push(done));
      session=sessionA; const pendingA=recoverPartnerPhoto(client, source);
      for(let i=0;i<50&&calls.length<1;i++)await wait();
      session=sessionB; const pendingB=recoverPartnerPhoto(client, source);
      for(let i=0;i<50&&calls.length<2;i++)await wait();
      assert.equal(calls.length,2);
      releases.forEach(done=>done({data:{signedUrl:renewed},error:null}));
      assert.deepEqual(await Promise.all([pendingA,pendingB]),[null,renewed]);
      for(const answer of [{data:{signedUrl:'https://other.invalid/photo'},error:null},{data:{signedUrl:renewed.replace('photo.jpg','other.jpg')},error:null},{data:null,error:{message:'denied'}}]){
        await wait(); const previous=calls.length; sign=async()=>answer;
        assert.equal(await recoverPartnerPhoto(client,source),null);assert.equal(calls.length,previous+1);
      }
    });
  } finally { client.clear(); if(old===undefined)delete globalThis.__photoRecoverySdk;else globalThis.__photoRecoverySdk=old; }
});
