import React from 'react';
import { MessageCircle } from 'lucide-react';
import { WhatsAppConversation, WhatsAppMessage } from '../whatsapp.types';
import { formatMessageTime } from '../whatsapp.utils';
import MediaMessageActions from './MediaMessageActions';
import MessageReceipt from './MessageReceipt';
import { isMediaMessage } from './mediaUtils';

interface MessageThreadProps {
  activeConversation: WhatsAppConversation | null;
  messages: WhatsAppMessage[];
  loadingMessages: boolean;
}

const MessageThread: React.FC<MessageThreadProps> = ({ activeConversation, messages, loadingMessages }) => (
  <div className="min-h-0 flex-1 overflow-y-auto p-5 custom-scrollbar">
    {!activeConversation ? (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-emerald-500 shadow-sm">
          <MessageCircle size={30} />
        </div>
        <h3 className="text-lg font-bold tracking-tight text-[#001a33]">WhatsApp conectado ao atendimento</h3>
        <p className="mt-2 max-w-md text-sm font-medium leading-relaxed text-slate-500">
          As mensagens enviadas e recebidas pela API ficam salvas aqui.
        </p>
      </div>
    ) : loadingMessages ? (
      <div className="p-8 text-center text-xs font-bold text-slate-400">Carregando mensagens...</div>
    ) : (
      <div className="space-y-3">
        {messages.map((message) => {
          const outgoing = message.direcao === 'saida';
          return (
            <div key={message.id} className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[76%] rounded-2xl px-4 py-3 shadow-sm ${
                outgoing ? 'bg-emerald-600 text-white' : 'bg-white text-slate-800'
              }`}>
                <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed">{message.conteudo}</p>
                {isMediaMessage(message) && <MediaMessageActions message={message} outgoing={outgoing} />}
                <div className={`mt-1 flex justify-end gap-1 text-[10px] font-semibold ${outgoing ? 'text-emerald-50/80' : 'text-slate-400'}`}>
                  <span>{formatMessageTime(message.created_at)}</span>
                  {outgoing && <MessageReceipt status={message.status} compact />}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
);

export default MessageThread;
