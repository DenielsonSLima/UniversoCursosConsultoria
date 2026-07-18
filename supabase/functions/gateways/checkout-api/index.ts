import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handlePaymentCheckout } from "./checkout-handler.ts";

export { handlePaymentCheckout };

if (import.meta.main) {
  Deno.serve(handlePaymentCheckout);
}
