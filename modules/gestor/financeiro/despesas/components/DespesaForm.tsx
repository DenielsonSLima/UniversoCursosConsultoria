import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ContaBancaria } from '../../financeiro.service';
import { financeiroQueryKeys } from '../../financeiro.queryKeys';
import { isContaDisponivelNoPolo } from '../../financeiro.service';
import { caixaQueryKeys } from '../../../caixa/caixa.service';
import { invalidateConveniosScope } from '../../convenios/convenios.cache';
import { useConveniosListQuery } from '../../convenios/hooks/useConveniosQueries';
import {
  createFinanceRequestId,
  despesasService,
  type DespesaLancamento,
} from '../despesas.service';
import { despesasQueryKeys, type DespesaTipo } from '../despesas.queryKeys';
import { useCategoriasFinanceirasQuery } from '../hooks/useCategoriasFinanceirasQuery';
import type { DespesaCredorTipo } from './DespesaCredorPicker';
import DespesaFormAssociations from './DespesaFormAssociations';
import DespesaFormCoreFields from './DespesaFormCoreFields';
import DespesaFormSettlementFields from './DespesaFormSettlementFields';
import {
  getTurmaModalidade,
  parseCurrencyInput,
  today,
  type IntervaloUnit,
  type LancamentoMode,
  type RateioPolo,
  type RateioSelection,
  type TurmaModalidade,
} from './despesa-form.utils';

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

const tipoLabel: Record<DespesaTipo, string> = {
  DESPESA_FIXA: 'Despesa Fixa',
  DESPESA_VARIAVEL: 'Despesa Variável',
  OUTRO_DEBITO: 'Outro Débito',
};

const DespesaForm: React.FC<DespesaFormProps> = ({
  tipo, poloId, polos, contas, parceiros, turmas, onClose, onSuccess,
}) => {
  const queryClient = useQueryClient();
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
  const [formaPagamento, setFormaPagamento] = useState('PIX');
  const [rateioSelection, setRateioSelection] = useState<RateioSelection>('DESLIGADO');
  const [polosSelecionados, setPolosSelecionados] = useState<Set<string>>(() => new Set());
  const [convenioMesId, setConvenioMesId] = useState('');
  const [showCategoriaModal, setShowCategoriaModal] = useState(false);
  const categoriaSelectRef = useRef<HTMLDivElement>(null);
  const anexoInputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(createFinanceRequestId());

  const categoriasQuery = useCategoriasFinanceirasQuery(tipo);
  const conveniosQuery = useConveniosListQuery(poloId, 'ABERTOS', '');
  const categorias = categoriasQuery.data || [];
  const convenios = conveniosQuery.data?.itens || [];
  const filteredTurmas = useMemo(() => turmaModalidade
    ? turmas.filter((turma) => getTurmaModalidade(turma) === turmaModalidade)
    : [], [turmaModalidade, turmas]);
  const isPoloMatriz = polos.find((polo) => polo.id === poloId)?.is_matriz === true;
  const polosRateio = useMemo(() => polos.filter((polo) => Boolean(polo.id)), [polos]);
  const activeContas = useMemo(() => contas.filter(
    (conta) => conta.ativo !== false && isContaDisponivelNoPolo(conta, poloId),
  ), [contas, poloId]);
  const rateioSelecionadosInvalido = rateioSelection === 'SELECIONADOS'
    && polosSelecionados.size === 0;

  const createMutation = useMutation({
    mutationFn: () => despesasService.createDespesa({
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
      rateio: rateioSelection === 'DESLIGADO' ? undefined : {
        modo: rateioSelection,
        poloIds: rateioSelection === 'SELECIONADOS'
          ? Array.from(polosSelecionados)
          : undefined,
      },
      convenioMesId: convenioMesId || undefined,
      anexo: anexo || undefined,
    }),
    onSuccess: async (created) => {
      const invalidations: Promise<unknown>[] = [
        queryClient.invalidateQueries({ queryKey: despesasQueryKeys.lancamentosRoot }),
        queryClient.invalidateQueries({ queryKey: despesasQueryKeys.summaryRoot }),
        queryClient.invalidateQueries({ queryKey: despesasQueryKeys.groupSummaryRoot }),
      ];
      if (convenioMesId) {
        invalidations.push(invalidateConveniosScope(queryClient, poloId, convenioMesId));
      }
      if (mode === 'baixa') {
        invalidations.push(
          queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos }),
          queryClient.invalidateQueries({ queryKey: caixaQueryKeys.statementsForPolo(poloId) }),
          queryClient.invalidateQueries({ queryKey: caixaQueryKeys.custosOperacionaisForPolo(poloId) }),
        );
      }
      await Promise.all(invalidations);
      requestIdRef.current = createFinanceRequestId();
      onSuccess(created, mode);
    },
  });

  useEffect(() => {
    if (turmaId && !filteredTurmas.some((turma) => turma.id === turmaId)) setTurmaId('');
  }, [filteredTurmas, turmaId]);

  useEffect(() => {
    if (contaBancariaId && !activeContas.some((conta) => conta.id === contaBancariaId)) {
      setContaBancariaId('');
    }
  }, [activeContas, contaBancariaId]);

  useEffect(() => {
    if (!isPoloMatriz) {
      setRateioSelection('DESLIGADO');
      setPolosSelecionados(new Set());
    }
  }, [isPoloMatriz]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!descricao.trim() || !parseCurrencyInput(valor)) return;
    if (mode === 'baixa' && !contaBancariaId) return;
    if (rateioSelecionadosInvalido) return;
    createMutation.mutate();
  };

  const togglePoloRateio = (id: string) => setPolosSelecionados((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleAnexo = (file?: File) => {
    setAnexoErro('');
    if (!file) return setAnexo(null);
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return setAnexoErro('Anexe um arquivo PDF, JPG, PNG ou WEBP.');
    }
    if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
      return setAnexoErro('O anexo deve ter no máximo 10 MB.');
    }
    setAnexo(file);
  };

  const modal = <div className="fixed left-0 top-0 z-[200] flex h-screen h-[100dvh] w-screen items-center justify-center overflow-hidden bg-black/40 p-4 backdrop-blur-sm overscroll-contain">
    <div className="max-h-[calc(100dvh-2rem)] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-8 pb-4 pt-8">
        <div><h3 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Novo Lançamento</h3>
          <p className="mt-0.5 text-xs font-bold uppercase tracking-wider text-rose-500">{tipoLabel[tipo]}</p></div>
        <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={20} /></button>
      </div>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 px-8 py-6 md:grid-cols-2">
        <DespesaFormCoreFields {...{
          mode, setMode, dataLancamento, setDataLancamento, dataVencimento, setDataVencimento,
          categoriaId, setCategoriaId, categorias, tipo, showCategoriaModal, setShowCategoriaModal,
          categoriaSelectRef, descricao, setDescricao, valor, setValor, parceiros, fornecedorTipo,
          setFornecedorTipo, fornecedorId, setFornecedorId, jurosValor, setJurosValor, multaValor,
          setMultaValor, descontoValor, setDescontoValor,
        }} convenioVinculado={Boolean(convenioMesId)} />
        <DespesaFormAssociations {...{
          mode, convenioMesId, convenios, isPoloMatriz, rateioSelection, polosRateio,
          polosSelecionados, togglePoloRateio, rateioSelecionadosInvalido, turmaModalidade,
          setTurmaModalidade, turmaId, setTurmaId, filteredTurmas, anexo, anexoErro,
          anexoInputRef, handleAnexo, observacao, setObservacao,
        }} setConvenioMesId={setConvenioMesId} setRateioSelection={setRateioSelection}
          conveniosLoading={conveniosQuery.isPending}
          conveniosError={conveniosQuery.isError && !conveniosQuery.data}
          clearAnexo={() => { setAnexo(null); setAnexoErro(''); if (anexoInputRef.current) anexoInputRef.current.value = ''; }} />
        <DespesaFormSettlementFields {...{
          mode, totalParcelas, setTotalParcelas, intervaloDias, setIntervaloDias, intervaloUnit,
          setIntervaloUnit, splitTotal, setSplitTotal, activeContas, contaBancariaId,
          setContaBancariaId, formaPagamento, setFormaPagamento,
        }} />
        {createMutation.isError && <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-medium text-red-600 md:col-span-2">
          {(createMutation.error as any)?.message || 'Erro ao criar lançamento'}
        </div>}
        <div className="flex gap-3 pt-2 md:col-span-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold uppercase tracking-wide text-slate-500 hover:bg-slate-50">Cancelar</button>
          <button type="submit" disabled={createMutation.isPending || rateioSelecionadosInvalido}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 py-3 text-sm font-black uppercase tracking-wide text-white shadow-md shadow-rose-900/20 hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60">
            {createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {mode === 'parcelado' ? `Lançar ${totalParcelas} Parcelas` : mode === 'baixa' ? 'Lançar e Dar Baixa' : 'Lançar'}
          </button>
        </div>
      </form>
    </div>
  </div>;

  return typeof document === 'undefined' ? modal : createPortal(modal, document.body);
};

export default DespesaForm;
