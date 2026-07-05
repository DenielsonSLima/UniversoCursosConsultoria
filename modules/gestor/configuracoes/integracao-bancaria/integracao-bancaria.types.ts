import { GatewayModalidade } from './integracao-bancaria.service';

export type MainTab = 'resumo' | GatewayModalidade | 'parametrizacao';

export interface CredentialFormState {
  apiKey: string;
  accessToken: string;
  publicKey: string;
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
  webhookToken: string;
  crtAccessToken: string;
  walletId: string;
  merchantId: string;
  baneseConvenio: string;
  baneseBoletoConvenio: string;
  baneseBeneficiarioInscricao: string;
  banesePixConvenio: string;
  banesePixChave: string;
  baneseCarteira: string;
  baneseAgencia: string;
  baneseConta: string;
  notes: string;
}

export const emptyCredentialForm: CredentialFormState = {
  apiKey: '',
  accessToken: '',
  publicKey: '',
  clientId: '',
  clientSecret: '',
  webhookSecret: '',
  webhookToken: '',
  crtAccessToken: '',
  walletId: '',
  merchantId: '',
  baneseConvenio: '',
  baneseBoletoConvenio: '',
  baneseBeneficiarioInscricao: '',
  banesePixConvenio: '',
  banesePixChave: '',
  baneseCarteira: '',
  baneseAgencia: '',
  baneseConta: '',
  notes: '',
};
