import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { managerUIRuntime } from "./manager-cycle-ui-runtime.mjs";
const { ui: x, cleanup } = await managerUIRuntime();
test.after(cleanup);
const f = resolve("modules/gestor/gestao/tecnicos/detalhes/components/financeiro");
const mat = "11111111-1111-4111-8111-111111111111";
const context = () => ({ versao: 1, matriculaId: mat, fontes: [{ origem: "BANESE_LEGACY_IMPORTED", provedor: "BANESE", canal: "API", quantidade: 12 }, { origem: "UNIVERSO_NATIVE", provedor: "BANESE", canal: "API", quantidade: 1 }], mensalidades: { lancadas: 24, emitidas: 12, bancariasEmitidas: 12, externasConhecidas: 0, canceladas: 0, pagas: 0, emRevisao: 0 }, taxas: 1, ajustesResiduais: 0, ciclosComprovados: [], operacoes: [] });
const decision = () => ({ versao: 1, naoEmitirPermitido: true, opcoes: [{ cicloNumero: 1, acao: "CRIAR", podeGerar: true, motivo: null }, { cicloNumero: 2, acao: "CRIAR", podeGerar: true, motivo: null }] });
const state = () => ({ habilitado: true, modo: "MANUAL", estado: "ELEGIVEL", podeGerar: true, cicloBaseHistorico: 0, cicloMaximo: 2, proximoCicloNumero: 2, primeiroVencimentoSugerido: "2026-11-18", criterioElegibilidade: "MANUAL_DECISAO_GESTOR", politica: { revisao: 1, fingerprint: "policy" }, cicloGerado: null, bloqueio: null, financeiroMatricula: context(), decisaoGestor: decision() });
test("canonical choices are independent of next-cycle suggestion and issued count", () => {
  const s = state();
  x.requireMatriculaTecnicaCicloManual(s);
  assert.equal(x.canChooseCycle(s, 1), true);
  assert.equal(x.canChooseCycle(s, 2), true);
  s.financeiroMatricula.mensalidades.emitidas = 24;
  s.financeiroMatricula.mensalidades.bancariasEmitidas = 24;
  x.requireMatriculaTecnicaCicloManual(s);
  assert.equal(x.canChooseCycle(s, 2), true);
});
test("one invalid student is isolated and valid neighboring student keeps choices", () => {
  const good = { matriculaId: mat, cicloManual: state() };
  const bad = { matriculaId: "22222222-2222-4222-8222-222222222222", cicloManual: state() };
  const out = x.isolateFinancialCycleRows([bad, good]);
  assert.equal(out.length, 2);
  assert.ok(out[0].cicloManual.diagnosticoFinanceiro);
  assert.equal(out[1], good);
  assert.equal(x.canChooseCycle(out[1].cicloManual, 2), true);
});
test("mixed origins match imported, native and mixed filters simultaneously", () => {
  for (const o of ["BANESE_LEGACY_IMPORTED", "UNIVERSO_NATIVE", "MISTAS"]) assert.equal(x.matchesFinancialOrigin(state(), o), true);
});
test("Proesc review in progress does not disable canonical manager button", () => {
  const html = x.renderToStaticMarkup(x.React.createElement(x.Status, { cicloManual: state(), statusAcademico: "ATIVO", disabled: false, reviewingProesc: true, onGenerate() {
  }, onResume() {
  } }));
  assert.match(html, /Escolher ciclo/);
  assert.doesNotMatch(html, /<button[^>]*\sdisabled(?:=|\s|>)/);
});
test("no-issue callback is explicit and performs zero backend calls", () => {
  let closed = 0;
  const e = x.Choice({ decision: decision(), value: 2, disabled: false, onChange() {
  }, onDoNotIssue() {
    closed++;
  } });
  const button = e.props.children.find((c) => c?.type === "button");
  button.props.onClick();
  assert.equal(closed, 1);
  assert.equal(globalThis.rpcCalls.length, 0);
  assert.equal(globalThis.invokeCalls.length, 0);
});
const issued = (number, next) => {
  const s = state();
  s.proximoCicloNumero = next;
  s.cicloGerado = { numero: number, status: "EMITIDO_BANESE", quantidadeItens: 1, quantidadeBancaria: 1, quantidadeLocal: 0, total: "279.90", emitidosBanese: 1, pendentesEmissao: 0, emRevisao: 0 };
  s.financeiroMatricula.operacoes = [{ cicloNumero: number, estado: "LOCAL_CREATED", requestId: "33333333-3333-4333-8333-333333333333", quantidadeItens: 1 }];
  s.decisaoGestor.opcoes[number - 1] = { cicloNumero: number, acao: "RETOMAR", podeGerar: false, motivo: "OPERACAO_EXISTENTE" };
  return { success: true, requestId: "33333333-3333-4333-8333-333333333333", replayed: false, ciclo: { ...s.cicloGerado, recebiveis: [{ id: "44444444-4444-4444-8444-444444444444", chave: `ciclo-${number}-parc-1`, tipo: "PARCELA", numero: 1, descricao: "Mensalidade", valor: "279.90", vencimento: "2026-11-18", destinoCobranca: "BANESE", emissaoBanese: "EMITIDO", status: "PENDENTE" }] }, cicloManual: s };
};
test("resume C2 succeeds while manager can still choose C1 (no forced final-state transition)", async () => {
  globalThis.invokeResponse = issued(2, 1);
  await x.matriculaTecnicaCicloManualService.resume({ matriculaId: mat, cicloNumero: 2 });
});
test("completed C1 succeeds when C2 already exists (no mandatory next 2)", async () => {
  const r = issued(1, null);
  r.cicloManual.estado = "JA_GERADO";
  r.cicloManual.podeGerar = false;
  r.cicloManual.decisaoGestor.opcoes[1] = { cicloNumero: 2, acao: "CONSULTAR", podeGerar: false, motivo: "COBRANCAS_EXISTENTES" };
  globalThis.invokeResponse = r;
  await x.matriculaTecnicaCicloManualService.resume({ matriculaId: mat, cicloNumero: 1 });
});
const fixtureSource = await readFile(f + "/matricula-tecnica-ciclo-manual-preview.parser.test.ts", "utf8");
const fixtureBody = fixtureSource.match(/const canonicalPreview = \(\) => \((\{[\s\S]*?\n\})\);/)[1];
const previewFixture = () => new Function("instruction", "return (" + fixtureBody + ")")("SR.(A) CAIXA: N\xC3O RECEBER ESTE T\xCDTULO AP\xD3S 60 DIAS.");
test("preview does not invoke Proesc even when legacy conferirProesc=true", async () => {
  const p = previewFixture();
  globalThis.rpcResponse = { matriculaId: mat, turmaId: "turma", cicloManual: state(), preview: p };
  globalThis.rpcCalls = [];
  globalThis.invokeCalls = [];
  await x.matriculaTecnicaCicloManualService.preview({ turmaId: "turma", matriculaId: mat, cicloNumero: 2, primeiroVencimento: p.dataOrigem, conferirProesc: true });
  assert.equal(globalThis.rpcCalls.length, 1);
  assert.equal(globalThis.rpcCalls[0][0], "preview_ciclo_financeiro_tecnico_manual_secure");
  assert.equal(globalThis.invokeCalls.length, 0);
});
test("older incomplete C1 remains reachable when C2 is current generated cycle", () => {
  const s = issued(2, 1).cicloManual;
  s.financeiroMatricula.operacoes.push({ cicloNumero: 1, estado: "LOCAL_CREATED", requestId: "other", quantidadeItens: 13 });
  s.decisaoGestor.opcoes[0] = { cicloNumero: 1, acao: "RETOMAR", podeGerar: false, motivo: "OPERACAO_EXISTENTE" };
  const html = x.renderToStaticMarkup(x.React.createElement(x.Status, { cicloManual: s, statusAcademico: "ATIVO", disabled: false, onGenerate() {
  }, onResume() {
  } }));
  assert.match(html, /<button[^>]*>[^<]*(?:<[^>]+>[^<]*)*Retomar[^<]*1/);
});
test("legacy transfer C1 retains explicit date despite manager criterion", () => {
  const s = state();
  s.proximoCicloNumero = 1;
  s.planoEntrada = { versao: 2, cicloInicial: 1, quantidadeParcelas: 5, primeiroVencimento: "2026-12-07", requestId: mat, justificativaCiclo2: null };
  s.primeiroVencimentoSugerido = "2026-12-07";
  x.renderToStaticMarkup(x.React.createElement(x.Dialog, { turmaId: "turma", row: { matriculaId: mat, alunoNome: "Synthetic", matriculaExibicao: "TEST", cicloManual: s }, pending: false, onClose() {
  }, onConfirm() {
  } }));
  assert.equal(globalThis.lastPreviewInput.primeiroVencimento, "2026-12-07");
});
test("explicit transfer selected C2 uses C2 date instead of global C1 suggestion", () => {
  const s = state();
  s.proximoCicloNumero = 2;
  s.primeiroVencimentoSugerido = "2026-11-07";
  s.planoEntrada = { versao: 3, cicloInicial: 1, maxCiclos: 2, requestId: mat, cronogramaFingerprint: "a".repeat(64), itens: [1, 2].map((c) => ({ itemId: `${c}1111111-1111-4111-8111-111111111111`, cicloNumero: c, tipo: "PARCELA", ordem: 1, vencimento: c === 1 ? "2026-11-07" : "2027-11-07", valor: "279.90", descontoPontualidade: "0.00", jurosAtrasoPercentual: "0", multaAtrasoPercentual: "0" })) };
  x.renderToStaticMarkup(x.React.createElement(x.Dialog, { turmaId: "turma", row: { matriculaId: mat, alunoNome: "Synthetic", matriculaExibicao: "TEST", cicloManual: s }, pending: false, onClose() {
  }, onConfirm() {
  } }));
  assert.equal(globalThis.lastPreviewInput.primeiroVencimento, "2027-11-07");
});

test('malformed workspace row is reported without suppressing healthy rows or fabricating totals', () => {
  const good = { matriculaId: mat, amount: '250.00' };
  const result = x.isolateFinancialWorkspaceRows([{ matriculaId: 'bad', amount: null }, good], (row) => {
    if (typeof row.amount !== 'string') throw new Error('Valor canônico ausente.');
    return row;
  });
  assert.deepEqual(result.valid, [good]);
  assert.deepEqual(result.diagnostics, [{ matriculaId: 'bad', mensagem: 'Valor canônico ausente.' }]);
});
