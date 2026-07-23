import type { AdminClient } from "./types.ts";
import { trimOrNull } from "./utils.ts";

export const getSecret = async (admin: AdminClient, name: string) => {
  const { data, error } = await admin.rpc("whatsapp_get_secret", {
    p_secret_name: name,
  });
  if (error) throw error;
  return trimOrNull(data);
};

export const setSecret = async (
  admin: AdminClient,
  name: string,
  value: string,
) => {
  const { error } = await admin.rpc("whatsapp_set_secret", {
    p_secret_name: name,
    p_secret_value: value,
  });
  if (error) throw error;
};
