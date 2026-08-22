export const normalizeEmail = (value?: string | null) =>
  String(value || "").trim().toLowerCase();

const extractTextFromResponse = async (response: Response) => {
  const raw = await response.text().catch(() => "");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.msg && typeof parsed.msg === "string") return parsed.msg;
    if (
      parsed?.error_description && typeof parsed.error_description === "string"
    ) {
      return parsed.error_description;
    }
    if (parsed?.error && typeof parsed.error === "string") return parsed.error;
    if (parsed?.message && typeof parsed.message === "string") {
      return parsed.message;
    }
  } catch {
    return raw;
  }

  return null;
};

export const sendRecoveryEmail = async (
  supabaseUrl: string,
  apiKey: string | null,
  email: string,
  redirectTo: string,
) => {
  if (!apiKey) {
    return {
      sent: false,
      definitiveFailure: true,
      message:
        "Configuração de e-mail ausente no servidor (SUPABASE_ANON_KEY ou SUPABASE_PUBLISHABLE_KEY).",
    };
  }

  try {
    const recoveryUrl = new URL(
      `${supabaseUrl.replace(/\/$/, "")}/auth/v1/recover`,
    );
    recoveryUrl.searchParams.set("redirect_to", redirectTo);
    const response = await fetch(recoveryUrl.toString(), {
      method: "POST",
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const errorMessage = (await extractTextFromResponse(response)) ||
        `Não foi possível enviar o e-mail de recuperação (${response.status}).`;
      return {
        sent: false,
        definitiveFailure: response.status >= 400 && response.status < 500,
        message: errorMessage,
      };
    }

    return { sent: true, definitiveFailure: false, message: null };
  } catch (error) {
    return {
      sent: false,
      // Sem resposta do provedor, o envio pode ter sido aceito. O chamador
      // deve manter sua reserva idempotente para não duplicar o e-mail.
      definitiveFailure: false,
      message: error instanceof Error
        ? error.message
        : "Falha inesperada ao enviar e-mail de recuperação.",
    };
  }
};

export const listAuthUsersByEmail = async (admin: any, emails: Set<string>) => {
  const usersByEmail = new Map<string, any>();
  if (emails.size === 0) return usersByEmail;

  let page = 1;
  const perPage = 1000;

  while (usersByEmail.size < emails.size) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users || [];
    for (const user of users) {
      const email = normalizeEmail(user.email);
      if (email && emails.has(email)) usersByEmail.set(email, user);
    }

    if (users.length < perPage) break;
    page += 1;
  }

  return usersByEmail;
};

export const listAuthUsersByIdentity = async (
  admin: any,
  userIds: Set<string>,
  emails: Set<string>,
) => {
  const usersById = new Map<string, any>();
  const usersByEmail = new Map<string, any>();
  if (userIds.size === 0 && emails.size === 0) {
    return { usersById, usersByEmail };
  }

  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users || [];
    for (const user of users) {
      if (user?.id && userIds.has(user.id)) usersById.set(user.id, user);
      const email = normalizeEmail(user?.email);
      if (email && emails.has(email)) usersByEmail.set(email, user);
    }

    const foundAll = usersById.size === userIds.size &&
      usersByEmail.size === emails.size;
    if (foundAll || users.length < perPage) break;
    page += 1;
  }

  return { usersById, usersByEmail };
};

export const findAuthUserByEmail = async (admin: any, email: string) => {
  const targetEmail = normalizeEmail(email);
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const user = (data?.users || []).find((item: any) =>
      normalizeEmail(item.email) === targetEmail
    );
    if (user) return user;

    if (!data?.users?.length || data.users.length < perPage) return null;
    page += 1;
  }
};
