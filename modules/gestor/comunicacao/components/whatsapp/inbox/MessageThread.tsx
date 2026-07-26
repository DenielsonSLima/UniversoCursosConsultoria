import React, { useLayoutEffect, useRef } from 'react';
import { MessageCircle } from 'lucide-react';
import { WhatsAppConversation, WhatsAppMessage } from '../whatsapp.types';
import { formatMessageTime } from '../whatsapp.utils';
import MediaMessageActions from './MediaMessageActions';
import MessageReceipt from './MessageReceipt';
import { isMediaMessage, isMediaPlaceholder } from './mediaUtils';

interface MessageThreadProps {
  activeConversation: WhatsAppConversation | null;
  messages: WhatsAppMessage[];
  loadingMessages: boolean;
}

const GROUP_WINDOW_MS = 5 * 60_000;

const belongsToSameGroup = (current?: WhatsAppMessage, sibling?: WhatsAppMessage) => {
  if (!current || !sibling || current.direcao !== sibling.direcao) return false;
  const currentTime = new Date(current.created_at).getTime();
  const siblingTime = new Date(sibling.created_at).getTime();
  return Number.isFinite(currentTime)
    && Number.isFinite(siblingTime)
    && Math.abs(currentTime - siblingTime) <= GROUP_WINDOW_MS;
};

const MessageMeta = ({ message, outgoing }: { message: WhatsAppMessage; outgoing: boolean }) => (
  <span
    className="absolute bottom-[6px] right-[8px] inline-flex items-center gap-[3px] whitespace-nowrap text-[11px] font-normal leading-none text-[#667781]"
    aria-label={`Horário da mensagem: ${formatMessageTime(message.created_at)}`}
  >
    <span>{formatMessageTime(message.created_at)}</span>
    {outgoing ? <MessageReceipt status={message.status} compact /> : null}
  </span>
);

const MessageThread: React.FC<MessageThreadProps> = ({ activeConversation, messages, loadingMessages }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const scrollToBottom = () => {
      const container = scrollRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    };

    scrollToBottom();
    const frame = window.requestAnimationFrame(scrollToBottom);
    const observer = contentRef.current ? new window.ResizeObserver(scrollToBottom) : null;
    if (contentRef.current && observer) observer.observe(contentRef.current);
    const settleTimer = window.setTimeout(() => observer?.disconnect(), 1_000);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      observer?.disconnect();
    };
  }, [activeConversation?.id, loadingMessages, messages.length]);

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto px-6 py-5 custom-scrollbar"
      style={{
        backgroundColor: '#efeae2',
        backgroundImage: "url('/whatsapp-chat-pattern.svg')",
        backgroundPosition: 'center top',
        backgroundSize: '360px 360px',
      }}
    >
      {!activeConversation ? (
        <div className="flex h-full flex-col items-center justify-center px-8 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-[#00a884] shadow-[0_1px_2px_rgba(11,20,26,0.12)]">
            <MessageCircle size={30} />
          </div>
          <h3 className="rounded-lg bg-white/90 px-4 py-2 text-lg font-semibold tracking-tight text-[#111b21] shadow-sm">WhatsApp conectado ao atendimento</h3>
          <p className="mt-2 max-w-md rounded-lg bg-white/85 px-3 py-1.5 text-sm font-normal leading-relaxed text-[#54656f] shadow-sm">
            As mensagens enviadas e recebidas pela API ficam salvas aqui.
          </p>
        </div>
      ) : loadingMessages ? (
        <div className="mx-auto w-fit rounded-lg bg-white/90 px-4 py-2 text-center text-xs font-semibold text-[#667781] shadow-sm">Carregando mensagens...</div>
      ) : (
        <div ref={contentRef}>
          {messages.map((message, index) => {
            const outgoing = message.direcao === 'saida';
            const media = isMediaMessage(message);
            const showText = !media || !isMediaPlaceholder(message.conteudo);
            const startsGroup = !belongsToSameGroup(message, messages[index - 1]);
            const endsGroup = !belongsToSameGroup(message, messages[index + 1]);
            return (
              <div
                key={message.id}
                className={`flex ${outgoing ? 'justify-end' : 'justify-start'} ${endsGroup ? 'mb-3' : 'mb-[3px]'}`}
              >
                <div
                  className={`relative max-w-[76%] px-[9px] pt-[6px] text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] ${
                    outgoing ? 'bg-[#d9fdd3]' : 'bg-white'
                  } ${showText ? 'pb-[7px]' : 'pb-[23px]'} ${
                    startsGroup
                      ? outgoing
                        ? 'rounded-[8px] rounded-tr-[2px]'
                        : 'rounded-[8px] rounded-tl-[2px]'
                      : 'rounded-[8px]'
                  }`}
                >
                  {startsGroup ? (
                    <span
                      aria-hidden="true"
                      className={`absolute top-0 h-0 w-0 ${
                        outgoing
                          ? '-right-[8px] border-b-[8px] border-l-[8px] border-b-transparent border-l-[#d9fdd3]'
                          : '-left-[8px] border-b-[8px] border-r-[8px] border-b-transparent border-r-white'
                      }`}
                    />
                  ) : null}
                  {media && <MediaMessageActions message={message} outgoing={outgoing} />}
                  {showText && (
                    <p className={`whitespace-pre-wrap text-[14.2px] font-normal leading-[19px] ${media ? 'mt-1.5' : ''}`}>
                      <span>{message.conteudo}</span>
                      <span
                        aria-hidden="true"
                        className={`inline-block h-[11px] ${outgoing ? 'w-[64px]' : 'w-[38px]'}`}
                      />
                    </p>
                  )}
                  <MessageMeta message={message} outgoing={outgoing} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MessageThread;
