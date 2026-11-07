import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import { Loader2, Printer, Search, Trash2, X } from 'lucide-react';
import { formatMatricula } from '../../../../lib/academicUtils';
import SecretariaAlunoSearchCard from './SecretariaAlunoSearchCard';
import type { SecretariaDocumentoWorkspace } from './useSecretariaDocumentoWorkspace';

  const SecretariaDocumentoCustomSelection = ({ workspace }: { workspace: SecretariaDocumentoWorkspace }) => {
  const {
    definition,
    mode,
    step,
    searchTerm,
    setSearchTerm,
    selectedAluno,
    setSelectedAluno,
    selectedMatriculaId,
    setSelectedMatriculaId,
    selectedModuleId,
    setSelectedModuleId,
    customSelections,
    setCustomSelections,
    isBoletim,
    usesDirectDocumentViewer,
    normalizedTerm,
    alunos,
    isSearching,
    matriculas,
    isLoadingMatriculas,
    selectedMatricula,
    modules,
    isLoadingModules,
    emissionMutation,
    canContinue,
    openDirectDocumentViewer,
  } = workspace;
  return (<>
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
                    <InstitutionalSelect
                      value={selectedMatriculaId}
                      onValueChange={(value) => setSelectedMatriculaId(value)}
                      ariaLabel="Matrícula / turma"
                      options={matriculas.map((matricula) => ({ value: matricula.id, label: `${matricula.cursoNome} — ${matricula.turmaNome} (${matricula.status})` }))}
                      placeholder={'Nenhuma matrícula compatível'}
                      className="mt-2 w-full"
                    />
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
                  <InstitutionalSelect
                    value={selectedModuleId}
                    onValueChange={(value) => setSelectedModuleId(value)}
                    ariaLabel="Módulo do boletim"
                    options={[{ value: '', label: 'Selecione o módulo' }, ...modules.map((module) => ({ value: module.id, label: module.nome }))]}
                    disabled={isLoadingModules || !modules.length}
                    placeholder={isLoadingModules ? 'Carregando módulos...' : 'Selecione o módulo'}
                    className="mt-2 w-full"
                  />
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
</>);
};

export default SecretariaDocumentoCustomSelection;
