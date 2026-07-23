import assert from "node:assert/strict";
import { resolveCoexistencePhoneNumber } from "./metaGraph.ts";

const originalFetch = globalThis.fetch;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(
    JSON.stringify(body),
    { status, headers: { "Content-Type": "application/json" } },
  );

Deno.test("confirma exatamente o numero em coexistencia retornado pela Meta", async () => {
  const requestedUrls: string[] = [];
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url.includes("/waba-1/phone_numbers")) {
      return Promise.resolve(
        jsonResponse({ data: [{ id: "phone-1" }, { id: "phone-2" }] }),
      );
    }
    if (url.includes("/phone-2?")) {
      return Promise.resolve(jsonResponse({
        id: "phone-2",
        is_on_biz_app: true,
        platform_type: "CLOUD_API",
        display_phone_number: "+55 79 99999-0000",
      }));
    }
    return Promise.resolve(
      jsonResponse({ error: { message: "unexpected request" } }, 404),
    );
  }) as typeof fetch;

  try {
    const result = await resolveCoexistencePhoneNumber({
      graphVersion: "v25.0",
      wabaId: "waba-1",
      preferredPhoneNumberId: "phone-2",
      accessToken: "token",
    });

    assert.equal(result.id, "phone-2");
    assert.equal(result.is_on_biz_app, true);
    assert.equal(requestedUrls.some((url) => url.includes("/phone-1?")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("rejeita numero Cloud API que nao esta no WhatsApp Business App", async () => {
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/waba-1/phone_numbers")) {
      return Promise.resolve(jsonResponse({ data: [{ id: "phone-test" }] }));
    }
    return Promise.resolve(jsonResponse({
      id: "phone-test",
      is_on_biz_app: false,
      platform_type: "CLOUD_API",
    }));
  }) as typeof fetch;

  try {
    await assert.rejects(
      () =>
        resolveCoexistencePhoneNumber({
          graphVersion: "v25.0",
          wabaId: "waba-1",
          preferredPhoneNumberId: "phone-test",
          accessToken: "token",
        }),
      /ainda nao confirmou o numero em coexistencia/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("rejeita Phone Number ID que nao pertence a WABA selecionada", async () => {
  globalThis.fetch = (() =>
    Promise.resolve(jsonResponse({
      data: [{ id: "phone-1" }],
    }))) as typeof fetch;

  try {
    await assert.rejects(
      () =>
        resolveCoexistencePhoneNumber({
          graphVersion: "v25.0",
          wabaId: "waba-1",
          preferredPhoneNumberId: "phone-other",
          accessToken: "token",
        }),
      /nao pertence a WABA selecionada/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
