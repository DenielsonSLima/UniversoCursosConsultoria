import React from 'react';
import { Check, Image as ImageIcon, Loader2, Upload, X } from 'lucide-react';

interface DiarioImageUploaderProps {
  title: string;
  description: string;
  imageUrl: string | null;
  usingDefault?: boolean;
  loading: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

const DiarioImageUploader: React.FC<DiarioImageUploaderProps> = ({
  title,
  description,
  imageUrl,
  usingDefault,
  loading,
  onSelect,
  onRemove,
}) => (
  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="relative aspect-[1.414/1] overflow-hidden bg-slate-100 flex items-center justify-center">
      {imageUrl ? (
        <img src={imageUrl} alt={title} className="h-full w-full object-contain bg-white text-[10px] text-slate-400" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center text-slate-400">
          <ImageIcon size={38} />
          <span className="mt-2 text-xs font-bold">Nenhuma imagem enviada</span>
        </div>
      )}
      {usingDefault && (
        <span className="absolute left-3 top-3 rounded-full bg-[#001a33]/90 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-white">
          Capa padrão do sistema
        </span>
      )}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#001a33]/70 text-white">
          <Loader2 className="animate-spin" />
        </div>
      )}
    </div>
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-t border-slate-100">
      <div className="min-w-0">
        <p className="text-xs font-black text-[#001a33] truncate">{title}</p>
        <p className="text-[10px] text-slate-500 truncate">{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {imageUrl && !usingDefault && (
          <button type="button" onClick={onRemove} className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:border-red-200 hover:text-red-500 transition-colors" title="Remover">
            <X size={16} />
          </button>
        )}
        <button type="button" onClick={onSelect} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white hover:bg-blue-700 transition-colors">
          {imageUrl ? <Check size={14} /> : <Upload size={14} />}
          <span>{imageUrl && !usingDefault ? 'Substituir' : 'Enviar'}</span>
        </button>
      </div>
    </div>
  </div>
);

export default DiarioImageUploader;
