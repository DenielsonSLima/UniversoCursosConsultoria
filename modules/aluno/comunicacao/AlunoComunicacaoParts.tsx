import React, { RefObject, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Paperclip,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { CommunicationAttachmentPreview } from '../../shared/comunicacao/CommunicationAttachmentPreview';
import { ACCEPTED_ATTACHMENT_TYPES, formatChatTime, getFileIcon } from './comunicacao.helpers';
import { ComunicacaoMensagem } from './comunicacao.types';

export const CHAT_PAGE_SIZE = 8;

const DIALOG_FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export const useAccessibleDialog = (onClose: () => void) => {
  const dialogRef = useRef<React.ElementRef<'div'>>(null);
  const onCloseRef = useRef(onClose);
  const previousFocusRef = useRef<{ focus?: () => void } | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    previousFocusRef.current = document.activeElement as unknown as { focus?: () => void };
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      const preferredTarget = dialogRef.current?.querySelector<HTMLElement>('[data-dialog-autofocus]');
      const firstTarget = dialogRef.current?.querySelector<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR);
      (preferredTarget || firstTarget)?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR),
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        (last as unknown as { focus: () => void }).focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        (first as unknown as { focus: () => void }).focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, []);

  return dialogRef;
};

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
      <span className="text-[10px] text-slate-500 font-black uppercase tracking-wider md:text-[9px]">Página {page} de {pages}</span>
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
  error?: boolean;
  messages: ComunicacaoMensagem[];
  endRef: RefObject<HTMLDivElement | null>;
  onRetry?: () => void;
}> = ({ loading, error = false, messages, endRef, onRetry }) => (
  <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto overscroll-contain bg-slate-50/40 p-3 md:p-4">
    {loading ? (
      <div className="flex items-center justify-center gap-3 py-20 text-xs font-bold text-slate-500" role="status">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
        <span className="sr-only">Carregando mensagens</span>
      </div>
    ) : error ? (
      <div className="mx-auto my-8 max-w-sm rounded-2xl border border-rose-100 bg-white p-5 text-center shadow-sm" role="alert">
        <p className="text-xs font-black text-rose-700">Não foi possível carregar as mensagens.</p>
        {onRetry ? <button type="button" onClick={onRetry} className="mt-3 min-h-11 rounded-xl bg-[#001a33] px-4 text-[10px] font-black uppercase tracking-wider text-white">Tentar novamente</button> : null}
      </div>
    ) : !messages.length ? (
      <div className="flex min-h-40 items-center justify-center px-6 text-center text-xs font-medium text-slate-400">
        Nenhuma mensagem neste atendimento.
      </div>
    ) : messages.map((message) => {
      const isSelf = message.remetente_tipo === 'aluno';
      if (message.remetente_tipo === 'sistema') {
        return (
          <div key={message.id} className="flex justify-center my-4">
            <span className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 shadow-inner md:text-[9px]">
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
                <p className={`mb-1 text-[10px] font-black uppercase tracking-wider md:text-[8px] ${isSelf ? 'text-blue-300' : 'text-blue-600'}`}>{isSelf ? 'Você' : message.remetente_nome}</p>
                <p className="text-xs font-medium leading-relaxed break-words">{message.conteudo}</p>
              </div>
            )}
            <div className={`flex items-center justify-end px-3 pb-1.5 ${hasText ? '' : 'pt-1.5'}`}>
              <span className="text-[10px] font-bold text-slate-400 md:text-[8px]">{formatChatTime(message.created_at)}</span>
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
        <button type="button" onClick={() => onFileChange(null)} aria-label="Remover anexo" className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-blue-200 motion-reduce:transition-none md:h-8 md:w-8"><X size={14} className="text-slate-500" /></button>
      </div>
    )}
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => fileInputRef.current?.click()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600" title="Anexar arquivo" aria-label="Anexar arquivo"><Paperclip size={19} /></button>
      <input ref={fileInputRef} type="file" accept={ACCEPTED_ATTACHMENT_TYPES} className="hidden" onChange={(event) => { onFileChange(event.target.files?.[0] || null); event.target.value = ''; }} />
      <div className="flex-1 bg-slate-50 rounded-xl flex items-center px-4 border border-slate-200 focus-within:border-blue-500 focus-within:bg-white transition-all motion-reduce:transition-none">
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
}> = ({ deleting, onCancel, onConfirm }) => {
  const dialogRef = useAccessibleDialog(onCancel);

  return (
  <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm md:items-center md:p-4">
    <div ref={dialogRef} className="relative max-h-[calc(100dvh-env(safe-area-inset-top))] w-full max-w-sm overflow-y-auto overscroll-contain rounded-t-[2rem] border border-slate-100 bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6 shadow-2xl animate-fadeIn motion-reduce:animate-none md:rounded-[2rem] md:p-8" role="dialog" aria-modal="true" aria-labelledby="delete-chat-title" aria-describedby="delete-chat-description">
      <button data-dialog-autofocus type="button" onClick={onCancel} disabled={deleting} className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 disabled:opacity-40 motion-reduce:transition-none md:right-5 md:top-5" aria-label="Fechar confirmação"><X size={18} /></button>
      <div className="flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center"><AlertTriangle size={28} /></div>
        <div>
          <h4 id="delete-chat-title" className="text-base font-black text-[#001a33] uppercase tracking-tight">Remover Chamado</h4>
          <p id="delete-chat-description" className="text-slate-500 text-xs mt-2 leading-relaxed">Este chamado será removido <strong>apenas da sua lista</strong>. As mensagens e arquivos <strong>não serão apagados</strong> — o atendimento continuará visível para a equipe da escola.</p>
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
};
