import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  FileCheck2,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatMatricula } from '../../../../lib/academicUtils';
import { supabase } from '../../../../lib/supabase';
import {
  getDefaultIrpfCalendarYear,
  getIrpfCalendarYearOptions,
} from '../../../../lib/irpfYearUtils';
import { secretariaDocumentosKeys } from './secretaria-documentos.keys';
import {
  getSecretariaContext,
  secretariaDocumentosService,
} from './secretaria-documentos.service';
import {
  SecretariaAlunoResumo,
  SecretariaDocumentoDefinition,
  SecretariaMatriculaResumo,
} from './secretaria-documentos.types';
import SecretariaAlunoSearchCard from './SecretariaAlunoSearchCard';
import SecretariaIssuedDocumentModal from './SecretariaIssuedDocumentModal';
import type { EmissionLog } from '../historico-emissoes/historico-emissoes.types';
import CrachaPreview from '../../cadastros/modelos-documentos/cracha/components/CrachaPreview';
import { waitForQrCodeAssets } from '../../../shared/qrcode/qr-code-assets';
import { crachaService } from '../../cadastros/modelos-documentos/cracha/cracha.service';
import { irpfService } from '../../cadastros/modelos-documentos/irpf/irpf.service';
import CrachaPeriodoEleitoralPreview from '../../cadastros/modelos-documentos/cracha-periodo-eleitoral/components/CrachaPeriodoEleitoralPreview';
import {
  crachaPeriodoEleitoralService,
  isCrachaEleitoralTemplateAvailable,
} from '../../cadastros/modelos-documentos/cracha-periodo-eleitoral/cracha-periodo-eleitoral.service';
import { fichasMatriculaService } from '../../cadastros/ficha-matricula/fichas-matricula.service';
import { getSecretariaErrorMessage } from './secretaria-error';
import { createDocumentReissueKey } from '../../../shared/document-validation/document-validation.service';

interface SecretariaDocumentoEmissionPageProps {
  definition: SecretariaDocumentoDefinition;
}

type EmissionMode = 'individual' | 'lote' | 'custom';

interface CustomEmissionSelection {
  aluno: SecretariaAlunoResumo;
  matricula: SecretariaMatriculaResumo;
}

type DocumentoBatchModalidade = 'TECNICO' | 'LIVRE' | 'ESPECIALIZACAO';

type DocumentoBatchModalidadeOption = {
  label: string;
  value: DocumentoBatchModalidade;
};

const DOCUMENTO_LOTE_MODALIDADES: Record<'pasta_identificacao' | 'ficha_matricula', DocumentoBatchModalidadeOption[]> = {
  pasta_identificacao: [
    { label: 'Técnico', value: 'TECNICO' },
    { label: 'Livre', value: 'LIVRE' },
    { label: 'Especialização', value: 'ESPECIALIZACAO' },
  ],
  ficha_matricula: [
    { label: 'Técnico', value: 'TECNICO' },
    { label: 'Livre', value: 'LIVRE' },
    { label: 'Especialização', value: 'ESPECIALIZACAO' },
  ],
};

const mapModalidadeOptions = (documentoId: string): DocumentoBatchModalidadeOption[] =>
  DOCUMENTO_LOTE_MODALIDADES[
    documentoId as 'pasta_identificacao' | 'ficha_matricula'
  ] || [];

const useDebouncedValue = <T,>(value: T, delayMs: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);
  return debouncedValue;
};

const SecretariaDocumentoEmissionPage: React.FC<SecretariaDocumentoEmissionPageProps> = ({ definition }) => {
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
  const getCrachaRenderTemplate = (item: any) => ({
    ...(crachaTemplate || {}),
    validationPublic: item?.validationPublic === true,
  });
  const chunkArray = <T,>(items: T[], size: number) => {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  };

  const renderCrachaEmptySlot = () => (
    <div className="w-[54mm] h-[85.6mm] border-2 border-dashed border-slate-150 rounded-[2.5mm] bg-slate-50/50 text-[8px] text-slate-300 font-black uppercase tracking-widest flex items-center justify-center print:hidden">
      Espaço vazio
    </div>
  );

  const renderCrachaEleitoralEmptySlot = () => (
    <div className="w-[142mm] h-[86mm] border-2 border-dashed border-slate-150 bg-slate-50/50 text-[8px] text-slate-300 font-black uppercase tracking-widest flex items-center justify-center print:hidden">
      Espaço vazio
    </div>
  );

  const renderCrachaDobraPages = () => {
    const lotes = chunkArray(crachaPrintItems, 5);

    return lotes.map((lote, loteIndex) => {
      const slots = [...lote];
      while (slots.length < 5) slots.push(null as any);

      return (
        <div key={`cracha-dobra-${loteIndex}`} className="print-page cracha-print-page cracha-print-page-landscape w-[297mm] h-[210mm] bg-white text-black p-[8mm] mx-auto shadow-2xl mb-8 box-border border border-slate-200 overflow-hidden">
          <div className="cracha-fold-grid grid grid-cols-5 gap-x-[1.5mm] justify-items-center items-start">
            {slots.map((aluno, index) => (
              <div key={`cracha-dobra-slot-${index}`} className="w-[54mm] h-[171.2mm] flex flex-col rounded-[2.5mm] overflow-hidden border border-slate-250 bg-white">
                {aluno ? (
                  <>
                    <div className="w-[54mm] h-[85.6mm] relative border-b border-dashed border-slate-300">
                      <CrachaPreview formData={getCrachaRenderTemplate(aluno)} page="frente" zoomLevel={100} aluno={aluno} />
                    </div>
                    <div className="w-[54mm] h-[85.6mm] relative">
                      <CrachaPreview formData={getCrachaRenderTemplate(aluno)} page="verso" zoomLevel={100} aluno={aluno} />
                    </div>
                  </>
                ) : renderCrachaEmptySlot()}
              </div>
            ))}
          </div>
          <div className="text-center text-[8px] text-slate-400 font-bold uppercase tracking-widest border-t border-slate-100 pt-2 flex justify-between print:hidden">
            <span>Crachás de Estágio #{loteIndex + 1} — 5 conjuntos frente + verso</span>
            <span>A4 paisagem</span>
          </div>
        </div>
      );
    });
  };

  const renderCrachaDuplexPages = () => {
    const lotes = chunkArray(crachaPrintItems, 10);

    return lotes.map((lote, loteIndex) => {
      const slots = [...lote];
      while (slots.length < 10) slots.push(null as any);
      const versoSlots = slots
        .slice(0, 5).reverse()
        .concat(slots.slice(5, 10).reverse());

      return (
        <React.Fragment key={`cracha-duplex-${loteIndex}`}>
          <div className="print-page cracha-print-page cracha-print-page-landscape w-[297mm] h-[210mm] bg-white text-black p-[8mm] mx-auto shadow-2xl mb-8 box-border border border-slate-200 overflow-hidden">
            <div className="cracha-card-grid grid grid-cols-5 grid-rows-2 gap-x-[1.5mm] gap-y-[3mm] justify-items-center items-center">
              {slots.map((aluno, index) => (
                <div key={`cracha-frente-${index}`} className="w-[54mm] h-[85.6mm] relative rounded-[2.5mm] overflow-hidden border border-slate-200 bg-white">
                  {aluno ? <CrachaPreview formData={getCrachaRenderTemplate(aluno)} page="frente" zoomLevel={100} aluno={aluno} /> : renderCrachaEmptySlot()}
                </div>
              ))}
            </div>
            <div className="text-center text-[8px] text-slate-400 font-bold uppercase tracking-widest border-t border-slate-100 pt-2 flex justify-between print:hidden">
              <span>Crachás de Estágio #{loteIndex + 1} — frentes</span>
              <span>10 por página</span>
            </div>
          </div>

          <div className="print-page cracha-print-page cracha-print-page-landscape w-[297mm] h-[210mm] bg-white text-black p-[8mm] mx-auto shadow-2xl mb-8 box-border border border-slate-200 overflow-hidden">
            <div className="cracha-card-grid grid grid-cols-5 grid-rows-2 gap-x-[1.5mm] gap-y-[3mm] justify-items-center items-center">
              {versoSlots.map((aluno, index) => (
                <div key={`cracha-verso-${index}`} className="w-[54mm] h-[85.6mm] relative rounded-[2.5mm] overflow-hidden border border-slate-200 bg-white">
                  {aluno ? <CrachaPreview formData={getCrachaRenderTemplate(aluno)} page="verso" zoomLevel={100} aluno={aluno} /> : renderCrachaEmptySlot()}
                </div>
              ))}
            </div>
            <div className="text-center text-[8px] text-slate-400 font-bold uppercase tracking-widest border-t border-slate-100 pt-2 flex justify-between print:hidden">
              <span>Crachás de Estágio #{loteIndex + 1} — versos espelhados</span>
              <span>Virar no lado curto para duplex</span>
            </div>
          </div>
        </React.Fragment>
      );
    });
  };

  const buildCrachaEleitoralAluno = (aluno: any) => ({
    nome: aluno.nome,
    matricula: aluno.matricula,
    curso: aluno.curso,
    polo: aluno.polo,
    instituicaoEnsino: crachaEleitoralTemplate?.instituicaoEnsinoPadrao,
    instrutor: crachaEleitoralTemplate?.instrutorPadrao,
  });

  const renderCrachaEleitoralPages = () => {
    const lotes = chunkArray(crachaPrintItems, 2);

    return lotes.map((lote, loteIndex) => {
      const slots = [...lote];
      while (slots.length < 2) slots.push(null as any);

      return (
        <div key={`cracha-eleitoral-${loteIndex}`} className="print-page cracha-eleitoral-print-page w-[297mm] h-[210mm] bg-white text-black p-[6mm] mx-auto shadow-2xl mb-8 box-border border border-slate-200 overflow-hidden">
          <div className="grid grid-rows-2 gap-y-[4mm]">
            {slots.map((aluno, index) => (
              <div key={`cracha-eleitoral-slot-${index}`} className="grid grid-cols-2 gap-x-[4mm] justify-items-center">
                {aluno ? (
                  <>
                    <CrachaPeriodoEleitoralPreview formData={crachaEleitoralTemplate || {}} page="frente" zoomLevel={100} aluno={buildCrachaEleitoralAluno(aluno)} />
                    <CrachaPeriodoEleitoralPreview formData={crachaEleitoralTemplate || {}} page="verso" zoomLevel={100} aluno={buildCrachaEleitoralAluno(aluno)} />
                  </>
                ) : (
                  <>
                    {renderCrachaEleitoralEmptySlot()}
                    {renderCrachaEleitoralEmptySlot()}
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="text-center text-[8px] text-slate-400 font-bold uppercase tracking-widest border-t border-slate-100 pt-2 flex justify-between print:hidden">
            <span>Crachás SES #{loteIndex + 1} — frente e verso lado a lado</span>
            <span>A4 paisagem</span>
          </div>
        </div>
      );
    });
  };

  const handleCrachaPrint = async () => {
    if (!printContentRef.current) return;
    try {
      await waitForQrCodeAssets(printContentRef.current);
      window.print();
    } catch (error) {
      console.error('[SecretariaDocumentoEmissionPage] QR Code indisponível:', error);
      window.alert(
        error instanceof Error
          ? error.message
          : 'Não foi possível preparar os QR Codes para impressão.',
      );
    }
  };

  if (isCrachaPrinting) {
    return createPortal(
      <div className="fixed inset-0 z-[2147483000] flex h-screen h-[100dvh] w-screen flex-col overflow-y-auto bg-slate-950 custom-scrollbar" id="cracha-print-layout">
        <div className="bg-slate-800 text-white p-4 shadow-md sticky top-0 flex justify-between items-center z-[10000] print:hidden">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsCrachaPrinting(false)}
              className="p-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
            >
              <ArrowLeft size={16} /> Voltar
            </button>
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-white">
                Impressão A4 do {isCrachaPeriodoEleitoral ? 'Crachá SES' : 'Crachá'}
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                {isCrachaPeriodoEleitoral
                  ? '2 alunos por folha, frente e verso lado a lado'
                  : crachaPrintLayout === 'dobra' ? '5 conjuntos frente + verso por folha' : '10 por página frente e verso'}
              </p>
            </div>
          </div>

          <button
            onClick={() => void handleCrachaPrint()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-all shadow-lg shadow-blue-950/30"
          >
            <Printer size={16} /> Imprimir / Salvar PDF
          </button>
        </div>

        <div className="flex-1 bg-slate-900 p-8 overflow-y-auto flex flex-col items-center">
          <div className="mb-8 flex w-full max-w-[297mm] items-center gap-3 rounded-2xl border border-blue-800 bg-blue-950/70 p-4 text-white print:hidden">
            <Printer size={20} className="text-blue-300" />
            <p className="text-[10px] font-medium leading-normal text-blue-100">
              {isCrachaPeriodoEleitoral
                ? 'Use papel A4 em paisagem. O modelo eleitoral não possui QR Code e usa a data final configurada como validade padrão.'
                : 'Use papel A4 em paisagem. Para o modo 10 por página, imprima frente e verso virando no lado curto.'}
            </p>
          </div>

          <div ref={printContentRef} className="print-content flex flex-col items-center">
            {isCrachaPeriodoEleitoral
              ? renderCrachaEleitoralPages()
              : crachaPrintLayout === 'dobra' ? renderCrachaDobraPages() : renderCrachaDuplexPages()}
          </div>
        </div>

        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body * { visibility: hidden; }
            #cracha-print-layout, #cracha-print-layout * {
              visibility: visible;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            #cracha-print-layout {
              position: absolute;
              left: 0;
              top: 0;
              width: 297mm !important;
              height: auto !important;
              background: white !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: visible !important;
              box-shadow: none !important;
            }
            .cracha-print-page {
              width: 297mm !important;
              height: 210mm !important;
              page-break-after: always !important;
              page-break-inside: avoid !important;
              margin: 0 !important;
              padding: 8mm !important;
              box-shadow: none !important;
              border: none !important;
              background: white !important;
              box-sizing: border-box !important;
              overflow: hidden !important;
            }
            .cracha-card-grid {
              display: grid !important;
              grid-template-columns: repeat(5, 54mm) !important;
              grid-template-rows: repeat(2, 85.6mm) !important;
              column-gap: 1.5mm !important;
              row-gap: 3mm !important;
              justify-content: center !important;
              align-content: center !important;
            }
            .cracha-fold-grid {
              display: grid !important;
              grid-template-columns: repeat(5, 54mm) !important;
              column-gap: 1.5mm !important;
              justify-content: center !important;
              align-content: start !important;
            }
            .cracha-print-page img {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .cracha-eleitoral-print-page {
              width: 297mm !important;
              height: 210mm !important;
              page-break-after: always !important;
              page-break-inside: avoid !important;
              margin: 0 !important;
              padding: 6mm !important;
              box-shadow: none !important;
              border: none !important;
              background: white !important;
              box-sizing: border-box !important;
              overflow: hidden !important;
            }
          }
          @page { size: A4 landscape; margin: 0; }
        `}} />
      </div>,
      document.body
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <div className={`grid gap-2 ${definition.allowBatch !== false ? 'md:grid-cols-3' : 'md:grid-cols-1'}`}>
          <button
            onClick={() => resetFlow('individual')}
            className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${mode === 'individual' ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
          >
            <Search size={20} />
            <div>
              <p className="text-xs font-black uppercase tracking-wider">Individual</p>
              <p className="mt-0.5 text-[11px] font-medium leading-snug">
                {usesDirectDocumentViewer
                  ? 'Busque um aluno e visualize o documento.'
                  : 'Localize um aluno e confira a matrícula.'}
              </p>
            </div>
          </button>
          {definition.allowBatch !== false && (
            <>
              <button
                onClick={() => resetFlow('lote')}
                className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${mode === 'lote' ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
              >
                <Users size={20} />
                <div>
                  <p className="text-xs font-black uppercase tracking-wider">Em lote</p>
                  <p className="mt-0.5 text-[11px] font-medium leading-snug">
                    {usesDirectDocumentViewer
                      ? 'Gere para uma turma ou todos os alunos.'
                      : 'Prepare a emissão para uma turma.'}
                  </p>
                </div>
              </button>
              <button
                onClick={() => resetFlow('custom')}
                className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${mode === 'custom' ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
              >
                <CreditCard size={20} />
                <div>
                  <p className="text-xs font-black uppercase tracking-wider">Personalizado</p>
                  <p className="mt-0.5 text-[11px] font-medium leading-snug">
                    {usesDirectDocumentViewer
                      ? 'Monte uma lista mista de alunos.'
                      : 'Monte uma lista de alunos deste polo.'}
                  </p>
                </div>
              </button>
            </>
          )}
          </div>
        </div>

        {selectsFichaTemplate && (
          <div className="border-b border-slate-100 bg-blue-50/50 p-4">
            <label className="block text-[9px] font-black uppercase tracking-[0.18em] text-blue-700">
              Modelo da ficha
            </label>
            <select
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
              disabled={isLoadingFichaTemplates || !compatibleFichaTemplates.length}
              className="mt-2 w-full rounded-xl border border-blue-100 bg-white px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 disabled:text-slate-400"
            >
              {!compatibleFichaTemplates.length && (
                <option value="">
                  {isLoadingFichaTemplates
                    ? 'Carregando modelos...'
                    : 'Nenhum modelo ativo compatível com a seleção'}
                </option>
              )}
              {compatibleFichaTemplates.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.nome} — {model.tipoCurso === 'TODOS' ? 'Todos os cursos' : model.tipoCurso}
                </option>
              ))}
            </select>
            {!isLoadingFichaTemplates && !compatibleFichaTemplates.length && (
              <p className="mt-2 text-[10px] font-bold text-rose-600">
                Cadastre e ative um modelo geral ou compatível em Formações → Ficha Cadastral antes de emitir.
              </p>
            )}
          </div>
        )}

        {dataLoadError && (
          <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <div className="flex min-w-0 items-start gap-3">
              <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={18} />
              <div>
                <p className="text-xs font-black uppercase tracking-wider">Dados temporariamente indisponíveis</p>
                <p className="mt-1 text-xs font-semibold">
                  {getSecretariaErrorMessage(
                    dataLoadError,
                    'Não foi possível carregar os dados necessários para esta emissão.',
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={retryFailedDataQueries}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-700 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white hover:bg-amber-800"
            >
              <RefreshCw size={13} /> Tentar novamente
            </button>
          </div>
        )}

      <div className="border-t border-slate-100">
        {!usesDirectDocumentViewer && (
        <div className="grid grid-cols-3 border-b border-slate-100 bg-slate-50/70">
          {['Selecionar', 'Conferir', 'Concluído'].map((label, index) => {
            const itemStep = (index + 1) as 1 | 2 | 3;
            return (
              <div key={label} className={`px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest ${step >= itemStep ? definition.accent : 'text-slate-350'}`}>
                {index + 1}. {label}
              </div>
            );
          })}
        </div>
        )}

        <div className="p-6 md:p-9 min-h-[390px]">
          {step === 1 && mode === 'individual' && (
            <div>
              <h4 className="text-lg font-black text-[#001a33] uppercase">
                {usesDirectDocumentViewer ? `${definition.singularLabel} individual` : 'Localizar aluno'}
              </h4>
              <p className="text-sm text-slate-500 mt-1 mb-6">
                {usesDirectDocumentViewer
                  ? 'Busque um aluno, escolha a matrícula e abra a visualização.'
                  : 'Pesquise dentro da unidade ativa por nome ou CPF.'}
              </p>

              <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setSelectedAluno(null);
                    setSelectedMatriculaId('');
                  }}
                  placeholder="Digite pelo menos 2 caracteres..."
                  className="w-full pl-12 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 text-sm font-medium"
                />
              </div>

              {normalizedTerm.length >= 2 && !selectedAluno && (
                <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
                  {isSearching ? (
                    <div className="py-8 flex justify-center text-slate-400"><Loader2 className="animate-spin" /></div>
                  ) : alunos.length ? (
                    alunos.map((aluno) => (
                      <SecretariaAlunoSearchCard
                        key={aluno.id}
                        nome={aluno.nome}
                        cpf={aluno.cpf}
                        cursoNome={aluno.cursoNome}
                        turmaNome={aluno.turmaNome}
                        turmaCodigo={aluno.turmaCodigo}
                        matricula={aluno.matricula}
                        fotoUrl={aluno.fotoUrl}
                        tone="blue"
                        onClick={() => setSelectedAluno(aluno)}
                      />
                    ))
                  ) : (
                    <p className="py-8 text-center text-sm text-slate-400">Nenhum aluno encontrado nesta unidade.</p>
                  )}
                </div>
              )}

              {selectedAluno && (
                <div className="mt-5">
                  <SecretariaAlunoSearchCard
                    nome={selectedAluno.nome}
                    cpf={selectedAluno.cpf}
                    cursoNome={selectedMatricula?.cursoNome || selectedAluno.cursoNome}
                    turmaNome={selectedMatricula?.turmaNome || selectedAluno.turmaNome}
                    turmaCodigo={selectedMatricula?.turmaCodigo || selectedAluno.turmaCodigo}
                    matricula={selectedMatricula
                      ? formatMatricula(selectedMatricula.id, selectedMatricula.dataMatricula, selectedMatricula.poloId)
                      : selectedAluno.matricula}
                    fotoUrl={selectedAluno.fotoUrl}
                    tone="blue"
                    selected
                    actionLabel="Trocar"
                    onClick={() => {
                      setSelectedAluno(null);
                      setSelectedMatriculaId('');
                    }}
                  />

                  <label className="block mt-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Matrícula / turma</label>
                  {isLoadingMatriculas ? (
                    <div className="py-6 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
                  ) : (
                    <select
                      value={selectedMatriculaId}
                      onChange={(event) => {
                        setSelectedMatriculaId(event.target.value);
                        setSelectedModuleId('');
                      }}
                      className="w-full mt-2 p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:border-blue-500 text-sm font-bold text-slate-700"
                    >
                      {!matriculas.length && <option value="">Nenhuma matrícula compatível</option>}
                      {matriculas.map((matricula) => (
                        <option key={matricula.id} value={matricula.id}>
                          {matricula.cursoNome} — {matricula.turmaNome} ({matricula.status})
                        </option>
                      ))}
                      </select>
                  )}

                  {isBoletim && selectedMatriculaId && (
                    <div className="mt-5">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Módulo do boletim
                      </label>
                      <select
                        value={selectedModuleId}
                        onChange={(event) => setSelectedModuleId(event.target.value)}
                        disabled={isLoadingModules || !modules.length}
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
                      >
                        <option value="">
                          {isLoadingModules ? 'Carregando módulos...' : 'Selecione o módulo'}
                        </option>
                        {modules.map((module) => (
                          <option key={module.id} value={module.id}>{module.nome}</option>
                        ))}
                      </select>
                      {!isLoadingModules && !modules.length && (
                        <p className="mt-2 text-[11px] font-semibold text-rose-600">
                          Esta turma não possui módulos vinculados à grade curricular.
                        </p>
                      )}
                    </div>
                  )}

                  {isIrpfAnnual && (
                    <div className="mt-5">
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Ano-calendário</label>
                      <select
                        value={selectedReferenceYear}
                        onChange={(event) => setSelectedReferenceYear(Number(event.target.value))}
                        className="w-full mt-2 p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:border-blue-500 text-sm font-bold text-slate-700"
                      >
                        {irpfYearOptions.map((option) => (
                          <option key={option.year} value={option.year} disabled={!option.released}>
                            {option.year} {option.released ? '' : `(libera em ${option.releaseLabel})`}
                          </option>
                        ))}
                      </select>
                      <p className="mt-2 text-[11px] font-semibold text-slate-500">
                        O registro fica separado pelo ano de referência e pode ser localizado no histórico mesmo depois do encerramento da turma.
                      </p>
                    </div>
                  )}

                  {usesDirectDocumentViewer && (
                    <div className="mt-8 flex flex-col items-center">
                      <button
                        type="button"
                        onClick={openDirectDocumentViewer}
                        disabled={!canContinue || emissionMutation.isPending}
                        className="inline-flex min-w-[280px] items-center justify-center gap-2 rounded-2xl bg-[#001a33] px-8 py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg transition-colors hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {emissionMutation.isPending
                          ? <Loader2 size={16} className="animate-spin" />
                          : <Printer size={16} />}
                        {emissionMutation.isPending
                          ? 'Preparando visualização...'
                          : `Visualizar ${definition.singularLabel}`}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {usesDirectDocumentViewer && emissionMutation.isError && (
                <p className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">
                  {getSecretariaErrorMessage(
                    emissionMutation.error,
                    'Não foi possível preparar a visualização.',
                  )}
                </p>
              )}
            </div>
          )}

          {step === 1 && mode === 'lote' && (
            <div>
              <h4 className="text-lg font-black text-[#001a33] uppercase">
                {supportsAllStudentsBatch ? 'Emissão em lote' : 'Selecionar turma'}
              </h4>
              <p className="text-sm text-slate-500 mt-1 mb-6">
                {supportsAllStudentsBatch
                  ? 'Gere as pastas para uma turma específica ou para todos os alunos deste polo.'
                  : 'A emissão será preparada conforme a regra acadêmica deste documento.'}
              </p>
              {isLoadingTurmas ? (
                <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
              ) : supportsAllStudentsBatch ? (
                <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
                  {supportsBatchModalidadeFilter && (
                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase text-slate-500">
                        Tipo de modalidade
                      </label>
                      <select
                        value={selectedBatchModalidade}
                        onChange={(event) => {
                          setSelectedBatchModalidade(event.target.value);
                          setSelectedTurmaId('');
                        }}
                        className="w-full cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 p-4 font-bold text-slate-700 outline-none focus:border-purple-500"
                      >
                        {loteModalidades.map((modalidade) => (
                          <option key={modalidade.value} value={modalidade.value}>
                            {modalidade.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase text-slate-500">
                      Selecione a turma
                    </label>
                    <select
                      value={selectedTurmaId}
                      onChange={(event) => setSelectedTurmaId(event.target.value)}
                      disabled={!hasBatchModalitySelected}
                      className="w-full cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 p-4 font-bold text-slate-700 outline-none focus:border-purple-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <option value="todos">Todos os alunos deste polo</option>
                      {pastaBatchTurmas.map((turma) => (
                        <option key={turma.id} value={turma.id}>
                          {turma.nome} ({turma.codigo})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase text-slate-500">
                      Alunos no lote
                    </label>
                    <div className="w-full rounded-2xl border border-blue-100 bg-blue-50 p-4 font-bold text-blue-700">
                      {selectedTurmaId === 'todos'
                        ? `${pastaBatchTurmas.reduce((total, turma) => total + turma.totalAlunos, 0)} alunos ativos no polo`
                        : `${selectedTurma?.totalAlunos || 0} alunos ativos na turma`}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {supportsBatchModalidadeFilter && (
                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase text-slate-500">
                        Tipo de modalidade
                      </label>
                      <select
                        value={selectedBatchModalidade}
                        onChange={(event) => {
                          setSelectedBatchModalidade(event.target.value);
                          setSelectedTurmaId('');
                        }}
                        className="w-full cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 p-4 font-bold text-slate-700 outline-none focus:border-purple-500"
                      >
                        {loteModalidades.map((modalidade) => (
                          <option key={modalidade.value} value={modalidade.value}>
                            {modalidade.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {turmas.map((turma) => (
                    <button
                      key={turma.id}
                      onClick={() => {
                        setSelectedTurmaId(turma.id);
                        setSelectedModuleId('');
                      }}
                      className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between transition-all ${selectedTurmaId === turma.id ? `${definition.softAccent} border-current ${definition.accent}` : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'}`}
                    >
                      <div>
                        <p className="font-black text-sm text-[#001a33]">{turma.cursoNome}</p>
                        <p className="text-xs text-slate-500 mt-1">{turma.nome} · {turma.turno}</p>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider">{turma.totalAlunos} alunos</span>
                    </button>
                  ))}
                  {!turmas.length && <p className="py-12 text-center text-sm text-slate-400">Nenhuma turma compatível na unidade ativa.</p>}
                </div>
              )}
              {isBoletim && selectedTurmaId && (
                <div className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-indigo-700">
                    Módulo do boletim
                  </label>
                  <select
                    value={selectedModuleId}
                    onChange={(event) => setSelectedModuleId(event.target.value)}
                    disabled={isLoadingModules || !modules.length}
                    className="mt-2 w-full rounded-xl border border-indigo-150 bg-white p-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 disabled:text-slate-400"
                  >
                    <option value="">
                      {isLoadingModules ? 'Carregando módulos...' : 'Selecione o módulo da turma'}
                    </option>
                    {modules.map((module) => (
                      <option key={module.id} value={module.id}>{module.nome}</option>
                    ))}
                  </select>
                  <p className="mt-2 text-[11px] font-semibold text-slate-500">
                    Todos os boletins deste lote serão gerados somente com as disciplinas do módulo escolhido.
                  </p>
                </div>
              )}

              {usesDirectDocumentViewer && (
                <div className="mt-8 flex flex-col items-center">
                  <button
                    type="button"
                    onClick={openDirectDocumentViewer}
                    disabled={!canContinue || emissionMutation.isPending}
                    className="inline-flex min-w-[280px] items-center justify-center gap-2 rounded-2xl bg-[#001a33] px-8 py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg transition-colors hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {emissionMutation.isPending
                      ? <Loader2 size={16} className="animate-spin" />
                      : <Printer size={16} />}
                    {emissionMutation.isPending
                      ? 'Preparando visualização...'
                      : `Visualizar lote de ${definition.singularLabel}`}
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 1 && mode === 'custom' && (
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg font-black uppercase text-[#001a33]">Montar lista personalizada</h4>
                  <p className="mt-1 text-sm text-slate-500">
                    Busque cada aluno, escolha a matrícula correta e adicione à lista.
                  </p>
                </div>
                {customSelections.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomSelections([]);
                      setSelectedModuleId('');
                    }}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider text-rose-600 transition-colors hover:bg-rose-50"
                  >
                    <Trash2 size={13} /> Esvaziar
                  </button>
                )}
              </div>

              <div className="relative mt-6">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setSelectedAluno(null);
                    setSelectedMatriculaId('');
                  }}
                  placeholder="Buscar aluno por nome ou CPF..."
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-5 text-sm font-medium outline-none focus:border-blue-500"
                />
              </div>

              {normalizedTerm.length >= 2 && !selectedAluno && (
                <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
                  {isSearching ? (
                    <div className="flex justify-center py-8 text-slate-400"><Loader2 className="animate-spin" /></div>
                  ) : alunos.length ? (
                    alunos.map((aluno) => (
                      <SecretariaAlunoSearchCard
                        key={aluno.id}
                        nome={aluno.nome}
                        cpf={aluno.cpf}
                        cursoNome={aluno.cursoNome}
                        turmaNome={aluno.turmaNome}
                        turmaCodigo={aluno.turmaCodigo}
                        matricula={aluno.matricula}
                        fotoUrl={aluno.fotoUrl}
                        tone="blue"
                        onClick={() => {
                          setSelectedAluno(aluno);
                          setSelectedMatriculaId('');
                        }}
                      />
                    ))
                  ) : (
                    <p className="py-8 text-center text-sm text-slate-400">Nenhum aluno encontrado nesta unidade.</p>
                  )}
                </div>
              )}

              {selectedAluno && (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                  <SecretariaAlunoSearchCard
                    nome={selectedAluno.nome}
                    cpf={selectedAluno.cpf}
                    cursoNome={selectedMatricula?.cursoNome || selectedAluno.cursoNome}
                    turmaNome={selectedMatricula?.turmaNome || selectedAluno.turmaNome}
                    turmaCodigo={selectedMatricula?.turmaCodigo || selectedAluno.turmaCodigo}
                    matricula={selectedMatricula
                      ? formatMatricula(selectedMatricula.id, selectedMatricula.dataMatricula, selectedMatricula.poloId)
                      : selectedAluno.matricula}
                    fotoUrl={selectedAluno.fotoUrl}
                    tone="blue"
                    selected
                    actionLabel="Trocar"
                    onClick={() => {
                      setSelectedAluno(null);
                      setSelectedMatriculaId('');
                    }}
                  />

                  <label className="mt-4 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Matrícula / turma
                  </label>
                  {isLoadingMatriculas ? (
                    <div className="flex justify-center py-6"><Loader2 className="animate-spin text-slate-400" /></div>
                  ) : (
                    <select
                      value={selectedMatriculaId}
                      onChange={(event) => setSelectedMatriculaId(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
                    >
                      {!matriculas.length && <option value="">Nenhuma matrícula compatível</option>}
                      {matriculas.map((matricula) => (
                        <option key={matricula.id} value={matricula.id}>
                          {matricula.cursoNome} — {matricula.turmaNome} ({matricula.status})
                        </option>
                      ))}
                    </select>
                  )}

                  {isBoletim
                    && selectedMatricula
                    && customSelections.length > 0
                    && customSelections[0].matricula.turmaId !== selectedMatricula.turmaId && (
                      <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-[11px] font-semibold text-amber-800">
                        No Boletim, a lista personalizada deve conter alunos da mesma turma para usar o mesmo módulo.
                      </p>
                    )}

                  <button
                    type="button"
                    disabled={
                      !selectedMatricula
                      || customSelections.some((selection) => selection.matricula.id === selectedMatricula.id)
                      || (isBoletim
                        && customSelections.length > 0
                        && customSelections[0].matricula.turmaId !== selectedMatricula.turmaId)
                    }
                    onClick={() => {
                      if (!selectedAluno || !selectedMatricula) return;
                      setCustomSelections((current) => [...current, {
                        aluno: selectedAluno,
                        matricula: selectedMatricula,
                      }]);
                      setSelectedAluno(null);
                      setSelectedMatriculaId('');
                      setSearchTerm('');
                    }}
                    className="mt-4 w-full rounded-xl bg-[#001a33] px-5 py-3 text-xs font-black uppercase tracking-wider text-white transition-colors hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {selectedMatricula
                      && customSelections.some((selection) => selection.matricula.id === selectedMatricula.id)
                      ? 'Matrícula já adicionada'
                      : 'Adicionar à lista'}
                  </button>
                </div>
              )}

              <div className="mt-6 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Alunos selecionados</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">
                    {customSelections.length}
                  </span>
                </div>
                {customSelections.length ? (
                  <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                    {customSelections.map((selection) => (
                      <div key={selection.matricula.id} className="flex items-center justify-between gap-4 p-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-[#001a33]">{selection.aluno.nome}</p>
                          <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">
                            {selection.matricula.cursoNome} · {selection.matricula.turmaNome}
                          </p>
                        </div>
                        <button
                          type="button"
                          title="Remover aluno"
                          onClick={() => {
                            setCustomSelections((current) =>
                              current.filter((item) => item.matricula.id !== selection.matricula.id)
                            );
                            if (customSelections.length === 1) setSelectedModuleId('');
                          }}
                          className="shrink-0 rounded-xl p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="p-8 text-center text-xs font-bold uppercase text-slate-400">
                    Nenhum aluno adicionado à lista.
                  </p>
                )}
              </div>

              {isBoletim && customSelections.length > 0 && (
                <div className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-indigo-700">
                    Módulo do boletim
                  </label>
                  <select
                    value={selectedModuleId}
                    onChange={(event) => setSelectedModuleId(event.target.value)}
                    disabled={isLoadingModules || !modules.length}
                    className="mt-2 w-full rounded-xl border border-indigo-150 bg-white p-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 disabled:text-slate-400"
                  >
                    <option value="">
                      {isLoadingModules ? 'Carregando módulos...' : 'Selecione o módulo da turma'}
                    </option>
                    {modules.map((module) => (
                      <option key={module.id} value={module.id}>{module.nome}</option>
                    ))}
                  </select>
                  <p className="mt-2 text-[11px] font-semibold text-slate-500">
                    O módulo selecionado será aplicado a todos os alunos desta lista.
                  </p>
                </div>
              )}

              {usesDirectDocumentViewer && (
                <div className="mt-8 flex flex-col items-center">
                  <button
                    type="button"
                    onClick={openDirectDocumentViewer}
                    disabled={!canContinue || emissionMutation.isPending}
                    className="inline-flex min-w-[280px] items-center justify-center gap-2 rounded-2xl bg-[#001a33] px-8 py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg transition-colors hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {emissionMutation.isPending
                      ? <Loader2 size={16} className="animate-spin" />
                      : <Printer size={16} />}
                    {emissionMutation.isPending
                      ? 'Preparando visualização...'
                      : `Visualizar seleção de ${definition.singularLabel}`}
                  </button>
                </div>
              )}
            </div>
          )}

          {usesDirectDocumentViewer && mode !== 'individual' && emissionMutation.isError && (
            <p className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">
              {getSecretariaErrorMessage(
                emissionMutation.error,
                'Não foi possível preparar a visualização.',
              )}
            </p>
          )}

          {!usesDirectDocumentViewer && step === 2 && (
            <div>
              <h4 className="text-lg font-black text-[#001a33] uppercase">Conferência da emissão</h4>
              <p className="text-sm text-slate-500 mt-1 mb-6">Os dados acadêmicos serão consolidados pelo serviço de emissão.</p>
              <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100">
                <div className="p-4 flex justify-between gap-4">
                  <span className="text-xs font-bold text-slate-400 uppercase">Documento</span>
                  <span className="text-sm font-black text-[#001a33] text-right">{definition.singularLabel}</span>
                </div>
                <div className="p-4 flex justify-between gap-4">
                  <span className="text-xs font-bold text-slate-400 uppercase">Modo</span>
                  <span className="text-sm font-black text-[#001a33]">
                    {mode === 'individual' ? 'Individual' : mode === 'lote' ? 'Lote por turma' : 'Personalizado'}
                  </span>
                </div>
                <div className="p-4 flex justify-between gap-4">
                  <span className="text-xs font-bold text-slate-400 uppercase">
                    {mode === 'individual' ? 'Aluno' : mode === 'lote' ? 'Turma' : 'Seleção'}
                  </span>
                  <span className="text-sm font-black text-[#001a33] text-right">
                    {mode === 'individual'
                      ? `${selectedAluno?.nome} · ${selectedMatricula?.cursoNome || ''}`
                      : mode === 'lote'
                        ? `${selectedTurma?.cursoNome || ''} · ${selectedTurma?.nome || ''}`
                        : `${customSelections.length} ${customSelections.length === 1 ? 'aluno selecionado' : 'alunos selecionados'}`}
                  </span>
                </div>
                {mode === 'custom' && (
                  <div className="p-4">
                    <p className="text-xs font-bold uppercase text-slate-400">Alunos</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {customSelections.map((selection) => (
                        <span
                          key={selection.matricula.id}
                          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-600"
                        >
                          {selection.aluno.nome}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selectsFichaTemplate && (
                  <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-blue-600">Modelo</p>
                    <p className="mt-1 text-xs font-black text-[#001a33]">
                      {selectedFichaTemplate?.nome || 'Nenhum modelo selecionado'}
                    </p>
                  </div>
                )}
                {isIrpfAnnual && (
                  <div className="p-4 flex justify-between gap-4">
                    <span className="text-xs font-bold text-slate-400 uppercase">Ano-calendário</span>
                    <span className="text-sm font-black text-[#001a33]">{selectedReferenceYear}</span>
                  </div>
                )}
                {isBoletim && (
                  <div className="p-4 flex justify-between gap-4">
                    <span className="text-xs font-bold text-slate-400 uppercase">Módulo</span>
                    <span className="text-sm font-black text-[#001a33] text-right">{selectedModule?.nome || 'Não selecionado'}</span>
                  </div>
                )}
              </div>
              {isCrachaPeriodoEleitoral && !isCrachaEleitoralAvailable && (
                <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-amber-800">
                  <p className="text-[10px] font-black uppercase tracking-widest">Modelo SES desativado</p>
                  <p className="mt-1 text-xs font-semibold leading-relaxed">
                    Ative um modelo em Formações, Modelos de Documentos, SES.
                  </p>
                </div>
              )}
              {isCrachaEstagio && (
                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setCrachaPrintLayout('dobra')}
                    className={`rounded-2xl border p-4 text-left transition-all ${crachaPrintLayout === 'dobra' ? 'border-rose-300 bg-rose-50 text-rose-800 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                  >
                    <input type="radio" checked={crachaPrintLayout === 'dobra'} readOnly className="accent-rose-600" />
                    <span className="ml-2 text-xs font-black uppercase tracking-wider">5 por folha</span>
                    <p className="mt-2 text-[11px] font-semibold leading-snug text-slate-500">
                      Frente e verso juntos na mesma folha para corte/dobra manual.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCrachaPrintLayout('duplex')}
                    className={`rounded-2xl border p-4 text-left transition-all ${crachaPrintLayout === 'duplex' ? 'border-rose-300 bg-rose-50 text-rose-800 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                  >
                    <input type="radio" checked={crachaPrintLayout === 'duplex'} readOnly className="accent-rose-600" />
                    <span className="ml-2 text-xs font-black uppercase tracking-wider">10 por página</span>
                    <p className="mt-2 text-[11px] font-semibold leading-snug text-slate-500">
                      Uma página com frentes e outra com versos espelhados para impressão duplex.
                    </p>
                  </button>
                </div>
              )}
              {emissionMutation.isError && (
                <p className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">
                  {getSecretariaErrorMessage(
                    emissionMutation.error,
                    'Não foi possível preparar a emissão.',
                  )}
                </p>
              )}
            </div>
          )}

          {!usesDirectDocumentViewer && step === 3 && (
            <div className="py-10 text-center">
              <div className={`w-20 h-20 rounded-full ${definition.softAccent} ${definition.accent} flex items-center justify-center mx-auto`}>
                <CheckCircle2 size={38} />
              </div>
              <h4 className="text-2xl font-black text-[#001a33] mt-6">Emissão preparada</h4>
              <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
                A solicitação foi registrada para esta unidade e já pode seguir para a composição do documento.
              </p>
              {!!emissionMutation.data?.codes?.length && (
                <div className="mt-6 max-w-xl mx-auto p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
                    {emissionMutation.data.codes.length === 1 ? 'Código de validação' : 'Códigos de validação'}
                  </p>
                  <div className="max-h-36 overflow-y-auto space-y-2">
                    {emissionMutation.data.codes.map((code: string) => (
                      <code key={code} className="block px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-blue-700 select-all">
                        {code}
                      </code>
                    ))}
                  </div>
                </div>
              )}
              {isCrachaDocument && !!crachaPrintItems.length && (
                <div className="mt-6 max-w-xl mx-auto p-4 bg-rose-50 border border-rose-100 rounded-2xl text-left">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-rose-700">Exportação do crachá</p>
                      <p className="mt-1 text-xs font-semibold text-slate-600">
                        {isCrachaPeriodoEleitoral
                          ? 'Modelo eleitoral: 2 alunos por folha, frente e verso lado a lado.'
                          : `Layout selecionado: ${crachaPrintLayout === 'dobra' ? '5 por folha, frente e verso juntos' : '10 por página, frente e verso'}.`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsCrachaPrinting(true)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-rose-700"
                    >
                      <Printer size={15} /> Imprimir / PDF
                    </button>
                  </div>
                </div>
              )}
              {supportsIssuedDocumentPreview && issuedEmissions.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsIssuedDocumentOpen(true)}
                  className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg hover:bg-blue-700"
                >
                  <Printer size={15} /> Abrir documento / PDF
                </button>
              )}
              <button onClick={() => resetFlow(mode)} className="mt-7 px-6 py-3 rounded-xl bg-[#001a33] text-white text-xs font-black uppercase tracking-widest">
                Nova emissão
              </button>
            </div>
          )}
        </div>

        {!usesDirectDocumentViewer && step < 3 && (
          <div className="px-6 md:px-9 py-5 border-t border-slate-100 bg-slate-50/70 flex justify-between gap-3">
            <button
              onClick={() => step === 2 ? setStep(1) : resetFlow(mode)}
              className="px-5 py-3 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-black uppercase tracking-wider"
            >
              {step === 2 ? 'Voltar' : 'Limpar'}
            </button>
            <button
              disabled={!canContinue || emissionMutation.isPending}
              onClick={() => {
                if (step === 1) {
                  setStep(2);
                  return;
                }
                emissionMutation.mutate();
              }}
              className="px-6 py-3 rounded-xl bg-[#001a33] text-white text-xs font-black uppercase tracking-wider disabled:opacity-40 flex items-center gap-2"
            >
              {emissionMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : step === 1 ? <ChevronRight size={15} /> : <FileCheck2 size={15} />}
              {step === 1 ? 'Continuar' : definition.actionLabel}
            </button>
          </div>
        )}
      </div>
      {isIssuedDocumentOpen && issuedEmissions.length > 0 && (
        <SecretariaIssuedDocumentModal
          emissions={issuedEmissions}
          poloId={context.poloId}
          definition={definition}
          onClose={() => setIsIssuedDocumentOpen(false)}
        />
      )}
    </div>
    </div>
  );
};

export default SecretariaDocumentoEmissionPage;
