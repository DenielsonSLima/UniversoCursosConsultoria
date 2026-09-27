export interface PdvReceiptTemplate {
  version: number;
  widthMm: 58 | 80;
  marginMm: number;
  fontSize: number;
  showLogo: boolean;
  footer: string;
  source: 'DEFAULT' | 'PRINTER';
}

export interface PdvReceipt {
  version: 1;
  id: string;
  number: string;
  receivableId: string;
  poloId: string;
  issuedAt: string;
  totalCents: number;
  totalDisplay: string;
  paidAt: string;
  paidAtDisplay: string;
  paymentMethod: string;
  payer: { name: string; documentMasked: string };
  description: string;
  issuer: {
    id: string; name: string; cnpj: string;
    address: string; number: string; complement: string; neighborhood: string;
    city: string; state: string; postalCode: string; phone: string; email: string;
    isHeadquarters: boolean; logoUrl: string | null;
    watermarkUrl: string | null; watermarkOpacity: number | null;
    watermarkScale: number | null; watermarkRotate: boolean | number | null;
  };
  template: PdvReceiptTemplate;
  printerId: string | null;
  behavior: 'PERGUNTAR' | 'AUTOMATICO' | 'NAO';
  transport: 'BROWSER' | 'QZ_TRAY' | 'EPOS';
  transportReady: boolean;
  automaticReady: boolean;
  hasPriorPrint?: boolean;
}

export interface PdvPrintJob {
  id: string;
  status: string;
  receipt: PdvReceipt;
  transport: PdvReceipt['transport'];
  automaticReady: boolean;
  canDispatch: boolean;
}

export interface PreparedPdvReceipt {
  receipt: PdvReceipt;
  workstationId: string | null;
  blob: Blob;
  fileName: string;
}
