import assert from "node:assert/strict";
import { requireTranscriptionApproval, transcribeApprovedAudio, TranscriptionError, TRANSCRIPTION_NOTICE_VERSION } from "./transcription.ts";

const approvedEnvironment: Record<string, string> = {
  WHATSAPP_TRANSCRIPTION_ENABLED: "true",
  WHATSAPP_TRANSCRIPTION_APPROVAL_REFERENCE: "approval-synthetic-v1",
  OPENAI_API_KEY: "synthetic-test-key",
};
const acknowledgement = { noticeVersion: TRANSCRIPTION_NOTICE_VERSION, noticeAccepted: true };
const run = (options: {
  environment?: Record<string, string>;
  notice?: typeof acknowledgement;
  messageType?: string;
  download?: () => Promise<{ bytes: Uint8Array; mime: string }>;
  fetcher?: typeof fetch;
} = {}) => transcribeApprovedAudio({
  messageType: options.messageType || "audio",
  readEnvironment: (name) => (options.environment || approvedEnvironment)[name],
  acknowledgement: options.notice || acknowledgement,
  download: options.download || (() => Promise.resolve({ bytes: new Uint8Array([0, 1, 2]), mime: "audio/ogg" })),
  fetcher: options.fetcher || (() => Promise.resolve(Response.json({ text: "Texto sintético." }))) as typeof fetch,
});

Deno.test("configuração ausente, desligada ou sem decisão bloqueia antes de baixar ou enviar", async () => {
  for (const environment of [
    {}, { ...approvedEnvironment, WHATSAPP_TRANSCRIPTION_ENABLED: "false" },
    { ...approvedEnvironment, WHATSAPP_TRANSCRIPTION_ENABLED: "TRUE" },
    { ...approvedEnvironment, WHATSAPP_TRANSCRIPTION_APPROVAL_REFERENCE: "" },
    { ...approvedEnvironment, WHATSAPP_TRANSCRIPTION_APPROVAL_REFERENCE: "referência com espaços" },
  ]) {
    let downloads = 0, sends = 0;
    await assert.rejects(() => run({ environment,
      download: () => { downloads++; throw new Error("não deveria baixar"); },
      fetcher: () => { sends++; throw new Error("não deveria enviar"); },
    }), (error: unknown) => error instanceof TranscriptionError && error.code === "transcription_disabled");
    assert.equal(downloads, 0);
    assert.equal(sends, 0);
  }
});

Deno.test("aviso antigo, ausente ou não aceito bloqueia chamada direta", async () => {
  for (const notice of [
    {}, { noticeVersion: "obsolete", noticeAccepted: true },
    { noticeVersion: TRANSCRIPTION_NOTICE_VERSION, noticeAccepted: false },
    { noticeVersion: TRANSCRIPTION_NOTICE_VERSION, noticeAccepted: "true" },
  ]) {
    let calls = 0;
    await assert.rejects(() => transcribeApprovedAudio({
      messageType: "audio", readEnvironment: name => approvedEnvironment[name],
      acknowledgement: notice,
      download: () => { calls++; throw new Error("não deveria baixar"); },
    }), (error: unknown) => error instanceof TranscriptionError && error.code === "transcription_notice_required");
    assert.equal(calls, 0);
  }
});

Deno.test("chave ausente ou tipo incompatível não baixa áudio", async () => {
  let calls = 0;
  const download = () => { calls++; throw new Error("não deveria baixar"); };
  await assert.rejects(() => run({ messageType: "document", download }), /Apenas mensagens de áudio/);
  await assert.rejects(() => run({ environment: { ...approvedEnvironment, OPENAI_API_KEY: "" }, download }), /indisponível/);
  assert.equal(calls, 0);
});

Deno.test("envio autorizado usa nome genérico, limite e resposta efêmera sem persistência", async () => {
  let calls = 0;
  const result = await run({ fetcher: (async (url, init) => {
    calls++;
    assert.equal(url, "https://api.openai.com/v1/audio/transcriptions");
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer synthetic-test-key");
    assert.ok(init?.signal instanceof AbortSignal);
    const body = init?.body;
    assert.ok(body instanceof FormData);
    const file = body.get("file");
    assert.ok(file instanceof File);
    assert.equal(file.name, "audio.ogg");
    assert.equal(file.type, "audio/ogg");
    assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [0, 1, 2]);
    assert.equal(body.get("model"), "gpt-4o-mini-transcribe");
    return Response.json({ text: "  Transcrição sintética.  " });
  }) as typeof fetch });
  assert.equal(calls, 1);
  assert.equal(result, "Transcrição sintética.");
});

Deno.test("áudio vazio, excessivo ou mídia disfarçada é recusada sem envio", async () => {
  for (const media of [
    { bytes: new Uint8Array(), mime: "audio/ogg" },
    { bytes: new Uint8Array(16 * 1024 * 1024 + 1), mime: "audio/ogg" },
    { bytes: new Uint8Array([1]), mime: "application/pdf" },
    { bytes: new Uint8Array([1]), mime: "audio/aac" },
  ]) {
    let calls = 0;
    await assert.rejects(() => run({ download: () => Promise.resolve(media), fetcher: () => {
      calls++; throw new Error("não deveria enviar");
    } }), /formato ou tamanho/);
    assert.equal(calls, 0);
  }
});

Deno.test("aliases de áudio preservam extensão suportada, sem reutilizar nome pessoal", async () => {
  for (const [mime, expected] of [["audio/x-wav", "audio.wav"], ["audio/mp3", "audio.mp3"], ["audio/flac", "audio.flac"]]) {
    await run({ download: () => Promise.resolve({ bytes: new Uint8Array([1]), mime }),
      fetcher: (async (_url, init) => {
        const file = (init!.body as FormData).get("file") as File;
        assert.equal(file.name, expected);
        return Response.json({ text: "Teste sintético." });
      }) as typeof fetch,
    });
  }
});

Deno.test("falhas do provedor e da mídia nunca propagam conteúdo ou detalhes internos", async () => {
  for (const options of [
    { fetcher: () => Promise.resolve(Response.json({ error: { message: "payload-synthetic-private" } }, { status: 400 })) },
    { fetcher: () => Promise.reject(new Error("token=synthetic-secret")) },
    { download: () => Promise.reject(new Error("private-media-id")) },
    { fetcher: () => Promise.resolve(Response.json({ unexpected: "synthetic" })) },
  ]) {
    await assert.rejects(() => run(options), (error: unknown) => {
      assert.ok(error instanceof TranscriptionError);
      assert.equal(error.code, "transcription_failed");
      assert.equal(error.status, 502);
      assert.doesNotMatch(error.message, /private|token|payload|synthetic/);
      return true;
    });
  }
});

Deno.test("versão do aviso coincide com o contrato do navegador", async () => {
  const source = await Deno.readTextFile(new URL("../../../modules/gestor/comunicacao/components/whatsapp/whatsapp-transcription.service.ts", import.meta.url));
  assert.ok(source.includes(`'${TRANSCRIPTION_NOTICE_VERSION}'`));
  assert.doesNotThrow(() => requireTranscriptionApproval(name => approvedEnvironment[name], acknowledgement));
});
