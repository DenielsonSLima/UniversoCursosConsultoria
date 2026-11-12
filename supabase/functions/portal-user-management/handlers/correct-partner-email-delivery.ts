export interface CorrectedEmailDelivery {
  sent: boolean;
  definitiveFailure: boolean;
}

/** Recovery targets only the email returned by the authorized canonical claim; no link is exposed. */
export async function deliverCorrectedPartnerEmail(
  supabaseUrl: string,
  apiKey: string,
  email: string,
  redirectTo: string,
): Promise<CorrectedEmailDelivery> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const url = new URL(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/recover`);
    url.searchParams.set("redirect_to", redirectTo);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
      signal: controller.signal,
    });
    return {
      sent: response.ok,
      definitiveFailure: response.status >= 400 && response.status < 500,
    };
  } catch {
    // An absent acknowledgement does not prove that Auth/SMTP rejected the message.
    return { sent: false, definitiveFailure: false };
  } finally {
    clearTimeout(timer);
  }
}
