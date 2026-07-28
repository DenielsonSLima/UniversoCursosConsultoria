import React, { useEffect, useState } from 'react';
import {
  createLocalQrCodeDataUrl,
  type LocalQrCodeOptions,
} from './local-qrcode';
import {
  getLocalQrCodeRequestKey,
  resolveLocalQrCodeAssetState,
  type QrCodeState,
} from './local-qrcode-state';
export {
  getLocalQrCodeRequestKey,
  isValidLocalQrCodeDataUrl,
  resolveLocalQrCodeAssetState,
} from './local-qrcode-state';

interface LocalQrCodeImageProps extends LocalQrCodeOptions {
  value: string;
  alt?: string;
  className?: string;
  imageClassName?: string;
  style?: React.CSSProperties;
  loadingLabel?: string;
  errorLabel?: string;
}

export const useLocalQrCodeDataUrl = (
  value: string,
  options: LocalQrCodeOptions = {},
) => {
  const { size, margin, errorCorrectionLevel } = options;
  const requestKey = getLocalQrCodeRequestKey(value, {
    size,
    margin,
    errorCorrectionLevel,
  });
  const [state, setState] = useState<QrCodeState>(() => ({
    requestKey,
    dataUrl: '',
    error: '',
    loading: true,
  }));

  useEffect(() => {
    let active = true;

    void createLocalQrCodeDataUrl(value, { size, margin, errorCorrectionLevel })
      .then((dataUrl) => {
        if (active) {
          setState({
            requestKey,
            dataUrl,
            error: '',
            loading: false,
          });
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof Error
          ? error.message
          : 'Não foi possível gerar o QR Code.';
        setState({
          requestKey,
          dataUrl: '',
          error: message,
          loading: false,
        });
      });

    return () => {
      active = false;
    };
  }, [errorCorrectionLevel, margin, requestKey, size, value]);

  return resolveLocalQrCodeAssetState(requestKey, state);
};

/**
 * Imagem de QR local com dimensões estáveis e sinalização para capturas de PDF.
 */
export const LocalQrCodeImage: React.FC<LocalQrCodeImageProps> = ({
  value,
  size,
  margin,
  errorCorrectionLevel,
  alt = 'QR Code',
  className = '',
  imageClassName = '',
  style,
  loadingLabel = 'Gerando QR...',
  errorLabel = 'QR indisponível',
}) => {
  const { dataUrl, error, loading, ready } = useLocalQrCodeDataUrl(value, {
    size,
    margin,
    errorCorrectionLevel,
  });

  return (
    <span
      className={`relative inline-flex items-center justify-center overflow-hidden ${className}`}
      style={{ aspectRatio: '1 / 1', ...style }}
      aria-busy={loading}
      aria-label={loading ? loadingLabel : error ? `${errorLabel}: ${error}` : undefined}
      data-qr-code-asset="true"
      data-pdf-asset-ready={ready ? 'true' : 'false'}
      data-pdf-asset-error={error || undefined}
    >
      {dataUrl ? (
        <img
          src={dataUrl}
          alt={alt}
          draggable={false}
          className={`block h-full w-full object-contain ${imageClassName}`}
        />
      ) : (
        <span
          className={`px-1 text-center font-black uppercase tracking-wider ${
            error ? 'text-rose-400' : 'text-slate-300'
          }`}
          style={{ fontSize: 'clamp(5px, 8%, 9px)', lineHeight: 1.1 }}
          title={error || undefined}
        >
          {error ? errorLabel : loadingLabel}
        </span>
      )}
    </span>
  );
};
