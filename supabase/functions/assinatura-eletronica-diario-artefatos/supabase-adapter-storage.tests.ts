import assert from "node:assert/strict";
import { SIGNATURE_ARTIFACT_BUCKET } from "./artifacts.ts";
import {
  CLAIM_ORPHAN_UPLOADS_RPC,
  COMPLETE_ORPHAN_CLEANUP_RPC,
  createSupabaseDiarioArtifactDependencies,
  REPORT_ORPHAN_CLEANUP_RPC,
  VALIDATE_ORPHAN_CLAIM_RPC,
} from "./supabase-adapter.ts";
import { sha256Hex } from "./artifact-assets.ts";

const UUIDS = Array.from(
  { length: 8 },
  (_, index) =>
    `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);

Deno.test("retry de upload reutiliza somente o órfão privado byte-a-byte idêntico", async () => {
  const bytes = new TextEncoder().encode("%PDF-1.7\nfixture");
  const sha256 = await sha256Hex(bytes);
  let uploads = 0;
  let downloads = 0;
  let removals = 0;
  const fakeAdmin = {
    auth: {
      getClaims: () => Promise.resolve({ data: null, error: null }),
      getUser: () => Promise.resolve({ data: null, error: null }),
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
    storage: {
      from: (_bucketId?: string) => ({
        upload: () => {
          uploads += 1;
          return Promise.resolve({ data: null, error: { code: "23505" } });
        },
        download: () => {
          downloads += 1;
          return Promise.resolve({
            data: new Blob([bytes], { type: "application/pdf" }),
            error: null,
          });
        },
        remove: () => {
          removals += 1;
          return Promise.resolve({ data: [], error: null });
        },
      }),
    },
  };
  const dependencies = createSupabaseDiarioArtifactDependencies(
    {
      supabaseUrl: "https://project.supabase.co",
      serviceRoleKey: "test-service-key",
      validationOrigin: "https://universocc.com.br",
      validationAllowedOrigins: ["https://universocc.com.br"],
    },
    () => fakeAdmin,
  );
  const reference = {
    bucketId: SIGNATURE_ARTIFACT_BUCKET,
    storagePath: `envelopes/${UUIDS[0]}/documento-original.pdf`,
    byteSize: bytes.byteLength,
    sha256,
  };
  assert.equal(
    await dependencies.uploadImmutable({
      reference,
      bytes,
      contentType: "application/pdf",
    }),
    "EXISTING_IDENTICAL",
  );
  assert.equal(
    await dependencies.uploadImmutable({
      reference,
      bytes,
      contentType: "application/pdf",
    }),
    "EXISTING_IDENTICAL",
  );
  assert.equal(uploads, 2);
  assert.equal(downloads, 2);
  assert.equal(removals, 0);
});

Deno.test("retry falha fechado quando o objeto órfão diverge dos bytes esperados", async () => {
  const expected = new TextEncoder().encode("%PDF-1.7\nexpected");
  const different = new TextEncoder().encode("%PDF-1.7\ndifferent");
  const expectedSha256 = await sha256Hex(expected);
  const dependencies = createSupabaseDiarioArtifactDependencies(
    {
      supabaseUrl: "https://project.supabase.co",
      serviceRoleKey: "test-service-key",
      validationOrigin: "https://universocc.com.br",
      validationAllowedOrigins: ["https://universocc.com.br"],
    },
    () => ({
      auth: {
        getClaims: () => Promise.resolve({ data: null, error: null }),
        getUser: () => Promise.resolve({ data: null, error: null }),
      },
      rpc: () => Promise.resolve({ data: null, error: null }),
      storage: {
        from: () => ({
          upload: () =>
            Promise.resolve({ data: null, error: { code: "23505" } }),
          download: () =>
            Promise.resolve({
              data: new Blob([different], { type: "application/pdf" }),
              error: null,
            }),
          remove: () => Promise.resolve({ data: [], error: null }),
        }),
      },
    }),
  );
  await assert.rejects(() =>
    dependencies.uploadImmutable({
      reference: {
        bucketId: SIGNATURE_ARTIFACT_BUCKET,
        storagePath: `envelopes/${UUIDS[0]}/documento-original.pdf`,
        byteSize: expected.byteLength,
        sha256: expectedSha256,
      },
      bytes: expected,
      contentType: "application/pdf",
    })
  );
});

Deno.test("reconciliador remove só após hash exato e segunda validação DB-aware", async () => {
  const bytes = new TextEncoder().encode("%PDF-1.7\norphan");
  const sha256 = await sha256Hex(bytes);
  const intentId = UUIDS[4];
  const leaseToken = UUIDS[5];
  const storagePath = `envelopes/${UUIDS[0]}/documento-final.pdf`;
  const calls: string[] = [];
  const fakeAdmin = {
    auth: {
      getClaims: () => Promise.resolve({ data: null, error: null }),
      getUser: () => Promise.resolve({ data: null, error: null }),
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push(`rpc:${name}`);
      if (name === CLAIM_ORPHAN_UPLOADS_RPC) {
        assert.deepEqual(args, { p_limit: 1 });
        return Promise.resolve({
          data: [{
            intentId,
            leaseToken,
            envelopeId: UUIDS[0],
            class: "DOCUMENTO_FINAL",
            bucketId: SIGNATURE_ARTIFACT_BUCKET,
            storagePath,
            byteSize: bytes.byteLength,
            sha256,
          }],
          error: null,
        });
      }
      if (name === VALIDATE_ORPHAN_CLAIM_RPC) {
        assert.deepEqual(args, {
          p_intent_id: intentId,
          p_lease_token: leaseToken,
        });
        return Promise.resolve({
          data: { deleteAllowed: true, reason: "UNREFERENCED" },
          error: null,
        });
      }
      if (name === COMPLETE_ORPHAN_CLEANUP_RPC) {
        return Promise.resolve({ data: { state: "REMOVED" }, error: null });
      }
      throw new Error(`RPC inesperada: ${name}`);
    },
    storage: {
      from: (bucketId: string) => {
        assert.equal(bucketId, SIGNATURE_ARTIFACT_BUCKET);
        return {
          upload: () => Promise.resolve({ data: null, error: null }),
          download: (path: string) => {
            calls.push(`download:${path}`);
            return Promise.resolve({
              data: new Blob([bytes], { type: "application/pdf" }),
              error: null,
            });
          },
          remove: (paths: string[]) => {
            calls.push(`remove:${paths.join(",")}`);
            return Promise.resolve({
              data: [{ name: storagePath }],
              error: null,
            });
          },
        };
      },
    },
  };
  const dependencies = createSupabaseDiarioArtifactDependencies(
    {
      supabaseUrl: "https://project.supabase.co",
      serviceRoleKey: "test-service-key",
      validationOrigin: "https://universocc.com.br",
      validationAllowedOrigins: ["https://universocc.com.br"],
    },
    () => fakeAdmin,
  );
  await dependencies.reconcileExpiredUploads();
  assert.deepEqual(calls, [
    `rpc:${CLAIM_ORPHAN_UPLOADS_RPC}`,
    `download:${storagePath}`,
    `rpc:${VALIDATE_ORPHAN_CLAIM_RPC}`,
    `remove:${storagePath}`,
    `rpc:${COMPLETE_ORPHAN_CLEANUP_RPC}`,
  ]);
});

Deno.test("reconciliador nunca remove path cujo conteúdo diverge da intenção", async () => {
  const expected = new TextEncoder().encode("%PDF-1.7\nexpected");
  const divergent = new TextEncoder().encode("%PDF-1.7\ndivergent");
  const storagePath = `envelopes/${UUIDS[0]}/comprovante-evidencia.pdf`;
  let removed = false;
  let reported = "";
  const dependencies = createSupabaseDiarioArtifactDependencies(
    {
      supabaseUrl: "https://project.supabase.co",
      serviceRoleKey: "test-service-key",
      validationOrigin: "https://universocc.com.br",
      validationAllowedOrigins: ["https://universocc.com.br"],
    },
    () => ({
      auth: {
        getClaims: () => Promise.resolve({ data: null, error: null }),
        getUser: () => Promise.resolve({ data: null, error: null }),
      },
      rpc: (name: string, args: Record<string, unknown>) => {
        if (name === CLAIM_ORPHAN_UPLOADS_RPC) {
          assert.deepEqual(args, { p_limit: 1 });
          return Promise.resolve({
            data: [{
              intentId: UUIDS[4],
              leaseToken: UUIDS[5],
              envelopeId: UUIDS[0],
              class: "COMPROVANTE_EVIDENCIA",
              bucketId: SIGNATURE_ARTIFACT_BUCKET,
              storagePath,
              byteSize: expected.byteLength,
              sha256: "9".repeat(64),
            }],
            error: null,
          });
        }
        assert.equal(name, REPORT_ORPHAN_CLEANUP_RPC);
        reported = String(args.p_resultado);
        return Promise.resolve({ data: { state: "DIVERGENT" }, error: null });
      },
      storage: {
        from: () => ({
          upload: () => Promise.resolve({ data: null, error: null }),
          download: () =>
            Promise.resolve({
              data: new Blob([divergent], { type: "application/pdf" }),
              error: null,
            }),
          remove: () => {
            removed = true;
            return Promise.resolve({ data: [], error: null });
          },
        }),
      },
    }),
  );
  await dependencies.reconcileExpiredUploads();
  assert.equal(reported, "HASH_DIVERGENTE");
  assert.equal(removed, false);
});

Deno.test("scheduler preserva receiver do EdgeRuntime.waitUntil e não aguarda cleanup", async () => {
  const scope = globalThis as unknown as {
    EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void };
  };
  const previous = scope.EdgeRuntime;
  let retained: Promise<unknown> | null = null;
  const runtime = {
    waitUntil(this: unknown, promise: Promise<unknown>) {
      assert.equal(this, runtime);
      retained = promise;
    },
  };
  scope.EdgeRuntime = runtime;
  try {
    const dependencies = createSupabaseDiarioArtifactDependencies(
      {
        supabaseUrl: "https://project.supabase.co",
        serviceRoleKey: "test-service-key",
        validationOrigin: "https://universocc.com.br",
        validationAllowedOrigins: ["https://universocc.com.br"],
      },
      () => ({
        auth: {
          getClaims: () => Promise.resolve({ data: null, error: null }),
          getUser: () => Promise.resolve({ data: null, error: null }),
        },
        rpc: () => Promise.resolve({ data: [], error: null }),
        storage: {
          from: () => ({
            download: () =>
              Promise.resolve({ data: null, error: new Error("unused") }),
            upload: () =>
              Promise.resolve({ data: null, error: new Error("unused") }),
            remove: () =>
              Promise.resolve({ data: null, error: new Error("unused") }),
          }),
        },
      }),
    );
    let completed = false;
    dependencies.scheduleBackgroundTask(async () => {
      await Promise.resolve();
      completed = true;
    });
    assert.ok(retained);
    assert.equal(completed, false);
    await retained;
    assert.equal(completed, true);
  } finally {
    if (previous) scope.EdgeRuntime = previous;
    else delete scope.EdgeRuntime;
  }
});
