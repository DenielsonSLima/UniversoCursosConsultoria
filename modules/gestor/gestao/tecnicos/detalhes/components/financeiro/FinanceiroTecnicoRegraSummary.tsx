import React from 'react';
import { CalendarDays, Fingerprint, ReceiptText } from 'lucide-react';
import type { MatriculaTecnicaRegra } from './matricula-tecnica-financeiro.types';

const formatMoney = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parsed)
    : value;
};

const CYCLE_LABELS = {
  MATRICULA: 'Matrícula',
  MENSALIDADE: 'Mensalidade',
  REMATRICULA: 'Rematrícula',
} as const;

const FinanceiroTecnicoRegraSummary: React.FC<{ regra: MatriculaTecnicaRegra }> = ({ regra }) => (
  <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm" aria-labelledby="regra-financeira-title">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Fonte oficial da turma</p>
        <h3 id="regra-financeira-title" className="mt-1 text-lg font-black text-[#001a33]">Regra financeira vigente</h3>
        <p className="mt-1 text-xs font-semibold text-slate-500">Valores, ciclo e vencimentos são somente leitura; o servidor valida toda geração.</p>
      </div>
      <span className="inline-flex items-center gap-2 self-start rounded-full bg-slate-100 px-3 py-1.5 text-[9px] font-black uppercase text-slate-600">
        <Fingerprint size={13} /> Revisão {regra.revisao}
      </span>
    </div>

    <div className="mt-5 grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><span className="text-[9px] font-black uppercase text-emerald-600">Matrícula</span><p className="mt-1 text-xl font-black text-emerald-900">{formatMoney(regra.valorMatricula)}</p></div>
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4"><span className="text-[9px] font-black uppercase text-blue-600">Mensalidade</span><p className="mt-1 text-xl font-black text-blue-900">{formatMoney(regra.valorMensalidade)}</p></div>
      <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4"><span className="text-[9px] font-black uppercase text-violet-600">Rematrícula</span><p className="mt-1 text-xl font-black text-violet-900">{formatMoney(regra.valorRematricula)}</p></div>
    </div>

    <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <ReceiptText size={16} className="text-slate-500" />
        {regra.ciclo.map((item) => (
          <span key={item.tipo} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase text-slate-600">
            {item.quantidade}× {CYCLE_LABELS[item.tipo]}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600">
        <CalendarDays size={17} className="text-blue-600" />
        <span>Dia-base {regra.diaVencimento}<small className="block font-semibold text-slate-400">Sugestão: {regra.primeiroVencimentoSugerido}</small></span>
      </div>
    </div>
  </section>
);

export default FinanceiroTecnicoRegraSummary;

