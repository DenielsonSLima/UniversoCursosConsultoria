import { isTransferEntrySnapshot } from '../../../../../../../supabase/functions/_shared/technical-transfer-schedule';
import { sameExternalTransferPlan } from './external-transfer-draft';
import type { ExternalTransferResult } from './external-transfer.contract';
import type { MatriculaTecnicaFinanceiroWorkspace } from '../financeiro/matricula-tecnica-financeiro.types';
import type { PreviewCicloFinanceiroTecnicoManualInput, PreviewCicloFinanceiroTecnicoManualResult } from '../financeiro/matricula-tecnica-ciclo-manual.types';
import { requireTransferSchedulePreview } from '../financeiro/manual-cycle-transfer-schedule';

export interface ExternalTransferIssuanceContext {
  saved: ExternalTransferResult;
  turmaId: string;
  alunoId: string;
  poloId: string;
}

export const requireExternalTransferIssuanceRow = (
  context: ExternalTransferIssuanceContext,
  workspace: MatriculaTecnicaFinanceiroWorkspace,
) => {
  const { saved, turmaId, alunoId, poloId } = context;
  const row = workspace.matriculas.find((item) => item.matriculaId === saved.matriculaId);
  if (!poloId || workspace.turma.turmaId !== turmaId || workspace.turma.poloId !== poloId
    || workspace.aluno?.alunoId !== alunoId || workspace.matriculas.length !== 1 || row?.alunoId !== alunoId) {
    throw new Error('O financeiro não confirmou a matrícula, o aluno e a unidade do recebimento.');
  }
  const cycle = row.cicloManual;
  const plan = cycle.planoEntrada;
  if (!isTransferEntrySnapshot(plan) || plan.requestId !== saved.requestId
    || !sameExternalTransferPlan(plan, saved.financeiro.financeiro)) {
    throw new Error('O plano financeiro mudou depois da conferência. Revise o Financeiro antes de emitir.');
  }
  if (!plan.itens.length) return null;
  const managerAllowsCreation = cycle.decisaoGestor?.opcoes.some((option) => option.cicloNumero === plan.cicloInicial
    && option.acao === 'CRIAR' && option.podeGerar);
  if (!cycle.habilitado || cycle.modo !== 'MANUAL' || cycle.estado !== 'ELEGIVEL' || !cycle.podeGerar
    || !managerAllowsCreation || cycle.financeiroMatricula?.matriculaId !== saved.matriculaId
    || cycle.financeiroMatricula.fontes.some((source) => source.origem === 'CONFLICT')
    || cycle.proximoCicloNumero !== plan.cicloInicial || cycle.cicloGerado
    || cycle.correcaoEmissao || cycle.conferenciaProesc?.necessaria || !cycle.primeiroVencimentoSugerido) {
    throw new Error(cycle.bloqueio?.mensagem || 'O ciclo inicial não está liberado para emissão. A transferência permanece salva.');
  }
  return { row, plan, cycleNumber: plan.cicloInicial, firstDueDate: cycle.primeiroVencimentoSugerido };
};

export const prepareExternalTransferIssuance = async (
  context: ExternalTransferIssuanceContext,
  loadWorkspace: (turmaId: string, alunoId: string) => Promise<MatriculaTecnicaFinanceiroWorkspace>,
  loadPreview: (input: PreviewCicloFinanceiroTecnicoManualInput) => Promise<PreviewCicloFinanceiroTecnicoManualResult>,
) => {
  const candidate = requireExternalTransferIssuanceRow(context, await loadWorkspace(context.turmaId, context.alunoId));
  if (!candidate) return null;
  const { row, plan, cycleNumber, firstDueDate } = candidate;
  const mode = cycleNumber === 1 && !plan.itens.some((item) => item.cicloNumero === 1 && item.tipo === 'MATRICULA')
    ? 'OMITIR' as const : 'BOLETO' as const;
  const result = await loadPreview({ turmaId: context.turmaId, matriculaId: context.saved.matriculaId,
    cicloNumero: cycleNumber, primeiroVencimento: firstDueDate,
    conferirProesc: row.cicloManual.conferenciaProesc?.necessaria === true,
    revisao: { modoMatricula: mode, emitirMatricula: mode === 'BOLETO', itens: [] } });
  const preview = result.preview;
  if (result.matriculaId !== context.saved.matriculaId || result.turmaId !== context.turmaId
    || result.cicloManual.estado !== 'ELEGIVEL' || !result.cicloManual.podeGerar
    || result.cicloManual.proximoCicloNumero !== cycleNumber
    || !result.cicloManual.decisaoGestor?.opcoes.some((option) => option.cicloNumero === cycleNumber
      && option.acao === 'CRIAR' && option.podeGerar)
    || !isTransferEntrySnapshot(result.cicloManual.planoEntrada)
    || result.cicloManual.planoEntrada.requestId !== context.saved.requestId
    || !sameExternalTransferPlan(result.cicloManual.planoEntrada, context.saved.financeiro.financeiro)
    || preview.cicloNumero !== cycleNumber || preview.modoMatricula !== mode
    || preview.sourceVencimento !== 'INDIVIDUAL' || preview.dataOrigem !== firstDueDate) {
    throw new Error('O servidor alterou o contexto da emissão. Confira o plano salvo no Financeiro.');
  }
  requireTransferSchedulePreview(plan, preview);
  const expected = plan.itens.filter((item) => item.cicloNumero === cycleNumber);
  if (preview.matriculaSemBoleto || preview.itens.length !== expected.length
    || preview.itens.some((item) => {
      const original = expected.find((entry) => entry.itemId === item.itemId);
      return !original || original.tipo !== item.tipo || original.vencimento !== item.vencimento
        || Number(original.valor) !== Number(item.valor)
        || Number(original.descontoPontualidade) !== Number(item.detalhesBoleto.desconto?.valor ?? '0')
        || Number(original.jurosAtrasoPercentual) !== Number(item.detalhesBoleto.juros?.percentualMes ?? '0')
        || Number(original.multaAtrasoPercentual) !== Number(item.detalhesBoleto.multa?.percentual ?? '0');
    })) throw new Error('A prévia diverge dos valores ou vencimentos aprovados na transferência.');
  return { ...candidate, preview };
};
