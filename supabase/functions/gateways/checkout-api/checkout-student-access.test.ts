import assert from "node:assert/strict";
import {
  assertCanonicalAlunoCheckoutReady,
  CHECKOUT_ACCESS_VALIDATION_UNAVAILABLE_MESSAGE,
  CHECKOUT_FIRST_ACCESS_REQUIRED_MESSAGE,
  parseCanonicalCheckoutContexts,
} from "./checkout-student-access.ts";

const actorAuthUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const alunoId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const contexts = (firstAccess: Record<string, unknown> | null) =>
  parseCanonicalCheckoutContexts([{
    role: "ALUNO",
    contextId: alunoId,
    poloIds: [],
    allPolos: false,
    firstAccess,
  }]);

Deno.test("checkout libera somente Aluno com primeiro acesso canônico concluído", () => {
  assert.doesNotThrow(() =>
    assertCanonicalAlunoCheckoutReady(
      contexts({
        acceptedTermsAt: "2026-08-19T10:00:00.000Z",
        acceptedTermsVersion: "versao-vigente-resolvida-pela-rpc",
        requiresPasswordReset: false,
      }),
      {
        alunoId,
        alunoAuthUserId: actorAuthUserId,
        alunoRequiresPasswordReset: false,
        actorAuthUserId,
        gestorOnBehalf: false,
      },
    )
  );
});

Deno.test("checkout nega senha obrigatória, aceite ausente e versão não vigente", () => {
  for (
    const firstAccess of [
      {
        acceptedTermsAt: "2026-08-19T10:00:00.000Z",
        acceptedTermsVersion: "versao-vigente-resolvida-pela-rpc",
        requiresPasswordReset: true,
      },
      {
        acceptedTermsAt: null,
        acceptedTermsVersion: null,
        requiresPasswordReset: false,
      },
    ]
  ) {
    assert.throws(
      () =>
        assertCanonicalAlunoCheckoutReady(contexts(firstAccess), {
          alunoId,
          alunoAuthUserId: actorAuthUserId,
          alunoRequiresPasswordReset: false,
          actorAuthUserId,
          gestorOnBehalf: false,
        }),
      new RegExp(CHECKOUT_FIRST_ACCESS_REQUIRED_MESSAGE),
    );
  }
});

Deno.test("exceção administrativa não permite contornar o próprio primeiro acesso", () => {
  assert.doesNotThrow(() =>
    assertCanonicalAlunoCheckoutReady([], {
      alunoId,
      alunoAuthUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      alunoRequiresPasswordReset: null,
      actorAuthUserId,
      gestorOnBehalf: true,
    })
  );
  assert.throws(
    () =>
      assertCanonicalAlunoCheckoutReady([], {
        alunoId,
        alunoAuthUserId: actorAuthUserId,
        alunoRequiresPasswordReset: null,
        actorAuthUserId,
        gestorOnBehalf: true,
      }),
    new RegExp(CHECKOUT_ACCESS_VALIDATION_UNAVAILABLE_MESSAGE),
  );
});

Deno.test("checkout nega flag de troca de senha diferente de false", () => {
  assert.throws(
    () =>
      assertCanonicalAlunoCheckoutReady(
        contexts({
          acceptedTermsAt: "2026-08-19T10:00:00.000Z",
          acceptedTermsVersion: "versao-vigente-resolvida-pela-rpc",
          requiresPasswordReset: false,
        }),
        {
          alunoId,
          alunoAuthUserId: actorAuthUserId,
          alunoRequiresPasswordReset: null,
          actorAuthUserId,
          gestorOnBehalf: false,
        },
      ),
    new RegExp(CHECKOUT_FIRST_ACCESS_REQUIRED_MESSAGE),
  );
});

Deno.test("handler autentica por UID, revalida contexto e bloqueia antes da idempotência", async () => {
  const [handlerSource, buttonSource, migrationSource] = await Promise.all([
    Deno.readTextFile(new URL("./checkout-handler.ts", import.meta.url)),
    Deno.readTextFile(
      new URL(
        "../../../../modules/public/components/OnlineCheckoutButton.tsx",
        import.meta.url,
      ),
    ),
    Deno.readTextFile(
      new URL(
        "../../../migrations/20260819110000_create_portal_multi_profile_identities.sql",
        import.meta.url,
      ),
    ),
  ]);

  assert.match(handlerSource, /userClient\.rpc\("portal_listar_perfis"\)/);
  assert.match(handlerSource, /\.eq\("auth_user_id", authUserId\)/);
  assert.match(handlerSource, /\.eq\("tipo", "Aluno"\)/);
  assert.doesNotMatch(handlerSource, /\.ilike\("email", authEmail\)/);
  assert.doesNotMatch(handlerSource, /\["Aluno", "Professor"\]/);
  assert.ok(
    handlerSource.indexOf("assertCanonicalAlunoCheckoutReady(portalContexts") <
      handlerSource.indexOf("const existingCourseCheckout"),
  );
  assert.match(
    migrationSource,
    /parceiro\.termos_uso_versao\s*=\s*public\.portal_identidade_termos_versao_vigente\(\)[\s\S]*?'acceptedTermsVersion'/i,
  );

  const firstAccessGate = buttonSource.indexOf(
    "alunoPublicAuthService.needsInitialAccess(profile)",
  );
  assert.ok(firstAccessGate >= 0);
  assert.ok(
    firstAccessGate < buttonSource.indexOf("savePortalSession(profile)"),
  );
  assert.ok(
    firstAccessGate <
      buttonSource.indexOf("paymentCheckoutService.getPublicCheckout"),
  );
  assert.match(
    buttonSource,
    /firstAccessParams\.set\(["']context["'], profile\.contextId\)/,
  );
});
