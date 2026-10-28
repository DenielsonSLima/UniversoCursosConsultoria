import React from 'react';
import FinanceiroCicloManualIssuanceProgress from './FinanceiroCicloManualIssuanceProgress';
import type { ManualCycleObservationIdentity } from './manual-cycle-observation';
import { useCicloManualLiveProgress } from './hooks/useCicloManualLiveProgress';

interface Props extends ManualCycleObservationIdentity {
  alunoNome: string;
  matriculaExibicao: string;
  quantidadeItens: number | null;
  quantidadeBancaria?: number;
  total: string | null;
  startedAt?: number;
  onClose: () => void;
}

export default function FinanceiroCicloManualLiveProgress(props: Props) {
  const { query, completed, automaticCheckPaused } = useCicloManualLiveProgress(props);
  const progress = query.data?.ciclo;
  return <FinanceiroCicloManualIssuanceProgress
    alunoNome={props.alunoNome} matriculaExibicao={props.matriculaExibicao}
    cicloNumero={props.cicloNumero}
    quantidadeItens={progress?.quantidadeItens ?? props.quantidadeItens}
    quantidadeBancaria={progress?.quantidadeBancaria ?? props.quantidadeBancaria}
    emitidosBanese={progress?.emitidosBanese ?? 0}
    preparacaoConcluida={query.data?.encontrado === true}
    total={progress?.total ?? props.total}
    startedAt={props.startedAt}
    progressConfirmed={Boolean(progress)}
    completionConfirmed={completed}
    automaticCheckPaused={automaticCheckPaused}
    pendingCount={progress?.pendentesEmissao} reviewCount={progress?.emRevisao}
    observedAt={query.data?.observadoEm}
    readError={query.isError ? 'Não foi possível atualizar o progresso. Isso não significa que a emissão falhou; os últimos dados confirmados foram preservados.'
      : automaticCheckPaused ? 'O acompanhamento automático foi pausado sem confirmação final. Consulte o progresso ou o extrato; a emissão pode ter continuado. Não gere novamente.' : null}
    checking={query.isFetching} onCheck={() => { void query.refetch({ cancelRefetch: false }); }} onClose={props.onClose}
  />;
}

