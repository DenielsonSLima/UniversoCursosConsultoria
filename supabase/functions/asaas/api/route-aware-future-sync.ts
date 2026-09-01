import {
  apiSecretName,
  baseUrlFor,
  type Environment,
} from "../core/runtime.ts";
import { shouldSkipTechnicalManualFutureSync } from "../../_shared/technical-manual-future-sync.ts";
import { createAsaasBillingService } from "./billing.service.ts";

const anyNotificationChannelEnabled = (config: any) =>
  config?.notification_whatsapp_enabled === true ||
  config?.notification_email_enabled === true ||
  config?.notification_sms_enabled === true ||
  config?.notifications_enabled === true;

export const syncRouteAwareFutureInstallments = async (
  admin: any,
  matriculaId: string,
  environment: Environment,
) => {
  if (await shouldSkipTechnicalManualFutureSync(admin, matriculaId)) {
    return {
      success: true,
      skipped: true,
      count: 0,
      reason:
        "Emissão automática futura desativada pela política manual do curso técnico.",
    };
  }

  const { data: config, error: configError } = await admin
    .from("asaas_config")
    .select("*")
    .maybeSingle();
  if (configError) throw configError;

  const { data: apiKey, error: secretError } = await admin.rpc(
    "asaas_get_secret",
    { p_secret_name: apiSecretName(environment) },
  );
  if (secretError) throw secretError;

  const billing = createAsaasBillingService(
    admin,
    anyNotificationChannelEnabled,
  );
  return billing.syncFutureInstallments(
    {
      config: config || { environment },
      apiKey: String(apiKey || ""),
      environment,
      baseUrl: baseUrlFor(environment),
    },
    matriculaId,
  );
};
