import type React from 'react';
import type { resolveStudentIdentityDocument } from '../../../../../shared/utils/studentIdentityDocument';

export interface CarteirinhaLayoutProps {
  formData: any;
  page: 'frente' | 'verso';
  studentData: any;
  showValidationQrCode: boolean;
  containerStyle: React.CSSProperties;
  renderReadinessProps: Record<string, string | undefined>;
  customBackgroundUrl: string;
  ocultarDesign: boolean;
  institutionalText: string;
  codeValidador: string;
  assinaturaUrl: string;
  identity: ReturnType<typeof resolveStudentIdentityDocument>;
  getDocumentLabel: () => string;
  getDocumentDisplay: () => string;
  getPosStyle: (key: string) => React.CSSProperties;
  handleDragStart: (event: React.MouseEvent, key: string) => void;
  getDragBorderClass: () => string;
}
