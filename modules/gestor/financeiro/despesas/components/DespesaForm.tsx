// File: modules/gestor/financeiro/despesas/components/DespesaForm.tsx
// Formulário principal de lançamento de despesas (fixas, variáveis, outros débitos)

import React, { useState, useRef, useMemo } from 'react';
import {
  X, Loader2, Calendar, Tag, FileText, DollarSign,
  Layers, CheckCircle2, Plus, Clock,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { despesasService, DespesaLancamento } from '../despesas.service';
import { DespesaTipo, despesasQueryKeys } from '../despesas.queryKeys';
import { useCategoriasFinanceirasQuery } from '../hooks/useCategoriasFinanceirasQuery';
import CategoriaFinanceiraInlineModal from './CategoriaFinanceiraInlineModal';
const parseCurrencyInput = (value: string) => {
  const normalized = value.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
  return Number(normalized || 0);
};

const formatCurrencyInput = (value: string) => {
  const parsed = parseCurrencyInput(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return parsed.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const today = () => new Date().toISOString().slice(0, 10);

type LancamentoMode = 'pendente' | 'parcelado' | 'baixa';
type IntervaloUnit = 'dias' | 'semanas' | 'meses';

interface DespesaFormProps {
  tipo: DespesaTipo;
  poloId: string;
  polos: any[];
  contas: any[];
  parceiros: any[];
  turmas: any[];
  onClose: () => void;
  onSuccess: (lancamentos: DespesaLancamento[], mode: LancamentoMode) => void;
}

const DespesaForm: React.FC<DespesaFormProps> = ({
  tipo,
  poloId,
  polos,
  contas,
  parceiros,
  turmas,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();

  // Form state
  const [mode, setMode] = useState<LancamentoMode>('pendente');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [dataVencimento, setDataVencimento] = useState(today());
  const [categoriaId, setCategoriaId] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');
  const [turmaId, setTurmaId] = useState('');
  const [observacao, setObservacao] = useState('');
  const [totalParcelas, setTotalParcelas] = useState(2);
  const [intervaloDias, setIntervaloDias] = useState(30);
  const [intervaloUnit, setIntervaloUnit] = useState<IntervaloUnit>('meses');
  const [contaBancariaId, setContaBancariaId] = useState('');
  const [formaPagamento, setFormaPagamento] = useState<string>('PIX');
  const [showCategoriaModal, setShowCategoriaModal] = useState(false);
  const categoriaSelectRef = useRef<HTMLDivElement>(null);

  const categoriasQuery = useCategoriasFinanceirasQuery(tipo);
  const categorias = categoriasQuery.data || [];

  const intervaloEmDias = useMemo(() => {
    if (intervaloUnit === 'dias') return intervaloDias;
    if (intervaloUnit === 'semanas') return intervaloDias * 7;
    return intervaloDias * 30;
  }, [intervaloDias, intervaloUnit]);

  const createMutation = useMutation({
    mutationFn: () =>
      despesasService.createDespesa({
        poloId,
        tipo,
        descricao: descricao.trim(),
        valor: parseCurrencyInput(valor),
        dataVencimento,
        categoriaFinanceiraId: categoriaId || undefined,
        fornecedorId: fornecedorId || undefined,
        observacao: observacao.trim() || undefined,
        turmaId: turmaId || undefined,
        totalParcelas: mode === 'parcelado' ? totalParcelas : 1,
        intervaloDias: mode === 'parcelado' ? intervaloEmDias : undefined,
        markAsPaid: mode === 'baixa',
        formaPagamento: mode === 'baixa' ? formaPagamento : undefined,
        contaBancariaId: mode === 'baixa' ? contaBancariaId : undefined,
      }),
    onSuccess: async (created) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: despesasQueryKeys.lancamentosRoot }),
      ]);
      onSuccess(created, mode);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!descricao.trim()) return;
    if (!parseCurrencyInput(valor)) return;
    if (mode === 'baixa' && !contaBancariaId) return;
    createMutation.mutate();
  };

  const tipoLabel: Record<DespesaTipo, string> = {
    DESPESA_FIXA: 'Despesa Fixa',
    DESPESA_VARIAVEL: 'Despesa Variável',
    OUTRO_DEBITO: 'Outro Débito',
  };

  const activeContas = contas.filter((c) => c.ativo !== false && (!poloId || c.poloId === poloId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-8 pb-4 sticky top-0 bg-white z-10 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight">
              Novo Lançamento
            </h3>
            <p className="text-xs text-rose-500 font-bold uppercase tracking-wider mt-0.5">
              {tipoLabel[tipo]}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">
          {/* Modo de Lançamento */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
              Modo de Lançamento
            </label>
            <div className="flex gap-2">
              {([
                { id: 'pendente', label: 'Pendente', Icon: Clock },
                { id: 'parcelado', label: 'Parcelado', Icon: Layers },
                { id: 'baixa', label: 'Dar Baixa', Icon: CheckCircle2 },
              ] as { id: LancamentoMode; label: string; Icon: React.ElementType }[]).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMode(id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide border transition-all ${
                    mode === id
                      ? 'bg-rose-600 text-white border-rose-600 shadow-md'
                      : 'text-slate-500 border-slate-200 hover:border-rose-300 hover:text-rose-600'
                  }`}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Data de Vencimento */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
              <Calendar size={11} className="inline mr-1" />
              Data de Vencimento *
            </label>
            <input
              type="date"
              value={dataVencimento}
              onChange={(e) => setDataVencimento(e.target.value)}
              required
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-sm font-semibold transition-all"
            />
          </div>

          {/* Categoria + Botão inline */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
              <Tag size={11} className="inline mr-1" />
              Categoria
            </label>
            <div className="relative" ref={categoriaSelectRef}>
              <div className="flex gap-2">
                <select
                  value={categoriaId}
                  onChange={(e) => setCategoriaId(e.target.value)}
                  className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-sm font-semibold transition-all appearance-none"
                >
                  <option value="">Selecionar categoria...</option>
                  {categorias.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.nome}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowCategoriaModal((v) => !v)}
                  className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl border border-rose-200 transition-colors flex items-center gap-1 text-xs font-bold whitespace-nowrap"
                  title="Nova categoria"
                >
                  <Plus size={14} />
                  Nova
                </button>
              </div>
              {showCategoriaModal && (
                <CategoriaFinanceiraInlineModal
                  tipo={tipo}
                  onCriada={(id, nome) => {
                    setCategoriaId(id);
                    setShowCategoriaModal(false);
                  }}
                  onClose={() => setShowCategoriaModal(false)}
                />
              )}
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
              <FileText size={11} className="inline mr-1" />
              Descrição *
            </label>
            <input
              type="text"
              placeholder="Ex: Aluguel de outubro, energia elétrica..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              required
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-sm font-semibold placeholder:text-slate-300 transition-all"
            />
          </div>

          {/* Valor */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
              <DollarSign size={11} className="inline mr-1" />
              Valor *
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">R$</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                onBlur={(e) => setValor(formatCurrencyInput(e.target.value))}
                required
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-sm font-semibold placeholder:text-slate-300 transition-all"
              />
            </div>
          </div>

          {/* Fornecedor */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
              Fornecedor / Credor
            </label>
            <select
              value={fornecedorId}
              onChange={(e) => setFornecedorId(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-sm font-semibold transition-all appearance-none"
            >
              <option value="">Selecionar (opcional)...</option>
              {parceiros.map((p: any) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>

          {/* Turma (Vínculo para Relatório de Lucro) */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
              Vincular a uma Turma
            </label>
            <select
              value={turmaId}
              onChange={(e) => setTurmaId(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-sm font-semibold transition-all appearance-none"
            >
              <option value="">Nenhuma turma (opcional)...</option>
              {turmas.map((t: any) => (
                <option key={t.id} value={t.id}>{t.nome} ({t.codigo})</option>
              ))}
            </select>
          </div>

          {/* Observação */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
              Observação
            </label>
            <textarea
              placeholder="Detalhes adicionais (opcional)..."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-sm font-semibold placeholder:text-slate-300 transition-all resize-none"
            />
          </div>

          {/* === Modo: Parcelado === */}
          {mode === 'parcelado' && (
            <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 space-y-3">
              <p className="text-xs font-black uppercase tracking-wider text-indigo-700 flex items-center gap-2">
                <Layers size={13} /> Configuração de Parcelas
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-indigo-500 mb-1">
                    Nº de Parcelas
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={60}
                    value={totalParcelas}
                    onChange={(e) => setTotalParcelas(Number(e.target.value))}
                    className="w-full px-3 py-2.5 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-indigo-500 mb-1">
                    Intervalo
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      min={1}
                      value={intervaloDias}
                      onChange={(e) => setIntervaloDias(Number(e.target.value))}
                      className="w-16 px-2 py-2.5 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold transition-all text-center"
                    />
                    <select
                      value={intervaloUnit}
                      onChange={(e) => setIntervaloUnit(e.target.value as IntervaloUnit)}
                      className="flex-1 px-2 py-2 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-bold transition-all appearance-none"
                    >
                      <option value="dias">Dias</option>
                      <option value="semanas">Semanas</option>
                      <option value="meses">Meses</option>
                    </select>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-indigo-500 font-medium">
                Serão criadas <strong>{totalParcelas}</strong> parcelas de{' '}
                <strong>{(parseCurrencyInput(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>{' '}
                cada, com intervalo de <strong>{intervaloDias} {intervaloUnit}</strong>.
              </p>
            </div>
          )}

          {/* === Modo: Baixa Automática === */}
          {mode === 'baixa' && (
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-3">
              <p className="text-xs font-black uppercase tracking-wider text-emerald-700 flex items-center gap-2">
                <CheckCircle2 size={13} /> Dar Baixa Imediata
              </p>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1">
                  Conta Bancária *
                </label>
                <select
                  value={contaBancariaId}
                  onChange={(e) => setContaBancariaId(e.target.value)}
                  required={mode === 'baixa'}
                  className="w-full px-3 py-2.5 bg-white border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-semibold transition-all appearance-none"
                >
                  <option value="">Selecionar conta...</option>
                  {activeContas.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.banco} — {c.conta}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1">
                  Forma de Pagamento
                </label>
                <div className="flex gap-2">
                  {(['PIX', 'TED', 'BOLETO', 'DINHEIRO'] as const).map((fp) => (
                    <button
                      key={fp}
                      type="button"
                      onClick={() => setFormaPagamento(fp)}
                      className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase border transition-all ${
                        formaPagamento === fp
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'text-slate-500 border-slate-200 hover:border-emerald-400'
                      }`}
                    >
                      {fp}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {createMutation.isError && (
            <div className="p-3 bg-red-50 rounded-xl border border-red-100 text-red-600 text-xs font-medium">
              {(createMutation.error as any)?.message || 'Erro ao criar lançamento'}
            </div>
          )}

          {/* Ações */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 text-sm font-bold uppercase tracking-wide transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-black uppercase tracking-wide transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-rose-900/20"
            >
              {createMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <CheckCircle2 size={16} />
              )}
              {mode === 'parcelado'
                ? `Lançar ${totalParcelas} Parcelas`
                : mode === 'baixa'
                ? 'Lançar e Dar Baixa'
                : 'Lançar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DespesaForm;
