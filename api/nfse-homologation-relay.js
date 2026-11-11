import { createRelayHandler } from '../internal/integracoes/nfse-relay/handler.js';

export const maxDuration = 35;
// Web Request preserves exact signed bytes; no Vercel req.body JSON helper is used.
export default { fetch: createRelayHandler() };
