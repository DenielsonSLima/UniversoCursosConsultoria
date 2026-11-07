import type React from 'react';
import { useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { getDefaultIrpfCalendarYear } from '../../../../lib/irpfYearUtils';
import { secretariaDocumentosKeys } from './secretaria-documentos.keys';
import type { SecretariaContext, SecretariaDocumentoDefinition } from './secretaria-documentos.types';
import type { EmissionMode, DocumentoBatchModalidade, DocumentoBatchModalidadeOption } from './secretaria-emission-workspace.model';

type SetString = React.Dispatch<React.SetStateAction<string>>;
interface SecretariaDocumentoEffects {
  isCrachaPeriodoEleitoral: boolean;
  setAvailabilityNow: React.Dispatch<React.SetStateAction<Date>>;
  isCrachaPrinting: boolean;
  matriculas: readonly { id: string }[];
  selectedMatriculaId: string;
  setSelectedMatriculaId: SetString;
  supportsBatchModalidadeFilter: boolean;
  mode: EmissionMode;
  setSelectedBatchModalidade: SetString;
  loteModalidades: readonly DocumentoBatchModalidadeOption[];
  selectedBatchModalidade: string;
  setSelectedTurmaId: SetString;
  isIrpfAnnual: boolean;
  irpfTemplate: unknown;
  setSelectedReferenceYear: React.Dispatch<React.SetStateAction<number>>;
  irpfLiberacaoDate: string | undefined;
  selectedTurmaId: string;
  hasBatchModalitySelected: boolean;
  supportsAllStudentsBatch: boolean;
  turmas: readonly { id: string }[];
  selectsFichaTemplate: boolean;
  compatibleFichaTemplates: readonly { id: string }[];
  setSelectedTemplateId: SetString;
  selectedTemplateId: string;
  setSelectedModuleId: SetString;
  moduleTurmaId: string;
  context: SecretariaContext;
  definition: SecretariaDocumentoDefinition;
  queryClient: QueryClient;
}

export const useSecretariaDocumentoEffects = ({
  isCrachaPeriodoEleitoral,
  setAvailabilityNow,
  isCrachaPrinting,
  matriculas,
  selectedMatriculaId,
  setSelectedMatriculaId,
  supportsBatchModalidadeFilter,
  mode,
  setSelectedBatchModalidade,
  loteModalidades,
  selectedBatchModalidade,
  setSelectedTurmaId,
  isIrpfAnnual,
  irpfTemplate,
  setSelectedReferenceYear,
  irpfLiberacaoDate,
  selectedTurmaId,
  hasBatchModalitySelected,
  supportsAllStudentsBatch,
  turmas,
  selectsFichaTemplate,
  compatibleFichaTemplates,
  setSelectedTemplateId,
  selectedTemplateId,
  setSelectedModuleId,
  moduleTurmaId,
  context,
  definition,
  queryClient,
}: SecretariaDocumentoEffects) => {
  useEffect(() => {
    if (!isCrachaPeriodoEleitoral) return undefined;
    const intervalId = window.setInterval(() => setAvailabilityNow(new Date()), 60_000);
    return () => window.clearInterval(intervalId);
  }, [isCrachaPeriodoEleitoral]);

  useEffect(() => {
    if (!isCrachaPrinting) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isCrachaPrinting]);

  useEffect(() => {
    if (matriculas.length && !selectedMatriculaId) setSelectedMatriculaId(matriculas[0].id);
  }, [matriculas, selectedMatriculaId]);

  useEffect(() => {
    if (!supportsBatchModalidadeFilter || mode !== 'lote') {
      setSelectedBatchModalidade('');
      return;
    }
    const validModalidades = new Set(loteModalidades.map((item) => item.value));
    if (!selectedBatchModalidade || !validModalidades.has(selectedBatchModalidade as DocumentoBatchModalidade)) {
      setSelectedBatchModalidade(loteModalidades[0].value);
    }
  }, [loteModalidades, mode, selectedBatchModalidade, supportsBatchModalidadeFilter]);

  useEffect(() => {
    if (mode !== 'lote' || !supportsBatchModalidadeFilter) return;
    setSelectedTurmaId('');
  }, [selectedBatchModalidade, supportsBatchModalidadeFilter, mode]);

  useEffect(() => {
    if (!isIrpfAnnual || !irpfTemplate) return;
    setSelectedReferenceYear(getDefaultIrpfCalendarYear(irpfLiberacaoDate));
  }, [irpfLiberacaoDate, irpfTemplate, isIrpfAnnual]);

  useEffect(() => {
    if (mode !== 'lote' || selectedTurmaId) return;
    if (supportsBatchModalidadeFilter && !hasBatchModalitySelected) return;
    if (supportsAllStudentsBatch) {
      setSelectedTurmaId('todos');
      return;
    }
    if (turmas.length) setSelectedTurmaId(turmas[0].id);
  }, [
    hasBatchModalitySelected,
    mode,
    selectedTurmaId,
    supportsAllStudentsBatch,
    supportsBatchModalidadeFilter,
    turmas,
  ]);

  useEffect(() => {
    if (!selectsFichaTemplate) return;
    if (!compatibleFichaTemplates.length) {
      setSelectedTemplateId('');
      return;
    }
    if (!compatibleFichaTemplates.some((model) => model.id === selectedTemplateId)) {
      setSelectedTemplateId(compatibleFichaTemplates[0].id);
    }
  }, [compatibleFichaTemplates, selectedTemplateId, selectsFichaTemplate]);

  useEffect(() => {
    setSelectedModuleId('');
  }, [moduleTurmaId]);

  useEffect(() => {
    const channel = supabase
      .channel(`secretaria_emissoes_${context.userId}_${context.poloId}_${definition.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documentos_validacao',
          filter: `polo_id=eq.${context.poloId}`,
        },
        () => queryClient.invalidateQueries({
          queryKey: secretariaDocumentosKeys.emissions(context, definition.id),
        })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [context, definition.id, queryClient]);
};
