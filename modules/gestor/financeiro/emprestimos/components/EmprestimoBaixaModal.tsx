import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Landmark,
  Loader2,
  Square,
  WalletCards,
  X,
} from 'lucide-react';

import BankAccountPicker from '../../components/BankAccountPicker';
import { createEmprestimoRequestId } from '../emprestimos.service';
import {
  formatEmprestimoCurrency,
  formatEmprestimoDate,
  getEmprestimoOpenParcelas,
} from '../emprestimos.presentation';
import type {
  BaixarEmprestimoParcelasInput,
  EmprestimoFinanceiro,
  EmprestimoFormaPagamento,
} from '../emprestimos.types';
import type { ContaBancaria } from '../../financeiro.service';
import { todayInMaceio } from '../../receber/components/manual-settlement/manual-settlement-date';

const parseCurrency = (value: string) => (
  Number(value.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.') || 0)
);

const formatCurrencyInput = (value: number) => (
  Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
);

const normalizeCurrency = (value: string) => {
  const parsed = parseCurrency(value);
  return parsed > 0 ? formatCurrencyInput(parsed) : '';
};

interface EmprestimoBaixaModalProps {
  emprestimo: EmprestimoFinanceiro;
  initialParcelaId?: string;
  poloResponsavelId: string;
  poloResponsavelNome: string;
  contas: ContaBancaria[];
  isPending?: boolean;
  error?: Error | null;
  onClose: () => void;
  onConfirm: (input: BaixarEmprestimoParcelasInput) => void;
}

const EmprestimoBaixaModal: React.FC<EmprestimoBaixaModalProps> = ({
  emprestimo,
  initialParcelaId,
  poloResponsavelId,
  poloResponsavelNome,
  contas,
  isPending = false,
  error,
  onClose,
  onConfirm,
}) => {
  const requestIdRef = useRef(createEmprestimoRequestId());
  const openParcelas = useMemo(() => getEmprestimoOpenParcelas(emprestimo), [emprestimo]);
  const [selectedParcelaIds, setSelectedParcelaIds] = useState<Set<string>>(() => (
    new Set(
      initialParcelaId && openParcelas.some((parcela) => parcela.id === initialParcelaId)
        ? [initialParcelaId]
        : [],
    )
  ));
  const [contaBancariaId, setContaBancariaId] = useState('');
  const [dataPagamento, setDataPagamento] = useState(todayInMaceio());
  const [formaPagamento, setFormaPagamento] = useState<EmprestimoFormaPagamento>('PIX');
  const [adjustmentsOpen, setAdjustmentsOpen] = useState(false);
  const [jurosValor, setJurosValor] = useState('');
  const [multaValor, setMultaValor] = useState('');
  const [descontoValor, setDescontoValor] = useState('');
  const [observacao, setObservacao] = useState('');
  const availableAccounts = useMemo(
    () => contas.filter((conta) => conta.ativo !== false),
    [contas],
  );
  const selectedIds = openParcelas
    .filter((parcela) => selectedParcelaIds.has(parcela.id))
    .map((parcela) => parcela.id);
  const allSelected = openParcelas.length > 0 && selectedIds.length === openParcelas.length;

  const toggleParcela = (parcelaId: string) => {
    setSelectedParcelaIds((current) => {
      const next = new Set(current);
      if (next.has(parcelaId)) next.delete(parcelaId);
      else next.add(parcelaId);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedParcelaIds(() => (
      allSelected ? new Set() : new Set(openParcelas.map((parcela) => parcela.id))
    ));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!contaBancariaId || !dataPagamento || selectedIds.length === 0) return;
    onConfirm({
      emprestimoId: emprestimo.id,
      parcelaIds: selectedIds,
      poloResponsavelId,
      requestId: requestIdRef.current,
      contaBancariaId,
      dataPagamento,
      formaPagamento,
      jurosValor: parseCurrency(jurosValor),
      multaValor: parseCurrency(multaValor),
      descontoValor: parseCurrency(descontoValor),
      observacao: observacao.trim() || undefined,
    });
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[230] flex items-center justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm animate-fadeIn overscroll-contain">
      <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600"><Landmark size={14} /> Baixa do polo responsável</p>
            <h3 className="mt-1 text-lg font-black uppercase tracking-tight text-[#001a33]">Selecionar parcelas para baixa</h3>
            <p className="mt-0.5 text-xs font-medium text-slate-500">{emprestimo.descricao} · pagamento registrado na conta de {poloResponsavelNome || 'o polo responsável'}.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            aria-label="Fechar baixa"
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <X size={19} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <section className="overflow-hidden rounded-2xl border border-indigo-100">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100 bg-indigo-50/50 px-4 py-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-indigo-700">Parcelas em aberto</p>
                <p className="mt-0.5 text-xs font-medium text-slate-500">Selecione uma ou mais parcelas. Valores e rateios já são os definidos pelo backend.</p>
              </div>
              <button
                type="button"
                onClick={toggleAll}
                disabled={isPending || openParcelas.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-indigo-700 transition-colors hover:bg-indigo-50 disabled:opacity-50"
              >
                {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                {allSelected ? 'Limpar seleção' : 'Todas'}
              </button>
            </div>

            {openParcelas.length === 0 ? (
              <p className="px-4 py-7 text-center text-sm font-semibold text-slate-400">Não há parcelas disponíveis para baixa neste contrato.</p>
            ) : (
              <div className="max-h-[280px] divide-y divide-slate-100 overflow-y-auto">
                {openParcelas.map((parcela) => {
                  const selected = selectedParcelaIds.has(parcela.id);
                  return (
                    <label key={parcela.id} className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors ${selected ? 'bg-indigo-50/50' : 'hover:bg-slate-50'}`}>
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={isPending}
                        onChange={() => toggleParcela(parcela.id)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                        <span>
                          <strong className="block text-sm font-black text-[#001a33]">Parcela {parcela.numero}</strong>
                          <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">Vencimento: {formatEmprestimoDate(parcela.dataVencimento)}</span>
                        </span>
                        <span className="text-right">
                          <strong className="block text-sm font-black text-[#001a33]">{formatEmprestimoCurrency(parcela.valorTotal)}</strong>
                          <span className="mt-0.5 block text-[10px] font-black uppercase tracking-wide text-amber-600">{parcela.status}</span>
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          <p className="text-[11px] font-semibold text-slate-500">{selectedIds.length === 0 ? 'Nenhuma parcela selecionada.' : `${selectedIds.length} parcela(s) selecionada(s).`}</p>

          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400"><WalletCards size={11} className="mr-1 inline" /> Conta do polo responsável *</label>
            <BankAccountPicker
              accounts={availableAccounts}
              value={contaBancariaId}
              onChange={setContaBancariaId}
              placeholder="Selecionar conta para a baixa..."
              tone="indigo"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Data do pagamento *</span>
              <input
                type="date"
                value={dataPagamento}
                onChange={(event) => setDataPagamento(event.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <div>
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Forma de pagamento *</span>
              <div className="grid grid-cols-2 gap-2">
                {(['PIX', 'TED', 'DINHEIRO', 'BOLETO'] as EmprestimoFormaPagamento[]).map((forma) => (
                  <button
                    key={forma}
                    type="button"
                    onClick={() => setFormaPagamento(forma)}
                    disabled={isPending}
                    className={`rounded-xl border py-2.5 text-[10px] font-black uppercase tracking-wide transition-colors ${
                      formaPagamento === forma
                        ? 'border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-900/15'
                        : 'border-slate-200 text-slate-500 hover:border-indigo-200 hover:text-indigo-600'
                    }`}
                  >
                    {forma}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <section className="overflow-hidden rounded-2xl border border-indigo-100 bg-indigo-50/35">
            <button
              type="button"
              onClick={() => setAdjustmentsOpen((current) => !current)}
              disabled={isPending}
              aria-expanded={adjustmentsOpen}
              className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-indigo-50/70 disabled:opacity-50"
            >
              <span>
                <span className="block text-[10px] font-black uppercase tracking-wider text-indigo-700">Ajustes desta baixa <span className="font-bold text-indigo-500">(opcional)</span></span>
                <span className="mt-1 block text-[11px] font-medium leading-relaxed text-slate-500">Aplicado ao conjunto selecionado. Valores finais e rateios são validados pelo servidor.</span>
              </span>
              <span className="mt-0.5 shrink-0 text-indigo-600">{adjustmentsOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</span>
            </button>
            {adjustmentsOpen && (
              <div className="space-y-3 border-t border-indigo-100 bg-white/70 px-4 py-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: 'Juros de atraso', value: jurosValor, setter: setJurosValor },
                    { label: 'Multa', value: multaValor, setter: setMultaValor },
                    { label: 'Desconto concedido', value: descontoValor, setter: setDescontoValor },
                  ].map((field) => (
                    <label key={field.label}>
                      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">{field.label}</span>
                      <span className="relative block">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">R$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={field.value}
                          onChange={(event) => field.setter(event.target.value)}
                          onBlur={(event) => field.setter(normalizeCurrency(event.target.value))}
                          placeholder="0,00"
                          disabled={isPending}
                          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm font-bold text-[#001a33] outline-none transition-colors focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
                        />
                      </span>
                    </label>
                  ))}
                </div>
                <label>
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Observação da baixa</span>
                  <textarea
                    value={observacao}
                    onChange={(event) => setObservacao(event.target.value)}
                    maxLength={1000}
                    rows={2}
                    disabled={isPending}
                    placeholder="Ex.: desconto negociado com o credor."
                    className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none transition-colors placeholder:text-slate-300 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
                  />
                  <span className="mt-1 block text-right text-[10px] font-medium text-slate-400">{observacao.length}/1000</span>
                </label>
              </div>
            )}
          </section>

          {error && (
            <div role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
              {error.message || 'Não foi possível concluir a baixa.'}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold uppercase text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!contaBancariaId || !dataPagamento || selectedIds.length === 0 || isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-black uppercase tracking-wide text-white shadow-md shadow-indigo-900/20 transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              Confirmar baixa
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default EmprestimoBaixaModal;
