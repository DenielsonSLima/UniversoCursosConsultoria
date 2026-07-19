import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { formatMatricula } from '../../../../lib/academicUtils';
import { documentValidationService } from '../../../shared/document-validation/document-validation.service';
import { TEMPLATE_DEFAULT } from './secretaria-carteirinhas.helpers';
import { downloadCarteirinhasPdf, printCarteirinhas } from './secretaria-carteirinhas.pdf';
import {
  secretariaCarteirinhasWorkspaceQueryOptions,
  type CarteirinhaTechnicalClass,
} from './secretaria-carteirinhas.service';
import type { Aluno } from './secretaria-carteirinhas.types';
import SecretariaCarteirinhasControls, {
  type CarteirinhaMode,
} from './SecretariaCarteirinhasControls';
import SecretariaCarteirinhasPrintLayout, {
  type CarteirinhaLayoutType,
} from './SecretariaCarteirinhasPrintLayout';

interface SecretariaCarteirinhasPageProps {
  poloId?: string | null;
}

const SecretariaCarteirinhasPage: React.FC<SecretariaCarteirinhasPageProps> = ({ poloId }) => {
  const activePoloId = (poloId && poloId !== 'todos' ? poloId : null)
    || window.sessionStorage.getItem('current_polo_id')
    || window.sessionStorage.getItem('active_polo_id')
    || '44444444-4444-4444-4444-444444444444';
  const [mode, setMode] = useState<CarteirinhaMode>('individual');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchQueryCustom, setSearchQueryCustom] = useState('');
  const [customSelectedAlunos, setCustomSelectedAlunos] = useState<Aluno[]>([]);
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [turmas, setTurmas] = useState<CarteirinhaTechnicalClass[]>([]);
  const [selectedAluno, setSelectedAluno] = useState<Aluno | null>(null);
  const [templateConfig, setTemplateConfig] = useState<any>(TEMPLATE_DEFAULT);
  const [selectedTurmaId, setSelectedTurmaId] = useState('todos');
  const [validadeGeral, setValidadeGeral] = useState(() => {
    const defaultValidity = new Date();
    defaultValidity.setMonth(defaultValidity.getMonth() + 12);
    return defaultValidity.toISOString().split('T')[0];
  });
  const [layoutType, setLayoutType] = useState<CarteirinhaLayoutType>('dobra');
  const [isPrinting, setIsPrinting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPreparingValidation, setIsPreparingValidation] = useState(false);
  const [validationCodes, setValidationCodes] = useState<Record<string, string>>({});
  const printContentRef = useRef<HTMLDivElement>(null);
  const workspaceQuery = useQuery(secretariaCarteirinhasWorkspaceQueryOptions(activePoloId));

  useEffect(() => {
    const workspace = workspaceQuery.data;
    if (!workspace) return;

    const eligibleEnrollments = workspace.enrollments;
    const institutionalData = workspace.institutionalData;
    const academicConfigs = workspace.academicConfig || {};
    const savedTemplate = workspace.template || {};

    const enrollmentIdsByStudent = new Map<string, string[]>();
    eligibleEnrollments.forEach((enrollment) => {
      const current = enrollmentIdsByStudent.get(enrollment.alunoId) || [];
      if (!current.includes(enrollment.turmaId)) current.push(enrollment.turmaId);
      enrollmentIdsByStudent.set(enrollment.alunoId, current);
    });

    const primaryEnrollmentByStudent = new Map<string, typeof eligibleEnrollments[number]>();
    eligibleEnrollments.forEach((enrollment) => {
      if (!primaryEnrollmentByStudent.has(enrollment.alunoId)) {
        primaryEnrollmentByStudent.set(enrollment.alunoId, enrollment);
      }
    });

    const validityMonths = Number(academicConfigs.validityMonths ?? 12);
    const mapped = Array.from(primaryEnrollmentByStudent.values()).map((enrollment) => {
      const validityBase = enrollment.dataMatricula ? new Date(enrollment.dataMatricula) : new Date();
      validityBase.setMonth(validityBase.getMonth() + validityMonths);
      return {
        id: enrollment.alunoId,
        enrollmentId: enrollment.enrollmentId,
        nome: enrollment.alunoNome.toUpperCase(),
        cpf: enrollment.cpf,
        rg: enrollment.rg,
        nascimento: enrollment.nascimento,
        matricula: formatMatricula(enrollment.enrollmentId, enrollment.dataMatricula, enrollment.poloId),
        curso: enrollment.cursoNome,
        turmaNome: enrollment.turmaNome,
        turmaCodigo: enrollment.turmaCodigo,
        instituicao: 'Universo Cursos e Consultoria',
        validade: validityBase.toLocaleDateString('pt-BR'),
        fotoUrl: enrollment.fotoUrl,
        tipoDocumento: enrollment.tipoDocumento || 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO',
        turmaIds: enrollmentIdsByStudent.get(enrollment.alunoId) || [enrollment.turmaId],
        poloRazaoSocial: institutionalData?.razaoSocial,
        poloCnpj: institutionalData?.cnpj,
        poloTelefone: institutionalData?.telefone,
      } satisfies Aluno;
    });

    const validityDate = new Date();
    validityDate.setMonth(validityDate.getMonth() + validityMonths);
    setValidadeGeral(validityDate.toISOString().split('T')[0]);

    const mergedTemplate = {
      ...TEMPLATE_DEFAULT,
      ...savedTemplate,
      startNumber: savedTemplate.startNumber || TEMPLATE_DEFAULT.startNumber,
      bgFrenteUrl: savedTemplate.bgFrenteUrl || savedTemplate.bgFrente || savedTemplate.bg_frente_url || '',
      bgVersoUrl: savedTemplate.bgVersoUrl || savedTemplate.bgVerso || savedTemplate.bg_verso_url || '',
      ocultarDesignPadrao: Boolean(savedTemplate.ocultarDesignPadrao),
    };
    if (academicConfigs.carteirinhaPrimaryColor) mergedTemplate.corPrimaria = academicConfigs.carteirinhaPrimaryColor;
    if (academicConfigs.carteirinhaSecondaryColor) mergedTemplate.corSecundaria = academicConfigs.carteirinhaSecondaryColor;

    setTurmas(workspace.classes);
    setAlunos(mapped);
    setTemplateConfig(mergedTemplate);
    setSelectedAluno(null);
    setCustomSelectedAlunos([]);
    setSelectedTurmaId('todos');
  }, [workspaceQuery.data]);

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    const query = searchQuery.toUpperCase();
    const result = alunos.find((aluno) => (
      aluno.nome.includes(query) || aluno.cpf.includes(query) || aluno.rg.includes(query)
    ));
    if (result) {
      setSelectedAluno(result);
    } else {
      alert('Nenhum aluno encontrado com essa busca.');
    }
  };

  const handlePrintAction = async () => {
    const targets = mode === 'individual'
      ? (selectedAluno ? [selectedAluno] : [])
      : mode === 'lote'
        ? (selectedTurmaId === 'todos'
            ? alunos
            : alunos.filter((aluno) => aluno.turmaIds?.includes(selectedTurmaId)))
        : customSelectedAlunos;

    const eligibleTargets = targets.filter((aluno) => aluno.enrollmentId);
    if (!eligibleTargets.length) {
      alert('Nenhuma matrícula válida foi encontrada para gerar os códigos de consulta.');
      return;
    }

    setIsPreparingValidation(true);
    try {
      const expiresAt = new Date(`${validadeGeral}T23:59:59`).toISOString();
      const issues = await Promise.all(
        eligibleTargets.map(async (aluno) => ({
          alunoId: aluno.id,
          issue: await documentValidationService.issue({
            type: 'carteirinha',
            enrollmentId: aluno.enrollmentId!,
            expiresAt,
            registerReissue: true,
          }),
        })),
      );

      setValidationCodes((current) => ({
        ...current,
        ...Object.fromEntries(issues.map(({ alunoId, issue }) => [alunoId, issue.code])),
      }));
      setIsPrinting(true);
    } catch (error) {
      console.error('[SecretariaCarteirinhas] Falha ao registrar emissão:', error);
      alert('Não foi possível registrar os códigos de validação das carteirinhas.');
    } finally {
      setIsPreparingValidation(false);
    }
  };

  const handleDownload = async () => {
    if (!printContentRef.current?.querySelector('.print-page')) return;
    setIsDownloading(true);
    try {
      await downloadCarteirinhasPdf(printContentRef.current, layoutType);
    } finally {
      setIsDownloading(false);
    }
  };

  const rawAlunosParaImprimir = mode === 'individual'
    ? (selectedAluno ? [selectedAluno] : [])
    : mode === 'lote'
      ? (selectedTurmaId === 'todos'
          ? alunos
          : alunos.filter((aluno) => aluno.turmaIds?.includes(selectedTurmaId)))
      : customSelectedAlunos;

  const startNumber = templateConfig.startNumber || 1000;
  const alunosParaImprimir = rawAlunosParaImprimir.map((aluno, index) => {
    const parts = validadeGeral.split('-');
    const validadeFormatada = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : aluno.validade;
    return {
      ...aluno,
      matricula: aluno.matricula && aluno.matricula !== 'PENDENTE' && aluno.matricula !== 'CIE-PENDENTE'
        ? aluno.matricula
        : `CIE-${startNumber + index}`,
      validade: validadeFormatada,
      validationCode: validationCodes[aluno.id],
    };
  });

  if (workspaceQuery.isLoading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center">
        <Loader2 className="mb-4 animate-spin text-purple-600" size={48} />
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Carregando alunos e turmas...</p>
      </div>
    );
  }

  if (workspaceQuery.isError) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 rounded-[2rem] border border-rose-100 bg-white p-8 text-center">
        <AlertTriangle className="text-rose-500" size={40} />
        <div>
          <h3 className="font-black uppercase text-[#001a33]">Dados das carteirinhas indisponíveis</h3>
          <p className="mt-1 text-xs font-medium text-slate-500">Não foi possível carregar os alunos técnicos deste polo.</p>
        </div>
        <button type="button" onClick={() => { void workspaceQuery.refetch(); }} disabled={workspaceQuery.isFetching} className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-60">
          {workspaceQuery.isFetching ? 'Tentando novamente...' : 'Tentar novamente'}
        </button>
      </div>
    );
  }

  if (isPrinting) {
    return (
      <SecretariaCarteirinhasPrintLayout
        alunos={alunosParaImprimir}
        isDownloading={isDownloading}
        layoutType={layoutType}
        onBack={() => setIsPrinting(false)}
        onDownload={handleDownload}
        onPrint={() => { void printCarteirinhas(printContentRef.current); }}
        printContentRef={printContentRef}
        startNumber={startNumber}
        templateConfig={templateConfig}
      />
    );
  }

  return (
    <SecretariaCarteirinhasControls
      alunos={alunos}
      alunosParaImprimir={alunosParaImprimir}
      customSelectedAlunos={customSelectedAlunos}
      isPreparingValidation={isPreparingValidation}
      layoutType={layoutType}
      mode={mode}
      onPrintAction={() => { void handlePrintAction(); }}
      onSearch={handleSearch}
      searchQuery={searchQuery}
      searchQueryCustom={searchQueryCustom}
      selectedAluno={selectedAluno}
      selectedTurmaId={selectedTurmaId}
      setCustomSelectedAlunos={setCustomSelectedAlunos}
      setLayoutType={setLayoutType}
      setMode={setMode}
      setSearchQuery={setSearchQuery}
      setSearchQueryCustom={setSearchQueryCustom}
      setSelectedAluno={setSelectedAluno}
      setSelectedTurmaId={setSelectedTurmaId}
      setValidadeGeral={setValidadeGeral}
      startNumber={startNumber}
      turmas={turmas}
      validadeGeral={validadeGeral}
    />
  );
};

export default SecretariaCarteirinhasPage;
