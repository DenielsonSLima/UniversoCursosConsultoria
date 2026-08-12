import React, { useMemo } from 'react';
import { CalendarDays, CheckCircle2, Layers3, MapPin, ReceiptText, Users2, WalletCards } from 'lucide-react';
import type { StatusTurma } from '../../../../gestao.types';
import type {
  TurmaPlanoUnicoCourseOption,
  TurmaPlanoUnicoFormConfig,
  TurmaPlanoUnicoFormData,
  TurmaPlanoUnicoIdentity,
  TurmaPlanoUnicoPoloOption,
} from '../turma-plano-unico-form.types';
import {
  buildInstallmentSchedule,
  formatCivilDate,
  formatCurrencyBRL,
  formatPercentageBR,
  getDiaVencimento,
  getPoloLabel,
} from '../turma-plano-unico-form.utils';

interface TurmaPlanoUnicoReviewStepProps {
  config: TurmaPlanoUnicoFormConfig;
  course?: TurmaPlanoUnicoCourseOption;
  formData: TurmaPlanoUnicoFormData;
  identity: TurmaPlanoUnicoIdentity;
  initialStatus: StatusTurma;
  polo?: TurmaPlanoUnicoPoloOption;
}

const TurmaPlanoUnicoReviewStep: React.FC<TurmaPlanoUnicoReviewStepProps> = ({ config, course, formData, identity, initialStatus, polo }) => {
  const schedule = useMemo(() => buildInstallmentSchedule(
    formData.valorTotal,
    formData.qtdParcelas,
    formData.primeiroVencimento,
  ), [formData.primeiroVencimento, formData.qtdParcelas, formData.valorTotal]);
  const firstInstallment = schedule[0];
  const lastInstallment = schedule.at(-1);
  const dueDay = getDiaVencimento(formData.primeiroVencimento);

  return (
    <section aria-labelledby="turma-plano-unico-review-title" className="space-y-6">
      <div>
        <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${config.theme.accentText}`}>Etapa 3</p>
        <h4 id="turma-plano-unico-review-title" className="mt-1 text-lg font-black uppercase tracking-tight text-[#001a33]">Revisão da nova turma</h4>
        <p className="mt-1 text-xs font-medium text-slate-500">Confira a identificação, a disponibilidade e o plano que será aplicado aos alunos desta turma.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex items-center gap-2"><CheckCircle2 size={17} className={config.theme.accentText} /><p className="text-xs font-black uppercase tracking-wide text-[#001a33]">Resumo da turma</p></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-white p-3"><p className="flex items-center gap-2 text-[9px] font-black uppercase text-slate-400"><Layers3 size={12} /> Curso</p><p className="mt-1 text-xs font-black text-[#001a33]">{course?.nome || '—'}</p></div>
          <div className="rounded-xl border border-slate-100 bg-white p-3"><p className="flex items-center gap-2 text-[9px] font-black uppercase text-slate-400"><MapPin size={12} /> Polo</p><p className="mt-1 text-xs font-black text-[#001a33]">{polo ? getPoloLabel(polo) : '—'}</p></div>
          <div className="rounded-xl border border-slate-100 bg-white p-3"><p className="flex items-center gap-2 text-[9px] font-black uppercase text-slate-400"><CalendarDays size={12} /> Período</p><p className="mt-1 text-xs font-black text-[#001a33]">{formatCivilDate(formData.dataInicio)} a {formatCivilDate(formData.dataPrevisaoTermino)}</p></div>
          <div className="rounded-xl border border-slate-100 bg-white p-3"><p className="flex items-center gap-2 text-[9px] font-black uppercase text-slate-400"><Users2 size={12} /> Capacidade</p><p className="mt-1 text-xs font-black text-[#001a33]">{formData.vagasTotais} vagas · {formData.turno.toLowerCase()}</p></div>
        </div>
        <div className="mt-3 rounded-xl border border-slate-100 bg-white p-3">
          <p className="text-[9px] font-black uppercase text-slate-400">Identificação automática</p>
          <p className="mt-1 text-sm font-black text-[#001a33]">{identity.nome || '—'}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2"><span className="rounded-lg bg-slate-100 px-2.5 py-1.5 font-mono text-[10px] font-black text-slate-700">{identity.codigo || '—'}</span><span className={`rounded-lg ${config.theme.accentSoftBg} px-2.5 py-1.5 text-[9px] font-black uppercase ${config.theme.accentSoftText}`}>{initialStatus.replaceAll('_', ' ')}</span></div>
        </div>
      </div>

      <div className={`rounded-2xl border ${config.theme.accentSoftBorder} ${config.theme.accentSoftBg} p-5`}>
        <div className="flex items-center gap-2"><WalletCards size={17} className={config.theme.accentText} /><p className="text-xs font-black uppercase tracking-wide text-[#001a33]">Plano financeiro único</p></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-white p-3"><p className="text-[9px] font-black uppercase text-slate-400">Valor total</p><p className="mt-1 text-sm font-black text-[#001a33]">{formatCurrencyBRL(formData.valorTotal)}</p></div>
          <div className="rounded-xl bg-white p-3"><p className="flex items-center gap-2 text-[9px] font-black uppercase text-slate-400"><ReceiptText size={12} /> Parcelamento</p><p className="mt-1 text-sm font-black text-[#001a33]">{formData.qtdParcelas} parcela{formData.qtdParcelas === 1 ? '' : 's'}</p></div>
          <div className="rounded-xl bg-white p-3"><p className="text-[9px] font-black uppercase text-slate-400">Primeiro vencimento</p><p className="mt-1 text-sm font-black text-[#001a33]">{formatCivilDate(formData.primeiroVencimento)}</p><p className="mt-1 text-[9px] font-semibold text-slate-400">Depois, dia {dueDay ? String(dueDay).padStart(2, '0') : '—'}</p></div>
          <div className="rounded-xl bg-white p-3"><p className="text-[9px] font-black uppercase text-slate-400">Última parcela</p><p className="mt-1 text-sm font-black text-[#001a33]">{lastInstallment ? formatCurrencyBRL(lastInstallment.valor) : '—'}</p><p className="mt-1 text-[9px] font-semibold text-slate-400">{lastInstallment ? formatCivilDate(lastInstallment.vencimento) : ''}</p></div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3"><p className="text-[9px] font-black uppercase text-emerald-700">Desconto por parcela</p><p className="mt-1 text-xs font-black text-emerald-800">{formatCurrencyBRL(formData.descontoPontualidade)}</p></div>
          <div className="rounded-xl border border-rose-100 bg-rose-50 p-3"><p className="text-[9px] font-black uppercase text-rose-600">Juros por parcela</p><p className="mt-1 text-xs font-black text-rose-700">{formatPercentageBR(formData.jurosAtrasoPercentual)}% ao mês</p></div>
          <div className="rounded-xl border border-rose-100 bg-rose-50 p-3"><p className="text-[9px] font-black uppercase text-rose-600">Multa por parcela</p><p className="mt-1 text-xs font-black text-rose-700">{formatCurrencyBRL(formData.multaAtraso)}</p></div>
        </div>
        <p className={`mt-3 rounded-xl border ${config.theme.accentSoftBorder} bg-white px-3 py-2.5 text-[10px] font-semibold leading-relaxed ${config.theme.accentSoftText}`}>Ao incluir um aluno, esta configuração será exibida para conferência e as {formData.qtdParcelas} parcela{formData.qtdParcelas === 1 ? '' : 's'} serão geradas a partir do valor total da turma.</p>
        {firstInstallment ? <p className="mt-3 text-[10px] font-medium text-slate-500">Primeira parcela prevista: <span className="font-black text-[#001a33]">{formatCurrencyBRL(firstInstallment.valor)} em {formatCivilDate(firstInstallment.vencimento)}</span>.</p> : null}
      </div>
    </section>
  );
};

export default TurmaPlanoUnicoReviewStep;
