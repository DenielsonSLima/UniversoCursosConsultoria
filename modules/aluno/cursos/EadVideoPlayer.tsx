import React, { useMemo, useState } from 'react';
import { Play } from 'lucide-react';

interface EadVideoPlayerProps {
  embedUrl: string;
  title: string;
}

const VIDEO_POSTER_URL = '/course-covers/ead/video-thumbnail.webp';

const withAutoplay = (value: string) => {
  try {
    const url = new URL(value);
    url.searchParams.set('autoplay', '1');
    return url.toString();
  } catch {
    return value;
  }
};

const EadVideoPlayer: React.FC<EadVideoPlayerProps> = ({ embedUrl, title }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const autoplayUrl = useMemo(() => withAutoplay(embedUrl), [embedUrl]);

  if (isPlaying) {
    return (
      <iframe
        src={autoplayUrl}
        title={title}
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsPlaying(true)}
      className="group relative h-full w-full overflow-hidden bg-[#f8fafc] text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/60 focus-visible:ring-inset"
      aria-label={`Reproduzir ${title}`}
    >
      <img
        src={VIDEO_POSTER_URL}
        alt=""
        aria-hidden="true"
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.015]"
        loading="eager"
        decoding="async"
      />
      <span className="absolute inset-0 bg-gradient-to-t from-[#001a33]/20 via-transparent to-white/5 transition-colors group-hover:from-[#001a33]/30" />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/70 bg-[#001a33]/90 text-white shadow-2xl shadow-[#001a33]/30 backdrop-blur-sm transition-transform duration-300 group-hover:scale-110 sm:h-20 sm:w-20">
          <Play className="ml-1 fill-current" size={30} />
        </span>
      </span>
      <span className="absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/70 bg-white/90 px-4 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-[#001a33] shadow-lg backdrop-blur-sm sm:text-[10px]">
        Clique para assistir
      </span>
    </button>
  );
};

export default EadVideoPlayer;
