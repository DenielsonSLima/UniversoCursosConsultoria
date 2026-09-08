import type { TurmaTecnicoEstadoFinanceiroInicial, TurmaTecnicoFormData } from './turma-tecnico-form.types';
import { TURMA_TECNICO_FINANCIAL_DEFAULTS } from './turma-tecnico-form.constants';

export const selectTurmaTecnicoOrigem = (
  state: TurmaTecnicoEstadoFinanceiroInicial,
): Partial<TurmaTecnicoFormData> => ({
  // Hidden reference fields still pass the server's canonical financial validator.
  ...(state === 'IMPORTADA_CONCLUIDA' ? TURMA_TECNICO_FINANCIAL_DEFAULTS : {}),
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
