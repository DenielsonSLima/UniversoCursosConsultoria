export type WhatsAppConnection = {
  id: string;
  nome: string;
  instituicao: "universo" | "anhanguera" | "unopar";
  telefone?: string | null;
  phone_number_id?: string | null;
  waba_id?: string | null;
  is_default?: boolean | null;
  is_matriz_financeira?: boolean | null;
  status?: "ativo" | "inativo" | null;
  connection_mode?: "cloud_api" | "coexistence" | null;
  graph_version?: string | null;
  app_id?: string | null;
  token_configured?: boolean | null;
};

export const normalizeGraphVersion = (value: unknown) => {
  const version = String(value || "v25.0").trim();
  return /^v\d+\.\d+$/.test(version) ? version : "v25.0";
};

export const loadWhatsAppConnection = async (
  admin: any,
  connectionId: unknown,
): Promise<WhatsAppConnection> => {
  const id = String(connectionId || "").trim();
  if (!id) throw new Error("Conexão WhatsApp não informada.");

  const { data, error } = await admin
    .from("whatsapp_conexoes")
    .select(
      "id,nome,instituicao,telefone,phone_number_id,waba_id,is_default,is_matriz_financeira,status,connection_mode,graph_version,app_id,token_configured",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Conexão WhatsApp não encontrada.");
  return data as WhatsAppConnection;
};

export const findWhatsAppConnectionByMeta = async (
  admin: any,
  phoneNumberId: unknown,
  wabaId?: unknown,
): Promise<WhatsAppConnection | null> => {
  const phoneId = String(phoneNumberId || "").trim();
  const businessId = String(wabaId || "").trim();
  if (!phoneId && !businessId) return null;

  let query = admin
    .from("whatsapp_conexoes")
    .select(
      "id,nome,instituicao,telefone,phone_number_id,waba_id,is_default,is_matriz_financeira,status,connection_mode,graph_version,app_id,token_configured",
    );
  query = phoneId ? query.eq("phone_number_id", phoneId) : query.eq("waba_id", businessId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (businessId && data.waba_id && String(data.waba_id) !== businessId) return null;
  return data as WhatsAppConnection;
};

export const getWhatsAppConnectionSecret = async (
  admin: any,
  connectionId: string,
  kind: "access_token" | "app_secret" | "verify_token",
) => {
  const { data, error } = await admin.rpc("whatsapp_get_connection_secret", {
    p_connection_id: connectionId,
    p_secret_kind: kind,
  });
  if (error) throw error;
  return String(data || "").trim();
};

export const getWhatsAppMetaContext = async (
  admin: any,
  connectionId: string,
) => {
  const connection = await loadWhatsAppConnection(admin, connectionId);
  const accessToken = await getWhatsAppConnectionSecret(
    admin,
    connection.id,
    "access_token",
  );
  const phoneNumberId = String(connection.phone_number_id || "").trim();
  if (
    connection.status !== "ativo" ||
    connection.token_configured !== true ||
    !accessToken ||
    !phoneNumberId
  ) {
    throw new Error(`A linha ${connection.nome} ainda não está pronta na Meta.`);
  }

  return {
    connection,
    accessToken,
    phoneNumberId,
    graphVersion: normalizeGraphVersion(connection.graph_version),
    appId: String(connection.app_id || "").trim(),
  };
};
