import { supabase } from '../../../lib/supabase';
import {
  CommunicationAttachmentRecord,
  removeCommunicationAttachmentPaths,
  resolveCommunicationAttachmentUrls,
  uploadCommunicationAttachment,
} from '../../shared/comunicacao/comunicacao-attachments.service';

export interface ProfessorCommunicationMessage extends CommunicationAttachmentRecord {
  id: string;
  chat_id: string;
  remetente_id: string | null;
  remetente_nome: string;
  remetente_tipo: string;
  conteudo: string;
  created_at: string;
}

interface SendProfessorMessageInput {
  chatId: string;
  file: File | null;
  professorId: string;
  professorNome: string;
  text: string;
}

const sendMessage = async ({
  chatId,
  file,
  professorId,
  professorNome,
  text,
}: SendProfessorMessageInput): Promise<ProfessorCommunicationMessage> => {
  let attachmentPath: string | null = null;

  if (file) {
    attachmentPath = await uploadCommunicationAttachment({
      actor: { type: 'professor', id: professorId },
      chatId,
      file,
    });
  }

  const content = text || (file ? `📎 ${file.name}` : '');
  const { data: newMessage, error: messageError } = await supabase
    .from('comunicacao_mensagens')
    .insert({
      chat_id: chatId,
      remetente_id: professorId,
      remetente_nome: professorNome,
      remetente_tipo: 'professor',
      conteudo: content,
      anexo_path: attachmentPath,
      anexo_url: null,
    })
    .select()
    .single();

  if (messageError) {
    if (attachmentPath) {
      await removeCommunicationAttachmentPaths([attachmentPath]).catch((cleanupError) => {
        console.error('Falha ao limpar anexo do professor após erro no envio:', cleanupError);
      });
    }
    throw messageError;
  }

  const { error: chatError } = await supabase
    .from('comunicacao_chats')
    .update({
      ultimo_texto: text || `📎 ${file?.name}`,
      ultima_data: new Date().toISOString(),
    })
    .eq('id', chatId);

  if (chatError) throw chatError;

  const [resolvedMessage] = await resolveCommunicationAttachmentUrls([
    newMessage as ProfessorCommunicationMessage,
  ]);
  return resolvedMessage;
};

export const professorComunicacaoService = { sendMessage };
