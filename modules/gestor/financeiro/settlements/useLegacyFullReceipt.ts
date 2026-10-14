import { useMutation } from '@tanstack/react-query';
import { financeiroService, type ContasReceber } from '../financeiro.service';
import type { ManualSettlementPayload } from '../receber/components/manual-settlement/useManualSettlementForm';
import { usesLegacyFullSettlement } from './financial-payment.routing';

export function useLegacyFullReceipt(item: ContasReceber | null, afterConfirmed: () => Promise<void>,
  toast: { success: (title: string, message: string) => void; error: (title: string, message: string) => void }) {
  return useMutation({
    mutationFn: (payload: ManualSettlementPayload) => {
      if (!item?.id || !usesLegacyFullSettlement(item)) throw new Error('A baixa integral não está disponível para este título. Abra o lançamento novamente.');
      return financeiroService.markReceivablePaid(item.id, payload);
    },
    onSuccess: async result => {
      await afterConfirmed();
      toast.success('Recebimento confirmado', result.futureSyncWarning
        ? `Baixa registrada. Atenção na sincronização futura: ${result.futureSyncWarning}`
        : result.gatewayCanceled ? 'A baixa integral foi registrada após a confirmação de cancelamento da cobrança bancária.'
          : 'A baixa integral foi registrada na conta selecionada.');
    },
    onError: (error: Error) => toast.error('Erro ao confirmar recebimento', error.message),
  });
}
