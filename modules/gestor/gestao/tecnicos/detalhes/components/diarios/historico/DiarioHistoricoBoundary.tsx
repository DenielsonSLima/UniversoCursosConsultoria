import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../../../../../../../lib/supabase';
import TechnicalDataError from '../../TechnicalDataError';
import DiarioClasseHeader from '../DiarioClasseHeader';
import type { DiarioActiveTab, DiarioClasseProps } from '../diario-classe.types';
import DiarioHistoricoTabs from './DiarioHistoricoTabs';
import { historicalDiaryKey, parseDiarioHistorico } from './diario-historico.presentation';

const DiarioHistoricoBoundary = ({ children, ...props }: DiarioClasseProps & { children: ReactNode }) => {
  const { turma, disciplina, moduloNome, onBack, accessMode = 'GESTOR', gestorContextId = '' } = props;
  const [activeTab, setActiveTab] = useState<DiarioActiveTab>('frequencia');
  const [actorId, setActorId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionAttempt, setSessionAttempt] = useState(0);

  // Session identity isolates the cache. Authorization remains exclusively in RPC.
  useEffect(() => {
    let alive = true;
    let receivedAuthEvent = false;
    const subscription = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      receivedAuthEvent = true;
      setActorId(session?.user.id || null);
      setSessionReady(true);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive || receivedAuthEvent) return;
      setActorId(error ? null : data.session?.user.id || null);
      setSessionReady(true);
    }).catch(() => {
      if (alive && !receivedAuthEvent) { setActorId(null); setSessionReady(true); }
    });
    return () => { alive = false; subscription.data.subscription.unsubscribe(); };
  }, [sessionAttempt]);

  const historyQuery = useQuery({
    queryKey: historicalDiaryKey(turma.id, disciplina.id, accessMode,
      `${actorId || ''}:${gestorContextId}`, turma.poloId || ''),
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc('get_diario_historico_importado', {
        p_turma_id: turma.id,
        p_disciplina_id: disciplina.id,
      }).abortSignal(signal);
      if (error) throw error;
      return parseDiarioHistorico(data);
    },
    enabled: Boolean(actorId && turma.id && disciplina.id),
    staleTime: 60_000,
    refetchOnMount: 'always',
    retry: false,
  });

  if ((sessionReady && !actorId) || historyQuery.isError) {
    return (
      <div className="mx-auto max-w-[1400px] py-8">
        <TechnicalDataError
          title="Diário não carregado"
          message="Não foi possível confirmar o histórico deste diário. A edição fica protegida até a consulta ser restabelecida."
          retrying={historyQuery.isFetching}
          onRetry={() => {
            if (!actorId) setSessionAttempt((attempt) => attempt + 1);
            else void historyQuery.refetch();
          }}
        />
        <button type="button" onClick={onBack} className="mt-4 text-sm font-bold text-blue-600">Voltar aos diários</button>
      </div>
    );
  }
  if (!sessionReady || historyQuery.isPending || (historyQuery.data === null && historyQuery.isFetching)) {
    return (
      <div role="status" className="flex items-center justify-center gap-3 py-20 text-sm font-bold text-slate-500">
        <Loader2 size={28} className="animate-spin text-[#001a33]" /> Conferindo o histórico do diário...
      </div>
    );
  }
  // Only a successful, explicit null may mount the normal editor/export hooks.
  if (historyQuery.data === null) return children;
  if (!historyQuery.data) return (
    <TechnicalDataError title="Histórico indisponível"
      message="Não foi possível confirmar os registros deste diário."
      retrying={historyQuery.isFetching} onRetry={() => { void historyQuery.refetch(); }} />
  );
  return (
    <div className="mx-auto max-w-[1400px]">
      <DiarioClasseHeader
        disciplina={disciplina} moduloNome={moduloNome} turma={turma} onBack={onBack}
        activeTab={activeTab} setActiveTab={setActiveTab}
        exportDisabled isReadOnly onOpenExportModal={() => undefined}
        readOnlyLabel="Histórico importado"
        readOnlyMessage="Registros preservados do documento original. O PDF preenchido aguarda a conferência do histórico."
      />
      <DiarioHistoricoTabs history={historyQuery.data} activeTab={activeTab} />
    </div>
  );
};

export default DiarioHistoricoBoundary;
