import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";
import { fetchAsaasFile, type AsaasRuntime } from "./asaas-http.ts";

export const createAsaasCarnetService = (
  admin: any,
  syncReceivable: (runtime: AsaasRuntime, receivableId: string) => Promise<any>,
  refreshReceivableStatus: (runtime: AsaasRuntime, receivable: any) => Promise<any>,
) => {
  const generateOfficialCarnet = async (runtime: AsaasRuntime, receivableIds: string[]) => {
    if (!receivableIds.length) throw new Error("Selecione ao menos uma cobrança para gerar o carnê oficial.");
    if (receivableIds.length > 30) throw new Error("Gere o carnê em lotes de até 30 boletos por vez.");

    const { data: rows, error } = await admin
      .from("contas_receber")
      .select("id, asaas_payment_id, asaas_bank_slip_url, asaas_status, status, cliente_id")
      .in("id", receivableIds);
    if (error) throw error;

    const rowsById = new Map((rows || []).map((row: any) => [row.id, row]));
    const orderedRows = receivableIds.map((id) => rowsById.get(id)).filter(Boolean);
    if (!orderedRows.length) throw new Error("Nenhuma cobrança encontrada.");

    const merged = await PDFDocument.create();
    const sheetWidth = 595.28;
    const sheetHeight = 841.89;
    const marginX = 18;
    const marginY = 14;
    const gap = 6;
    const slotsPerSheet = 3;
    const slotHeight = (sheetHeight - marginY * 2 - gap * (slotsPerSheet - 1)) / slotsPerSheet;
    let renderedSlipCount = 0;

    for (const row of orderedRows) {
      const rowStatus = String(row.status || "").toUpperCase();
      if (!["PENDENTE", "VENCIDO"].includes(rowStatus)) {
        throw new Error("Carnê oficial só pode incluir cobranças pendentes ou vencidas.");
      }

      const synced = row.asaas_payment_id
        ? await refreshReceivableStatus(runtime, row)
        : await syncReceivable(runtime, row.id);
      const syncedStatus = String(synced.status || "").toUpperCase();
      if (!["PENDENTE", "VENCIDO"].includes(syncedStatus)) {
        throw new Error("Uma cobrança selecionada deixou de estar pendente/vencida após a atualização Asaas.");
      }

      const bankSlipUrl = synced.asaas_bank_slip_url;
      if (!bankSlipUrl) {
        throw new Error(`A cobrança ${synced.asaas_payment_id || synced.id} ainda não retornou boleto oficial do Asaas.`);
      }

      if (renderedSlipCount > 0) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      const boletoBytes = await fetchAsaasFile(runtime, bankSlipUrl);
      const boletoPdf = await PDFDocument.load(boletoBytes);
      const sourcePage = boletoPdf.getPages()[0];
      if (!sourcePage) {
        throw new Error(`O boleto ${synced.asaas_payment_id || synced.id} retornou um PDF vazio.`);
      }

      const { width: sourceWidth, height: sourceHeight } = sourcePage.getSize();
      const slipCropHeight = sourceHeight * 0.43;
      const embeddedSlip = await merged.embedPage(sourcePage, {
        left: 0,
        bottom: 0,
        right: sourceWidth,
        top: slipCropHeight,
      });

      const slotIndex = renderedSlipCount % slotsPerSheet;
      const sheet = slotIndex === 0
        ? merged.addPage([sheetWidth, sheetHeight])
        : merged.getPages()[merged.getPageCount() - 1];

      const maxWidth = sheetWidth - marginX * 2;
      const maxHeight = slotHeight;
      const scale = Math.min(maxWidth / sourceWidth, maxHeight / slipCropHeight);
      const drawWidth = sourceWidth * scale;
      const drawHeight = slipCropHeight * scale;
      const slotTop = sheetHeight - marginY - slotIndex * (slotHeight + gap);
      const x = (sheetWidth - drawWidth) / 2;
      const y = slotTop - drawHeight;

      sheet.drawPage(embeddedSlip, { x, y, width: drawWidth, height: drawHeight });
      if (slotIndex < slotsPerSheet - 1) {
        const separatorY = sheetHeight - marginY - (slotIndex + 1) * slotHeight - slotIndex * gap - gap / 2;
        sheet.drawLine({
          start: { x: marginX, y: separatorY },
          end: { x: sheetWidth - marginX, y: separatorY },
          thickness: 0.5,
          color: rgb(0.74, 0.78, 0.84),
          dashArray: [4, 4],
        });
      }
      renderedSlipCount += 1;
    }

    const pdfBytes = await merged.save();
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < pdfBytes.length; i += chunkSize) {
      binary += String.fromCharCode(...pdfBytes.slice(i, i + chunkSize));
    }

    return {
      success: true,
      filename: `carne-oficial-asaas-${new Date().toISOString().slice(0, 10)}.pdf`,
      contentType: "application/pdf",
      base64: btoa(binary),
      count: orderedRows.length,
    };
  };

  return { generateOfficialCarnet };
};
