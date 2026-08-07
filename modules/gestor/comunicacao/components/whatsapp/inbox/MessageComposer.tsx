/* global MediaRecorder, MediaStream */
import React, { useEffect, useRef, useState } from 'react';
import { FileText, Image, Mic, Paperclip, Send, Square, X } from 'lucide-react';
import { WhatsAppConversation, WhatsAppMediaKind } from '../whatsapp.types';
import { normalizePhone } from '../whatsapp.utils';
import { mediaKindFromFile } from './mediaUtils';

interface MessageComposerProps {
  activeConversation: WhatsAppConversation | null;
  apiReady: boolean;
  closed?: boolean;
  sendTyping: (typing: boolean) => void;
  onSendReply: (message: string) => Promise<void>;
  onSendMedia: (input: { file: File; kind: WhatsAppMediaKind; caption: string }) => Promise<void>;
}

const accept = [
  'image/*',
  'audio/*',
  'application/pdf',
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv',
].join(',');

const formatRecordingTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const MessageComposer: React.FC<MessageComposerProps> = ({
  activeConversation,
  apiReady,
  closed = false,
  sendTyping,
  onSendReply,
  onSendMedia,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const [reply, setReply] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  useEffect(() => {
    setReply('');
    setFile(null);
    sendTyping(false);
  }, [activeConversation?.id, sendTyping]);

  useEffect(() => () => {
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  if (!activeConversation) return null;

  const disabled = closed || !apiReady;
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

  const stopRecording = () => {
    recorderRef.current?.stop();
  };

  const startRecording = async () => {
    if (disabled || recording || !navigator.mediaDevices?.getUserMedia) return;
    const Recorder = window.MediaRecorder;
    if (!Recorder) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const preferredTypes = [
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/webm;codecs=opus',
    ];
    const mimeType = preferredTypes.find((type) => Recorder.isTypeSupported(type));
    const recorder = new Recorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || mimeType || 'audio/mp4';
      const extension = type.includes('ogg') ? 'ogg' : type.includes('webm') ? 'webm' : 'm4a';
      const blob = new Blob(chunksRef.current, { type });
      if (blob.size > 0) {
        setFile(new File([blob], `audio-${Date.now()}.${extension}`, { type }));
      }
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      chunksRef.current = [];
      setRecording(false);
      if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    };
    recorder.start(250);
    setRecordingSeconds(0);
    setRecording(true);
    recordingTimerRef.current = window.setInterval(
      () => setRecordingSeconds((current) => current + 1),
      1_000,
    );
  };

  return (
    <div className="border-t border-[#d8dbdf] bg-[#f0f2f5] px-4 py-3">
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

      {recording && (
        <div className="mb-3 flex min-h-12 items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 text-rose-700">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
          <span className="text-xs font-black uppercase tracking-wide">Gravando áudio</span>
          <div className="flex flex-1 items-center gap-1 overflow-hidden">
            {Array.from({ length: 24 }, (_, index) => (
              <span
                key={index}
                className="w-1 rounded-full bg-rose-300"
                style={{ height: `${8 + ((index * 7) % 18)}px` }}
              />
            ))}
          </div>
          <span className="text-xs font-black tabular-nums">{formatRecordingTime(recordingSeconds)}</span>
          <button
            type="button"
            onClick={stopRecording}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-600 text-white hover:bg-rose-700"
            title="Parar gravação"
          >
            <Square size={13} fill="currentColor" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(event) => setFile(event.target.files?.[0] || null)} />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled || recording} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#54656f] transition-colors hover:bg-[#e5e9ec] disabled:opacity-40" title="Anexar áudio, foto ou documento">
          <Paperclip size={21} />
        </button>
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={disabled || Boolean(file)}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
            recording ? 'bg-rose-600 text-white' : 'text-[#54656f] hover:bg-[#e5e9ec]'
          }`}
          title={recording ? 'Parar gravação' : 'Gravar áudio'}
        >
          {recording ? <Square size={14} fill="currentColor" /> : <Mic size={21} />}
        </button>
        <textarea
          value={reply}
          onChange={(event) => updateReply(event.target.value)}
          onBlur={() => sendTyping(false)}
          rows={1}
          placeholder={closed ? 'Atendimento finalizado' : recording ? 'Gravando mensagem de voz...' : file ? 'Legenda opcional...' : 'Escreva sua resposta...'}
          disabled={disabled || recording}
          className="max-h-28 min-h-[44px] flex-1 resize-none rounded-[22px] border border-transparent bg-white px-4 py-3 text-[14px] font-normal text-[#111b21] shadow-[0_1px_1px_rgba(11,20,26,0.04)] outline-none placeholder:text-[#667781] focus:border-[#c9d0d4] disabled:opacity-50"
        />
        <button onClick={send} disabled={sending || !canSend} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-sm transition-colors hover:bg-[#008f72] disabled:opacity-40">
          <Send size={19} className="ml-0.5" />
        </button>
      </div>
    </div>
  );
};

export default MessageComposer;
