import { useState } from 'react';
import { supabase } from '../../../../../../../../lib/supabase';
import { DiarioPrintDocumentProps } from '../diario-classe.types';
import { getDiarioFileName, getDiarioValidationCode } from '../diario-classe.utils';
import { buildDiarioPdf } from '../diario-pdf';

interface ToastApi {
  error: (title: string, message?: string) => void;
}

interface UseDiarioPdfDownloadInput {
  printProps: DiarioPrintDocumentProps;
  toast: ToastApi;
}

export const useDiarioPdfDownload = ({
  printProps,
  toast,
}: UseDiarioPdfDownloadInput) => {
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [printingPdf, setPrintingPdf] = useState(false);
  const isBlank = printProps.exportMode === 'EM_BRANCO';

  const ensureValidationRecord = async () => {
    if (isBlank || !printProps.template.imprimirValidacaoContracapa) return;
    const validationCode = getDiarioValidationCode(printProps.turma, printProps.disciplina);
    await supabase
      .from('documentos_templates')
      .upsert({
        id: `validation_${validationCode}`,
        conteudo: {
          type: 'diario_classe',
          status: 'VALID',
          courseName: printProps.turma.cursoNome || 'Curso não informado',
          className: printProps.turma.nome || printProps.turma.codigo || 'Turma não informada',
          unitName: printProps.disciplina.nome,
          issuedAt: new Date().toISOString(),
          studentName: 'Diário de Classe Oficial',
          studentCpf: null,
          studentBirthDate: null,
          studentMotherName: null,
          enrollmentNumber: null,
        },
        updated_at: new Date().toISOString(),
      });
  };

  const downloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      await ensureValidationRecord();
      const pdf = await buildDiarioPdf(printProps);
      const suffix = isBlank ? '-em-branco' : '-preenchido';
      pdf.save(`${getDiarioFileName(printProps.turma, printProps.disciplina)}${suffix}.pdf`);
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
      await ensureValidationRecord();
      const pdf = await buildDiarioPdf(printProps);
      const blobUrl = URL.createObjectURL(pdf.output('blob'));
      const frame = document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.width = '1px';
      frame.style.height = '1px';
      frame.style.opacity = '0';
      frame.style.pointerEvents = 'none';
      frame.src = blobUrl;
      frame.onload = () => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        window.setTimeout(() => {
          frame.remove();
          URL.revokeObjectURL(blobUrl);
        }, 60_000);
      };
      document.body.appendChild(frame);
    } catch (error: any) {
      console.error('Erro ao imprimir PDF do diário:', error);
      toast.error('Erro na impressão', error.message || 'Não foi possível preparar o diário para impressão.');
    } finally {
      setPrintingPdf(false);
    }
  };

  return { downloadingPdf, printingPdf, downloadPdf, printPdf };
};
