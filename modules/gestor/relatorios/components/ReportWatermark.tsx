import React from 'react';

type ReportOrientation = 'portrait' | 'landscape';

interface ReportWatermarkProps {
  polo: any;
  orientation?: ReportOrientation;
}

const readWatermark = (polo: any, orientation: ReportOrientation) => {
  if (orientation === 'landscape') {
    return {
      url: polo?.landscapeWatermarkUrl
        ?? polo?.landscape_watermark_url
        ?? polo?.watermark_url
        ?? polo?.watermarkUrl
        ?? null,
      opacity: Number(
        polo?.landscapeWatermarkOpacity
        ?? polo?.landscape_watermark_opacity
        ?? polo?.watermark_opacity
        ?? polo?.watermarkOpacity
        ?? 0.1,
      ),
      scale: Number(
        polo?.landscapeWatermarkScale
        ?? polo?.landscape_watermark_scale
        ?? polo?.watermark_scale
        ?? polo?.watermarkScale
        ?? 50,
      ),
      rotate: polo?.landscapeWatermarkRotate
        ?? polo?.landscape_watermark_rotate
        ?? polo?.watermark_rotate
        ?? polo?.watermarkRotate
        ?? true,
    };
  }

  return {
    url: polo?.watermark_url ?? polo?.watermarkUrl ?? null,
    opacity: Number(polo?.watermark_opacity ?? polo?.watermarkOpacity ?? 0.1),
    scale: Number(polo?.watermark_scale ?? polo?.watermarkScale ?? 50),
    rotate: polo?.watermark_rotate ?? polo?.watermarkRotate ?? true,
  };
};

const ReportWatermark: React.FC<ReportWatermarkProps> = ({ polo, orientation }) => {
  const watermark = readWatermark(polo, orientation ?? 'portrait');

  if (!watermark.url) {
    return (
      <div className="pointer-events-none absolute inset-0 z-0 flex select-none items-center justify-center overflow-hidden opacity-[0.03]">
        <h1 className="rotate-[-45deg] text-center text-6xl font-black tracking-widest text-slate-900">
          UNIVERSO CURSOS E CONSULTORIA
        </h1>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
      <img
        src={watermark.url}
        alt=""
        aria-hidden="true"
        className="max-h-full object-contain"
        style={{
          opacity: Math.min(1, Math.max(0, watermark.opacity)),
          width: `${Math.min(100, Math.max(10, watermark.scale))}%`,
          transform: watermark.rotate ? 'rotate(-45deg)' : 'none',
        }}
      />
    </div>
  );
};

export default ReportWatermark;
