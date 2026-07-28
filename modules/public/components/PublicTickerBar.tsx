import React from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { SITE_PUBLIC_TICKER_CONFIG_ID, siteTickerService } from '../siteTicker.service';
import { siteTickerKeys } from '../siteTicker.keys';

type TickerInvalidationListener = () => void;

const tickerInvalidationListeners = new Set<TickerInvalidationListener>();
let publicTickerChannel: ReturnType<typeof supabase.channel> | null = null;
let publicTickerSubscribed = false;
let publicTickerCleanupTimer: ReturnType<typeof setTimeout> | null = null;
let publicTickerRemovalPromise: Promise<void> | null = null;

const removePublicTickerChannel = () => {
  if (publicTickerCleanupTimer) {
    clearTimeout(publicTickerCleanupTimer);
    publicTickerCleanupTimer = null;
  }

  const channel = publicTickerChannel;
  if (!channel || publicTickerRemovalPromise) return;

  publicTickerSubscribed = false;
  publicTickerRemovalPromise = supabase
    .removeChannel(channel)
    .then(() => undefined)
    .finally(() => {
      if (publicTickerChannel === channel) {
        publicTickerChannel = null;
      }
      publicTickerRemovalPromise = null;

      if (tickerInvalidationListeners.size > 0) {
        ensurePublicTickerChannel();
      }
    });
};

const notifyTickerInvalidationListeners = () => {
  tickerInvalidationListeners.forEach((listener) => listener());
};

const ensurePublicTickerChannel = () => {
  if (publicTickerChannel || publicTickerRemovalPromise) return;

  const channel = supabase
    .channel('site-public-ticker-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'turmas' }, notifyTickerInvalidationListeners)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cursos' }, notifyTickerInvalidationListeners)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'documentos_templates', filter: `id=eq.${SITE_PUBLIC_TICKER_CONFIG_ID}` },
      notifyTickerInvalidationListeners
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'site_publico_ticker_mensagens' },
      notifyTickerInvalidationListeners
    );

  publicTickerChannel = channel;
  channel.subscribe((status) => {
    if (publicTickerChannel !== channel) return;

    publicTickerSubscribed = status === 'SUBSCRIBED';

    if (
      tickerInvalidationListeners.size === 0
      && (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')
    ) {
      removePublicTickerChannel();
    }
  });
};

const subscribeToPublicTickerInvalidation = (listener: TickerInvalidationListener) => {
  if (publicTickerCleanupTimer) {
    clearTimeout(publicTickerCleanupTimer);
    publicTickerCleanupTimer = null;
  }

  tickerInvalidationListeners.add(listener);
  ensurePublicTickerChannel();

  return () => {
    tickerInvalidationListeners.delete(listener);
    if (tickerInvalidationListeners.size > 0) return;

    if (publicTickerSubscribed) {
      removePublicTickerChannel();
      return;
    }

    // Safari reports an error when a WebSocket is closed while it is still
    // connecting. Wait for the subscription result, with a bounded fallback,
    // before releasing the last public channel.
    publicTickerCleanupTimer = setTimeout(() => {
      publicTickerCleanupTimer = null;
      if (publicTickerChannel?.state !== 'joining') {
        removePublicTickerChannel();
      }
    }, 10_000);
  };
};

const publicTickerQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchInterval: 60_000,
      retry: 1,
      staleTime: 60_000,
    },
  },
});

const PublicTickerBarContent: React.FC = () => {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: siteTickerKeys.public,
    queryFn: () => siteTickerService.getTickerData(),
    staleTime: 60_000,
  });

  React.useEffect(() => {
    const invalidateTicker = () => {
      void queryClient.invalidateQueries({ queryKey: siteTickerKeys.public });
    };

    return subscribeToPublicTickerInvalidation(invalidateTicker);
  }, [queryClient]);

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
              <span key={`${item.text}-${index}`} className="flex items-center gap-8">
                {item.href ? (
                  <Link
                    to={item.href}
                    className="rounded-full px-1 py-1 underline-offset-4 transition hover:text-emerald-300 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    {item.text}
                  </Link>
                ) : (
                  <span>{item.text}</span>
                )}
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const PublicTickerBar: React.FC = () => (
  <QueryClientProvider client={publicTickerQueryClient}>
    <PublicTickerBarContent />
  </QueryClientProvider>
);

export default PublicTickerBar;
