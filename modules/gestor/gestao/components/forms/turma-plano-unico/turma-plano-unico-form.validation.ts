import type {
  TurmaPlanoUnicoFormData,
  TurmaPlanoUnicoIdentity,
  TurmaPlanoUnicoStepId,
} from './turma-plano-unico-form.types';
const isFiniteNumber = (value: number) => Number.isFinite(value);

export const validateTurmaPlanoUnicoStep = (
  step: TurmaPlanoUnicoStepId,
  formData: TurmaPlanoUnicoFormData,
  identity: TurmaPlanoUnicoIdentity,
): string | null => {
  if (step === 'TURMA') {
    if (!formData.cursoId) return 'Selecione o curso da turma.';
    if (!formData.poloId) return 'Selecione o polo responsável pela turma.';
    if (!formData.dataInicio) return 'Informe a data de início.';
    if (!formData.dataPrevisaoTermino) return 'Informe a data prevista de término.';
    if (formData.dataPrevisaoTermino < formData.dataInicio) {
      return 'A data prevista de término deve ser posterior à data de início.';
    }
    if (!Number.isInteger(formData.vagasTotais) || formData.vagasTotais < 1) {
      return 'Informe pelo menos uma vaga para a turma.';
    }
    if (!identity.nome || !identity.codigo) {
      return 'Confira curso, polo, data de início e turno para gerar nome e código da turma.';
    }
  }

  if (step === 'PLANO_FINANCEIRO') {
    if (!isFiniteNumber(formData.valorTotal) || formData.valorTotal <= 0) {
      return 'Informe o valor total do curso.';
    }
    if (!Number.isInteger(formData.qtdParcelas) || formData.qtdParcelas < 1 || formData.qtdParcelas > 60) {
      return 'A quantidade de parcelas deve ficar entre 1 e 60.';
    }
    if (!formData.primeiroVencimento) {
      return 'Informe o primeiro vencimento das parcelas.';
    }
    if (!isFiniteNumber(formData.descontoPontualidade) || formData.descontoPontualidade < 0) {
      return 'O desconto de pontualidade não pode ser negativo.';
    }
    if (!isFiniteNumber(formData.jurosAtrasoPercentual) || formData.jurosAtrasoPercentual < 0 || formData.jurosAtrasoPercentual > 100) {
      return 'Os juros mensais devem ficar entre 0% e 100%.';
    }
    if (!isFiniteNumber(formData.multaAtraso) || formData.multaAtraso < 0) {
      return 'A multa por atraso não pode ser negativa.';
    }

  }

  if (step === 'REVISAO' && (!identity.nome || !identity.codigo)) {
    return 'Os campos automáticos da turma não foram gerados.';
  }

  return null;
};
