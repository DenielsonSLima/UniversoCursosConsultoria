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
  certificatePem: string;
  certificateFileName: string;
  privateKeyPem: string;
  privateKeyFileName: string;
  interPixKey: string;
  walletId: string;
  merchantId: string;
  baneseConvenio: string;
  baneseBoletoConvenio: string;
  baneseBeneficiarioNome: string;
  baneseBeneficiarioInscricao: string;
  baneseCodigoBeneficiario: string;
  banesePixConvenio: string;
  banesePixChave: string;
  baneseCarteira: string;
  baneseEdi7Code: string;
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
  certificatePem: '',
  certificateFileName: '',
  privateKeyPem: '',
  privateKeyFileName: '',
  interPixKey: '',
  walletId: '',
  merchantId: '',
  baneseConvenio: '',
  baneseBoletoConvenio: '',
  baneseBeneficiarioNome: '',
  baneseBeneficiarioInscricao: '',
  baneseCodigoBeneficiario: '',
  banesePixConvenio: '',
  banesePixChave: '',
  baneseCarteira: '',
  baneseEdi7Code: '',
  baneseAgencia: '',
  baneseConta: '',
  notes: '',
};
