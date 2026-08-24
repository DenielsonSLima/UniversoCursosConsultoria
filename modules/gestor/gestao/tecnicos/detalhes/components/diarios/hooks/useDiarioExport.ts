import { useCallback, useMemo, useState } from 'react';
import type {
  DiarioPrintDocumentProps,
} from '../diario-classe.types';
import type { DiarioExportMode } from '../turma-diarios.types';
import { useDiarioPdfDownload } from './useDiarioPdfDownload';

interface DiarioExportToastApi {
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

interface UseDiarioExportInput {
  template: DiarioPrintDocumentProps['template'] | null | undefined;
  turma: DiarioPrintDocumentProps['turma'];
  disciplina: DiarioPrintDocumentProps['disciplina'];
  moduloNome: string;
  students: DiarioPrintDocumentProps['students'];
  aulas: DiarioPrintDocumentProps['aulas'];
  attendanceMap: DiarioPrintDocumentProps['attendanceMap'];
  gradesMap: DiarioPrintDocumentProps['gradesMap'];
  praticasMap: DiarioPrintDocumentProps['praticasMap'];
  observacoes: string;
  activeInstruments: DiarioPrintDocumentProps['activeInstruments'];
  watermark: DiarioPrintDocumentProps['watermark'];
  initialExportMode?: DiarioExportMode;
  hasPendingWrites: boolean;
  returnToListOnExportClose: boolean;
  onBack: () => void;
  toast: DiarioExportToastApi;
}

export const useDiarioExport = ({
  template,
  turma,
  disciplina,
  moduloNome,
  students,
  aulas,
  attendanceMap,
  gradesMap,
  praticasMap,
  observacoes,
  activeInstruments,
  watermark,
  initialExportMode,
  hasPendingWrites,
  returnToListOnExportClose,
  onBack,
  toast,
}: UseDiarioExportInput) => {
  const [isExportModalOpen, setIsExportModalOpen] = useState(Boolean(initialExportMode));
  const [exportMode, setExportMode] = useState<DiarioExportMode>(
    initialExportMode || 'PREENCHIDO',
  );
  const printProps = useMemo<DiarioPrintDocumentProps | null>(() => {
    if (!template) return null;
    return {
      template,
      turma,
      disciplina,
      moduloNome,
      students,
      aulas,
      attendanceMap,
      gradesMap,
      praticasMap,
      observacoes,
      activeInstruments,
      watermark,
      exportMode,
    };
  }, [
    activeInstruments,
    attendanceMap,
    aulas,
    disciplina,
    exportMode,
    gradesMap,
    moduloNome,
    observacoes,
    praticasMap,
    students,
    template,
    turma,
    watermark,
  ]);
  const pdf = useDiarioPdfDownload({ printProps, toast });

  const openExportModal = useCallback((mode: DiarioExportMode) => {
    if (hasPendingWrites) {
      toast.info(
        'Aguarde o salvamento',
        'O PDF será liberado assim que os registros forem confirmados.',
      );
      return;
    }
    setExportMode(mode);
    setIsExportModalOpen(true);
  }, [hasPendingWrites, toast]);

  const closeExportModal = useCallback(() => {
    setIsExportModalOpen(false);
    if (returnToListOnExportClose) onBack();
  }, [onBack, returnToListOnExportClose]);

  return {
    ...pdf,
    printProps,
    exportMode,
    isExportModalOpen,
    openExportModal,
    closeExportModal,
  };
};
