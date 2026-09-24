import React from 'react';
import { createPortal } from 'react-dom';
import ManualSettlementModal from '../../../../../financeiro/receber/components/manual-settlement/ManualSettlementModal';
import type { CicloManualEnrollmentSettlement } from './hooks/useCicloManualEnrollmentSettlement';

const FinanceiroCicloManualSettlement: React.FC<{ controller: CicloManualEnrollmentSettlement }> = ({ controller }) => {
  if (!controller.selected || typeof document === 'undefined') return null;
  return createPortal(
    <ManualSettlementModal
      key={controller.selected.id}
      receivable={controller.selected}
      accounts={controller.accounts}
      enrollmentNotice="O ciclo já foi criado. Esta ação confirma somente o recebimento da matrícula, sem gerar boleto ou novas mensalidades."
      pending={controller.pending}
      submitDisabled={controller.accountsLoading || controller.accounts.length === 0}
      error={controller.error}
      onClose={controller.close}
      onConfirm={controller.confirm}
    />,
    document.body,
  );
};

export default FinanceiroCicloManualSettlement;
