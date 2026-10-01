import type {
  CicloFinanceiroTecnicoManualPreview,
  CicloFinanceiroTecnicoManualRevisao,
} from './matricula-tecnica-ciclo-manual.types';

export type CicloManualOnConfirm = (
  preview: CicloFinanceiroTecnicoManualPreview,
  primeiroVencimento: string | null,
  revisao: CicloFinanceiroTecnicoManualRevisao,
  abrirRecebimento: boolean,
) => Promise<void>;

interface StartCicloManualIssuanceInput {
  canSettleEnrollment: boolean;
  externalHistory: boolean;
  externalHistoryConfirmed: boolean;
  firstDueDate: string | null;
  issuanceStarted: { current: boolean };
  onConfirm: CicloManualOnConfirm;
  openSettlement: boolean;
  positiveAmounts: boolean;
  preview: CicloFinanceiroTecnicoManualPreview | undefined;
  previewReady: boolean;
  setIssuanceSnapshot: (preview: CicloFinanceiroTecnicoManualPreview) => void;
}

export const revisionFromPreview = (
  preview: CicloFinanceiroTecnicoManualPreview,
): CicloFinanceiroTecnicoManualRevisao => ({
  modoMatricula: preview.modoMatricula ?? (preview.matriculaSemBoleto ? 'OMITIR' : 'BOLETO'),
  emitirMatricula: (preview.modoMatricula ?? (preview.matriculaSemBoleto ? 'OMITIR' : 'BOLETO')) === 'BOLETO',
  itens: [...preview.itens, ...(preview.matriculaSemBoleto ? [preview.matriculaSemBoleto] : [])].map((item) => ({
    chave: item.chave,
    valor: item.valor,
    vencimento: item.vencimento,
    descontoPontualidade: item.detalhesBoleto.desconto?.valor ?? '0',
    jurosAtrasoPercentual: item.detalhesBoleto.juros?.percentualMes ?? '0',
    multaAtrasoPercentual: item.detalhesBoleto.multa?.percentual ?? '0',
  })),
});

export const startCicloManualIssuance = ({
  canSettleEnrollment,
  externalHistory,
  externalHistoryConfirmed,
  firstDueDate,
  issuanceStarted,
  onConfirm,
  openSettlement,
  positiveAmounts,
  preview,
  previewReady,
  setIssuanceSnapshot,
}: StartCicloManualIssuanceInput): Promise<void> | null => {
  if (externalHistory && !externalHistoryConfirmed) return null;
  if (!preview || !previewReady || !positiveAmounts || issuanceStarted.current) return null;
  const confirmedRevision = revisionFromPreview(preview);
  issuanceStarted.current = true;
  return (async () => {
    try {
      setIssuanceSnapshot(preview);
      await onConfirm(
        preview,
        firstDueDate,
        confirmedRevision,
        canSettleEnrollment && preview.modoMatricula === 'REGISTRO_SEM_BOLETO' && openSettlement,
      );
    } finally {
      issuanceStarted.current = false;
    }
  })();
};
