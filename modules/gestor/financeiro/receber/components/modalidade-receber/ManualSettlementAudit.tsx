import React from 'react';
import type { ContasReceber } from '../../../financeiro.types';
import { paymentOriginLabel } from './modalidade-receber.utils';

export const ManualSettlementAudit: React.FC<{ item: ContasReceber }> = ({ item }) => {
  if (item.status !== 'PAGO' || !(
    item.manualSettlementCompletedAt
    || item.manualSettlementActorName
    || paymentOriginLabel(item).startsWith('Manual')
  )) return null;

  const completedAt = item.manualSettlementCompletedAt
    ? new Date(item.manualSettlementCompletedAt)
    : null;
  const formattedTime = completedAt && Number.isFinite(completedAt.getTime())
    ? new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Maceio',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(completedAt)
    : null;

  return (
    <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-[10px] font-bold text-slate-500">
      <p className="break-words">Baixa por: {item.manualSettlementActorName?.trim() || 'Usuário não registrado'}</p>
      <p title="Data e hora em que a baixa manual foi concluída, no horário de Brasília (Maceió).">
        {formattedTime ? `Registrada em: ${formattedTime}` : 'Data e hora da baixa não registradas'}
      </p>
    </div>
  );
};
