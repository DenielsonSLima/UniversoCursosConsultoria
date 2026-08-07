import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Download, FileText, Image, Loader2, Play, Wand2 } from 'lucide-react';
import { whatsappService } from '../whatsapp.service';
import { WhatsAppMessage } from '../whatsapp.types';
import { mediaDataUrl, mediaPayloadFor } from './mediaUtils';
import WhatsAppAudioPlayer from './WhatsAppAudioPlayer';

interface MediaMessageActionsProps {
  message: WhatsAppMessage;
  outgoing: boolean;
}

const friendlyLoadError = (mediaType: string) => {
  if (mediaType === 'audio') return 'Não foi possível carregar este áudio agora. Tente novamente.';
  if (mediaType === 'image') return 'Não foi possível carregar esta imagem agora. Tente novamente.';
  if (mediaType === 'document') return 'Não foi possível abrir este documento agora. Tente novamente.';
  return 'Não foi possível carregar esta mídia agora. Tente novamente.';
};

const MediaMessageActions: React.FC<MediaMessageActionsProps> = ({ message, outgoing }) => {
  const media = mediaPayloadFor(message);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ url: string; mime: string; filename: string } | null>(() => (
    media.link ? { url: String(media.link), mime: media.mime, filename: media.filename } : null
  ));
  const [loadError, setLoadError] = useState('');
  const [transcription, setTranscription] = useState(media.transcription || '');
  const containerRef = useRef<HTMLDivElement>(null);

  const loadMedia = useCallback(async () => {
    if (preview) return preview;
    setLoading(true);
    setLoadError('');
    try {
      const file = await whatsappService.downloadMessageMedia(message.id);
      const next = { url: mediaDataUrl(file.base64, file.mime), mime: file.mime, filename: file.filename };
      setPreview(next);
      return next;
    } catch {
      console.error(`[WhatsApp] Falha ao carregar ${media.type} da mensagem ${message.id}.`);
      setLoadError(friendlyLoadError(media.type));
      return null;
    } finally {
      setLoading(false);
    }
  }, [media.filename, media.mime, media.type, message.id, preview]);

  useEffect(() => {
    if (!['image', 'audio'].includes(media.type) || preview || !media.id) return;
    const element = containerRef.current;
    if (!element) return;
    const observer = new window.IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void loadMedia();
    }, { rootMargin: '200px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [loadMedia, media.id, media.type, preview]);

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
    setLoadError('');
    try {
      setTranscription(await whatsappService.transcribeMessageAudio(message.id));
    } catch {
      console.error(`[WhatsApp] Falha ao transcrever o áudio da mensagem ${message.id}.`);
      setLoadError('Não foi possível transcrever este áudio agora. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const textClass = 'text-[#3b4a54]';
  const buttonClass = outgoing
    ? 'border-[#b8cfb4] bg-white/35 text-[#3b4a54] hover:bg-white/55'
    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100';

  return (
    <div ref={containerRef} className="space-y-2">
      {loading && media.type === 'image' && !preview && (
        <div className={`flex h-44 min-w-64 items-center justify-center rounded-lg ${outgoing ? 'bg-white/35' : 'bg-slate-100'}`}>
          <Loader2 size={22} className="animate-spin opacity-70" />
        </div>
      )}
      {preview && media.type === 'image' && (
        <img
          src={preview.url}
          alt={media.caption || 'Imagem WhatsApp'}
          className="max-h-80 w-full min-w-64 rounded-lg object-cover"
          loading="lazy"
        />
      )}
      {loading && media.type === 'audio' && !preview && (
        <div className={`flex min-h-12 min-w-[280px] items-center gap-3 rounded-full px-4 ${outgoing ? 'bg-white/35' : 'bg-slate-100'}`}>
          <Loader2 size={18} className="animate-spin opacity-70" />
          <span className="text-xs font-bold opacity-70">Carregando áudio...</span>
        </div>
      )}
      {preview && media.type === 'audio' && (
        <WhatsAppAudioPlayer src={preview.url} outgoing={outgoing} />
      )}

      <div className={`flex flex-wrap gap-2 text-xs font-bold ${textClass}`}>
        {media.type === 'image' && !preview && !loading && <MediaButton icon={Image} label="Carregar imagem" className={buttonClass} loading={loading} onClick={loadMedia} />}
        {media.type === 'audio' && !preview && !loading && <MediaButton icon={Play} label="Carregar áudio" className={buttonClass} loading={loading} onClick={loadMedia} />}
        {media.type === 'audio' && <MediaButton icon={Wand2} label="Transcrever" className={buttonClass} loading={loading} onClick={transcribe} />}
        {media.type === 'document' && <MediaButton icon={FileText} label="Abrir PDF" className={buttonClass} loading={loading} onClick={download} />}
        {media.type !== 'document' && preview && <MediaButton icon={Download} label="Baixar" className={buttonClass} loading={false} onClick={download} />}
      </div>

      {loadError && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg bg-[#fff4e5] px-2.5 py-2 text-xs font-medium leading-relaxed text-[#7a4d00]"
        >
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}
      {transcription && (
        <div className={`rounded-lg p-3 text-xs font-semibold leading-relaxed ${outgoing ? 'bg-white/35 text-[#111b21]' : 'bg-emerald-50 text-emerald-900'}`}>
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
