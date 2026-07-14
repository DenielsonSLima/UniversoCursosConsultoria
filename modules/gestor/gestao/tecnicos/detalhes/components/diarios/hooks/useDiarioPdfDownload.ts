import { RefObject, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { supabase } from '../../../../../../../../lib/supabase';
import { DiarioTemplate } from '../../../../../../cadastros/modelos-documentos/diarios/diarios.service';
import { getDiarioFileName, getDiarioValidationCode } from '../diario-classe.utils';

interface ToastApi {
  error: (title: string, message?: string) => void;
}

interface UseDiarioPdfDownloadInput {
  containerRef: RefObject<HTMLDivElement | null>;
  diarioTemplate?: DiarioTemplate;
  turma: any;
  disciplina: any;
  toast: ToastApi;
}

export const useDiarioPdfDownload = ({
  containerRef,
  diarioTemplate,
  turma,
  disciplina,
  toast,
}: UseDiarioPdfDownloadInput) => {
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const downloadPdf = async () => {
    const container = containerRef.current;
    if (!container) return;

    setDownloadingPdf(true);
    try {
      if (diarioTemplate?.imprimirValidacaoContracapa) {
        const validationCode = getDiarioValidationCode(turma, disciplina);
        await supabase
          .from('documentos_templates')
          .upsert({
            id: `validation_${validationCode}`,
            conteudo: {
              type: 'diario_classe',
              status: 'VALID',
              courseName: turma.cursoNome || 'Curso não informado',
              className: turma.nome || turma.codigo || 'Turma não informada',
              unitName: disciplina.nome,
              issuedAt: new Date().toISOString(),
              studentName: 'Diário de Classe Oficial',
              studentCpf: null,
              studentBirthDate: null,
              studentMotherName: null,
              enrollmentNumber: null,
            },
            updated_at: new Date().toISOString(),
          });
      }

      const images = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
      await Promise.all(images.map((image) => image.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            image.onload = () => resolve();
            image.onerror = () => resolve();
          })));

      const pages = Array.from(container.querySelectorAll('.diario-print-page')) as HTMLElement[];
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      for (let index = 0; index < pages.length; index += 1) {
        const canvas = await html2canvas(pages[index], {
          scale: 1.65,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
        });
        if (index > 0) pdf.addPage('a4', 'landscape');
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 297, 210);
      }

      pdf.save(`${getDiarioFileName(turma, disciplina)}.pdf`);
    } catch (error: any) {
      console.error('Erro ao gerar PDF do diário:', error);
      toast.error('Erro no PDF', error.message || 'Não foi possível gerar o diário.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  return { downloadingPdf, downloadPdf };
};
