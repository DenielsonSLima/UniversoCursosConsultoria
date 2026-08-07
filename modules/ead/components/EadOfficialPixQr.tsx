import React, { useEffect, useRef, useState } from 'react';
import { LoaderCircle, QrCode } from 'lucide-react';

interface EadOfficialPixQrProps {
  payload?: string | null;
  imageSource?: string | null;
}

type QrRenderStatus = 'idle' | 'loading' | 'ready' | 'error';

const EadOfficialPixQr: React.FC<EadOfficialPixQrProps> = ({ payload, imageSource }) => {
  const canvasRef = useRef<React.ElementRef<'canvas'>>(null);
  const [renderStatus, setRenderStatus] = useState<QrRenderStatus>('idle');
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const canvas = canvasRef.current;

    setImageFailed(false);
    if (!payload || !canvas) {
      setRenderStatus('idle');
      return () => {
        active = false;
      };
    }

    setRenderStatus('loading');
    const renderQrCode = async () => {
      try {
        const { toCanvas } = await import('qrcode');
        await toCanvas(canvas, payload, {
          width: 224,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: {
            dark: '#001a33',
            light: '#ffffff',
          },
        });
        if (active) setRenderStatus('ready');
      } catch (error) {
        console.error('Nao foi possivel renderizar o QR Code Pix oficial:', error);
        if (active) setRenderStatus('error');
      }
    };

    void renderQrCode();
    return () => {
      active = false;
    };
  }, [payload]);

  const showCanvas = Boolean(payload) && renderStatus !== 'error';
  const showImage = !showCanvas && Boolean(imageSource) && !imageFailed;
  const showUnavailable = !showCanvas && !showImage;

  return (
    <div
      className="mx-auto flex h-48 w-48 items-center justify-center overflow-hidden rounded-2xl bg-white p-2 shadow-sm sm:h-56 sm:w-56 sm:p-3"
      aria-busy={renderStatus === 'loading'}
    >
      {showCanvas ? (
        <div className="relative flex h-full w-full items-center justify-center">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="QR Code Pix oficial do Banese"
            className={`h-full w-full transition-opacity ${renderStatus === 'ready' ? 'opacity-100' : 'opacity-0'}`}
          />
          {renderStatus !== 'ready' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-emerald-600">
              <LoaderCircle size={36} className="animate-spin" />
              <p className="mt-3 text-[9px] font-black uppercase tracking-widest text-slate-500">
                Preparando QR oficial
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {showImage ? (
        <img
          src={imageSource || ''}
          alt="QR Code Pix oficial do Banese"
          className="h-full w-full object-contain"
          onError={() => setImageFailed(true)}
        />
      ) : null}

      {showUnavailable ? (
        <div className="flex h-full w-full flex-col items-center justify-center px-4 text-emerald-600">
          <QrCode size={52} />
          <p className="mt-3 text-center text-[9px] font-black uppercase tracking-widest text-slate-500">
            QR oficial indisponível
          </p>
        </div>
      ) : null}
    </div>
  );
};

export default EadOfficialPixQr;
