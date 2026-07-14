import React from 'react';
import { Camera, Upload, User } from 'lucide-react';
import ProfilePhotoAdjustModal from '../../shared/components/ProfilePhotoAdjustModal';
import { PerfilData } from './perfil.types';

type Props = {
  profile: PerfilData;
  uploadingPhoto: boolean;
  pendingPhotoFile: File | null;
  onPendingPhotoChange: (file: File | null) => void;
  onPhotoUpload: (file: File) => void | Promise<void>;
};

const PerfilPhotoCard: React.FC<Props> = ({
  profile,
  uploadingPhoto,
  pendingPhotoFile,
  onPendingPhotoChange,
  onPhotoUpload,
}) => (
  <>
    {pendingPhotoFile && (
      <ProfilePhotoAdjustModal
        file={pendingPhotoFile}
        isProcessing={uploadingPhoto}
        onCancel={() => onPendingPhotoChange(null)}
        onConfirm={async (file) => {
          await onPhotoUpload(file);
          onPendingPhotoChange(null);
        }}
      />
    )}

    <aside className="space-y-4">
      <div className="rounded-[2.5rem] border border-blue-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Camera size={16} />
          </div>
          <h3 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Foto de perfil</h3>
        </div>

        <div className="mt-5 flex flex-col items-center text-center">
          <div className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-[2rem] border border-slate-100 bg-slate-50 text-blue-600 shadow-inner">
            {profile?.foto ? (
              <img src={profile.foto} alt="Foto de perfil do aluno" className="h-full w-full object-cover" />
            ) : (
              <User size={44} />
            )}
          </div>
          <p className="mt-4 text-[11px] font-semibold leading-relaxed text-slate-500">
            Envie uma foto nítida, recente e bem iluminada. Ela pode ser usada na impressão de ficha de matrícula, carteirinha, crachá e outros documentos acadêmicos.
          </p>
          <label className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-blue-700">
            <Upload size={14} />
            {uploadingPhoto ? 'Enviando foto...' : 'Enviar foto'}
            <input
              type="file"
              accept="image/*"
              disabled={uploadingPhoto}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) onPendingPhotoChange(file);
              }}
            />
          </label>
        </div>
      </div>
    </aside>
  </>
);

export default PerfilPhotoCard;
