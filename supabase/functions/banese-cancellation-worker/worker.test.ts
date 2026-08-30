import assert from "node:assert/strict";
import {
  BaneseAdapterError,
  BaneseCancellationRequiresReviewError,
} from "../banese/core/adapter/types.ts";
import {
  createBaneseCancellationWorkerHandler,
  processBaneseCancellationBatch,
} from "./worker.ts";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const LEASE_TOKEN = "22222222-2222-4222-8222-222222222222";
const RECEIVABLE_ID = "33333333-3333-4333-8333-333333333333";
const OUR_NUMBER = "000000015";
const WORKER_SECRET = "banese-worker-secret-with-more-than-32-bytes";

const claimedJob = {
  job_id: JOB_ID,
  lease_token: LEASE_TOKEN,
  receivable_id: RECEIVABLE_ID,
  environment: "production",
  convenio: "15528",
  nosso_numero: OUR_NUMBER,
};

type RpcCall = {
  name: string;
  args?: Record<string, unknown>;
};

const fakeAdmin = (options: {
  claims?: unknown[];
  completionErrors?: unknown[];
  completionAcks?: boolean[];
  startError?: unknown;
  startAck?: boolean;
  failError?: unknown;
  failAck?: boolean;
  secret?: string;
  secretError?: unknown;
} = {}) => {
  const calls: RpcCall[] = [];
  const completionErrors = [...(options.completionErrors ?? [])];
  const completionAcks = [...(options.completionAcks ?? [])];
  const admin = {
    rpc: (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "get_banese_reconciliation_worker_secret") {
        return Promise.resolve({
          data: options.secret ?? WORKER_SECRET,
          error: options.secretError ?? null,
        });
      }
      if (name === "claim_banese_cancellation_batch") {
        return Promise.resolve({
          data: options.claims ?? [claimedJob],
          error: null,
        });
      }
      if (name === "start_banese_cancellation_remote_attempt") {
        return Promise.resolve({
          data: { started: options.startAck ?? true },
          error: options.startError ?? null,
        });
      }
      if (name === "complete_banese_cancellation_job") {
        return Promise.resolve({
          data: { completed: completionAcks.shift() ?? true },
          error: completionErrors.shift() ?? null,
        });
      }
      if (name === "fail_banese_cancellation_job") {
        return Promise.resolve({
          data: {
            failed: options.failAck ?? true,
            state: "REVIEW_REQUIRED",
          },
          error: options.failError ?? null,
        });
      }
      return Promise.reject(new Error(`RPC inesperada: ${name}`));
    },
  };
  return { admin, calls };
};

const callsNamed = (calls: RpcCall[], name: string) =>
  calls.filter((call) => call.name === name);

Deno.test("worker cancela no Banese antes da conclusão local atômica", async () => {
  const { admin, calls } = fakeAdmin();
  let mutationStarted = false;
  const summary = await processBaneseCancellationBatch(admin, 1, {
    cancelBoleto: (_admin, environment, input) => {
      assert.equal(environment, "production");
      assert.equal(input.convenio, "15528");
      assert.equal(input.nossoNumero, OUR_NUMBER);
      input.onMutationStart?.();
      mutationStarted = true;
      return Promise.resolve({
        situationCode: 5,
        remoteStatus: "CANCELED",
        alreadyCanceled: false,
      });
    },
  });

  assert.equal(mutationStarted, true);
  assert.deepEqual(
    callsNamed(calls, "start_banese_cancellation_remote_attempt")[0].args,
    { p_job_id: JOB_ID, p_lease_token: LEASE_TOKEN },
  );
  assert.ok(
    calls.findIndex((call) =>
      call.name === "start_banese_cancellation_remote_attempt"
    ) < calls.findIndex((call) =>
      call.name === "complete_banese_cancellation_job"
    ),
  );
  assert.deepEqual(summary, {
    claimed: 1,
    completed: 1,
    alreadyCanceled: 0,
    reviewRequired: 0,
    failed: 0,
    auditFailures: 0,
  });
  assert.deepEqual(
    callsNamed(calls, "complete_banese_cancellation_job")[0].args,
    {
      p_job_id: JOB_ID,
      p_lease_token: LEASE_TOKEN,
      p_remote_status: "CANCELED",
      p_already_canceled: false,
    },
  );
  assert.equal(callsNamed(calls, "fail_banese_cancellation_job").length, 0);
});

Deno.test("worker conclui replay de título já cancelado sem novo PUT", async () => {
  const { admin, calls } = fakeAdmin();
  const summary = await processBaneseCancellationBatch(admin, 1, {
    cancelBoleto: (_admin, _environment, _input) => {
      return Promise.resolve({
        situationCode: 5,
        remoteStatus: "CANCELED",
        alreadyCanceled: true,
      });
    },
  });

  assert.equal(summary.completed, 1);
  assert.equal(summary.alreadyCanceled, 1);
  const completion = callsNamed(calls, "complete_banese_cancellation_job")[0];
  assert.equal(completion.args?.p_already_canceled, true);
});

Deno.test("boleto pago ou não cancelável vai para revisão sem conclusão local", async () => {
  const { admin, calls } = fakeAdmin();
  const summary = await processBaneseCancellationBatch(admin, 1, {
    cancelBoleto: () =>
      Promise.reject(
        new BaneseCancellationRequiresReviewError(
          "O banco confirmou pagamento.",
        ),
      ),
  });

  assert.equal(summary.reviewRequired, 1);
  assert.equal(summary.completed, 0);
  assert.equal(callsNamed(calls, "complete_banese_cancellation_job").length, 0);
  const failure = callsNamed(calls, "fail_banese_cancellation_job")[0];
  assert.deepEqual(failure.args, {
    p_job_id: JOB_ID,
    p_lease_token: LEASE_TOKEN,
    p_error_class: "REMOTE_REVIEW_REQUIRED",
    p_error_message: "O estado remoto do título exige revisão financeira.",
    p_review_required: true,
    p_remote_mutation_started: false,
  });
  assert.equal(JSON.stringify(failure.args).includes(OUR_NUMBER), false);
});

Deno.test("falha DB após cancelamento remoto é auditada para revisão", async () => {
  const { admin, calls } = fakeAdmin({
    completionErrors: [new Error("falha local")],
  });
  const summary = await processBaneseCancellationBatch(admin, 1, {
    cancelBoleto: (_admin, _environment, input) => {
      input.onMutationStart?.();
      return Promise.resolve({
        situationCode: 5,
        remoteStatus: "CANCELED",
        alreadyCanceled: false,
      });
    },
  });

  assert.equal(summary.reviewRequired, 1);
  assert.equal(summary.completed, 0);
  const failure = callsNamed(calls, "fail_banese_cancellation_job")[0];
  assert.equal(failure.args?.p_error_class, "LOCAL_SYNC_AFTER_REMOTE");
  assert.equal(failure.args?.p_review_required, true);
  assert.equal(failure.args?.p_remote_mutation_started, true);
});

Deno.test("ACK semântico falso não contabiliza conclusão local", async () => {
  const { admin, calls } = fakeAdmin({ completionAcks: [false] });
  const summary = await processBaneseCancellationBatch(admin, 1, {
    cancelBoleto: () =>
      Promise.resolve({
        situationCode: 5,
        remoteStatus: "CANCELED",
        alreadyCanceled: true,
      }),
  });

  assert.equal(summary.completed, 0);
  assert.equal(summary.reviewRequired, 1);
  assert.equal(
    callsNamed(calls, "fail_banese_cancellation_job")[0].args?.p_error_class,
    "LOCAL_SYNC_AFTER_REMOTE",
  );
});

Deno.test("falha após início do PUT fica ambígua e exige revisão", async () => {
  const { admin, calls } = fakeAdmin();
  const summary = await processBaneseCancellationBatch(admin, 1, {
    cancelBoleto: (_admin, _environment, input) => {
      input.onMutationStart?.();
      return Promise.reject(new Error("resposta remota interrompida"));
    },
  });

  assert.equal(summary.reviewRequired, 1);
  assert.equal(summary.failed, 0);
  const failure = callsNamed(calls, "fail_banese_cancellation_job")[0];
  assert.equal(failure.args?.p_error_class, "REMOTE_CANCELLATION_AMBIGUOUS");
  assert.equal(failure.args?.p_review_required, true);
  assert.equal(failure.args?.p_remote_mutation_started, true);
});

Deno.test("REGISTERING antes do PUT permanece transitório e retentável", async () => {
  const { admin, calls } = fakeAdmin();
  const summary = await processBaneseCancellationBatch(admin, 1, {
    cancelBoleto: () =>
      Promise.reject(new BaneseAdapterError("situação 0 REGISTERING")),
  });

  assert.equal(summary.reviewRequired, 0);
  assert.equal(summary.failed, 1);
  const failure = callsNamed(calls, "fail_banese_cancellation_job")[0];
  assert.equal(failure.args?.p_error_class, "REMOTE_PREFLIGHT_ERROR");
  assert.equal(failure.args?.p_review_required, false);
  assert.equal(failure.args?.p_remote_mutation_started, false);
});

Deno.test("falha da cerca local impede chamada remota e fica retentável", async () => {
  const { admin, calls } = fakeAdmin({ startAck: false });
  let remoteCalled = false;
  const summary = await processBaneseCancellationBatch(admin, 1, {
    cancelBoleto: () => {
      remoteCalled = true;
      return Promise.reject(new Error("não deveria chamar o banco"));
    },
  });

  assert.equal(remoteCalled, false);
  assert.equal(summary.failed, 1);
  assert.equal(summary.reviewRequired, 0);
  assert.equal(callsNamed(calls, "complete_banese_cancellation_job").length, 0);
  const failure = callsNamed(calls, "fail_banese_cancellation_job")[0];
  assert.equal(failure.args?.p_review_required, false);
  assert.equal(failure.args?.p_remote_mutation_started, false);
});

Deno.test("ACK falso da auditoria é reportado como falha interna", async () => {
  const { admin } = fakeAdmin({ failAck: false });
  const summary = await processBaneseCancellationBatch(admin, 1, {
    cancelBoleto: () =>
      Promise.reject(
        new BaneseCancellationRequiresReviewError("revisão remota"),
      ),
  });

  assert.equal(summary.reviewRequired, 1);
  assert.equal(summary.auditFailures, 1);
});

Deno.test("replay recupera sincronização local após falha posterior ao remoto", async () => {
  const first = fakeAdmin({
    completionErrors: [new Error("commit local indisponível")],
  });
  await processBaneseCancellationBatch(first.admin, 1, {
    cancelBoleto: (_admin, _environment, input) => {
      input.onMutationStart?.();
      return Promise.resolve({
        situationCode: 5,
        remoteStatus: "CANCELED",
        alreadyCanceled: false,
      });
    },
  });

  const replay = fakeAdmin();
  const replaySummary = await processBaneseCancellationBatch(replay.admin, 1, {
    cancelBoleto: () =>
      Promise.resolve({
        situationCode: 5,
        remoteStatus: "CANCELED",
        alreadyCanceled: true,
      }),
  });

  assert.equal(replaySummary.completed, 1);
  assert.equal(replaySummary.alreadyCanceled, 1);
  assert.equal(
    callsNamed(replay.calls, "complete_banese_cancellation_job").length,
    1,
  );
});

Deno.test("handler usa segredo custom, limita payload e não responde dados do título", async () => {
  const { admin, calls } = fakeAdmin({ claims: [] });
  const handler = createBaneseCancellationWorkerHandler({
    createAdmin: () => admin,
    getEnv: (name) => name === "SUPABASE_URL" ? "https://project.test" : "key",
    cancelBoleto: () => Promise.reject(new Error("não deveria chamar o banco")),
  });
  const response = await handler(
    new Request("https://worker.test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Banese-Worker-Token": WORKER_SECRET,
      },
      body: JSON.stringify({ limit: 25 }),
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    success: true,
    claimed: 0,
    completed: 0,
    alreadyCanceled: 0,
    reviewRequired: 0,
    failed: 0,
    auditFailures: 0,
  });
  assert.equal(JSON.stringify(body).includes(OUR_NUMBER), false);
  assert.equal(
    callsNamed(calls, "claim_banese_cancellation_batch")[0].args?.p_limit,
    25,
  );
});

Deno.test("handler rejeita token incorreto antes de reservar jobs", async () => {
  const { admin, calls } = fakeAdmin();
  const handler = createBaneseCancellationWorkerHandler({
    createAdmin: () => admin,
    getEnv: (name) => name === "SUPABASE_URL" ? "https://project.test" : "key",
  });
  const response = await handler(
    new Request("https://worker.test", {
      method: "POST",
      headers: { "X-Banese-Worker-Token": "invalid" },
    }),
  );

  assert.equal(response.status, 401);
  assert.equal(callsNamed(calls, "claim_banese_cancellation_batch").length, 0);
});

Deno.test("handler distingue segredo indisponível de token inválido", async () => {
  const { admin, calls } = fakeAdmin({
    secretError: { code: "PGRST002" },
  });
  const logged: unknown[][] = [];
  const handler = createBaneseCancellationWorkerHandler({
    createAdmin: () => admin,
    getEnv: (name) => name === "SUPABASE_URL" ? "https://project.test" : "key",
    logger: { error: (...args) => logged.push(args) },
  });
  const response = await handler(
    new Request("https://worker.test", {
      method: "POST",
      headers: { "X-Banese-Worker-Token": WORKER_SECRET },
    }),
  );

  assert.equal(response.status, 503);
  assert.equal(callsNamed(calls, "claim_banese_cancellation_batch").length, 0);
  assert.equal(logged[0]?.[0], "banese cancellation worker secret unavailable");
});

Deno.test("handler corta corpo acima de 1 KiB sem depender de Content-Length", async () => {
  const { admin, calls } = fakeAdmin();
  const handler = createBaneseCancellationWorkerHandler({
    createAdmin: () => admin,
    getEnv: (name) => name === "SUPABASE_URL" ? "https://project.test" : "key",
  });
  const request = new Request("https://worker.test", {
    method: "POST",
    headers: { "X-Banese-Worker-Token": WORKER_SECRET },
    body: "x".repeat(1_025),
  });
  assert.equal(request.headers.get("content-length"), null);

  const response = await handler(request);
  assert.equal(response.status, 400);
  assert.equal(callsNamed(calls, "claim_banese_cancellation_batch").length, 0);
});

Deno.test("handler rejeita limites fora do contrato e coerção de tipo", async () => {
  for (const limit of [0, 26, "25"]) {
    const { admin, calls } = fakeAdmin();
    const handler = createBaneseCancellationWorkerHandler({
      createAdmin: () => admin,
      getEnv: (name) =>
        name === "SUPABASE_URL" ? "https://project.test" : "key",
    });
    const response = await handler(
      new Request("https://worker.test", {
        method: "POST",
        headers: { "X-Banese-Worker-Token": WORKER_SECRET },
        body: JSON.stringify({ limit }),
      }),
    );
    assert.equal(response.status, 400);
    assert.equal(
      callsNamed(calls, "claim_banese_cancellation_batch").length,
      0,
    );
  }
});
