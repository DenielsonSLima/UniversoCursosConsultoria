import {
  apiSecretName,
  baseUrlFor,
  type Environment,
} from "../core/runtime.ts";
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
