import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const directory = fileURLToPath(new URL('.', import.meta.url));
const requireTool = createRequire(process.env.CONTRACT_UI_NODE_MODULES
  ? pathToFileURL(resolve(process.env.CONTRACT_UI_NODE_MODULES, '../contract-history-runner.mjs'))
  : import.meta.url);
const { build } = requireTool('esbuild');
const unrelated = name => `export const ${name}=new Proxy({}, {get(){throw Error('Unexpected unrelated IO')}});`;
const unrelatedServices = {
  'diploma.service': unrelated('diplomaService'),
  'carteirinha.service': unrelated('carteirinhaService'),
  'cracha.service': unrelated('crachaService'),
  'declaracao.service': unrelated('declaracaoService'),
  'declaracao-frequencia.service': unrelated('declaracaoFrequenciaService'),
  'irpf.service': unrelated('irpfService'),
  'boletim.service': unrelated('boletimService'),
  'historico.service': unrelated('historicoService'),
  'transferencia.service': unrelated('transferenciaService'),
  'document-layouts': `${unrelated('pastaIdentificacaoService')} export const fichaMatriculaDefaultTemplate=null;`,
  'fichas-matricula.service': unrelated('fichasMatriculaService'),
  'academicos.service': unrelated('academicosService'),
  'marca-dagua.service': unrelated('marcaDaguaService'),
  'polos.service': unrelated('polosService'),
  'academic-preview': "export const loadAcademicPreview=()=>{throw Error('Unexpected unrelated RPC')};",
};
const compiled = await build({
  stdin: { contents: "export {historicoEmissoesService} from './historico-emissoes.service';", resolveDir: directory },
  bundle: true, format: 'esm', platform: 'node', write: false,
  nodePaths: process.env.CONTRACT_UI_NODE_MODULES ? [process.env.CONTRACT_UI_NODE_MODULES] : [],
  plugins: [{ name: 'history-identity-io-boundary', setup(plugin) {
    plugin.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'database', namespace: 'test-io' }));
    plugin.onResolve({ filter: /.*/ }, args => {
      const name = args.path.split('/').at(-1);
      return name in unrelatedServices ? { path: name, namespace: 'test-io' } : undefined;
    });
    plugin.onLoad({ filter: /.*/, namespace: 'test-io' }, args => ({
      contents: args.path === 'database'
        ? 'export const supabase={from:(...args)=>globalThis.__historyDatabase(...args),rpc:(...args)=>globalThis.__historyRpc(...args)};'
        : unrelatedServices[args.path], loader: 'js',
    }));
  } }],
});
const { historicoEmissoesService } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`
);
const emission = presentationVersion => ({
  id: 'EMISSION-SYNTHETIC', codigo: 'CTT-TEST-IDENTITY', polo_id: 'POLO-SYNTHETIC',
  documento: 'contrato_aluno', status: 'ATIVO',
  dados_emissao: { contractSnapshot: { instituicao: { presentationVersion } } },
});

const install = (row, projection = row, rpcError = null, readError = null) => {
  const calls = [];
  globalThis.__historyDatabase = table => {
    assert.equal(table, 'documentos_validacao');
    const filters = [];
    return {
      select() { return this; }, eq(key, value) { filters.push([key, value]); return this; },
      async maybeSingle() {
        assert.deepEqual(filters, [['codigo', 'CTT-TEST-IDENTITY'], ['status', 'ATIVO']]);
        return { data: row, error: readError };
      },
    };
  };
  globalThis.__historyRpc = async (name, args) => {
    calls.push({ name, args });
    return { data: { items: projection ? [projection] : [] }, error: rpcError };
  };
  return calls;
};

for (const version of [undefined, 'CONTRATO_A4_INSTITUCIONAL_V1', 'CONTRATO_A4_INSTITUCIONAL_V2', 'CONTRATO_A4_INSTITUCIONAL_V3_MINUTA_COMPLETA']) {
  test(`refresh by code uses canonical identity projection for ${version || 'unversioned contract'}`, async () => {
    const row = emission(version);
    const projection = { ...row, dados_emissao: { ...row.dados_emissao, projected: true } };
    const calls = install(row, projection);
    const result = await historicoEmissoesService.loadEmissionByCode(' ctt-test-identity ');
    assert.deepEqual(result, projection);
    assert.deepEqual(calls, [{ name: 'search_secretaria_emissions_secure', args: {
      p_polo_id: row.polo_id, p_documento: 'contrato_aluno', p_turma_id: null,
      p_search: row.codigo, p_offset: 0, p_limit: 1,
    } }]);
  });
}

test('unrelated documents keep the original refresh without contract projection', async () => {
  const row = { ...emission(), documento: 'declaracao_matricula' };
  const calls = install(row);
  assert.deepEqual(await historicoEmissoesService.loadEmissionByCode(row.codigo), row);
  assert.deepEqual(calls, []);
});

test('projection must identify the same emission by both id and code', async () => {
  const row = emission();
  for (const mismatched of [null, { ...row, id: 'OTHER' }, { ...row, codigo: 'CTT-OTHER' }]) {
    install(row, mismatched);
    await assert.rejects(historicoEmissoesService.loadEmissionByCode(row.codigo), /projeção canônica/);
  }
});

test('read and canonical permission errors are propagated without a stale fallback', async () => {
  const row = emission();
  const denied = new Error('Acesso não autorizado');
  const calls = install(row, row, null, denied);
  await assert.rejects(historicoEmissoesService.loadEmissionByCode(row.codigo), denied);
  assert.deepEqual(calls, []);
  install(row, row, denied);
  await assert.rejects(historicoEmissoesService.loadEmissionByCode(row.codigo), denied);
});
