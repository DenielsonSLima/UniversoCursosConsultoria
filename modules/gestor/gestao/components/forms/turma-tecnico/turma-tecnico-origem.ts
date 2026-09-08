import type { TurmaTecnicoEstadoFinanceiroInicial, TurmaTecnicoFormData } from './turma-tecnico-form.types';

export const selectTurmaTecnicoOrigem = (
  state: TurmaTecnicoEstadoFinanceiroInicial,
): Partial<TurmaTecnicoFormData> => ({
  estadoFinanceiroInicial: state,
  origemFinanceira: state === 'NOVA' ? 'NORMAL' : 'LEGADO',
  financeiroHerdado: state !== 'NOVA',
  criterioElegibilidadeCiclo: state === 'IMPORTADA_CICLO_1'
    ? 'HISTORICO_EXTERNO' : 'PENULTIMA_SEM_ATRASO',
  gerarCobrancasFuturas: false,
  sincronizarAsaasFuturo: false,
  primeiroVencimentoPadrao: '',
  ...(state !== 'NOVA' ? {
    cobrarMatricula: false,
    exigeMatricula: false,
    valorMatricula: 0,
    aplicarDescontoMatricula: false,
    aplicarMultaJurosMatricula: false,
    publicarNoSite: false,
    permitirInscricoesOnline: false,
  } : {
    cobrarMatricula: true,
    exigeMatricula: true,
    valorMatricula: 150,
    aplicarDescontoMatricula: false,
    aplicarMultaJurosMatricula: false,
  }),
});
