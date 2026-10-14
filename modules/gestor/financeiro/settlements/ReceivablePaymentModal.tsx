import React from 'react';
import type { ContasReceber, ContaBancaria } from '../financeiro.types';
import ManualSettlementModal from '../receber/components/manual-settlement/ManualSettlementModal';
import type { ManualSettlementPayload } from '../receber/components/manual-settlement/useManualSettlementForm';
import { FinancialPaymentModal } from './FinancialPaymentModal';
import type { FinancialPaymentConfirmation, FinancialPaymentResult } from './financial-payment.types';
import { usesLegacyFullSettlement } from './financial-payment.routing';

type Props = {
  item: ContasReceber; accounts: ContaBancaria[]; initialAccountId?: string; readOnly?: boolean;
  legacyPending: boolean; legacyError: unknown; onClose: () => void;
  onLegacyConfirm: (payload: ManualSettlementPayload) => void;
  onConfirm: (payload: FinancialPaymentConfirmation) => Promise<FinancialPaymentResult>;
};

export const ReceivablePaymentModal: React.FC<Props> = props => {
  if (usesLegacyFullSettlement(props.item)) return <ManualSettlementModal receivable={props.item}
    accounts={props.accounts} initialAccountId={props.initialAccountId} pending={props.legacyPending}
    error={props.legacyError instanceof Error ? props.legacyError.message : null}
    onClose={props.onClose} onConfirm={props.onLegacyConfirm} />;
  return <FinancialPaymentModal sourceKind="RECEIVABLE" sourceId={props.item.id!} poloId={props.item.poloId}
    description={props.item.descricao} partnerName={props.item.clienteNome} readOnly={props.readOnly}
    accounts={props.accounts} initialAccountId={props.initialAccountId} onClose={props.onClose} onConfirm={props.onConfirm} />;
};
