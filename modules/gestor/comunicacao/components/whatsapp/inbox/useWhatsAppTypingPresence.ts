import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../../../../lib/supabase';

type TypingActor = 'gestor' | 'contact' | 'aluno';

interface TypingPayload {
  conversationId?: string;
  actor?: TypingActor;
  typing?: boolean;
  expiresAt?: number;
}

const now = () => Date.now();

export const useWhatsAppTypingPresence = (conversationId: string | null) => {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const subscribedRef = useRef(false);
  const [typingUntil, setTypingUntil] = useState<Record<string, number>>({});

  useEffect(() => {
    const channel = supabase
      .channel('whatsapp_typing_presence', { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, ({ payload }: { payload: TypingPayload }) => {
        const targetId = String(payload?.conversationId || '');
        if (!targetId || payload.actor === 'gestor') return;

        setTypingUntil((current) => ({
          ...current,
          [targetId]: payload.typing === false ? 0 : Number(payload.expiresAt || now() + 2500),
        }));
      })
      .subscribe((status) => {
        subscribedRef.current = status === 'SUBSCRIBED';
      });

    channelRef.current = channel;
    return () => {
      subscribedRef.current = false;
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTypingUntil((current) => {
        const fresh = Object.keys(current).reduce<Record<string, number>>((active, id) => {
          const until = current[id];
          if (until > now()) active[id] = until;
          return active;
        }, {});
        return Object.keys(fresh).length === Object.keys(current).length ? current : fresh;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const sendTyping = useCallback((typing: boolean) => {
    if (!conversationId || !subscribedRef.current) return;
    channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { conversationId, actor: 'gestor', typing, expiresAt: typing ? now() + 2500 : 0 },
    });
  }, [conversationId]);

  return {
    isContactTyping: Boolean(conversationId && Number(typingUntil[conversationId] || 0) > now()),
    sendTyping,
  };
};
