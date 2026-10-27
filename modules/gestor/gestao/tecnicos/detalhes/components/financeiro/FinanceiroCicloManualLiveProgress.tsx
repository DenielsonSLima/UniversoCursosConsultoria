import React from 'react';
import { useQuery } from '@tanstack/react-query';
import FinanceiroCicloManualIssuanceProgress from './FinanceiroCicloManualIssuanceProgress';
import { manualCycleProgressOptions } from './manual-cycle-progress.service';
import { observedCycleCompletion, type ManualCycleObservationIdentity } from './manual-cycle-observation';

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
  // The mutation observer fetches this same key; QueryClient deduplicates manual
  // reads. Mounting/reopening only reads status and can never submit a bank POST.
  const query = useQuery({ ...manualCycleProgressOptions(props), enabled: true,
    refetchInterval: false, refetchOnMount: 'always' });
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
    completionConfirmed={Boolean(query.data && observedCycleCompletion(query.data))}
    pendingCount={progress?.pendentesEmissao} reviewCount={progress?.emRevisao}
    observedAt={query.data?.observadoEm}
    readError={query.isError ? 'Não foi possível atualizar o progresso. Isso não significa que a emissão falhou; os últimos dados confirmados foram preservados.' : null}
    checking={query.isFetching} onCheck={() => { void query.refetch({ cancelRefetch: false }); }} onClose={props.onClose}
  />;
}
