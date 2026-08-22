import React from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import type { ResponsaveisTabActions } from '../hooks/useResponsaveisTabActions';
import { RESPONSAVEL_FIELD_CLASS_NAME } from '../responsaveis-tab.helpers';

interface ResponsavelEditFormProps {
  editing: ResponsaveisTabActions['editing'];
}

const ResponsavelEditForm: React.FC<ResponsavelEditFormProps> = ({ editing }) => {
  if (!editing.isVisible) return null;

  return (
    <form onSubmit={editing.submit} className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black text-[#001a33]">Editar dados do responsável</p>
        <button
          type="button"
          onClick={() => editing.setVisible(false)}
          className="text-[10px] font-black uppercase tracking-wide text-slate-500 hover:text-slate-800"
        >
          Cancelar
        </button>
      </div>
      <div className="mt-3 grid gap-2">
        <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">
          Nome *
          <input
            required
            value={editing.nome}
            onChange={(event) => editing.setNome(event.target.value)}
            className={RESPONSAVEL_FIELD_CLASS_NAME}
          />
        </label>
        <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">
          CPF
          <input
            value={editing.cpf}
            onChange={(event) => editing.setCpf(event.target.value)}
            className={RESPONSAVEL_FIELD_CLASS_NAME}
          />
        </label>
        <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">
          E-mail
          <input
            type="email"
            value={editing.email}
            onChange={(event) => editing.setEmail(event.target.value)}
            className={RESPONSAVEL_FIELD_CLASS_NAME}
          />
        </label>
        <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">
          Telefone
          <input
            value={editing.telefone}
            onChange={(event) => editing.setTelefone(event.target.value)}
            className={RESPONSAVEL_FIELD_CLASS_NAME}
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={editing.isPending}
        className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-black text-white disabled:opacity-60"
      >
        {editing.isPending
          ? <Loader2 className="animate-spin" size={15} />
          : <CheckCircle2 size={15} />}
        Salvar alterações
      </button>
    </form>
  );
};

export default ResponsavelEditForm;
