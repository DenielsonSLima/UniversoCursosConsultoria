import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";
import type { AsaasRuntime } from "../core/runtime.ts";

const ASAAS_FILE_HOSTS = new Set([
  "api.asaas.com",
  "api-sandbox.asaas.com",
  "www.asaas.com",
  "sandbox.asaas.com",
]);

const one = (value: any) => Array.isArray(value) ? value[0] : value;
const normalize = (value: unknown) => String(value || "").toUpperCase();

const RECEIVABLE_SELECT = `
  id,
  descricao,
  valor,
  data_vencimento,
  status,
  cliente_id,
  matricula_id,
  turma_id,
  tipo_lancamento,
  parcela_numero,
  asaas_payment_id,
  asaas_invoice_url,
  asaas_bank_slip_url,
  asaas_installment_id,
  asaas_status,
  turmas(
    id,
    nome,
    cursos(id, nome, modalidade)
  )
`;

const assertAsaasFileUrl = (rawUrl: string) => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("URL do boleto oficial Asaas inválida.");
  }

  if (parsed.protocol !== "https:" || !ASAAS_FILE_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("URL do boleto oficial fora dos domínios permitidos do Asaas.");
  }

  return parsed.toString();
};

const fetchAsaasPdfUrl = async (runtime: AsaasRuntime, url: string) => {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const safeUrl = assertAsaasFileUrl(url);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(safeUrl, {
      redirect: "manual",
      headers: {
        "User-Agent": "Universo-Cursos-Tecnico",
        access_token: runtime.apiKey,
      },
    });

    if (response.status >= 300 && response.status < 400) {
      throw new Error("O Asaas redirecionou o boleto oficial. Gere o carnê novamente para obter uma URL direta válida.");
    }

    if (response.ok) return new Uint8Array(await response.arrayBuffer());

    if (response.status === 429 && attempt < 3) {
      await response.text().catch(() => "");
      await sleep(1500 * (attempt + 1));
      continue;
    }

    throw new Error(`Não foi possível baixar o boleto oficial do Asaas (${response.status}).`);
  }

  throw new Error("Não foi possível baixar o boleto oficial do Asaas.");
};

const fetchInstallmentPaymentBook = async (runtime: AsaasRuntime, installmentId: string) => {
  const response = await fetch(`${runtime.baseUrl}/installments/${encodeURIComponent(installmentId)}/paymentBook`, {
    method: "GET",
    headers: {
      "User-Agent": "Universo-Cursos-Tecnico",
      access_token: runtime.apiKey,
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.errors?.map((item: any) => item.description).join(" ")
      || payload?.message
      || `Erro ${response.status} ao gerar carnê oficial do Asaas.`;
    throw new Error(message);
  }

  return new Uint8Array(await response.arrayBuffer());
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
};

const assertTecnicoCarnetReceivable = (item: any) => {
  const status = normalize(item.status);
  if (!["PENDENTE", "VENCIDO"].includes(status)) {
    throw new Error(`A cobrança ${item.descricao || item.id} não está pendente/vencida para carnê técnico.`);
  }

  const launchType = normalize(item.tipo_lancamento);
  if (!["PARCELA", "MENSALIDADE", "REMATRICULA"].includes(launchType)) {
    throw new Error(`A cobrança ${item.descricao || item.id} não pertence ao ciclo de parcelas do curso técnico.`);
  }

  const turma = one(item.turmas);
  const course = one(turma?.cursos);
  if (normalize(course?.modalidade) !== "TECNICO") {
    throw new Error("Carnê oficial está disponível apenas para cursos técnicos neste módulo.");
  }
};

const buildLegacyThreePerPageCarnet = async (runtime: AsaasRuntime, receivables: any[]) => {
  const output = await PDFDocument.create();
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 22;
  const slotHeight = (pageHeight - margin * 2) / 3;

  for (let index = 0; index < receivables.length; index += 1) {
    const item = receivables[index];
    if (!item.asaas_bank_slip_url) {
      throw new Error(`A cobrança ${item.asaas_payment_id || item.id} ainda não possui boleto oficial do Asaas.`);
    }

    const sourceBytes = await fetchAsaasPdfUrl(runtime, item.asaas_bank_slip_url);
    const source = await PDFDocument.load(sourceBytes);
    const [embedded] = await output.embedPages([source.getPage(0)]);
    const page = index % 3 === 0 ? output.addPage([pageWidth, pageHeight]) : output.getPages().at(-1)!;
    const slotIndex = index % 3;
    const yBase = pageHeight - margin - slotHeight * (slotIndex + 1);
    const scale = Math.min((pageWidth - margin * 2) / embedded.width, (slotHeight - 14) / embedded.height);
    const width = embedded.width * scale;
    const height = embedded.height * scale;
    const x = (pageWidth - width) / 2;
    const y = yBase + (slotHeight - height) / 2;

    page.drawPage(embedded, { x, y, width, height });
    if (slotIndex < 2) {
      page.drawLine({
        start: { x: margin, y: yBase },
        end: { x: pageWidth - margin, y: yBase },
        thickness: 0.5,
        color: rgb(0.82, 0.86, 0.9),
      });
    }
  }

  return output.save();
};

export const createTecnicoCarnetService = (admin: any) => {
  const generateOfficialCarnet = async (runtime: AsaasRuntime, receivableIds: string[]) => {
    const ids = Array.from(new Set(receivableIds.filter(Boolean)));
    if (!ids.length) throw new Error("Selecione ao menos uma parcela técnica para gerar o carnê.");

    const { data, error } = await admin
      .from("contas_receber")
      .select(RECEIVABLE_SELECT)
      .in("id", ids)
      .order("data_vencimento", { ascending: true });
    if (error) throw error;
    const receivables = data || [];
    if (receivables.length !== ids.length) {
      throw new Error("Uma ou mais parcelas selecionadas não foram encontradas.");
    }

    receivables.forEach(assertTecnicoCarnetReceivable);
    const installmentIds = Array.from(new Set(
      receivables.map((item) => String(item.asaas_installment_id || "").trim()).filter(Boolean),
    ));

    if (installmentIds.length === 1 && receivables.every((item) => String(item.asaas_installment_id || "") === installmentIds[0])) {
      const bytes = await fetchInstallmentPaymentBook(runtime, installmentIds[0]);
      return {
        success: true,
        filename: `carne-tecnico-${installmentIds[0]}.pdf`,
        contentType: "application/pdf",
        base64: bytesToBase64(bytes),
        count: receivables.length,
        source: "asaas-installment",
      };
    }

    const bytes = await buildLegacyThreePerPageCarnet(runtime, receivables);
    return {
      success: true,
      filename: `carne-tecnico-${new Date().toISOString().slice(0, 10)}.pdf`,
      contentType: "application/pdf",
      base64: bytesToBase64(bytes),
      count: receivables.length,
      source: "tecnico-legacy-boletos",
    };
  };

  return { generateOfficialCarnet };
};
