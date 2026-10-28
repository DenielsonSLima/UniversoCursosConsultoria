import { useRef, useState } from 'react';
import { matriculaTecnicaFinanceiroService } from '../financeiro/matricula-tecnica-financeiro.service';
import { matriculaTecnicaCicloManualService } from '../financeiro/matricula-tecnica-ciclo-manual.service';
import { useGerarCicloFinanceiroTecnicoManual } from '../financeiro/hooks/useMatriculaTecnicaCicloManual';
import { startCicloManualIssuance } from '../financeiro/manual-technical-cycle-confirmation';
import { prepareExternalTransferIssuance, type ExternalTransferIssuanceContext } from './external-transfer-issuance';
import type { ExternalTransferResult } from './external-transfer.contract';
import type { GerarCicloFinanceiroTecnicoManualInput } from '../financeiro/matricula-tecnica-ciclo-manual.types';

export interface ExternalTransferIssuanceProgress {
  turmaId: string;
  matriculaId: string;
  cicloNumero: number;
  requestId: string;
  alunoNome: string;
  matriculaExibicao: string;
  quantidadeItens: number;
  quantidadeBancaria?: number;
  total: string;
  startedAt: number;
}

export const useExternalTransferIssuance = (identity: Omit<ExternalTransferIssuanceContext, 'saved'>, canIssue: boolean) => {
  const mutation = useGerarCicloFinanceiroTecnicoManual();
  const started = useRef(false);
  const issuanceStarted = useRef(false);
  const operation = useRef<GerarCicloFinanceiroTecnicoManualInput | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState<ExternalTransferIssuanceProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [withoutCharges, setWithoutCharges] = useState(false);
  const run = async (saved: ExternalTransferResult) => {
    // This method is called only by the final confirmation handler. A render,
    // refetch or a newly available second cycle cannot start another issuance.
    if (started.current) return;
    started.current = true;
    setPreparing(true);
    setError(null);
    try {
      if (!canIssue) throw new Error('A emissão exige as permissões financeiras do recebimento.');
      const prepared = await prepareExternalTransferIssuance({ ...identity, saved },
        (turmaId, alunoId) => matriculaTecnicaFinanceiroService.getWorkspace(turmaId, alunoId),
        (input) => matriculaTecnicaCicloManualService.preview(input));
      if (!prepared) { setWithoutCharges(true); return; }
      const { preview, firstDueDate, row } = prepared;
      const requestId = crypto.randomUUID();
      const task = startCicloManualIssuance({
        canSettleEnrollment: false, externalHistory: false, externalHistoryConfirmed: false,
        firstDueDate, issuanceStarted, openSettlement: false,
        positiveAmounts: preview.itens.every((item) => Number(item.valor) > 0), preview, previewReady: true,
        setIssuanceSnapshot: () => {
          setProgress({ turmaId: identity.turmaId, matriculaId: saved.matriculaId,
            cicloNumero: preview.cicloNumero, requestId, alunoNome: row.alunoNome,
            matriculaExibicao: row.matriculaExibicao, quantidadeItens: preview.quantidadeItens,
            quantidadeBancaria: preview.quantidadeBancaria, total: preview.total, startedAt: Date.now() });
        },
        onConfirm: async (snapshot, dueDate, revisao) => {
          const input: GerarCicloFinanceiroTecnicoManualInput = {
            turmaId: identity.turmaId, matriculaId: saved.matriculaId,
            cicloNumero: snapshot.cicloNumero, primeiroVencimento: dueDate, revisao, requestId,
            expectedRegraFingerprint: snapshot.regraEfetivaFingerprint,
            expectedPoliticaFingerprint: snapshot.politicaFingerprint,
            expectedCronogramaFingerprint: snapshot.cronogramaFingerprint,
            conferirProesc: row.cicloManual.conferenciaProesc?.necessaria === true,
          };
          operation.current = input;
          await mutation.mutateAsync(input);
          setCompleted(true);
        },
      });
      if (!task) throw new Error('A prévia não está pronta para emissão. Confira o Financeiro.');
      await task;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'A emissão ainda não foi confirmada. Consulte o progresso antes de continuar.');
    } finally { setPreparing(false); }
  };
  return { run, preparing, pending: preparing || mutation.isPending, progress, error, completed, withoutCharges,
    submitted: Boolean(operation.current) };
};
