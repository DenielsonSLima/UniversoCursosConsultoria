type RecoveredBankNumbers = {
  digitableLine: string;
  barcode: string;
  replacePersistedBankNumbers: boolean;
};

type RecoveredPixSnapshot = {
  nossoNumero: string;
  pixPayload: string;
  pixEncodedImage: string;
  raw: unknown;
};

export const persistBaneseRecoveredPix = async (
  admin: any,
  input: {
    receivable: Record<string, any>;
    environment: "sandbox" | "production";
    convenio: unknown;
    bankNumbers: RecoveredBankNumbers;
    snapshot: RecoveredPixSnapshot;
  },
) => {
  const { receivable, bankNumbers, snapshot } = input;
  const expectedConvenio = String(input.convenio || "").replace(/\D/g, "");
  const { data, error } = await admin.rpc("persist_banese_recovered_pix", {
    p_receivable_id: receivable.id,
    p_environment: input.environment,
    p_nosso_numero: snapshot.nossoNumero,
    p_pix_payload: snapshot.pixPayload,
    p_pix_encoded_image: snapshot.pixEncodedImage,
    p_remote_digitable_line: bankNumbers.digitableLine,
    p_remote_barcode: bankNumbers.barcode,
    p_expected_amount: Number(receivable.valor),
    p_expected_due_date: String(receivable.data_vencimento || "").slice(0, 10),
    p_expected_convenio: expectedConvenio,
    // Nome legado do argumento SQL; true autoriza somente reparar uma linha
    // local invalida que reconstrua exatamente o mesmo codigo de barras.
    p_replace_invalid_digitable_line: bankNumbers.replacePersistedBankNumbers,
    p_reconciliation: {
      source: "BANESE_QUERY_BY_NOSSO_NUMERO",
      convenio: expectedConvenio,
      nossoNumero: snapshot.nossoNumero,
      response: snapshot.raw,
    },
  });
  if (error) throw error;
  if (!data || data.persisted !== true) {
    throw new Error(
      "O retorno Pix do Banese foi validado, mas nao foi persistido.",
    );
  }
  receivable.gateway_boleto_linha_digitavel = bankNumbers.digitableLine;
  receivable.gateway_boleto_codigo_barras = bankNumbers.barcode;
  receivable.gateway_pix_payload = snapshot.pixPayload;
  receivable.gateway_pix_encoded_image = snapshot.pixEncodedImage;
  receivable.gateway_synced_at = String(data.persistedAt || "");
  receivable.updated_at = String(data.persistedAt || "");
  if (!receivable.updated_at) {
    throw new Error(
      "A persistencia Pix Banese nao retornou o instante do CAS.",
    );
  }
  return receivable;
};
