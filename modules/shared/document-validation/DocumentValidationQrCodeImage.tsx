import React from 'react';
import {
  LocalQrCodeImage,
} from '../qrcode/LocalQrCodeImage';
import {
  getDocumentValidationQrValue,
} from './document-validation.qr';
export {
  createDocumentValidationQrDataUrl,
  getDocumentValidationQrValue,
} from './document-validation.qr';

type DocumentValidationQrCodeImageProps = Omit<
  React.ComponentProps<typeof LocalQrCodeImage>,
  'value'
> & {
  code: string;
};

export const DocumentValidationQrCodeImage: React.FC<
  DocumentValidationQrCodeImageProps
> = ({ code, ...props }) => {
  return (
    <LocalQrCodeImage
      {...props}
      value={getDocumentValidationQrValue(code)}
    />
  );
};
