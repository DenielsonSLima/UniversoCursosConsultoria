import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar,
  CheckSquare,
  CircleDollarSign,
  FileText,
  Landmark,
  Layers3,
  Loader2,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import BankAccountPicker from '../../components/BankAccountPicker';
import { caixaQueryKeys } from '../../../caixa/caixa.service';
import { financeiroQueryKeys } from '../../financeiro.queryKeys';
import {
  emprestimosFinanciamentoScopes,
  emprestimosQueryKeys,
} from '../emprestimos.queryKeys';
import {
  createEmprestimoRequestId,
  emprestimosService,
} from '../emprestimos.service';
import { useEmprestimoBancosCredoresQuery } from '../hooks/useEmprestimosQueries';
import { todayInMaceio } from '../../receber/components/manual-settlement/manual-settlement-date';
import type {
  EmprestimoFinanceiro,
  EmprestimoFormaPagamento,
  EmprestimoRateioModo,
} from '../emprestimos.types';
import type { ContaBancaria, FinanceiroPolo } from '../../financeiro.service';

const parseCurrencyInput = (value: string) => {
  const normalized = value.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
  return Number(normalized || 0);
};

const formatCurrencyInput = (value: string) => {
  const parsed = parseCurrencyInput(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return parsed.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatPoloLocalizacao = (polo: FinanceiroPolo) => (
  [polo.cidade, polo.estado || polo.uf]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(' • ') || 'Cidade/UF não informadas'
);

interface EmprestimoFormProps {
  poloResponsavelId: string;
  poloResponsavelNome: string;
  isMatriz: boolean;
  polos: FinanceiroPolo[];
  contas: ContaBancaria[];
  onClose: () => void;
  onCreated: (emprestimo: EmprestimoFinanceiro) => void;
}

const EmprestimoForm: React.FC<EmprestimoFormProps> = ({
  poloResponsavelId,
  poloResponsavelNome,
  isMatriz,
  polos,
  contas,
  onClose,
  onCreated,
}) => {
  const queryClient = useQueryClient();
  const requestIdRef = useRef(createEmprestimoRequestId());
  const [credorParceiroId, setCredorParceiroId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valorLiberado, setValorLiberado] = useState('');
  const [valorTotalDivida, setValorTotalDivida] = useState('');
  const [dataLiberacao, setDataLiberacao] = useState(todayInMaceio());
  const [dataPrimeiroVencimento, setDataPrimeiroVencimento] = useState(todayInMaceio());
  const [totalParcelas, setTotalParcelas] = useState('1');
  const [intervaloMeses, setIntervaloMeses] = useState('1');
  const [contaCreditoId, setContaCreditoId] = useState('');
  const [formaCredito, setFormaCredito] = useState<EmprestimoFormaPagamento>('PIX');
  const [rateioModo, setRateioModo] = useState<EmprestimoRateioModo>('TODOS');
  const [polosSelecionados, setPolosSelecionados] = useState<Set<string>>(() => new Set());
  const [observacao, setObservacao] = useState('');

  const polosAtivos = useMemo(
    () => polos.filter((polo) => Boolean(polo.id)),
    [polos],
  );
  const bancosCredoresQuery = useEmprestimoBancosCredoresQuery(
    poloResponsavelId,
    Boolean(poloResponsavelId),
  );
  const bancosCredores = bancosCredoresQuery.data || [];
  const rateioDisponivel = isMatriz;
  const rateioEfetivo: EmprestimoRateioModo = rateioDisponivel
    ? rateioModo
    : 'SEM_RATEIO';

  const createMutation = useMutation({
    mutationFn: () => emprestimosService.criar({
      requestId: requestIdRef.current,
      poloResponsavelId,
      credorParceiroId,
      descricao: descricao.trim(),
      valorLiberado: parseCurrencyInput(valorLiberado),
      valorTotalDivida: parseCurrencyInput(valorTotalDivida),
      dataLiberacao,
      dataPrimeiroVencimento,
      totalParcelas: Number(totalParcelas),
      intervaloMeses: Number(intervaloMeses),
      contaCreditoId,
      formaCredito,
      rateioModo: rateioEfetivo,
      poloIds: rateioEfetivo === 'SELECIONADOS' ? Array.from(polosSelecionados) : [],
      observacao: observacao.trim() || undefined,
    }),
    onSuccess: async (emprestimo) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: emprestimosQueryKeys.list(poloResponsavelId) }),
        queryClient.invalidateQueries({ queryKey: emprestimosQueryKeys.export(poloResponsavelId, 'ATIVOS') }),
        queryClient.invalidateQueries({ queryKey: emprestimosQueryKeys.export(poloResponsavelId, 'TODOS') }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
        queryClient.invalidateQueries({ queryKey: caixaQueryKeys.dashboards }),
        ...emprestimosFinanciamentoScopes(poloResponsavelId, emprestimo).map((scope) => (
          queryClient.invalidateQueries({
            queryKey: caixaQueryKeys.financiamentoResumosForPolo(scope),
          })
        )),
      ]);
      requestIdRef.current = createEmprestimoRequestId();
      onCreated(emprestimo);
    },
  });

  const togglePolo = (poloId: string) => {
    setPolosSelecionados((current) => {
      const next = new Set(current);
      if (next.has(poloId)) next.delete(poloId);
      else next.add(poloId);
      return next;
    });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (
      !credorParceiroId
      || !descricao.trim()
      || !parseCurrencyInput(valorLiberado)
      || !parseCurrencyInput(valorTotalDivida)
      || !dataLiberacao
      || !dataPrimeiroVencimento
      || !totalParcelas
      || !intervaloMeses
      || !contaCreditoId
      || (rateioEfetivo === 'SELECIONADOS' && polosSelecionados.size === 0)
    ) return;
    createMutation.mutate();
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center overflow-hidden bg-black/40 p-4 backdrop-blur-sm animate-fadeIn overscroll-contain">
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-5xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-7 pb-4 pt-7">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">
              <Landmark size={14} /> {isMatriz ? 'Crédito centralizado na Matriz' : 'Crédito próprio do polo'}
            </p>
            <h3 className="mt-1 text-lg font-black uppercase tracking-tight text-[#001a33]">Novo empréstimo</h3>
            <p className="mt-0.5 text-xs font-medium text-slate-500">{poloResponsavelNome || 'Polo selecionado'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={createMutation.isPending}
            aria-label="Fechar"
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 px-7 py-6 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">
              <Landmark size={11} className="mr-1 inline" /> Banco credor (Parceiro PJ • categoria Banco) *
            </label>
            <select
              value={credorParceiroId}
              onChange={(event) => setCredorParceiroId(event.target.value)}
              required
              disabled={bancosCredoresQuery.isPending || bancosCredoresQuery.isError}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition-all focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              <option value="">
                {bancosCredoresQuery.isPending
                  ? 'Carregando bancos cadastrados...'
                  : 'Selecione um banco cadastrado...'}
              </option>
              {bancosCredores.map((banco) => (
                <option key={banco.id} value={banco.id}>
                  {banco.nome}{banco.cpfCnpj ? ` • ${banco.cpfCnpj}` : ''}
                </option>
              ))}
            </select>
            {bancosCredoresQuery.isError ? (
              <p className="mt-1.5 text-[11px] font-medium text-rose-600">
                Não foi possível carregar os bancos cadastrados. Tente novamente ao reabrir o formulário.
              </p>
            ) : bancosCredores.length === 0 && !bancosCredoresQuery.isPending ? (
              <p className="mt-1.5 text-[11px] font-medium text-amber-700">
                Nenhum Parceiro PJ com categoria Banco está disponível neste polo. Cadastre-o no módulo Parceiros.
              </p>
            ) : null}
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">
              <FileText size={11} className="mr-1 inline" /> Descrição *
            </label>
            <input
              value={descricao}
              onChange={(event) => setDescricao(event.target.value)}
              placeholder="Finalidade ou contrato do crédito"
              required
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition-all placeholder:text-slate-300 focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">
              <CircleDollarSign size={11} className="mr-1 inline" /> Valor liberado *
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">R$</span>
              <input
                value={valorLiberado}
                onChange={(event) => setValorLiberado(event.target.value.replace(/[^\d.,]/g, ''))}
                onBlur={(event) => setValorLiberado(formatCurrencyInput(event.target.value))}
                inputMode="decimal"
                placeholder="0,00"
                required
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-semibold outline-none transition-all placeholder:text-slate-300 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">
              <CircleDollarSign size={11} className="mr-1 inline" /> Total da dívida *
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">R$</span>
              <input
                value={valorTotalDivida}
                onChange={(event) => setValorTotalDivida(event.target.value.replace(/[^\d.,]/g, ''))}
                onBlur={(event) => setValorTotalDivida(formatCurrencyInput(event.target.value))}
                inputMode="decimal"
                placeholder="0,00"
                required
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-semibold outline-none transition-all placeholder:text-slate-300 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">
              <Calendar size={11} className="mr-1 inline" /> Data da liberação *
            </label>
            <input
              type="date"
              value={dataLiberacao}
              onChange={(event) => setDataLiberacao(event.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">
              <Calendar size={11} className="mr-1 inline" /> Primeiro vencimento *
            </label>
            <input
              type="date"
              value={dataPrimeiroVencimento}
              onChange={(event) => setDataPrimeiroVencimento(event.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">
              <Layers3 size={11} className="mr-1 inline" /> Quantidade de parcelas *
            </label>
            <input
              type="number"
              min="1"
              max="120"
              value={totalParcelas}
              onChange={(event) => setTotalParcelas(event.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">
              <Calendar size={11} className="mr-1 inline" /> Intervalo entre parcelas (meses) *
            </label>
            <input
              type="number"
              min="1"
              max="24"
              value={intervaloMeses}
              onChange={(event) => setIntervaloMeses(event.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">
              <WalletCards size={11} className="mr-1 inline" /> Conta que recebeu o crédito *
            </label>
            <BankAccountPicker
              accounts={contas}
              value={contaCreditoId}
              onChange={setContaCreditoId}
              placeholder={isMatriz ? 'Selecionar conta da Matriz...' : 'Selecionar conta do polo...'}
              tone="indigo"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Forma do crédito *</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(['PIX', 'TED', 'DINHEIRO', 'BOLETO'] as EmprestimoFormaPagamento[]).map((forma) => (
                <button
                  key={forma}
                  type="button"
                  onClick={() => setFormaCredito(forma)}
                  className={`rounded-xl border px-2 py-3 text-[10px] font-black uppercase tracking-wide transition-colors ${
                    formaCredito === forma
                      ? 'border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-900/15'
                      : 'border-slate-200 text-slate-500 hover:border-indigo-200 hover:text-indigo-600'
                  }`}
                >
                  {forma}
                </button>
              ))}
            </div>
          </div>

          {rateioDisponivel ? (
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 md:col-span-2">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm">
                <UsersRound size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-wide text-[#001a33]">Rateio dos custos por polo</p>
                <p className="mt-0.5 text-xs font-medium leading-relaxed text-slate-500">
                  O banco divide parcelas e centavos de forma canônica; esta tela apenas informa o escopo do rateio.
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {([
                    { id: 'TODOS' as const, label: 'Todos os polos ativos', detail: 'Inclui automaticamente os polos ativos da empresa.' },
                    { id: 'SELECIONADOS' as const, label: 'Selecionar polos', detail: 'Escolha apenas as unidades que receberão o custo.' },
                  ]).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setRateioModo(option.id)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        rateioModo === option.id
                          ? 'border-indigo-500 bg-white shadow-sm'
                          : 'border-transparent bg-white/60 hover:border-indigo-100'
                      }`}
                    >
                      <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#001a33]">
                        <span className={`flex h-4 w-4 items-center justify-center rounded border ${rateioModo === option.id ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                          <CheckSquare size={11} />
                        </span>
                        {option.label}
                      </span>
                      <span className="mt-1 block text-[11px] font-medium text-slate-500">{option.detail}</span>
                    </button>
                  ))}
                </div>

                {rateioModo === 'SELECIONADOS' && (
                  <div className="mt-3 grid max-h-48 grid-cols-1 gap-2 overflow-y-auto rounded-xl border border-indigo-100 bg-white p-3 sm:grid-cols-2">
                    {polosAtivos.map((polo) => {
                      const selected = polosSelecionados.has(polo.id);
                      return (
                        <label key={polo.id} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => togglePolo(polo.id)}
                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-black text-slate-700">
                              {polo.is_matriz ? 'Matriz — ' : 'Polo — '}{polo.nome}
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] font-medium text-slate-400">
                              {formatPoloLocalizacao(polo)}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
          ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm">
                <Landmark size={15} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-[#001a33]">Empréstimo próprio do polo</p>
                <p className="mt-0.5 text-xs font-medium leading-relaxed text-slate-500">
                  Crédito, parcelas, Contas a Pagar e baixa ficam exclusivamente neste polo. Não haverá rateio para outras unidades.
                </p>
              </div>
            </div>
          </div>
          )}

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Observação</label>
            <textarea
              value={observacao}
              onChange={(event) => setObservacao(event.target.value)}
              rows={3}
              placeholder="Informações complementares do contrato ou da finalidade"
              className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none placeholder:text-slate-300 focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {createMutation.isError && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700 md:col-span-2">
              {(createMutation.error as Error)?.message || 'Não foi possível registrar o empréstimo.'}
            </div>
          )}

          <div className="flex gap-3 pt-2 md:col-span-2">
            <button
              type="button"
              onClick={onClose}
              disabled={createMutation.isPending}
              className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold uppercase text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || !poloResponsavelId}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-black uppercase tracking-wide text-white shadow-md shadow-indigo-900/20 transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Landmark size={15} />}
              Registrar empréstimo
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default EmprestimoForm;
