import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  return new Response(
    JSON.stringify({
      error: "Endpoint legado desativado. Utilize o fluxo bancario atual.",
    }),
    { status: 410, headers },
  );
});
