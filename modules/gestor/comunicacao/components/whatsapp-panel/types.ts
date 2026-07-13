import { MensageriaConfigData } from '../../../configuracoes/mensageria/mensageria.service';

export type WhatsAppOpsTab = 'conversas' | 'automacoes' | 'atrasados' | 'fluxos' | 'agentes' | 'perfil' | 'configuracoes';
export type AutomationTone = 'blue' | 'emerald' | 'amber' | 'rose';
export type AutomationKey = 'due' | 'receipt' | 'overdue' | 'multiple';

export type AutomationField =
  | 'waDueNoticeModalities'
  | 'waPaymentReceiptModalities'
  | 'waOverdueNoticeModalities'
  | 'waMultipleOverdueModalities';

export interface AutomationTabProps {
  automation: MensageriaConfigData;
  loadingConfig: boolean;
  openAutomation: AutomationKey | null;
  onToggleOpen: (key: AutomationKey) => void;
  onAutomationChange: (next: MensageriaConfigData) => void;
  onModalitiesChange: (field: AutomationField, value: string[]) => void;
  onSave: (key: AutomationKey) => void;
  isSaving: boolean;
  savingKey?: AutomationKey;
}
