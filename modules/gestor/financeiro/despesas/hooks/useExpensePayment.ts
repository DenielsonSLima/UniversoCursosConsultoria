import { useMutation } from '@tanstack/react-query';
import { despesasService, type DespesaBaixaParams, type DespesaLancamento } from '../despesas.service';
import { paymentMoneyLabel } from '../../settlements/financial-payment.form';

export function useExpensePayment(item: DespesaLancamento | null, refresh: () => Promise<void>, close: () => void,
  toast: { success: (title: string, message: string) => void; error: (title: string, message: string) => void }) {
  return useMutation({
    mutationFn: (payload: DespesaBaixaParams) => despesasService.markDespesaPaga(item!.id, payload),
    onSuccess: async result => {
      await refresh();
      toast.success(result.preview.status === 'PAGO' ? 'Pagamento confirmado' : 'Pagamento parcial registrado',
        `Pago: ${paymentMoneyLabel(result.preview.paymentAmount)}. Saldo restante: ${paymentMoneyLabel(result.preview.remainingAfter)}.`);
      close();
    },
    onError: (error: Error) => toast.error('Erro ao registrar pagamento', error.message),
  });
}
