import React from 'react';
import { CreditCard, Loader2, Printer, Search, Trash2, Users, X } from 'lucide-react';
import SecretariaAlunoSearchCard from '../shared/SecretariaAlunoSearchCard';
import { matchesSecretariaSearch } from '../secretaria-search';
import { matchesDeclaracaoAlunoSearch } from './declaracao-matricula.helpers';
import type { DeclaracaoAluno, DeclaracaoMode } from './declaracao-matricula.types';

interface SecretariaDeclaracaoSelectionProps {
  alunos: DeclaracaoAluno[];
  customSelectedAlunos: DeclaracaoAluno[];
  documentTitle: string;
  isPreparingValidation: boolean;
  mode: DeclaracaoMode;
  onPrepare: () => void;
  rawAlunosParaImprimir: DeclaracaoAluno[];
  searchQuery: string;
  searchQueryCustom: string;
  selectedAluno: DeclaracaoAluno | null;
  selectedTurmaId: string;
  setCustomSelectedAlunos: React.Dispatch<React.SetStateAction<DeclaracaoAluno[]>>;
  setMode: React.Dispatch<React.SetStateAction<DeclaracaoMode>>;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setSearchQueryCustom: React.Dispatch<React.SetStateAction<string>>;
  setSelectedAluno: React.Dispatch<React.SetStateAction<DeclaracaoAluno | null>>;
  setSelectedTurmaId: React.Dispatch<React.SetStateAction<string>>;
  turmas: any[];
  validationPublic: boolean;
  validationValidityDays: number | null;
}

const ModeButton = ({
  active,
  description,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  description: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${active ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
  >
    {icon}
    <div>
      <p className="text-xs font-black uppercase tracking-wider">{label}</p>
      <p className="mt-0.5 text-[11px] font-medium leading-snug">{description}</p>
    </div>
  </button>
);

const SecretariaDeclaracaoSelection = ({
  alunos,
  customSelectedAlunos,
  documentTitle,
  isPreparingValidation,
  mode,
  onPrepare,
  rawAlunosParaImprimir,
  searchQuery,
  searchQueryCustom,
  selectedAluno,
  selectedTurmaId,
  setCustomSelectedAlunos,
  setMode,
  setSearchQuery,
  setSearchQueryCustom,
  setSelectedAluno,
  setSelectedTurmaId,
  turmas,
  validationPublic,
  validationValidityDays,
}: SecretariaDeclaracaoSelectionProps) => {
  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    const result = alunos.find((aluno) => matchesSecretariaSearch(
      searchQuery,
      [aluno.nome, aluno.cpf, aluno.rg, aluno.curso, aluno.turmaNome],
    ));
    if (result) {
      setSelectedAluno(result);
      setSearchQuery('');
    } else {
      alert('Nenhum aluno encontrado.');
    }
  };
  const individualResults = alunos.filter((aluno) => matchesDeclaracaoAlunoSearch(aluno, searchQuery));
  const customResults = alunos.filter((aluno) => matchesDeclaracaoAlunoSearch(aluno, searchQueryCustom));

  return (
    <div className="animate-fadeIn">
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <div className="grid gap-2 md:grid-cols-3">
            <ModeButton active={mode === 'individual'} description="Busque um aluno e emita o documento." icon={<Search size={20} />} label="Individual" onClick={() => setMode('individual')} />
            <ModeButton active={mode === 'lote'} description="Gere para uma turma ou todos os alunos." icon={<Users size={20} />} label="Em lote" onClick={() => setMode('lote')} />
            <ModeButton active={mode === 'custom'} description="Monte uma lista mista de alunos." icon={<CreditCard size={20} />} label="Personalizado" onClick={() => setMode('custom')} />
          </div>
        </div>

        <div className="p-5 md:p-7">
          {mode === 'individual' && (
            <div className="animate-fadeIn">
              <h3 className="text-xl font-black text-[#001a33] mb-6 uppercase tracking-tight">Declaração Individual</h3>
              <div className="relative mb-8">
                <div className="flex gap-4">
                  <input
                    type="text"
                    placeholder="Buscar aluno por nome, CPF ou RG..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
                    className="flex-1 px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 text-slate-750 font-medium text-sm"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="text-slate-450 hover:text-slate-650 text-xs font-bold uppercase tracking-wider px-3 transition-colors">
                      Limpar
                    </button>
                  )}
                  <button onClick={handleSearch} className="bg-[#001a33] text-white px-8 rounded-2xl hover:bg-blue-900 transition-colors shadow-lg">
                    <Search size={20} />
                  </button>
                </div>

                {searchQuery.trim().length > 0 && (
                  <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-60 overflow-y-auto custom-scrollbar">
                    {individualResults.slice(0, 15).map((aluno) => (
                      <div key={aluno.id} className="border-b border-slate-100 p-2 last:border-0">
                        <SecretariaAlunoSearchCard
                          nome={aluno.nome} cpf={aluno.cpf} rg={aluno.rg} cursoNome={aluno.curso}
                          turmaNome={aluno.turmaNome} turmaCodigo={aluno.turmaCodigo}
                          matricula={aluno.matricula} fotoUrl={aluno.fotoUrl} tone="blue"
                          onClick={() => { setSelectedAluno(aluno); setSearchQuery(''); }}
                        />
                      </div>
                    ))}
                    {individualResults.length === 0 && (
                      <div className="p-4 text-center text-xs font-bold text-slate-400 uppercase">Nenhum aluno encontrado</div>
                    )}
                  </div>
                )}
              </div>

              {selectedAluno ? (
                <div className="mb-8 animate-fadeIn animate-duration-300">
                  <SecretariaAlunoSearchCard
                    nome={selectedAluno.nome} cpf={selectedAluno.cpf} rg={selectedAluno.rg}
                    cursoNome={selectedAluno.curso} turmaNome={selectedAluno.turmaNome}
                    turmaCodigo={selectedAluno.turmaCodigo} matricula={selectedAluno.matricula}
                    fotoUrl={selectedAluno.fotoUrl} tone="blue" selected statusLabel="Ativo"
                    actionLabel="Trocar" onClick={() => setSelectedAluno(null)}
                  />
                </div>
              ) : (
                <div className="border border-slate-150 rounded-3xl p-6 mb-8 text-center text-slate-450 font-bold uppercase text-xs">
                  Busque um aluno acima para visualizar seus dados e emitir a declaração.
                </div>
              )}

              <div className="flex flex-col items-center">
                <button
                  onClick={onPrepare}
                  disabled={!selectedAluno || isPreparingValidation}
                  className="px-8 py-4 bg-[#001a33] text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-900 transition-colors shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPreparingValidation ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                  {isPreparingValidation ? 'Registrando código...' : `Visualizar ${documentTitle}`}
                </button>
              </div>
            </div>
          )}

          {mode === 'lote' && (
            <div className="animate-fadeIn">
              <h3 className="text-xl font-black text-[#001a33] mb-6 uppercase tracking-tight">Emissão em Lote (Turma)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Selecione a Turma</label>
                  <select
                    value={selectedTurmaId}
                    onChange={(event) => setSelectedTurmaId(event.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 cursor-pointer font-bold text-slate-700 text-sm"
                  >
                    <option value="todos">Todos os Alunos Cadastrados</option>
                    {turmas.map((turma) => <option key={turma.id} value={turma.id}>{turma.nome} ({turma.codigo})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Política do Validador</label>
                  <input
                    type="text"
                    value={!validationPublic ? 'Sem validador público' : validationValidityDays === null ? 'Sem vencimento' : `${validationValidityDays} dias`}
                    disabled
                    className="w-full p-4 bg-slate-100 border border-slate-200 rounded-2xl font-bold text-slate-500 text-sm outline-none"
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => alert(`Alunos no lote para impressão:\n\n${rawAlunosParaImprimir.map((aluno) => `${aluno.nome} (${aluno.curso})`).join('\n')}`)}
                  className="flex-1 py-4 border border-slate-200 text-slate-600 rounded-2xl font-bold uppercase text-xs tracking-wider hover:bg-slate-50 transition-colors"
                >
                  Ver Lista de Alunos ({rawAlunosParaImprimir.length})
                </button>
                <button
                  onClick={onPrepare}
                  disabled={rawAlunosParaImprimir.length === 0 || isPreparingValidation}
                  className="flex-1 py-4 bg-[#001a33] text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-900 transition-all shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPreparingValidation ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
                  {isPreparingValidation ? 'Registrando códigos...' : 'Visualizar Lote Completo'}
                </button>
              </div>
            </div>
          )}

          {mode === 'custom' && (
            <div className="animate-fadeIn">
              <h3 className="text-xl font-black text-[#001a33] mb-6 uppercase tracking-tight">Declarações Personalizadas (Misto)</h3>
              <div className="relative mb-8">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Buscar e Adicionar Alunos</label>
                <div className="flex gap-4">
                  <input
                    type="text"
                    placeholder="Buscar aluno por nome, CPF ou RG..."
                    value={searchQueryCustom}
                    onChange={(event) => setSearchQueryCustom(event.target.value)}
                    className="flex-1 px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 text-slate-750 font-medium text-sm"
                  />
                  {searchQueryCustom && (
                    <button onClick={() => setSearchQueryCustom('')} className="text-slate-450 hover:text-slate-655 text-xs font-bold uppercase tracking-wider px-3 transition-colors">
                      Limpar
                    </button>
                  )}
                </div>

                {searchQueryCustom.trim().length > 0 && (
                  <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-60 overflow-y-auto custom-scrollbar">
                    {customResults.slice(0, 15).map((aluno) => {
                      const isAdded = customSelectedAlunos.some((item) => item.id === aluno.id);
                      return (
                        <div key={aluno.id} className="border-b border-slate-100 p-2 last:border-0">
                          <SecretariaAlunoSearchCard
                            nome={aluno.nome} cpf={aluno.cpf} rg={aluno.rg} cursoNome={aluno.curso}
                            turmaNome={aluno.turmaNome} turmaCodigo={aluno.turmaCodigo}
                            matricula={aluno.matricula} fotoUrl={aluno.fotoUrl} tone="blue"
                            disabled={isAdded} actionLabel={isAdded ? 'Adicionado' : 'Adicionar'}
                            statusLabel={isAdded ? 'Na lista' : undefined} statusTone="neutral"
                            onClick={() => { setCustomSelectedAlunos((current) => [...current, aluno]); setSearchQueryCustom(''); }}
                          />
                        </div>
                      );
                    })}
                    {customResults.length === 0 && (
                      <div className="p-4 text-center text-xs font-bold text-slate-400 uppercase">Nenhum aluno encontrado</div>
                    )}
                  </div>
                )}
              </div>

              <div className="border border-slate-200 rounded-3xl p-6 mb-8 bg-slate-50/20 animate-fadeIn">
                <div className="flex justify-between items-center mb-6">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">Alunos Selecionados ({customSelectedAlunos.length})</h4>
                  {customSelectedAlunos.length > 0 && (
                    <button onClick={() => setCustomSelectedAlunos([])} className="text-red-500 hover:text-red-700 font-black uppercase text-[10px] tracking-wider transition-colors flex items-center gap-1">
                      <Trash2 size={12} /> Esvaziar Lista
                    </button>
                  )}
                </div>

                {customSelectedAlunos.length > 0 ? (
                  <div className="flex flex-col gap-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                    {customSelectedAlunos.map((aluno) => (
                      <div key={aluno.id} className="flex items-center justify-between p-4 bg-white border border-slate-150 rounded-2xl shadow-sm hover:shadow-md transition-all">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-black text-sm overflow-hidden border border-blue-100">
                            {aluno.fotoUrl ? <img src={aluno.fotoUrl} alt="Foto" className="w-full h-full object-cover" /> : aluno.nome[0]}
                          </div>
                          <div>
                            <span className="block font-black text-slate-800 text-xs uppercase leading-tight">{aluno.nome}</span>
                            <span className="block text-[10px] text-slate-450 font-bold uppercase tracking-wider mt-0.5">Matrícula: {aluno.matricula} | {aluno.curso}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => setCustomSelectedAlunos((current) => current.filter((item) => item.id !== aluno.id))}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                          title="Remover aluno"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border border-slate-200 border-dashed rounded-2xl p-8 text-center text-slate-450 font-bold uppercase text-xs">
                    Nenhum aluno adicionado à lista. Busque alunos acima para começar a montar o lote de impressão personalizado.
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={onPrepare}
                  disabled={customSelectedAlunos.length === 0 || isPreparingValidation}
                  className="w-full py-4 bg-[#001a33] text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-900 transition-all shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPreparingValidation ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
                  {isPreparingValidation ? 'Registrando códigos...' : 'Visualizar Lote Personalizado'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SecretariaDeclaracaoSelection;
