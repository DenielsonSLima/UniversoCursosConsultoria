export const BANESE_DOCUMENT_SECURITY_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0",
  "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
});

export {
  isEligibleBaneseStudentOwner,
  isUniqueEligibleBaneseStudentOwner,
} from "../_shared/banese-student-identity.ts";

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

export const baneseBoletoIssueDate = (value: unknown) => {
  const date = String(value ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(
      "Data de emissão bancária não registrada para este boleto.",
    );
  }
  return date;
};

