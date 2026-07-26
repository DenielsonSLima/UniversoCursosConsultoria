import React from 'react';
import { Check } from 'lucide-react';
import { WhatsAppConversation, WhatsAppFlowSession } from '../whatsapp.types';
import { formatMessageDate, formatMessageTime, formatPhone } from '../whatsapp.utils';
import ContactAvatar from './ContactAvatar';

const sectorLabel = (sector: WhatsAppConversation['setor']) => ({
  comercial_matriculas: 'Comercial',
  secretaria: 'Secretaria',
  financeiro: 'Financeiro',
  pedagogico_coordenacao: 'Coordenação',
  atendimento_geral: 'Atendimento',
}[String(sector || '')] || '');

const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });

const sameCalendarDay = (left: Date, right: Date) => (
  left.getFullYear() === right.getFullYear()
  && left.getMonth() === right.getMonth()
  && left.getDate() === right.getDate()
);

const formatListTimestamp = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';

  const today = new Date();
  if (sameCalendarDay(date, today)) return formatMessageTime(value);

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameCalendarDay(date, yesterday)) return 'Ontem';

  const daysAgo = Math.floor((today.getTime() - date.getTime()) / 86_400_000);
  if (daysAgo > 1 && daysAgo < 7) {
    return weekdayFormatter.format(date).replace('.', '');
  }

  return formatMessageDate(value);
};

interface ConversationListItemProps {
  conversation: WhatsAppConversation;
  flowSession?: WhatsAppFlowSession;
  active: boolean;
  selected: boolean;
  selectionMode: boolean;
  onSelect: () => void;
  onToggleSelected: () => void;
}

const ConversationListItem: React.FC<ConversationListItemProps> = ({
  conversation,
  flowSession,
  active,
  selected,
  selectionMode,
  onSelect,
  onToggleSelected,
}) => {
  const isHandoff = flowSession?.handoff_required || flowSession?.status === 'handoff';
  const hasUnread = conversation.unread_count > 0;
  const sector = sectorLabel(conversation.setor);
  const preview = conversation.ultimo_texto || formatPhone(conversation.telefone);
  const flowLabel = isHandoff ? 'Aguardando atendente' : flowSession ? 'Robô ativo' : '';

  return (
    <div
      className={`group relative w-full transition-colors ${
        selected
          ? 'bg-[#e7f8e4]'
          : active
            ? 'bg-[#f0f2f5]'
            : 'bg-white hover:bg-[#f5f6f6]'
      }`}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '76px' }}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-h-[76px] w-full items-center pl-4 pr-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#00a884]"
        aria-current={active ? 'true' : undefined}
      >
        <div className="relative shrink-0">
          <ContactAvatar
            name={conversation.contato_nome}
            photo={conversation.contato_foto}
            size="lg"
            className="bg-[#dfe5e7] text-[#54656f]"
          />
          {flowSession ? (
            <>
              <span
                className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-[2.5px] border-white ${
                  isHandoff ? 'bg-[#f0a500]' : 'bg-[#00a884]'
                }`}
                title={flowLabel}
              />
              <span className="sr-only">{flowLabel}</span>
            </>
          ) : null}
        </div>

        <div className={`ml-3 min-w-0 flex-1 self-stretch border-b pt-[15px] ${
          active || selected ? 'border-transparent' : 'border-[#e9edef]'
        }`}>
          <div className="flex min-w-0 items-center justify-between gap-3">
            <p className={`truncate text-[15px] leading-5 text-[#111b21] ${hasUnread ? 'font-semibold' : 'font-normal'}`}>
              {conversation.contato_nome}
            </p>
            <time
              dateTime={conversation.ultima_data}
              className={`shrink-0 text-[11.5px] leading-5 transition-opacity ${
                hasUnread ? 'font-medium text-[#00a884]' : 'font-normal text-[#667781]'
              } ${selectionMode ? 'opacity-0' : 'group-hover:opacity-0 group-focus-within:opacity-0'}`}
            >
              {formatListTimestamp(conversation.ultima_data)}
            </time>
          </div>

          <div className="mt-0.5 flex min-w-0 items-center gap-2">
            <p className={`min-w-0 flex-1 truncate text-[13px] leading-5 ${
              hasUnread ? 'font-medium text-[#3b4a54]' : 'font-normal text-[#667781]'
            }`}>
              {isHandoff ? (
                <span className="text-[#d97706]">Aguardando atendente · </span>
              ) : sector ? (
                <span className="text-[#54656f]">{sector} · </span>
              ) : null}
              <span>{preview}</span>
            </p>
            {hasUnread ? (
              <span className={`flex h-[20px] min-w-[20px] shrink-0 items-center justify-center rounded-full bg-[#25d366] px-1.5 text-[10px] font-semibold leading-none text-white transition-opacity ${
                selectionMode ? 'opacity-0' : 'group-hover:opacity-0 group-focus-within:opacity-0'
              }`}>
                {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
              </span>
            ) : null}
          </div>

          {conversation.sub_assunto ? (
            <span className="sr-only">
              Assunto: {conversation.sub_assunto}
            </span>
          ) : null}
        </div>
      </button>

      <button
        type="button"
        onClick={onToggleSelected}
        aria-pressed={selected}
        aria-label={selected ? 'Remover conversa da seleção' : 'Selecionar conversa'}
        className={`absolute right-3 top-1/2 z-10 flex h-[24px] w-[24px] -translate-y-1/2 items-center justify-center rounded-full border-2 transition-all ${
          selected
            ? 'pointer-events-auto border-[#00a884] bg-[#00a884] text-white opacity-100'
            : selectionMode
              ? 'pointer-events-auto border-[#aebac1] bg-white text-transparent opacity-100'
              : 'pointer-events-none border-[#aebac1] bg-white text-transparent opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100'
        }`}
        title={selected ? 'Remover da seleção' : 'Selecionar conversa'}
      >
        <Check size={14} strokeWidth={3} />
      </button>
    </div>
  );
};

export default ConversationListItem;
