export type PdvPrinterTransport = 'BROWSER' | 'QZ_TRAY' | 'EPOS';
export type PdvPrintBehavior = 'PERGUNTAR' | 'AUTOMATICO' | 'NAO';
export interface PdvPrinterTemplate {
  widthMm: 58 | 80;
  showLogo: boolean;
  footer: string;
  marginMm: number;
  fontSize: number;
}
export type PdvReceiptTemplate = PdvPrinterTemplate;
export interface PdvWorkstation {
  id: string;
  name: string;
  ownedByCurrentUser: boolean;
  active: boolean;
}
export interface PdvPrinter {
  id: string;
  poloId: string;
  workstationId: string;
  name: string;
  model: string;
  transport: PdvPrinterTransport;
  behavior: PdvPrintBehavior;
  isDefault: boolean;
  active: boolean;
  version: number;
  template: PdvReceiptTemplate;
  transportReady: boolean;
  automaticReady: boolean;
  readinessReason: string | null;
}
export interface PdvPrinterSettings {
  version: 1;
  canManage: boolean;
  canUse: boolean;
  context: 'OUTROS_CREDITOS';
  workstations: PdvWorkstation[];
  printers: PdvPrinter[];
  selectedWorkstationId: string | null;
  defaultPrinterId: string | null;
}
export type PdvPrinterDraft = Pick<PdvPrinter,
  'name' | 'model' | 'transport' | 'behavior' | 'isDefault' | 'active' | 'template'>;
export interface SavePdvPrinterInput extends PdvPrinterDraft {
  id?: string;
  poloId: string;
  workstationId: string;
  expectedVersion: number;
}
export const pdvPrinterQueryKeys = {
  root: ['pdv-printer-settings'] as const,
  polo: (poloId: string) => ['pdv-printer-settings', poloId] as const,
  settings: (poloId: string, stationId: string | null) => ['pdv-printer-settings', poloId, stationId] as const,
};
