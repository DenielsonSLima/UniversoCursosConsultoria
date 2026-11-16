import { useMutation } from '@tanstack/react-query';
import { despesasService, type DespesaBaixaParams, type DespesaLancamento } from '../despesas.service';
import { paymentMoneyLabel } from '../../settlements/financial-payment.form';
import { FinancialPaymentError } from '../../settlements/financial-payment.service';
import { confirmEstimatedExpensePayment, hasExpenseEstimatePayment } from '../despesas-estimativas-pagamento.service';

export function useExpensePayment(item: DespesaLancamento | null, refresh: () => Promise<void>, close: () => void,
  toast: { success: (title: string, message: string) => void; error: (title: string, message: string) => void }) {
  return useMutation({
    mutationFn: (payload: DespesaBaixaParams) => {
      if (!item || payload.input.sourceId !== item.id) throw new Error('A despesa mudou. Abra novamente o lançamento.');
      return hasExpenseEstimatePayment(payload.input)
        ? confirmEstimatedExpensePayment(payload)
        : despesasService.markDespesaPaga(item.id, payload);
    },
    onSuccess: async result => {
      await refresh();
      toast.success(result.preview.status === 'PAGO' ? 'Pagamento confirmado' : 'Pagamento parcial registrado',
        `Pago: ${paymentMoneyLabel(result.preview.paymentAmount)}. Saldo restante: ${paymentMoneyLabel(result.preview.remainingAfter)}.`);
      close();
    },
    onError: async (error: Error, payload) => {
      if (hasExpenseEstimatePayment(payload.input) && error instanceof FinancialPaymentError && error.safeToEdit) await refresh();
      toast.error('Erro ao registrar pagamento', error.message);
    },
  });
}
