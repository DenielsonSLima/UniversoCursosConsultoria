import React, { useMemo, useRef, useState } from 'react';
import { Pencil, RefreshCw, X } from 'lucide-react';
import {
  CategoriaFinanceira,
  createFinanceRequestId,
  DespesaLancamento,
  UpdateDespesaInput,
} from '../despesas.service';
import { getDescricaoSemSufixoDeParcela } from './despesaPresentation';

const parseCurrency = (value: string) => (
  Number(value.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.') || 0)
);

const formatCurrencyInput = (value?: number) => (
  Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
);

const normalizeCurrency = (value: string) => {
  const parsed = parseCurrency(value);
  return parsed > 0 ? formatCurrencyInput(parsed) : '0,00';
};

interface DespesaEditModalProps {
  item: DespesaLancamento;
  categorias: CategoriaFinanceira[];
  parceiros: any[];
  turmas: any[];
  onConfirm: (input: UpdateDespesaInput) => void;
  onClose: () => void;
  isPending: boolean;
  tone?: 'rose' | 'indigo';
}

const DespesaEditModal: React.FC<DespesaEditModalProps> = ({
  item,
  categorias,
  parceiros,
  turmas,
  onConfirm,
  onClose,
  isPending,
  tone = 'rose',
}) => {
  const initialDataLancamento = useMemo(
    () => item.dataLancamento || item.createdAt?.slice(0, 10) || item.dataVencimento,
    [item.createdAt, item.dataLancamento, item.dataVencimento],
  );
  const [descricao, setDescricao] = useState(() => getDescricaoSemSufixoDeParcela(item));
  const [valorBase, setValorBase] = useState(() => formatCurrencyInput(item.valorBase));
  const [dataLancamento, setDataLancamento] = useState(initialDataLancamento);
  const [dataVencimento, setDataVencimento] = useState(item.dataVencimento);
  const [categoriaId, setCategoriaId] = useState(item.categoriaFinanceiraId || '');
  const [fornecedorId, setFornecedorId] = useState(item.fornecedorId || '');
  const [turmaId, setTurmaId] = useState(item.turmaId || '');
  const [jurosValor, setJurosValor] = useState(() => formatCurrencyInput(item.jurosValor));
  const [multaValor, setMultaValor] = useState(() => formatCurrencyInput(item.multaValor));
  const [descontoValor, setDescontoValor] = useState(() => formatCurrencyInput(item.descontoValor));
  const [observacao, setObservacao] = useState(item.observacao || '');
  const requestIdRef = useRef(createFinanceRequestId());

  const accent = tone === 'indigo'
    ? {
        label: 'text-indigo-700',
        button: 'bg-indigo-600 hover:bg-indigo-700 focus-visible:ring-indigo-500',
        ring: 'focus:border-indigo-400 focus:ring-indigo-100',
        soft: 'border-indigo-100 bg-indigo-50 text-indigo-800',
      }
    : {
        label: 'text-rose-700',
        button: 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500',
        ring: 'focus:border-rose-400 focus:ring-rose-100',
        soft: 'border-rose-100 bg-rose-50 text-rose-800',
      };

  const canSubmit = (
    descricao.trim().length > 0
    && parseCurrency(valorBase) > 0
    && Boolean(dataLancamento)
    && Boolean(dataVencimento)
    && dataVencimento >= dataLancamento
  );

  const currencyFields = [
    { label: 'Juros', value: jurosValor, setValue: setJurosValor },
    { label: 'Multa', value: multaValor, setValue: setMultaValor },
    { label: 'Desconto', value: descontoValor, setValue: setDescontoValor },
  ];

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    onConfirm({
      requestId: requestIdRef.current,
      descricao: descricao.trim(),
      valorBase: parseCurrency(valorBase),
      dataLancamento,
      dataVencimento,
      jurosValor: parseCurrency(jurosValor),
      multaValor: parseCurrency(multaValor),
      descontoValor: parseCurrency(descontoValor),
      categoriaFinanceiraId: categoriaId || undefined,
      fornecedorId: fornecedorId || undefined,
      observacao: observacao.trim() || undefined,
      turmaId: turmaId || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="editar-despesa-title"
        onSubmit={submit}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl animate-fadeIn"
      >
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 id="editar-despesa-title" className="text-lg font-black uppercase tracking-tight text-[#001a33]">Editar lançamento</h3>
            <p className="mt-1 text-xs font-medium text-slate-500">Altere os dados da conta antes da baixa.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </header>

        {item.totalParcelas > 1 && (
          <p className={`mb-5 rounded-2xl border px-4 py-3 text-xs font-semibold leading-5 ${accent.soft}`}>
            Esta edição vale somente para a parcela {item.parcelaNumero}/{item.totalParcelas}. Para refazer todo o parcelamento, cancele as parcelas necessárias e lance novamente.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="md:col-span-2">
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Descrição *</span>
            <input
              value={descricao}
              onChange={(event) => setDescricao(event.target.value)}
              className={`w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition-colors focus:ring-2 ${accent.ring}`}
            />
          </label>

          <label>
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Valor-base *</span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
              <input
                value={valorBase}
                inputMode="decimal"
                onChange={(event) => setValorBase(event.target.value)}
                onBlur={(event) => setValorBase(normalizeCurrency(event.target.value))}
                className={`w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm font-semibold text-slate-700 outline-none transition-colors focus:ring-2 ${accent.ring}`}
              />
            </div>
          </label>

          <label>
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Categoria</span>
            <select
              value={categoriaId}
              onChange={(event) => setCategoriaId(event.target.value)}
              className={`w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition-colors focus:ring-2 ${accent.ring}`}
            >
              <option value="">Sem categoria</option>
              {categorias.map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>)}
            </select>
          </label>

          <label>
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Data de lançamento *</span>
            <input
              type="date"
              value={dataLancamento}
              onChange={(event) => setDataLancamento(event.target.value)}
              className={`w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition-colors focus:ring-2 ${accent.ring}`}
            />
          </label>

          <label>
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Data de vencimento *</span>
            <input
              type="date"
              value={dataVencimento}
              min={dataLancamento || undefined}
              onChange={(event) => setDataVencimento(event.target.value)}
              className={`w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition-colors focus:ring-2 ${accent.ring}`}
            />
          </label>

          <label>
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Fornecedor</span>
            <select
              value={fornecedorId}
              onChange={(event) => setFornecedorId(event.target.value)}
              className={`w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition-colors focus:ring-2 ${accent.ring}`}
            >
              <option value="">Fornecedor não informado</option>
              {parceiros.map((parceiro) => <option key={parceiro.id} value={parceiro.id}>{parceiro.nome}</option>)}
            </select>
          </label>

          <label>
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Turma vinculada</span>
            <select
              value={turmaId}
              onChange={(event) => setTurmaId(event.target.value)}
              className={`w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition-colors focus:ring-2 ${accent.ring}`}
            >
              <option value="">Sem turma vinculada</option>
              {turmas.map((turma) => <option key={turma.id} value={turma.id}>{turma.nome}</option>)}
            </select>
          </label>

          {currencyFields.map((field) => (
            <label key={field.label}>
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">{field.label}</span>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                <input
                  value={field.value}
                  inputMode="decimal"
                  onChange={(event) => field.setValue(event.target.value)}
                  onBlur={(event) => field.setValue(normalizeCurrency(event.target.value))}
                  className={`w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm font-semibold text-slate-700 outline-none transition-colors focus:ring-2 ${accent.ring}`}
                />
              </div>
            </label>
          ))}

          <label className="md:col-span-2">
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Observação</span>
            <textarea
              value={observacao}
              onChange={(event) => setObservacao(event.target.value)}
              rows={3}
              className={`w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 outline-none transition-colors focus:ring-2 ${accent.ring}`}
            />
          </label>
        </div>

        <footer className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold uppercase text-slate-500 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!canSubmit || isPending}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-black uppercase tracking-wide text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${accent.button}`}
          >
            {isPending ? <RefreshCw size={15} className="animate-spin" /> : <Pencil size={15} />}
            Salvar alterações
          </button>
        </footer>
      </form>
    </div>
  );
};

export default DespesaEditModal;
