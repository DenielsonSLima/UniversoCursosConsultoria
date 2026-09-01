import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import test from "node:test";

const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");
const policySource = read("./technical-enrollment-manual-policy.ts");
const hookSource = read("./useTechnicalEnrollmentConfirmation.ts");
const modalSource = read("./ConfirmarMatriculaModal.tsx");
const turmaAlunosSource = read("../TurmaAlunos.tsx");

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL("./technical-enrollment-manual-policy.ts", import.meta.url))],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "es2022",
  write: false,
});
const compiledModule = { exports: {} };
new Function("module", "exports", outputFiles[0].text)(compiledModule, compiledModule.exports);
const { isManualTechnicalCycleContext } = compiledModule.exports;

const manualPolicy = {
  habilitado: true,
  modo: "MANUAL",
  estadoInicial: "NOVA",
  cicloBaseHistorico: 0,
  cicloMaximo: 2,
  criterioElegibilidade: "PENULTIMA_SEM_ATRASO",
  revisao: 1,
  fingerprint: "a".repeat(64),
};

test("aceita somente a política canônica carregada e falha fechado sem contrato", () => {
  assert.equal(
    isManualTechnicalCycleContext({
      turma: { cicloFinanceiroTecnico: manualPolicy },
    }),
    true,
  );
  assert.equal(
    isManualTechnicalCycleContext({
      turma: {
        cicloFinanceiroTecnico: {
          habilitado: false,
          modo: null,
          estadoInicial: null,
          cicloBaseHistorico: null,
          cicloMaximo: null,
          criterioElegibilidade: null,
          revisao: null,
          fingerprint: null,
        },
      },
    }),
    false,
  );
  assert.throws(
    () => isManualTechnicalCycleContext({ turma: {} }),
    /política de ciclos/i,
  );
  assert.throws(
    () => isManualTechnicalCycleContext({
      turma: { cicloFinanceiroTecnico: { ...manualPolicy, habilitado: "sim" } },
    }),
    /política de ciclos/i,
  );
  assert.throws(
    () => isManualTechnicalCycleContext({
      turma: { cicloFinanceiroTecnico: { ...manualPolicy, modo: "AUTOMATICO" } },
    }),
    /política manual de ciclos/i,
  );
});

test("modal manual não oferece intenção AGORA ou AGENDADA e confirma vínculo pendente", () => {
  assert.match(modalSource, /manualFinanceMode: boolean/);
  assert.match(modalSource, /if \(!manualFinanceMode\) return;/);
  assert.match(modalSource, /setIntent\('PENDENTE'\)/);
  assert.match(
    modalSource,
    /canManageFinanceiro && !manualFinanceMode \? intent : 'PENDENTE'/,
  );
  assert.match(modalSource, /Vínculo pendente · geração manual/);
  assert.match(
    modalSource,
    /sem criar cobrança de matrícula, rematrícula, mensalidade, boleto ou agendamento/,
  );
  assert.match(
    modalSource,
    /2 \* regraCompleta\.mensalidadesPorCiclo \* Number\(regraCompleta\.valorMensalidade\)/,
  );
  assert.match(modalSource, /sem ela, o ciclo começa pela mensalidade 1/);
  assert.doesNotMatch(modalSource, /Curso encerra no ciclo 1/);
  assert.match(
    modalSource,
    /manualFinanceMode \? 'Salvar pendente, sem cobrança'/,
  );
});

test("handler rebaixa submissão manipulada e nunca ativa matrícula manual", () => {
  assert.match(
    hookSource,
    /const effectiveIntent = manualFinanceMode\s*\? ["']PENDENTE["']/,
  );
  assert.match(hookSource, /if \(effectiveIntent !== ["']PENDENTE["']\)/);
  assert.match(hookSource, /if \(preLink\.cobrancaGerada\)/);
  assert.match(hookSource, /Nenhuma cobrança ou agendamento foi criado/);
  assert.match(turmaAlunosSource, /isManualTechnicalCycleContext/);
  assert.match(turmaAlunosSource, /const financialContext = canManageFinanceiro/);
  assert.match(turmaAlunosSource, /financialContext\s*\? isManualTechnicalCycleContext\(financialContext\)\s*:\s*true/);
  assert.match(turmaAlunosSource, /manualFinanceMode=\{manualFinanceMode\}/);
  assert.match(
    turmaAlunosSource,
    /technicalEnrollmentConfirmation\.confirm\(submission\)/,
  );
  assert.match(modalSource, /!loading && !error && regra \? <footer/);
});
