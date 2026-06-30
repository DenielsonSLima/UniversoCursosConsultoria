import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Move, RotateCcw, Upload, X, ZoomIn } from 'lucide-react';

interface ProfilePhotoAdjustModalProps {
  file: File;
  isProcessing?: boolean;
  onCancel: () => void;
  onConfirm: (file: File) => void | Promise<void>;
}

const outputSize = 720;

const ProfilePhotoAdjustModal: React.FC<ProfilePhotoAdjustModalProps> = ({
  file,
  isProcessing = false,
  onCancel,
  onConfirm,
}) => {
  const [zoom, setZoom] = useState(1.15);
  const [positionX, setPositionX] = useState(50);
  const [positionY, setPositionY] = useState(50);
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [file]);

  const previewStyle = useMemo(() => ({
    objectFit: 'cover' as const,
    objectPosition: `${positionX}% ${positionY}%`,
    transform: `scale(${zoom})`,
    transformOrigin: `${positionX}% ${positionY}%`,
  }), [positionX, positionY, zoom]);

  const reset = () => {
    setZoom(1.15);
    setPositionX(50);
    setPositionY(50);
  };

  const buildAdjustedFile = async () => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = previewUrl;

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Não foi possível carregar a imagem para ajuste.'));
    });

    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar o editor de foto.');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, outputSize, outputSize);

    const baseScale = Math.max(outputSize / image.naturalWidth, outputSize / image.naturalHeight);
    const scale = baseScale * zoom;
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const maxOffsetX = Math.max(0, drawWidth - outputSize);
    const maxOffsetY = Math.max(0, drawHeight - outputSize);
    const drawX = -maxOffsetX * (positionX / 100);
    const drawY = -maxOffsetY * (positionY / 100);

    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error('Não foi possível gerar a foto ajustada.'));
      }, 'image/jpeg', 0.9);
    });

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'foto-perfil';
    return new File([blob], `${baseName}-ajustada.jpg`, { type: 'image/jpeg' });
  };

  const confirm = async () => {
    const adjustedFile = await buildAdjustedFile();
    await onConfirm(adjustedFile);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Ajustar foto</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">Enquadre o rosto antes de salvar.</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            className="rounded-xl bg-slate-100 p-2.5 text-slate-500 transition hover:bg-slate-200"
            title="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_0.85fr]">
          <div className="flex items-center justify-center rounded-[2rem] border border-slate-100 bg-slate-100 p-5">
            <div className="relative h-72 w-72 overflow-hidden rounded-full border-[10px] border-white bg-slate-200 shadow-xl">
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Prévia da foto ajustada"
                  className="h-full w-full"
                  style={previewStyle}
                />
              )}
              <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-slate-900/10" />
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-semibold leading-relaxed text-blue-800">
              Use o zoom para aproximar e mova a foto na horizontal/vertical para centralizar o rosto.
            </div>

            <label className="block space-y-2">
              <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <ZoomIn size={14} /> Zoom
              </span>
              <input
                type="range"
                min="1"
                max="2.6"
                step="0.01"
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                className="w-full accent-blue-600"
              />
            </label>

            <label className="block space-y-2">
              <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <Move size={14} /> Horizontal
              </span>
              <input
                type="range"
                min="0"
                max="100"
                value={positionX}
                onChange={(event) => setPositionX(Number(event.target.value))}
                className="w-full accent-blue-600"
              />
            </label>

            <label className="block space-y-2">
              <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <Move size={14} /> Vertical
              </span>
              <input
                type="range"
                min="0"
                max="100"
                value={positionY}
                onChange={(event) => setPositionY(Number(event.target.value))}
                className="w-full accent-blue-600"
              />
            </label>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <button
                type="button"
                onClick={reset}
                disabled={isProcessing}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 transition hover:bg-slate-50"
              >
                <RotateCcw size={14} />
                Redefinir
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={isProcessing}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60"
              >
                {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Usar foto
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePhotoAdjustModal;
