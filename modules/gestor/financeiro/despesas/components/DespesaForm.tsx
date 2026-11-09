import React, { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
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
import { useDespesaSugestao } from '../hooks/useDespesaSugestao';
import type { DespesaCredorTipo } from './DespesaCredorPicker';
import DespesaFormAssociations from './DespesaFormAssociations';
import DespesaFormNotes from './DespesaFormNotes';
import DespesaFormCoreFields from './DespesaFormCoreFields';
import DespesaFormSettlementFields from './DespesaFormSettlementFields';
import DespesaNovoCredorModal from './DespesaNovoCredorModal';
import { resolveDespesaCloneCategoria, type DespesaCloneDraft } from './despesa-clone.model';
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
  cloneDraft?: DespesaCloneDraft | null;
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
  tipo, poloId, polos, contas, parceiros, turmas, onClose, onSuccess, cloneDraft,
}) => {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<LancamentoMode>(cloneDraft?.pago ? 'baixa' : 'pendente');
  const [dataPagamento, setDataPagamento] = useState(cloneDraft?.dataPagamento || cloneDraft?.dataLancamento || today());
  const [dataLancamento, setDataLancamento] = useState(cloneDraft?.dataLancamento || today());
  const [dataVencimento, setDataVencimento] = useState(cloneDraft?.dataVencimento || today());
  const [fornecedorTipo, setFornecedorTipo] = useState<DespesaCredorTipo | ''>('');
  const [fornecedorId, setFornecedorId] = useState('');
  const [showNovoCredor, setShowNovoCredor] = useState(false);
  const [novosCredores, setNovosCredores] = useState<any[]>([]);
  const credores = useMemo(() => [
    ...parceiros,
    ...novosCredores.filter((created) => !parceiros.some((item) => item.id === created.id)),
  ], [parceiros, novosCredores]);
  const [jurosValor, setJurosValor] = useState(cloneDraft?.jurosValor || '');
  const [multaValor, setMultaValor] = useState(cloneDraft?.multaValor || '');
  const [descontoValor, setDescontoValor] = useState(cloneDraft?.descontoValor || '');
  const [anexo, setAnexo] = useState<File | null>(null);
  const [anexoErro, setAnexoErro] = useState('');
  const [turmaModalidade, setTurmaModalidade] = useState<TurmaModalidade | ''>('');
  const [turmaId, setTurmaId] = useState('');
  const [observacao, setObservacao] = useState('');
  const [totalParcelas, setTotalParcelas] = useState(2);
  const [splitTotal, setSplitTotal] = useState(false);
  const [intervaloDias, setIntervaloDias] = useState(30);
  const [intervaloUnit, setIntervaloUnit] = useState<IntervaloUnit>('meses');
  const [contaBancariaId, setContaBancariaId] = useState(cloneDraft?.contaBancariaId || '');
  const [formaPagamento, setFormaPagamento] = useState(cloneDraft?.formaPagamento || 'PIX');
  const [rateioSelection, setRateioSelection] = useState<RateioSelection>('DESLIGADO');
  const [polosSelecionados, setPolosSelecionados] = useState<Set<string>>(() => new Set());
  const [convenioMesId, setConvenioMesId] = useState('');
  const [showCategoriaModal, setShowCategoriaModal] = useState(false);
  const formRef = useRef<ComponentRef<'form'>>(null);
  const categoriaSelectRef = useRef<HTMLDivElement>(null);
  const anexoInputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(createFinanceRequestId());

  const categoriasQuery = useCategoriasFinanceirasQuery(tipo);
  const sugestao = useDespesaSugestao(
    poloId, tipo, fornecedorId, categoriasQuery.data, !categoriasQuery.isPending, cloneDraft,
  );
  const { descricao, setDescricao, valor, setValor, categoriaId: categoriaSelecionada, setCategoriaId } = sugestao;
  const conferirCategoriaOriginal = Boolean(cloneDraft?.categoriaId && categoriaSelecionada === cloneDraft.categoriaId);
  const categoriaId = conferirCategoriaOriginal && categoriasQuery.isSuccess
    ? resolveDespesaCloneCategoria(categoriaSelecionada, categoriasQuery.data) : categoriaSelecionada;
  const categoriaCloneIndisponivel = Boolean(cloneDraft && categoriaSelecionada && !categoriaId);
  const conferirCategoria = conferirCategoriaOriginal && !categoriasQuery.isSuccess;
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
      dataPagamento: cloneDraft ? (mode === 'baixa' ? dataPagamento : null) : undefined,
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

  useEffect(() => {
    if (cloneDraft) formRef.current?.querySelector('input')?.focus();
  }, [cloneDraft]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (conferirCategoria || !descricao.trim() || !parseCurrencyInput(valor)) return;
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

  const modal = <div inert={showNovoCredor || undefined} aria-hidden={showNovoCredor || undefined}
    className="financial-dialog-overlay fixed left-0 top-0 z-[200] flex h-screen h-[100dvh] w-screen items-center justify-center overflow-hidden bg-black/40 p-4 backdrop-blur-sm overscroll-contain">
    <div className="financial-dialog max-h-[calc(100dvh-2rem)] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
      <div className="financial-dialog-header sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-8 pb-4 pt-8">
        <div><h3 className="text-lg font-black uppercase tracking-tight text-[#001a33]">{cloneDraft ? 'Clonar Lançamento' : 'Novo Lançamento'}</h3>
          <p className="mt-0.5 text-xs font-bold uppercase tracking-wider text-rose-500">{tipoLabel[tipo]}</p></div>
        <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={20} /></button>
      </div>
      <form ref={formRef} onSubmit={handleSubmit} className="financial-dialog-body grid grid-cols-1 gap-4 px-8 py-6 md:grid-cols-2">
        <DespesaFormCoreFields {...{
          mode, setMode, dataLancamento, setDataLancamento, dataVencimento, setDataVencimento,
          categoriaId, setCategoriaId, categorias, tipo, showCategoriaModal, setShowCategoriaModal,
          categoriaSelectRef, descricao, setDescricao, valor, setValor, fornecedorTipo,
          setFornecedorTipo, fornecedorId, setFornecedorId, jurosValor, setJurosValor, multaValor,
          setMultaValor, descontoValor, setDescontoValor,
        }} parceiros={credores} sugestao={sugestao} onNovoCredor={() => setShowNovoCredor(true)}
          convenioVinculado={Boolean(convenioMesId)} />
        {categoriaCloneIndisponivel && <p role="status" className="text-xs text-amber-700 md:col-span-2">A categoria original está indisponível. Selecione outra ou deixe sem categoria.</p>}
        {conferirCategoria && <p role="status" className="text-xs text-slate-500 md:col-span-2">
          {categoriasQuery.isError ? 'Não foi possível conferir a categoria copiada.' : 'Conferindo a categoria copiada…'}
          {categoriasQuery.isError && <button type="button" onClick={() => { void categoriasQuery.refetch(); }} className="ml-2 font-semibold text-rose-600 underline">Tentar novamente</button>}
        </p>}
        <DespesaFormAssociations {...{
          mode, convenioMesId, convenios, isPoloMatriz, rateioSelection, polosRateio,
          polosSelecionados, togglePoloRateio, rateioSelecionadosInvalido, turmaModalidade,
          setTurmaModalidade, turmaId, setTurmaId, filteredTurmas,
        }} setConvenioMesId={setConvenioMesId} setRateioSelection={setRateioSelection}
          conveniosLoading={conveniosQuery.isPending}
          conveniosError={conveniosQuery.isError && !conveniosQuery.data} />
        {cloneDraft && mode === 'baixa' && <div className="md:col-span-2">
          <label htmlFor="clone-data-pagamento" className="mb-1 block text-xs font-semibold text-slate-500">Data do pagamento *</label>
          <input id="clone-data-pagamento" type="date" required value={dataPagamento} onChange={(event) => setDataPagamento(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-rose-500" />
        </div>}
        <DespesaFormSettlementFields {...{
          mode, totalParcelas, setTotalParcelas, intervaloDias, setIntervaloDias, intervaloUnit,
          setIntervaloUnit, splitTotal, setSplitTotal, activeContas, contaBancariaId,
          setContaBancariaId, formaPagamento, setFormaPagamento,
        }} />
        <DespesaFormNotes {...{ anexo, anexoErro, anexoInputRef, handleAnexo, observacao, setObservacao }}
          clearAnexo={() => { setAnexo(null); setAnexoErro(''); if (anexoInputRef.current) anexoInputRef.current.value = ''; }} />
        {createMutation.isError && <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-medium text-red-600 md:col-span-2">
          {(createMutation.error as any)?.message || 'Erro ao criar lançamento'}
        </div>}
        <div className="financial-dialog-footer flex gap-3 pt-2 md:col-span-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold uppercase tracking-wide text-slate-500 hover:bg-slate-50">Cancelar</button>
          <button type="submit" disabled={createMutation.isPending || rateioSelecionadosInvalido || conferirCategoria}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 py-3 text-sm font-black uppercase tracking-wide text-white shadow-md shadow-rose-900/20 hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60">
            {createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {mode === 'parcelado' ? `Lançar ${totalParcelas} Parcelas` : mode === 'baixa' ? 'Lançar e Dar Baixa' : 'Lançar'}
          </button>
        </div>
      </form>
    </div>
  </div>;

  return <>
    {typeof document === 'undefined' ? modal : createPortal(modal, document.body)}
    {showNovoCredor && fornecedorTipo ? <DespesaNovoCredorModal tipo={fornecedorTipo} poloId={poloId}
      onClose={() => setShowNovoCredor(false)} onCreated={(created) => {
        setNovosCredores((current) => [...current.filter((item) => item.id !== created.id), created]);
        setFornecedorId(created.id);
        setShowNovoCredor(false);
      }} /> : null}
  </>;
};

export default DespesaForm;


