import React, { useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  BookOpen,
  Calendar,
  CheckCircle,
  ChevronRight,
  Clock,
  FileCheck2,
  GraduationCap,
  Image as ImageIcon,
  LockKeyhole,
  MonitorPlay,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { getDocumentValidationUrl } from '../../shared/document-validation/document-validation.url';
import CursosPage from '../cursos/CursosPage';

interface TurmasPageProps {
  alunoId: string;
}

const ACCESS_STATUS = new Set(['ATIVO', 'CONCLUIDO']);
const MODALITY_FILTERS = [
  { id: 'todos', label: 'Todos' },
  { id: 'EAD', label: 'EAD' },
  { id: 'TECNICO', label: 'Técnicos' },
  { id: 'LIVRE', label: 'Livres' },
  { id: 'ESPECIALIZACAO', label: 'Especializações' },
];
const MODALITY_ORDER = ['EAD', 'TECNICO', 'LIVRE', 'ESPECIALIZACAO', 'OUTROS'];
const MODALITY_LABELS: Record<string, string> = {
  EAD: 'Cursos EAD',
  TECNICO: 'Cursos Técnicos',
  LIVRE: 'Cursos Livres',
  ESPECIALIZACAO: 'Especializações',
  OUTROS: 'Outros cursos',
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Data não informada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data não informada';
  return date.toLocaleDateString('pt-BR');
};

const getFormattedDuration = (min?: number) => {
  if (!min) return '';
  if (min % 60 === 0) return `${min / 60}h`;
  const hrs = Math.floor(min / 60);
  const rem = min % 60;
  return hrs > 0 ? `${hrs}h ${rem}min` : `${rem}min`;
};

const normalizePercent = (value: unknown) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
};

const getProgressPercent = (progress?: any) =>
  normalizePercent(progress?.summary?.progressPercent ?? progress?.progressPercent ?? 0);

const getQuizScore = (progress?: any) => {
  const score = progress?.summary?.quizScore ?? progress?.quizScore;
  return score === null || score === undefined ? null : Number(score);
};

const getEadConteudos = (curso?: any) => {
  const conteudos = curso?.ead_config?.conteudos;
  return Array.isArray(conteudos) ? conteudos : [];
};

const isEadMatricula = (matricula?: any) =>
  String(matricula?.turmas?.cursos?.modalidade || '').toUpperCase() === 'EAD';

const hasEadAccess = (matricula?: any) =>
  ACCESS_STATUS.has(String(matricula?.status || '').toUpperCase());

const normalizeText = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const getMatriculaModalidade = (matricula?: any) => {
  const modalidade = String(matricula?.turmas?.cursos?.modalidade || '').toUpperCase();
  if (modalidade === 'EAD') return 'EAD';
  if (modalidade === 'TECNICO' || modalidade === 'TÉCNICO') return 'TECNICO';
  if (modalidade === 'LIVRE') return 'LIVRE';
  if (modalidade === 'ESPECIALIZACAO' || modalidade === 'ESPECIALIZAÇÃO') return 'ESPECIALIZACAO';
  return 'OUTROS';
};

const TurmasPage: React.FC<TurmasPageProps> = ({ alunoId }) => {
  const queryClient = useQueryClient();
  const [selectedTurma, setSelectedTurma] = useState<any | null>(null);
  const [detailTab, setDetailTab] = useState<'resumo' | 'certificado'>('resumo');
  const [studyCourseId, setStudyCourseId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalityFilter, setModalityFilter] = useState('todos');

  const { data: matriculas = [], isLoading, isError, error } = useQuery<any[]>({
    queryKey: ['aluno-matriculas', alunoId],
    queryFn: async () => {
      const { data, error: fetchErr } = await supabase
        .from('matriculas')
        .select('*, turmas(*, cursos(*))')
        .eq('aluno_id', alunoId)
        .order('data_matricula', { ascending: false });

      if (fetchErr) throw fetchErr;
      return data || [];
    }
  });

  const matriculasLiberadas = useMemo(
    () => matriculas.filter(mat => ACCESS_STATUS.has(String(mat?.status || '').toUpperCase())),
    [matriculas]
  );

  const filteredMatriculas = useMemo(() => {
    const normalizedSearch = normalizeText(searchTerm);

    return matriculasLiberadas.filter(mat => {
      const turma = mat.turmas;
      const curso = turma?.cursos;
      const modality = getMatriculaModalidade(mat);
      const matchesModality = modalityFilter === 'todos' || modality === modalityFilter;
      const searchable = normalizeText([
        curso?.nome,
        turma?.nome,
        turma?.codigo,
        curso?.area,
        curso?.modalidade,
      ].filter(Boolean).join(' '));

      return matchesModality && (!normalizedSearch || searchable.includes(normalizedSearch));
    });
  }, [matriculasLiberadas, modalityFilter, searchTerm]);

  const groupedMatriculas = useMemo(() => {
    const groups = new Map<string, any[]>();
    filteredMatriculas.forEach(mat => {
      const modality = getMatriculaModalidade(mat);
      groups.set(modality, [...(groups.get(modality) || []), mat]);
    });

    return Array.from(groups.entries()).sort(
      ([a], [b]) => MODALITY_ORDER.indexOf(a) - MODALITY_ORDER.indexOf(b)
    );
  }, [filteredMatriculas]);

  const eadMatriculasComAcesso = useMemo(
    () => matriculasLiberadas.filter(mat => isEadMatricula(mat) && mat.turmas?.cursos?.id),
    [matriculasLiberadas]
  );

  const progressQueries = useQueries({
    queries: eadMatriculasComAcesso.map(mat => ({
      queryKey: ['aluno-turma-ead-progress', alunoId, mat.turmas.cursos.id],
      enabled: !!alunoId && !!mat.turmas?.cursos?.id,
      staleTime: 30_000,
      queryFn: async () => {
        const { data, error: progressErr } = await supabase.rpc('ead_get_aluno_progress', {
          p_aluno_id: alunoId,
          p_curso_id: mat.turmas.cursos.id,
        });
        if (progressErr) throw progressErr;
        return data;
      }
    }))
  });

  const progressByMatricula = useMemo(() => {
    const map = new Map<string, any>();
    eadMatriculasComAcesso.forEach((mat, index) => {
      map.set(mat.id, progressQueries[index]?.data || null);
    });
    return map;
  }, [eadMatriculasComAcesso, progressQueries]);

  const selectedCurso = selectedTurma?.turmas?.cursos;
  const selectedIsEad = isEadMatricula(selectedTurma);
  const selectedProgress = selectedTurma ? progressByMatricula.get(selectedTurma.id) : null;
  const selectedProgressPercent = getProgressPercent(selectedProgress);
  const selectedConteudos = getEadConteudos(selectedCurso);
  const selectedCompletedIds = Array.isArray(selectedProgress?.progress?.completedContentIds)
    ? selectedProgress.progress.completedContentIds
    : Array.isArray(selectedProgress?.completedContentIds)
      ? selectedProgress.completedContentIds
    : [];

  const { data: certificados = [], isLoading: loadingCertificados } = useQuery<any[]>({
    queryKey: ['aluno-certificados-curso', alunoId, selectedCurso?.id],
    enabled: !!alunoId && selectedIsEad && !!selectedCurso?.id,
    queryFn: async () => {
      const { data, error: certErr } = await supabase
        .from('certificados_academicos')
        .select('id, status, modalidade, data_inscricao, data_conclusao, nota_final, codigo_validacao, certificado_numero, emitido_em, created_at')
        .eq('aluno_id', alunoId)
        .eq('curso_id', selectedCurso.id)
        .eq('modalidade', 'EAD')
        .eq('status', 'FINALIZADO')
        .not('codigo_validacao', 'is', null)
        .order('data_conclusao', { ascending: false });

      if (certErr) throw certErr;
      return data || [];
    }
  });

  const certificadoAtual = certificados[0] || null;

  const { data: disciplines = [], isLoading: loadingDisciplines } = useQuery<any[]>({
    queryKey: ['turma-disciplinas', selectedTurma?.turmas?.id],
    enabled: !!selectedTurma?.turmas?.id && !selectedIsEad,
    queryFn: async () => {
      const { data, error: descErr } = await supabase
        .from('turmas_disciplinas')
        .select('*, disciplinas(*)')
        .eq('turma_id', selectedTurma?.turmas?.id);
      
      if (descErr) throw descErr;
      return data || [];
    }
  });

  useEffect(() => {
    const channel = supabase
      .channel(`aluno_matriculas_realtime_${alunoId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matriculas', filter: `aluno_id=eq.${alunoId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['aluno-matriculas', alunoId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [alunoId, queryClient]);

  const getStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'ATIVO':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-emerald-100">
            <CheckCircle size={10} /> Ativa
          </span>
        );
      case 'CONCLUIDO':
        return (
          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-blue-100">
            <Award size={10} /> Concluida
          </span>
        );
      case 'PENDENTE':
      case 'AGUARDANDO_PAGAMENTO':
      case 'AGUARDANDO_CONFIRMACAO':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-amber-100">
            <Clock size={10} /> Pagamento pendente
          </span>
        );
      case 'TRANCADO':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-amber-100">
            <AlertCircle size={10} /> Trancada
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-slate-100">
            Inativa
          </span>
        );
    }
  };

  const openTurma = (matricula: any) => {
    setSelectedTurma(matricula);
    setDetailTab('resumo');
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 bg-red-50 text-red-700 rounded-3xl border border-red-150 flex items-center gap-3">
        <ShieldAlert size={24} />
        <div>
          <p className="font-bold">Erro ao carregar cursos</p>
          <p className="text-xs">{error instanceof Error ? error.message : 'Falha na conexão com o banco.'}</p>
        </div>
      </div>
    );
  }

  if (studyCourseId) {
    return (
      <CursosPage
        alunoId={alunoId}
        initialCourseId={studyCourseId}
        onExitCourse={() => setStudyCourseId(null)}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col justify-between gap-4 mb-6 lg:flex-row lg:items-end">
        <div>
          <h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
            <GraduationCap className="text-blue-600" />
            Meus Cursos
          </h2>
          <p className="text-xs text-slate-400 font-medium">Acesse seus cursos matriculados, progresso e certificados</p>
        </div>

        {!selectedTurma && (
          <div className="relative w-full lg:w-80">
            <input
              type="text"
              placeholder="Buscar em meus cursos..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-9 pr-3 text-xs font-bold text-slate-700 shadow-sm outline-none transition-all focus:border-blue-500"
            />
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
        )}
      </div>

      {!selectedTurma ? (
        matriculasLiberadas.length === 0 ? (
          <div className="bg-white p-12 rounded-[2rem] border border-slate-100 shadow-sm text-center">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <GraduationCap size={28} />
            </div>
            <h3 className="text-base font-bold text-[#001a33]">Nenhum curso liberado</h3>
            <p className="text-slate-550 text-xs mt-1 max-w-sm mx-auto">
              Quando a compra for confirmada, o curso aparecerá aqui com acesso direto à sala de aprendizagem.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-100 bg-white p-2 shadow-sm">
              {MODALITY_FILTERS.map(filter => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setModalityFilter(filter.id)}
                  className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${
                    modalityFilter === filter.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-50 text-slate-500 hover:bg-blue-50 hover:text-blue-600'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {filteredMatriculas.length === 0 ? (
              <div className="rounded-[2rem] border border-slate-100 bg-white p-10 text-center shadow-sm">
                <p className="text-sm font-black text-[#001a33]">Nenhum curso encontrado</p>
                <p className="mt-1 text-xs font-bold text-slate-400">Ajuste a busca ou selecione outro tipo de curso.</p>
              </div>
            ) : groupedMatriculas.map(([modality, items]) => (
              <section key={modality} className="space-y-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-xs font-black uppercase tracking-widest text-[#001a33]">
                    {MODALITY_LABELS[modality] || MODALITY_LABELS.OUTROS}
                  </h3>
                  <span className="h-px flex-1 bg-slate-100" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{items.length}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {items.map((mat) => {
              const turma = mat.turmas;
              const curso = turma?.cursos;
              const isEad = isEadMatricula(mat);
              const progress = isEad ? progressByMatricula.get(mat.id) : null;
              const percent = isEad
                ? getProgressPercent(progress)
                : normalizePercent(mat.progresso || (String(mat.status || '').toUpperCase() === 'CONCLUIDO' ? 100 : 0));
              const image = curso?.imagem_url;
              const locked = isEad && !hasEadAccess(mat);

              return (
                <article
                  key={mat.id}
                  className="overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white shadow-sm transition-all duration-300 hover:border-blue-400 hover:shadow-md"
                >
                  <div className="aspect-[16/9] bg-slate-100">
                    {image ? (
                      <img
                        src={image}
                        alt={curso?.nome || turma?.nome || 'Curso'}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-300">
                        <ImageIcon size={34} />
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 p-5">
                    <div className="flex justify-between items-start gap-2">
                      {getStatusBadge(mat.status)}
                      <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider bg-slate-50 px-2 py-0.5 rounded">
                        {curso?.modalidade || 'Turma'}
                      </span>
                    </div>

                    <div className="min-h-[76px]">
                      <h3 className="line-clamp-2 text-base font-black leading-tight text-[#001a33]">
                        {curso?.nome || turma?.nome || 'Curso'}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-[11px] font-bold uppercase tracking-wider text-slate-450">
                        {turma?.nome || 'Matricula vinculada'}
                      </p>
                    </div>

                    <div className="space-y-2 text-[11px] font-bold text-slate-500">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-blue-500" />
                        <span>Inscricao: {formatDate(mat.data_matricula || mat.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock size={14} className="text-slate-400" />
                        <span>{isEad ? `${curso?.carga_horaria || 0}h` : `Turno: ${turma?.turno || 'Geral'}`}</span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <span>Conclusao</span>
                        <span className="text-blue-600">{locked ? 'bloqueado' : `${percent}%`}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${locked ? 'bg-slate-300' : 'bg-blue-600'}`}
                          style={{ width: locked ? '0%' : `${percent}%` }}
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => isEad && !locked && curso?.id ? setStudyCourseId(curso.id) : openTurma(mat)}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-50 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:bg-blue-600 hover:text-white"
                    >
                      <span>{locked ? 'Ver status' : isEad ? 'Acessar curso' : 'Abrir curso'}</span>
                      {isEad && !locked ? <MonitorPlay size={14} /> : <ChevronRight size={14} />}
                    </button>
                  </div>
                </article>
              );
            })}
                </div>
              </section>
            ))}
          </div>
        )
      ) : (
        <div className="bg-white rounded-[2rem] border border-slate-100 p-6 md:p-8 shadow-sm space-y-6">
          <button 
            onClick={() => setSelectedTurma(null)}
            className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-blue-600 uppercase tracking-widest group"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
            <span>Voltar para meus cursos</span>
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6 border-b border-slate-100 pb-6">
            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 aspect-[16/10] lg:aspect-auto lg:min-h-[150px]">
              {selectedCurso?.imagem_url ? (
                <img
                  src={selectedCurso.imagem_url}
                  alt={selectedCurso.nome}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-300">
                  <ImageIcon size={34} />
                </div>
              )}
            </div>

            <div className="flex flex-col justify-between gap-4 min-w-0">
              <div>
                <div className="mb-3 flex flex-wrap gap-2">
                  {getStatusBadge(selectedTurma.status)}
                  <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                    Carga: {selectedCurso?.carga_horaria || 0}h
                  </span>
                  <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                    Inscricao: {formatDate(selectedTurma.data_matricula || selectedTurma.created_at)}
                  </span>
                </div>
                <h3 className="text-xl font-black text-[#001a33] leading-tight">{selectedCurso?.nome || selectedTurma.turmas?.nome}</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                  Turma: {selectedTurma.turmas?.nome || 'Matrícula vinculada'}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <span>Progresso do curso</span>
                  <span className="text-blue-600">{selectedIsEad ? `${selectedProgressPercent}%` : 'Acompanhe pela grade'}</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: selectedIsEad ? `${selectedProgressPercent}%` : '0%' }} />
                </div>
              </div>

              {selectedIsEad && selectedCurso?.id && hasEadAccess(selectedTurma) && (
                <button
                  onClick={() => setStudyCourseId(selectedCurso.id)}
                  className="inline-flex w-full sm:w-max items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-blue-700"
                >
                  <MonitorPlay size={14} />
                  Entrar na sala do curso
                </button>
              )}
            </div>
          </div>

          {selectedIsEad && (
            <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-4">
              <button
                onClick={() => setDetailTab('resumo')}
                className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${detailTab === 'resumo' ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
              >
                Aulas
              </button>
              <button
                onClick={() => setDetailTab('certificado')}
                className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${detailTab === 'certificado' ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
              >
                Certificado
              </button>
            </div>
          )}

          {selectedIsEad && detailTab === 'certificado' ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-6">
              {loadingCertificados ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : certificadoAtual?.status === 'FINALIZADO' && certificadoAtual.codigo_validacao ? (
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                  <div>
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white">
                      <Award size={24} />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Certificado liberado</p>
                    <h4 className="mt-1 text-lg font-black uppercase tracking-tight text-[#001a33]">Curso concluido e certificado emitido</h4>
                    <p className="mt-2 text-xs font-bold leading-relaxed text-slate-500">
                      Codigo de validacao: <span className="font-mono text-blue-700">{certificadoAtual.codigo_validacao}</span>
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      Conclusao: {formatDate(certificadoAtual.data_conclusao)} | Nota final: {certificadoAtual.nota_final ?? getQuizScore(selectedProgress) ?? '--'}
                    </p>
                  </div>

                  <button
                    onClick={() => window.open(getDocumentValidationUrl(certificadoAtual.codigo_validacao), '_blank', 'noopener,noreferrer')}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-800"
                  >
                    <FileCheck2 size={14} />
                    Validar QR/Codigo
                  </button>
                </div>
              ) : (
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                    <LockKeyhole size={22} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Certificado indisponivel</p>
                    <h4 className="mt-1 text-base font-black text-[#001a33]">Conclua o curso e seja aprovado na avaliacao final.</h4>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      O certificado aparecerá aqui automaticamente após a conclusão e aprovação.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : selectedIsEad ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 bg-blue-50/40 border border-blue-50 rounded-2xl space-y-1">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Conclusao</p>
                  <p className="text-2xl font-black text-blue-700">{selectedProgressPercent}%</p>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mt-2">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${selectedProgressPercent}%` }} />
                  </div>
                </div>
                <div className="p-5 bg-emerald-50/40 border border-emerald-50 rounded-2xl space-y-1">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Nota EAD</p>
                  <p className="text-2xl font-black text-emerald-700">
                    {getQuizScore(selectedProgress) ?? '--'} <span className="text-xs font-normal text-slate-400">/ 100</span>
                  </p>
                  <p className="text-[9px] text-slate-500 font-medium mt-2">A prova final libera o certificado.</p>
                </div>
                <div className="p-5 bg-slate-50 border border-slate-100 rounded-2xl space-y-1">
                  <p className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">Aulas concluidas</p>
                  <p className="text-2xl font-black text-slate-700">{selectedCompletedIds.length} / {selectedConteudos.length}</p>
                  <p className="text-[9px] text-slate-500 font-medium mt-2">Conteudos marcados como lidos.</p>
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-2">
                  <BookOpen size={16} className="text-blue-500" />
                  <h4 className="font-bold text-xs uppercase tracking-wider text-[#001a33]">Aulas do curso</h4>
                </div>

                <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-100">
                  {selectedConteudos.length === 0 ? (
                    <div className="p-5 bg-slate-50/50 text-xs font-bold text-slate-500">
                      Nenhuma aula cadastrada neste curso.
                    </div>
                  ) : selectedConteudos.map((conteudo: any, index: number) => {
                    const done = selectedCompletedIds.includes(conteudo.id);
                    return (
                      <button
                        key={conteudo.id || index}
                        onClick={() => selectedCurso?.id && setStudyCourseId(selectedCurso.id)}
                        className="w-full p-4 bg-slate-50/50 hover:bg-blue-50/60 flex flex-col sm:flex-row justify-between sm:items-center gap-3 text-left text-xs font-medium transition-colors"
                      >
                        <div className="space-y-0.5">
                          <p className="font-bold text-[#001a33]">{index + 1}. {conteudo.titulo || `Aula ${index + 1}`}</p>
                          <p className="text-[10px] text-slate-400">
                            {conteudo.etapa || 'Modulo'} | {conteudo.duracaoMinutos ? getFormattedDuration(conteudo.duracaoMinutos) : conteudo.duracao || 'Carga não informada'}
                          </p>
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${done ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {done ? 'Concluida' : 'Pendente'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-4">
              <div className="flex items-center gap-2">
                <BookOpen size={16} className="text-blue-500" />
                <h4 className="font-bold text-xs uppercase tracking-wider text-[#001a33]">Grades e disciplinas do periodo</h4>
              </div>

              {loadingDisciplines ? (
                <div className="flex justify-center items-center py-6">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : disciplines.length === 0 ? (
                <div className="border border-slate-100 rounded-2xl bg-slate-50/50 p-5 text-xs font-bold text-slate-500">
                  Nenhuma disciplina vinculada a esta turma.
                </div>
              ) : (
                <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-100">
                  {disciplines.map((d: any) => (
                    <div key={d.id} className="p-4 bg-slate-50/50 flex flex-col sm:flex-row justify-between sm:items-center gap-3 text-xs font-medium">
                      <div className="space-y-0.5">
                        <p className="font-bold text-[#001a33]">{d.disciplinas?.nome || 'Disciplina'}</p>
                        <p className="text-[10px] text-slate-400">
                          Carga: {d.disciplinas?.carga_horaria || 60}h | Docente: {d.professor_nome || 'A definir'}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider">Status</p>
                          <p className={`font-bold ${d.concluida ? 'text-emerald-600' : 'text-blue-600'}`}>
                            {d.concluida ? 'Concluida' : 'Em andamento'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TurmasPage;
