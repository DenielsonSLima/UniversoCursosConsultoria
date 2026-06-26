import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  FileCheck2,
  Loader2,
  Search,
  Users,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { secretariaDocumentosKeys } from './secretaria-documentos.keys';
import {
  getSecretariaContext,
  secretariaDocumentosService,
} from './secretaria-documentos.service';
import {
  SecretariaAlunoResumo,
  SecretariaDocumentoDefinition,
} from './secretaria-documentos.types';
import SecretariaAcademicDocumentPreview from './SecretariaAcademicDocumentPreview';

interface SecretariaDocumentoEmissionPageProps {
  definition: SecretariaDocumentoDefinition;
}

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
  const [mode, setMode] = useState<'individual' | 'lote'>('individual');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAluno, setSelectedAluno] = useState<SecretariaAlunoResumo | null>(null);
  const [selectedMatriculaId, setSelectedMatriculaId] = useState('');
  const [selectedTurmaId, setSelectedTurmaId] = useState('');

  const normalizedTerm = searchTerm.trim();
  const { data: alunos = [], isFetching: isSearching } = useQuery({
    queryKey: secretariaDocumentosKeys.search(context, definition.id, normalizedTerm),
    queryFn: () => secretariaDocumentosService.searchAlunos(context.poloId, normalizedTerm),
    enabled: mode === 'individual' && normalizedTerm.length >= 2,
    staleTime: 30_000,
  });

  const { data: matriculas = [], isLoading: isLoadingMatriculas } = useQuery({
    queryKey: secretariaDocumentosKeys.matriculas(
      context,
      definition.id,
      selectedAluno?.id || 'nenhum',
      !!definition.activeOnly
    ),
    queryFn: () =>
      secretariaDocumentosService.getMatriculas(
        selectedAluno!.id,
        context.poloId,
        !!definition.technicalOnly,
        !!definition.completedOnly,
        !!definition.activeOnly
      ),
    enabled: !!selectedAluno,
    staleTime: 60_000,
  });

  const { data: turmas = [], isLoading: isLoadingTurmas } = useQuery({
    queryKey: secretariaDocumentosKeys.turmas(
      context,
      definition.id,
      !!definition.technicalOnly,
      !!definition.activeOnly
    ),
    queryFn: () =>
      secretariaDocumentosService.getTurmas(
        context.poloId,
        !!definition.technicalOnly,
        !!definition.activeOnly
      ),
    enabled: mode === 'lote',
    staleTime: 60_000,
  });

  useEffect(() => {
    if (matriculas.length && !selectedMatriculaId) setSelectedMatriculaId(matriculas[0].id);
  }, [matriculas, selectedMatriculaId]);

  useEffect(() => {
    if (turmas.length && !selectedTurmaId) setSelectedTurmaId(turmas[0].id);
  }, [turmas, selectedTurmaId]);

  useEffect(() => {
    const channel = supabase
      .channel(`secretaria_emissoes_${context.userId}_${context.poloId}_${definition.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'secretaria_emissoes',
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
    mutationFn: () =>
      secretariaDocumentosService.registrarEmissao({
        context,
        documento: definition.id,
        modo: mode,
        alunoId: mode === 'individual' ? selectedAluno?.id : undefined,
        matriculaId: mode === 'individual' ? selectedMatriculaId : undefined,
        turmaId: mode === 'lote' ? selectedTurmaId : undefined,
        technicalOnly: !!definition.technicalOnly,
        activeOnly: !!definition.activeOnly,
        completedOnly: !!definition.completedOnly,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: secretariaDocumentosKeys.emissions(context, definition.id),
      });
      setStep(3);
    },
  });

  const selectedMatricula = matriculas.find((item) => item.id === selectedMatriculaId);
  const selectedTurma = turmas.find((item) => item.id === selectedTurmaId);
  const canContinue =
    mode === 'individual'
      ? !!selectedAluno && !!selectedMatriculaId
      : !!selectedTurmaId;

  const resetFlow = (nextMode = mode) => {
    setMode(nextMode);
    setStep(1);
    setSearchTerm('');
    setSelectedAluno(null);
    setSelectedMatriculaId('');
    setSelectedTurmaId('');
  };

  return (
    <div className="animate-fadeIn">
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <div className={`grid gap-2 ${definition.allowBatch !== false ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
          <button
            onClick={() => resetFlow('individual')}
            className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${mode === 'individual' ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
          >
            <Search size={20} />
            <div>
              <p className="text-xs font-black uppercase tracking-wider">Individual</p>
              <p className="mt-0.5 text-[11px] font-medium leading-snug">Localize um aluno e confira a matrícula.</p>
            </div>
          </button>
          {definition.allowBatch !== false && (
            <button
              onClick={() => resetFlow('lote')}
              className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${mode === 'lote' ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
            >
              <Users size={20} />
              <div>
                <p className="text-xs font-black uppercase tracking-wider">Em lote</p>
                <p className="mt-0.5 text-[11px] font-medium leading-snug">Prepare a emissão para uma turma.</p>
              </div>
            </button>
          )}
          </div>
        </div>

      <div className="border-t border-slate-100">
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

        <div className="p-6 md:p-9 min-h-[390px]">
          {step === 1 && mode === 'individual' && (
            <div>
              <h4 className="text-lg font-black text-[#001a33] uppercase">Localizar aluno</h4>
              <p className="text-sm text-slate-500 mt-1 mb-6">Pesquise dentro da unidade ativa por nome ou CPF.</p>

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
                      <button
                        key={aluno.id}
                        onClick={() => setSelectedAluno(aluno)}
                        className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-blue-300 text-left flex items-center justify-between transition-colors"
                      >
                        <div>
                          <p className="font-black text-sm text-[#001a33]">{aluno.nome}</p>
                          <p className="text-xs text-slate-500 mt-0.5">CPF: {aluno.cpf || 'Não informado'}</p>
                        </div>
                        <ChevronRight size={17} className="text-slate-350" />
                      </button>
                    ))
                  ) : (
                    <p className="py-8 text-center text-sm text-slate-400">Nenhum aluno encontrado nesta unidade.</p>
                  )}
                </div>
              )}

              {selectedAluno && (
                <div className="mt-5">
                  <div className={`p-4 rounded-2xl ${definition.softAccent} border border-slate-100`}>
                    <p className="font-black text-[#001a33]">{selectedAluno.nome}</p>
                    <p className="text-xs text-slate-500 mt-1">{selectedAluno.cpf || 'CPF não informado'}</p>
                  </div>

                  <label className="block mt-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Matrícula / turma</label>
                  {isLoadingMatriculas ? (
                    <div className="py-6 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
                  ) : (
                    <select
                      value={selectedMatriculaId}
                      onChange={(event) => setSelectedMatriculaId(event.target.value)}
                      className="w-full mt-2 p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:border-blue-500 text-sm font-bold text-slate-700"
                    >
                      {!matriculas.length && <option value="">Nenhuma matrícula compatível</option>}
                      {matriculas.map((matricula) => (
                        <option key={matricula.id} value={matricula.id}>
                          {matricula.cursoNome} — {matricula.turmaNome}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 1 && mode === 'lote' && (
            <div>
              <h4 className="text-lg font-black text-[#001a33] uppercase">Selecionar turma</h4>
              <p className="text-sm text-slate-500 mt-1 mb-6">A emissão será preparada para os alunos ativos da turma.</p>
              {isLoadingTurmas ? (
                <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
              ) : (
                <div className="space-y-3">
                  {turmas.map((turma) => (
                    <button
                      key={turma.id}
                      onClick={() => setSelectedTurmaId(turma.id)}
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
            </div>
          )}

          {step === 2 && (
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
                  <span className="text-sm font-black text-[#001a33]">{mode === 'individual' ? 'Individual' : 'Lote por turma'}</span>
                </div>
                <div className="p-4 flex justify-between gap-4">
                  <span className="text-xs font-bold text-slate-400 uppercase">{mode === 'individual' ? 'Aluno' : 'Turma'}</span>
                  <span className="text-sm font-black text-[#001a33] text-right">
                    {mode === 'individual'
                      ? `${selectedAluno?.nome} · ${selectedMatricula?.cursoNome || ''}`
                      : `${selectedTurma?.cursoNome || ''} · ${selectedTurma?.nome || ''}`}
                  </span>
                </div>
              </div>
              {emissionMutation.isError && (
                <p className="mt-4 text-sm font-bold text-red-600">Não foi possível preparar a emissão. Verifique a conexão e tente novamente.</p>
              )}
              {mode === 'individual' && selectedMatriculaId && definition.academicPreview && (
                <div className="mt-6">
                  <SecretariaAcademicDocumentPreview
                    matriculaId={selectedMatriculaId}
                    type={definition.academicPreview}
                  />
                </div>
              )}
            </div>
          )}

          {step === 3 && (
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
              <button onClick={() => resetFlow(mode)} className="mt-7 px-6 py-3 rounded-xl bg-[#001a33] text-white text-xs font-black uppercase tracking-widest">
                Nova emissão
              </button>
            </div>
          )}
        </div>

        {step < 3 && (
          <div className="px-6 md:px-9 py-5 border-t border-slate-100 bg-slate-50/70 flex justify-between gap-3">
            <button
              onClick={() => step === 2 ? setStep(1) : resetFlow(mode)}
              className="px-5 py-3 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-black uppercase tracking-wider"
            >
              {step === 2 ? 'Voltar' : 'Limpar'}
            </button>
            <button
              disabled={!canContinue || emissionMutation.isPending}
              onClick={() => step === 1 ? setStep(2) : emissionMutation.mutate()}
              className="px-6 py-3 rounded-xl bg-[#001a33] text-white text-xs font-black uppercase tracking-wider disabled:opacity-40 flex items-center gap-2"
            >
              {emissionMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : step === 1 ? <ChevronRight size={15} /> : <FileCheck2 size={15} />}
              {step === 1 ? 'Continuar' : definition.actionLabel}
            </button>
          </div>
        )}
      </div>
    </div>
    </div>
  );
};

export default SecretariaDocumentoEmissionPage;
