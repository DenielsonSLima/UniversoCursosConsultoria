import type { NfseOperationReference } from '../../emissao/nfse-operation.contract';
export interface NfseServicePartner {
  id: string;
  name: string;
  tradeName: string | null;
  document: string | null;
  type: 'PF' | 'PJ' | 'ALUNO';
}

export interface NfseExistingReceivable {
  id: string;
  partnerId: string;
  description: string;
  amount: string;
  dueDate: string;
  categoryId: string | null;
  status: string;
}

export interface NfsePartnerServiceOptions {
  partners: NfseServicePartner[];
  categories: { id: string; name: string }[];
  existingReceivables: NfseExistingReceivable[];
  capabilities: { canGenerateReceivable: boolean };
}

export type NfseReceivableAction = 'NONE' | 'CREATED' | 'LINKED';

export interface NfsePartnerServiceRow extends NfseOperationReference {
  id: string;
  partnerId: string;
  partnerName: string;
  modelId: string;
  modelName: string;
  serviceDate: string;
  serviceDescription: string;
  amount: string;
  receivableId: string | null;
  receivableAction: NfseReceivableAction;
  status: 'PREPARADO';
  createdAt: string;
}

export interface NfsePartnerServicesPage {
  rows: NfsePartnerServiceRow[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalAmount: string;
}

export interface NfsePartnerServiceInput {
  requestId: string;
  partnerId: string;
  modelId: string;
  modelVersion: number;
  serviceDate: string;
  serviceDescription: string;
  amount: string;
  generateReceivable: boolean;
  existingReceivableId: string | null;
  dueDate: string | null;
  categoryId: string | null;
}

export interface NfsePartnerServiceSaved {
  id: string;
  receivableId: string | null;
  receivableAction: NfseReceivableAction;
  message: string;
}

export const NFSE_PARTNER_SERVICE_PAGE_SIZE = 50;
