import React, { useEffect, useRef, useState } from 'react';
import { FileText, Image, Mic, Paperclip, Send, X } from 'lucide-react';
import { WhatsAppConversation, WhatsAppMediaKind } from '../whatsapp.types';
import { normalizePhone } from '../whatsapp.utils';
import { mediaKindFromFile } from './mediaUtils';

interface MessageComposerProps {
  activeConversation: WhatsAppConversation | null;
  apiReady: boolean;
  sendTyping: (typing: boolean) => void;
  onSendReply: (message: string) => Promise<void>;
  onSendMedia: (input: { file: File; kind: WhatsAppMediaKind; caption: string }) => Promise<void>;
}

const accept = 'image/*,audio/*,application/pdf,.pdf';

const MessageComposer: React.FC<MessageComposerProps> = ({
  activeConversation,
  apiReady,
  sendTyping,
  onSendReply,
  onSendMedia,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [reply, setReply] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setReply('');
    setFile(null);
    sendTyping(false);
  }, [activeConversation?.id, sendTyping]);

  if (!activeConversation) return null;

  const disabled = !activeConversation.aluno_id || !apiReady;
  const canSend = Boolean(!disabled && (reply.trim() || file) && normalizePhone(activeConversation.telefone));

  const pickIcon = (kind: WhatsAppMediaKind) => {
    if (kind === 'image') return <Image size={14} />;
    if (kind === 'audio') return <Mic size={14} />;
    return <FileText size={14} />;
  };

  const send = async () => {
    if (!canSend || sending) return;

    setSending(true);
    try {
      if (file) {
        await onSendMedia({ file, kind: mediaKindFromFile(file), caption: reply.trim() });
      } else {
        await onSendReply(reply.trim());
      }
      setReply('');
      setFile(null);
    } finally {
      sendTyping(false);
      setSending(false);
    }
  };

  const updateReply = (value: string) => {
    setReply(value);
    sendTyping(Boolean(value.trim()));
  };

  const selectedKind = file ? mediaKindFromFile(file) : null;

  return (
    <div className="border-t border-slate-100 bg-white p-4">
      {file && selectedKind && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
          <span className="flex min-w-0 items-center gap-2">
            {pickIcon(selectedKind)}
            <span className="truncate">{file.name}</span>
          </span>
          <button type="button" onClick={() => setFile(null)} className="rounded-lg p-1 hover:bg-white/70" title="Remover anexo">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex items-end gap-3">
        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(event) => setFile(event.target.files?.[0] || null)} />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-40" title="Anexar áudio, foto ou PDF">
          <Paperclip size={17} />
        </button>
        <textarea
          value={reply}
          onChange={(event) => updateReply(event.target.value)}
          onBlur={() => sendTyping(false)}
          rows={1}
          placeholder={file ? 'Legenda opcional...' : activeConversation.aluno_id ? 'Escreva sua resposta...' : 'Contato sem aluno vinculado'}
          disabled={disabled}
          className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-emerald-500 disabled:opacity-50"
        />
        <button onClick={send} disabled={sending || !canSend} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white transition-colors hover:bg-emerald-700 disabled:opacity-40">
          <Send size={17} />
        </button>
      </div>
    </div>
  );
};

export default MessageComposer;
