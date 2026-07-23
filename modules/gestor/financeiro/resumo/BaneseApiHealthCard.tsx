import React, { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  HelpCircle,
  Loader2,
} from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { integracaoBancariaService } from '../../configuracoes/integracao-bancaria/integracao-bancaria.service';
import {
  BANESE_CNAB240_OVERVIEW_QUERY_KEY,
  baneseCnab240Service,
} from '../conciliacao-bancaria/conciliacao-bancaria.service';
import {
  describeCnabAvailabilityError,
  formatApiSyncDateTime,
} from '../conciliacao-bancaria/conciliacao-bancaria.utils';
import { fetchBaneseApiHealthEvidence } from '../conciliacao-bancaria/banese-api-health.service';
import { financeiroQueryKeys } from '../financeiro.queryKeys';

const evidencePresentation = {
  NO_RECORD: {
    label: 'Sem consulta de cobrança registrada',
    detail: 'Não há evidência persistida para afirmar sucesso ou falha da API.',
    className: 'border-slate-200 bg-slate-50 text-slate-700',
    icon: HelpCircle,
  },
  RECORDED_WITHOUT_ERROR: {
    label: 'Última consulta registrada sem erro',
    detail: 'Este é o resultado da última reconciliação persistida, não um ping em tempo real.',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    icon: CheckCircle2,
  },
  RECORDED_WITH_ERROR: {
    label: 'Última consulta registrou erro',
    detail: 'Revise o erro. Use CNAB240 somente se a falha persistir e a contingência estiver configurada.',
    className: 'border-rose-200 bg-rose-50 text-rose-800',
    icon: AlertTriangle,
  },
} as const;

const BaneseApiHealthCard: React.FC = () => {
  const queryClient = useQueryClient();
  const overviewQuery = useQuery({
    queryKey: ['integracao_bancaria'],
    queryFn: integracaoBancariaService.getOverview,
    staleTime: 30_000,
  });
  const environment = overviewQuery.data?.activeEnvironment;
  const baneseCredential = overviewQuery.data?.credentials.find((credential) => (
    credential.providerCode === 'banese_card'
    && credential.environment === environment
  ));
  const healthQuery = useQuery({
    queryKey: financeiroQueryKeys.baneseApiHealth(environment, baneseCredential ? {
      configured: baneseCredential.configured,
      lastTestAt: baneseCredential.lastTestAt,
      lastTestStatus: baneseCredential.lastTestStatus,
    } : null),
    queryFn: () => fetchBaneseApiHealthEvidence(overviewQuery.data!),
    enabled: Boolean(overviewQuery.data),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const cnabQuery = useQuery({
    queryKey: BANESE_CNAB240_OVERVIEW_QUERY_KEY,
    queryFn: baneseCnab240Service.getOverview,
    enabled: Boolean(environment),
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => {
    if (!environment) return undefined;
    const invalidateHealth = () => {
      void queryClient.invalidateQueries({
        queryKey: financeiroQueryKeys.baneseApiHealthByEnvironment(environment),
        refetchType: 'active',
      });
    };
    const invalidateCnab = () => {
      void queryClient.invalidateQueries({
        queryKey: BANESE_CNAB240_OVERVIEW_QUERY_KEY,
        refetchType: 'active',
      });
    };
    const channel = supabase
      .channel(`financeiro_resumo_banese_health_${environment}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contas_receber',
          filter: 'gateway_provider=eq.banese_card',
        },
        invalidateHealth,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payment_gateway_cnab_files',
          filter: 'provider_code=eq.banese_card',
        },
        invalidateCnab,
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [environment, queryClient]);

  const isLoading = overviewQuery.isLoading || healthQuery.isLoading;
  const evidence = healthQuery.data;
  const presentation = evidence
    ? evidencePresentation[evidence.reconciliationEvidence]
    : evidencePresentation.NO_RECORD;
  const EvidenceIcon = presentation.icon;
  const cnabError = cnabQuery.isError
    ? (cnabQuery.error as Error)?.message || 'Consulta CNAB240 indisponível.'
    : cnabQuery.data && cnabQuery.data.edi7Configured !== true
      ? 'Código EDI7 do Banese ainda não foi confirmado pelo servidor.'
      : null;
  const cnabNotice = describeCnabAvailabilityError(cnabError);

  return (
    <section className="rounded-[2rem] border border-blue-100 bg-white p-6 shadow-sm">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Canal principal</p>
        <h3 className="mt-1 text-lg font-black text-[#001a33]">Saúde operacional da API Banese</h3>
        <p className="mt-1 text-xs font-semibold text-slate-500">Evidências reais da última reconciliação e do último teste persistidos.</p>
      </div>

      {isLoading ? (
        <div className="mt-5 flex items-center gap-2 rounded-xl bg-slate-50 p-4 text-xs font-bold text-slate-500"><Loader2 size={15} className="animate-spin" /> Consultando evidências...</div>
      ) : overviewQuery.isError || healthQuery.isError ? (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-900">
          Não foi possível ler as evidências operacionais agora. Isso não comprova indisponibilidade da API.
        </div>
      ) : evidence ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className={`rounded-2xl border p-4 ${presentation.className}`}>
            <div className="flex items-start gap-3">
              <EvidenceIcon size={20} className="mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-black uppercase tracking-wide">{presentation.label}</p>
                <p className="mt-1 text-xs font-semibold leading-relaxed">{presentation.detail}</p>
              </div>
            </div>
            <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
              <div><dt className="font-black uppercase tracking-wider opacity-70">Última consulta</dt><dd className="mt-1 font-bold">{formatApiSyncDateTime(evidence.lastReconciliationAt)}</dd></div>
              <div><dt className="font-black uppercase tracking-wider opacity-70">Persistida em</dt><dd className="mt-1 font-bold">{formatApiSyncDateTime(evidence.lastReconciliationUpdatedAt)}</dd></div>
              <div><dt className="font-black uppercase tracking-wider opacity-70">Último teste</dt><dd className="mt-1 font-bold">{evidence.lastTestStatus || 'Sem teste registrado'} · {formatApiSyncDateTime(evidence.lastTestAt)}</dd></div>
              <div><dt className="font-black uppercase tracking-wider opacity-70">Ambiente / credencial</dt><dd className="mt-1 font-bold uppercase">{evidence.environment} · {evidence.credentialConfigured ? 'configurada' : 'não configurada'}</dd></div>
            </dl>
            {evidence.lastReconciliationError ? <p className="mt-3 rounded-lg bg-white/70 p-2 text-[10px] font-semibold">Erro persistido: {evidence.lastReconciliationError}</p> : null}
          </div>

          <div className={`rounded-2xl border p-4 ${cnabQuery.data?.edi7Configured === true ? 'border-indigo-200 bg-indigo-50 text-indigo-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
            <div className="flex items-start gap-3">
              <FileText size={20} className="mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-black uppercase tracking-wide">CNAB240 · contingência</p>
                {cnabQuery.data?.edi7Configured === true ? (
                  <p className="mt-1 text-xs font-semibold leading-relaxed">Configuração EDI7 confirmada pelo servidor. Use apenas quando a API principal apresentar falha persistente.</p>
                ) : cnabNotice ? (
                  <><p className="mt-1 text-xs font-semibold leading-relaxed">{cnabNotice.message}</p><p className="mt-2 text-[10px]">{cnabNotice.detail}</p></>
                ) : (
                  <p className="mt-1 text-xs font-semibold leading-relaxed">Consultando a disponibilidade real da contingência.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default BaneseApiHealthCard;
