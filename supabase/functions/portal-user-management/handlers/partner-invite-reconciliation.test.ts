import assert from "node:assert/strict";
import {
  buildPartnerInviteOperationMetadata,
  hasValidPartnerInviteOperationMarker,
  PARTNER_INVITE_RECONCILIATION_PROOF_RPC,
  readValidPartnerInviteOperationMarker,
} from "./partner-invite-reconciliation.ts";
import type { HandlerContext, Partner } from "../types.ts";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const PARTNER_ID = "33333333-3333-4333-8333-333333333333";
const EMAIL = "pessoa@example.com";
const PROOF = "a".repeat(64);

const professor: Partner = {
  id: PARTNER_ID,
  tipo: "Professor",
  nome: "Pessoa Teste",
  email: EMAIL,
};

const makeContext = (proof: string | null = PROOF) => {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const context = {
    admin: {
      rpc: (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        return proof
          ? { data: proof, error: null }
          : { data: null, error: { message: "indisponível" } };
      },
    },
    gestor: { auth_user_id: ACTOR_ID },
  } as HandlerContext;
  return { context, rpcCalls };
};

Deno.test("assina e revalida o marcador de convite do parceiro", async () => {
  const fixture = makeContext();
  const metadata = await buildPartnerInviteOperationMetadata(
    fixture.context,
    REQUEST_ID,
    professor,
    EMAIL,
    { nome: professor.nome },
  );

  assert.deepEqual(metadata, {
    nome: professor.nome,
    origem: "cadastro_professor",
    tipo: "Professor",
    partner_id: PARTNER_ID,
    invite_operation_version: "v1",
    invite_operation_actor: ACTOR_ID,
    invite_operation_nonce: REQUEST_ID,
    invite_operation_proof: PROOF,
  });
  assert.deepEqual(
    await readValidPartnerInviteOperationMarker(
      fixture.context,
      { email: EMAIL, user_metadata: metadata },
      professor,
      EMAIL,
    ),
    { requestId: REQUEST_ID, originalActorAuthUserId: ACTOR_ID },
  );
  assert.equal(fixture.rpcCalls.length, 2);
  assert.equal(
    fixture.rpcCalls[0].name,
    PARTNER_INVITE_RECONCILIATION_PROOF_RPC,
  );
  assert.deepEqual(fixture.rpcCalls[0].args, {
    p_current_actor_auth_user_id: ACTOR_ID,
    p_original_actor_auth_user_id: ACTOR_ID,
    p_request_id: REQUEST_ID,
    p_partner_id: PARTNER_ID,
    p_partner_tipo: "PROFESSOR",
    p_email: EMAIL,
  });
});

Deno.test("rejeita metadata de outro fluxo sem consultar a prova", async () => {
  const fixture = makeContext();
  assert.equal(
    await hasValidPartnerInviteOperationMarker(
      fixture.context,
      {
        email: EMAIL,
        user_metadata: {
          origem: "outro_fluxo",
          invite_operation_proof: PROOF,
        },
      },
      professor,
      EMAIL,
    ),
    false,
  );
  assert.equal(fixture.rpcCalls.length, 0);
});

Deno.test("falha fechado quando a prova do banco está indisponível", async () => {
  const fixture = makeContext(null);
  await assert.rejects(
    () =>
      buildPartnerInviteOperationMetadata(
        fixture.context,
        REQUEST_ID,
        professor,
        EMAIL,
        {},
      ),
    /RECONCILIACAO_CONVITE_PARCEIRO_INDISPONIVEL/,
  );

  await assert.rejects(
    () =>
      readValidPartnerInviteOperationMarker(
        fixture.context,
        {
          email: EMAIL,
          user_metadata: {
            origem: "cadastro_professor",
            tipo: "Professor",
            partner_id: PARTNER_ID,
            invite_operation_version: "v1",
            invite_operation_actor: ACTOR_ID,
            invite_operation_nonce: REQUEST_ID,
            invite_operation_proof: PROOF,
          },
        },
        professor,
        EMAIL,
      ),
    /RECONCILIACAO_CONVITE_PARCEIRO_INDISPONIVEL/,
  );
});
