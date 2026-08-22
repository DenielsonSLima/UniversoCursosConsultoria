import React from 'react';
import {
  CheckCircle2,
  FilePlus2,
  Loader2,
  RefreshCw,
  Search,
  UsersRound,
  X,
} from 'lucide-react';
import type { ResponsaveisTabActions } from '../hooks/useResponsaveisTabActions';
import { RESPONSAVEL_FIELD_CLASS_NAME } from '../responsaveis-tab.helpers';

interface ResponsaveisToolbarProps {
  hasListAccess: boolean;
  canManageGlobal: boolean;
  canCreate: boolean;
  busca: string;
  onBuscaChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  onRefresh: () => void;
  creation: ResponsaveisTabActions['creation'];
}

const ResponsaveisToolbar: React.FC<ResponsaveisToolbarProps> = ({
  hasListAccess,
  canManageGlobal,
  canCreate,
  busca,
  onBuscaChange,
  status,
  onStatusChange,
  onRefresh,
  creation,
}) => (
  <>
    <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:flex-row xl:items-end xl:justify-between">
      <div>
        <div className="flex items-center gap-2 text-blue-700">
          <UsersRound size={20} />
          <p className="text-[10px] font-black uppercase tracking-[0.18em]">Parceiros</p>
        </div>
        <h2 className="mt-1 text-2xl font-black text-[#001a33]">Responsáveis legais</h2>
        <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-slate-500">
          Cadastre, vincule e acompanhe a situação do responsável. Elegibilidade, permissões e acesso sempre vêm do serviço autorizado.
        </p>
        {hasListAccess ? (
          <p className={`mt-2 text-[10px] font-black uppercase tracking-wide ${canManageGlobal ? 'text-emerald-700' : 'text-slate-500'}`}>
            {canManageGlobal
              ? 'Escopo global confirmado pelo serviço'
              : 'Escopo local confirmado pelo serviço'}
          </p>
        ) : null}
      </div>
      {canCreate ? (
        <button
          type="button"
          onClick={() => creation.setVisible(true)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 text-xs font-black text-white shadow-lg shadow-blue-900/15 transition hover:bg-blue-700"
        >
          <FilePlus2 size={16} /> Novo responsável
        </button>
      ) : null}
    </div>

    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row">
      <label className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input
          value={busca}
          onChange={(event) => onBuscaChange(event.target.value)}
          placeholder="Buscar por nome, CPF ou e-mail"
          className="h-10 w-full rounded-xl border border-slate-200 pl-10 pr-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
      </label>
      <select
        value={status}
        onChange={(event) => onStatusChange(event.target.value)}
        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
      >
        <option value="todos">Todos os status</option>
        <option value="ATIVO">Ativos</option>
        <option value="INATIVO">Inativos</option>
      </select>
      <button
        type="button"
        onClick={onRefresh}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-[10px] font-black uppercase tracking-wide text-slate-600 hover:bg-slate-50"
      >
        <RefreshCw size={14} /> Atualizar
      </button>
    </div>

    {creation.isVisible && canCreate ? (
      <form onSubmit={creation.submit} className="rounded-3xl border border-blue-100 bg-blue-50/40 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-black text-[#001a33]">Novo responsável</h3>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Somente o nome é obrigatório. Este passo cria um cadastro pendente; não prepara acesso.
            </p>
          </div>
          <button
            type="button"
            onClick={() => creation.setVisible(false)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"
            aria-label="Fechar cadastro"
          >
            <X size={17} />
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-bold text-slate-600">
            Nome *
            <input
              required
              value={creation.nome}
              onChange={(event) => creation.setNome(event.target.value)}
              className={RESPONSAVEL_FIELD_CLASS_NAME}
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            CPF
            <input
              value={creation.cpf}
              onChange={(event) => creation.setCpf(event.target.value)}
              className={RESPONSAVEL_FIELD_CLASS_NAME}
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            E-mail
            <input
              type="email"
              value={creation.email}
              onChange={(event) => creation.setEmail(event.target.value)}
              className={RESPONSAVEL_FIELD_CLASS_NAME}
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Telefone
            <input
              value={creation.telefone}
              onChange={(event) => creation.setTelefone(event.target.value)}
              className={RESPONSAVEL_FIELD_CLASS_NAME}
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={creation.isPending}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60"
          >
            {creation.isPending
              ? <Loader2 className="animate-spin" size={15} />
              : <CheckCircle2 size={15} />}
            Salvar responsável
          </button>
        </div>
      </form>
    ) : null}
  </>
);

export default ResponsaveisToolbar;
