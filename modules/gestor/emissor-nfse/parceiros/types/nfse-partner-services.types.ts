import type { NfseOperationReference } from '../../emissao/nfse-operation.contract';
import type { OtherCreditPlanPreview } from '../../../financeiro/outros-creditos/other-credit-plan.types';
export interface NfseServiceFinancialPlan {
  installments: number; firstDueDate: string; categoryId: string; monthlyInterestPercent: number; penaltyPercent: number;
  discountType: 'FIXO' | 'PERCENTUAL'; discountValue: number; discountDaysBeforeDue: number;
  periodicity: 'MENSAL_CALENDARIO' | 'DIAS_CORRIDOS_30'; issueBolePix: boolean; previewToken?: string;
}
export interface NfseServiceFinancialPreview { financialPlan: NfseServiceFinancialPlan; preview: OtherCreditPlanPreview; token: string }
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
  capabilities: { canGenerateReceivable: boolean; canLinkExistingReceivable: boolean; canIssueBolePix: boolean };
}

export type NfseReceivableAction = 'NONE' | 'PENDING' | 'CREATED' | 'LINKED';

export interface NfsePartnerServiceRow extends NfseOperationReference {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerType: 'PF' | 'PJ' | 'ALUNO' | null;
  canRemove: boolean;
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
  servicePeriodStart?: string;
  servicePeriodEnd?: string;
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
  financialPlan?: NfseServiceFinancialPlan;
}

export interface NfsePartnerServiceSaved {
  id: string;
  receivableId: string | null;
  receivableAction: NfseReceivableAction;
  message: string;
}

export const NFSE_PARTNER_SERVICE_PAGE_SIZE = 50;


export interface NfsePartnerServiceFilters {
  search: string;
  dateFrom: string;
  dateTo: string;
  partnerType: '' | 'PJ' | 'PF' | 'ALUNO';
}
export const NFSE_PARTNER_SERVICE_FILTERS: NfsePartnerServiceFilters = {
  search: '', dateFrom: '', dateTo: '', partnerType: '',
};
