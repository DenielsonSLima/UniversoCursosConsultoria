/** Scoped workspace, document and authorized XML reads have their own validated RPCs. */
export const NFSE_BACKEND_ENABLED: boolean = true;
/** Legacy batch mutations stay unavailable; each source uses the durable individual endpoint. */
export const NFSE_WRITES_ENABLED: boolean = false;
export const NFSE_PROVIDER_ENABLED: boolean = false;
