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
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

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
        Accept: "application/pdf",
        "User-Agent": "Universo-Cursos-Tecnico",
        access_token: runtime.apiKey,
      },
    });

    if (response.status >= 300 && response.status < 400) {
      throw new Error("O Asaas redirecionou o boleto oficial. Gere o carnê novamente para obter uma URL direta válida.");
    }

    if (response.ok) {
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      if (contentType && !contentType.includes("pdf") && !contentType.includes("octet-stream")) {
        throw new Error("O arquivo retornado pelo Asaas não parece ser um PDF oficial.");
      }
      return new Uint8Array(await response.arrayBuffer());
    }

    if (response.status === 429 && attempt < 3) {
      await response.text().catch(() => "");
      await sleep(1500 * (attempt + 1));
      continue;
    }

    throw new Error(`Não foi possível baixar o boleto oficial do Asaas (${response.status}).`);
  }

  throw new Error("Não foi possível baixar o boleto oficial do Asaas.");
};

const fetchInstallmentPayments = async (runtime: AsaasRuntime, installmentId: string) => {
  const response = await fetch(`${runtime.baseUrl}/payments?installment=${encodeURIComponent(installmentId)}&limit=100`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "Universo-Cursos-Tecnico",
      access_token: runtime.apiKey,
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.errors?.map((item: any) => item.description).join(" ")
      || payload?.message
      || `Erro ${response.status} ao listar parcelas do parcelamento Asaas.`;
    throw new Error(message);
  }

  const payload = await response.json().catch(() => null);
  return (payload?.data || []).sort((a: any, b: any) => {
    const numberDiff = Number(a.installmentNumber || 0) - Number(b.installmentNumber || 0);
    if (numberDiff) return numberDiff;
    return String(a.dueDate || "").localeCompare(String(b.dueDate || ""));
  });
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

const boletoStripCropBox = (sourcePage: any) => {
  const { width, height } = sourcePage.getSize();
  if (width / height >= 1.45) return undefined;

  return {
    left: width * 0.035,
    bottom: height * 0.045,
    right: width * 0.965,
    top: height * 0.36,
  };
};

const drawSeparator = (page: any, y: number, margin: number) => {
  page.drawLine({
    start: { x: margin, y },
    end: { x: A4_WIDTH - margin, y },
    thickness: 0.5,
    color: rgb(0.82, 0.86, 0.9),
  });
};

const hydrateMissingBankSlipUrls = async (runtime: AsaasRuntime, receivables: any[], installmentIds: string[]) => {
  if (installmentIds.length !== 1 || receivables.every((item) => item.asaas_bank_slip_url)) {
    return receivables;
  }

  const payments = await fetchInstallmentPayments(runtime, installmentIds[0]);
  const paymentsById = new Map(payments.map((payment: any) => [String(payment.id || ""), payment]));
  const usedPaymentIds = new Set<string>();

  return receivables.map((item: any, index: number) => {
    let payment: any = item.asaas_payment_id ? paymentsById.get(String(item.asaas_payment_id)) : null;
    if (!payment) {
      payment = payments.find((candidate: any) => {
        const candidateId = String(candidate.id || "");
        return candidateId
          && !usedPaymentIds.has(candidateId)
          && Number(candidate.installmentNumber || 0) === Number(item.parcela_numero || 0);
      });
    }
    if (!payment) {
      payment = payments.find((candidate: any) => {
        const candidateId = String(candidate.id || "");
        return candidateId
          && !usedPaymentIds.has(candidateId)
          && String(candidate.dueDate || "") === String(item.data_vencimento || "");
      });
    }
    if (!payment) {
      payment = payments.find((candidate: any) => {
        const candidateId = String(candidate.id || "");
        return candidateId && !usedPaymentIds.has(candidateId);
      }) || payments[index];
    }

    const paymentId = String(payment?.id || "");
    if (paymentId) usedPaymentIds.add(paymentId);

    return {
      ...item,
      asaas_payment_id: item.asaas_payment_id || payment?.id || null,
      asaas_bank_slip_url: item.asaas_bank_slip_url || payment?.bankSlipUrl || null,
      asaas_invoice_url: item.asaas_invoice_url || payment?.invoiceUrl || null,
    };
  });
};

const buildThreePerPageCarnet = async (runtime: AsaasRuntime, receivables: any[]) => {
  const output = await PDFDocument.create();
  const margin = 14;
  const slotHeight = (A4_HEIGHT - margin * 2) / 3;

  for (let index = 0; index < receivables.length; index += 1) {
    const item = receivables[index];
    if (!item.asaas_bank_slip_url) {
      throw new Error(`A cobrança ${item.asaas_payment_id || item.id} ainda não possui boleto oficial do Asaas.`);
    }

    const sourceBytes = await fetchAsaasPdfUrl(runtime, item.asaas_bank_slip_url);
    const source = await PDFDocument.load(sourceBytes);
    const sourcePage = source.getPage(0);
    const cropBox = boletoStripCropBox(sourcePage);
    const embedded = cropBox
      ? await output.embedPage(sourcePage, cropBox)
      : await output.embedPage(sourcePage);
    const page = index % 3 === 0 ? output.addPage([A4_WIDTH, A4_HEIGHT]) : output.getPages().at(-1)!;
    const slotIndex = index % 3;
    const yBase = A4_HEIGHT - margin - slotHeight * (slotIndex + 1);
    const scale = Math.min((A4_WIDTH - margin * 2) / embedded.width, (slotHeight - 8) / embedded.height);
    const width = embedded.width * scale;
    const height = embedded.height * scale;
    const x = (A4_WIDTH - width) / 2;
    const y = yBase + (slotHeight - height) / 2;

    page.drawPage(embedded, { x, y, width, height });
    if (slotIndex < 2) drawSeparator(page, yBase, margin);
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
    const receivables: any[] = data || [];
    if (receivables.length !== ids.length) {
      throw new Error("Uma ou mais parcelas selecionadas não foram encontradas.");
    }

    receivables.forEach(assertTecnicoCarnetReceivable);
    const installmentIds = Array.from(new Set(
      receivables.map((item: any) => String(item.asaas_installment_id || "").trim()).filter(Boolean),
    ));
    const printableReceivables = await hydrateMissingBankSlipUrls(runtime, receivables, installmentIds);

    const bytes = await buildThreePerPageCarnet(runtime, printableReceivables);
    return {
      success: true,
      filename: `carne-tecnico-3-por-folha-${new Date().toISOString().slice(0, 10)}.pdf`,
      contentType: "application/pdf",
      base64: bytesToBase64(bytes),
      count: printableReceivables.length,
      layout: "3-per-page",
      source: installmentIds.length === 1 ? "asaas-installment-payments-3-per-page" : "asaas-bank-slips-3-per-page",
    };
  };

  return { generateOfficialCarnet };
};
