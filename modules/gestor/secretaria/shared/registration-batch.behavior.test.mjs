import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Executa o serviço e o adapter reais; apenas o transporte e os modelos são fixtures.
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./secretaria-documentos.service.ts', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'registration-fixtures', setup(builder) {
    builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'transport', namespace: 'fixture' }));
    builder.onResolve({ filter: /lib\/academicUtils$/ }, () => ({ path: 'format', namespace: 'fixture' }));
    builder.onResolve({ filter: /cracha-periodo-eleitoral\.service$/ }, () => ({ path: 'badge', namespace: 'fixture' }));
    builder.onResolve({ filter: /fichas-matricula\.service$/ }, () => ({ path: 'ficha', namespace: 'fixture' }));
    builder.onResolve({ filter: /ficha-matricula\/document-layouts$/ }, () => ({ path: 'pasta', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: ({
      transport: 'export const supabase = globalThis.__registrationTransport;',
      format: 'export const formatMatricula = id => `M-${id}`;',
      badge: 'export const crachaPeriodoEleitoralService = {}; export const isCrachaEleitoralTemplateAvailable = () => true;',
      ficha: 'export const fichasMatriculaService = { getById: async () => ({ nome: "Modelo", status: "ATIVO", tipoCurso: "TODOS", templateConfig: { v: 1 } }) };',
      pasta: 'export const pastaIdentificacaoService = { getTemplate: async () => ({ v: 1 }) };',
    })[path] }));
  } }],
});
let state;
globalThis.__registrationTransport = {
  from(table) {
    const filters = [];
    const query = {
      select() { return query; }, or() { return query; },
      eq(key, value) { filters.push([key, [value]]); return query; },
      in(key, values) { filters.push([key, values]); return query; },
      then(resolve) {
        let data = table === 'matriculas' ? state.enrollments : state.emissions;
        for (const [key, values] of filters) data = data.filter(row => !(key in row) || values.includes(row[key]));
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return query;
  },
  async rpc(name, args) {
    state.calls.push({ name, args });
    if (name === 'obter_snapshots_validacao_documentos') return { data: args.p_codigos.map(codigo => ({ codigo, validade_ate: null, validacao_publica: false })) };
    const requested = args.p_matricula_ids;
    const ids = name === 'reemitir_fichas_ativas_lote_portal'
      ? state.canonicalOrder.filter(id => requested.includes(id)) : requested;
    return { data: ids.map((id, index) => ({ matricula_id: id, ordem_solicitacao: index + 1,
      codigo: `CODE-${id}`, documento: args.p_documento, emitido_em: '2026-09-26T12:00:00Z', quantidade_emissoes: 1 })) };
  },
};
const { secretariaDocumentosService } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const enrollment = (id, nome, status = 'ATIVO') => ({
  id, aluno_id: `aluno-${id}`, turma_id: 'turma', status, parceiros: { nome },
  turmas: { polo_id: 'polo', nome: 'Turma', cursos: { nome: 'Curso' }, polos: { nome: 'Polo' } },
});
function reset() {
  state = {
    enrollments: [enrollment('1', 'Zélia'), enrollment('2', 'Bruno', 'TRANCADO'), enrollment('3', 'Álvaro', 'PENDENTE')],
    canonicalOrder: ['3', '1'], calls: [],
    emissions: ['1', '3'].map(id => ({ codigo: `CODE-${id}`, matricula_id: id, dados_emissao: { studentName: id === '1' ? 'Zélia' : 'Álvaro', documentTemplateSnapshot: { v: 1 } } })),
  };
}
const input = documento => ({ documento, modo: 'lote', turmaId: 'turma', referencePeriod: 'modelo',
  context: { poloId: 'polo', userId: 'gestor' }, idempotencyKey: 'test-registration-batch' });

for (const documento of ['pasta_identificacao', 'ficha_matricula']) {
  test(`${documento}: lote respeita ordem canônica, exclui trancado e mantém aluno/código/snapshot`, async () => {
    reset();
    const result = await secretariaDocumentosService.registrarEmissao(input(documento));
    assert.deepEqual(result.items.map(item => item.nome), ['Álvaro', 'Zélia']);
    assert.deepEqual(result.items.map(item => item.validationCode), ['CODE-3', 'CODE-1']);
    assert.deepEqual(result.emissions.map(item => item.matricula_id), ['3', '1']);
    assert.deepEqual(result.emissions.map(item => item.dados_emissao.studentName), ['Álvaro', 'Zélia']);
    assert.deepEqual(state.calls[0].args.p_matricula_ids, ['1', '3']);
    assert.equal(state.calls[0].name, 'reemitir_fichas_ativas_lote_portal');
  });
}
test('matrícula trancada entre consulta e emissão sai também da resposta exibida', async () => {
  reset(); state.canonicalOrder = ['3'];
  const result = await secretariaDocumentosService.registrarEmissao(input('ficha_matricula'));
  assert.deepEqual(result.items.map(item => item.matriculaId), ['3']);
  assert.deepEqual(result.codes, ['CODE-3']);
});
test('lote sem ativos falha sem criar emissão', async () => {
  reset(); state.enrollments = [enrollment('2', 'Bruno', 'TRANCADO')];
  await assert.rejects(secretariaDocumentosService.registrarEmissao(input('ficha_matricula')), /Nenhuma matrícula compatível/);
  assert.equal(state.calls.length, 0);
});
test('ordem escolhida no personalizado permanece preservada', async () => {
  reset();
  const result = await secretariaDocumentosService.registrarEmissao({ ...input('ficha_matricula'), modo: 'custom', matriculaIds: ['1', '3'] });
  assert.deepEqual(result.items.map(item => item.nome), ['Zélia', 'Álvaro']);
  assert.equal(state.calls[0].name, 'reemitir_fichas_validacao_lote_portal');
});
test('RPC não pode retornar matrícula alheia à solicitação', async () => {
  reset();
  const rpc = globalThis.__registrationTransport.rpc;
  globalThis.__registrationTransport.rpc = async (name, args) => name === 'reemitir_fichas_ativas_lote_portal'
    ? { data: [{ matricula_id: 'estranha', codigo: 'CODE-X', ordem_solicitacao: 1 }] } : rpc(name, args);
  try { await assert.rejects(secretariaDocumentosService.registrarEmissao(input('pasta_identificacao')), /não confirmou/); }
  finally { globalThis.__registrationTransport.rpc = rpc; }
});
