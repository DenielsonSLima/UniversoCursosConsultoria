import React, { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { financeiroQueryKeys } from '../financeiro.queryKeys';
import { supabase } from '../../../../lib/supabase';
import { integracaoBancariaService } from '../../configuracoes/integracao-bancaria/integracao-bancaria.service';
import type { BaneseCnabImportResult } from '../../configuracoes/integracao-bancaria/integracao-bancaria.service';
import ConciliacaoBancariaResumo from './ConciliacaoBancariaResumo';
import { fetchConciliacaoData } from './conciliacao-bancaria.fetch';
import { EMPTY_API_SYNC_SUMMARY } from './conciliacao-bancaria.utils';

interface ConciliacaoBancariaTabProps {
  poloId?: string | null;
}

const toCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);

const toDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
};

const readFileAsBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result !== 'string' || !reader.result) {
      reject(new Error('Nao foi possivel ler o arquivo CNAB.'));
      return;
    }
    const [, base64] = reader.result.split(',');
    resolve(base64 || reader.result);
  };
  reader.onerror = () => reject(reader.error || new Error('Erro ao ler arquivo CNAB.'));
  reader.readAsDataURL(file);
});

const statusClass = (status: string) => {
  switch (status) {
    case 'PAGO':
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    case 'VENCIDO':
      return 'bg-rose-50 text-rose-700 border-rose-100';
    case 'PENDENTE':
      return 'bg-blue-50 text-blue-700 border-blue-100';
    default:
      return 'bg-slate-50 text-slate-600 border-slate-200';
  }
};

const ConciliacaoBancariaTab: React.FC<ConciliacaoBancariaTabProps> = ({ poloId }) => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshingIds, setRefreshingIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [importingCnab, setImportingCnab] = useState(false);
  const [lastImportResult, setLastImportResult] = useState<BaneseCnabImportResult | null>(null);
  const cnabInputRef = useRef<HTMLInputElement>(null);
  const conciliacaoQueryKey = useMemo(
    () => financeiroQueryKeys.conciliacaoBancariaItems(poloId),
    [poloId],
  );

  const dataQuery = useQuery({
    queryKey: conciliacaoQueryKey,
    queryFn: () => fetchConciliacaoData(poloId),
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const invalidateConciliacao = () => {
      void queryClient.invalidateQueries({
        queryKey: conciliacaoQueryKey,
        refetchType: 'active',
      });
    };

    const channel = supabase
      .channel(`financeiro_conciliacao_bancaria_${poloId || 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payment_gateway_transactions', filter: 'provider_code=eq.banese_card' },
        invalidateConciliacao,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contas_receber', filter: 'gateway_provider=eq.banese_card' },
        invalidateConciliacao,
      );

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conciliacaoQueryKey, poloId, queryClient]);

  const receivables = dataQuery.data?.receivables || [];
  const transactions = dataQuery.data?.transactions || [];
  const summary = dataQuery.data?.summary || {
    totalPendentes: 0,
    valorPendentes: 0,
    totalPagoHoje: 0,
    totalComErro: 0,
    apiSync: { ...EMPTY_API_SYNC_SUMMARY },
    cnab240Sync: { ...EMPTY_API_SYNC_SUMMARY },
  };

  const filteredReceivables = useMemo(() => {
    if (!searchTerm.trim()) return receivables;
    const query = searchTerm.toLowerCase();
    return receivables.filter((row) =>
      row.descricao.toLowerCase().includes(query) ||
      row.nossoNumero?.toLowerCase().includes(query) ||
      row.status.toLowerCase().includes(query)
    );
  }, [receivables, searchTerm]);

  const handleRefresh = async (receivableId: string) => {
    setFeedback(null);
    setRefreshingIds((state) => [...state, receivableId]);
    try {
      await integracaoBancariaService.reconcileBaneseReceivable(receivableId);
      setFeedback({
        type: 'success',
        message: 'Status de cobrança atualizado com sucesso.',
      });
      await queryClient.invalidateQueries({
        queryKey: conciliacaoQueryKey,
      });
    } catch (error: any) {
      setFeedback({
        type: 'error',
        message: error?.message || 'Falha ao atualizar conciliação.',
      });
    } finally {
      setRefreshingIds((state) => state.filter((id) => id !== receivableId));
    }
  };

  const handleImportCnabFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFeedback(null);
    setImportingCnab(true);
    try {
      const fileContentBase64 = await readFileAsBase64(file);
      const result = await integracaoBancariaService.importBaneseCnab240Return({
        fileContentBase64,
        fileName: file.name,
      });
      setLastImportResult(result);
      setFeedback({
        type: 'success',
        message:
          `Arquivo ${result.fileName || file.name} importado. Eventos: ${result.summary.events}, pagas: ${result.summary.paid}, não encontradas: ${result.summary.notFound}.`,
      });
      await queryClient.invalidateQueries({
        queryKey: conciliacaoQueryKey,
      });
    } catch (error: any) {
      setFeedback({
        type: 'error',
        message: error?.message || 'Falha ao importar arquivo CNAB240.',
      });
      setLastImportResult(null);
    } finally {
      setImportingCnab(false);
      if (cnabInputRef.current) {
        cnabInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <ConciliacaoBancariaResumo
        totalPendentes={summary.totalPendentes}
        valorPendentes={summary.valorPendentes}
        totalPagoHoje={summary.totalPagoHoje}
        totalComErro={summary.totalComErro}
        apiSync={summary.apiSync}
        cnab240Sync={summary.cnab240Sync}
      />

      {feedback && (
        <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${feedback.type === 'success'
          ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
          : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
          <p>{feedback.message}</p>
        </div>
      )}

      <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap gap-3">
          <Search size={16} className="text-slate-400 mt-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Filtrar por descrição, nosso número ou status..."
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </div>

        <div className="overflow-x-auto">
          {dataQuery.isLoading ? (
            <div className="py-10 text-center text-slate-500 text-sm">Carregando conciliações Banese...</div>
          ) : (
            <table className="w-full text-left border border-slate-100 rounded-2xl overflow-hidden">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-3 text-[10px] font-bold text-slate-500 uppercase">Descrição</th>
                  <th className="p-3 text-[10px] font-bold text-slate-500 uppercase">Nosso Número</th>
                  <th className="p-3 text-[10px] font-bold text-slate-500 uppercase">Vencimento</th>
                  <th className="p-3 text-[10px] font-bold text-slate-500 uppercase">Valor</th>
                  <th className="p-3 text-[10px] font-bold text-slate-500 uppercase">Status</th>
                  <th className="p-3 text-[10px] font-bold text-slate-500 uppercase">Último retorno</th>
                  <th className="p-3 text-[10px] font-bold text-slate-500 uppercase">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredReceivables.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-xs text-slate-500 font-bold uppercase">
                      Nenhuma cobrança bancária Banese encontrada para os filtros informados.
                    </td>
                  </tr>
                ) : (
                  filteredReceivables.map((row) => {
                    const isRefreshing = refreshingIds.includes(row.id);
                    return (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="p-3">
                          <p className="text-sm font-bold text-slate-700">{row.descricao}</p>
                          {row.gatewayLastError && row.gatewayLastError !== '-' ? (
                            <p className="mt-1 text-[10px] text-rose-600 font-medium flex items-center gap-1">
                              <ShieldAlert size={12} /> Falha guardada: {row.gatewayLastError}
                            </p>
                          ) : null}
                        </td>
                        <td className="p-3 text-xs font-bold text-slate-600">{row.nossoNumero || '-'}</td>
                        <td className="p-3 text-xs text-slate-600">{toDate(row.dataVencimento)}</td>
                        <td className="p-3 text-xs font-black text-slate-700">{toCurrency(row.valor)}</td>
                        <td className="p-3">
                          <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${statusClass(row.status)}`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-slate-500">{toDate(row.gatewaySyncedAt)}</td>
                        <td className="p-3">
                          {row.status === 'PAGO' ? (
                            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-2 py-1 text-[10px] font-black border border-emerald-100">
                              <CheckCircle2 size={12} />
                              Confirmado
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRefresh(row.id)}
                              disabled={isRefreshing}
                              className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-2.5 py-1.5 text-white text-[10px] font-black uppercase tracking-wider hover:bg-slate-900 disabled:opacity-50"
                            >
                              <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
                              {isRefreshing ? 'Sincronizando' : 'Sincronizar'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6">
        <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <AlertCircle size={16} className="text-blue-600" />
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">Histórico de retorno persistido</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border border-slate-100 rounded-2xl overflow-hidden">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-3 text-[10px] font-bold text-slate-500 uppercase">Atualização</th>
                  <th className="p-3 text-[10px] font-bold text-slate-500 uppercase">Cobrança</th>
                  <th className="p-3 text-[10px] font-bold text-slate-500 uppercase">Status remoto</th>
                  <th className="p-3 text-[10px] font-bold text-slate-500 uppercase">Resumo payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-xs text-slate-500">Ainda sem retorno registrado.</td>
                  </tr>
                ) : (
                  transactions.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                      <td className="p-3 text-xs text-slate-500">{toDate(row.updatedAt)}</td>
                      <td className="p-3 text-xs font-bold text-slate-700">{row.receivableId || '-'}</td>
                      <td className="p-3 text-xs text-slate-700">{row.remoteStatus || '-'}</td>
                      <td className="p-3 text-[10px] text-slate-500 font-mono">{row.rawPayload}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <FileText size={16} className="text-slate-500" />
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">CNAB 240 (homologação)</h3>
          </div>
          <p className="mb-4 text-xs text-slate-500 leading-relaxed">
            O retorno em lote do Banese está pronto para importação. Envie o arquivo .rem/.ret/.txt para automatizar as baixas e manter histórico persistente.
          </p>
          <input
            ref={cnabInputRef}
            type="file"
            accept=".txt,.ret,.rem,.cnab"
            onChange={handleImportCnabFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => cnabInputRef.current?.click()}
            disabled={importingCnab}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-white text-[10px] font-black uppercase tracking-wider hover:bg-blue-700 disabled:opacity-50"
          >
            {importingCnab ? 'Importando retorno...' : 'Importar retorno CNAB 240'}
          </button>
          {lastImportResult && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
              <p className="font-black uppercase tracking-wide text-slate-700">Último retorno importado</p>
              <p className="mt-1">Arquivo: {lastImportResult.fileName || 'arquivo sem nome'}</p>
              <p className="mt-1">
                Eventos: {lastImportResult.summary.events} • Encontrados: {lastImportResult.summary.matched} •
                Pagos: {lastImportResult.summary.paid} • Falhas: {lastImportResult.summary.errors}
              </p>
              {lastImportResult.summary.notFound ? <p className="mt-1 text-rose-600">Não encontrados: {lastImportResult.summary.notFound}</p> : null}
              {lastImportResult.message ? <p className="mt-1">{lastImportResult.message}</p> : null}
            </div>
          )}
          {lastImportResult ? null : (
            <p className="mt-4 rounded-2xl border border-dashed border-slate-200 p-3 text-xs text-slate-500">
              Selecione um arquivo de retorno para aplicar baixa automática em lote.
            </p>
          )}
          </div>
        </div>
      </div>
      <div className="rounded-[2rem] border border-emerald-100 bg-emerald-50 px-5 py-4 text-xs text-emerald-700">
        <p className="font-black uppercase tracking-wide">Observação do fluxo</p>
        <p className="mt-1 leading-relaxed">
          O fluxo de retorno permanece híbrido: API em tempo real para conferência imediata e CNAB240 para baixa em lote. Em ambos os casos os dados ficam em `contas_receber` e no histórico de `payment_gateway_transactions`.
        </p>
      </div>
    </div>
  );
};

export default ConciliacaoBancariaTab;
