export const BANESE_DOCUMENT_SECURITY_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0",
  "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
});

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

export const allowedBaneseLogoUrl = (value: unknown) => {
  try {
    const url = new URL(String(value ?? "").trim());
    if (url.protocol !== "https:" || (url.port && url.port !== "443")) {
      return null;
    }
    if (url.username || url.password) return null;
    const decodedPath = decodeURIComponent(url.pathname);
    if (
      decodedPath.includes("\\") || decodedPath.split("/").includes("..")
    ) {
      return null;
    }
    if (
      url.hostname === "kfekgwyqozhicpfuunpo.supabase.co" &&
      decodedPath.startsWith("/storage/v1/object/")
    ) {
      return url.toString();
    }
    if (
      ["universocc.com.br", "www.universocc.com.br"].includes(url.hostname) &&
      decodedPath.startsWith("/logos/")
    ) {
      return url.toString();
    }
  } catch {
    // URL ausente ou fora da lista de origens confiáveis.
  }
  return null;
};

export const isEligibleBaneseStudentOwner = (
  payer: { tipo?: unknown; email?: unknown; status?: unknown },
  authenticatedEmail: unknown,
) =>
  normalize(payer.tipo) === "aluno" &&
  normalize(payer.email) === normalize(authenticatedEmail) &&
  !["inativo", "inactive", "bloqueado", "cancelado"].includes(
    normalize(payer.status),
  );

export const isUniqueEligibleBaneseStudentOwner = (
  candidates: Array<{
    id?: unknown;
    tipo?: unknown;
    email?: unknown;
    status?: unknown;
  }>,
  payerId: unknown,
  authenticatedEmail: unknown,
) => {
  const owners = candidates.filter((candidate) =>
    isEligibleBaneseStudentOwner(candidate, authenticatedEmail)
  );
  return owners.length === 1 &&
    String(owners[0].id ?? "").trim() === String(payerId ?? "").trim();
};

export const baneseBoletoIssueDate = (value: unknown) => {
  const date = String(value ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(
      "Data de emissão bancária não registrada para este boleto.",
    );
  }
  return date;
};
