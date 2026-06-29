import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Megaphone } from 'lucide-react';
import { siteTickerService } from '../siteTicker.service';

const PublicTickerBar: React.FC = () => {
  const { data } = useQuery({
    queryKey: ['site-public-ticker'],
    queryFn: () => siteTickerService.getTickerData(),
    staleTime: 60_000,
  });

  if (!data?.items?.length) return null;

  const baseLoopItems = Array.from(
    { length: Math.max(data.items.length, 8) },
    (_, index) => data.items[index % data.items.length]
  );
  const loopItems = [...baseLoopItems, ...baseLoopItems];
  const speed = `${data.config.speedSeconds}s`;

  return (
    <div className="border-b border-blue-900/30 bg-[#001a33] text-white">
      <style>{`
        @keyframes publicTickerLoop {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .public-ticker-track { animation: publicTickerLoop var(--ticker-speed, 28s) linear infinite; }
        .public-ticker-track:hover { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) {
          .public-ticker-track { animation: none; transform: none; }
        }
      `}</style>
      <div className="flex h-10 items-center overflow-hidden">
        <div className="flex h-full shrink-0 items-center gap-2 bg-blue-700 px-4 text-[10px] font-black uppercase tracking-[0.18em]">
          <Megaphone size={13} />
          Avisos
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div
            className="public-ticker-track flex w-max items-center gap-8 whitespace-nowrap px-4 text-[11px] font-bold uppercase tracking-wider text-blue-50"
            style={{ '--ticker-speed': speed } as React.CSSProperties}
          >
            {loopItems.map((item, index) => (
              <span key={`${item}-${index}`} className="flex items-center gap-8">
                <span>{item}</span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicTickerBar;
