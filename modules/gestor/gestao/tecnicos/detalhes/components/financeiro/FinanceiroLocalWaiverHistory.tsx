import React from 'react';
import { isProvenWaivedLocalEnrollment } from './matricula-tecnica-ciclo-manual-destination';
import type { MatriculaTecnicaCicloManual } from './matricula-tecnica-ciclo-manual.types';
const money = (value: string) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export default function FinanceiroLocalWaiverHistory({ cicloManual }: { cicloManual: MatriculaTecnicaCicloManual }) {
  const local = cicloManual.matriculaLocal;
  if (!local || !isProvenWaivedLocalEnrollment(local)) return null;
  return <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs" role="note">
    <p className="font-bold">Matrícula local dispensada: {money(local.valor)}</p>
    {cicloManual.cicloGerado?.activeTotal !== undefined && <p>
      {cicloManual.cicloGerado.numero}º ciclo: total histórico {money(cicloManual.cicloGerado.total)};
      {' '}total nominal ativo {money(cicloManual.cicloGerado.activeTotal)}.
    </p>}
    <p>Registro cancelado preservado no histórico. Não representa pagamento, estorno ou novo boleto.</p>
  </div>;
}
