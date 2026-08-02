/* global DOMException, MediaRecorder, MediaStream */
import React, { useEffect, useRef, useState } from 'react';
import { Download, FileText, Loader2, Mic, Paperclip, Send, Square, X } from 'lucide-react';
import {
  formatPublicSupportFileSize,
  getPublicSupportAttachmentName,
  getSafePublicSupportAttachmentUrl,
  isPublicSupportAudio,
  isPublicSupportImage,
  PUBLIC_SUPPORT_ACCEPTED_FILES,
  validatePublicSupportFile,
} from './public-support-media';

export const PublicSupportAttachment: React.FC<{
  path?: string | null;
  url?: string | null;
  outgoing: boolean;
}> = ({ path, url, outgoing }) => {
  const safeUrl = getSafePublicSupportAttachmentUrl(url);
  const name = getPublicSupportAttachmentName(path);
  const colorClass = outgoing ? 'border-white/15 bg-white/10 text-white' : 'border-slate-200 bg-slate-50 text-slate-700';

  if (!path) return null;
  if (!safeUrl) return <div className={`rounded-xl border px-3 py-2 text-xs font-semibold ${colorClass}`}>Anexo indisponível</div>;
  if (isPublicSupportAudio(path)) {
    return (
      <div className={`rounded-xl border p-2 ${colorClass}`}>
        <p className="mb-2 truncate px-1 text-[10px] font-bold">Mensagem de áudio</p>
        <audio controls preload="metadata" src={safeUrl} className="h-10 w-full min-w-[220px]" aria-label={`Reproduzir ${name}`} />
      </div>
    );
  }
  if (isPublicSupportImage(path)) {
    return (
      <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="block" aria-label={`Abrir ${name} em nova aba`}>
        <img src={safeUrl} alt={name} loading="lazy" className="max-h-56 w-full rounded-xl object-cover" />
      </a>
    );
  }
  return (
    <a href={safeUrl} target="_blank" rel="noopener noreferrer" className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${colorClass}`}>
      <FileText size={17} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <Download size={15} className="shrink-0" aria-hidden="true" />
      <span className="sr-only">Abrir anexo em nova aba</span>
    </a>
  );
};

const recordingExtension = (mimeType: string) => {
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm';
};

const formatDuration = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

export const PublicSupportComposer: React.FC<{
  sending: boolean;
  onSendAttachment: (file: File) => Promise<void>;
  onSendMessage: (message: string) => Promise<void>;
}> = ({ sending, onSendAttachment, onSendMessage }) => {
  const [message, setMessage] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [localError, setLocalError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelRecordingRef = useRef(false);

  useEffect(() => {
    if (!recording) return undefined;
    const timer = window.setInterval(() => setRecordingSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => {
    cancelRecordingRef.current = true;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const selectFile = (file: File | null) => {
    if (!file) return;
    const validationError = validatePublicSupportFile(file);
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    setLocalError('');
    setPendingFile(file);
  };

  const startRecording = async () => {
    setLocalError('');
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setLocalError('A gravação de áudio não é compatível com este navegador.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = preferredType ? new MediaRecorder(stream, { mimeType: preferredType }) : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      cancelRecordingRef.current = false;
      setPendingFile(null);
      setRecordingSeconds(0);
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onerror = () => setLocalError('Não foi possível concluir a gravação.');
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setRecording(false);
        if (cancelRecordingRef.current) return;
        const type = recorder.mimeType || chunksRef.current[0]?.type || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const file = new File([blob], `audio-${new Date().toISOString().replace(/[:.]/g, '-')}.${recordingExtension(type)}`, { type: type.split(';')[0] });
        selectFile(file);
      };
      recorder.start(250);
      setRecording(true);
    } catch (error) {
      const denied = error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name);
      setLocalError(denied ? 'Permita o acesso ao microfone para gravar um áudio.' : 'Não foi possível acessar o microfone.');
    }
  };

  const finishRecording = (cancel = false) => {
    cancelRecordingRef.current = cancel;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const send = async () => {
    if (sending || recording) return;
    setLocalError('');
    try {
      if (pendingFile) {
        await onSendAttachment(pendingFile);
        setPendingFile(null);
        return;
      }
      const normalized = message.trim();
      if (!normalized) return;
      await onSendMessage(normalized);
      setMessage('');
    } catch {
      // A mensagem de erro detalhada é exibida pelo componente pai.
    }
  };

  return (
    <div className="space-y-2">
      <div aria-live="polite">
        {recording ? (
          <div className="flex min-h-11 items-center gap-3 rounded-xl border border-rose-100 bg-rose-50 px-3 text-xs font-bold text-rose-700">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500 motion-reduce:animate-none" aria-hidden="true" />
            <span className="flex-1">Gravando {formatDuration(recordingSeconds)}</span>
            <button type="button" onClick={() => finishRecording(true)} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-rose-100" aria-label="Cancelar gravação"><X size={16} /></button>
            <button type="button" onClick={() => finishRecording(false)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-600 text-white" aria-label="Concluir gravação"><Square size={14} fill="currentColor" /></button>
          </div>
        ) : pendingFile ? (
          <div className="flex min-h-11 items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 text-xs font-bold text-slate-700">
            {pendingFile.type.startsWith('audio/') ? <Mic size={16} className="text-blue-600" /> : <Paperclip size={16} className="text-blue-600" />}
            <span className="min-w-0 flex-1 truncate">{pendingFile.name}</span>
            <span className="shrink-0 text-[10px] text-slate-500">{formatPublicSupportFileSize(pendingFile.size)}</span>
            <button type="button" onClick={() => setPendingFile(null)} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-blue-100" aria-label="Remover anexo"><X size={15} /></button>
          </div>
        ) : null}
      </div>
      {localError ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{localError}</p> : null}
      <form onSubmit={(event) => { event.preventDefault(); void send(); }} className="flex min-h-12 items-end gap-1 rounded-2xl bg-slate-100 p-1.5">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={sending || recording} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-white hover:text-blue-700 disabled:opacity-40" aria-label="Anexar arquivo"><Paperclip size={18} /></button>
        <input ref={inputRef} type="file" accept={PUBLIC_SUPPORT_ACCEPTED_FILES} className="hidden" onChange={(event) => { selectFile(event.target.files?.[0] || null); event.target.value = ''; }} />
        <button type="button" onClick={() => void startRecording()} disabled={sending || recording} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-white hover:text-blue-700 disabled:opacity-40" aria-label="Gravar mensagem de áudio"><Mic size={18} /></button>
        <textarea rows={1} value={message} onChange={(event) => setMessage(event.target.value)} disabled={recording || Boolean(pendingFile)} placeholder={pendingFile ? 'Anexo pronto para enviar' : 'Escreva sua mensagem'} className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm font-semibold text-slate-700 outline-none disabled:text-slate-400" />
        <button type="submit" disabled={sending || recording || (!message.trim() && !pendingFile)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white disabled:opacity-40" aria-label={pendingFile ? 'Enviar anexo' : 'Enviar mensagem'}>{sending ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" /> : <Send size={16} />}</button>
      </form>
      <p className="px-2 text-[10px] font-semibold text-slate-400">Imagens, PDF, Office e áudio · até 12 MB</p>
    </div>
  );
};
