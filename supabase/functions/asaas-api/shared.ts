export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export type Environment = "sandbox" | "production";

export const normalizeEnvironment = (value: unknown): Environment =>
  value === "production" ? "production" : "sandbox";

export const apiSecretName = (environment: Environment) =>
  environment === "production" ? "asaas_production_api_key" : "asaas_sandbox_api_key";

export const webhookSecretName = (environment: Environment) =>
  environment === "production" ? "asaas_production_webhook_token" : "asaas_sandbox_webhook_token";

export const baseUrlFor = (environment: Environment) =>
  environment === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";

export const isValidCpf = (value: string) => {
  const cpf = value.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calcDigit = (slice: string, factor: number) => {
    const sum = slice.split("").reduce((total, digit) => total + Number(digit) * factor--, 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return calcDigit(cpf.slice(0, 9), 10) === Number(cpf[9])
    && calcDigit(cpf.slice(0, 10), 11) === Number(cpf[10]);
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export const buildCoursePaymentDescription = (courseName: string) =>
  `${courseName} - Inscricao Online - Universo Cursos e Consultoria`;

export const ONLINE_MODALIDADES = ["EAD", "LIVRE", "ESPECIALIZACAO", "TECNICO"];

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
