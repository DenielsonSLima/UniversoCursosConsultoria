import React from 'react';
import { AlertCircle, Clock3, Loader2, ReceiptText, RefreshCw } from 'lucide-react';
import { formatCurrencyBRL, formatDateBR } from '../formatters';
import type { PendenciaPlanoFinanceiroUnico } from '../types';

interface PendenciasPlanoFinanceiroUnicoPanelProps {
  items: PendenciaPlanoFinanceiroUnico[];
  loading: boolean;
  error: boolean;
  retrying: boolean;
  onRetry: () => void;
  onOpen: (item: PendenciaPlanoFinanceiroUnico) => void;
}

const PendenciasPlanoFinanceiroUnicoPanel: React.FC<PendenciasPlanoFinanceiroUnicoPanelProps> = ({
  items,
  loading,
  error,
  retrying,
  onRetry,
  onOpen,
}) => {
  if (loading) return <div className="mb-6 flex items-center rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-bold text-blue-700"><Loader2 size={16} className="mr-2 animate-spin" /> Consultando vínculos sem financeiro...</div>;
  if (error) return <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-xs font-semibold text-rose-700 sm:flex-row sm:items-center sm:justify-between"><span><AlertCircle size={16} className="mr-2 inline" />As pendências financeiras não foram carregadas.</span><button type="button" onClick={onRetry} disabled={retrying} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-[10px] font-black uppercase disabled:opacity-50"><RefreshCw size={13} className={retrying ? 'animate-spin' : ''} /> Recarregar</button></div>;
  if (items.length === 0) return null;

  return (
    <section className="mb-6 overflow-hidden rounded-[2rem] border border-amber-200 bg-amber-50/50">
      <header className="flex items-center gap-3 border-b border-amber-100 px-5 py-4">
        <span className="rounded-xl bg-amber-100 p-2 text-amber-700"><Clock3 size={18} /></span>
        <div><h4 className="text-sm font-black text-amber-950">Financeiro para gerar depois</h4><p className="text-[11px] font-semibold text-amber-700">{items.length} aluno{items.length === 1 ? '' : 's'} vinculado{items.length === 1 ? '' : 's'} sem títulos locais.</p></div>
      </header>
      <div className="divide-y divide-amber-100">{items.map((item) => (
        <article key={item.matricula.id} className="grid gap-3 bg-white/80 px-5 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
          <div><p className="text-sm font-black text-[#001a33]">{item.aluno.nome}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{item.regra.origem === 'PERSONALIZAR' ? 'Condição individual' : 'Regra da turma'} · {item.regra.qtdParcelas} boleto{item.regra.qtdParcelas === 1 ? '' : 's'}</p></div>
          <div className="text-left sm:text-right"><p className="text-sm font-black text-[#001a33]">{formatCurrencyBRL(item.regra.valorTotalEfetivo)}</p><p className="text-[10px] font-semibold uppercase text-slate-400">1º venc. {formatDateBR(item.regra.primeiroVencimento)}</p></div>
          <button type="button" onClick={() => onOpen(item)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-white"><ReceiptText size={14} /> Revisar e gerar</button>
        </article>
      ))}</div>
    </section>
  );
};

export default PendenciasPlanoFinanceiroUnicoPanel;
