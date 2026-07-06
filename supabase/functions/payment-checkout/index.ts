import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handlePaymentCheckout } from "../asaas-checkout/index.ts";

Deno.serve(handlePaymentCheckout);
