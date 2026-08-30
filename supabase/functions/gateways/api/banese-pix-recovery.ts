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
    allowLegacyImportedBankNumbersMismatch?: boolean;
    skipLegacyImportedPixPersistence?: boolean;
  },
) => {
  const { receivable, snapshot } = input;
  if (Boolean(snapshot.pixPayload) !== Boolean(snapshot.pixEncodedImage)) {
    throw new Error(
      "Banese retornou snapshot Pix incompleto; nenhuma alteracao foi aplicada.",
    );
  }
  let bankNumbers;
  try {
    bankNumbers = validateBaneseRecoveredBankNumbers(snapshot.raw, {
      digitableLine: receivable.gateway_boleto_linha_digitavel,
      barcode: receivable.gateway_boleto_codigo_barras,
      expectedOurNumber: input.nossoNumero,
      pixPayload: snapshot.pixPayload,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const canQueryLegacyImportByOurNumber =
      input.allowLegacyImportedBankNumbersMismatch === true &&
      !snapshot.pixPayload &&
      !snapshot.pixEncodedImage &&
      /numeros bancarios retornados pelo banese divergem do titulo persistido/i
        .test(message);
    if (!canQueryLegacyImportByOurNumber) throw error;

    // A consulta oficial ainda precisa provar que os números devolvidos pelo
    // Banese são válidos e pertencem ao Nosso Número solicitado. Não os
    // copiamos para o histórico importado: este fluxo serve exclusivamente
    // para revalidar situação/baixa de boleto legado, sem alterar sua prova.
    validateBaneseRecoveredBankNumbers(snapshot.raw, {
      expectedOurNumber: input.nossoNumero,
    });
    bankNumbers = null;
  }
  let pixPayload = input.persistedPixPayload;
  let pixEncodedImage = input.persistedPixEncodedImage;
  let persisted = false;
  if (!pixPayload && snapshot.pixPayload && snapshot.pixEncodedImage) {
    if (input.skipLegacyImportedPixPersistence === true) {
      // O importado histórico é somente reconsultado para refletir baixa. Um
      // QR recuperado não é parte dessa prova e não deve abrir uma mutação
      // auxiliar antes da confirmação PENDING; a rota de pagamento continua
      // passando pela persistência atômica abaixo do reconciliador.
      return { bankNumbers, pixPayload, pixEncodedImage, persisted };
    }
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
