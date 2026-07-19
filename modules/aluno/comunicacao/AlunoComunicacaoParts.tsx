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

  const buttonClass = 'p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition-colors';
  return (
    <div className="border-t border-slate-100 px-2 py-2 bg-white flex items-center justify-between">
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
  <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-slate-50/40">
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
          <div className={`rounded-2xl max-w-sm shadow-sm border overflow-hidden ${isSelf ? 'bg-[#001a33] text-white border-transparent rounded-br-sm' : 'bg-white text-slate-700 border-slate-100 rounded-bl-sm'}`}>
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
  <div className="p-3 space-y-2">
    {pendingFile && (
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl">
        {getFileIcon(null, pendingFile.type)}
        <span className="text-xs font-bold text-slate-700 truncate flex-1">{pendingFile.name}</span>
        <button onClick={() => onFileChange(null)} className="p-0.5 hover:bg-blue-200 rounded-full transition-colors"><X size={12} className="text-slate-500" /></button>
      </div>
    )}
    <div className="flex items-center gap-2">
      <button onClick={() => fileInputRef.current?.click()} className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors shrink-0" title="Anexar arquivo"><Paperclip size={18} /></button>
      <input ref={fileInputRef} type="file" accept={ACCEPTED_ATTACHMENT_TYPES} className="hidden" onChange={(event) => { onFileChange(event.target.files?.[0] || null); event.target.value = ''; }} />
      <div className="flex-1 bg-slate-50 rounded-xl flex items-center px-4 border border-slate-200 focus-within:border-blue-500 focus-within:bg-white transition-all">
        <input type="text" value={messageText} onChange={(event) => onMessageChange(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && !event.shiftKey && onSend()} placeholder="Escreva sua mensagem..." className="w-full bg-transparent border-none outline-none text-xs text-slate-700 py-3 font-medium" />
      </div>
      <button onClick={onSend} disabled={(!messageText.trim() && !pendingFile) || uploading} className="p-2.5 bg-[#001a33] text-white rounded-xl hover:bg-blue-900 transition-colors shadow-md disabled:opacity-40 shrink-0">
        {uploading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send size={16} />}
      </button>
    </div>
    <p className="text-[9px] text-slate-400 pl-12 font-medium">Aceita: imagens, PDF, Word, Excel, PowerPoint</p>
  </div>
);

export const AlunoDeleteChatModal: React.FC<{
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ deleting, onCancel, onConfirm }) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-[2rem] p-8 max-w-sm w-full border border-slate-100 shadow-2xl relative animate-fadeIn">
      <div className="flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center"><AlertTriangle size={28} /></div>
        <div>
          <h4 className="text-base font-black text-[#001a33] uppercase tracking-tight">Remover Chamado</h4>
          <p className="text-slate-500 text-xs mt-2 leading-relaxed">Este chamado será removido <strong>apenas da sua lista</strong>. As mensagens e arquivos <strong>não serão apagados</strong> — o atendimento continuará visível para a equipe da escola.</p>
        </div>
        <div className="flex gap-3 w-full mt-2">
          <button onClick={onCancel} disabled={deleting} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-widest rounded-xl transition-all">Cancelar</button>
          <button onClick={onConfirm} disabled={deleting} className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2">
            {deleting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Trash2 size={13} /> Remover</>}
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
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full border border-slate-100 shadow-2xl relative animate-fadeIn">
      <button onClick={onClose} className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-full transition-colors"><X size={18} /></button>
      <div className="mb-6">
        <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-3"><MessageSquare size={20} /></div>
        <h4 className="text-lg font-black text-[#001a33] uppercase tracking-tight">Abrir Novo Chamado</h4>
        <p className="text-slate-500 text-xs mt-1">Selecione o setor e descreva sua dúvida ou problema.</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Setor de Destino</label>
          <select required value={categoryId} onChange={(event) => onCategoryChange(event.target.value)} className="w-full bg-slate-50 border border-slate-200 outline-none rounded-xl px-4 py-3 text-xs font-bold text-slate-700 focus:border-blue-500 focus:bg-white transition-all cursor-pointer">
            <option value="">Selecione uma categoria...</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.nome}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Dúvida / Assunto</label>
          <textarea required rows={4} placeholder="Descreva detalhadamente o que você precisa..." value={subject} onChange={(event) => onSubjectChange(event.target.value)} className="w-full bg-slate-50 border border-slate-200 outline-none rounded-xl px-4 py-3 text-xs font-medium text-slate-700 focus:border-blue-500 focus:bg-white transition-all resize-none" />
        </div>
        <button type="submit" className="w-full py-3 bg-[#001a33] hover:bg-blue-900 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg">Abrir Chamado</button>
      </form>
    </div>
  </div>
);
