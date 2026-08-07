import { Check, FileSignature, Info, Loader2, Search, Users } from 'lucide-react';
import ContratosAlunoPreparedResult from './ContratosAlunoPreparedResult';
import type {
  ContratoAlunoEmissionMode,
  ContratoAlunoPreparationResult,
  ContratoAlunoTarget,
  ContratoAlunoWorkspace,
} from '../types/contratos-aluno.types';

interface ContratosAlunoEmissionWorkspaceProps {
  workspace: ContratoAlunoWorkspace;
  mode: ContratoAlunoEmissionMode;
  onModeChange: (mode: ContratoAlunoEmissionMode) => void;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  turmaId: string;
  onTurmaIdChange: (turmaId: string) => void;
  selectedEnrollmentIds: string[];
  onToggleTarget: (target: ContratoAlunoTarget) => void;
  onSelectVisible: (targets: ContratoAlunoTarget[]) => void;
  customMessage: string;
  onCustomMessageChange: (message: string) => void;
  onPrepare: () => void;
  isPreparing: boolean;
  result: ContratoAlunoPreparationResult | null;
  onPreview: (emissionId: string) => void;
}

const modeOptions: Array<{ id: ContratoAlunoEmissionMode; label: string; description: string }> = [
  { id: 'INDIVIDUAL', label: 'Individual', description: 'Um aluno por vez' },
  { id: 'LOTE', label: 'Em lote', description: 'Várias matrículas selecionadas' },
  { id: 'PERSONALIZADO', label: 'Personalizado', description: 'Mensagem complementar' },
];

const modalityLabel = (modalidade: string) => {
  if (modalidade === 'SUPERIOR') return 'Especialização';
  if (modalidade === 'LIVRE') return 'Livre';
  if (modalidade === 'TECNICO') return 'Técnico';
  return modalidade || 'Não informada';
};

const templateModalityLabel = (modalidade: string | null) => modalityLabel(modalidade || '');

const ContratosAlunoEmissionWorkspace = ({
  workspace,
  mode,
  onModeChange,
  searchTerm,
  onSearchTermChange,
  turmaId,
  onTurmaIdChange,
  selectedEnrollmentIds,
  onToggleTarget,
  onSelectVisible,
  customMessage,
  onCustomMessageChange,
  onPrepare,
  isPreparing,
  result,
  onPreview,
}: ContratosAlunoEmissionWorkspaceProps) => {
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase('pt-BR');
  const matchesTargets = workspace.targets.filter((target) => {
    const matchesTurma = turmaId === 'todas' || target.turmaId === turmaId;
    const haystack = [target.alunoNome, target.cursoNome, target.turmaNome, target.turmaCodigo, target.modalidade]
      .join(' ')
      .toLocaleLowerCase('pt-BR');
    return matchesTurma && (!normalizedSearch || haystack.includes(normalizedSearch));
  });
  const selectedSet = new Set(selectedEnrollmentIds);
  const isIndividual = mode === 'INDIVIDUAL';
  const visibleTargets = isIndividual && !normalizedSearch ? [] : matchesTargets;
  const isAllVisibleSelected = visibleTargets.length > 0
    && visibleTargets.every((target) => selectedSet.has(target.enrollmentId));
  const canPrepare = selectedEnrollmentIds.length > 0 && !isPreparing;
  const templatesAtivos = workspace.templates.filter((template) => template.status === 'ATIVO');

  return (
    <div className="space-y-5 animate-fadeIn">
      <section className="relative overflow-hidden rounded-[1.75rem] border border-blue-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-bl-[5rem] bg-blue-50" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex max-w-2xl gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#001a33] text-white shadow-lg shadow-blue-950/15">
              <FileSignature size={23} />
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600">Documento acadêmico oficial</p>
              <h3 className="mt-1 text-xl font-black tracking-tight text-[#001a33]">Contratos de aluno</h3>
              <p className="mt-1 max-w-xl text-sm font-medium leading-relaxed text-slate-500">
                Selecione matrículas elegíveis. O serviço confirma modalidade, conteúdo, QR Code, validade e arquivo oficial antes de disponibilizar a emissão.
              </p>
            </div>
          </div>
          <div className="grid min-w-[210px] gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-xs">
            <p className="font-black uppercase tracking-wide text-slate-400">Modelo por modalidade</p>
            <p className="font-bold text-[#001a33]">
              {templatesAtivos.length ? `${templatesAtivos.length} modelo(s) ativo(s)` : 'Nenhum modelo ativo'}
            </p>
            <p className="text-slate-500">
              A emissão aplica a versão canônica da modalidade de cada matrícula.
              {workspace.policy?.validadeLabel ? ` · ${workspace.policy.validadeLabel}` : ''}
            </p>
          </div>
        </div>

        <div className="relative mt-6 grid gap-2 sm:grid-cols-3">
          {modeOptions.map((option) => {
            const active = mode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onModeChange(option.id)}
                className={`rounded-2xl border px-4 py-3 text-left transition-all ${active
                  ? 'border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50'}`}
              >
                <span className="block text-xs font-black uppercase tracking-wide">{option.label}</span>
                <span className={`mt-1 block text-[11px] font-medium ${active ? 'text-blue-100' : 'text-slate-400'}`}>{option.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      {workspace.templates.length > 0 && (
        <section className="grid gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-xs sm:grid-cols-3">
          {workspace.templates.map((template) => (
            <div key={`${template.modalidade || 'geral'}:${template.versao || 'sem-versao'}`} className="rounded-xl border border-white bg-white px-3 py-2.5">
              <p className="font-black uppercase tracking-wide text-[#001a33]">{templateModalityLabel(template.modalidade)}</p>
              <p className={`mt-1 font-semibold ${template.status === 'ATIVO' ? 'text-emerald-700' : 'text-amber-700'}`}>
                {template.status === 'ATIVO' ? 'Disponível para emissão' : 'Em revisão'}
                {template.versao ? ` · v${template.versao}` : ''}
              </p>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Destinatários permitidos</p>
            <h4 className="mt-1 text-lg font-black text-[#001a33]">Seleção de matrículas</h4>
          </div>
          <p className="text-xs font-bold text-slate-500"><span className="text-blue-700">{selectedEnrollmentIds.length}</span> selecionada(s)</p>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder="Buscar por aluno, curso, turma ou código..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-medium text-[#001a33] outline-none transition-colors placeholder:text-slate-400 focus:border-blue-400 focus:bg-white"
            />
          </label>
          <label className="block">
            <span className="sr-only">Filtrar turma</span>
            <select
              value={turmaId}
              onChange={(event) => onTurmaIdChange(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-600 outline-none focus:border-blue-400"
            >
              <option value="todas">Todas as turmas</option>
              {workspace.turmas.map((turma) => (
                <option key={turma.id} value={turma.id}>{turma.nome}{turma.codigo ? ` · ${turma.codigo}` : ''}</option>
              ))}
            </select>
          </label>
        </div>

        {!isIndividual && visibleTargets.length > 0 && (
          <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-xs font-medium text-slate-500">A lista é devolvida pelo serviço já no escopo do polo atual.</p>
            <button
              type="button"
              onClick={() => onSelectVisible(visibleTargets)}
              className="text-xs font-black uppercase tracking-wide text-blue-700 hover:text-blue-900"
            >
              {isAllVisibleSelected ? 'Limpar visíveis' : 'Selecionar visíveis'}
            </button>
          </div>
        )}

        <div className="mt-4 max-h-[390px] divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-100">
          {visibleTargets.map((target) => {
            const selected = selectedSet.has(target.enrollmentId);
            const disabled = !target.elegivel || (isIndividual && !selected && selectedEnrollmentIds.length > 0);
            return (
              <label
                key={target.enrollmentId}
                className={`flex cursor-pointer gap-3 px-4 py-3.5 transition-colors ${disabled ? 'cursor-not-allowed bg-slate-50/70 opacity-60' : selected ? 'bg-blue-50/70' : 'hover:bg-slate-50'}`}
              >
                <input
                  type={isIndividual ? 'radio' : 'checkbox'}
                  name={isIndividual ? 'contrato-aluno-individual' : undefined}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => onToggleTarget(target)}
                  className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-[#001a33]">{target.alunoNome}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-500">{modalityLabel(target.modalidade)}</span>
                    {selected && <Check size={15} className="text-blue-600" aria-label="Selecionado" />}
                  </span>
                  <span className="mt-1 block text-xs font-medium text-slate-500">{target.cursoNome} · {target.turmaNome}{target.turmaCodigo ? ` (${target.turmaCodigo})` : ''}</span>
                  {(target.mensagemElegibilidade || target.statusLabel) && (
                    <span className={`mt-1 block text-[11px] font-semibold ${target.elegivel ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {target.mensagemElegibilidade || target.statusLabel}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
          {!visibleTargets.length && (
            <div className="px-5 py-12 text-center">
              <Users className="mx-auto text-slate-300" size={30} />
              <p className="mt-3 text-sm font-bold text-slate-500">
                {isIndividual && !normalizedSearch
                  ? 'Busque uma matrícula para iniciar a emissão individual.'
                  : 'Nenhuma matrícula foi localizada nesse filtro.'}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {isIndividual && !normalizedSearch
                  ? 'Digite nome, CPF, RG, curso, turma ou código.'
                  : 'Ajuste a busca ou confirme o polo e a turma.'}
              </p>
            </div>
          )}
        </div>

        {mode === 'PERSONALIZADO' && (
          <label className="mt-5 block">
            <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.12em] text-slate-500"><Info size={14} /> Mensagem personalizada</span>
            <textarea
              value={customMessage}
              onChange={(event) => onCustomMessageChange(event.target.value)}
              maxLength={1000}
              rows={4}
              placeholder="Informe a mensagem complementar que será analisada e incorporada pelo serviço, quando permitida pelo modelo."
              className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-[#001a33] outline-none transition-colors placeholder:text-slate-400 focus:border-blue-400 focus:bg-white"
            />
            <p className="mt-1 text-[11px] font-medium text-slate-400">O modelo, a redação final e a elegibilidade são sempre resolvidos pelo backend.</p>
          </label>
        )}

        <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium text-slate-500">O navegador envia somente a seleção e a mensagem. Não compõe cláusulas, QR Code ou validade.</p>
          <button
            type="button"
            disabled={!canPrepare}
            onClick={onPrepare}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-wide text-white shadow-md shadow-blue-600/20 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            {isPreparing ? <Loader2 size={16} className="animate-spin" /> : <FileSignature size={16} />}
            {isPreparing ? 'Preparando...' : 'Preparar emissão'}
          </button>
        </div>
      </section>

      {result && <ContratosAlunoPreparedResult result={result} onPreview={onPreview} />}
    </div>
  );
};

export default ContratosAlunoEmissionWorkspace;
