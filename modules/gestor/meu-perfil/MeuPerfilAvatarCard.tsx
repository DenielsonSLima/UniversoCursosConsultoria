import React from 'react';
import { Camera, Loader2, Trash2, Upload, UserRound } from 'lucide-react';
import ProfilePhotoAdjustModal from '../../shared/components/ProfilePhotoAdjustModal';

interface MeuPerfilAvatarCardProps {
  name: string;
  avatarUrl: string | null;
  isUploading: boolean;
  isRemoving: boolean;
  disabled?: boolean;
  onUpload: (file: File) => void | Promise<void>;
  onRemove: () => void | Promise<void>;
}

const MeuPerfilAvatarCard: React.FC<MeuPerfilAvatarCardProps> = ({
  name,
  avatarUrl,
  isUploading,
  isRemoving,
  disabled = false,
  onUpload,
  onRemove,
}) => {
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'UN';

  return (
    <>
      {pendingFile ? (
        <ProfilePhotoAdjustModal
          file={pendingFile}
          isProcessing={isUploading}
          onCancel={() => setPendingFile(null)}
          onConfirm={async (adjustedFile) => {
            await onUpload(adjustedFile);
            setPendingFile(null);
          }}
        />
      ) : null}

      <aside className="overflow-hidden rounded-[2rem] border border-blue-100 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-[#001a33] via-[#073b66] to-blue-600 px-6 pb-16 pt-6 text-white">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-blue-100">
            <Camera size={15} />
            Foto de perfil
          </div>
          <p className="mt-2 max-w-xs text-xs font-semibold leading-relaxed text-blue-100/85">
            Use uma foto recente e nítida. Ela aparece na identificação do seu acesso.
          </p>
        </div>

        <div className="-mt-11 px-6 pb-6">
          <div className="mx-auto aspect-[3/4] w-32 overflow-hidden rounded-3xl border-4 border-white bg-slate-100 shadow-xl">
            {avatarUrl ? (
              <img src={avatarUrl} alt={`Foto de perfil de ${name}`} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center bg-blue-50 text-blue-700">
                <UserRound size={34} />
                <span className="mt-2 text-lg font-black tracking-tight">{initials}</span>
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-2">
            <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-blue-700 focus-within:ring-2 focus-within:ring-blue-600 focus-within:ring-offset-2">
              {isUploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              {isUploading ? 'Enviando...' : avatarUrl ? 'Alterar foto' : 'Enviar foto'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={disabled || isUploading || isRemoving}
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  event.target.value = '';
                  if (file) setPendingFile(file);
                }}
              />
            </label>

            {avatarUrl ? (
              <button
                type="button"
                onClick={() => { void onRemove(); }}
                disabled={disabled || isUploading || isRemoving}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRemoving ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                {isRemoving ? 'Removendo...' : 'Remover foto'}
              </button>
            ) : null}
          </div>

          <p className="mt-4 text-center text-[10px] font-semibold leading-relaxed text-slate-400">
            JPG, PNG ou WEBP, até 5 MB. A imagem fica armazenada de forma privada.
          </p>
        </div>
      </aside>
    </>
  );
};

export default MeuPerfilAvatarCard;
