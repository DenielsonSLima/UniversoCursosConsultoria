import { hasRepairableOnlineInscriptionIdentity } from '../gateways/online-inscription.ts';
import { activateEnrollmentAfterPayment, syncOnlineInscriptionPayment } from '../gateways/webhook/domain/ead-enrollment.ts';
export async function completeAcademicProjection(admin: any, receivableId: string, result: any) {
  if (result?.preview?.status !== 'PAGO' || result.preview.remainingAfter !== '0.00') return result;
  try {
    const { data: row, error } = await admin.from('contas_receber').select('*').eq('id', receivableId).single();
    if (error || row?.status !== 'PAGO') throw new Error('PAYMENT_NOT_SETTLED');
    if (hasRepairableOnlineInscriptionIdentity(row)) {
      await syncOnlineInscriptionPayment({ admin } as any, {
        receivable: row, gatewayProvider: row.gateway_provider || 'local',
        environment: row.gateway_environment, paymentId: row.gateway_payment_id || null,
        paymentLinkId: row.gateway_payment_link_id || null, localStatus: 'PAGO',
        legacyPaymentMethod: row.forma_pagamento, pendingStatus: 'AGUARDANDO_PAGAMENTO',
      });
    }
    await activateEnrollmentAfterPayment({ admin } as any, row);
    return { ...result, academicSyncWarning: null };
  } catch {
    return { ...result, academicSyncWarning: 'Recebimento concluído. A atualização acadêmica está pendente; retome a mesma solicitação.' };
  }
}
