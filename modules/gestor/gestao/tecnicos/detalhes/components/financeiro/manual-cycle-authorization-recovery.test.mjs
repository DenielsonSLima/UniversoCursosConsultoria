import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const { build } = await import(process.env.ESBUILD_MODULE_PATH
  ? pathToFileURL(resolve(process.env.ESBUILD_MODULE_PATH)).href : 'esbuild');
const temporary = await mkdtemp(join(tmpdir(), 'manual-cycle-recovery-'));
const entry = join(temporary, 'service.mjs');
await build({
  entryPoints: [resolve('modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.service.ts')],
  outfile: entry, bundle: true, platform: 'node', format: 'esm',
  plugins: [{
    name: 'isolated-supabase-transport',
    setup(builder) {
      builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'transport', namespace: 'synthetic' }));
      builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, () => ({
        contents: 'export const supabase = { functions: { invoke: (...args) => globalThis.__cycleRecoveryInvoke(...args) } };',
      }));
    },
  }],
});
const service = await import(pathToFileURL(entry).href);
const progress = { cicloNumero: 2, quantidadeItens: 13, quantidadeBancaria: 13,
  quantidadeLocal: 0, emitidosBanese: 0, pendentesEmissao: 13, emRevisao: 0 };
const request = { matriculaId: 'synthetic-enrollment', turmaId: 'synthetic-class', cicloNumero: 2 };

test.after(async () => {
  delete globalThis.__cycleRecoveryInvoke;
  await rm(temporary, { recursive: true, force: true });
});

test('resume preserves typed authorization conflicts and operation; no automatic retry', async () => {
  for (const [code, message] of [
    ['CYCLE_AUTHORIZATION_FINGERPRINT_MISMATCH', 'Dados financeiros divergentes.'],
    ['CYCLE_AUTHORIZATION_CONTEXT_MISMATCH', 'Vínculo da autorização divergente.'],
  ]) {
    const calls = [];
    globalThis.__cycleRecoveryInvoke = async (...args) => {
      calls.push(args);
      return { data: null, error: { context: { json: async () => ({ error: message, code, progress }) } } };
    };
    await assert.rejects(service.matriculaTecnicaCicloManualService.resume(request), (error) => {
      assert.equal(error.code, code);
      assert.equal(error.message, message);
      assert.deepEqual(error.progress, progress);
      const guidance = service.getCicloFinanceiroTecnicoManualRecoveryGuidance(error);
      assert.match(guidance, /não gere outro ciclo/);
      assert.doesNotMatch(guidance, /Use “Retomar emissão”/);
      return true;
    });
    assert.deepEqual(calls, [['technical-manual-cycle-issuance', {
      body: { action: 'resume', matriculaId: request.matriculaId, cicloNumero: 2 },
    }]]);
  }
});

test('legacy replay error also avoids a retry instruction before backend deployment', async () => {
  globalThis.__cycleRecoveryInvoke = async () => ({ data: {
    error: 'A emissão foi interrompida com segurança. Replay de autorização incompatível. (PT422)',
    code: 'CYCLE_ISSUANCE_PARTIAL', progress,
  }, error: null });
  await assert.rejects(service.matriculaTecnicaCicloManualService.resume(request), (error) => {
    assert.match(service.getCicloFinanceiroTecnicoManualRecoveryGuidance(error), /conferida antes de retomar/);
    return true;
  });
});

test('recoverable failures still resume the same operation; review-only failures stay blocked', () => {
  const recoverable = new service.CicloFinanceiroTecnicoManualIssuanceError('Timeout', progress);
  assert.match(service.getCicloFinanceiroTecnicoManualRecoveryGuidance(recoverable), /Use “Retomar emissão”/);
  const review = new service.CicloFinanceiroTecnicoManualIssuanceError('Revisão', {
    ...progress, pendentesEmissao: 0, emRevisao: 13,
  });
  assert.match(service.getCicloFinanceiroTecnicoManualRecoveryGuidance(review), /Revisão manual necessária/);
});
