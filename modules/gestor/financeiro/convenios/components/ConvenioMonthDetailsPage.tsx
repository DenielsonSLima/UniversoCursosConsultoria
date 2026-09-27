import React from 'react';
import {
  ArrowLeft,
  CalendarDays,
  CircleDollarSign,
  HandCoins,
  Landmark,
  Loader2,
  LockKeyhole,
  ReceiptText,
  WalletCards,
} from 'lucide-react';
import type { ConvenioFinanceiroMes, ConvenioMesDetalhe, ConvenioMovimento } from '../convenios.types';
import {
  convenioStatusClass,
  convenioStatusLabel,
  formatConvenioCompetencia,
  formatConvenioCurrency,
  formatConvenioDate,
  movimentoStatusLabel,
  movimentoTipoLabel,
} from '../convenios.presentation';

interface ConvenioMonthDetailsPageProps {
  mesFallback: ConvenioFinanceiroMes;
  detail?: ConvenioMesDetalhe;
  isLoading: boolean;
  error?: Error | null;
  onBack: () => void;
  onCredit: (mes: ConvenioFinanceiroMes) => void;
  onCloseMonth: (mes: ConvenioFinanceiroMes) => void;
  onRetry: () => void;
}

const movementTone = (movement: ConvenioMovimento) => {
  if (movement.status === 'CANCELADO' || movement.status === 'ESTORNADO') return 'bg-slate-100 text-slate-500';
  if (movement.tipo === 'CREDITO') return 'bg-emerald-50 text-emerald-700';
  if (movement.tipo === 'DESPESA') return movement.status === 'PAGO' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700';
  return 'bg-cyan-50 text-cyan-800';
};

const ConvenioMonthDetailsPage: React.FC<ConvenioMonthDetailsPageProps> = ({
  mesFallback,
  detail,
  isLoading,
  error,
  onBack,
  onCredit,
  onCloseMonth,
  onRetry,
}) => {
  const mes = detail?.mes || mesFallback;
  const kpis = [
    ['Saldo inicial', mes.saldoInicial, Landmark],
    ['Créditos', mes.creditos, HandCoins],
    ['Despesas pagas', mes.despesasPagas, ReceiptText],
    ['Comprometido', mes.despesasPendentes, CircleDollarSign],
    ['Saldo disponível', mes.saldoDisponivel, WalletCards],
    ['Saldo projetado', mes.saldoProjetado, WalletCards],
  ] as const;

  return (
    <div className="space-y-5 animate-fadeIn">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-2 text-xs font-black uppercase tracking-wide text-cyan-800 hover:text-cyan-950"><ArrowLeft size={15} /> Voltar aos convênios</button>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-2xl font-black uppercase tracking-tight text-[#001a33]">{mes.nome}</h3>
            <span className={`rounded-lg border px-2 py-1 text-[9px] font-black uppercase tracking-wider ${convenioStatusClass(mes.status)}`}>{convenioStatusLabel(mes.status)}</span>
          </div>
          <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-500"><CalendarDays size={15} className="text-cyan-700" /> {formatConvenioCompetencia(mes.competencia)} · {mes.poloNome}</p>
          {mes.parceiroNome ? <p className="mt-1 text-xs font-medium text-slate-400">Parceiro: {mes.parceiroNome}</p> : null}
        </div>
        {mes.status === 'ABERTO' ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onCredit(mes)} className="inline-flex items-center gap-2 rounded-2xl bg-cyan-700 px-4 py-3 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-cyan-950/15 hover:bg-cyan-800"><HandCoins size={16} /> Lançar crédito</button>
            <button type="button" onClick={() => onCloseMonth(mes)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-700 hover:bg-slate-50"><LockKeyhole size={16} /> Finalizar mês</button>
          </div>
        ) : null}
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map(([label, value, Icon]) => (
          <div key={label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-50 text-cyan-800"><Icon size={16} /></span>
            <p className="mt-3 text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
            <p className={`mt-1 text-base font-black ${label === 'Saldo projetado' && value < 0 ? 'text-rose-700' : 'text-[#001a33]'}`}>{formatConvenioCurrency(value)}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h4 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Extrato da competência</h4>
          <p className="mt-1 text-xs font-medium text-slate-500">Créditos reais, despesas vinculadas e saldo de abertura devolvidos pelo backend.</p>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm font-bold text-slate-400"><Loader2 size={18} className="animate-spin" /> Carregando extrato...</div>
        ) : error ? (
          <div className="p-6 text-center"><p className="text-sm font-bold text-rose-700">{error.message || 'Não foi possível carregar o extrato.'}</p><button type="button" onClick={onRetry} className="mt-3 rounded-xl border border-rose-200 px-4 py-2 text-xs font-black uppercase text-rose-700">Tentar novamente</button></div>
        ) : detail && detail.movimentos.length > 0 ? (
          <div className="divide-y divide-slate-50">
            {detail.movimentos.map((movement) => (
              <div key={movement.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${movementTone(movement)}`}>{movement.tipo === 'CREDITO' ? <HandCoins size={16} /> : movement.tipo === 'DESPESA' ? <ReceiptText size={16} /> : <WalletCards size={16} />}</span>
                  <div className="min-w-0"><p className="truncate text-sm font-black text-[#001a33]">{movement.descricao}</p><p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{movimentoTipoLabel(movement.tipo)} · {movimentoStatusLabel(movement.status)} · {formatConvenioDate(movement.data)}</p>{movement.contaNome ? <p className="mt-1 truncate text-xs font-medium text-slate-500">Conta: {movement.contaNome}</p> : null}{movement.observacao ? <p className="mt-1 text-xs text-slate-500">{movement.observacao}</p> : null}</div>
                </div>
                <strong className={`shrink-0 text-sm font-black ${movement.tipo === 'CREDITO' ? 'text-emerald-700' : movement.tipo === 'DESPESA' ? 'text-rose-700' : 'text-[#001a33]'}`}>{movement.tipo === 'DESPESA' ? '− ' : movement.tipo === 'CREDITO' ? '+ ' : ''}{formatConvenioCurrency(movement.valor)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-16 text-center text-sm font-bold text-slate-400">Nenhum movimento registrado nesta competência.</div>
        )}
      </section>
    </div>
  );
};

export default ConvenioMonthDetailsPage;
