import React, { useDeferredValue, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Landmark,
  Loader2,
  Plus,
  RefreshCw,
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
  getEmprestimoRateioPoloIds,
  emprestimosFinanciamentoScopes,
  emprestimosQueryKeys,
} from './emprestimos.queryKeys';
import { emprestimosService } from './emprestimos.service';
import type {
  BaixarEmprestimoParcelaInput,
  EmprestimoFinanceiro,
  EmprestimoParcela,
} from './emprestimos.types';
import { useEmprestimosQuery } from './hooks/useEmprestimosQueries';
import { useEmprestimosRealtime } from './hooks/useEmprestimosRealtime';
import EmprestimoBaixaModal from './components/EmprestimoBaixaModal';
import EmprestimoDetailsModal from './components/EmprestimoDetailsModal';
import EmprestimoForm from './components/EmprestimoForm';
import EmprestimosTable from './components/EmprestimosTable';

interface EmprestimosTabProps {
  poloId?: string | null;
  isMatriz: boolean;
}

interface BaixaEmprestimoMutationInput {
  input: BaixarEmprestimoParcelaInput;
  rateioPoloIds: string[];
}

const getPoloResponsavelId = (
  scopedPoloId: string | null | undefined,
  polos: FinanceiroPolo[],
) => {
  if (scopedPoloId && scopedPoloId !== 'todos') return scopedPoloId;
  return polos.find((polo) => polo.is_matriz)?.id || '';
};

const EmprestimosTab: React.FC<EmprestimosTabProps> = ({ poloId: scopedPoloId, isMatriz }) => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [showForm, setShowForm] = useState(false);
  const [detailsItem, setDetailsItem] = useState<EmprestimoFinanceiro | null>(null);
  const [baixaParcela, setBaixaParcela] = useState<EmprestimoParcela | null>(null);

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
  const filteredEmprestimos = useMemo(() => {
    if (!deferredSearch.trim()) return emprestimos;
    return emprestimos.filter((emprestimo) => textMatchesSearch(deferredSearch, [
      emprestimo.credorNome,
      emprestimo.descricao,
      emprestimo.status,
      emprestimo.observacao,
      ...emprestimo.parcelas.flatMap((parcela) => parcela.rateios.map((rateio) => rateio.poloNome)),
    ]));
  }, [deferredSearch, emprestimos]);

  const baixaMutation = useMutation({
    mutationFn: ({ input }: BaixaEmprestimoMutationInput) => emprestimosService.baixarParcela(input),
    onSuccess: async (_result, { rateioPoloIds }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: emprestimosQueryKeys.list(poloResponsavelId) }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
        queryClient.invalidateQueries({ queryKey: caixaQueryKeys.dashboards }),
        ...emprestimosFinanciamentoScopes(poloResponsavelId, { rateioPoloIds }).map((scope) => (
          queryClient.invalidateQueries({
            queryKey: caixaQueryKeys.financiamentoResumosForPolo(scope),
          })
        )),
      ]);
      setBaixaParcela(null);
      setDetailsItem(null);
      toast.success(
        'Baixa confirmada',
        isMatriz
          ? 'A parcela foi paga pela Matriz e os custos rateados foram atualizados.'
          : 'A parcela foi paga pelo polo responsável, sem rateio para outras unidades.',
      );
    },
    onError: (error: Error) => {
      toast.error('Erro ao dar baixa', error.message || 'Não foi possível registrar o pagamento.');
    },
  });

  const openBaixa = (_emprestimo: EmprestimoFinanceiro, parcela: EmprestimoParcela) => {
    setBaixaParcela(parcela);
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      <ToastNotification toasts={toasts} onRemove={removeToast} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-indigo-600">
            <Landmark size={16} /> {isMatriz ? 'Gestão centralizada' : 'Gestão por polo'}
          </p>
          <h3 className="mt-1 text-2xl font-black uppercase tracking-tight text-[#001a33]">Empréstimos</h3>
          <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">
            {isMatriz
              ? 'Crédito entra na Matriz; cada parcela gera uma obrigação e custo canônico para os polos do rateio.'
              : 'Crédito, parcelas, Contas a Pagar e baixa pertencem exclusivamente a este polo, sem rateio para outras unidades.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          disabled={!poloResponsavelId || polosQuery.isPending}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-indigo-900/15 transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={16} /> Novo empréstimo
        </button>
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 px-4 py-3 text-xs font-medium leading-relaxed text-slate-600">
        <strong className="font-black text-indigo-700">Polo responsável:</strong> {poloResponsavelNome}. {' '}
        {isMatriz
          ? 'Valores, desdobramento das parcelas, rateio entre polos e baixa são processados pelo backend; o frontend somente envia os dados solicitados e mostra o retorno canônico.'
          : 'O backend cria o crédito, as parcelas e as Contas a Pagar somente para este polo; não há rateio entre unidades.'}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por credor, contrato ou polo..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm font-medium outline-none transition-all placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button
          type="button"
          onClick={() => void emprestimosQuery.refetch()}
          disabled={emprestimosQuery.isFetching || !poloResponsavelId}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-600 disabled:opacity-50"
        >
          <RefreshCw size={14} className={emprestimosQuery.isFetching ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {polosQuery.isPending || emprestimosQuery.isPending ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-100 py-16 text-sm font-bold text-slate-400">
          <Loader2 size={18} className="animate-spin" /> Carregando empréstimos...
        </div>
      ) : emprestimosQuery.isError ? (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-5 py-4 text-sm font-bold text-rose-700">
          Não foi possível carregar os empréstimos deste polo. {(emprestimosQuery.error as Error)?.message || ''}
        </div>
      ) : (
        <EmprestimosTable
          items={filteredEmprestimos}
          canSettle={Boolean(poloResponsavelId)}
          onDetails={setDetailsItem}
          onSettle={openBaixa}
        />
      )}

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
                ? 'Crédito, parcelas, Contas a Pagar e rateios foram criados pelo backend.'
                : 'Crédito, parcelas e Contas a Pagar foram criados apenas para este polo.',
            );
          }}
        />
      )}

      {detailsItem && (
        <EmprestimoDetailsModal
          emprestimo={detailsItem}
          canSettle={Boolean(poloResponsavelId)}
          onClose={() => setDetailsItem(null)}
          onSettle={(parcela) => {
            setDetailsItem(null);
            openBaixa(detailsItem, parcela);
          }}
        />
      )}

      {baixaParcela && (
        <EmprestimoBaixaModal
          key={baixaParcela.id}
          parcela={baixaParcela}
          poloResponsavelId={poloResponsavelId}
          poloResponsavelNome={poloResponsavelNome}
          contas={contasPoloResponsavel}
          isPending={baixaMutation.isPending}
          error={baixaMutation.error as Error | null}
          onClose={() => {
            if (!baixaMutation.isPending) setBaixaParcela(null);
          }}
          onConfirm={(input) => baixaMutation.mutate({
            input,
            // Esta parcela veio da listagem canônica e já contém os rateios
            // persistidos pelo RPC. Assim, cada polo afetado é atualizado de
            // imediato, sem assinatura ampla nem cálculo no cliente.
            rateioPoloIds: getEmprestimoRateioPoloIds(baixaParcela),
          })}
        />
      )}
    </div>
  );
};

export default EmprestimosTab;
