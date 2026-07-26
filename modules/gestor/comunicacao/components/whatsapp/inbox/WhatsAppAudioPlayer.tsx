/* global HTMLAudioElement */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mic2, Pause, Play } from 'lucide-react';

const BAR_HEIGHTS = [
  7, 12, 18, 10, 22, 15, 8, 19, 25, 13, 9, 21, 16, 27,
  11, 18, 23, 9, 14, 26, 17, 10, 20, 13, 24, 16, 8, 19,
];

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
};

interface WhatsAppAudioPlayerProps {
  src: string;
  outgoing: boolean;
}

const WhatsAppAudioPlayer: React.FC<WhatsAppAudioPlayerProps> = ({
  src,
  outgoing,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const playedBars = Math.round(progress * BAR_HEIGHTS.length);
  const timeLabel = useMemo(
    () => `${formatDuration(currentTime)} / ${formatDuration(duration)}`,
    [currentTime, duration],
  );

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setSpeed(1);
  }, [src]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) await audio.play();
    else audio.pause();
  };

  const seek = (ratio: number) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = Math.min(duration, Math.max(0, ratio * duration));
    setCurrentTime(audio.currentTime);
  };

  const cycleSpeed = () => {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const syncDuration = (audio: HTMLAudioElement) => {
    const nextDuration = Number.isFinite(audio.duration)
      ? audio.duration
      : audio.seekable.length > 0
        ? audio.seekable.end(audio.seekable.length - 1)
        : 0;
    if (nextDuration > 0) setDuration(nextDuration);
  };

  return (
    <div className="w-[min(360px,66vw)] min-w-[260px] max-w-full py-0.5">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => syncDuration(event.currentTarget)}
        onLoadedData={(event) => syncDuration(event.currentTarget)}
        onCanPlay={(event) => syncDuration(event.currentTarget)}
        onDurationChange={(event) => syncDuration(event.currentTarget)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
      />

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={togglePlayback}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 ${
            outgoing
              ? 'text-[#00a884] hover:bg-white/35 focus-visible:ring-[#00a884]'
              : 'text-[#00a884] hover:bg-slate-100 focus-visible:ring-[#00a884]'
          }`}
          aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}
        >
          {playing
            ? <Pause size={27} fill="currentColor" strokeWidth={1.4} />
            : <Play size={28} fill="currentColor" strokeWidth={1.4} className="ml-0.5" />}
        </button>

        <div className="min-w-0 flex-1">
          <div
            className="relative flex h-8 cursor-pointer items-center gap-[2px]"
            role="slider"
            aria-label="Progresso do áudio"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(currentTime)}
            tabIndex={0}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              seek((event.clientX - rect.left) / rect.width);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') seek((currentTime + 5) / Math.max(duration, 1));
              if (event.key === 'ArrowLeft') seek((currentTime - 5) / Math.max(duration, 1));
            }}
          >
            {BAR_HEIGHTS.map((height, index) => (
              <span
                key={`${height}-${index}`}
                className={`w-[3px] shrink-0 rounded-full transition-colors ${
                  index < playedBars
                    ? 'bg-[#00a884]'
                    : outgoing ? 'bg-[#7c9488]/55' : 'bg-slate-400/55'
                }`}
                style={{ height }}
              />
            ))}
            <span
              className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 rounded-full bg-[#00a884] shadow-sm"
              style={{ left: `${progress * 100}%` }}
            />
          </div>

          <div className="mt-0.5 flex items-center justify-between text-[11px] font-semibold tabular-nums text-[#667781]">
            <span>{timeLabel}</span>
            <button
              type="button"
              onClick={cycleSpeed}
              className={`min-w-8 rounded-md px-1.5 py-0.5 font-bold transition-colors ${outgoing ? 'hover:bg-white/35' : 'hover:bg-slate-200'}`}
              title="Velocidade de reprodução"
            >
              {speed}x
            </button>
          </div>
        </div>

        <div className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          outgoing
            ? 'bg-gradient-to-br from-[#d2e2d0] to-[#8daf9f] text-white'
            : 'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-600'
        }`}>
          <Mic2 size={18} />
          <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 ${
            outgoing ? 'border-[#d9fdd3] bg-[#00a884]' : 'border-white bg-[#00a884]'
          }`} />
        </div>
      </div>
    </div>
  );
};

export default WhatsAppAudioPlayer;
