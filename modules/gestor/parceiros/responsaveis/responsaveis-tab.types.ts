export type ToastApi = {
  success: (title: string, message: string) => void;
  error: (title: string, message: string) => void;
  info: (title: string, message: string) => void;
};

export type Parentesco = 'MAE' | 'PAI' | 'TUTOR' | 'GUARDIAO_JUDICIAL' | 'OUTRO';
export type VinculoStatus = 'PENDENTE' | 'VERIFICADO';

export interface ResponsaveisTabProps {
  poloId?: string | null;
  includeGlobal?: boolean;
  toast: ToastApi;
  openCreateOnMount?: boolean;
  onCreateOpenHandled?: () => void;
}
