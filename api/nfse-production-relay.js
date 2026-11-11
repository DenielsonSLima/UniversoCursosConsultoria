import { createProductionRelayHandler } from '../internal/integracoes/nfse-production-relay/handler.js';

export const maxDuration = 35;
export default { fetch: createProductionRelayHandler() };
