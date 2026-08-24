import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../../../../../../lib/supabase';
import { DiarioPrintDocumentProps } from '../diario-classe.types';
import { getDiarioFileName } from '../diario-classe.utils';
import { buildDiarioPdf } from '../diario-pdf.browser';
import { diarioClasseService } from '../diario-classe.service';
import { createDocumentReissueKey } from '../../../../../../../shared/document-validation/document-validation.service';
import { downloadPdfBlob } from '../../../../../../../shared/pdf/download-pdf-blob';
import { printPdfBlob } from '@/modules/gestor/secretaria/shared/pdf-blob-print';

interface ToastApi {
  error: (title: string, message?: string) => void;
}

interface UseDiarioPdfDownloadInput {
  printProps: DiarioPrintDocumentProps | null;
  toast: ToastApi;
}

interface DiarioValidationRpcRow {
  codigo: string;
  documento: 'diario_classe';
  validacao_publica: boolean;
}

interface ValidationOperation {
  identity: string;
  idempotencyKey: string;
}

interface PreparedPdf {
  source: DiarioPrintDocumentProps;
  templateSignature: string;
  blob: Blob;
}

export const useDiarioPdfDownload = ({
  printProps,
  toast,
}: UseDiarioPdfDownloadInput) => {
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [printingPdf, setPrintingPdf] = useState(false);
  const validationOperationRef = useRef<ValidationOperation | null>(null);
  const pendingValidationRef = useRef<{
    identity: string;
    promise: Promise<string | null>;
  } | null>(null);
  const preparedPdfRef = useRef<PreparedPdf | null>(null);
  const pendingPdfRef = useRef<{
    source: DiarioPrintDocumentProps;
    templateSignature: string;
    promise: Promise<Blob>;
  } | null>(null);
  const isBlank = printProps?.exportMode === 'EM_BRANCO';

  useEffect(() => {
    preparedPdfRef.current = null;
    pendingPdfRef.current = null;
    validationOperationRef.current = null;
  }, [printProps]);

  const prepareValidationCode = useCallback(async (
    template = printProps?.template,
  ): Promise<string | null> => {
    if (!template) {
      throw new Error('O modelo do Diário ainda não foi carregado.');
    }
    if (isBlank || !template.imprimirValidacaoContracapa) return null;

    const turmaId = String(printProps.turma?.id || '').trim();
    const disciplinaId = String(printProps.disciplina?.id || '').trim();
    if (!turmaId || !disciplinaId) {
      throw new Error('A turma e a disciplina do Diário não foram identificadas.');
    }

    const identity = `${turmaId}:${disciplinaId}`;
    if (pendingValidationRef.current?.identity === identity) {
      return pendingValidationRef.current.promise;
    }
    if (validationOperationRef.current?.identity !== identity) {
      validationOperationRef.current = {
        identity,
        idempotencyKey: createDocumentReissueKey(),
      };
    }

    const promise = (async () => {
      const { data, error } = await (supabase.rpc as any)(
        'emitir_diario_validacao_portal',
        {
          p_turma_id: turmaId,
          p_disciplina_id: disciplinaId,
          p_idempotency_key:
            validationOperationRef.current!.idempotencyKey,
        },
      );
      if (error) throw error;

      const row = (Array.isArray(data) ? data[0] : data) as
        | DiarioValidationRpcRow
        | null;
      const code = row?.codigo?.trim().toUpperCase() || '';
      if (row?.documento !== 'diario_classe' || !code) {
        throw new Error(
          'O banco não confirmou o registro canônico do Diário de Classe.',
        );
      }
      if (!row.validacao_publica) {
        throw new Error(
          'A validação pública do Diário não está habilitada. O modelo oficial não será alterado silenciosamente.',
        );
      }

      return code;
    })();

    pendingValidationRef.current = { identity, promise };
    try {
      return await promise;
    } finally {
      if (pendingValidationRef.current?.identity === identity) {
        pendingValidationRef.current = null;
      }
    }
  }, [
    isBlank,
    printProps?.disciplina?.id,
    printProps?.template,
    printProps?.turma?.id,
  ]);

  const preparePdfBlob = useCallback(async (): Promise<Blob> => {
    if (!printProps?.template) {
      throw new Error('O modelo do Diário ainda não foi carregado.');
    }
    const cursoId = String(printProps.turma?.cursoId || '').trim();
    if (!cursoId) {
      throw new Error('O curso do Diário não foi identificado.');
    }

    // A prévia pode permanecer aberta em outra aba enquanto o modelo é salvo.
    // Releia a configuração autoritativa antes de compor para nunca reutilizar
    // uma capa genérica proveniente de um cache antigo.
    const latestTemplate = await diarioClasseService.getTemplate(cursoId);
    const templateSignature = JSON.stringify(latestTemplate);
    if (
      preparedPdfRef.current?.source === printProps
      && preparedPdfRef.current.templateSignature === templateSignature
    ) {
      return preparedPdfRef.current.blob;
    }
    if (
      pendingPdfRef.current?.source === printProps
      && pendingPdfRef.current.templateSignature === templateSignature
    ) {
      return pendingPdfRef.current.promise;
    }

    const source = printProps;
    const promise = (async () => {
      const validationCode = await prepareValidationCode(latestTemplate);
      const pdf = await buildDiarioPdf({
        ...source,
        validationCode,
        validationPreview: false,
        template: latestTemplate,
      });
      const blob = pdf.output('blob');
      if (!blob.size || blob.type !== 'application/pdf') {
        throw new Error('O compositor não retornou um PDF válido.');
      }
      if (
        pendingPdfRef.current?.source === source
        && pendingPdfRef.current.templateSignature === templateSignature
      ) {
        preparedPdfRef.current = { source, templateSignature, blob };
      }
      return blob;
    })();

    pendingPdfRef.current = { source, templateSignature, promise };
    try {
      return await promise;
    } finally {
      if (
        pendingPdfRef.current?.source === source
        && pendingPdfRef.current.templateSignature === templateSignature
      ) {
        pendingPdfRef.current = null;
      }
    }
  }, [prepareValidationCode, printProps]);

  const downloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      if (!printProps) {
        throw new Error('O modelo do Diário ainda não foi carregado.');
      }
      const blob = await preparePdfBlob();
      const suffix = isBlank ? '-em-branco' : '-preenchido';
      downloadPdfBlob(
        blob,
        `${getDiarioFileName(printProps.turma, printProps.disciplina)}${suffix}.pdf`,
      );
    } catch (error: any) {
      console.error('Erro ao gerar PDF do diário:', error);
      toast.error('Erro no PDF', error.message || 'Não foi possível gerar o diário.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const printPdf = async () => {
    setPrintingPdf(true);
    try {
      if (!printProps) {
        throw new Error('O modelo do Diário ainda não foi carregado.');
      }
      const blob = await preparePdfBlob();
      await printPdfBlob(blob, {
        title: 'Diário de Classe',
      });
    } catch (error: any) {
      console.error('Erro ao imprimir PDF do diário:', error);
      toast.error('Erro na impressão', error.message || 'Não foi possível preparar o diário para impressão.');
    } finally {
      setPrintingPdf(false);
    }
  };

  return {
    downloadingPdf,
    printingPdf,
    downloadPdf,
    printPdf,
    prepareValidationCode,
    preparePdfBlob,
  };
};
