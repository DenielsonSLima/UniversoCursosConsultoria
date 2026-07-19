/* global CanvasRenderingContext2D, HTMLCanvasElement */
import React, { useEffect, useRef } from 'react';
import { MoveHorizontal, MoveVertical, RotateCcw, ZoomIn } from 'lucide-react';

export interface ProfilePhotoTransform {
  zoom: number;
  positionX: number;
  positionY: number;
}

export const defaultProfilePhotoTransform: ProfilePhotoTransform = {
  zoom: 1,
  positionX: 0,
  positionY: 0,
};

const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Não foi possível abrir a imagem selecionada.'));
  image.src = url;
});

const drawSquareCrop = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  size: number,
  transform: ProfilePhotoTransform,
) => {
  context.clearRect(0, 0, size, size);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);

  const coverScale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
  const scale = coverScale * transform.zoom;
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const overflowX = Math.max(0, width - size);
  const overflowY = Math.max(0, height - size);
  const x = -overflowX / 2 + (transform.positionX / 100) * (overflowX / 2);
  const y = -overflowY / 2 + (transform.positionY / 100) * (overflowY / 2);

  context.drawImage(image, x, y, width, height);
};

export const createCroppedProfilePhoto = async (
  file: File,
  transform: ProfilePhotoTransform,
): Promise<File> => {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(sourceUrl);
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 640;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Seu navegador não conseguiu preparar o recorte da foto.');
    drawSquareCrop(context, image, 640, transform);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error('Não foi possível gerar a foto ajustada.')),
        'image/jpeg',
        0.92,
      );
    });
    return new File([blob], 'whatsapp-profile.jpg', { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
};

interface ProfilePhotoEditorProps {
  file: File;
  transform: ProfilePhotoTransform;
  onChange: (transform: ProfilePhotoTransform) => void;
}

const ProfilePhotoEditor: React.FC<ProfilePhotoEditorProps> = ({ file, transform, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const sourceUrl = URL.createObjectURL(file);
    let cancelled = false;

    loadImage(sourceUrl)
      .then((image) => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!cancelled && canvas && context) drawSquareCrop(context, image, canvas.width, transform);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      URL.revokeObjectURL(sourceUrl);
    };
  }, [file, transform]);

  const update = (field: keyof ProfilePhotoTransform, value: number) => {
    onChange({ ...transform, [field]: value });
  };

  return (
    <div className="mt-5 w-full rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 text-left">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Ajustar enquadramento</p>
          <p className="mt-1 text-[11px] font-medium text-slate-500">A área circular mostra como a foto ficará no WhatsApp.</p>
        </div>
        <button
          type="button"
          onClick={() => onChange(defaultProfilePhotoTransform)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-white text-emerald-700 transition-colors hover:bg-emerald-100"
          title="Restaurar posição"
          aria-label="Restaurar tamanho e posição da foto"
        >
          <RotateCcw size={15} />
        </button>
      </div>

      <div className="mx-auto mt-4 h-44 w-44 overflow-hidden rounded-full border-4 border-white bg-white shadow-md ring-1 ring-emerald-100">
        <canvas ref={canvasRef} width={352} height={352} className="h-full w-full" />
      </div>

      <div className="mt-5 space-y-4">
        <PhotoSlider
          icon={ZoomIn}
          label="Tamanho / zoom"
          value={transform.zoom}
          min={1}
          max={3}
          step={0.05}
          onChange={(value) => update('zoom', value)}
        />
        <PhotoSlider
          icon={MoveHorizontal}
          label="Posição horizontal"
          value={transform.positionX}
          min={-100}
          max={100}
          step={1}
          onChange={(value) => update('positionX', value)}
        />
        <PhotoSlider
          icon={MoveVertical}
          label="Posição vertical"
          value={transform.positionY}
          min={-100}
          max={100}
          step={1}
          onChange={(value) => update('positionY', value)}
        />
      </div>
    </div>
  );
};

interface PhotoSliderProps {
  icon: React.ElementType;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

const PhotoSlider: React.FC<PhotoSliderProps> = ({ icon: Icon, label, value, min, max, step, onChange }) => (
  <label className="block">
    <span className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-600">
      <Icon size={14} className="text-emerald-700" />
      {label}
    </span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="h-2 w-full cursor-pointer accent-emerald-600"
    />
  </label>
);

export default ProfilePhotoEditor;
