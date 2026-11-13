import { handleServiceBolepixRequest } from "./handler.ts";
Deno.serve(req => handleServiceBolepixRequest(req));
