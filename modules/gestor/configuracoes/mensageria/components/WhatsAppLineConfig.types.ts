import type { WhatsAppConexao } from '../../../comunicacao/components/whatsapp/whatsapp.types';

export type ConnectionSaveInput = Partial<WhatsAppConexao> & {
  tokenInput?: string;
  appSecretInput?: string;
  verifyTokenInput?: string;
};

export type SecretKind = 'access_token' | 'app_secret' | 'verify_token';
export type CredentialKey = 'accessToken' | 'appSecret' | 'verifyToken';
export type CredentialCheck = {
  state: 'valid' | 'verified' | 'stored' | 'missing' | 'invalid';
  message: string;
};

export interface WhatsAppLineConfigFormProps {
  conexao: WhatsAppConexao;
  onSave: (data: ConnectionSaveInput) => Promise<void>;
  isSaving: boolean;
  onNameChange?: (name: string) => void;
}

