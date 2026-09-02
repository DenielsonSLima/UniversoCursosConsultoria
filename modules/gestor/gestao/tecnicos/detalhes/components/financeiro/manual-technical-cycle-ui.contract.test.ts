import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { requireMatriculaTecnicaCicloManual } from "./matricula-tecnica-ciclo-manual.parser";

const baseDir = resolve(
  process.cwd(),
  "modules/gestor/gestao/tecnicos/detalhes/components/financeiro",
);
const readSource = (relativePath: string) =>
  readFileSync(
    resolve(baseDir, relativePath),
    "utf8",
  );

const listSource = readSource("FinanceiroAlunosList.tsx");
const statusSource = readSource("FinanceiroCicloManualStatus.tsx");
const dialogSource = readSource("FinanceiroCicloManualDialog.tsx");
const serviceSource = readSource("matricula-tecnica-ciclo-manual.service.ts");
const previewParserSource = readSource(
  "matricula-tecnica-ciclo-manual-preview.parser.ts",
);
const stateParserSource = readSource(
  "matricula-tecnica-ciclo-manual.parser.ts",
);
const hookSource = readSource("hooks/useMatriculaTecnicaCicloManual.ts");
const typesSource = readSource("matricula-tecnica-ciclo-manual.types.ts");
const keysSource = readSource("matricula-tecnica-financeiro.keys.ts");

const between = (source: string, startMarker: string, endMarker: string) => {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `marcador inicial ausente: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `marcador final ausente: ${endMarker}`);
  return source.slice(start, end);
};

test("T42 recebe ação dinâmica de 2º ciclo e não expõe geração inicial ou ciclo 3", () => {
  assert.match(
    statusSource,
    /Gerar e emitir \{cycleLabel\(cicloManual\.proximoCicloNumero\)\}/,
  );
  assert.match(dialogSource, /Gerar \{cycleNumber\}º ciclo/);
  assert.match(
    dialogSource,
    /Ciclo \{cycleNumber\} de \{row\.cicloManual\.cicloMaximo\}/,
  );
  assert.doesNotMatch(
    `${statusSource}\n${dialogSource}`,
    /Gerar 1º ciclo|Gerar 3º ciclo/i,
  );
  assert.match(typesSource, /proximoCicloNumero: number \| null/);
  assert.match(typesSource, /cicloMaximo: number \| null/);
});

test("baseline zero preserva ciclo 1 gerado e mostra separadamente o estado do ciclo 2", () => {
  const eligibleBranch = between(
    statusSource,
    "if (cicloManual.estado === 'ELEGIVEL'",
    "if (cicloManual.estado === 'BLOQUEADO'",
  );
  const blockedBranch = between(
    statusSource,
    "if (cicloManual.estado === 'BLOQUEADO'",
    "if (cicloManual.estado === 'CICLOS_CONCLUIDOS'",
  );
  assert.match(eligibleBranch, /generated \? <GeneratedCycleStatus/);
  assert.match(
    eligibleBranch,
    /cycleLabel\(cicloManual\.proximoCicloNumero\).*elegível/,
  );
  assert.match(blockedBranch, /generated \? <GeneratedCycleStatus/);
  assert.match(
    blockedBranch,
    /cycleLabel\(cicloManual\.proximoCicloNumero\).*bloqueado/,
  );
  assert.match(statusSource, /generated\.pendentesEmissao > 0 \? \(/);
  assert.doesNotMatch(
    statusSource,
    /generated\.pendentesEmissao > 0 \|\| generated\.emRevisao > 0/,
  );
  assert.match(
    statusSource,
    /Revisão manual necessária; emissão automática bloqueada para evitar duplicidade\./,
  );
  assert.match(statusSource, /Retomar emissão/);
  assert.doesNotMatch(statusSource, /Emitir no Banese em Contas a Receber/);
  assert.ok(
    statusSource.indexOf("if (generated && !isFullyIssued(generated))") <
      statusSource.indexOf("if (cicloManual.estado === 'ELEGIVEL'"),
    "um ciclo incompleto precisa bloquear a geração do próximo ciclo",
  );
});

test("parser aceita transição 1 para 2 e rejeita qualquer ciclo 3", () => {
  assert.match(stateParserSource, /maximum > 2/);
  assert.match(stateParserSource, /baseline > maximum/);
  assert.doesNotMatch(stateParserSource, /baseline >= maximum/);
  assert.match(
    stateParserSource,
    /\['JA_GERADO', 'PROTEGIDO_EXISTENTE', 'CICLOS_CONCLUIDOS'\][\s\S]*?next !== null/,
  );
  assert.match(
    stateParserSource,
    /generatedNumber !== null[\s\S]*?\['ELEGIVEL', 'BLOQUEADO'\][\s\S]*?next !== generatedNumber \+ 1/,
  );
  assert.match(
    serviceSource,
    /\[['"]BLOQUEADO['"], ['"]ELEGIVEL['"]\]\.includes\(result\.cicloManual\.estado\)[\s\S]*?proximoCicloNumero === cycleNumber \+ 1/,
  );
  assert.match(
    serviceSource,
    /finalCycle[\s\S]*?result\.cicloManual\.estado === ['"]JA_GERADO['"]/,
  );
});

test("parser rejeita estados terminais anteriores ao ciclo máximo", () => {
  const generatedCycle = {
    numero: 2,
    status: "LOCAL_CREATED",
    quantidadeItens: 3,
    total: "450.00",
    emitidosBanese: 0,
    pendentesEmissao: 3,
    emRevisao: 0,
  };
  const terminalState = {
    habilitado: true,
    modo: "MANUAL",
    cicloBaseHistorico: 0,
    cicloMaximo: 2,
    proximoCicloNumero: null,
    primeiroVencimentoSugerido: null,
    criterioElegibilidade: "PENULTIMA_SEM_ATRASO",
    estado: "JA_GERADO",
    podeGerar: false,
    bloqueio: null,
    politica: { revisao: 1, fingerprint: "policy-fingerprint" },
    cicloGerado: generatedCycle,
  };

  assert.doesNotThrow(() => requireMatriculaTecnicaCicloManual(terminalState));
  assert.throws(
    () =>
      requireMatriculaTecnicaCicloManual({
        ...terminalState,
        cicloGerado: { ...generatedCycle, numero: 1 },
      }),
    /estado manual de ciclo incoerente/i,
  );
  assert.doesNotThrow(() =>
    requireMatriculaTecnicaCicloManual({
      ...terminalState,
      estado: "CICLOS_CONCLUIDOS",
    })
  );
  assert.throws(
    () =>
      requireMatriculaTecnicaCicloManual({
        ...terminalState,
        cicloBaseHistorico: 2,
        estado: "CICLOS_CONCLUIDOS",
        cicloGerado: { ...generatedCycle, numero: 1 },
      }),
    /estado manual de ciclo incoerente/i,
  );
  assert.doesNotThrow(() =>
    requireMatriculaTecnicaCicloManual({
      ...terminalState,
      cicloBaseHistorico: 2,
      estado: "CICLOS_CONCLUIDOS",
      cicloGerado: null,
    })
  );
  assert.throws(
    () =>
      requireMatriculaTecnicaCicloManual({
        ...terminalState,
        cicloBaseHistorico: 1,
        estado: "CICLOS_CONCLUIDOS",
        cicloGerado: null,
      }),
    /estado manual de ciclo incoerente/i,
  );
});

test("matrícula protegida não tem botão de gerar, emitir, reemitir ou configurar", () => {
  const protectedBranch = between(
    statusSource,
    "if (cicloManual.estado === 'PROTEGIDO_EXISTENTE')",
    "if (generated && !isFullyIssued(generated))",
  );
  assert.match(protectedBranch, /Protegido contra novas cobranças/);
  assert.doesNotMatch(
    protectedBranch,
    /<button|onGenerate|onResume|Emitir|Reemitir/i,
  );
  assert.match(
    listSource,
    /const protectedExisting = manualMode[\s\S]*?PROTEGIDO_EXISTENTE/,
  );
  assert.match(
    listSource,
    /\{!protectedExisting \? <button[\s\S]*?Configuração individual/,
  );
  assert.match(listSource, /\{!manualMode \? <button[\s\S]*?Mais opções/);
});

test("status acadêmico TRANCADO fica explícito e independente da cobrança", () => {
  assert.match(
    statusSource,
    /\['TRANCADO', 'CANCELADO', 'TRANSFERIDO', 'CONCLUIDO'\]\.includes\(normalized\)/,
  );
  assert.match(statusSource, /Matrícula \{normalized \|\| 'NÃO INFORMADA'\}/);
  assert.match(
    listSource,
    /MatriculaAcademicaBadge status=\{row\.statusAcademico\}/,
  );
  assert.match(listSource, /Cobrança: \{situationLabel\(row\)\}/);
});

test("modo manual sai integralmente da ativação AGORA, AGENDADA e lote legados", () => {
  assert.match(
    listSource,
    /row\.financeiro\.status === 'PENDENTE'[\s\S]*?!\(row\.cicloManual\.habilitado && row\.cicloManual\.modo === 'MANUAL'\)/,
  );
  assert.match(listSource, /const canActivate = !manualMode/);
  assert.match(
    listSource,
    /\{!manualMode && actionMenuId === row\.matriculaId/,
  );
  assert.match(
    listSource,
    /\{manualMode \? \([\s\S]*?<FinanceiroCicloManualStatus/,
  );
  const manualMutation = between(
    listSource,
    "const generateManualCycle = async",
    "if (isLoading)",
  );
  assert.doesNotMatch(
    manualMutation,
    /individualMutation|batchMutation|modo:\s*'AGORA'|modo:\s*'AGENDADA'/,
  );
});

test("ciclo 1 mantém escolha de vencimento e ciclo 2 exige data individual", () => {
  assert.match(dialogSource, /usePreviewCicloFinanceiroTecnicoManual/);
  assert.match(dialogSource, /Usar datas da turma/);
  assert.match(dialogSource, /Definir primeira data/);
  assert.match(dialogSource, /O sistema recalcula todo o cronograma/);
  assert.match(
    dialogSource,
    /const requiresIndividualDate = cycleNumber === 2/,
  );
  assert.match(
    dialogSource,
    /requiresIndividualDate \? 'INDIVIDUAL' : 'TURMA'/,
  );
  assert.match(dialogSource, /Data individual obrigatória no 2º ciclo/);
  assert.match(dialogSource, /vencimento da rematrícula — ou do primeiro item/);
  assert.match(dialogSource, /mensalidade 1 vencerá no mês seguinte/);
  assert.match(
    dialogSource,
    /useState\([\s\S]*?row\.cicloManual\.primeiroVencimentoSugerido \?\? ''/,
  );
  assert.match(
    dialogSource,
    /type="date" value=\{individualDate\} onChange=\{\(event\) => setIndividualDate\(event\.target\.value\)\}/,
  );
  const dateInput = dialogSource.match(/<input type="date"[^>]*>/)?.[0];
  assert.ok(dateInput);
  assert.doesNotMatch(dateInput, /disabled|readOnly/);
  assert.match(dialogSource, /um mês após o último boleto do ciclo anterior/);
  assert.match(
    listSource,
    /<FinanceiroCicloManualDialog\s+key=\{currentManualCycleRow\.matriculaId\}/,
  );
  assert.match(
    keysSource,
    /previewCicloManual:[\s\S]*?matriculaId,[\s\S]*?cicloNumero,[\s\S]*?primeiroVencimento \|\| 'turma'/,
  );
  assert.match(typesSource, /primeiroVencimentoSugerido: string \| null/);
  assert.match(
    stateParserSource,
    /isNullableIsoCalendarDate\(value\.primeiroVencimentoSugerido\)/,
  );
  assert.match(
    serviceSource,
    /cycleNumber === 2 && firstDueDate === null/,
  );
  assert.match(
    previewParserSource,
    /Number\(value\.cicloNumero\) === 2[\s\S]*?value\.sourceVencimento !== ['"]INDIVIDUAL['"]/,
  );
  assert.match(
    listSource,
    /preview\.cicloNumero === 2\s*\? 'Informe uma data individual futura válida para o 2º ciclo e confirme novamente\.'\s*: 'Revise a data individual ou use as datas configuradas na turma\.'/,
  );
});

test("prévia canônica lista 1+N e a confirmação comunica emissão BolePix única", () => {
  assert.match(dialogSource, /preview\.itens\.map/);
  assert.match(dialogSource, /preview\.quantidadeItens/);
  assert.match(dialogSource, /preview\.total/);
  assert.match(dialogSource, /preview\.primeiroVencimento/);
  for (
    const field of [
      "descontoPontualidade",
      "jurosAtrasoPercentual",
      "multaAtrasoPercentual",
      "instrucaoBoleto",
    ]
  ) {
    assert.match(typesSource, new RegExp(`${field}: string`));
    assert.match(dialogSource, new RegExp(`preview\\.termos\\.${field}`));
  }
  assert.match(
    typesSource,
    /matricula: \{ desconto: boolean; multaJuros: boolean \}/,
  );
  assert.match(
    typesSource,
    /mensalidade: \{ desconto: boolean; multaJuros: boolean \}/,
  );
  assert.match(
    typesSource,
    /rematricula: \{ desconto: boolean; multaJuros: boolean \}/,
  );
  assert.match(
    dialogSource,
    /(?:Termos financeiros da regra efetiva|Condições da configuração efetiva)/,
  );
  assert.match(
    dialogSource,
    /Desconto: \{application\.desconto \? 'aplica' : 'não aplica'\}/,
  );
  assert.match(
    dialogSource,
    /Multa\/juros: \{application\.multaJuros \? 'aplica' : 'não aplica'\}/,
  );
  assert.match(previewParserSource, /const validTerms = isRecord\(terms\)/);
  assert.match(dialogSource, /Geração e emissão em uma única ação/);
  assert.match(
    dialogSource,
    /QR Pix, linha digitável, código de barras e PDF oficial Banese/,
  );
  assert.match(dialogSource, /Gerar e emitir BolePix/);
  assert.doesNotMatch(
    dialogSource,
    /Nenhum boleto Banese|Emissão bancária continua separada/,
  );
  assert.doesNotMatch(dialogSource, /supabase|functions\.invoke|gateway/i);
});

test("frontend usa uma única Edge para gerar ou retomar e só aceita 13 de 13 emitidos", () => {
  assert.match(
    serviceSource,
    /supabase\.rpc\(['"]preview_ciclo_financeiro_tecnico_manual_secure['"]/,
  );
  assert.match(
    serviceSource,
    /supabase\.functions\.invoke\([\s\S]*?['"]technical-manual-cycle-issuance['"]/,
  );
  assert.doesNotMatch(
    serviceSource,
    /gerar_ciclo_financeiro_tecnico_manual_secure/,
  );
  assert.match(serviceSource, /action: ['"]generate['"]/);
  assert.match(serviceSource, /action: ['"]resume['"]/);
  for (
    const parameter of [
      "expectedRegraFingerprint",
      "expectedPoliticaFingerprint",
      "expectedCronogramaFingerprint",
    ]
  ) assert.match(serviceSource, new RegExp(parameter));
  assert.match(serviceSource, /item\.emissaoBanese === ['"]EMITIDO['"]/);
  assert.match(serviceSource, /cycle\.quantidadeItens !== 13/);
  assert.match(serviceSource, /cycle\.emitidosBanese !== 13/);
  assert.match(serviceSource, /cycle\.pendentesEmissao !== 0/);
  assert.match(serviceSource, /cycle\.status !== ['"]EMITIDO_BANESE['"]/);
  const calls = serviceSource.slice(
    serviceSource.indexOf("export const matriculaTecnicaCicloManualService"),
  );
  assert.doesNotMatch(
    calls,
    /p_valor|p_parcela|p_multa|p_juros|p_desconto|checkout|createBanese/i,
  );
});

test("fingerprints e requestId impedem retry ou prévia silenciosamente diferentes", () => {
  for (
    const field of [
      "regraEfetivaFingerprint",
      "politicaFingerprint",
      "cronogramaFingerprint",
    ]
  ) {
    assert.match(dialogSource, new RegExp(`preview\\.${field}`));
    assert.match(listSource, new RegExp(`preview\\.${field}`));
  }
  assert.match(listSource, /const requestId = getRequestId\(key\)/);
  assert.match(listSource, /requestIds\.current\.delete\(key\)/);
  const manualMutation = between(
    listSource,
    "const generateManualCycle = async",
    "if (isLoading)",
  );
  const catchBlock = manualMutation.slice(
    manualMutation.indexOf("} catch (error)"),
  );
  assert.doesNotMatch(catchBlock, /requestIds\.current\.delete/);
  assert.match(listSource, /sem duplicar cobranças/);
});

test("geração e retomada atualizam workspace e listas financeiras inclusive em falha parcial", () => {
  assert.match(hookSource, /previewCicloManual\(/);
  assert.match(hookSource, /retry: false/);
  assert.match(
    hookSource,
    /matriculaTecnicaCicloManualService\.generate\(input\)/,
  );
  assert.match(
    hookSource,
    /matriculaTecnicaCicloManualService\.resume\(input\)/,
  );
  assert.match(hookSource, /onSettled:[\s\S]*?invalidateIssuanceQueries/);
  assert.match(hookSource, /matriculaTecnicaFinanceiroKeys\.turma\(turmaId\)/);
  assert.match(hookSource, /financeiroQueryKeys\.receivablesRoot/);
  assert.match(hookSource, /financeiroQueryKeys\.alunoReceivables/);
  assert.match(hookSource, /financeiroQueryKeys\.resumoKpis/);
  assert.match(
    hookSource,
    /markFinanceiroRequestReconciled\(result\.requestId\)/,
  );
  assert.match(serviceSource, /body\.progress/);
  assert.match(
    serviceSource,
    /progress\.emRevisao > 0 && progress\.pendentesEmissao === 0/,
  );
  assert.match(
    serviceSource,
    /Revisão manual necessária; não tente uma nova emissão\./,
  );
  assert.match(serviceSource, /Use “Retomar emissão”/);
  assert.match(
    listSource,
    /getCicloFinanceiroTecnicoManualRecoveryGuidance\(error\)/,
  );
});
