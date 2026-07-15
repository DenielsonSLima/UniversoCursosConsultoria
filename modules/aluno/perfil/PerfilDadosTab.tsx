import React, { useEffect, useState } from 'react';
import { AlertCircle, Mail, Phone, User } from 'lucide-react';
import { PerfilData, PerfilUpdatePayload } from './perfil.types';
import PerfilAddressSection from './PerfilAddressSection';
import PerfilPhotoCard from './PerfilPhotoCard';
import PerfilTechnicalSection from './PerfilTechnicalSection';
import { readProfileValue, usePerfilDadosForm } from './usePerfilDadosForm';

interface PerfilDadosTabProps {
  profile: PerfilData;
  saving: boolean;
  uploadingPhoto: boolean;
  technicalEnrollmentNotice?: boolean;
  onSave: React.Dispatch<PerfilUpdatePayload>;
  onPhotoUpload: (file: File) => void | Promise<void>;
}

const PerfilDadosTab: React.FC<PerfilDadosTabProps> = ({
  profile,
  saving,
  uploadingPhoto,
  technicalEnrollmentNotice = false,
  onSave,
  onPhotoUpload,
}) => {
  const [editing, setEditing] = useState(false);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const form = usePerfilDadosForm({ profile, editing, technicalEnrollmentNotice, onSave });

  useEffect(() => {
    if (technicalEnrollmentNotice) setEditing(true);
  }, [technicalEnrollmentNotice]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (form.submit()) setEditing(false);
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.8fr_2fr]">
      <PerfilPhotoCard
        profile={profile}
        uploadingPhoto={uploadingPhoto}
        pendingPhotoFile={pendingPhotoFile}
        onPendingPhotoChange={setPendingPhotoFile}
        onPhotoUpload={onPhotoUpload}
      />

      <section className="min-w-0 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6 md:rounded-[2.5rem] md:p-8">
        <div className="flex flex-col items-start gap-3 border-b border-slate-100 pb-4 min-[390px]:flex-row min-[390px]:items-center min-[390px]:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <User size={16} />
            </div>
            <h3 className="text-base font-bold uppercase tracking-tight text-[#001a33]">Dados cadastrais</h3>
          </div>

          <button
            type="button"
            onClick={() => setEditing(!editing)}
            className="min-h-11 rounded-xl bg-blue-50 px-4 text-[10px] font-bold uppercase tracking-wider text-blue-700 transition-colors hover:bg-blue-100 min-[390px]:text-xs min-[390px]:tracking-widest"
          >
            {editing ? 'Cancelar' : 'Alterar dados'}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-xs">
          {technicalEnrollmentNotice && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-amber-800">
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em]">Inscrição técnica pendente</p>
                  <p className="mt-1 text-xs font-bold leading-relaxed">
                    Para matricular-se em curso técnico com inscrição online, complete sua situação no Ensino Médio, a escola, a série atual e o ano de conclusão ou previsão.
                  </p>
                  {form.technicalMissingFields.length > 0 && (
                    <p className="mt-2 text-[11px] font-black">
                      Faltando: {form.technicalMissingFields.map((field) => field.label).join(', ')}.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Nome Completo</label>
              <p className="cursor-not-allowed break-words rounded-xl border border-transparent bg-slate-50 p-3 font-bold text-slate-800">
                {profile?.nomeCompleto || profile?.nome}
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">CPF</label>
              <p className="cursor-not-allowed break-words rounded-xl border border-transparent bg-slate-50 p-3 font-bold text-slate-800">
                {profile?.cpf || 'Não Informado'}
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">E-mail Acadêmico</label>
              <p className="flex min-w-0 items-start gap-2 rounded-xl border border-transparent bg-slate-50 p-3 font-bold text-slate-800">
                <Mail size={13} className="mt-0.5 shrink-0 text-slate-400" />
                <span className="min-w-0 break-all">{profile?.email || 'Sem e-mail'}</span>
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Telefone celular</label>
              {editing ? (
                <input value={form.telefone} onChange={(event) => form.setTelefone(event.target.value)} inputMode="tel" autoComplete="tel" className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-bold text-slate-700 outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100" />
              ) : (
                <p className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/50 p-3 font-bold text-slate-850">
                  <Phone size={13} className="text-slate-400" />
                  {readProfileValue(profile?.telefone, 'Não Informado')}
                </p>
              )}
            </div>
          </div>

          <PerfilAddressSection profile={profile} editing={editing} form={form} />
          <PerfilTechnicalSection editing={editing} form={form} />

          {editing && (
            <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setEditing(false)} className="min-h-12 w-full rounded-xl bg-slate-100 px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-650 transition-all hover:bg-slate-250 sm:w-auto">
                Voltar
              </button>
              <button type="submit" disabled={saving} className="min-h-12 w-full rounded-xl bg-[#001a33] px-5 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-md transition-all hover:bg-blue-900 disabled:opacity-50 sm:w-auto">
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          )}
        </form>
      </section>
    </div>
  );
};

export default PerfilDadosTab;
