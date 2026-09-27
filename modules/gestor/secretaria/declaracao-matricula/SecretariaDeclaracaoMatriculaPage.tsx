import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { formatMatricula } from '../../../../lib/academicUtils';
import { declaracaoService } from '../../cadastros/modelos-documentos/declaracao/declaracao.service';
import { marcaDaguaService } from '../../configuracoes/marca-dagua/marca-dagua.service';
import { polosService } from '../../configuracoes/polos/polos.service';
import {
  createDocumentReissueKey,
  documentValidationService,
} from '../../../shared/document-validation/document-validation.service';
import { documentValidationPoliciesService } from '../../cadastros/modelos-documentos/validacao-documental/document-validation-policies.service';
import { resolveStudentIdentityDocument } from '../../../shared/utils/studentIdentityDocument';
import {
  buildSelectablePdfBlobFromElements,
  downloadPdfBlob,
} from '../../../shared/pdf/dom-to-selectable-pdf';
import {
  inlineDeclaracaoPrintImages,
  waitForDeclaracaoPrintAssets,
} from './declaracao-print-assets';
import SecretariaDeclaracaoPrintViewer from './SecretariaDeclaracaoPrintViewer';
import SecretariaDeclaracaoSelection from './SecretariaDeclaracaoSelection';
import {
  DECLARACAO_TEMPLATE_DEFAULT,
  type DeclaracaoAluno,
  type DeclaracaoMode,
  type SecretariaDeclaracaoMatriculaPageProps,
} from './declaracao-matricula.types';

const DEFAULT_DOCUMENT_TYPE = 'declaracao_matricula' as const;

const SecretariaDeclaracaoMatriculaPage = ({
  documentService = declaracaoService,
  defaultTemplate = DECLARACAO_TEMPLATE_DEFAULT,
  documentTitle = 'Declaração de Matrícula',
  documentType = DEFAULT_DOCUMENT_TYPE,
  fileSlug = 'declaracoes-matricula',
}: SecretariaDeclaracaoMatriculaPageProps) => {
  const [mode, setMode] = useState<DeclaracaoMode>('individual');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchQueryCustom, setSearchQueryCustom] = useState('');
  const [loading, setLoading] = useState(true);
  const [poloInfo, setPoloInfo] = useState<any>(null);
  const [alunos, setAlunos] = useState<DeclaracaoAluno[]>([]);
  const [turmas, setTurmas] = useState<any[]>([]);
  const [selectedAluno, setSelectedAluno] = useState<DeclaracaoAluno | null>(null);
  const [customSelectedAlunos, setCustomSelectedAlunos] = useState<DeclaracaoAluno[]>([]);
  const [selectedTurmaId, setSelectedTurmaId] = useState('todos');
  const [templateConfig, setTemplateConfig] = useState<any>(defaultTemplate);
  const [watermark, setWatermark] = useState<any>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPreparingValidation, setIsPreparingValidation] = useState(false);
  const [validationCodes, setValidationCodes] = useState<Record<string, string>>({});
  const [validationExpirations, setValidationExpirations] = useState<Record<string, string | null>>({});
  const [validationPublicByStudent, setValidationPublicByStudent] = useState<Record<string, boolean>>({});
  const [validationPublic, setValidationPublic] = useState(true);
  const [validationValidityDays, setValidationValidityDays] = useState<number | null>(null);
  const [frequenciesByStudent, setFrequenciesByStudent] = useState<Record<string, number>>({});
  const printContentRef = useRef<HTMLDivElement>(null);
  const validationRequestRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);
  const validationRequestInFlightRef = useRef(false);

  useEffect(() => {
    if (!isPrinting) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDownloading) setIsPrinting(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isDownloading, isPrinting]);

  const loadAcademicoData = async (activePoloId: string) => {
    try {
      setLoading(true);
      const [poloData, enrollmentsResult] = await Promise.all([
        polosService.getById(activePoloId),
        supabase
          .from('matriculas')
          .select(`
            id, aluno_id, turma_id, status, data_matricula,
            parceiros!inner(id, nome, cpf_cnpj, rg, data_nascimento, foto_url, tipo_documento),
            turmas!inner(
              id, nome, codigo, status, polo_id,
              cursos!inner(nome), polos(nome, cnpj, cidade, estado)
            )
          `)
          .in('status', ['ATIVO', 'PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO'])
          .eq('turmas.status', 'EM_ANDAMENTO')
          .or(`polo_id.eq.${activePoloId},polo_id.is.null`, { foreignTable: 'turmas' })
          .order('data_matricula', { ascending: false }),
      ]);
      setPoloInfo(poloData);
      if (enrollmentsResult.error) throw enrollmentsResult.error;

      const enrollmentsByStudent = new Map<string, any[]>();
      const classesById = new Map<string, { id: string; nome: string; codigo: string }>();
      ((enrollmentsResult.data || []) as any[]).forEach((enrollment) => {
        const current = enrollmentsByStudent.get(enrollment.aluno_id) || [];
        current.push(enrollment);
        enrollmentsByStudent.set(enrollment.aluno_id, current);
        if (enrollment.turmas?.id && !classesById.has(enrollment.turmas.id)) {
          classesById.set(enrollment.turmas.id, {
            id: enrollment.turmas.id,
            nome: enrollment.turmas.nome || 'Turma',
            codigo: enrollment.turmas.codigo || '',
          });
        }
      });

      const mapped = [...enrollmentsByStudent.values()].map((studentEnrollments): DeclaracaoAluno => {
        const activeMat = studentEnrollments[0];
        const student = activeMat.parceiros || {};
        const turma = activeMat.turmas || {};
        const turmaPolo = turma.polos || {};
        const rawCidade = turmaPolo.cidade || poloData?.cidade || 'Aracaju';
        const rawUf = turmaPolo.estado || poloData?.estado || 'SE';
        const identity = resolveStudentIdentityDocument(student);
        return {
          id: student.id || activeMat.aluno_id,
          enrollmentId: activeMat.id,
          nome: String(student.nome || '').toUpperCase(),
          cpf: student.cpf_cnpj || '',
          rg: identity.number,
          nascimento: student.data_nascimento || '',
          matricula: formatMatricula(activeMat.id, activeMat.data_matricula, turma.polo_id || activePoloId),
          curso: turma.cursos?.nome || 'Curso Geral',
          turmaNome: turma.nome || '',
          turmaCodigo: turma.codigo || '',
          instituicao: 'Universo Cursos e Consultoria',
          fotoUrl: student.foto_url || null,
          tipoDocumento: student.tipo_documento || '',
          turmaIds: studentEnrollments.map((enrollment) => enrollment.turma_id),
          poloNome: turmaPolo.nome || poloData?.nome || 'Universo Cursos e Consultoria',
          poloCnpj: turmaPolo.cnpj || poloData?.cnpj || '',
          cidadePolo: rawCidade.includes('/') ? rawCidade : `${rawCidade}/${rawUf}`,
        };
      });
      setTurmas([...classesById.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
      setAlunos(mapped.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
    } catch (error) {
      console.error('Erro ao carregar dados acadêmicos:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initConfigs = async () => {
      try {
        const activePoloId = sessionStorage.getItem('current_polo_id') || '44444444-4444-4444-4444-444444444444';
        const [template, watermarks, , validationPolicy] = await Promise.all([
          documentService.getTemplate(activePoloId),
          marcaDaguaService.getCompaniesWithWatermark(),
          loadAcademicoData(activePoloId),
          documentValidationPoliciesService.getByDocument(documentType),
        ]);
        setTemplateConfig(template);
        setWatermark(watermarks.find((item) => item.id === activePoloId));
        setValidationPublic(validationPolicy?.validacao_publica !== false);
        setValidationValidityDays(validationPolicy?.validade_dias ?? null);
      } catch (error) {
        console.error('Erro ao carregar configurações de declaração:', error);
      }
    };
    void initConfigs();
  }, []);

  const rawAlunosParaImprimir = mode === 'individual'
    ? (selectedAluno ? [selectedAluno] : [])
    : mode === 'lote'
      ? (selectedTurmaId === 'todos'
          ? alunos
          : alunos.filter((aluno) => aluno.turmaIds?.includes(selectedTurmaId)))
      : customSelectedAlunos;

  const handlePrintAction = async () => {
    if (validationRequestInFlightRef.current) return;
    const eligibleTargets = rawAlunosParaImprimir.filter((aluno) => aluno.enrollmentId);
    if (!eligibleTargets.length) {
      alert('Nenhuma matrícula válida foi encontrada para gerar os códigos de autenticação.');
      return;
    }
    const requestFingerprint = JSON.stringify([
      documentType,
      eligibleTargets.map((aluno) => aluno.enrollmentId),
    ]);
    if (validationRequestRef.current?.fingerprint !== requestFingerprint) {
      validationRequestRef.current = {
        fingerprint: requestFingerprint,
        idempotencyKey: createDocumentReissueKey(),
      };
    }

    validationRequestInFlightRef.current = true;
    setIsPreparingValidation(true);
    try {
      if (documentType === 'declaracao_frequencia') {
        const frequencyEntries = await Promise.all(eligibleTargets.map(async (aluno) => {
          const { data, error } = await (supabase.rpc as any)('get_secretaria_documento_academico', {
            p_matricula_id: aluno.enrollmentId,
            p_documento: 'declaracao_frequencia',
          });
          if (error) throw error;
          const frequency = data?.frequenciaGeral;
          if (frequency === null || frequency === undefined) {
            throw new Error(`A frequência de ${aluno.nome} ainda não está consolidada.`);
          }
          return [aluno.id, Number(frequency)] as const;
        }));
        setFrequenciesByStudent((current) => ({ ...current, ...Object.fromEntries(frequencyEntries) }));
      }

      const issues = await Promise.all(eligibleTargets.map(async (aluno) => ({
        alunoId: aluno.id,
        issue: await documentValidationService.reissue({
          type: documentType,
          enrollmentId: aluno.enrollmentId!,
          idempotencyKey: `${validationRequestRef.current!.idempotencyKey}:${aluno.enrollmentId}`,
        }),
      })));
      setValidationCodes((current) => ({
        ...current,
        ...Object.fromEntries(issues.map(({ alunoId, issue }) => [alunoId, issue.code])),
      }));
      setValidationExpirations((current) => ({
        ...current,
        ...Object.fromEntries(issues.map(({ alunoId, issue }) => [alunoId, issue.expiresAt])),
      }));
      setValidationPublicByStudent((current) => ({
        ...current,
        ...Object.fromEntries(issues.map(({ alunoId, issue }) => [alunoId, issue.validationPublic])),
      }));
      setIsPrinting(true);
      validationRequestRef.current = null;
    } catch (error) {
      console.error('Erro ao registrar emissão de declaração:', error);
      alert(error instanceof Error ? error.message : 'Não foi possível preparar as declarações.');
    } finally {
      validationRequestInFlightRef.current = false;
      setIsPreparingValidation(false);
    }
  };

  const handleDownload = async () => {
    const pages = Array.from(
      printContentRef.current?.querySelectorAll<HTMLElement>('.print-page') || [],
    ) as HTMLElement[];
    if (!pages.length) return;
    setIsDownloading(true);
    let restoreImages = () => {};
    try {
      await waitForDeclaracaoPrintAssets(printContentRef.current);
      restoreImages = await inlineDeclaracaoPrintImages(printContentRef.current);
      const pdfBlob = await buildSelectablePdfBlobFromElements(pages, {
        orientation: 'portrait',
        artworkFormat: 'PNG',
        artworkScale: 2,
        title: documentTitle,
        subject: 'Declaração institucional emitida pela Secretaria',
      });
      downloadPdfBlob(pdfBlob, `${fileSlug}-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Erro ao baixar declaração:', error);
      alert('Não foi possível gerar o PDF da declaração.');
    } finally {
      restoreImages();
      setIsDownloading(false);
    }
  };

  const triggerBrowserPrint = async () => {
    try {
      await waitForDeclaracaoPrintAssets(printContentRef.current);
      window.print();
    } catch (error) {
      console.error('Erro ao preparar declaração para impressão:', error);
      window.alert(error instanceof Error ? error.message : 'Não foi possível preparar o QR Code para impressão.');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
        <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Carregando dados acadêmicos...</p>
      </div>
    );
  }

  if (isPrinting && typeof document !== 'undefined') {
    return (
      <SecretariaDeclaracaoPrintViewer
        alunos={rawAlunosParaImprimir}
        documentTitle={documentTitle}
        frequenciesByStudent={frequenciesByStudent}
        isDownloading={isDownloading}
        onClose={() => setIsPrinting(false)}
        onDownload={() => void handleDownload()}
        onPrint={() => void triggerBrowserPrint()}
        poloInfo={poloInfo}
        printContentRef={printContentRef}
        templateConfig={templateConfig}
        validationCodes={validationCodes}
        validationExpirations={validationExpirations}
        validationPublicByStudent={validationPublicByStudent}
        watermark={watermark}
      />
    );
  }

  return (
    <SecretariaDeclaracaoSelection
      alunos={alunos}
      customSelectedAlunos={customSelectedAlunos}
      documentTitle={documentTitle}
      isPreparingValidation={isPreparingValidation}
      mode={mode}
      onPrepare={() => void handlePrintAction()}
      rawAlunosParaImprimir={rawAlunosParaImprimir}
      searchQuery={searchQuery}
      searchQueryCustom={searchQueryCustom}
      selectedAluno={selectedAluno}
      selectedTurmaId={selectedTurmaId}
      setCustomSelectedAlunos={setCustomSelectedAlunos}
      setMode={setMode}
      setSearchQuery={setSearchQuery}
      setSearchQueryCustom={setSearchQueryCustom}
      setSelectedAluno={setSelectedAluno}
      setSelectedTurmaId={setSelectedTurmaId}
      turmas={turmas}
      validationPublic={validationPublic}
      validationValidityDays={validationValidityDays}
    />
  );
};

export default SecretariaDeclaracaoMatriculaPage;
