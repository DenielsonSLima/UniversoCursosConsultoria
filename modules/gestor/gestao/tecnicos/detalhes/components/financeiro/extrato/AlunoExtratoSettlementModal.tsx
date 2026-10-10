import React from 'react';
import ManualSettlementModal from '../../../../../../financeiro/receber/components/manual-settlement/ManualSettlementModal';
import type { AlunoExtratoSettlement } from './useAlunoExtratoSettlement';

const AlunoExtratoSettlementModal: React.FC<{ controller: AlunoExtratoSettlement }> = ({ controller }) => {
  if (!controller.selected) return null;
  return (
    <ManualSettlementModal
      key={controller.selected.id}
      receivable={controller.selected}
      accounts={controller.accounts}
      enrollmentNotice="O recebimento segue as mesmas regras do módulo Financeiro."
      pending={controller.pending}
      submitDisabled={controller.submitDisabled}
      error={controller.error}
      onClose={controller.close}
      onConfirm={controller.confirm}
    />
  );
};

export default AlunoExtratoSettlementModal;
