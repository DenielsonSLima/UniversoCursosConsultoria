import React from 'react';
import { CheckSquare2, Square } from 'lucide-react';
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

interface ConversationListItemProps {
  conversation: WhatsAppConversation;
  flowSession?: WhatsAppFlowSession;
  active: boolean;
  selected: boolean;
  onSelect: () => void;
  onToggleSelected: () => void;
}

const ConversationListItem: React.FC<ConversationListItemProps> = ({
  conversation,
  flowSession,
  active,
  selected,
  onSelect,
  onToggleSelected,
}) => {
  const isHandoff = flowSession?.handoff_required || flowSession?.status === 'handoff';
  return (
    <div className={`flex w-full items-center gap-2 rounded-2xl p-2 transition-all ${active ? 'bg-emerald-50 ring-1 ring-emerald-100' : 'hover:bg-slate-50'}`}>
      <button
        type="button"
        onClick={onToggleSelected}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${selected ? 'bg-emerald-100 text-emerald-700' : 'text-slate-300 hover:bg-slate-100 hover:text-slate-500'}`}
        title={selected ? 'Remover da seleção' : 'Selecionar conversa'}
      >
        {selected ? <CheckSquare2 size={15} /> : <Square size={15} />}
      </button>
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left">
        <ContactAvatar name={conversation.contato_nome} photo={conversation.contato_foto} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-bold text-[#001a33]">{conversation.contato_nome}</p>
            <span className="flex shrink-0 flex-col items-end text-slate-400">
              <span className="text-[11px] font-semibold">{formatMessageDate(conversation.ultima_data)}</span>
              <span className="text-[10px] font-medium">{formatMessageTime(conversation.ultima_data)}</span>
            </span>
          </div>
          <p className="mt-1 truncate text-xs font-medium text-slate-500">{conversation.ultimo_texto || formatPhone(conversation.telefone)}</p>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
            {conversation.setor && (
              <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">
                {sectorLabel(conversation.setor)}
              </span>
            )}
            {flowSession && (
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${isHandoff ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {isHandoff ? 'Aguardando atendente' : 'Robô ativo'}
              </span>
            )}
            {conversation.sub_assunto && (
              <span className="max-w-full truncate text-[10px] font-semibold text-slate-400">
                {conversation.sub_assunto}
              </span>
            )}
          </div>
        </div>
        {conversation.unread_count > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-bold text-white">
            {conversation.unread_count}
          </span>
        )}
      </button>
    </div>
  );
};

export default ConversationListItem;
