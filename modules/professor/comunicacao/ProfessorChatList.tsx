import React from 'react';
import { Loader2, MessageSquare } from 'lucide-react';

interface Props {
  chats: any[];
  activeId: string | null;
  loading: boolean;
  error: boolean;
  categories: any[];
  onSelect: (id: string) => void;
}
export const professorChatTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

const ProfessorChatList: React.FC<Props> = ({ chats, activeId, loading, error, categories, onSelect }) => (
  <section className="professor-chat-list" aria-label="Histórico de chamados">
    <h3>Seus chamados</h3>
    <div className="professor-chat-list-items">
      {loading ? (
        <p role="status" className="flex items-center gap-2 p-3 professor-help"><Loader2 size={16} className="animate-spin" />Carregando chamados…</p>
      ) : error ? (
        <p role="alert" className="p-3 text-red-800">Não foi possível carregar os chamados. A consulta será retomada ao reconectar.</p>
      ) : chats.length === 0 ? (
        <div className="p-4 professor-help">
          <MessageSquare size={24} className="mb-2" />
          <p>Nenhum chamado aberto.</p><p className="mt-1">Use Novo chamado para falar com a coordenação.</p>
        </div>
      ) : chats.map((chat) => {
        const category = categories.find((item) => item.id === chat.categoria_id);
        return (
          <button key={chat.id} type="button" aria-current={activeId === chat.id ? 'page' : undefined} onClick={() => onSelect(chat.id)}>
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-[#001a33]">Coordenação Universo</span>
              <time className="shrink-0 professor-help">{professorChatTime(chat.ultima_data)}</time>
            </div>
            <p className="mt-1 line-clamp-2 break-words text-slate-600">{chat.ultimo_texto}</p>
            <p className="mt-2 flex flex-wrap items-center gap-2 professor-help">
              <span>{category?.nome || 'Geral'}</span><span aria-hidden="true">·</span>
              <span className={chat.status === 'pendente' ? 'text-amber-700' : 'text-emerald-700'}>{chat.status === 'pendente' ? 'Aberto' : 'Resolvido'}</span>
            </p>
          </button>
        );
      })}
    </div>
  </section>
);
export default ProfessorChatList;
