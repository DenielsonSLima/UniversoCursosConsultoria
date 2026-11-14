import React from 'react';
import { ArrowLeft, Loader2, MessageSquare, Sparkles } from 'lucide-react';
import { CommunicationAttachmentPreview } from '../../shared/comunicacao/CommunicationAttachmentPreview';
import { ProfessorMessageComposer } from './ProfessorMessageComposer';
import { professorChatTime } from './ProfessorChatList';

interface Props {
  chat: any;
  category: string;
  professorId: string;
  messages: any[];
  loading: boolean;
  error: boolean;
  messageText: string;
  pendingFile: File | null;
  sending: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onBack: () => void;
  onMessage: (value: string) => void;
  onFile: (file: File | null) => void;
  onFileError: (message: string) => void;
  onSend: () => void;
}

const ProfessorChatThread: React.FC<Props> = ({
  chat, category, professorId, messages, loading, error, messageText, pendingFile,
  sending, fileInputRef, messagesEndRef, onBack, onMessage, onFile, onFileError, onSend,
}) => {
  if (!chat) return (
    <section className="professor-chat-empty"><MessageSquare size={28} /><h3>Suporte ao docente</h3><p>Selecione um chamado para abrir a conversa ou use Novo chamado.</p></section>
  );
  return (
    <section className="professor-chat-thread" aria-label="Conversa do chamado">
      <header>
        <button className="professor-chat-back" type="button" aria-label="Voltar aos chamados" onClick={onBack}><ArrowLeft size={20} /></button>
        <div className="min-w-0"><h3>Suporte docente</h3><p className="mt-0.5 professor-help">{category} · {chat.status === 'pendente' ? 'Aberto' : 'Resolvido'}</p></div>
      </header>
      <div className="professor-chat-messages" aria-live="polite">
        {loading ? (
          <p role="status" className="flex items-center gap-2 professor-help"><Loader2 size={16} className="animate-spin" />Carregando conversa…</p>
        ) : error ? (
          <p role="alert" className="text-red-800">Não foi possível carregar as mensagens. A consulta será retomada ao reconectar.</p>
        ) : messages.map((message) => {
          const outgoing = message.remetente_id === professorId || message.remetente_tipo === 'professor';
          if (message.remetente_tipo === 'sistema') return (
            <p key={message.id} className="my-3 flex items-center justify-center gap-1 professor-help"><Sparkles size={13} />{message.conteudo}</p>
          );
          return (
            <div key={message.id} className={`professor-chat-message ${outgoing ? 'is-outgoing' : ''}`}>
              <div className="professor-chat-bubble">
                <CommunicationAttachmentPreview attachment={message} outgoing={outgoing} />
                <div className="p-3">
                  <p className="mb-1 text-xs font-medium">{outgoing ? 'Você' : message.remetente_nome}</p>
                  {message.conteudo && !message.conteudo.startsWith('📎') && <p className="whitespace-pre-wrap break-words">{message.conteudo}</p>}
                  <time className="mt-1 block text-right text-xs opacity-75">{professorChatTime(message.created_at)}</time>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <footer>
        {chat.status === 'solucionada' ? (
          <p className="rounded-lg bg-slate-50 p-3 text-center professor-help">Este chamado foi solucionado.</p>
        ) : (
          <ProfessorMessageComposer
            fileInputRef={fileInputRef} messageText={messageText} pendingFile={pendingFile}
            uploading={sending} onFile={onFile} onFileError={onFileError}
            onMessage={onMessage} onSend={onSend}
          />
        )}
      </footer>
    </section>
  );
};
export default ProfessorChatThread;
