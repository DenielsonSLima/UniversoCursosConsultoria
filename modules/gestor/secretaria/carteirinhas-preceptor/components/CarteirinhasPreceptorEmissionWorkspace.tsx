import { Check, CreditCard, Info, Loader2, Search, UsersRound } from 'lucide-react';
import CarteirinhasPreceptorPreparedResult from './CarteirinhasPreceptorPreparedResult';
import type {
  CarteirinhaPreceptorEmissionMode,
  CarteirinhaPreceptorPreparationResult,
  CarteirinhaPreceptorTarget,
  CarteirinhasPreceptorWorkspace,
} from '../types/carteirinhas-preceptor.types';

interface CarteirinhasPreceptorEmissionWorkspaceProps {
  workspace: CarteirinhasPreceptorWorkspace;
  mode: CarteirinhaPreceptorEmissionMode;
  onModeChange: (mode: CarteirinhaPreceptorEmissionMode) => void;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  selectedProfessorIds: string[];
  onToggleTarget: (target: CarteirinhaPreceptorTarget) => void;
  onSelectVisible: (targets: CarteirinhaPreceptorTarget[]) => void;
  customMessage: string;
  onCustomMessageChange: (message: string) => void;
  onPrepare: () => void;
  isPreparing: boolean;
  result: CarteirinhaPreceptorPreparationResult | null;
  onPreview: (emissionId: string) => void;
}

const modeOptions: Array<{ id: CarteirinhaPreceptorEmissionMode; label: string; description: string }> = [
  { id: 'INDIVIDUAL', label: 'Individual', description: 'Um professor por vez' },
  { id: 'LOTE', label: 'Em lote', description: 'Professores selecionados' },
  { id: 'PERSONALIZADO', label: 'Personalizado', description: 'Mensagem complementar' },
];

const CarteirinhasPreceptorEmissionWorkspace = ({
  workspace,
  mode,
  onModeChange,
  searchTerm,
  onSearchTermChange,
  selectedProfessorIds,
  onToggleTarget,
  onSelectVisible,
  customMessage,
  onCustomMessageChange,
  onPrepare,
  isPreparing,
  result,
  onPreview,
}: CarteirinhasPreceptorEmissionWorkspaceProps) => {
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase('pt-BR');
  const visibleTargets = workspace.targets.filter((target) => {
    const haystack = [target.professorNome, target.cargo, target.areaAtuacao, target.statusLabel]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('pt-BR');
    return !normalizedSearch || haystack.includes(normalizedSearch);
  });
  const selectedSet = new Set(selectedProfessorIds);
  const isAllVisibleSelected = visibleTargets.length > 0
    && visibleTargets.every((target) => selectedSet.has(target.professorId));
  const isIndividual = mode === 'INDIVIDUAL';
  const templateActive = workspace.template?.status === 'ATIVO';
  const canPrepare = selectedProfessorIds.length > 0 && templateActive && !isPreparing;

  return (
    <div className="space-y-5 animate-fadeIn">
      <section className="relative overflow-hidden rounded-[1.75rem] border border-violet-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-bl-[5rem] bg-violet-50" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex max-w-2xl gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-700 text-white shadow-lg shadow-violet-950/15">
              <CreditCard size={23} />
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-700">Identificação profissional</p>
              <h3 className="mt-1 text-xl font-black tracking-tight text-[#001a33]">Carteirinhas de preceptor</h3>
              <p className="mt-1 max-w-xl text-sm font-medium leading-relaxed text-slate-500">
                A lista vem exclusivamente dos professores ativos vinculados ao polo. O backend confirma o vínculo, QR Code, validade e documento oficial.
              </p>
            </div>
          </div>
          <div className="grid min-w-[210px] gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-xs">
            <p className="font-black uppercase tracking-wide text-slate-400">Modelo aplicado</p>
            <p className="font-bold text-[#001a33]">{workspace.template?.nome || 'Modelo ainda não informado'}</p>
            <p className="text-slate-500">
              {workspace.template?.versao ? `Versão ${workspace.template.versao}` : 'Versão canônica do servidor'}
              {workspace.policy?.validadeLabel ? ` · ${workspace.policy.validadeLabel}` : ''}
            </p>
            {!templateActive && <p className="font-bold text-amber-700">Modelo em revisão: emissão bloqueada pelo servidor.</p>}
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
                  ? 'border-violet-700 bg-violet-700 text-white shadow-md shadow-violet-700/20'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:bg-violet-50'}`}
              >
                <span className="block text-xs font-black uppercase tracking-wide">{option.label}</span>
                <span className={`mt-1 block text-[11px] font-medium ${active ? 'text-violet-100' : 'text-slate-400'}`}>{option.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Professores ativos no polo</p>
            <h4 className="mt-1 text-lg font-black text-[#001a33]">Seleção de preceptores</h4>
          </div>
          <p className="text-xs font-bold text-slate-500"><span className="text-violet-700">{selectedProfessorIds.length}</span> selecionado(s)</p>
        </div>

        <label className="relative mt-5 block">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
          <input
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="Buscar por nome, função ou área de atuação..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-medium text-[#001a33] outline-none transition-colors placeholder:text-slate-400 focus:border-violet-400 focus:bg-white"
          />
        </label>

        {!isIndividual && visibleTargets.length > 0 && (
          <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-xs font-medium text-slate-500">Não há consulta direta de parceiros ou matrículas nesta tela.</p>
            <button
              type="button"
              onClick={() => onSelectVisible(visibleTargets)}
              className="text-xs font-black uppercase tracking-wide text-violet-700 hover:text-violet-900"
            >
              {isAllVisibleSelected ? 'Limpar visíveis' : 'Selecionar visíveis'}
            </button>
          </div>
        )}

        <div className="mt-4 max-h-[390px] divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-100">
          {visibleTargets.map((target) => {
            const selected = selectedSet.has(target.professorId);
            const disabled = !target.elegivel || (isIndividual && !selected && selectedProfessorIds.length > 0);
            return (
              <label
                key={target.professorId}
                className={`flex cursor-pointer gap-3 px-4 py-3.5 transition-colors ${disabled ? 'cursor-not-allowed bg-slate-50/70 opacity-60' : selected ? 'bg-violet-50/70' : 'hover:bg-slate-50'}`}
              >
                <input
                  type={isIndividual ? 'radio' : 'checkbox'}
                  name={isIndividual ? 'carteirinha-preceptor-individual' : undefined}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => onToggleTarget(target)}
                  className="mt-1 h-4 w-4 shrink-0 accent-violet-700"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-[#001a33]">{target.professorNome}</span>
                    {selected && <Check size={15} className="text-violet-700" aria-label="Selecionado" />}
                  </span>
                  <span className="mt-1 block text-xs font-medium text-slate-500">
                    {[target.cargo, target.areaAtuacao].filter(Boolean).join(' · ') || 'Professor ativo do polo'}
                  </span>
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
              <UsersRound className="mx-auto text-slate-300" size={30} />
              <p className="mt-3 text-sm font-bold text-slate-500">Nenhum professor foi localizado.</p>
              <p className="mt-1 text-xs text-slate-400">Confira a busca ou o vínculo ativo do professor neste polo.</p>
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
              className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-[#001a33] outline-none transition-colors placeholder:text-slate-400 focus:border-violet-400 focus:bg-white"
            />
            <p className="mt-1 text-[11px] font-medium text-slate-400">O backend mantém a autoria, o QR Code, a validade e o layout oficial.</p>
          </label>
        )}

        <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium text-slate-500">O navegador envia seleção e mensagem, sem criar condição de validade ou regra de elegibilidade.</p>
          <button
            type="button"
            disabled={!canPrepare}
            onClick={onPrepare}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-xs font-black uppercase tracking-wide text-white shadow-md shadow-violet-700/20 transition-colors hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            {isPreparing ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
            {isPreparing ? 'Preparando...' : 'Preparar emissão'}
          </button>
        </div>
      </section>

      {result && <CarteirinhasPreceptorPreparedResult result={result} onPreview={onPreview} />}
    </div>
  );
};

export default CarteirinhasPreceptorEmissionWorkspace;
