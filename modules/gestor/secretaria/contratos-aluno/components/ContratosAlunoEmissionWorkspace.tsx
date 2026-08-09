import { useEffect, useMemo, useState } from 'react';
import {
  CreditCard,
  Info,
  Loader2,
  Printer,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import SecretariaAlunoSearchCard from '../../shared/SecretariaAlunoSearchCard';
import { normalizeSecretariaSearch } from '../../secretaria-search';
import { formatMatricula } from '../../../../../lib/academicUtils';
import type {
  ContratoAlunoEmissionMode,
  ContratoAlunoTarget,
  ContratoAlunoWorkspace,
} from '../types/contratos-aluno.types';

interface ContratosAlunoEmissionWorkspaceProps {
  workspace: ContratoAlunoWorkspace;
  mode: ContratoAlunoEmissionMode;
  onModeChange: (mode: ContratoAlunoEmissionMode) => void;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  batchModality: string;
  onBatchModalityChange: (modality: string) => void;
  turmaId: string;
  onTurmaIdChange: (turmaId: string) => void;
  selectedEnrollmentIds: string[];
  onToggleTarget: (target: ContratoAlunoTarget) => void;
  onReplaceSelection: (enrollmentIds: string[]) => void;
  customMessage: string;
  onCustomMessageChange: (message: string) => void;
  onPrepare: () => void;
  isPreparing: boolean;
}

const modeOptions: Array<{
  id: ContratoAlunoEmissionMode;
  label: string;
  description: string;
  icon: typeof Search;
}> = [
  {
    id: 'INDIVIDUAL',
    label: 'Individual',
    description: 'Busque um aluno e visualize o contrato.',
    icon: Search,
  },
  {
    id: 'LOTE',
    label: 'Em lote',
    description: 'Gere para uma turma ou todos os alunos.',
    icon: Users,
  },
  {
    id: 'PERSONALIZADO',
    label: 'Personalizado',
    description: 'Monte uma lista mista de alunos.',
    icon: CreditCard,
  },
];

const modalityLabel = (modalidade: string) => {
  if (modalidade === 'SUPERIOR') return 'Especialização';
  if (modalidade === 'LIVRE') return 'Livre';
  if (modalidade === 'TECNICO') return 'Técnico';
  return modalidade || 'Não informada';
};

const matchesSearch = (target: ContratoAlunoTarget, normalizedSearch: string) => [
  target.alunoNome,
  target.cursoNome,
  target.turmaNome,
  target.turmaCodigo,
  target.modalidade,
].some((value) => normalizeSecretariaSearch(value).includes(normalizedSearch));

const groupTargetsByStudent = (targets: ContratoAlunoTarget[]) => {
  const grouped = new Map<string, ContratoAlunoTarget[]>();
  targets.forEach((target) => {
    const key = target.alunoId || target.enrollmentId;
    grouped.set(key, [...(grouped.get(key) || []), target]);
  });
  return [...grouped.values()];
};

const ContratosAlunoEmissionWorkspace = ({
  workspace,
  mode,
  onModeChange,
  searchTerm,
  onSearchTermChange,
  batchModality,
  onBatchModalityChange,
  turmaId,
  onTurmaIdChange,
  selectedEnrollmentIds,
  onToggleTarget,
  onReplaceSelection,
  customMessage,
  onCustomMessageChange,
  onPrepare,
  isPreparing,
}: ContratosAlunoEmissionWorkspaceProps) => {
  const [customCandidateId, setCustomCandidateId] = useState('');
  const normalizedSearch = normalizeSecretariaSearch(searchTerm);
  const selectedSet = useMemo(() => new Set(selectedEnrollmentIds), [selectedEnrollmentIds]);
  const selectedTarget = workspace.targets.find((target) => selectedSet.has(target.enrollmentId)) || null;
  const selectedStudentTargets = selectedTarget
    ? workspace.targets.filter((target) => target.alunoId === selectedTarget.alunoId && target.elegivel)
    : [];
  const customCandidate = workspace.targets.find((target) => target.enrollmentId === customCandidateId) || null;
  const customCandidateTargets = customCandidate
    ? workspace.targets.filter((target) => target.alunoId === customCandidate.alunoId && target.elegivel)
    : [];

  useEffect(() => {
    setCustomCandidateId('');
  }, [mode]);

  const activeModalities = useMemo(() => new Set(
    workspace.templates
      .filter((template) => template.status === 'ATIVO' && template.modalidade)
      .map((template) => String(template.modalidade)),
  ), [workspace.templates]);

  const modalityOptions = useMemo(() => [...new Set(
    workspace.targets
      .filter((target) => target.elegivel && activeModalities.has(target.modalidade))
      .map((target) => target.modalidade),
  )].sort((a, b) => modalityLabel(a).localeCompare(modalityLabel(b), 'pt-BR')), [activeModalities, workspace.targets]);

  const searchGroups = useMemo(() => {
    if (normalizedSearch.length < 2) return [];
    return groupTargetsByStudent(
      workspace.targets.filter((target) => matchesSearch(target, normalizedSearch)),
    );
  }, [normalizedSearch, workspace.targets]);

  const batchTurmas = workspace.turmas.filter((turma) => turma.modalidade === batchModality);
  const selectedBatchTargets = workspace.targets.filter((target) => (
    target.elegivel
    && target.modalidade === batchModality
    && (turmaId === 'todos' || target.turmaId === turmaId)
  ));
  const selectedCustomTargets = selectedEnrollmentIds
    .map((id) => workspace.targets.find((target) => target.enrollmentId === id))
    .filter((target): target is ContratoAlunoTarget => Boolean(target));
  const selectedCount = selectedEnrollmentIds.length;
  const exceedsBatchLimit = selectedCount > 100;
  const canPrepare = selectedCount > 0 && !exceedsBatchLimit && !isPreparing;

  const selectStudent = (targets: ContratoAlunoTarget[]) => {
    const target = targets.find((item) => item.elegivel);
    if (!target) return;
    onReplaceSelection([target.enrollmentId]);
  };

  const selectCustomStudent = (targets: ContratoAlunoTarget[]) => {
    const target = targets.find((item) => item.elegivel && !selectedSet.has(item.enrollmentId))
      || targets.find((item) => item.elegivel);
    setCustomCandidateId(target?.enrollmentId || '');
  };

  const changeBatchModality = (nextModality: string) => {
    onBatchModalityChange(nextModality);
    onTurmaIdChange('');
    onReplaceSelection([]);
  };

  const changeBatchTurma = (nextTurmaId: string) => {
    onTurmaIdChange(nextTurmaId);
    const ids = workspace.targets
      .filter((target) => (
        target.elegivel
        && target.modalidade === batchModality
        && (nextTurmaId === 'todos' || target.turmaId === nextTurmaId)
      ))
      .map((target) => target.enrollmentId);
    onReplaceSelection(ids);
  };

  const renderSearchResults = (onSelect: (targets: ContratoAlunoTarget[]) => void) => {
    if (normalizedSearch.length < 2) return null;
    if (!searchGroups.length) {
      return <p className="py-8 text-center text-sm text-slate-400">Nenhum aluno encontrado nesta unidade.</p>;
    }
    return (
      <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
        {searchGroups.map((targets) => {
          const representative = targets.find((target) => target.elegivel) || targets[0];
          return (
            <SecretariaAlunoSearchCard
              key={representative.alunoId || representative.enrollmentId}
              nome={representative.alunoNome}
              cursoNome={representative.cursoNome}
              turmaNome={representative.turmaNome}
              turmaCodigo={representative.turmaCodigo}
              cpf={representative.alunoCpf}
              rg={representative.alunoRg}
              matricula={formatMatricula(
                representative.enrollmentId,
                representative.dataMatricula || undefined,
                representative.poloId || undefined,
              )}
              fotoUrl={representative.alunoFotoUrl}
              tone="blue"
              disabled={!targets.some((target) => target.elegivel)}
              statusLabel={representative.mensagemElegibilidade || representative.statusLabel || undefined}
              statusTone={representative.elegivel ? 'success' : 'warning'}
              onClick={() => onSelect(targets)}
            />
          );
        })}
      </div>
    );
  };

  const ctaLabel = mode === 'INDIVIDUAL'
    ? 'Visualizar Contrato do Aluno'
    : mode === 'LOTE'
      ? 'Visualizar lote de Contratos'
      : 'Visualizar seleção de Contratos';

  return (
    <div className="animate-fadeIn">
      <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <div className="grid gap-2 md:grid-cols-3">
            {modeOptions.map((option) => {
              const Icon = option.icon;
              const active = mode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onModeChange(option.id)}
                  aria-pressed={active}
                  className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${active
                    ? 'border-cyan-200 bg-cyan-50 text-cyan-800'
                    : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
                >
                  <Icon size={20} />
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider">{option.label}</p>
                    <p className="mt-0.5 text-[11px] font-medium leading-snug">{option.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-[390px] border-t border-slate-100 p-6 md:p-9">
          {mode === 'INDIVIDUAL' && (
            <div>
              <h4 className="text-lg font-black uppercase text-[#001a33]">Contrato do Aluno individual</h4>
              <p className="mb-6 mt-1 text-sm text-slate-500">Busque um aluno, escolha a matrícula e abra a visualização.</p>

              <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => {
                    onSearchTermChange(event.target.value);
                    if (selectedTarget) onReplaceSelection([]);
                  }}
                  aria-label="Buscar aluno para contrato individual"
                  placeholder="Digite pelo menos 2 caracteres..."
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-5 text-sm font-medium outline-none focus:border-blue-500"
                />
              </div>
              {!selectedTarget && renderSearchResults(selectStudent)}

              {selectedTarget && (
                <div className="mt-5">
                  <SecretariaAlunoSearchCard
                    nome={selectedTarget.alunoNome}
                    cursoNome={selectedTarget.cursoNome}
                    turmaNome={selectedTarget.turmaNome}
                    turmaCodigo={selectedTarget.turmaCodigo}
                    cpf={selectedTarget.alunoCpf}
                    rg={selectedTarget.alunoRg}
                    matricula={formatMatricula(
                      selectedTarget.enrollmentId,
                      selectedTarget.dataMatricula || undefined,
                      selectedTarget.poloId || undefined,
                    )}
                    fotoUrl={selectedTarget.alunoFotoUrl}
                    tone="blue"
                    selected
                    actionLabel="Trocar"
                    statusLabel={selectedTarget.statusLabel || undefined}
                    onClick={() => {
                      onReplaceSelection([]);
                    }}
                  />

                  <label htmlFor="contrato-individual-matricula" className="mt-5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Matrícula / turma</label>
                  <select
                    id="contrato-individual-matricula"
                    value={selectedTarget.enrollmentId}
                    onChange={(event) => onReplaceSelection([event.target.value])}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
                  >
                    {selectedStudentTargets.map((target) => (
                      <option key={target.enrollmentId} value={target.enrollmentId}>
                        {target.cursoNome} — {target.turmaNome}{target.turmaCodigo ? ` (${target.turmaCodigo})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {mode === 'LOTE' && (
            <div>
              <h4 className="text-lg font-black uppercase text-[#001a33]">Emissão em lote</h4>
              <p className="mb-6 mt-1 text-sm text-slate-500">Escolha a modalidade e gere os contratos de uma turma ou de todos os alunos elegíveis.</p>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="contrato-lote-modalidade" className="mb-2 block text-xs font-bold uppercase text-slate-500">Tipo de modalidade</label>
                  <select
                    id="contrato-lote-modalidade"
                    value={batchModality}
                    onChange={(event) => changeBatchModality(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-bold text-slate-700 outline-none focus:border-cyan-500"
                  >
                    <option value="">Selecione a modalidade</option>
                    {modalityOptions.map((modality) => (
                      <option key={modality} value={modality}>{modalityLabel(modality)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="contrato-lote-turma" className="mb-2 block text-xs font-bold uppercase text-slate-500">Turma</label>
                  <select
                    id="contrato-lote-turma"
                    value={turmaId}
                    onChange={(event) => changeBatchTurma(event.target.value)}
                    disabled={!batchModality}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-bold text-slate-700 outline-none focus:border-cyan-500 disabled:cursor-not-allowed disabled:text-slate-400"
                  >
                    <option value="">Selecione a turma</option>
                    <option value="todos">Todos os alunos da modalidade</option>
                    {batchTurmas.map((turma) => (
                      <option key={turma.id} value={turma.id}>
                        {turma.cursoNome} — {turma.nome}{turma.codigo ? ` (${turma.codigo})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {turmaId && (
                <div className="mt-4 w-full rounded-2xl border border-blue-100 bg-blue-50 p-4 font-bold text-blue-700">
                  {selectedBatchTargets.length} {selectedBatchTargets.length === 1 ? 'aluno elegível' : 'alunos elegíveis'} no lote
                </div>
              )}
            </div>
          )}

          {mode === 'PERSONALIZADO' && (
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg font-black uppercase text-[#001a33]">Montar lista personalizada</h4>
                  <p className="mt-1 text-sm text-slate-500">Busque cada aluno, escolha a matrícula correta e adicione à lista.</p>
                </div>
                {selectedCustomTargets.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onReplaceSelection([])}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider text-rose-600 hover:bg-rose-50"
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
                    onSearchTermChange(event.target.value);
                    setCustomCandidateId('');
                  }}
                  aria-label="Buscar aluno para lista personalizada de contratos"
                  placeholder="Buscar aluno por nome, curso, turma ou código..."
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-5 text-sm font-medium outline-none focus:border-blue-500"
                />
              </div>

              {!customCandidate && renderSearchResults(selectCustomStudent)}

              {customCandidate && (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                  <SecretariaAlunoSearchCard
                    nome={customCandidate.alunoNome}
                    cursoNome={customCandidate.cursoNome}
                    turmaNome={customCandidate.turmaNome}
                    turmaCodigo={customCandidate.turmaCodigo}
                    cpf={customCandidate.alunoCpf}
                    rg={customCandidate.alunoRg}
                    matricula={formatMatricula(
                      customCandidate.enrollmentId,
                      customCandidate.dataMatricula || undefined,
                      customCandidate.poloId || undefined,
                    )}
                    fotoUrl={customCandidate.alunoFotoUrl}
                    tone="blue"
                    selected
                    actionLabel="Trocar"
                    onClick={() => setCustomCandidateId('')}
                  />
                  <label htmlFor="contrato-personalizado-matricula" className="mt-4 block text-[10px] font-black uppercase tracking-widest text-slate-500">Matrícula / turma</label>
                  <select
                    id="contrato-personalizado-matricula"
                    value={customCandidate.enrollmentId}
                    onChange={(event) => setCustomCandidateId(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
                  >
                    {customCandidateTargets.map((target) => (
                      <option key={target.enrollmentId} value={target.enrollmentId}>
                        {target.cursoNome} — {target.turmaNome}{target.turmaCodigo ? ` (${target.turmaCodigo})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={selectedSet.has(customCandidate.enrollmentId) || selectedCount >= 100}
                    onClick={() => {
                      if (!selectedSet.has(customCandidate.enrollmentId)) onToggleTarget(customCandidate);
                      setCustomCandidateId('');
                      onSearchTermChange('');
                    }}
                    className="mt-4 w-full rounded-xl bg-[#001a33] px-5 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {selectedSet.has(customCandidate.enrollmentId) ? 'Matrícula já adicionada' : 'Adicionar à lista'}
                  </button>
                </div>
              )}

              <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Alunos selecionados</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">{selectedCustomTargets.length}</span>
                </div>
                {selectedCustomTargets.length ? (
                  <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                    {selectedCustomTargets.map((target) => (
                      <div key={target.enrollmentId} className="flex items-center justify-between gap-4 p-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-[#001a33]">{target.alunoNome}</p>
                          <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">{target.cursoNome} · {target.turmaNome}</p>
                        </div>
                        <button
                          type="button"
                          title="Remover aluno"
                          onClick={() => onToggleTarget(target)}
                          className="shrink-0 rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="p-8 text-center text-xs font-bold uppercase text-slate-400">Nenhum aluno adicionado à lista.</p>
                )}
              </div>

              <label className="mt-5 block">
                <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.12em] text-slate-500"><Info size={14} /> Mensagem complementar opcional</span>
                <textarea
                  value={customMessage}
                  onChange={(event) => onCustomMessageChange(event.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder="Inclua uma observação complementar, quando permitida pelo modelo aprovado."
                  className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-[#001a33] outline-none placeholder:text-slate-400 focus:border-blue-400 focus:bg-white"
                />
                <p className="mt-1 text-[11px] font-medium text-slate-400">O conteúdo jurídico, a revisão, a validade e a elegibilidade continuam sendo resolvidos pelo serviço.</p>
              </label>
            </div>
          )}

          {exceedsBatchLimit && (
            <p className="mt-5 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-bold text-rose-700">
              O serviço aceita no máximo 100 contratos por emissão. Reduza a turma ou a seleção sem cortar alunos silenciosamente.
            </p>
          )}

          <div className="mt-8 flex flex-col items-center">
            <button
              type="button"
              disabled={!canPrepare}
              onClick={onPrepare}
              className="inline-flex min-w-[280px] items-center justify-center gap-2 rounded-2xl bg-[#001a33] px-8 py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg transition-colors hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isPreparing ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
              {isPreparing ? 'Preparando visualização...' : ctaLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContratosAlunoEmissionWorkspace;
