import type { MensageriaConfigData } from '../../mensageria.types';

export interface FacebookLoginResponse {
  status?: string;
  authResponse?: {
    code?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface FacebookWindow extends globalThis.Window {
  fbAsyncInit?: () => void;
  FB?: {
    init: (options: {
      appId: string;
      autoLogAppEvents: boolean;
      xfbml: boolean;
      version: string;
    }) => void;
    login: (
      callback: (response: FacebookLoginResponse) => void,
      options: Record<string, unknown>
    ) => void;
  };
}

export interface WhatsAppCoexistenceTabProps {
  draft: MensageriaConfigData;
  webhookUrl: string;
  onChange: <K extends keyof MensageriaConfigData>(field: K, value: MensageriaConfigData[K]) => void;
}

export type SessionEntry = {
  receivedAt: string;
  payload: Record<string, unknown>;
};

export type LoginResult = {
  receivedAt: string;
  status: 'success' | 'cancelled' | 'error';
  message: string;
  code?: string;
  raw?: FacebookLoginResponse;
};
