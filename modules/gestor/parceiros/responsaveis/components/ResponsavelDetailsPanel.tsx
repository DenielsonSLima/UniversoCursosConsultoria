import React from 'react';
import {
  Loader2,
  Pencil,
  RefreshCw,
  UserRound,
  X,
} from 'lucide-react';
import type {
  ResponsavelAlunoOption,
  ResponsavelLegalDetalhe,
  ResponsaveisLegaisScope,
} from '../responsaveis.contract';
import type { ResponsaveisTabActions } from '../hooks/useResponsaveisTabActions';
import type { ToastApi } from '../responsaveis-tab.types';
import ResponsavelAccessCard from './ResponsavelAccessCard';
import ResponsavelEditForm from './ResponsavelEditForm';
import ResponsavelIdentitySection from './ResponsavelIdentitySection';
import ResponsavelLinksSection from './ResponsavelLinksSection';

interface ResponsavelDetailsPanelProps {
  selectedId: string | null;
  selected: ResponsavelLegalDetalhe | null;
  scope: ResponsaveisLegaisScope;
  detailPending: boolean;
  detailError: boolean;
  onRetryDetail: () => void;
  alunos: readonly ResponsavelAlunoOption[];
  alunosPending: boolean;
  alunosError: boolean;
  onRetryAlunos: () => void;
  canRegisterVerification: boolean;
  hasVerificationFields: boolean;
  actions: ResponsaveisTabActions;
  toast: ToastApi;
}

const ResponsavelDetailsPanel: React.FC<ResponsavelDetailsPanelProps> = ({
  selectedId,
  selected,
  scope,
  detailPending,
  detailError,
  onRetryDetail,
  alunos,
  alunosPending,
  alunosError,
  onRetryAlunos,
  canRegisterVerification,
  hasVerificationFields,
  actions,
  toast,
}) => (
  <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    {!selectedId ? (
      <div className="flex min-h-60 flex-col items-center justify-center text-center">
        <UserRound size={27} className="text-slate-400" />
        <p className="mt-3 text-sm font-black text-[#001a33]">Selecione um responsável</p>
        <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
          Os detalhes, vínculos e a situação de acesso aparecem aqui.
        </p>
      </div>
    ) : detailPending ? (
      <div className="flex min-h-60 items-center justify-center gap-3 text-sm font-bold text-slate-500">
        <Loader2 size={20} className="animate-spin text-blue-600" /> Carregando detalhes…
      </div>
    ) : detailError || !selected ? (
      <div className="min-h-60">
        <p className="text-sm font-black text-rose-700">Não foi possível carregar este responsável.</p>
        <button
          type="button"
          onClick={onRetryDetail}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700"
        >
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    ) : (
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600">Responsável legal</p>
            <h3 className="mt-1 text-lg font-black text-[#001a33]">{selected.nome}</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {selected.email || 'E-mail não informado'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => actions.editing.begin(selected)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2 text-[10px] font-black uppercase tracking-wide text-slate-600 hover:bg-slate-50"
            >
              <Pencil size={13} /> Editar
            </button>
            <button
              type="button"
              onClick={actions.closeDetails}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50"
              aria-label="Fechar detalhes"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        <ResponsavelEditForm editing={actions.editing} />

        <dl className="mt-5 grid gap-2 text-xs">
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">Situação</dt>
            <dd className="mt-1 font-bold text-slate-700">{selected.status}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">Identidade</dt>
            <dd className="mt-1 font-bold text-slate-700">
              {selected.identidadeVerificada
                ? 'Verificação registrada pelo serviço'
                : 'Pendente de verificação'}
            </dd>
          </div>
        </dl>

        <ResponsavelIdentitySection
          canRegisterVerification={canRegisterVerification}
          hasVerificationFields={hasVerificationFields}
          verification={actions.identityVerification}
        />

        <ResponsavelLinksSection
          vinculos={selected.vinculos}
          alunos={alunos}
          alunosPending={alunosPending}
          alunosError={alunosError}
          onRetryAlunos={onRetryAlunos}
          canRegisterVerification={canRegisterVerification}
          linking={actions.linking}
        />

        <ResponsavelAccessCard
          key={selected.id}
          responsavel={selected}
          scope={scope}
          toast={toast}
        />
      </div>
    )}
  </aside>
);

export default ResponsavelDetailsPanel;
