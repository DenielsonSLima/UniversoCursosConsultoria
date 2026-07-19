import type React from 'react';

export type CarteirinhaEditorTab = 'config' | 'frente' | 'verso' | 'certificado';
export type CarteirinhaPreviewMode = 'frente' | 'verso' | 'ambos';
export type CarteirinhaUploadField = 'bgFrenteUrl' | 'bgVersoUrl' | 'assinaturaDiretorPngUrl';
export type CarteirinhaEditorFormData = Record<string, any>;
export type CarteirinhaEditorFormSetter = React.Dispatch<React.SetStateAction<CarteirinhaEditorFormData>>;
export type CarteirinhaEditorChangeHandler = (
  event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
) => void;
export type CarteirinhaEditorUploadHandler = (
  event: React.ChangeEvent<HTMLInputElement>,
  fieldName: CarteirinhaUploadField,
) => void;

export interface CarteirinhaEditorPanelProps {
  formData: CarteirinhaEditorFormData;
  handleChange: CarteirinhaEditorChangeHandler;
  handleUploadFile: CarteirinhaEditorUploadHandler;
  isUploading: boolean;
  setFormData: CarteirinhaEditorFormSetter;
}
