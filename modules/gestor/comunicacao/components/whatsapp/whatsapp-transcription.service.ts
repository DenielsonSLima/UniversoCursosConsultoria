import { supabase } from '../../../../../lib/supabase';

export const TRANSCRIPTION_NOTICE_VERSION = 'whatsapp-transcription-privacy-v1';

export const transcribeMessageAudioWithNotice = async (messageId: string): Promise<string> => {
  const { data, error } = await supabase.functions.invoke('whatsapp-media', {
    body: {
      action: 'transcribe',
      messageId,
      noticeAccepted: true,
      noticeVersion: TRANSCRIPTION_NOTICE_VERSION,
    },
  });
  if (error) {
    const response = error.context;
    if (response instanceof Response) {
      const body = await response.clone().json().catch(() => null);
      if (body?.code === 'transcription_disabled') {
        throw new Error('A transcrição por IA está desativada pela instituição.');
      }
    }
    throw new Error('Não foi possível transcrever este áudio agora. Tente novamente mais tarde.');
  }
  if (typeof data?.transcription !== 'string' || data?.ok !== true) {
    throw new Error('Não foi possível confirmar a transcrição deste áudio.');
  }
  return data.transcription;
};
