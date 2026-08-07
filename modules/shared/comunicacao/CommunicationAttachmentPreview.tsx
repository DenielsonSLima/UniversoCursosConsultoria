import React from 'react';
import { Download, File, FileSpreadsheet, FileText, Image, Mic } from 'lucide-react';
import {
  CommunicationAttachmentRecord,
  getCommunicationAttachmentDisplayUrl,
  getCommunicationAttachmentFileName,
  getCommunicationAttachmentPath,
} from './comunicacao-attachments.service';

interface CommunicationAttachmentPreviewProps {
  attachment: CommunicationAttachmentRecord;
  outgoing?: boolean;
}

const isImage = (value: string) => /\.(jpe?g|png|gif|webp)(\?.*)?$/i.test(value);
const isAudio = (value: string) => /\.(mp3|m4a|mp4|ogg|oga|wav|webm)(\?.*)?$/i.test(value);

const FileIcon = ({ value }: { value: string }) => {
  const lower = value.toLowerCase();
  if (/\.(mp3|m4a|mp4|ogg|oga|wav|webm)(\?.*)?$/.test(lower)) return <Mic size={14} />;
  if (/\.(jpe?g|png|gif|webp)(\?.*)?$/.test(lower)) return <Image size={14} />;
  if (/\.pdf(\?.*)?$/.test(lower)) return <FileText size={14} className="text-red-500" />;
  if (/\.(xls|xlsx)(\?.*)?$/.test(lower)) return <FileSpreadsheet size={14} className="text-emerald-600" />;
  if (/\.(doc|docx)(\?.*)?$/.test(lower)) return <FileText size={14} className="text-blue-600" />;
  return <File size={14} />;
};

export const CommunicationAttachmentPreview: React.FC<CommunicationAttachmentPreviewProps> = ({
  attachment,
  outgoing = false,
}) => {
  const url = getCommunicationAttachmentDisplayUrl(attachment);
  const hasAttachment = Boolean(getCommunicationAttachmentPath(attachment));
  if (!hasAttachment) return null;

  if (!url) {
    return (
      <div className={`border-b px-3 py-2 text-xs ${outgoing ? 'border-white/10 text-white/70' : 'border-slate-100 text-slate-500'}`}>
        Anexo indisponível
      </div>
    );
  }

  const fileName = getCommunicationAttachmentFileName(attachment);
  return (
    <div className={`border-b p-2 ${outgoing ? 'border-white/10' : 'border-slate-100'}`}>
      {isImage(fileName) ? (
        <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${fileName}`}>
          <img
            src={url}
            alt={fileName}
            className="max-h-[160px] max-w-[220px] cursor-pointer rounded-xl object-cover"
          />
        </a>
      ) : isAudio(fileName) ? (
        <div className={`min-w-[250px] rounded-xl px-3 py-2 ${outgoing ? 'bg-white/10' : 'bg-slate-50'}`}>
          <div className={`mb-2 flex items-center gap-2 text-[11px] font-bold ${outgoing ? 'text-blue-100' : 'text-slate-600'}`}>
            <span className={`flex h-7 w-7 items-center justify-center rounded-full ${outgoing ? 'bg-white/15 text-white' : 'bg-rose-100 text-rose-600'}`}>
              <Mic size={14} />
            </span>
            <span className="max-w-[180px] truncate">Mensagem de voz</span>
          </div>
          <audio controls preload="metadata" src={url} className="h-9 w-full max-w-[280px]" aria-label={`Reproduzir ${fileName}`}>
            Seu navegador não oferece suporte à reprodução de áudio.
          </audio>
        </div>
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
            outgoing
              ? 'bg-white/10 text-white hover:bg-white/20'
              : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
          }`}
        >
          <FileIcon value={fileName} />
          <span className="max-w-[160px] truncate">{fileName}</span>
          <Download size={12} className="shrink-0" />
        </a>
      )}
    </div>
  );
};
