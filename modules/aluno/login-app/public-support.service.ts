import { supabase } from '../../../lib/supabase';

export const PUBLIC_SUPPORT_STORAGE_KEY = 'universo.public-support.access-token';

export interface PublicSupportBootstrap {
  polos: Array<{ id: string; nome: string; cidade: string; estado: string; is_matriz: boolean }>;
  configs: Array<Record<string, any>>;
  flow: Record<string, any> | null;
}

export interface PublicSupportHistory {
  chat: {
    id: string;
    remetente_nome: string;
    status: 'pendente' | 'solucionada';
    assunto: string;
    protocolo: string;
    created_at: string;
  };
  messages: Array<{
    id: string;
    remetente_nome: string;
    remetente_tipo: 'aluno' | 'gestor' | 'sistema';
    conteudo: string;
    anexo_path?: string | null;
    anexo_url?: string | null;
    created_at: string;
  }>;
}

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Não foi possível ler o arquivo selecionado.'));
  reader.onload = () => {
    const result = String(reader.result || '');
    const separator = result.indexOf(',');
    if (separator < 0) {
      reject(new Error('O arquivo selecionado é inválido.'));
      return;
    }
    resolve(result.slice(separator + 1));
  };
  reader.readAsDataURL(file);
});

const invoke = async <T>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke('public-student-support', { body });
  if (error) {
    const response = error.context && typeof error.context.clone === 'function' ? error.context.clone() : error.context;
    const payload = response && typeof response.json === 'function' ? await response.json().catch(() => null) : null;
    throw new Error(payload?.error || error.message || 'Não foi possível concluir o atendimento.');
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
};

export const publicSupportService = {
  bootstrap: () => invoke<PublicSupportBootstrap>({ action: 'bootstrap' }),
  createTicket: (input: Record<string, unknown>) => invoke<{ chat: PublicSupportHistory['chat']; accessToken: string; averageResponseMinutes: number }>({ action: 'create-ticket', ...input }),
  history: (accessToken: string) => invoke<PublicSupportHistory>({ action: 'history', accessToken }),
  sendMessage: (accessToken: string, message: string) => invoke<PublicSupportHistory>({ action: 'send-message', accessToken, message }),
  sendAttachment: async (accessToken: string, file: File) => invoke<PublicSupportHistory>({
    action: 'send-attachment',
    accessToken,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    fileBase64: await fileToBase64(file),
  }),
};
