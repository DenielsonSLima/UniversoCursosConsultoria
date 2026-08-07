import type React from 'react';

export interface DeclaracaoEditorService {
  getTemplate: (poloId: string) => Promise<any>;
  saveTemplate: (poloId: string, data: any) => Promise<boolean>;
  getQrConfig: () => Promise<any>;
}

export interface DeclaracaoEditorProps {
  polo: any;
  onBack: () => void;
  service?: DeclaracaoEditorService;
  editorTitle?: string;
  documentTitle?: string;
  variables?: EditorVariable[];
  validationPrefix?: string;
  defaultValidityDays?: number;
  showValidity?: boolean;
  migrateDeclarationDefaults?: boolean;
  hideBackButton?: boolean;
  scopeLabel?: string;
  enableEnrollmentSettings?: boolean;
  studentPreview?: EditorStudentPreview | null;
  studentPreviewLoading?: boolean;
  studentPreviewError?: string;
  onLoadStudentPreview?: () => void;
  onClearStudentPreview?: () => void;
}

export interface EditorVariable {
  code: string;
  label: string;
}

export interface EditorStudentPreview {
  enrollmentId: string;
  label: string;
  replacements: Record<string, string>;
}

export interface AbsoluteField {
  id: string;
  type: 'text' | 'image' | 'qrcode';
  value: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
}

export interface EditorToast {
  message: string;
  type: 'success' | 'error';
}

export interface DraggedEditorItem extends Partial<EditorVariable> {
  itemType: 'variable' | 'qrcode';
}

export interface CentralSignatureRole {
  id: 'diretoriaGeral' | 'secretaria' | 'coordenacao' | 'financeiro';
  label: string;
}
