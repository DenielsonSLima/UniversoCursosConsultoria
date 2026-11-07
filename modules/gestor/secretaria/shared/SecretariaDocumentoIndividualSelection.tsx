import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import { Loader2, Printer, Search } from 'lucide-react';
import { formatMatricula } from '../../../../lib/academicUtils';
import SecretariaAlunoSearchCard from './SecretariaAlunoSearchCard';
import { getSecretariaErrorMessage } from './secretaria-error';
import type { SecretariaDocumentoWorkspace } from './useSecretariaDocumentoWorkspace';

  const SecretariaDocumentoIndividualSelection = ({ workspace }: { workspace: SecretariaDocumentoWorkspace }) => {
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
    selectedReferenceYear,
    setSelectedReferenceYear,
    isIrpfAnnual,
    isBoletim,
    usesDirectDocumentViewer,
    irpfYearOptions,
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
                    <InstitutionalSelect
                      value={selectedMatriculaId}
                      onValueChange={(value) => {
                        setSelectedMatriculaId(value);
                        setSelectedModuleId('');
                      }}
                      ariaLabel="Matrícula / turma"
                      options={matriculas.map((matricula) => ({ value: matricula.id, label: `${matricula.cursoNome} — ${matricula.turmaNome} (${matricula.status})` }))}
                      placeholder={'Nenhuma matrícula compatível'}
                      className="mt-2 w-full"
                    />
                  )}

                  {isBoletim && selectedMatriculaId && (
                    <div className="mt-5">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">
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
                      <InstitutionalSelect
                        value={String(selectedReferenceYear)}
                        onValueChange={(value) => setSelectedReferenceYear(Number(value))}
                        ariaLabel="Ano-calendário"
                        options={irpfYearOptions.map((option) => ({ value: String(option.year), label: `${option.year} ${option.released ? '' : `(libera em ${option.releaseLabel})`}`, disabled: !option.released }))}
                        className="mt-2 w-full"
                      />
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
</>);
};

export default SecretariaDocumentoIndividualSelection;
