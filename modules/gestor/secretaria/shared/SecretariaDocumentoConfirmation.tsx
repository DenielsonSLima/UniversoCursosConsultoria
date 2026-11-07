import { getSecretariaErrorMessage } from './secretaria-error';
import type { SecretariaDocumentoWorkspace } from './useSecretariaDocumentoWorkspace';

  const SecretariaDocumentoConfirmation = ({ workspace }: { workspace: SecretariaDocumentoWorkspace }) => {
  const {
    definition,
    mode,
    step,
    selectedAluno,
    customSelections,
    selectedReferenceYear,
    crachaPrintLayout,
    setCrachaPrintLayout,
    isIrpfAnnual,
    isBoletim,
    isCrachaEstagio,
    isCrachaPeriodoEleitoral,
    selectsFichaTemplate,
    usesDirectDocumentViewer,
    selectedFichaTemplate,
    selectedMatricula,
    selectedTurma,
    selectedModule,
    isCrachaEleitoralAvailable,
    emissionMutation,
  } = workspace;
  return (<>
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
</>);
};

export default SecretariaDocumentoConfirmation;
