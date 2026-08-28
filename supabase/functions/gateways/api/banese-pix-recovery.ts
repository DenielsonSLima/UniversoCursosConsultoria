import { persistBaneseRecoveredPix } from "./banese-pix-persistence.ts";
import { validateBaneseRecoveredBankNumbers } from "./banese-reconciliation-contract.ts";

export const recoverBanesePixBeforeFinancialReconciliation = async (
  admin: any,
  input: {
    receivable: Record<string, any>;
    environment: "sandbox" | "production";
    convenio: unknown;
    nossoNumero: string;
    snapshot: Record<string, any>;
    persistedPixPayload: string;
    persistedPixEncodedImage: string;
  },
) => {
  const { receivable, snapshot } = input;
  if (Boolean(snapshot.pixPayload) !== Boolean(snapshot.pixEncodedImage)) {
    throw new Error(
      "Banese retornou snapshot Pix incompleto; nenhuma alteracao foi aplicada.",
    );
  }
  const bankNumbers = validateBaneseRecoveredBankNumbers(snapshot.raw, {
    digitableLine: receivable.gateway_boleto_linha_digitavel,
    barcode: receivable.gateway_boleto_codigo_barras,
    expectedOurNumber: input.nossoNumero,
    pixPayload: snapshot.pixPayload,
  });
  let pixPayload = input.persistedPixPayload;
  let pixEncodedImage = input.persistedPixEncodedImage;
  let persisted = false;
  if (!pixPayload && snapshot.pixPayload && snapshot.pixEncodedImage) {
    if (!bankNumbers) {
      throw new Error(
        "BolePix retornado sem identidade bancaria oficial.",
      );
    }
    await persistBaneseRecoveredPix(admin, {
      receivable,
      environment: input.environment,
      convenio: input.convenio,
      bankNumbers,
      snapshot: {
        nossoNumero: input.nossoNumero,
        pixPayload: snapshot.pixPayload,
        pixEncodedImage: snapshot.pixEncodedImage,
        raw: snapshot.raw,
      },
    });
    pixPayload = snapshot.pixPayload;
    pixEncodedImage = snapshot.pixEncodedImage;
    persisted = true;
  }
  return { bankNumbers, pixPayload, pixEncodedImage, persisted };
};
