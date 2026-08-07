import { useCallback, useRef, useState } from 'react';
import { supabase } from '../../../../../../../../lib/supabase';
import { DiarioPrintDocumentProps } from '../diario-classe.types';
import { getDiarioFileName } from '../diario-classe.utils';
import { buildDiarioPdf } from '../diario-pdf';
import { createDocumentReissueKey } from '../../../../../../../shared/document-validation/document-validation.service';
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
  const isBlank = printProps?.exportMode === 'EM_BRANCO';

  const prepareValidationCode = useCallback(async (): Promise<string | null> => {
    if (!printProps?.template) {
      throw new Error('O modelo do Diário ainda não foi carregado.');
    }
    if (isBlank || !printProps.template.imprimirValidacaoContracapa) return null;

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
        return null;
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
    printProps?.template?.imprimirValidacaoContracapa,
    printProps?.turma?.id,
  ]);

  const buildPdf = (validationCode: string | null) => {
    if (!printProps?.template) {
      throw new Error('O modelo do Diário ainda não foi carregado.');
    }
    const shouldPrintValidationBackCover = Boolean(validationCode);
    return buildDiarioPdf({
      ...printProps,
      validationCode,
      validationPreview: false,
      template: shouldPrintValidationBackCover
        ? printProps.template
        : {
            ...printProps.template,
            // Sem uma validação pública ativa, não preserve apenas a arte de
            // fundo: isso criaria uma segunda página visualmente vazia.
            contracapaUrl: null,
            imprimirValidacaoContracapa: false,
          },
    });
  };

  const downloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      if (!printProps) {
        throw new Error('O modelo do Diário ainda não foi carregado.');
      }
      const validationCode = await prepareValidationCode();
      const pdf = await buildPdf(validationCode);
      const suffix = isBlank ? '-em-branco' : '-preenchido';
      pdf.save(`${getDiarioFileName(printProps.turma, printProps.disciplina)}${suffix}.pdf`);
      validationOperationRef.current = null;
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
      const validationCode = await prepareValidationCode();
      const pdf = await buildPdf(validationCode);
      await printPdfBlob(pdf.output('blob'), {
        title: 'Diário de Classe',
      });
      validationOperationRef.current = null;
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
  };
};
