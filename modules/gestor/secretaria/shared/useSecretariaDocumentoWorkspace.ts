import { useSecretariaDocumentoEffects } from './useSecretariaDocumentoEffects';
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDefaultIrpfCalendarYear, getIrpfCalendarYearOptions } from '../../../../lib/irpfYearUtils';
import { secretariaDocumentosKeys } from './secretaria-documentos.keys';
import { getSecretariaContext, secretariaDocumentosService } from './secretaria-documentos.service';
import { SecretariaAlunoResumo, SecretariaDocumentoDefinition } from './secretaria-documentos.types';
import type { EmissionLog } from '../historico-emissoes/historico-emissoes.types';
import { crachaService } from '../../cadastros/modelos-documentos/cracha/cracha.service';
import { irpfService } from '../../cadastros/modelos-documentos/irpf/irpf.service';
import { crachaPeriodoEleitoralService, isCrachaEleitoralTemplateAvailable } from '../../cadastros/modelos-documentos/cracha-periodo-eleitoral/cracha-periodo-eleitoral.service';
import { fichasMatriculaService } from '../../cadastros/ficha-matricula/fichas-matricula.service';
import { createDocumentReissueKey } from '../../../shared/document-validation/document-validation.service';
import { mapModalidadeOptions, useDebouncedValue, type EmissionMode, type CustomEmissionSelection } from './secretaria-emission-workspace.model';

export const useSecretariaDocumentoWorkspace = (definition: SecretariaDocumentoDefinition) => {
  const queryClient = useQueryClient();
  const activeUserId = window.sessionStorage.getItem('logged_user_id');
  const activePoloId =
    window.sessionStorage.getItem('current_polo_id') ||
    window.sessionStorage.getItem('active_polo_id');
  const context = useMemo(
    () => getSecretariaContext(),
    [activeUserId, activePoloId]
  );
  const [mode, setMode] = useState<EmissionMode>('individual');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAluno, setSelectedAluno] = useState<SecretariaAlunoResumo | null>(null);
  const [selectedMatriculaId, setSelectedMatriculaId] = useState('');
  const [selectedTurmaId, setSelectedTurmaId] = useState('');
  const [selectedBatchModalidade, setSelectedBatchModalidade] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [customSelections, setCustomSelections] = useState<CustomEmissionSelection[]>([]);
  const [selectedReferenceYear, setSelectedReferenceYear] = useState(() => getDefaultIrpfCalendarYear());
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [crachaPrintLayout, setCrachaPrintLayout] = useState<'dobra' | 'duplex'>('dobra');
  const [isCrachaPrinting, setIsCrachaPrinting] = useState(false);
  const [issuedEmissions, setIssuedEmissions] = useState<EmissionLog[]>([]);
  const [isIssuedDocumentOpen, setIsIssuedDocumentOpen] = useState(false);
  const [availabilityNow, setAvailabilityNow] = useState(() => new Date());
  const printContentRef = useRef<HTMLDivElement>(null);
  const emissionRequestRef = useRef<{
    fingerprint: string;
    idempotencyKey: string;
  } | null>(null);

  const isIrpfAnnual = definition.referenceMode === 'irpf_annual';
  const isBoletim = definition.id === 'boletim';
  const isCrachaEstagio = definition.id === 'cracha_estagio';
  const isCrachaPeriodoEleitoral = definition.id === 'cracha_periodo_eleitoral';
  const isCrachaDocument = isCrachaEstagio || isCrachaPeriodoEleitoral;
  const selectsFichaTemplate = definition.templateSelection === 'ficha_matricula';
  const usesDirectDocumentViewer =
    definition.id === 'ficha_matricula' || definition.id === 'pasta_identificacao';
  const supportsAllStudentsBatch = definition.id === 'pasta_identificacao';
  const supportsIssuedDocumentPreview = !isCrachaDocument;
  const activeEnrollmentOnly = !!(definition.activeOnly || definition.activeEnrollmentOnly);
  const activeTurmaOnly = !!(definition.activeOnly || definition.activeTurmaOnly);
  const enrollmentStatuses = definition.enrollmentStatuses || [];
  const irpfTemplateQuery = useQuery({
    queryKey: ['secretaria-irpf-template', context.poloId],
    queryFn: () => irpfService.getTemplate(context.poloId),
    enabled: isIrpfAnnual,
    staleTime: 60_000,
  });
  const { data: irpfTemplate } = irpfTemplateQuery;
  const irpfLiberacaoDate = irpfTemplate?.liberacaoDate as string | undefined;
  const irpfYearOptions = useMemo(
    () => getIrpfCalendarYearOptions(irpfLiberacaoDate, new Date(), 10),
    [irpfLiberacaoDate]
  );
  const selectedIrpfYear = irpfYearOptions.find((option) => option.year === selectedReferenceYear);
  const fichaTemplatesQuery = useQuery({
    queryKey: ['secretaria', 'ficha-matricula', 'active-models'],
    queryFn: fichasMatriculaService.getActive,
    enabled: selectsFichaTemplate,
    staleTime: 30_000,
  });
  const {
    data: fichaTemplates = [],
    isLoading: isLoadingFichaTemplates,
  } = fichaTemplatesQuery;
  const selectedFichaTemplate = fichaTemplates.find((model) => model.id === selectedTemplateId);

  const normalizedTerm = useDebouncedValue(searchTerm.trim(), 300);
  const alunosQuery = useQuery({
    queryKey: secretariaDocumentosKeys.search(context, definition.id, normalizedTerm),
    queryFn: () => secretariaDocumentosService.searchAlunos(
      context.poloId,
      normalizedTerm,
      definition.id,
    ),
    enabled: mode !== 'lote' && normalizedTerm.length >= 2,
    staleTime: 30_000,
  });
  const { data: alunos = [], isFetching: isSearching } = alunosQuery;

  const matriculasQuery = useQuery({
    queryKey: secretariaDocumentosKeys.matriculas(
      context,
      definition.id,
      selectedAluno?.id || 'nenhum',
      activeEnrollmentOnly,
      activeTurmaOnly,
      definition.completedOnly,
      enrollmentStatuses
    ),
    queryFn: () =>
      secretariaDocumentosService.getMatriculas(
        selectedAluno!.id,
        context.poloId,
        !!definition.technicalOnly,
        !!definition.completedOnly,
        activeEnrollmentOnly,
        activeTurmaOnly,
        enrollmentStatuses,
        !!definition.internshipOnly
      ),
    enabled: !!selectedAluno,
    staleTime: 60_000,
  });
  const { data: matriculas = [], isLoading: isLoadingMatriculas } = matriculasQuery;

  const loteModalidades = useMemo(
    () => mapModalidadeOptions(definition.id),
    [definition.id]
  );
  const supportsBatchModalidadeFilter = loteModalidades.length > 0;
  const hasBatchModalitySelected = !supportsBatchModalidadeFilter || Boolean(selectedBatchModalidade);

  const turmasQuery = useQuery({
    queryKey: secretariaDocumentosKeys.turmas(
      context,
      definition.id,
      !!definition.technicalOnly,
      activeTurmaOnly,
      supportsBatchModalidadeFilter ? selectedBatchModalidade : null
    ),
    queryFn: () =>
      secretariaDocumentosService.getTurmas(
        context.poloId,
        !!definition.technicalOnly,
        activeTurmaOnly,
        !!definition.internshipOnly,
        supportsBatchModalidadeFilter ? selectedBatchModalidade : null
      ),
    enabled: mode === 'lote' && hasBatchModalitySelected,
    staleTime: 60_000,
  });
  const { data: turmas = [], isLoading: isLoadingTurmas } = turmasQuery;

  const selectedMatricula = matriculas.find((item) => item.id === selectedMatriculaId);
  const selectedTurma = turmas.find((item) => item.id === selectedTurmaId);
  const pastaBatchTurmas = turmas;
  const fichaTargetModalities = useMemo(() => {
    const modalities = mode === 'individual'
      ? [selectedMatricula?.modalidade]
      : mode === 'lote'
        ? [selectedTurma?.modalidade]
        : customSelections.map((selection) => selection.matricula.modalidade);
    return new Set(
      modalities
        .map((modality) => String(modality || '').trim().toUpperCase())
        .filter(Boolean)
    );
  }, [customSelections, mode, selectedMatricula?.modalidade, selectedTurma?.modalidade]);
  const fichaTargetCourseIds = useMemo(() => {
    const courseIds = mode === 'individual'
      ? [selectedMatricula?.cursoId]
      : mode === 'lote'
        ? [selectedTurma?.cursoId]
        : customSelections.map((selection) => selection.matricula.cursoId);
    return new Set(courseIds.filter(Boolean));
  }, [customSelections, mode, selectedMatricula?.cursoId, selectedTurma?.cursoId]);
  const compatibleFichaTemplates = useMemo(
    () => fichaTemplates.filter((model) => {
      const application = String(model.tipoCurso || 'TODOS').trim().toUpperCase();
      if (
        model.cursoEspecificoId
        && fichaTargetCourseIds.size > 0
        && (
          fichaTargetCourseIds.size !== 1
          || !fichaTargetCourseIds.has(model.cursoEspecificoId)
        )
      ) {
        return false;
      }
      if (application === 'TODOS' || fichaTargetModalities.size === 0) return true;
      return fichaTargetModalities.size === 1 && fichaTargetModalities.has(application);
    }),
    [fichaTargetCourseIds, fichaTargetModalities, fichaTemplates]
  );
  const moduleTurmaId = mode === 'lote'
    ? selectedTurmaId
    : mode === 'custom'
      ? customSelections[0]?.matricula.turmaId || ''
      : selectedMatricula?.turmaId || '';
  const modulesQuery = useQuery({
    queryKey: secretariaDocumentosKeys.modulos(
      context,
      definition.id,
      moduleTurmaId || 'nenhuma'
    ),
    queryFn: () => secretariaDocumentosService.getTurmaModulos(moduleTurmaId),
    enabled: isBoletim && !!moduleTurmaId,
    staleTime: 60_000,
  });
  const { data: modules = [], isLoading: isLoadingModules } = modulesQuery;
  const selectedModule = modules.find((item) => item.id === selectedModuleId);

  const crachaTemplateQuery = useQuery({
    queryKey: ['secretaria-cracha-template'],
    queryFn: () => crachaService.getTemplate(),
    enabled: isCrachaEstagio,
    staleTime: 60_000,
  });
  const { data: crachaTemplate } = crachaTemplateQuery;

  const crachaEleitoralTemplateQuery = useQuery({
    queryKey: ['secretaria-cracha-periodo-eleitoral-template'],
    queryFn: () => crachaPeriodoEleitoralService.getTemplate(),
    enabled: isCrachaPeriodoEleitoral,
    staleTime: 60_000,
  });
  const { data: crachaEleitoralTemplate } = crachaEleitoralTemplateQuery;

  const enabledDataQueries = [
    isIrpfAnnual ? irpfTemplateQuery : null,
    selectsFichaTemplate ? fichaTemplatesQuery : null,
    mode !== 'lote' && normalizedTerm.length >= 2 ? alunosQuery : null,
    selectedAluno ? matriculasQuery : null,
    mode === 'lote' ? turmasQuery : null,
    isBoletim && moduleTurmaId ? modulesQuery : null,
    isCrachaEstagio ? crachaTemplateQuery : null,
    isCrachaPeriodoEleitoral ? crachaEleitoralTemplateQuery : null,
  ].filter(Boolean);
  const failedDataQuery = enabledDataQueries.find((query) => query?.isError);
  const dataLoadError = failedDataQuery?.error;
  const retryFailedDataQueries = () => {
    enabledDataQueries
      .filter((query) => query?.isError)
      .forEach((query) => { void query?.refetch(); });
  };

  const isCrachaEleitoralAvailable = isCrachaPeriodoEleitoral
    ? isCrachaEleitoralTemplateAvailable(crachaEleitoralTemplate, availabilityNow)
    : true;

  useSecretariaDocumentoEffects({
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
  });

  const emissionMutation = useMutation({
    mutationFn: async () => {
      const requestFingerprint = JSON.stringify([
        definition.id,
        mode,
        selectedMatriculaId || null,
        selectedTurmaId || null,
        customSelections.map((selection) => selection.matricula.id),
        selectedTemplateId || null,
        selectedModuleId || null,
        selectedReferenceYear,
        context.userId,
      ]);
      if (emissionRequestRef.current?.fingerprint !== requestFingerprint) {
        emissionRequestRef.current = {
          fingerprint: requestFingerprint,
          idempotencyKey: createDocumentReissueKey(),
        };
      }

      return secretariaDocumentosService.registrarEmissao({
        context,
        documento: definition.id,
        modo: mode,
        alunoId: mode === 'individual' ? selectedAluno?.id : undefined,
        matriculaId: mode === 'individual' ? selectedMatriculaId : undefined,
        turmaId: mode === 'lote' ? selectedTurmaId : undefined,
        allStudentsInPolo:
          mode === 'lote' && supportsAllStudentsBatch && selectedTurmaId === 'todos',
        matriculaIds: mode === 'custom'
          ? customSelections.map((selection) => selection.matricula.id)
          : undefined,
        technicalOnly: !!definition.technicalOnly,
        activeEnrollmentOnly,
        activeTurmaOnly,
        completedOnly: !!definition.completedOnly,
        enrollmentStatuses,
        internshipOnly: !!definition.internshipOnly,
        referencePeriod: selectsFichaTemplate
          ? selectedTemplateId
          : isBoletim
          ? selectedModuleId
          : isIrpfAnnual
            ? String(selectedReferenceYear)
            : undefined,
        moduleId: isBoletim ? selectedModuleId : undefined,
        moduleName: isBoletim ? selectedModule?.nome : undefined,
        idempotencyKey: emissionRequestRef.current.idempotencyKey,
      });
    },
    onSuccess: (data) => {
      emissionRequestRef.current = null;
      queryClient.invalidateQueries({
        queryKey: secretariaDocumentosKeys.emissions(context, definition.id),
      });
      if (!usesDirectDocumentViewer) {
        setStep(3);
      }
      if (isCrachaDocument && data.items.length > 0) {
        setIsCrachaPrinting(true);
      }
      if (supportsIssuedDocumentPreview && data.emissions.length > 0) {
        setIssuedEmissions(data.emissions);
        setIsIssuedDocumentOpen(true);
      }
    },
  });

  const hasRequiredModule = !isBoletim || !!selectedModule;
  const canContinue =
    mode === 'individual'
      ? !!selectedAluno && !!selectedMatriculaId && hasRequiredModule && (!selectsFichaTemplate || !!selectedTemplateId) && (!isIrpfAnnual || !!selectedIrpfYear?.released) && isCrachaEleitoralAvailable
      : mode === 'lote'
        ? !!selectedTurmaId && hasRequiredModule && (!selectsFichaTemplate || !!selectedTemplateId) && hasBatchModalitySelected && isCrachaEleitoralAvailable
        : customSelections.length > 0 && hasRequiredModule && (!selectsFichaTemplate || !!selectedTemplateId) && isCrachaEleitoralAvailable;

  const openDirectDocumentViewer = () => {
    if (!canContinue || emissionMutation.isPending) return;
    emissionMutation.mutate();
  };

  const resetFlow = (nextMode = mode) => {
    setMode(nextMode);
    setStep(1);
    setSearchTerm('');
    setSelectedAluno(null);
    setSelectedMatriculaId('');
    setSelectedTurmaId(
      nextMode === 'lote' && supportsAllStudentsBatch ? 'todos' : ''
    );
    if (nextMode !== 'lote') {
      setSelectedBatchModalidade('');
    }
    setSelectedModuleId('');
    setCustomSelections([]);
    setSelectedReferenceYear(getDefaultIrpfCalendarYear(irpfLiberacaoDate));
    setIssuedEmissions([]);
    setIsIssuedDocumentOpen(false);
  };

  const crachaPrintItems = ((emissionMutation.data as any)?.items || []) as any[];
  return {
    definition,
    context,
    mode,
    step,
    setStep,
    searchTerm,
    setSearchTerm,
    selectedAluno,
    setSelectedAluno,
    selectedMatriculaId,
    setSelectedMatriculaId,
    selectedTurmaId,
    setSelectedTurmaId,
    selectedBatchModalidade,
    setSelectedBatchModalidade,
    selectedModuleId,
    setSelectedModuleId,
    customSelections,
    setCustomSelections,
    selectedReferenceYear,
    setSelectedReferenceYear,
    selectedTemplateId,
    setSelectedTemplateId,
    crachaPrintLayout,
    setCrachaPrintLayout,
    isCrachaPrinting,
    setIsCrachaPrinting,
    issuedEmissions,
    isIssuedDocumentOpen,
    setIsIssuedDocumentOpen,
    printContentRef,
    isIrpfAnnual,
    isBoletim,
    isCrachaEstagio,
    isCrachaPeriodoEleitoral,
    isCrachaDocument,
    selectsFichaTemplate,
    usesDirectDocumentViewer,
    supportsAllStudentsBatch,
    supportsIssuedDocumentPreview,
    irpfYearOptions,
    isLoadingFichaTemplates,
    selectedFichaTemplate,
    normalizedTerm,
    alunos,
    isSearching,
    matriculas,
    isLoadingMatriculas,
    loteModalidades,
    supportsBatchModalidadeFilter,
    hasBatchModalitySelected,
    turmas,
    isLoadingTurmas,
    selectedMatricula,
    selectedTurma,
    pastaBatchTurmas,
    compatibleFichaTemplates,
    modules,
    isLoadingModules,
    selectedModule,
    crachaTemplate,
    crachaEleitoralTemplate,
    dataLoadError,
    retryFailedDataQueries,
    isCrachaEleitoralAvailable,
    emissionMutation,
    canContinue,
    openDirectDocumentViewer,
    resetFlow,
    crachaPrintItems,
  };
};

export type SecretariaDocumentoWorkspace = ReturnType<typeof useSecretariaDocumentoWorkspace>;
