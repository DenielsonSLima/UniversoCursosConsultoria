import React from 'react';
import type { CicloManualModoMatricula } from './matricula-tecnica-ciclo-manual.types';
import FinanceiroCicloManualEnrollmentOptions from './FinanceiroCicloManualEnrollmentOptions';

interface Props {
  cycleNumber: number | null;
  explicitSchedule: boolean;
  enrollmentAvailable: boolean;
  plannedEntry: boolean;
  installments: number | null;
  enrollmentMode: CicloManualModoMatricula | null;
  fetching: boolean;
  canSettleEnrollment: boolean;
  openSettlement: boolean;
  dateSource: 'TURMA' | 'INDIVIDUAL';
  individualDate: string;
  suggestedDate: string | null;
  onModeChange: (mode: CicloManualModoMatricula) => void;
  onOpenSettlementChange: (value: boolean) => void;
  onDateSourceChange: (value: 'TURMA' | 'INDIVIDUAL') => void;
  onDateChange: (value: string) => void;
}

const FinanceiroCicloManualSetupFields: React.FC<Props> = ({
  cycleNumber, explicitSchedule, enrollmentAvailable, plannedEntry, installments,
  enrollmentMode, fetching, canSettleEnrollment, openSettlement, dateSource,
  individualDate, suggestedDate, onModeChange, onOpenSettlementChange,
  onDateSourceChange, onDateChange,
}) => (
  <>
    {cycleNumber === 1 && enrollmentAvailable ? (
      <FinanceiroCicloManualEnrollmentOptions
        mode={enrollmentMode} disabled={fetching} canSettle={canSettleEnrollment}
        openSettlement={openSettlement} onModeChange={onModeChange}
        onOpenSettlementChange={onOpenSettlementChange}
      />
    ) : explicitSchedule && cycleNumber === 1 ? (
      <p className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs font-semibold text-blue-900">O plano recebido não inclui matrícula. Serão apresentadas apenas as cobranças registradas na transferência.</p>
    ) : null}

    {explicitSchedule || cycleNumber === 2 || plannedEntry ? (
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <p className="text-[10px] font-black uppercase tracking-wider text-blue-700">{explicitSchedule ? 'Cronograma definido na transferência' : plannedEntry ? 'Vencimento definido na transferência' : 'Data individual obrigatória no 2º ciclo'}</p>
        <p className="mt-2 text-xs font-semibold leading-relaxed text-blue-900">{explicitSchedule
          ? `Plano recebido: ${installments} mensalidades no ${cycleNumber}º ciclo. Confira cada valor e vencimento na próxima etapa. Alterar uma cobrança preserva as demais.`
          : plannedEntry
            ? `Plano de entrada: ${installments} mensalidades no ${cycleNumber}º ciclo. Confira a data e cada cobrança antes de emitir.`
            : 'A data será o vencimento da rematrícula — ou do primeiro item, se ela não for cobrada. Quando houver rematrícula, a mensalidade 1 vencerá no mês seguinte.'}</p>
      </div>
    ) : (
      <fieldset>
        <legend className="text-[10px] font-black uppercase tracking-wider text-slate-500">Vencimentos do aluno</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {([
            ['TURMA', 'Usar datas da turma', 'O sistema aplica o dia-base configurado.'],
            ['INDIVIDUAL', 'Definir primeira data', 'O sistema recalcula todo o cronograma.'],
          ] as const).map(([value, label, description]) => (
            <label key={value} className={`cursor-pointer rounded-2xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${dateSource === value ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'}`}>
              <input type="radio" name="manual-cycle-date-source" value={value} checked={dateSource === value} onChange={() => onDateSourceChange(value)} className="sr-only" />
              <span className="block text-xs font-black text-[#001a33]">{label}</span>
              <span className="mt-1 block text-[10px] font-semibold text-slate-500">{description}</span>
            </label>
          ))}
        </div>
      </fieldset>
    )}

    {!explicitSchedule && dateSource === 'INDIVIDUAL' ? (
      <label className="mt-4 block space-y-2">
        <span className="text-[10px] font-black uppercase text-slate-500">{cycleNumber === 2 ? 'Vencimento da rematrícula / primeiro item' : 'Primeiro vencimento individual'}</span>
        <input type="date" value={individualDate} onChange={(event) => onDateChange(event.target.value)} className="w-full rounded-xl border border-slate-200 p-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        {suggestedDate ? <span className="block text-[10px] font-semibold text-slate-500">{plannedEntry ? 'Data registrada no plano de entrada. Você pode revisar antes da emissão.' : 'Sugestão automática: um mês após o último boleto do ciclo anterior. Você pode alterar esta data.'}</span> : null}
      </label>
    ) : null}
  </>
);

export default FinanceiroCicloManualSetupFields;
