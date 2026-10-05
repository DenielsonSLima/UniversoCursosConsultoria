import { handleBaneseEadCheckoutExpirationRequest } from "../banese-reconciliation-worker/ead-checkout-expiration-handler.ts";

Deno.serve((req) => handleBaneseEadCheckoutExpirationRequest(req));
