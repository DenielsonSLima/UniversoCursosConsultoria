import { Camera, ShieldCheck, Upload, User } from 'lucide-react';

import type { PerfilData } from '../../perfil.types';

type AlunoMobileProfilePhotoCardProps = {
  profile: PerfilData;
  uploadingPhoto: boolean;
  onFileSelected: (file: File) => void;
};

const AlunoMobileProfilePhotoCard = ({
  profile,
  uploadingPhoto,
  onFileSelected,
}: AlunoMobileProfilePhotoCardProps) => (
  <section className="relative overflow-hidden rounded-[1.75rem] bg-[#001f3f] p-4 text-white shadow-[0_18px_44px_-28px_rgba(0,31,63,0.85)] md:hidden">
    <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full border-[24px] border-blue-500/15" />

    <div className="relative flex items-start gap-4">
      <div className="flex aspect-[3/4] w-[5.5rem] shrink-0 items-center justify-center overflow-hidden rounded-[1.35rem] border border-white/15 bg-white/10 text-blue-200 shadow-lg">
        {profile?.foto ? (
          <img src={profile.foto} alt="Foto de perfil do aluno" className="h-full w-full object-cover" />
        ) : (
          <User size={32} />
        )}
      </div>

      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-center gap-2 text-blue-200">
          <Camera size={14} aria-hidden="true" />
          <p className="text-[10px] font-black uppercase tracking-[0.18em]">Foto acadêmica</p>
        </div>
        <h2 className="mt-2 line-clamp-2 text-base font-black leading-snug">
          {profile?.nomeCompleto || profile?.nome || 'Aluno Universo'}
        </h2>
        <p className="mt-1 truncate text-[11px] font-medium text-slate-300">{profile?.email || 'E-mail não informado'}</p>

        <label className="mt-3 flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 text-[10px] font-black uppercase tracking-[0.14em] text-white active:bg-blue-500 focus-within:ring-2 focus-within:ring-blue-300">
          <Upload size={14} />
          {uploadingPhoto ? 'Enviando...' : profile?.foto ? 'Alterar foto' : 'Enviar foto'}
          <input
            type="file"
            accept="image/*"
            disabled={uploadingPhoto}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) onFileSelected(file);
            }}
          />
        </label>
      </div>
    </div>

    <div role="note" className="relative mt-4 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.07] p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300">
        <ShieldCheck size={17} aria-hidden="true" />
      </span>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-amber-200">Padrão oficial 3×4</p>
        <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-300">Use uma foto recente, de frente, nítida e sem filtros.</p>
      </div>
    </div>
  </section>
);

export default AlunoMobileProfilePhotoCard;
