import type {
  TurmaTecnicoFormData,
  TurmaTecnicoIdentity,
  TurmaTecnicoStepId,
} from './turma-tecnico-form.types';

const isFiniteNumber = (value: number) => Number.isFinite(value);

export const validateTurmaTecnicoStep = (
  step: TurmaTecnicoStepId,
  formData: TurmaTecnicoFormData,
  identity: TurmaTecnicoIdentity,
): string | null => {
  if (step === 'TURMA') {
    if (!formData.cursoId) return 'Selecione o curso técnico.';
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

  if (step === 'INSCRICOES') {
    if (formData.aceitaConcomitante === false && formData.aceitaSubsequente === false) {
      return 'A turma deve aceitar ingresso concomitante, subsequente ou ambos.';
    }
    if (
      formData.permitirInscricoesOnline
      && formData.dataInicioInscricao
      && formData.dataFimInscricao
      && formData.dataFimInscricao < formData.dataInicioInscricao
    ) {
      return 'O fim das inscrições deve ser posterior ao início das inscrições.';
    }
  }

  if (step === 'FINANCEIRO') {
    if (!formData.primeiroVencimentoPadrao) {
      return 'Informe o primeiro vencimento financeiro da turma.';
    }
    if (!isFiniteNumber(formData.valorMatricula) || formData.valorMatricula < 0) {
      return 'O valor da matrícula não pode ser negativo.';
    }
    if (formData.cobrarMatricula && formData.valorMatricula <= 0) {
      return 'Informe um valor de matrícula maior que zero ou desative essa cobrança.';
    }
    if (!isFiniteNumber(formData.valorRematricula) || formData.valorRematricula < 0) {
      return 'O valor da rematrícula não pode ser negativo.';
    }
    if (formData.cobrarRematricula && formData.valorRematricula <= 0) {
      return 'Informe um valor de rematrícula maior que zero ou desative essa cobrança.';
    }
    if (!Number.isInteger(formData.qtdParcelas) || formData.qtdParcelas < 1 || formData.qtdParcelas > 60) {
      return 'A quantidade de mensalidades deve ficar entre 1 e 60.';
    }
    if (!isFiniteNumber(formData.valorParcela) || formData.valorParcela <= 0) {
      return 'Informe um valor de mensalidade maior que zero.';
    }
    if (!Number.isInteger(formData.diaVencimentoPadrao) || formData.diaVencimentoPadrao < 1 || formData.diaVencimentoPadrao > 31) {
      return 'O dia de vencimento deve ficar entre 1 e 31.';
    }
    if (!isFiniteNumber(formData.descontoPontualidade) || formData.descontoPontualidade < 0) {
      return 'O desconto de pontualidade não pode ser negativo.';
    }
    if (!isFiniteNumber(formData.jurosAtraso) || formData.jurosAtraso < 0 || formData.jurosAtraso > 100) {
      return 'Os juros mensais devem ficar entre 0% e 100%.';
    }
    if (!isFiniteNumber(formData.multaAtrasoPercentual) || formData.multaAtrasoPercentual < 0 || formData.multaAtrasoPercentual > 100) {
      return 'A multa única deve ficar entre 0% e 100%.';
    }
    const instructionLength = formData.instrucaoBoletoCarne.trim().length;
    if (instructionLength < 1 || instructionLength > 180) {
      return 'A instrução do boleto deve ter entre 1 e 180 caracteres.';
    }
    if (formData.origemFinanceira === 'LEGADO' && formData.gerarCobrancasFuturas) {
      return 'Turmas com histórico financeiro anterior não podem gerar novas cobranças automaticamente.';
    }
  }

  if (step === 'AUTORIZACAO') {
    if (
      formData.codigoCondicaoIndividual.length < 8
      || formData.codigoCondicaoIndividual.length > 32
      || !/[A-Za-z]/.test(formData.codigoCondicaoIndividual)
      || !/[0-9]/.test(formData.codigoCondicaoIndividual)
    ) {
      return 'Crie um código de 8 a 32 caracteres, com pelo menos uma letra e um número.';
    }
    if (formData.codigoCondicaoIndividual !== formData.confirmarCodigoCondicaoIndividual) {
      return 'A confirmação do código de autorização não confere.';
    }
  }

  if (step === 'REVISAO') {
    if (
      !isFiniteNumber(formData.frequenciaMinimaPercent)
      || formData.frequenciaMinimaPercent < 75
      || formData.frequenciaMinimaPercent > 100
    ) {
      return 'A frequência mínima deve ficar entre 75% e 100%.';
    }
    if (!isFiniteNumber(formData.mediaMinima) || formData.mediaMinima < 0 || formData.mediaMinima > 10) {
      return 'A média mínima deve ficar entre 0 e 10.';
    }
    if (!identity.nome || !identity.codigo) {
      return 'Os campos automáticos da turma não foram gerados.';
    }
  }

  return null;
};
