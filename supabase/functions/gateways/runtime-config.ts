export type GatewayRuntimeEnvironment = "sandbox" | "production";

export type GatewayRuntimeConfig = {
  enabled: boolean;
  activeEnvironment: GatewayRuntimeEnvironment;
};

const normalizeEnvironment = (value: unknown): GatewayRuntimeEnvironment =>
  String(value || "").trim().toLowerCase() === "production"
    ? "production"
    : "sandbox";

export const getGatewayRuntimeConfig = async (
  admin: any,
): Promise<GatewayRuntimeConfig> => {
  const { data, error } = await admin
    .from("payment_gateway_runtime_config")
    .select("enabled, active_environment")
    .eq("id", true)
    .maybeSingle();

  if (error) throw error;
  if (data) {
    return {
      enabled: data.enabled === true,
      activeEnvironment: normalizeEnvironment(data.active_environment),
    };
  }

  // Falha fechada: a ausência da linha canônica nunca pode reativar o legado.
  return {
    enabled: false,
    activeEnvironment: "sandbox",
  };
};

export const saveGatewayRuntimeConfig = async (
  admin: any,
  input: {
    enabled: boolean;
    activeEnvironment: GatewayRuntimeEnvironment;
    updatedBy?: string | null;
  },
): Promise<GatewayRuntimeConfig> => {
  const { data, error } = await admin
    .from("payment_gateway_runtime_config")
    .upsert({
      id: true,
      enabled: input.enabled === true,
      active_environment: normalizeEnvironment(input.activeEnvironment),
      updated_by: input.updatedBy || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" })
    .select("enabled, active_environment")
    .single();

  if (error) throw error;
  return {
    enabled: data.enabled === true,
    activeEnvironment: normalizeEnvironment(data.active_environment),
  };
};
