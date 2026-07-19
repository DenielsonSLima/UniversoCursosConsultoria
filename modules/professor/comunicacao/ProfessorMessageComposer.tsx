import React, { RefObject } from 'react';
import { FileText, Image, Paperclip, Send, X } from 'lucide-react';

const PROFESSOR_ATTACHMENT_ACCEPT = [
  'image/png',
  'image/jpeg',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.png',
  '.jpg',
  '.jpeg',
  '.pdf',
  '.doc',
  '.docx',
].join(',');

const ALLOWED_EXTENSIONS = /\.(png|jpe?g|pdf|docx?)$/i;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const validateFile = (file: File) => {
  if (!ALLOWED_EXTENSIONS.test(file.name)) {
    return 'Formato não permitido. Use PNG, JPEG, PDF, DOC ou DOCX.';
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return 'O anexo deve ter no máximo 25 MB.';
  }
  return null;
};

interface ProfessorMessageComposerProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  messageText: string;
  pendingFile: File | null;
  uploading: boolean;
  onFile: (file: File | null) => void;
  onFileError: (message: string) => void;
  onMessage: (value: string) => void;
  onSend: () => void;
}

export const ProfessorMessageComposer: React.FC<ProfessorMessageComposerProps> = ({
  fileInputRef,
  messageText,
  pendingFile,
  uploading,
  onFile,
  onFileError,
  onMessage,
  onSend,
}) => {
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;
    const validationError = validateFile(file);
    if (validationError) {
      onFileError(validationError);
      return;
    }
    onFile(file);
  };

  return (
    <div className="space-y-2">
      {pendingFile && (
        <div className="flex items-center gap-2 rounded-xl border border-purple-100 bg-purple-50 px-3 py-2">
          {/^image\//i.test(pendingFile.type) ? <Image size={14} /> : <FileText size={14} />}
          <span className="flex-1 truncate text-xs font-bold text-slate-700">{pendingFile.name}</span>
          <button
            type="button"
            onClick={() => onFile(null)}
            className="rounded-full p-0.5 transition-colors hover:bg-purple-200"
            aria-label="Remover anexo"
          >
            <X size={12} className="text-slate-500" />
          </button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="rounded-xl p-2.5 text-slate-450 transition-colors hover:bg-purple-50 hover:text-purple-600 disabled:opacity-40"
          title="Anexar arquivo"
        >
          <Paperclip size={18} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={PROFESSOR_ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={handleFileChange}
        />
        <div className="flex flex-1 items-center overflow-hidden rounded-xl border border-slate-150 bg-slate-50 px-4.5 py-1.5 shadow-inner transition-all focus-within:border-purple-500 focus-within:bg-white">
          <input
            type="text"
            value={messageText}
            onChange={(event) => onMessage(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && !event.shiftKey && onSend()}
            placeholder="Escreva sua mensagem..."
            className="w-full border-none bg-transparent py-1.5 text-xs font-medium text-slate-700 outline-none"
          />
        </div>
        <button
          type="button"
          onClick={onSend}
          disabled={(!messageText.trim() && !pendingFile) || uploading}
          className="rounded-xl bg-[#001a33] p-2.5 text-white shadow-lg transition-colors hover:bg-purple-650 disabled:opacity-50"
        >
          {uploading ? (
            <span className="block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Send size={16} />
          )}
        </button>
      </div>
      <p className="pl-12 text-[9px] font-medium text-slate-400">
        Aceita: PNG, JPEG, PDF, DOC e DOCX (até 25 MB)
      </p>
    </div>
  );
};
