import React, { RefObject } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MessageSquare,
  Paperclip,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { CommunicationAttachmentPreview } from '../../shared/comunicacao/CommunicationAttachmentPreview';
import { ACCEPTED_ATTACHMENT_TYPES, formatChatTime, getFileIcon } from './comunicacao.helpers';
import { ComunicacaoCategoria, ComunicacaoMensagem } from './comunicacao.types';

export const CHAT_PAGE_SIZE = 8;

export const AlunoChatPagination: React.FC<{
  page: number;
  total: number;
  onPage: (page: number) => void;
}> = ({ page, total, onPage }) => {
  const pages = Math.max(1, Math.ceil(total / CHAT_PAGE_SIZE));
  if (pages <= 1) return null;

  const buttonClass = 'flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition-colors md:h-auto md:w-auto md:p-1.5';
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-3 py-2 md:rounded-none md:border-x-0 md:border-b-0 md:px-2">
      <span className="text-[9px] text-slate-500 font-black uppercase tracking-wider">Página {page} de {pages}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(1)} disabled={page === 1} className={buttonClass} aria-label="Primeira página"><ChevronsLeft size={14} /></button>
        <button onClick={() => onPage(page - 1)} disabled={page === 1} className={buttonClass} aria-label="Página anterior"><ChevronLeft size={14} /></button>
        <button onClick={() => onPage(page + 1)} disabled={page === pages} className={buttonClass} aria-label="Próxima página"><ChevronRight size={14} /></button>
        <button onClick={() => onPage(pages)} disabled={page === pages} className={buttonClass} aria-label="Última página"><ChevronsRight size={14} /></button>
      </div>
    </div>
  );
};

export const AlunoMessageList: React.FC<{
  loading: boolean;
  messages: ComunicacaoMensagem[];
  endRef: RefObject<HTMLDivElement | null>;
}> = ({ loading, messages, endRef }) => (
  <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/40 p-3 custom-scrollbar md:p-4">
    {loading ? (
      <div className="flex justify-center items-center py-20"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
    ) : messages.map((message) => {
      const isSelf = message.remetente_tipo === 'aluno';
      if (message.remetente_tipo === 'sistema') {
        return (
          <div key={message.id} className="flex justify-center my-4">
            <span className="bg-slate-100 border border-slate-200 text-slate-500 text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-full shadow-inner flex items-center gap-1">
              <Sparkles size={9} /> {message.conteudo}
            </span>
          </div>
        );
      }
      const hasText = Boolean(message.conteudo && !message.conteudo.startsWith('📎'));
      return (
        <div key={message.id} className={`flex items-end gap-2 ${isSelf ? 'justify-end' : 'justify-start'}`}>
          {!isSelf && <div className="w-7 h-7 bg-[#001a33] text-white rounded-lg flex items-center justify-center font-bold text-[10px] shrink-0">AD</div>}
          <div className={`max-w-[82%] overflow-hidden rounded-2xl border shadow-sm md:max-w-sm ${isSelf ? 'bg-[#001a33] text-white border-transparent rounded-br-sm' : 'bg-white text-slate-700 border-slate-100 rounded-bl-sm'}`}>
            <CommunicationAttachmentPreview attachment={message} outgoing={isSelf} />
            {hasText && (
              <div className="px-3 pt-2 pb-1">
                <p className={`text-[8px] font-black uppercase tracking-wider mb-1 ${isSelf ? 'text-blue-300' : 'text-blue-600'}`}>{isSelf ? 'Você' : message.remetente_nome}</p>
                <p className="text-xs font-medium leading-relaxed break-words">{message.conteudo}</p>
              </div>
            )}
            <div className={`flex items-center justify-end px-3 pb-1.5 ${hasText ? '' : 'pt-1.5'}`}>
              <span className="text-[8px] font-bold text-slate-400">{formatChatTime(message.created_at)}</span>
            </div>
          </div>
        </div>
      );
    })}
    <div ref={endRef} />
  </div>
);

export const AlunoMessageComposer: React.FC<{
  fileInputRef: RefObject<HTMLInputElement | null>;
  messageText: string;
  pendingFile: File | null;
  uploading: boolean;
  onFileChange: (file: File | null) => void;
  onMessageChange: (value: string) => void;
  onSend: () => void;
}> = ({ fileInputRef, messageText, pendingFile, uploading, onFileChange, onMessageChange, onSend }) => (
  <div className="space-y-2 p-3">
    {pendingFile && (
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl">
        {getFileIcon(null, pendingFile.type)}
        <span className="text-xs font-bold text-slate-700 truncate flex-1">{pendingFile.name}</span>
        <button type="button" onClick={() => onFileChange(null)} aria-label="Remover anexo" className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-blue-200"><X size={14} className="text-slate-500" /></button>
      </div>
    )}
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => fileInputRef.current?.click()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600" title="Anexar arquivo" aria-label="Anexar arquivo"><Paperclip size={19} /></button>
      <input ref={fileInputRef} type="file" accept={ACCEPTED_ATTACHMENT_TYPES} className="hidden" onChange={(event) => { onFileChange(event.target.files?.[0] || null); event.target.value = ''; }} />
      <div className="flex-1 bg-slate-50 rounded-xl flex items-center px-4 border border-slate-200 focus-within:border-blue-500 focus-within:bg-white transition-all">
        <input type="text" value={messageText} onChange={(event) => onMessageChange(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && !event.shiftKey && onSend()} placeholder="Escreva sua mensagem..." className="w-full border-none bg-transparent py-3 text-base font-medium text-slate-700 outline-none md:text-xs" />
      </div>
      <button type="button" onClick={onSend} disabled={(!messageText.trim() && !pendingFile) || uploading} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#001a33] text-white shadow-md transition-colors hover:bg-blue-900 disabled:opacity-40" aria-label="Enviar mensagem">
        {uploading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent motion-reduce:animate-none" /> : <Send size={17} />}
      </button>
    </div>
    <p className="hidden pl-12 text-[9px] font-medium text-slate-400 md:block">Aceita: imagens, PDF, Word, Excel, PowerPoint</p>
  </div>
);

export const AlunoDeleteChatModal: React.FC<{
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ deleting, onCancel, onConfirm }) => (
  <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm md:items-center md:p-4" role="dialog" aria-modal="true" aria-labelledby="delete-chat-title">
    <div className="relative w-full max-w-sm rounded-t-[2rem] border border-slate-100 bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6 shadow-2xl animate-fadeIn md:rounded-[2rem] md:p-8">
      <div className="flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center"><AlertTriangle size={28} /></div>
        <div>
          <h4 id="delete-chat-title" className="text-base font-black text-[#001a33] uppercase tracking-tight">Remover Chamado</h4>
          <p className="text-slate-500 text-xs mt-2 leading-relaxed">Este chamado será removido <strong>apenas da sua lista</strong>. As mensagens e arquivos <strong>não serão apagados</strong> — o atendimento continuará visível para a equipe da escola.</p>
        </div>
        <div className="flex gap-3 w-full mt-2">
          <button type="button" onClick={onCancel} disabled={deleting} className="min-h-12 flex-1 rounded-xl bg-slate-100 py-3 text-xs font-bold uppercase tracking-widest text-slate-700 transition-all hover:bg-slate-200">Cancelar</button>
          <button type="button" onClick={onConfirm} disabled={deleting} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 py-3 text-xs font-bold uppercase tracking-widest text-white shadow-md transition-all hover:bg-red-600 disabled:opacity-50">
            {deleting ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent motion-reduce:animate-none" /> : <><Trash2 size={13} /> Remover</>}
          </button>
        </div>
      </div>
    </div>
  </div>
);

export const AlunoNewChatModal: React.FC<{
  categories: ComunicacaoCategoria[];
  categoryId: string;
  subject: string;
  onCategoryChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onSubjectChange: (value: string) => void;
}> = ({ categories, categoryId, subject, onCategoryChange, onClose, onSubmit, onSubjectChange }) => (
  <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm md:items-center md:p-4" role="dialog" aria-modal="true" aria-labelledby="new-chat-title">
    <div className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[2rem] border border-slate-100 bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6 shadow-2xl animate-fadeIn md:rounded-[2.5rem] md:p-8">
      <button type="button" onClick={onClose} className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 md:right-6 md:top-6 md:h-auto md:w-auto md:p-2" aria-label="Fechar"><X size={18} /></button>
      <div className="mb-6">
        <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-3"><MessageSquare size={20} /></div>
        <h4 id="new-chat-title" className="text-lg font-black text-[#001a33] uppercase tracking-tight">Abrir Novo Chamado</h4>
        <p className="text-slate-500 text-xs mt-1">Selecione o setor e descreva sua dúvida ou problema.</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Setor de Destino</label>
          <select required value={categoryId} onChange={(event) => onCategoryChange(event.target.value)} className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-bold text-slate-700 outline-none transition-all focus:border-blue-500 focus:bg-white md:text-xs">
            <option value="">Selecione uma categoria...</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.nome}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Dúvida / Assunto</label>
          <textarea required rows={4} placeholder="Descreva detalhadamente o que você precisa..." value={subject} onChange={(event) => onSubjectChange(event.target.value)} className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-medium text-slate-700 outline-none transition-all focus:border-blue-500 focus:bg-white md:text-xs" />
        </div>
        <button type="submit" className="min-h-12 w-full rounded-xl bg-[#001a33] py-3 text-xs font-bold uppercase tracking-widest text-white shadow-lg transition-all hover:bg-blue-900">Abrir Chamado</button>
      </form>
    </div>
  </div>
);
