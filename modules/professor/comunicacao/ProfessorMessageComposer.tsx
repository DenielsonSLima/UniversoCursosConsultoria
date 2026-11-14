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
        <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
          {/^image\//i.test(pendingFile.type) ? <Image size={14} /> : <FileText size={14} />}
          <span className="flex-1 truncate text-xs font-bold text-slate-700">{pendingFile.name}</span>
          <button
            type="button"
            onClick={() => onFile(null)}
            disabled={uploading}
            className="professor-composer-button hover:bg-blue-100"
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
          className="professor-composer-button text-slate-600 hover:bg-blue-50 disabled:opacity-40"
          title="Anexar arquivo"
          aria-label="Anexar arquivo"
        >
          <Paperclip size={18} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={PROFESSOR_ATTACHMENT_ACCEPT}
          disabled={uploading}
          className="hidden"
          onChange={handleFileChange}
        />
        <div className="min-w-0 flex-1">
          <input
            type="text"
            value={messageText}
            onChange={(event) => onMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !uploading) {
                event.preventDefault();
                onSend();
              }
            }}
            placeholder="Escreva sua mensagem…"
            aria-label="Mensagem"
            disabled={uploading}
            className="professor-input"
          />
        </div>
        <button
          type="button"
          onClick={onSend}
          aria-label="Enviar mensagem"
          disabled={(!messageText.trim() && !pendingFile) || uploading}
          className="professor-composer-button bg-[#001a33] text-white disabled:opacity-50"
        >
          {uploading ? (
            <span className="block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Send size={16} />
          )}
        </button>
      </div>
      <p className="professor-help">
        Aceita: PNG, JPEG, PDF, DOC e DOCX (até 25 MB)
      </p>
    </div>
  );
};
