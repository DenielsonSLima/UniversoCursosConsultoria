// File: modules/gestor/financeiro/despesas/components/DespesaForm.tsx
// Formulário principal de lançamento de despesas (fixas, variáveis, outros débitos)

import React, { useState, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Loader2, Calendar, Tag, FileText, DollarSign,
  Layers, CheckCircle2, Plus, Clock, Paperclip, UploadCloud, Trash2,
  CheckSquare, UsersRound,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createFinanceRequestId,
  DespesaRateioInput,
  despesasService,
  DespesaLancamento,
} from '../despesas.service';
import { DespesaTipo, despesasQueryKeys } from '../despesas.queryKeys';
import { useCategoriasFinanceirasQuery } from '../hooks/useCategoriasFinanceirasQuery';
import CategoriaFinanceiraInlineModal from './CategoriaFinanceiraInlineModal';
import DespesaCredorPicker, { DespesaCredorTipo } from './DespesaCredorPicker';
import BankAccountPicker from '../../components/BankAccountPicker';
import {
  ContaBancaria,
  isContaDisponivelNoPolo,
} from '../../financeiro.service';
import { financeiroQueryKeys } from '../../financeiro.queryKeys';
import { caixaQueryKeys } from '../../../caixa/caixa.service';
const parseCurrencyInput = (value: string) => {
  const normalized = value.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
  return Number(normalized || 0);
};

const formatCurrencyInput = (value: string) => {
  const parsed = parseCurrencyInput(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return parsed.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatCurrencyTyping = (value: string, previousValue: string) => {
  const cleaned = value.replace(/[^\d,.]/g, '');
  if (!cleaned) return '';

  const previousInteger = previousValue.split(',')[0].replace(/\D/g, '');

  if (previousValue.endsWith(',00')) {
    const appended = value.startsWith(previousValue)
      ? value.slice(previousValue.length).replace(/\D/g, '')
      : '';

    if (appended) return formatCurrencyInput(`${previousInteger}${appended}`);
    if (value === previousValue.slice(0, -1)) return formatCurrencyInput(previousInteger.slice(0, -1));
  }

  return formatCurrencyInput(cleaned);
};

const today = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

type LancamentoMode = 'pendente' | 'parcelado' | 'baixa';
type IntervaloUnit = 'dias' | 'semanas' | 'meses';
type TurmaModalidade = 'EAD' | 'TECNICO' | 'LIVRE' | 'ESPECIALIZACAO';
type RateioSelection = 'DESLIGADO' | DespesaRateioInput['modo'];

interface RateioPolo {
  id: string;
  nome: string;
  is_matriz?: boolean;
}

const turmaModalidadeOptions: { value: TurmaModalidade; label: string }[] = [
  { value: 'EAD', label: 'EAD' },
  { value: 'TECNICO', label: 'Técnico' },
  { value: 'LIVRE', label: 'Livres' },
  { value: 'ESPECIALIZACAO', label: 'Especialização' },
];

const getTurmaModalidade = (turma: any) => {
  const curso = Array.isArray(turma?.cursos) ? turma.cursos[0] : turma?.cursos;
  return String(curso?.modalidade || turma?.modalidade || '').toUpperCase();
};

interface DespesaFormProps {
  tipo: DespesaTipo;
  poloId: string;
  polos: RateioPolo[];
  contas: ContaBancaria[];
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
  const [dataLancamento, setDataLancamento] = useState(today());
  const [dataVencimento, setDataVencimento] = useState(today());
  const [categoriaId, setCategoriaId] = useState('');
  const [fornecedorTipo, setFornecedorTipo] = useState<DespesaCredorTipo | ''>('');
  const [fornecedorId, setFornecedorId] = useState('');
  const [jurosValor, setJurosValor] = useState('');
  const [multaValor, setMultaValor] = useState('');
  const [descontoValor, setDescontoValor] = useState('');
  const [anexo, setAnexo] = useState<File | null>(null);
  const [anexoErro, setAnexoErro] = useState('');
  const [turmaModalidade, setTurmaModalidade] = useState<TurmaModalidade | ''>('');
  const [turmaId, setTurmaId] = useState('');
  const [observacao, setObservacao] = useState('');
  const [totalParcelas, setTotalParcelas] = useState(2);
  const [splitTotal, setSplitTotal] = useState(false);
  const [intervaloDias, setIntervaloDias] = useState(30);
  const [intervaloUnit, setIntervaloUnit] = useState<IntervaloUnit>('meses');
  const [contaBancariaId, setContaBancariaId] = useState('');
  const [formaPagamento, setFormaPagamento] = useState<string>('PIX');
  const [rateioSelection, setRateioSelection] = useState<RateioSelection>('DESLIGADO');
  const [polosSelecionados, setPolosSelecionados] = useState<Set<string>>(() => new Set());
  const [showCategoriaModal, setShowCategoriaModal] = useState(false);
  const categoriaSelectRef = useRef<HTMLDivElement>(null);
  const anexoInputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(createFinanceRequestId());

  const categoriasQuery = useCategoriasFinanceirasQuery(tipo);
  const categorias = categoriasQuery.data || [];
  const filteredTurmas = useMemo(() => {
    if (!turmaModalidade) return [];
    return turmas.filter((turma: any) => getTurmaModalidade(turma) === turmaModalidade);
  }, [turmaModalidade, turmas]);
  const poloAtual = useMemo(
    () => polos.find((polo) => polo.id === poloId),
    [poloId, polos],
  );
  const isPoloMatriz = poloAtual?.is_matriz === true;
  const polosRateio = useMemo(
    () => polos.filter((polo) => Boolean(polo.id)),
    [polos],
  );
  const rateioSelecionadosInvalido = (
    rateioSelection === 'SELECIONADOS'
    && polosSelecionados.size === 0
  );

  const createMutation = useMutation({
    mutationFn: () =>
      despesasService.createDespesa({
        requestId: requestIdRef.current,
        poloId,
        tipo,
        descricao: descricao.trim(),
        valor: parseCurrencyInput(valor),
        jurosValor: parseCurrencyInput(jurosValor),
        multaValor: parseCurrencyInput(multaValor),
        descontoValor: parseCurrencyInput(descontoValor),
        dataLancamento,
        dataVencimento,
        categoriaFinanceiraId: categoriaId || undefined,
        fornecedorId: fornecedorId || undefined,
        observacao: observacao.trim() || undefined,
        turmaId: turmaId || undefined,
        totalParcelas: mode === 'parcelado' ? totalParcelas : 1,
        splitTotal: mode === 'parcelado' && splitTotal,
        intervaloQuantidade: mode === 'parcelado' ? intervaloDias : undefined,
        intervaloUnidade: mode === 'parcelado'
          ? intervaloUnit.toUpperCase() as 'DIAS' | 'SEMANAS' | 'MESES'
          : undefined,
        markAsPaid: mode === 'baixa',
        formaPagamento: mode === 'baixa' ? formaPagamento : undefined,
        contaBancariaId: mode === 'baixa' ? contaBancariaId : undefined,
        rateio: rateioSelection === 'DESLIGADO'
          ? undefined
          : {
              modo: rateioSelection,
              poloIds: rateioSelection === 'SELECIONADOS'
                ? Array.from(polosSelecionados)
                : undefined,
            },
        anexo: anexo || undefined,
      }),
    onSuccess: async (created) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: despesasQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
        queryClient.invalidateQueries({ queryKey: caixaQueryKeys.dashboards }),
        queryClient.invalidateQueries({ queryKey: caixaQueryKeys.custosOperacionais }),
      ]);
      requestIdRef.current = createFinanceRequestId();
      onSuccess(created, mode);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!descricao.trim()) return;
    if (!parseCurrencyInput(valor)) return;
    if (mode === 'baixa' && !contaBancariaId) return;
    if (rateioSelecionadosInvalido) return;
    createMutation.mutate();
  };

  const togglePoloRateio = (poloRateioId: string) => {
    setPolosSelecionados((current) => {
      const next = new Set(current);
      if (next.has(poloRateioId)) next.delete(poloRateioId);
      else next.add(poloRateioId);
      return next;
    });
  };

  const handleAnexo = (file?: File) => {
    setAnexoErro('');
    if (!file) {
      setAnexo(null);
      return;
    }
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setAnexoErro('Anexe um arquivo PDF, JPG, PNG ou WEBP.');
      return;
    }
    if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
      setAnexoErro('O anexo deve ter no máximo 10 MB.');
      return;
    }
    setAnexo(file);
  };

  const tipoLabel: Record<DespesaTipo, string> = {
    DESPESA_FIXA: 'Despesa Fixa',
    DESPESA_VARIAVEL: 'Despesa Variável',
    OUTRO_DEBITO: 'Outro Débito',
  };

  const activeContas = useMemo(
    () => contas.filter(
      (conta) => conta.ativo !== false && isContaDisponivelNoPolo(conta, poloId),
    ),
    [contas, poloId],
  );

  useEffect(() => {
    if (!turmaId) return;
    if (!filteredTurmas.some((turma: any) => turma.id === turmaId)) setTurmaId('');
  }, [filteredTurmas, turmaId]);

  useEffect(() => {
    if (
      contaBancariaId
      && !activeContas.some((conta) => conta.id === contaBancariaId)
    ) {
      setContaBancariaId('');
    }
  }, [activeContas, contaBancariaId]);

  useEffect(() => {
    if (isPoloMatriz) return;
    setRateioSelection('DESLIGADO');
    setPolosSelecionados(new Set());
  }, [isPoloMatriz]);

  const modal = (
    <div className="fixed left-0 top-0 z-[200] flex h-screen h-[100dvh] w-screen items-center justify-center overflow-hidden bg-black/40 p-4 backdrop-blur-sm animate-fadeIn overscroll-contain">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl max-h-[calc(100dvh-2rem)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 px-8 py-6 md:grid-cols-2">
          {/* Modo de Lançamento */}
          <div className="md:col-span-2">
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

          {/* Datas */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
              <Calendar size={11} className="inline mr-1" />
              Data de Lançamento *
            </label>
            <input
              type="date"
              value={dataLancamento}
              onChange={(e) => setDataLancamento(e.target.value)}
              required
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-sm font-semibold transition-all"
            />
          </div>
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
                inputMode="decimal"
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(formatCurrencyTyping(e.target.value, valor))}
                onBlur={(e) => setValor(formatCurrencyInput(e.target.value))}
                required
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-sm font-semibold placeholder:text-slate-300 transition-all"
              />
            </div>
          </div>

          <DespesaCredorPicker
            parceiros={parceiros}
            tipo={fornecedorTipo}
            value={fornecedorId}
            onTipoChange={setFornecedorTipo}
            onChange={setFornecedorId}
          />

          {/* Ajustes financeiros — o banco calcula e persiste o valor final canônico */}
          <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 md:col-span-2">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-amber-800">
                  Ajustes do valor
                </p>
                <p className="mt-0.5 text-[10px] font-medium text-amber-700/70">
                  Valores opcionais por lançamento ou por parcela.
                </p>
              </div>
              <span className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-[9px] font-black uppercase tracking-wider text-amber-700">
                Calculado no banco
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                {
                  label: 'Juros',
                  value: jurosValor,
                  setter: setJurosValor,
                  focus: 'focus:ring-amber-500',
                },
                {
                  label: 'Multa',
                  value: multaValor,
                  setter: setMultaValor,
                  focus: 'focus:ring-rose-500',
                },
                {
                  label: 'Desconto',
                  value: descontoValor,
                  setter: setDescontoValor,
                  focus: 'focus:ring-emerald-500',
                },
              ].map((field) => (
                <div key={field.label}>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {field.label}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      R$
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={field.value}
                      onChange={(event) => field.setter(formatCurrencyTyping(event.target.value, field.value))}
                      onBlur={(event) => field.setter(formatCurrencyInput(event.target.value))}
                      className={`w-full rounded-xl border border-white bg-white py-2.5 pl-9 pr-3 text-sm font-bold outline-none transition-all ${field.focus}`}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10px] font-semibold text-slate-500">
              Valor final = valor-base + juros + multa − desconto.
            </p>
          </div>

          {isPoloMatriz && (
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 md:col-span-2">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm">
                  <UsersRound size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black uppercase tracking-wide text-[#001a33]">
                    Rateio do custo por polo
                  </p>
                  <p className="mt-0.5 text-xs font-medium leading-relaxed text-slate-500">
                    O pagamento e a baixa ficam somente na Matriz. O banco registra o custo econômico nos polos escolhidos e preserva os centavos canônicos.
                  </p>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {([
                      {
                        id: 'DESLIGADO' as const,
                        label: 'Sem rateio',
                        detail: 'A conta permanece somente na Matriz.',
                      },
                      {
                        id: 'TODOS' as const,
                        label: 'Todos os polos',
                        detail: 'Distribui o custo entre os polos ativos.',
                      },
                      {
                        id: 'SELECIONADOS' as const,
                        label: 'Selecionar polos',
                        detail: 'Define quais unidades recebem o custo.',
                      },
                    ] as { id: RateioSelection; label: string; detail: string }[]).map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setRateioSelection(option.id)}
                        className={`rounded-xl border p-3 text-left transition-colors ${
                          rateioSelection === option.id
                            ? 'border-indigo-500 bg-white shadow-sm'
                            : 'border-transparent bg-white/60 hover:border-indigo-100'
                        }`}
                      >
                        <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-[#001a33]">
                          <span className={`flex h-4 w-4 items-center justify-center rounded border ${rateioSelection === option.id ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                            <CheckSquare size={11} />
                          </span>
                          {option.label}
                        </span>
                        <span className="mt-1 block text-[10px] font-medium leading-relaxed text-slate-500">
                          {option.detail}
                        </span>
                      </button>
                    ))}
                  </div>

                  {rateioSelection === 'SELECIONADOS' && (
                    <div className="mt-3 grid max-h-48 grid-cols-1 gap-2 overflow-y-auto rounded-xl border border-indigo-100 bg-white p-3 sm:grid-cols-2">
                      {polosRateio.map((polo) => {
                        const selected = polosSelecionados.has(polo.id);
                        return (
                          <label key={polo.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => togglePoloRateio(polo.id)}
                              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="min-w-0 truncate">
                              {polo.is_matriz ? 'Matriz — ' : 'Polo — '}{polo.nome}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {rateioSelecionadosInvalido && (
                    <p className="mt-2 text-[10px] font-bold text-rose-600">
                      Selecione ao menos um polo para o rateio.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Turma (Vínculo para Relatório de Lucro) */}
          <div className="grid grid-cols-1 gap-3 md:col-span-2 md:grid-cols-2">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                Tipo da Turma
              </label>
              <select
                value={turmaModalidade}
                onChange={(e) => {
                  setTurmaModalidade(e.target.value as TurmaModalidade | '');
                  setTurmaId('');
                }}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-sm font-semibold transition-all appearance-none"
              >
                <option value="">Selecionar tipo (opcional)...</option>
                {turmaModalidadeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                Vincular a uma Turma
              </label>
              <select
                value={turmaId}
                onChange={(e) => setTurmaId(e.target.value)}
                disabled={!turmaModalidade}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-sm font-semibold transition-all appearance-none disabled:cursor-not-allowed disabled:text-slate-300 disabled:bg-slate-100"
              >
                <option value="">
                  {turmaModalidade ? 'Nenhuma turma (opcional)...' : 'Selecione o tipo primeiro...'}
                </option>
                {filteredTurmas.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.nome} ({t.codigo})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Anexo */}
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">
              <Paperclip size={11} className="mr-1 inline" />
              Foto ou PDF
            </label>
            <input
              ref={anexoInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              onChange={(event) => handleAnexo(event.target.files?.[0])}
              className="hidden"
            />
            {anexo ? (
              <div className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
                  <Paperclip size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-black text-slate-700">{anexo.name}</p>
                  <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                    {(anexo.size / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} MB
                    {' · '}
                    Armazenamento privado
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAnexo(null);
                    setAnexoErro('');
                    if (anexoInputRef.current) anexoInputRef.current.value = '';
                  }}
                  className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-white hover:text-rose-600"
                  title="Remover anexo"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => anexoInputRef.current?.click()}
                className="group flex w-full items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-left transition-all hover:border-blue-300 hover:bg-blue-50"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm transition-colors group-hover:text-blue-600">
                  <UploadCloud size={17} />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-600">Anexar comprovante ou documento</p>
                  <p className="mt-0.5 text-[10px] font-medium text-slate-400">
                    PDF, JPG, PNG ou WEBP · até 10 MB
                  </p>
                </div>
              </button>
            )}
            {anexoErro ? (
              <p className="mt-1.5 text-[10px] font-bold text-rose-600">{anexoErro}</p>
            ) : null}
          </div>

          {/* Observação */}
          <div className="md:col-span-2">
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
            <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 space-y-3 md:col-span-2">
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
                {splitTotal
                  ? 'O valor total e os ajustes serão divididos de forma canônica no banco, preservando todos os centavos.'
                  : 'Cada parcela manterá o valor informado. Marque “Desdobrar valor total” para o banco dividir o total entre elas.'}
                {' '}O intervalo será de <strong>{intervaloDias} {intervaloUnit}</strong>.
              </p>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-indigo-200 bg-white/80 p-3 text-left">
                <input
                  type="checkbox"
                  checked={splitTotal}
                  onChange={(event) => setSplitTotal(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>
                  <span className="block text-[11px] font-black uppercase tracking-wider text-indigo-800">Desdobrar valor total</span>
                  <span className="mt-0.5 block text-[10px] font-medium text-indigo-600">Ideal para salários e obrigações abertas: o valor informado é dividido entre as parcelas pelo backend.</span>
                </span>
              </label>
            </div>
          )}

          {/* === Modo: Baixa Automática === */}
          {mode === 'baixa' && (
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-3 md:col-span-2">
              <p className="text-xs font-black uppercase tracking-wider text-emerald-700 flex items-center gap-2">
                <CheckCircle2 size={13} /> Dar Baixa Imediata
              </p>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1">
                  Conta Bancária *
                </label>
                <BankAccountPicker
                  accounts={activeContas}
                  value={contaBancariaId}
                  onChange={setContaBancariaId}
                  placeholder="Selecionar conta..."
                  tone="emerald"
                />
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
            <div className="p-3 bg-red-50 rounded-xl border border-red-100 text-red-600 text-xs font-medium md:col-span-2">
              {(createMutation.error as any)?.message || 'Erro ao criar lançamento'}
            </div>
          )}

          {/* Ações */}
          <div className="flex gap-3 pt-2 md:col-span-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 text-sm font-bold uppercase tracking-wide transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || rateioSelecionadosInvalido}
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

  if (typeof document === 'undefined') return modal;
  return createPortal(modal, document.body);
};

export default DespesaForm;
