import React, { useState } from 'react';
import { Download, FileText, Image, Loader2, Mic, Play, Wand2 } from 'lucide-react';
import { whatsappService } from '../whatsapp.service';
import { WhatsAppMessage } from '../whatsapp.types';
import { mediaDataUrl, mediaPayloadFor } from './mediaUtils';

interface MediaMessageActionsProps {
  message: WhatsAppMessage;
  outgoing: boolean;
}

const MediaMessageActions: React.FC<MediaMessageActionsProps> = ({ message, outgoing }) => {
  const media = mediaPayloadFor(message);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ url: string; mime: string; filename: string } | null>(null);
  const [transcription, setTranscription] = useState(media.transcription || '');

  const loadMedia = async () => {
    if (preview) return preview;
    setLoading(true);
    try {
      const file = await whatsappService.downloadMessageMedia(message.id);
      const next = { url: mediaDataUrl(file.base64, file.mime), mime: file.mime, filename: file.filename };
      setPreview(next);
      return next;
    } finally {
      setLoading(false);
    }
  };

  const download = async () => {
    const file = await loadMedia();
    if (!file) return;
    const link = document.createElement('a');
    link.href = file.url;
    link.download = file.filename;
    link.click();
  };

  const transcribe = async () => {
    setLoading(true);
    try {
      setTranscription(await whatsappService.transcribeMessageAudio(message.id));
    } finally {
      setLoading(false);
    }
  };

  const textClass = outgoing ? 'text-white/90' : 'text-slate-600';
  const buttonClass = outgoing
    ? 'border-white/20 bg-white/10 text-white hover:bg-white/15'
    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100';

  return (
    <div className="mt-2 space-y-2">
      <div className={`flex flex-wrap gap-2 text-xs font-bold ${textClass}`}>
        {media.type === 'image' && <MediaButton icon={Image} label="Ver imagem" className={buttonClass} loading={loading} onClick={loadMedia} />}
        {media.type === 'audio' && <MediaButton icon={Play} label="Ouvir áudio" className={buttonClass} loading={loading} onClick={loadMedia} />}
        {media.type === 'audio' && <MediaButton icon={Wand2} label="Transcrever" className={buttonClass} loading={loading} onClick={transcribe} />}
        {media.type === 'document' && <MediaButton icon={FileText} label="Abrir PDF" className={buttonClass} loading={loading} onClick={download} />}
        {media.type !== 'document' && preview && <MediaButton icon={Download} label="Baixar" className={buttonClass} loading={false} onClick={download} />}
      </div>

      {preview && media.type === 'image' && (
        <img src={preview.url} alt={media.caption || 'Imagem WhatsApp'} className="max-h-64 rounded-xl object-contain" />
      )}
      {preview && media.type === 'audio' && (
        <audio controls src={preview.url} className="w-full min-w-[260px]" />
      )}
      {transcription && (
        <div className={`rounded-xl p-3 text-xs font-semibold leading-relaxed ${outgoing ? 'bg-white/10 text-white/90' : 'bg-emerald-50 text-emerald-900'}`}>
          {transcription}
        </div>
      )}
    </div>
  );
};

const MediaButton = ({ icon: Icon, label, className, loading, onClick }: {
  icon: React.ElementType;
  label: string;
  className: string;
  loading: boolean;
  onClick: () => void;
}) => (
  <button type="button" onClick={onClick} disabled={loading} className={`inline-flex min-h-[30px] items-center gap-1.5 rounded-lg border px-2.5 transition-colors disabled:opacity-50 ${className}`}>
    {loading ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
    {label}
  </button>
);

export default MediaMessageActions;
