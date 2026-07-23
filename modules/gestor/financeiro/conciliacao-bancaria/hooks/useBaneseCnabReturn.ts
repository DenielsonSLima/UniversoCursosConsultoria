import type { ChangeEvent } from 'react';
import { useMemo, useRef, useState } from 'react';
import type { GatewayEnvironment } from '../../../configuracoes/integracao-bancaria/integracao-bancaria.service';
import { cnabFileStatusLabel } from '../conciliacao-bancaria.formatters';
import { readCnabFileAsBase64 } from '../conciliacao-bancaria.file';
import { baneseCnab240Service } from '../conciliacao-bancaria.service';
import type {
  BaneseCnabApplyReturnResult,
  BaneseCnabExchangeFile,
  BaneseCnabFileDetailsResult,
  BaneseCnabOverview,
} from '../conciliacao-bancaria.types';
import {
  canConfirmBaneseCnabReturn,
  canResumeBaneseCnabReturn,
  canRevalidateBaneseCnabReturn,
  countRetryableBaneseCnabReturnRecords,
  requiresBaneseCnabProductionAcknowledgement,
  summarizeBaneseCnabReturn,
  validateBaneseCnabReturnFile,
} from '../conciliacao-bancaria.utils';

export interface ConciliacaoFeedback {
  type: 'success' | 'warning' | 'error';
  message: string;
}

interface UseBaneseCnabReturnOptions {
  activeEnvironment?: GatewayEnvironment;
  overview?: BaneseCnabOverview;
  overviewError?: string | null;
  invalidateAll: () => Promise<unknown>;
}

export const useBaneseCnabReturn = ({
  activeEnvironment,
  overview,
  overviewError,
  invalidateAll,
}: UseBaneseCnabReturnOptions) => {
  const [feedback, setFeedback] = useState<ConciliacaoFeedback | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BaneseCnabFileDetailsResult | null>(null);
  const [previewDuplicate, setPreviewDuplicate] = useState(false);
  const [confirmation, setConfirmation] = useState<BaneseCnabApplyReturnResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);
  const [retryingPendingRecords, setRetryingPendingRecords] = useState(false);
  const [productionAcknowledged, setProductionAcknowledged] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const previewSummary = summarizeBaneseCnabReturn(preview?.records || []);
  const confirmationSummary = summarizeBaneseCnabReturn(confirmation?.records || []);
  const activationPendingCount = (confirmation?.records || []).filter(
    (record) => record.status === 'ACTIVATION_PENDING',
  ).length;
  const retryablePendingCount = confirmation?.file.status === 'PARTIAL'
    ? countRetryableBaneseCnabReturnRecords(confirmation.records)
    : 0;
  const matchedToRetryCount = confirmation?.file.status === 'PARTIAL'
    ? confirmationSummary.matched
    : 0;
  const confirmationHasIssues = Boolean(confirmation) && (
    confirmation?.file.status === 'PARTIAL'
    || confirmationSummary.errors > 0
    || activationPendingCount > 0
  );
  const previewIsProcessing = canResumeBaneseCnabReturn(preview?.file.status);
  const previewNeedsRevalidation = canRevalidateBaneseCnabReturn(
    preview?.file.status,
    preview?.records,
  );
  const confirmationNeedsRevalidation = canRevalidateBaneseCnabReturn(
    confirmation?.file.status,
    confirmation?.records,
  );
  const canConfirm = previewIsProcessing
    || canConfirmBaneseCnabReturn(preview?.records || []);
  const previewOnlySkipped = previewSummary.events > 0
    && previewSummary.skipped === previewSummary.events;
  const recentReturnFiles = useMemo(
    () => (overview?.files || [])
      .filter((file) => file.direction === 'RETORNO')
      .slice(0, 8),
    [overview?.files],
  );
  const operationInProgress = previewing
    || confirming
    || revalidating
    || retryingPendingRecords
    || Boolean(openingFileId);
  const environment = confirmation?.file.environment
    || preview?.file.environment
    || overview?.environment
    || activeEnvironment;

  const reset = () => {
    setSelectedFile(null);
    setPreview(null);
    setPreviewDuplicate(false);
    setConfirmation(null);
    setProductionAcknowledged(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const presentFileDetails = (
    result: BaneseCnabFileDetailsResult,
    options: { duplicate?: boolean } = {},
  ) => {
    setProductionAcknowledged(false);
    if (result.file.status === 'PREVIEWED' || result.file.status === 'PROCESSING') {
      setPreview(result);
      setPreviewDuplicate(options.duplicate === true);
      setConfirmation(null);
      return;
    }
    setPreview(null);
    setPreviewDuplicate(false);
    setConfirmation({
      alreadyProcessed: result.file.status === 'PROCESSED',
      file: result.file,
      records: result.records,
    });
  };

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const validation = validateBaneseCnabReturnFile(file);
    setFeedback(null);
    setPreview(null);
    setPreviewDuplicate(false);
    setConfirmation(null);
    setProductionAcknowledged(false);
    if ('message' in validation) {
      setSelectedFile(null);
      setFeedback({ type: 'error', message: validation.message });
      event.target.value = '';
      return;
    }
    setSelectedFile(file);
  };

  const previewFile = async () => {
    if (!selectedFile || operationInProgress) return;
    const validation = validateBaneseCnabReturnFile(selectedFile);
    if ('message' in validation) {
      setFeedback({ type: 'error', message: validation.message });
      return;
    }
    const requestedEnvironment = overview?.environment;
    if (!requestedEnvironment) {
      setFeedback({
        type: 'error',
        message: overviewError
          || 'O CNAB240 está bloqueado. Configure o código EDI7 de seis dígitos e recarregue antes de gerar a prévia.',
      });
      return;
    }

    setFeedback(null);
    setPreviewing(true);
    try {
      const result = await baneseCnab240Service.previewReturn({
        environment: requestedEnvironment,
        fileContentBase64: await readCnabFileAsBase64(selectedFile),
        fileName: selectedFile.name,
        fileSizeBytes: selectedFile.size,
      });
      presentFileDetails(result, { duplicate: result.duplicate });
      setFeedback({
        type: 'success',
        message: result.duplicate
          ? `O retorno ${result.file.fileName} já existia e foi aberto no estado ${cnabFileStatusLabel(result.file.status)}. Nenhuma baixa foi duplicada.`
          : `Prévia de ${result.file.fileName} gerada sem aplicar baixas. Revise os ${result.records.length} evento(s) antes de confirmar.`,
      });
    } catch (error: any) {
      setFeedback({
        type: 'error',
        message: error?.message || 'Falha ao gerar a prévia do retorno CNAB240.',
      });
      setPreview(null);
      setPreviewDuplicate(false);
    } finally {
      setPreviewing(false);
    }
  };

  const openFile = async (file: BaneseCnabExchangeFile) => {
    if (file.direction !== 'RETORNO' || operationInProgress) return;
    setFeedback(null);
    setOpeningFileId(file.id);
    try {
      const result = await baneseCnab240Service.getFile({
        environment: file.environment,
        fileId: file.id,
      });
      setSelectedFile(null);
      if (inputRef.current) inputRef.current.value = '';
      presentFileDetails(result);
      setFeedback({
        type: result.file.status === 'PROCESSED' ? 'success' : 'warning',
        message: `Retorno ${result.file.fileName} aberto no estado ${cnabFileStatusLabel(result.file.status)} com ${result.records.length} evento(s).`,
      });
    } catch (error: any) {
      setFeedback({ type: 'error', message: error?.message || 'Não foi possível abrir os registros do retorno CNAB240.' });
    } finally {
      setOpeningFileId(null);
    }
  };

  const revalidate = async () => {
    const source = previewNeedsRevalidation
      ? preview
      : confirmationNeedsRevalidation ? confirmation : null;
    if (!source || operationInProgress) return;
    if (requiresBaneseCnabProductionAcknowledgement(source.file.environment) && !productionAcknowledged) {
      setFeedback({
        type: 'error',
        message: `Confirme explicitamente a revalidação em produção antes de continuar. Há ${summarizeBaneseCnabReturn(source.records).matched} registro(s) MATCHED atualmente pronto(s) para aplicação.`,
      });
      return;
    }
    setFeedback(null);
    setProductionAcknowledged(false);
    setRevalidating(true);
    try {
      const result = await baneseCnab240Service.revalidateReturn({
        environment: source.file.environment,
        fileId: source.file.id,
        confirmProduction: productionAcknowledged,
      });
      presentFileDetails(result);
      const summary = summarizeBaneseCnabReturn(result.records);
      const retryable = countRetryableBaneseCnabReturnRecords(result.records);
      setFeedback({
        type: result.file.status === 'PROCESSED' ? 'success' : 'warning',
        message: result.file.status === 'PROCESSED'
          ? 'Retorno revalidado e processamento concluído com sucesso.'
          : `Retorno revalidado no estado ${cnabFileStatusLabel(result.file.status)}: ${retryable} pendência(s) reprocessável(is) e ${summary.reviewRequired} item(ns) em revisão manual.`,
      });
      await invalidateAll();
    } catch (error: any) {
      setFeedback({ type: 'error', message: error?.message || 'Não foi possível revalidar o retorno CNAB240.' });
    } finally {
      setRevalidating(false);
    }
  };

  const confirm = async () => {
    if (!preview || !canConfirm || operationInProgress) return;
    if (requiresBaneseCnabProductionAcknowledgement(preview.file.environment) && !productionAcknowledged) {
      setFeedback({ type: 'error', message: 'Confirme explicitamente a aplicação das baixas em produção antes de continuar.' });
      return;
    }
    setFeedback(null);
    setProductionAcknowledged(false);
    setConfirming(true);
    try {
      const result = await baneseCnab240Service.applyReturn({
        environment: preview.file.environment,
        fileId: preview.file.id,
        confirmProduction: productionAcknowledged,
      });
      setConfirmation(result);
      const summary = summarizeBaneseCnabReturn(result.records);
      const pending = result.records.filter((record) => record.status === 'ACTIVATION_PENDING').length;
      const partial = result.file.status === 'PARTIAL' || summary.errors > 0 || pending > 0;
      setFeedback({
        type: partial ? 'warning' : 'success',
        message: partial
          ? `Retorno ${result.file.fileName} processado parcialmente: ${summary.applied} baixa(s) financeira(s), ${pending} ativação(ões) pendente(s) e ${summary.errors} erro(s).`
          : result.alreadyProcessed
            ? `O retorno ${result.file.fileName} já estava processado; nenhuma baixa foi duplicada.`
            : `Retorno ${result.file.fileName} confirmado. ${summary.applied} baixa(s) aplicada(s).`,
      });
      await invalidateAll();
    } catch (error: any) {
      setFeedback({ type: 'error', message: error?.message || 'Falha ao confirmar o retorno CNAB240.' });
    } finally {
      setConfirming(false);
    }
  };

  const retryPending = async () => {
    if (!confirmation || retryablePendingCount === 0 || operationInProgress) return;
    if (requiresBaneseCnabProductionAcknowledgement(confirmation.file.environment) && !productionAcknowledged) {
      setFeedback({
        type: 'error',
        message: `Confirme explicitamente o reprocessamento em produção antes de continuar. ${matchedToRetryCount} registro(s) MATCHED está(ão) pronto(s) para aplicação.`,
      });
      return;
    }
    setFeedback(null);
    setProductionAcknowledged(false);
    setRetryingPendingRecords(true);
    try {
      const result = await baneseCnab240Service.retryActivation({
        environment: confirmation.file.environment,
        fileId: confirmation.file.id,
        confirmProduction: productionAcknowledged,
      });
      setConfirmation((current) => current ? { ...current, file: result.file, records: result.records } : current);
      const summary = summarizeBaneseCnabReturn(result.records);
      const pending = result.records.filter((record) => record.status === 'ACTIVATION_PENDING').length;
      const retryable = countRetryableBaneseCnabReturnRecords(result.records);
      const partial = result.file.status === 'PARTIAL' || summary.errors > 0 || pending > 0;
      setFeedback({
        type: partial ? 'warning' : 'success',
        message: partial
          ? `Reprocessamento concluído com ${retryable} pendência(s): ${summary.matched} correspondência(s), ${pending} ativação(ões) e ${summary.errors} erro(s).`
          : 'Pendências do retorno reprocessadas com sucesso.',
      });
      await invalidateAll();
    } catch (error: any) {
      setFeedback({ type: 'error', message: error?.message || 'Falha ao reprocessar as pendências do retorno CNAB240.' });
    } finally {
      setRetryingPendingRecords(false);
    }
  };

  return {
    activationPendingCount,
    canConfirm,
    confirmation,
    confirmationHasIssues,
    confirmationNeedsRevalidation,
    confirmationSummary,
    confirm,
    confirming,
    environment,
    feedback,
    inputRef,
    matchedToRetryCount,
    openFile,
    openingFileId,
    operationInProgress,
    preview,
    previewDuplicate,
    previewFile,
    previewIsProcessing,
    previewNeedsRevalidation,
    previewOnlySkipped,
    previewSummary,
    previewing,
    productionAcknowledged,
    recentReturnFiles,
    reset,
    retryablePendingCount,
    retryPending,
    retryingPendingRecords,
    revalidate,
    revalidating,
    selectedFile,
    selectFile,
    setFeedback,
    setProductionAcknowledged,
  };
};

export type BaneseCnabReturnController = ReturnType<typeof useBaneseCnabReturn>;
