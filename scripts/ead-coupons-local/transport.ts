export type PreviewIdentity = 'manager' | 'student-1' | 'student-2' | 'student-3' | 'student-4';
let identity: PreviewIdentity = 'manager';
const token = () => (window as unknown as { __LOCAL_COUPONS_TOKEN__: string }).__LOCAL_COUPONS_TOKEN__;
export const setPreviewIdentity = (value: PreviewIdentity) => { identity = value; };

export async function previewRequest(path: string, body?: unknown, signal?: AbortSignal) {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'X-Local-Coupons-Token': token(), 'X-Preview-Identity': identity },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a operação local.');
  return result;
}

type Subscription = { spec: { table?: string; filter?: string }; callback: (payload: unknown) => void };
type LocalEventSource = InstanceType<typeof window.EventSource>;
const channels = new Set<{ handlers: Subscription[]; source: LocalEventSource | null }>();
export const supabase = {
  rpc(name: string, args: Record<string, unknown>) {
    let signal: AbortSignal | undefined;
    const request = {
      abortSignal(value: AbortSignal) { signal = value; return request; },
      then(resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) {
        return previewRequest('/api/rpc', { name, args }, signal).then(resolve, reject);
      },
    };
    return request;
  },
  functions: {
    invoke(name: string, { body }: { body: Record<string, unknown> }) {
      if (name !== 'payment-checkout') throw new Error('Integração indisponível nesta prévia local.');
      return previewRequest('/api/checkout', body);
    },
  },
  channel() {
    const channel = {
      handlers: [] as Subscription[], source: null as LocalEventSource | null,
      on(_kind: string, spec: Subscription['spec'], callback: Subscription['callback']) {
        channel.handlers.push({ spec, callback }); return channel;
      },
      subscribe(callback?: (status: string) => void) {
        const source = new window.EventSource(`/api/events?token=${encodeURIComponent(token())}`);
        channel.source = source; channels.add(channel);
        source.onopen = () => callback?.('SUBSCRIBED');
        source.onmessage = event => {
          const message = JSON.parse(event.data);
          for (const { spec, callback: notify } of channel.handlers) {
            const [field, expected] = (spec.filter || '').split('=eq.');
            if (spec.table === message.table && (!field || message.new?.[field] === expected)) notify(message);
          }
          window.dispatchEvent(new window.Event('local-coupons-changed'));
        };
        return channel;
      },
    };
    return channel;
  },
  removeChannel(channel: { source: LocalEventSource | null; handlers: Subscription[] }) {
    channel.source?.close(); channels.delete(channel);
  },
};
