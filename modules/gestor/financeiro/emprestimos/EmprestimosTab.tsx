import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileOutput,
  Landmark,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  Search,
} from 'lucide-react';

import ToastNotification, { useToast } from '../../components/ToastNotification';
import { caixaQueryKeys } from '../../caixa/caixa.service';
import { textMatchesSearch } from '../../../../lib/search';
import {
  isContaDisponivelNoPolo,
  type FinanceiroPolo,
} from '../financeiro.service';
import { financeiroQueryKeys } from '../financeiro.queryKeys';
import { useFinanceiroSharedQueries } from '../hooks/useFinanceiroSharedQueries';
import {
  emprestimosFinanciamentoScopes,
  emprestimosQueryKeys,
} from './emprestimos.queryKeys';
import { emprestimosService } from './emprestimos.service';
import type {
  BaixarEmprestimoParcelasInput,
  CancelarOuEstornarEmprestimoInput,
  EmprestimoFinanceiro,
  EmprestimoParcela,
  EmprestimoStatusScope,
} from './emprestimos.types';
import { useEmprestimosQuery } from './hooks/useEmprestimosQueries';
import { useEmprestimosRealtime } from './hooks/useEmprestimosRealtime';
import EmprestimoBaixaModal from './components/EmprestimoBaixaModal';
import EmprestimoCard from './components/EmprestimoCard';
import EmprestimoDetailsPage from './components/EmprestimoDetailsPage';
import EmprestimoForm from './components/EmprestimoForm';
import EmprestimoLifecycleModal from './components/EmprestimoLifecycleModal';
import EmprestimosExportModal from './components/EmprestimosExportModal';
import EmprestimosTable from './components/EmprestimosTable';

interface EmprestimosTabProps {
  poloId?: string | null;
  isMatriz: boolean;
}

type EmprestimosViewMode = 'cards' | 'table';
type EmprestimosListScope = Extract<EmprestimoStatusScope, 'ATIVOS' | 'FINALIZADOS'>;

interface BaixaEmprestimoMutationInput {
  input: BaixarEmprestimoParcelasInput;
  emprestimo: EmprestimoFinanceiro;
}

interface LifecycleMutationInput {
  input: CancelarOuEstornarEmprestimoInput;
  emprestimo: EmprestimoFinanceiro;
}

interface BaixaSelection {
  emprestimoId: string;
  initialParcelaId?: string;
}

const getPoloResponsavelId = (
  scopedPoloId: string | null | undefined,
  polos: FinanceiroPolo[],
) => {
  if (scopedPoloId && scopedPoloId !== 'todos') return scopedPoloId;
  return polos.find((polo) => polo.is_matriz)?.id || '';
};

const isInScope = (item: EmprestimoFinanceiro, scope: EmprestimosListScope) => (
  scope === 'ATIVOS' ? item.status === 'ATIVO' : item.status === 'QUITADO' || item.status === 'CANCELADO'
);

const EmprestimosTab: React.FC<EmprestimosTabProps> = ({ poloId: scopedPoloId, isMatriz }) => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [statusScope, setStatusScope] = useState<EmprestimosListScope>('ATIVOS');
  const [viewMode, setViewMode] = useState<EmprestimosViewMode>('table');
  const [showForm, setShowForm] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [selectedEmprestimoId, setSelectedEmprestimoId] = useState<string | null>(null);
  const [baixaSelection, setBaixaSelection] = useState<BaixaSelection | null>(null);
  const [lifecycleEmprestimoId, setLifecycleEmprestimoId] = useState<string | null>(null);

  const { polosQuery } = useFinanceiroSharedQueries({
    accounts: false,
    partners: false,
    polos: true,
  });
  const polos = polosQuery.data || [];
  const poloResponsavelId = useMemo(
    () => getPoloResponsavelId(scopedPoloId, polos),
    [polos, scopedPoloId],
  );
  const poloResponsavelNome = useMemo(
    () => polos.find((polo) => polo.id === poloResponsavelId)?.nome || (isMatriz ? 'Matriz' : 'Polo selecionado'),
    [isMatriz, poloResponsavelId, polos],
  );

  const { accountsQuery } = useFinanceiroSharedQueries({
    accounts: Boolean(poloResponsavelId),
    partners: false,
    polos: false,
    poloId: poloResponsavelId,
  });
  const contasPoloResponsavel = useMemo(
    () => (accountsQuery.data || []).filter(
      (conta) => conta.ativo !== false && isContaDisponivelNoPolo(conta, poloResponsavelId),
    ),
    [accountsQuery.data, poloResponsavelId],
  );

  const emprestimosQuery = useEmprestimosQuery(poloResponsavelId, Boolean(poloResponsavelId));
  useEmprestimosRealtime(poloResponsavelId, Boolean(poloResponsavelId));

  const emprestimos = emprestimosQuery.data || [];
  const selectedEmprestimo = emprestimos.find((item) => item.id === selectedEmprestimoId) || null;
  const baixaEmprestimo = emprestimos.find((item) => item.id === baixaSelection?.emprestimoId) || null;
  const lifecycleEmprestimo = emprestimos.find((item) => item.id === lifecycleEmprestimoId) || null;

  useEffect(() => {
    if (selectedEmprestimoId && !selectedEmprestimo && !emprestimosQuery.isPending) {
      setSelectedEmprestimoId(null);
    }
  }, [emprestimosQuery.isPending, selectedEmprestimo, selectedEmprestimoId]);

  const counts = useMemo(() => ({
    ativos: emprestimos.filter((item) => item.status === 'ATIVO').length,
    finalizados: emprestimos.filter((item) => item.status === 'QUITADO' || item.status === 'CANCELADO').length,
  }), [emprestimos]);
  const scopedEmprestimos = useMemo(
    () => emprestimos.filter((item) => isInScope(item, statusScope)),
    [emprestimos, statusScope],
  );
  const filteredEmprestimos = useMemo(() => {
    if (!deferredSearch.trim()) return scopedEmprestimos;
    return scopedEmprestimos.filter((emprestimo) => textMatchesSearch(deferredSearch, [
      emprestimo.credorNome,
      emprestimo.descricao,
      emprestimo.status,
      emprestimo.observacao,
      emprestimo.contaCredito?.banco,
      emprestimo.contaCredito?.titular,
      emprestimo.contaCredito?.agencia,
      emprestimo.contaCredito?.conta,
      ...emprestimo.parcelas.flatMap((parcela) => parcela.rateios.map((rateio) => rateio.poloNome)),
    ]));
  }, [deferredSearch, scopedEmprestimos]);

  const invalidateLoanState = async (emprestimo: EmprestimoFinanceiro) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: emprestimosQueryKeys.list(poloResponsavelId) }),
      ...(['ATIVOS', 'FINALIZADOS', 'TODOS'] as EmprestimoStatusScope[]).map((scope) => (
        queryClient.invalidateQueries({ queryKey: emprestimosQueryKeys.export(poloResponsavelId, scope) })
      )),
      queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos }),
      queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
      queryClient.invalidateQueries({ queryKey: caixaQueryKeys.dashboards }),
      ...emprestimosFinanciamentoScopes(poloResponsavelId, emprestimo).map((scope) => (
        queryClient.invalidateQueries({
          queryKey: caixaQueryKeys.financiamentoResumosForPolo(scope),
        })
      )),
    ]);
  };

  const baixaMutation = useMutation({
    mutationFn: ({ input }: BaixaEmprestimoMutationInput) => emprestimosService.baixarParcelas(input),
    onSuccess: async (result, { emprestimo }) => {
      await invalidateLoanState(emprestimo);
      setBaixaSelection(null);
      toast.success(
        result.replayed ? 'Baixa já registrada' : 'Baixa confirmada',
        result.replayed
          ? 'A mesma solicitação já havia sido processada pelo backend.'
          : 'As parcelas selecionadas e seus rateios canônicos foram atualizados.',
      );
    },
    onError: (error: Error) => {
      toast.error('Erro ao dar baixa', error.message || 'Não foi possível registrar o pagamento.');
    },
  });

  const lifecycleMutation = useMutation({
    mutationFn: ({ input }: LifecycleMutationInput) => emprestimosService.cancelarOuEstornar(input),
    onSuccess: async (result, { emprestimo }) => {
      await invalidateLoanState(emprestimo);
      setLifecycleEmprestimoId(null);
      toast.success(
        result.replayed ? 'Operação já registrada' : result.estornado ? 'Empréstimo estornado' : 'Empréstimo excluído',
        result.replayed
          ? 'A mesma solicitação já havia sido processada pelo backend.'
          : result.estornado
            ? 'O contrato foi cancelado e seu efeito financeiro preservado como estorno auditável.'
            : 'O contrato saiu das listagens ativas e foi preservado no histórico.',
      );
    },
    onError: (error: Error) => {
      toast.error('Erro ao processar empréstimo', error.message || 'Não foi possível concluir a operação.');
    },
  });

  const openBaixa = (emprestimo: EmprestimoFinanceiro, parcela?: EmprestimoParcela) => {
    setBaixaSelection({ emprestimoId: emprestimo.id, initialParcelaId: parcela?.id });
  };

  const renderOverlays = () => (
    <>
      {showForm && (
        <EmprestimoForm
          poloResponsavelId={poloResponsavelId}
          poloResponsavelNome={poloResponsavelNome}
          isMatriz={isMatriz}
          polos={polos}
          contas={contasPoloResponsavel}
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            toast.success(
              'Empréstimo registrado',
              isMatriz
                ? 'Crédito, conta de destino, parcelas, Contas a Pagar e rateios foram criados pelo backend.'
                : 'Crédito, conta de destino, parcelas e Contas a Pagar foram criados para este polo.',
            );
          }}
        />
      )}

      {baixaSelection && baixaEmprestimo && (
        <EmprestimoBaixaModal
          key={`${baixaEmprestimo.id}:${baixaSelection.initialParcelaId || 'todas'}`}
          emprestimo={baixaEmprestimo}
          initialParcelaId={baixaSelection.initialParcelaId}
          poloResponsavelId={poloResponsavelId}
          poloResponsavelNome={poloResponsavelNome}
          contas={contasPoloResponsavel}
          isPending={baixaMutation.isPending}
          error={baixaMutation.error as Error | null}
          onClose={() => {
            if (!baixaMutation.isPending) setBaixaSelection(null);
          }}
          onConfirm={(input) => baixaMutation.mutate({ input, emprestimo: baixaEmprestimo })}
        />
      )}

      {lifecycleEmprestimo && (
        <EmprestimoLifecycleModal
          key={lifecycleEmprestimo.id}
          emprestimo={lifecycleEmprestimo}
          poloResponsavelId={poloResponsavelId}
          isPending={lifecycleMutation.isPending}
          error={lifecycleMutation.error as Error | null}
          onClose={() => {
            if (!lifecycleMutation.isPending) setLifecycleEmprestimoId(null);
          }}
          onConfirm={(input) => lifecycleMutation.mutate({ input, emprestimo: lifecycleEmprestimo })}
        />
      )}

      <EmprestimosExportModal
        open={showExport}
        poloId={poloResponsavelId}
        statusScope={statusScope}
        onClose={() => setShowExport(false)}
      />
    </>
  );

  if (selectedEmprestimo) {
    return (
      <div className="space-y-5 animate-fadeIn">
        <ToastNotification toasts={toasts} onRemove={removeToast} />
        <EmprestimoDetailsPage
          emprestimo={selectedEmprestimo}
          canSettle={Boolean(poloResponsavelId)}
          onBack={() => setSelectedEmprestimoId(null)}
          onSettle={(parcela) => openBaixa(selectedEmprestimo, parcela)}
          onLifecycle={() => setLifecycleEmprestimoId(selectedEmprestimo.id)}
          onExport={() => setShowExport(true)}
        />
        {renderOverlays()}
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fadeIn">
      <ToastNotification toasts={toasts} onRemove={removeToast} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-indigo-600"><Landmark size={16} /> {isMatriz ? 'Gestão centralizada' : 'Gestão por polo'}</p>
          <h3 className="mt-1 text-2xl font-black uppercase tracking-tight text-[#001a33]">Empréstimos</h3>
          <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">
            {isMatriz
              ? 'Crédito entra na conta selecionada da Matriz; parcelas e rateios são obrigações canônicas dos polos.'
              : 'Crédito, conta de destino, parcelas e Contas a Pagar pertencem exclusivamente a este polo.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowExport(true)} disabled={!poloResponsavelId} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-indigo-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-wider text-indigo-700 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"><FileOutput size={16} /> Exportar PDF</button>
          <button type="button" onClick={() => setShowForm(true)} disabled={!poloResponsavelId || polosQuery.isPending} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-indigo-900/15 transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"><Plus size={16} /> Novo empréstimo</button>
        </div>
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 px-4 py-3 text-xs font-medium leading-relaxed text-slate-600">
        <strong className="font-black text-indigo-700">Polo responsável:</strong> {poloResponsavelNome}. Valores, desdobramento das parcelas, conta de crédito, rateio e baixa são processados pelo backend; a tela apenas envia os dados solicitados e mostra o retorno canônico.
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm lg:flex-row lg:items-center">
        <div className="flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Situação dos empréstimos">
          {([
            ['ATIVOS', 'Ativos', counts.ativos],
            ['FINALIZADOS', 'Finalizados', counts.finalizados],
          ] as const).map(([scope, label, count]) => (
            <button key={scope} type="button" role="tab" aria-selected={statusScope === scope} onClick={() => setStatusScope(scope)} className={`rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wide transition-colors ${statusScope === scope ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {label} <span className={`ml-1 rounded-full px-1.5 py-0.5 ${statusScope === scope ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-200 text-slate-500'}`}>{count}</span>
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por credor, contrato ou conta..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm font-medium outline-none transition-all placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="inline-flex shrink-0 rounded-xl border border-slate-200 bg-white p-1" aria-label="Forma de visualização">
          <button type="button" onClick={() => setViewMode('cards')} aria-label="Visualizar como cards" aria-pressed={viewMode === 'cards'} className={`rounded-lg p-2 transition-colors ${viewMode === 'cards' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-400 hover:text-slate-700'}`}><LayoutGrid size={16} /></button>
          <button type="button" onClick={() => setViewMode('table')} aria-label="Visualizar como tabela" aria-pressed={viewMode === 'table'} className={`rounded-lg p-2 transition-colors ${viewMode === 'table' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-400 hover:text-slate-700'}`}><List size={16} /></button>
        </div>
      </div>

      {polosQuery.isPending || emprestimosQuery.isPending ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-100 py-16 text-sm font-bold text-slate-400"><Loader2 size={18} className="animate-spin" /> Carregando empréstimos...</div>
      ) : emprestimosQuery.isError ? (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-5 py-4 text-sm font-bold text-rose-700">Não foi possível carregar os empréstimos deste polo. {(emprestimosQuery.error as Error)?.message || ''}</div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredEmprestimos.map((item) => <EmprestimoCard key={item.id} item={item} canSettle={Boolean(poloResponsavelId)} onOpen={(loan) => setSelectedEmprestimoId(loan.id)} onSettle={openBaixa} />)}
          {filteredEmprestimos.length === 0 && <div className="col-span-full rounded-2xl border border-dashed border-slate-200 py-16 text-center text-sm font-bold text-slate-400">Nenhum empréstimo encontrado neste filtro.</div>}
        </div>
      ) : (
        <EmprestimosTable items={filteredEmprestimos} canSettle={Boolean(poloResponsavelId)} onOpen={(item) => setSelectedEmprestimoId(item.id)} onSettle={openBaixa} />
      )}

      {renderOverlays()}
    </div>
  );
};

export default EmprestimosTab;
