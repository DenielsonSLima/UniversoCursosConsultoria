import React from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { PerfilData } from './perfil.types';
import { type PerfilDadosForm, readProfileValue } from './usePerfilDadosForm';

type Props = {
  profile: PerfilData;
  editing: boolean;
  form: PerfilDadosForm;
};

const PerfilAddressSection: React.FC<Props> = ({ profile, editing, form }) => {
  const resolved = form.cepStatus === 'resolved';
  const editableInputClassName = 'w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-bold text-slate-700 outline-none transition-all focus:border-blue-500 focus:bg-white';
  const readOnlyClassName = 'truncate rounded-xl border border-slate-100 bg-slate-50/50 p-3 font-bold text-slate-850';

  return (
    <div className="border-t border-slate-100 pt-4">
      <h4 className="mb-4 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#001a33]">
        <MapPin size={14} className="text-blue-500" /> Endereço residencial
      </h4>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">CEP</label>
          {editing ? (
            <div className="relative">
              <input
                name="postal-code"
                autoComplete="postal-code"
                inputMode="numeric"
                maxLength={9}
                value={form.cep}
                onChange={form.handleCepChange}
                placeholder="00000-000"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 pr-10 font-bold text-slate-700 outline-none transition-all focus:border-blue-500 focus:bg-white"
              />
              {form.cepStatus === 'loading' && <Loader2 size={15} className="absolute right-3 top-3.5 animate-spin text-blue-500" />}
            </div>
          ) : (
            <p className={readOnlyClassName}>{readProfileValue(profile?.cep)}</p>
          )}
        </div>

        <div className="space-y-1 sm:col-span-2">
          <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Endereço</label>
          {editing ? (
            <input value={form.endereco} onChange={form.updateUppercase(form.setEndereco)} autoComplete="street-address" className={editableInputClassName} />
          ) : (
            <p className={readOnlyClassName}>{readProfileValue(profile?.endereco)}</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Número</label>
          {editing ? (
            <input value={form.numero} onChange={form.updateUppercase(form.setNumero)} className={editableInputClassName} />
          ) : (
            <p className={readOnlyClassName}>{readProfileValue(profile?.numero, 'S/N')}</p>
          )}
        </div>

        <div className="space-y-1 sm:col-span-2">
          <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Complemento</label>
          {editing ? (
            <input value={form.complemento} onChange={form.updateUppercase(form.setComplemento)} placeholder="APTO, BLOCO, PONTO DE REFERÊNCIA..." className={editableInputClassName} />
          ) : (
            <p className={readOnlyClassName}>{readProfileValue(profile?.complemento)}</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Bairro</label>
          {editing ? (
            <input value={form.bairro} onChange={form.updateUppercase(form.setBairro)} autoComplete="address-level3" className={editableInputClassName} />
          ) : (
            <p className={readOnlyClassName}>{readProfileValue(profile?.bairro)}</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Cidade</label>
          {editing ? (
            <input
              value={form.cidade}
              onChange={form.updateUppercase(form.setCidade)}
              readOnly={resolved}
              autoComplete="address-level2"
              className={`w-full rounded-xl border p-3 font-bold outline-none transition-all ${resolved ? 'cursor-not-allowed border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-700 focus:border-blue-500 focus:bg-white'}`}
            />
          ) : (
            <p className={readOnlyClassName}>{readProfileValue(profile?.cidade)}</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">UF</label>
          {editing ? (
            <input
              maxLength={2}
              value={form.uf}
              onChange={form.updateUppercase(form.setUf)}
              readOnly={resolved}
              autoComplete="address-level1"
              className={`w-full rounded-xl border p-3 text-center font-bold outline-none transition-all ${resolved ? 'cursor-not-allowed border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-700 focus:border-blue-500 focus:bg-white'}`}
            />
          ) : (
            <p className={`${readOnlyClassName} text-center`}>{readProfileValue(profile?.uf)}</p>
          )}
        </div>

        {editing && form.cepStatus !== 'idle' && (
          <p className={`text-[10px] font-bold sm:col-span-3 ${resolved ? 'text-emerald-600' : form.cepStatus === 'loading' ? 'text-blue-600' : 'text-amber-600'}`}>
            {resolved && 'CEP localizado. Cidade e UF foram preenchidas e bloqueadas.'}
            {form.cepStatus === 'loading' && 'Consultando CEP...'}
            {form.cepStatus === 'not-found' && 'CEP não encontrado. Confira o número; cidade e UF continuam liberadas.'}
            {form.cepStatus === 'error' && 'Não foi possível consultar o CEP agora. Cidade e UF continuam liberadas.'}
          </p>
        )}
      </div>
    </div>
  );
};

export default PerfilAddressSection;
