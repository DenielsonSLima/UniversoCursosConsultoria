import React from 'react';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileOutput,
  Landmark,
  ReceiptText,
  RotateCcw,
  Trash2,
  UsersRound,
} from 'lucide-react';

import type { EmprestimoFinanceiro, EmprestimoParcela } from '../emprestimos.types';
import {
  emprestimoStatusClass,
  emprestimoStatusLabel,
  formatEmprestimoContaCredito,
  formatEmprestimoCurrency,
  formatEmprestimoDate,
} from '../emprestimos.presentation';

interface EmprestimoDetailsPageProps {
  emprestimo: EmprestimoFinanceiro;
  canSettle: boolean;
  onBack: () => void;
  onSettle: (parcela?: EmprestimoParcela) => void;
  onLifecycle: () => void;
  onExport: () => void;
}

const formatCanonicalCurrency = (value?: number) => (
  value === undefined ? '—' : formatEmprestimoCurrency(value)
);

const hasSettlementAdjustment = (parcela: EmprestimoParcela) => Boolean(
  parcela.jurosValor
  || parcela.multaValor
  || parcela.descontoValor
  || parcela.observacaoBaixa,
);

const EmprestimoDetailsPage: React.FC<EmprestimoDetailsPageProps> = ({
  emprestimo,
  canSettle,
  onBack,
  onSettle,
  onLifecycle,
  onExport,
}) => {
  const isCancelled = emprestimo.status === 'CANCELADO';

  return (
    <section className="space-y-6 animate-fadeIn">
      <header className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <button type="button" onClick={onBack} className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50" aria-label="Voltar para empréstimos"><ArrowLeft size={18} /></button>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600"><Landmark size={14} /> {emprestimo.rateioModo === 'SEM_RATEIO' ? 'Empréstimo próprio do polo' : 'Empréstimo centralizado com rateio'}</p>
            <h2 className="mt-1 break-words text-2xl font-black uppercase tracking-tight text-[#001a33]">{emprestimo.descricao}</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Credor: {emprestimo.credorNome || 'Não informado'}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <span className={`inline-flex rounded-lg border px-3 py-2 text-[10px] font-black uppercase tracking-wider ${emprestimoStatusClass(emprestimo.status)}`}>{emprestimoStatusLabel(emprestimo.status)}</span>
          <button type="button" onClick={onExport} className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-indigo-700 transition-colors hover:bg-indigo-50">
            <FileOutput size={14} /> Exportar PDF
          </button>
          {!isCancelled && (
            <button type="button" onClick={onLifecycle} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-rose-700 transition-colors hover:bg-rose-50">
              {emprestimo.possuiBaixa ? <RotateCcw size={14} /> : <Trash2 size={14} />}
              {emprestimo.possuiBaixa ? 'Estornar' : 'Excluir'}
            </button>
          )}
          {canSettle && !isCancelled && (
            <button type="button" onClick={() => onSettle()} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-wide text-white transition-colors hover:bg-indigo-700"><CheckCircle2 size={14} /> Dar baixa</button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: 'Crédito liberado', value: formatEmprestimoCurrency(emprestimo.valorLiberado), icon: CircleDollarSign, tone: 'text-emerald-600 bg-emerald-50' },
          { label: 'Total da dívida', value: formatEmprestimoCurrency(emprestimo.valorTotalDivida), icon: ReceiptText, tone: 'text-indigo-600 bg-indigo-50' },
          { label: 'Valor já pago', value: formatCanonicalCurrency(emprestimo.valorPago), icon: CheckCircle2, tone: 'text-emerald-600 bg-emerald-50' },
          { label: 'Saldo pendente', value: formatCanonicalCurrency(emprestimo.valorPendente), icon: CircleDollarSign, tone: 'text-amber-600 bg-amber-50' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <span className={`mb-3 flex h-8 w-8 items-center justify-center rounded-xl ${tone}`}><Icon size={15} /></span>
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
            <p className="mt-1 text-lg font-black text-[#001a33]">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.9fr)]">
        <section className="rounded-2xl border border-emerald-100 bg-emerald-50/40 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-700"><Landmark size={13} /> Conta de recebimento do crédito</p>
          <p className="mt-1 break-words text-sm font-black text-[#001a33]">{formatEmprestimoContaCredito(emprestimo.contaCredito)}</p>
          <p className="mt-1 text-[11px] font-semibold text-slate-500">Crédito liberado em {formatEmprestimoDate(emprestimo.dataLiberacao)}.</p>
        </section>
        <section className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Condições do contrato</p>
          <p className="mt-1 inline-flex flex-wrap items-center gap-x-2 gap-y-1"><span>Encargos: <strong className="font-black text-[#001a33]">{formatEmprestimoCurrency(emprestimo.valorEncargos)}</strong></span><span className="text-slate-300">•</span><span className="inline-flex items-center gap-1"><CalendarDays size={12} /> {emprestimo.totalParcelas || emprestimo.parcelas.length} parcelas</span></p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{emprestimo.rateioModo === 'SEM_RATEIO' ? 'Baixa registrada pelo polo responsável.' : 'Baixa registrada exclusivamente pela Matriz.'}</p>
          {emprestimo.estornadoEm ? <p className="mt-1.5 font-black text-rose-700">Estornado em {formatEmprestimoDate(emprestimo.estornadoEm)}</p> : null}
        </section>
      </div>

      {(emprestimo.observacao || emprestimo.cancelamentoMotivo) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {emprestimo.observacao ? <div className="rounded-2xl border border-slate-100 bg-white p-4"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Observação</p><p className="mt-1 text-sm font-medium leading-relaxed text-slate-600">{emprestimo.observacao}</p></div> : null}
          {emprestimo.cancelamentoMotivo ? <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-rose-600">Motivo do cancelamento</p><p className="mt-1 text-sm font-medium leading-relaxed text-rose-800">{emprestimo.cancelamentoMotivo}</p></div> : null}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-100">
        <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#001a33]"><ReceiptText size={15} className="text-indigo-600" /> {emprestimo.rateioModo === 'SEM_RATEIO' ? 'Parcelas próprias do polo' : 'Parcelas e rateio canônico'}</h3>
          {canSettle && !isCancelled && <button type="button" onClick={() => onSettle()} className="text-[10px] font-black uppercase tracking-wide text-indigo-600 hover:text-indigo-800">Selecionar parcelas</button>}
        </div>
        {emprestimo.parcelas.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm font-medium text-slate-400">Nenhuma parcela retornada pelo contrato financeiro.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {emprestimo.parcelas.map((parcela) => (
              <div key={parcela.id} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-xs font-black text-indigo-700">{parcela.numero}</span><div><p className="text-sm font-black text-[#001a33]">Parcela {parcela.numero}</p><p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-500"><Clock3 size={12} /> Vencimento: {formatEmprestimoDate(parcela.dataVencimento)}</p></div></div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end"><span className={`inline-flex rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${emprestimoStatusClass(parcela.status)}`}>{emprestimoStatusLabel(parcela.status)}</span><span className="text-base font-black text-[#001a33]">{formatEmprestimoCurrency(parcela.valorTotal)}</span>{canSettle && !isCancelled && (parcela.status === 'PENDENTE' || parcela.status === 'VENCIDO') && <button type="button" onClick={() => onSettle(parcela)} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white transition-colors hover:bg-indigo-700"><CheckCircle2 size={13} /> Selecionar</button>}</div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4"><p className="rounded-lg bg-slate-50 px-3 py-2 font-semibold text-slate-600">Principal: <strong className="text-[#001a33]">{formatEmprestimoCurrency(parcela.valorPrincipal)}</strong></p><p className="rounded-lg bg-slate-50 px-3 py-2 font-semibold text-slate-600">Encargos: <strong className="text-[#001a33]">{formatEmprestimoCurrency(parcela.valorEncargos)}</strong></p><p className="rounded-lg bg-emerald-50/60 px-3 py-2 font-semibold text-emerald-700">Valor pago: <strong className="text-[#001a33]">{formatCanonicalCurrency(parcela.valorPago)}</strong></p><p className="rounded-lg bg-slate-50 px-3 py-2 font-semibold text-slate-600">Pagamento: <strong className="text-[#001a33]">{formatEmprestimoDate(parcela.dataPagamento)}</strong></p></div>
                {hasSettlementAdjustment(parcela) && <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/50 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Ajustes desta baixa</p><div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-700">{parcela.jurosValor ? <span className="rounded-lg bg-white px-2.5 py-1.5 shadow-sm">Juros: <strong className="text-[#001a33]">{formatEmprestimoCurrency(parcela.jurosValor)}</strong></span> : null}{parcela.multaValor ? <span className="rounded-lg bg-white px-2.5 py-1.5 shadow-sm">Multa: <strong className="text-[#001a33]">{formatEmprestimoCurrency(parcela.multaValor)}</strong></span> : null}{parcela.descontoValor ? <span className="rounded-lg bg-white px-2.5 py-1.5 shadow-sm">Desconto: <strong className="text-[#001a33]">{formatEmprestimoCurrency(parcela.descontoValor)}</strong></span> : null}</div>{parcela.observacaoBaixa ? <p className="mt-2 text-xs font-medium leading-relaxed text-slate-600"><strong className="font-black text-slate-700">Observação da baixa:</strong> {parcela.observacaoBaixa}</p> : null}</div>}
                {emprestimo.rateioModo !== 'SEM_RATEIO' && <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3"><p className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-indigo-700"><UsersRound size={12} /> Custo distribuído por polo</p>{parcela.rateios.length === 0 ? <p className="text-xs font-medium text-slate-500">O rateio desta parcela ainda não foi retornado.</p> : <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{parcela.rateios.map((rateio) => <div key={rateio.id || rateio.poloId} className="rounded-lg border border-white bg-white px-3 py-2 shadow-sm"><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-bold text-slate-700">{rateio.poloNome || 'Polo'}</span><span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase ${emprestimoStatusClass(rateio.status)}`}>{emprestimoStatusLabel(rateio.status)}</span></div><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Contratado</p><p className="text-sm font-black text-[#001a33]">{formatEmprestimoCurrency(rateio.valorTotal)}</p>{rateio.valorPago !== undefined ? <p className="mt-1 text-xs font-bold text-emerald-700">Pago: {formatEmprestimoCurrency(rateio.valorPago)}</p> : null}</div>)}</div>}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default EmprestimoDetailsPage;
