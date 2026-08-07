import assert from "node:assert/strict";
import { updateStudentAccess } from "./student-access.ts";

const adminWithUpdateResults = (results: Array<Record<string, unknown>>) => {
  const patches: Array<Record<string, unknown>> = [];
  let call = 0;
  return {
    patches,
    admin: {
      from: () => ({
        update: (patch: Record<string, unknown>) => {
          patches.push(patch);
          return {
            eq: async () => results[call++] || { error: null },
          };
        },
      }),
    },
  };
};

Deno.test("persiste estado completo quando as colunas de acesso existem", async () => {
  const { admin, patches } = adminWithUpdateResults([{ error: null }]);
  const error = await updateStudentAccess(admin, "partner-1", {
    auth_user_id: "auth-1",
    troca_senha_obrigatoria: true,
    acesso_status: "convite_enviado",
  });

  assert.equal(error, null);
  assert.deepEqual(patches, [{
    auth_user_id: "auth-1",
    troca_senha_obrigatoria: true,
    acesso_status: "convite_enviado",
  }]);
});

Deno.test("mantém vínculo Auth durante deploy anterior à migration", async () => {
  const { admin, patches } = adminWithUpdateResults([
    {
      error: {
        code: "PGRST204",
        message: "Could not find the 'acesso_status' column",
      },
    },
    { error: null },
  ]);

  const error = await updateStudentAccess(admin, "partner-1", {
    auth_user_id: "auth-1",
    auth_login_email: "aluno@example.com",
    troca_senha_obrigatoria: true,
    acesso_status: "convite_enviado",
    acesso_erro: null,
  });

  assert.equal(error, null);
  assert.equal(patches.length, 2);
  assert.deepEqual(patches[1], {
    auth_user_id: "auth-1",
    auth_login_email: "aluno@example.com",
    troca_senha_obrigatoria: true,
  });
});

Deno.test("não oculta erro de atualização que não seja coluna ausente", async () => {
  const { admin } = adminWithUpdateResults([{
    error: { code: "42501", message: "permission denied" },
  }]);

  assert.equal(
    await updateStudentAccess(admin, "partner-1", {
      acesso_status: "erro",
    }),
    "permission denied",
  );
});
