import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import { Loader2, Printer } from 'lucide-react';
import type { SecretariaDocumentoWorkspace } from './useSecretariaDocumentoWorkspace';

  const SecretariaDocumentoBatchSelection = ({ workspace }: { workspace: SecretariaDocumentoWorkspace }) => {
  const {
    definition,
    mode,
    step,
    selectedTurmaId,
    setSelectedTurmaId,
    selectedBatchModalidade,
    setSelectedBatchModalidade,
    selectedModuleId,
    setSelectedModuleId,
    isBoletim,
    usesDirectDocumentViewer,
    supportsAllStudentsBatch,
    loteModalidades,
    supportsBatchModalidadeFilter,
    hasBatchModalitySelected,
    turmas,
    isLoadingTurmas,
    selectedTurma,
    pastaBatchTurmas,
    modules,
    isLoadingModules,
    emissionMutation,
    canContinue,
    openDirectDocumentViewer,
  } = workspace;
  return (<>
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
                      <InstitutionalSelect
                        value={selectedBatchModalidade}
                        onValueChange={(value) => {
                          setSelectedBatchModalidade(value);
                          setSelectedTurmaId('');
                        }}
                        ariaLabel="Tipo de modalidade"
                        options={loteModalidades}
                        className="w-full"
                      />
                    </div>
                  )}
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase text-slate-500">
                      Selecione a turma
                    </label>
                    <InstitutionalSelect
                      value={selectedTurmaId}
                      onValueChange={(value) => setSelectedTurmaId(value)}
                      ariaLabel="Selecione a turma"
                      options={[{ value: 'todos', label: 'Todos os alunos deste polo' }, ...pastaBatchTurmas.map((turma) => ({ value: turma.id, label: `${turma.nome} (${turma.codigo})` }))]}
                      disabled={!hasBatchModalitySelected}
                      className="w-full"
                    />
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
                      <InstitutionalSelect
                        value={selectedBatchModalidade}
                        onValueChange={(value) => {
                          setSelectedBatchModalidade(value);
                          setSelectedTurmaId('');
                        }}
                        ariaLabel="Tipo de modalidade"
                        options={loteModalidades}
                        className="w-full"
                      />
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
</>);
};

export default SecretariaDocumentoBatchSelection;
