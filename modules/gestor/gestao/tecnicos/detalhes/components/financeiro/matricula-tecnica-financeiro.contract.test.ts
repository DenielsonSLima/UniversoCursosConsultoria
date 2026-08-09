import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  validateAtivacaoLoteInput,
  validateAtivacaoLoteResult,
} from "./matricula-tecnica-financeiro.validation";
import {
  isFinanceiroRequestReconciled,
  markFinanceiroRequestReconciled,
} from "./matricula-tecnica-financeiro.echo";

const baseDir = resolve(
  process.cwd(),
  "modules/gestor/gestao/tecnicos/detalhes/components/financeiro",
);
const serviceSource = readFileSync(
  resolve(baseDir, "matricula-tecnica-financeiro.service.ts"),
  "utf8",
);
const alunosSource = readFileSync(
  resolve(baseDir, "../TurmaAlunos.tsx"),
  "utf8",
);
const modalSource = readFileSync(
  resolve(baseDir, "../alunos/ConfirmarMatriculaModal.tsx"),
  "utf8",
);
const listSource = readFileSync(
  resolve(baseDir, "FinanceiroAlunosList.tsx"),
  "utf8",
);
const configSource = readFileSync(
  resolve(baseDir, "FinanceiroConfig.tsx"),
  "utf8",
);
const configAdapterSource = readFileSync(
  resolve(baseDir, "financeiro-config.service.ts"),
  "utf8",
);
const configEditorSource = readFileSync(
  resolve(baseDir, "FinanceiroConfigEditor.tsx"),
  "utf8",
);
const realtimeHookSource = readFileSync(
  resolve(baseDir, "hooks/useMatriculaTecnicaFinanceiroRealtime.ts"),
  "utf8",
);
const accessibleDialogSource = readFileSync(
  resolve(baseDir, "hooks/useAccessibleDialog.ts"),
  "utf8",
);
const technicalClassFormSource = readFileSync(
  resolve(baseDir, "../../../../components/forms/turma-tecnico/TurmaTecnicoForm.tsx"),
  "utf8",
);
const technicalClassFormConstantsSource = readFileSync(
  resolve(baseDir, "../../../../components/forms/turma-tecnico/turma-tecnico-form.constants.ts"),
  "utf8",
);
const technicalClassFinancialStepSource = readFileSync(
  resolve(baseDir, "../../../../components/forms/turma-tecnico/TurmaTecnicoFinanceiroStep.tsx"),
  "utf8",
);

test("service usa contexto RBAC, workspace e mutações canônicas sem enviar valores", () => {
  assert.match(
    serviceSource,
    /obter_pre_vinculo_aluno_tecnico_contexto_secure/,
  );
  assert.match(
    serviceSource,
    /obter_financeiro_matricula_tecnica_workspace_secure/,
  );
  assert.match(serviceSource, /class FinanceiroContractError extends Error/);
  assert.match(serviceSource, /isFinanceiroContractError/);
  assert.match(serviceSource, /pre_vincular_aluno_tecnico_secure/);
  assert.match(
    serviceSource,
    /ativar_financeiro_matricula_tecnica_flexivel_secure/,
  );
  assert.match(
    serviceSource,
    /ativar_financeiro_matriculas_tecnicas_flexivel_lote_secure/,
  );

  const mutationMethods = serviceSource.slice(
    serviceSource.indexOf("preVincular(input"),
  );
  assert.doesNotMatch(
    mutationMethods,
    /p_valor|p_parcel|p_percent|p_juros|p_multa|p_desconto|asaas/i,
  );
  assert.match(mutationMethods, /p_request_id: input\.requestId/);
  assert.match(mutationMethods, /p_modo: input\.modo/);
  assert.match(
    mutationMethods,
    /p_expected_regra_revisao: input\.expectedRegraRevisao/,
  );
  assert.match(
    mutationMethods,
    /p_expected_regra_fingerprint: input\.expectedRegraFingerprint/,
  );
});

test("editor flexível usa somente preview/save canônicos e preserva todas as políticas", () => {
  assert.match(configSource, /usePreverRegraFinanceiraTecnica/);
  assert.match(configSource, /useSalvarRegraFinanceiraTecnica/);
  assert.match(configSource, /baseFingerprint/);
  assert.match(configSource, /setConflict\(true\)/);
  assert.doesNotMatch(
    configAdapterSource,
    /\.from\('turmas'\)|build_gestao_financial_schedule|saveTurmaFinanceiroConfig/,
  );
  assert.match(configEditorSource, /min=\{1\}/);
  assert.match(configEditorSource, /max=\{60\}/);
  assert.match(configEditorSource, /cobrarMatricula/);
  assert.match(configEditorSource, /cobrarRematricula/);
  assert.match(configEditorSource, /policy\.descontoKey/);
  assert.match(configEditorSource, /policy\.multaKey/);
  assert.match(
    configEditorSource,
    /Juros de \{formatPercentageBR\(formData\.jurosAtraso, 2\)\}% ao mês/,
  );
  assert.doesNotMatch(
    configEditorSource,
    /checked=\{formData\[policy\.(?:descontoKey|multaKey)\]\}\s+disabled/,
  );
});

test("matrícula técnica começa pendente e não usa cálculo ou gateway no browser", () => {
  assert.match(alunosSource, /useState<EnrollmentFinanceIntent>\('PENDENTE'\)/);
  assert.match(alunosSource, /preLink\.cobrancaGerada/);
  assert.doesNotMatch(
    alunosSource,
    /Asaas|useFinanceiroRulesCalculation|valorMatricula|descontoPontualidade|jurosAtraso/,
  );
  assert.doesNotMatch(
    modalSource,
    /MoneyField|GatewayPaymentMethod|sincronizar_asaas/,
  );
  assert.match(modalSource, /has-\[:focus-visible\]:ring-2/);
  assert.match(
    modalSource,
    /canManageFinanceiro \|\| option\.value === 'PENDENTE'/,
  );
  const closeEnrollmentSource = alunosSource.slice(
    alunosSource.indexOf("const closeEnrollmentConfirmation"),
    alunosSource.indexOf("const confirmEnrollmentFinance"),
  );
  assert.doesNotMatch(closeEnrollmentSource, /RequestIds\.current\.clear/);
  assert.match(
    alunosSource,
    /requireTechnicalProfile && canManageFinanceiro && canEnroll/,
  );
  assert.match(
    alunosSource,
    /requireTechnicalProfile && !canManageFinanceiro && canEnroll/,
  );
  assert.match(
    alunosSource,
    /requireTechnicalProfile && canManageFinanceiro \? turma\.id : ''/,
  );
});

test("geração imediata exige confirmação e modais preservam ciclo de foco", () => {
  assert.match(
    listSource,
    /setPendingAction\(\{ matriculaIds: \[row\.matriculaId\], label: row\.alunoNome, modo: 'AGORA' \}\)/,
  );
  assert.match(listSource, /Confirmar geração inicial/);
  assert.match(listSource, /actionRule\.cobranca\.matricula\.habilitada/);
  assert.match(listSource, /row\.regraEfetiva/);
  assert.match(listSource, /row\.financeiro\.status === 'ATIVADA'/);
  assert.match(listSource, /> Gerada</);
  assert.match(listSource, /value\.trim\(\) === ''\) return '—'/);
  assert.match(listSource, /Primeiro ciclo:.*mensalidades/);
  assert.doesNotMatch(
    listSource,
    /somente o título local da matrícula inicial será gerado agora/,
  );
  assert.match(accessibleDialogSource, /event\.key === 'Escape'/);
  assert.match(accessibleDialogSource, /event\.key !== 'Tab'/);
  assert.match(
    accessibleDialogSource,
    /document\.body\.style\.overflow = 'hidden'/,
  );
  assert.match(accessibleDialogSource, /previouslyFocused\?\.focus\(\)/);
  assert.match(accessibleDialogSource, /initialFocusRef\.current\?\.focus\(\)/);
});

test("Realtime usa somente Broadcast privado por turma e reconcilia após reconnect", () => {
  assert.match(realtimeHookSource, /financeiro-matricula:turma:\$\{turmaId\}/);
  assert.match(realtimeHookSource, /config: \{ private: true \}/);
  assert.match(realtimeHookSource, /event: 'config-changed'/);
  assert.match(realtimeHookSource, /event: 'title-changed'/);
  assert.match(realtimeHookSource, /event: 'rule-changed'/);
  assert.match(realtimeHookSource, /if \(subscribedOnce\)/);
  assert.match(realtimeHookSource, /payload\.turmaId !== turmaId/);
  assert.match(realtimeHookSource, /message\.event === 'rule-changed'/);
  assert.match(realtimeHookSource, /payload\?\.origin === 'MUTATION'/);
  assert.doesNotMatch(
    realtimeHookSource,
    /postgres_changes|matriculas_tecnicas_financeiro_config|contas_receber/,
  );
});

test("eco só é suprimível pelo requestId local reconciliado e expira", () => {
  markFinanceiroRequestReconciled("request-local", 1_000);
  assert.equal(isFinanceiroRequestReconciled("request-local", 1_001), true);
  assert.equal(isFinanceiroRequestReconciled("request-external", 1_001), false);
  assert.equal(isFinanceiroRequestReconciled("request-local", 31_001), false);
});

test("lote exige IDs únicos e retorno coerente com o modo solicitado", () => {
  const input = {
    turmaId: "turma-1",
    matriculaIds: ["matricula-1"],
    modo: "AGORA" as const,
    requestId: "request-1",
    expectedTurmaRevisao: 2,
    expectedTurmaFingerprint: "fp-2",
    expectedRegras: [{
      matriculaId: "matricula-1",
      overrideRevisao: 0,
      overrideFingerprint: "override-fp",
      efetivaFingerprint: "efetiva-fp",
    }],
  };
  const canonicalResult = {
    operacao: "ATIVACAO_LOTE_FLEXIVEL" as const,
    modo: "AGORA" as const,
    requestId: "request-1",
    replayed: false,
    turmaId: "turma-1",
    total: 1,
    resultados: [{
      matriculaId: "matricula-1",
      status: "GERADA" as const,
      situacaoFinanceira: "EM_DIA" as const,
      titulo: {
        id: "titulo-1",
        status: "PENDENTE",
        valor: "200.00",
        vencimento: "2026-09-10",
      },
    }],
    workspace: {} as never,
  };
  assert.doesNotThrow(() => validateAtivacaoLoteInput(input));
  assert.doesNotThrow(() => validateAtivacaoLoteResult(input, canonicalResult));
  assert.throws(() =>
    validateAtivacaoLoteInput({
      ...input,
      matriculaIds: ["matricula-1", "matricula-1"],
    })
  );
  assert.throws(() =>
    validateAtivacaoLoteResult(input, {
      ...canonicalResult,
      resultados: [{
        matriculaId: "matricula-1",
        status: "PENDENTE",
        situacaoFinanceira: "PENDENTE",
        titulo: null,
      }],
    })
  );
  assert.throws(() =>
    validateAtivacaoLoteResult(input, {
      ...canonicalResult,
      resultados: [
        canonicalResult.resultados[0],
        canonicalResult.resultados[0],
      ],
    })
  );
});

test("nova turma coleta a regra flexível sem duplicar a criação financeira", () => {
  assert.match(technicalClassFormConstantsSource, /cobrarMatricula: true/);
  assert.match(technicalClassFormConstantsSource, /valorMatricula: 150/);
  assert.match(technicalClassFormConstantsSource, /cobrarRematricula: true/);
  assert.match(technicalClassFormConstantsSource, /valorRematricula: 150/);
  assert.match(technicalClassFormConstantsSource, /qtdParcelas: 12/);
  assert.match(technicalClassFormConstantsSource, /valorParcela: 279\.9/);
  assert.match(technicalClassFinancialStepSource, /Gerar cobrança de matrícula/);
  assert.match(technicalClassFinancialStepSource, /cobrarMatricula: enabled/);
  assert.match(technicalClassFormSource, /multaAtraso: 0/);
  assert.match(technicalClassFormSource, /cronogramaFinanceiro: \[\]/);
  assert.match(technicalClassFormSource, /sincronizarAsaasFuturo: false/);
  assert.match(technicalClassFormSource, /useAccessibleDialog/);
  assert.match(technicalClassFormSource, /role="dialog"/);
  assert.match(technicalClassFormSource, /aria-modal="true"/);
  assert.match(technicalClassFormSource, /disabled=\{isSaving\}/);
  assert.match(
    technicalClassFinancialStepSource,
    /disabled=\{formData\.origemFinanceira === 'LEGADO'\}/,
  );
});
