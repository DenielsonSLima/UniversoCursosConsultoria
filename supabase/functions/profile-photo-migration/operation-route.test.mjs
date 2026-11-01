import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

const stubs = {
  supabase: 'export const createClient = () => globalThis.__photoOperation.admin;',
  authz: `export const requireGestorAtivo = async () => {
    globalThis.__photoOperation.userChecks++;
    throw new Error('UNAUTHORIZED');
  };
  export const requireGestorGlobal = () => {};
  export const requireGestorModule = () => {};
  export const authorizationErrorHttpStatus = () => 401;`,
  http: `export const buildCorsHeaders = () => ({});
    export const json = (body,status=200) => Response.json(body,{status});`,
  migrate: `export const migrateProfilePhoto = async (...args) => {
    globalThis.__photoOperation.moves.push(args.slice(1));
    return { completed: true, quarantined: false };
  };`,
};
const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('./index.ts', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'node', write: false, packages: 'external',
  plugins: [{ name: 'operation-boundaries', setup(builder) {
    builder.onResolve({ filter: /^npm:@supabase\/supabase-js/ }, () => ({ path: 'supabase', namespace: 'operation-test' }));
    builder.onResolve({ filter: /_shared\/(authz|http)\.ts$/ }, ({ path }) => ({
      path: path.split('/').at(-1).replace('.ts', ''), namespace: 'operation-test',
    }));
    builder.onResolve({ filter: /^\.\/migrate\.ts$/ }, () => ({ path: 'migrate', namespace: 'operation-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'operation-test' }, ({ path }) => ({ contents: stubs[path] }));
  } }],
});

test('handler MCP recusa capability inválida, preserva guarda humana e ignora escopo/motivo enviados pelo cliente', async () => {
  const previousDeno = globalThis.Deno;
  let handler;
  const state = { userChecks: 0, moves: [], calls: [], dryRun: true, claimError: false, finishError: false };
  state.admin = { rpc: async (name, args) => {
    state.calls.push({ name, args });
    if (name === 'claim_profile_photo_migration_operation') {
      return state.claimError ? { data: null, error: { message: 'synthetic-secret' } }
        : { data: { actorId: 'synthetic-operation', dryRun: state.dryRun, reason: 'Motivo registrado pelo MCP' }, error: null };
    }
    if (name === 'profile_photo_migration_summary') {
      return { data: { pending: 1, completed: 0, publicSourcesRemaining: 1 }, error: null };
    }
    if (name === 'profile_photo_migration_candidates') {
      assert.deepEqual(args, { p_limit: 10 });
      return { data: [{ source_path: 'synthetic-owner/perfil/photo.jpg' }], error: null };
    }
    if (name === 'finish_profile_photo_migration_operation') {
      return { error: state.finishError ? { message: 'synthetic-private' } : null };
    }
    throw new Error(`unexpected RPC ${name}`);
  } };
  globalThis.__photoOperation = state;
  globalThis.Deno = { env: { get: name => name === 'SUPABASE_URL' ? 'https://synthetic.invalid' : 'synthetic-key' }, serve: fn => { handler = fn; } };
  try {
    const module = { exports: {} };
    new Function('require', 'module', 'exports', outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
    const invoke = token => handler(new Request('https://synthetic.invalid/profile-photo-migration', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token === null ? {} : { 'x-lgpd-operation-token': token }) },
      body: JSON.stringify({ dryRun: false, actorId: 'forged-manager', reason: 'forged-reason', confirmation: 'MIGRAR_FOTOS_PESSOAIS', sourcePath: 'other-file', limit: 1000 }),
    }));
    assert.equal((await invoke(null)).status, 401);
    assert.equal(state.userChecks, 1);
    assert.equal(state.calls.length, 0);
    state.claimError = true;
    let response = await invoke('invalid');
    assert.equal(response.status, 403);
    assert.doesNotMatch(JSON.stringify(await response.json()), /synthetic-secret/);
    assert.deepEqual(state.calls.map(x => x.name), ['claim_profile_photo_migration_operation']);
    state.claimError = false; state.calls = [];
    response = await invoke('a'.repeat(64));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).dryRun, true);
    assert.equal(state.moves.length, 0, 'o body não pode transformar dry-run autorizado em migração');
    assert.equal(state.calls.at(-1).name, 'finish_profile_photo_migration_operation');
    state.dryRun = false; state.calls = [];
    response = await invoke('b'.repeat(64));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).examined, 1);
    assert.deepEqual(state.moves[0], ['https://synthetic.invalid', 'synthetic-owner/perfil/photo.jpg', 'synthetic-operation', 'Motivo registrado pelo MCP']);
    assert.equal(state.userChecks, 1, 'operação é registrada como operação, sem fingir identidade humana');
    state.finishError = true;
    response = await invoke('c'.repeat(64));
    assert.equal(response.status, 503);
    assert.doesNotMatch(JSON.stringify(await response.json()), /synthetic-private/);
  } finally {
    if (previousDeno === undefined) delete globalThis.Deno;
    else globalThis.Deno = previousDeno;
    delete globalThis.__photoOperation;
  }
});
