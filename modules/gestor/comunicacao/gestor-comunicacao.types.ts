import { PortalAuthProfile } from '../../login/portal-session';

export interface GestorChat {
  id: string;
  remetente_id: string;
  remetente_nome: string;
  remetente_tipo: 'Aluno' | 'Professor';
  categoria_id: string | null;
  status: 'pendente' | 'solucionada';
  ultimo_texto: string | null;
  ultima_data: string;
  created_at: string;
  updated_at: string;
}

export interface GestorMessage {
  id: string;
  chat_id: string;
  remetente_id: string | null;
  remetente_nome: string;
  remetente_tipo: 'aluno' | 'professor' | 'gestor' | 'sistema';
  conteudo: string;
  anexo_path: string | null;
  anexo_url: string | null;
  anexo_display_url?: string | null;
  lida: boolean;
  created_at: string;
}

export interface GestorCategory {
  id: string;
  nome: string;
  descricao: string;
  cor: string;
  ativo: boolean;
}

export interface ComunicacaoPageProps {
  gestorProfile?: PortalAuthProfile | null;
  channel?: 'mensagem' | 'whatsapp';
}

export const getGestorCategoryInfo = (categories: GestorCategory[], categoryId: string | null) => {
  if (!categoryId) return { nome: 'Geral', cor: '#475569' };
  return categories.find((category) => category.id === categoryId) || { nome: 'Geral', cor: '#475569' };
};

export const formatGestorChatTime = (isoString: string) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

export const playGestorMessageSound = (tone: 'send' | 'receive') => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = tone === 'send' ? 660 : 880;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
    window.setTimeout(() => context.close().catch(() => undefined), 260);
  } catch {
    // O chat continua funcional quando o navegador bloqueia áudio.
  }
};
