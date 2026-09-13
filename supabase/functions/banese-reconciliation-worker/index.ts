import { handleBaneseReconciliationRequest } from "./handler.ts";

Deno.serve((req) => handleBaneseReconciliationRequest(req));
