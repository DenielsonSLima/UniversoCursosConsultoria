import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { pushNotificationService } from './notificacoes-push.service';
import type { PushImageAsset } from './notificacoes-push.types';

type Props = {
  purpose: PushImageAsset['purpose'];
  value: PushImageAsset | null;
  onChange: (asset: PushImageAsset | null) => void;
  disabled?: boolean;
  compact?: boolean;
};

const messageFromError = (error: unknown) => error instanceof Error
  ? error.message
  : 'Não foi possível preparar a imagem.';

const PushImagePicker = ({ purpose, value, onChange, disabled = false, compact = false }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Use uma imagem JPG ou PNG.');
      return;
    }
    if (file.size > 1024 * 1024) {
      setError('A imagem deve ter no máximo 1 MB.');
      return;
    }

    setUploading(true);
    try {
      onChange(await pushNotificationService.uploadImage(file, purpose));
    } catch (uploadError) {
      setError(messageFromError(uploadError));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,.jpg,.jpeg,.png"
        className="sr-only"
        disabled={disabled || uploading}
        onChange={(event) => void selectFile(event.target.files?.[0])}
      />
      {value ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
          <img
            src={value.publicUrl}
            alt="Prévia da imagem da notificação"
            className={`${compact ? 'h-28' : 'h-44'} w-full object-cover`}
          />
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-black text-slate-700">
                {value.width > 0 && value.height > 0
                  ? `${value.width} × ${value.height} · ${Math.ceil(value.sizeBytes / 1024)} KB`
                  : 'Imagem padrão configurada'}
              </p>
              <p className="text-[10px] font-semibold text-emerald-600">Imagem validada e pronta</p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={disabled || uploading}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-blue-700 ring-1 ring-slate-200 disabled:opacity-50"
                aria-label="Trocar imagem"
              >
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
              </button>
              <button
                type="button"
                onClick={() => onChange(null)}
                disabled={disabled || uploading}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-rose-600 ring-1 ring-slate-200 disabled:opacity-50"
                aria-label="Remover imagem"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          className={`flex w-full items-center justify-center gap-3 rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 px-4 text-left text-blue-800 transition hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 ${compact ? 'min-h-24' : 'min-h-32'}`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
            {uploading ? <Loader2 size={19} className="animate-spin" /> : <ImagePlus size={19} />}
          </span>
          <span>
            <span className="block text-xs font-black">{uploading ? 'Validando imagem…' : 'Adicionar imagem'}</span>
            <span className="mt-1 block text-[10px] font-semibold text-blue-700/70">JPG ou PNG · até 1 MB</span>
          </span>
        </button>
      )}
      {error ? <p className="text-xs font-bold leading-5 text-rose-600">{error}</p> : null}
    </div>
  );
};

export default PushImagePicker;
