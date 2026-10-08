import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type BaneseStudentIdentity,
  isEligibleBaneseStudentOwner,
  isUniqueEligibleBaneseStudentOwner,
  readBaneseStudentIdentity,
} from "./banese-student-identity.ts";

const UID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_UID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ALUNO_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ALUNO_ID = "22222222-2222-4222-8222-222222222222";

const student = (overrides: Record<string, unknown> = {}) => ({
  id: ALUNO_ID,
  auth_user_id: UID,
  tipo: "Aluno",
  status: "ATIVO",
  nome: "Aluno de teste",
  cpf_cnpj: null,
  email: "contato@example.test",
  auth_login_email: "univa00000001@acesso.universocc.invalid",
  ...overrides,
}) as BaneseStudentIdentity;

const database = (rows: BaneseStudentIdentity[], error: Error | null = null) => {
  const filters: Array<[string, unknown]> = [];
  let selection = "";
  let limit = 0;
  const query = {
    select(columns: string) {
      selection = columns;
      return this;
    },
    eq(column: string, value: unknown) {
      filters.push([column, value]);
      return this;
    },
    limit(value: number) {
      limit = value;
      const data = rows.filter((row) => filters.every(([column, expected]) =>
        row[column as keyof BaneseStudentIdentity] === expected
      )).slice(0, value);
      return Promise.resolve({ data, error });
    },
  };
  const client = {
    from(table: string) {
      assert.equal(table, "parceiros");
      return query;
    },
  } as unknown as Parameters<typeof readBaneseStudentIdentity>[0];
  return { client, filters, projection: () => selection, limit: () => limit };
};

test("identidade canônica aceita alias de matrícula com contato diferente ou ausente", async () => {
  for (const email of ["contato@example.test", null]) {
    const row = student({ email });
    const db = database([row]);
    assert.deepEqual(await readBaneseStudentIdentity(db.client, UID), row);
    assert.deepEqual(db.filters, [["tipo", "Aluno"], ["auth_user_id", UID]]);
    assert.equal(db.projection().includes("email"), false);
    assert.equal(db.limit(), 2);
  }
});

test("e-mail igual e cadastro sem vínculo não substituem o UID autenticado", async () => {
  for (const auth_user_id of [OTHER_UID, null, ""]) {
    const row = student({ auth_user_id });
    const db = database([row]);
    assert.equal(await readBaneseStudentIdentity(db.client, UID), null);
    assert.equal(isEligibleBaneseStudentOwner(row, UID), false);
  }
  assert.equal(isEligibleBaneseStudentOwner(student(), "contato@example.test"), false);
});

test("ausência de UID falha antes de consultar dados e IDs vazios não autorizam", async () => {
  const db = database([student({ auth_user_id: "" })]);
  assert.equal(await readBaneseStudentIdentity(db.client, ""), null);
  assert.deepEqual(db.filters, []);
  assert.equal(isEligibleBaneseStudentOwner(student({ auth_user_id: "" }), ""), false);
  assert.equal(isUniqueEligibleBaneseStudentOwner([student({ id: "" })], "", UID), false);
});

test("aluno inativo, bloqueado ou cancelado não recebe documentos", async () => {
  for (const status of ["INATIVO", "inactive", " BLOQUEADO ", "CANCELADO"]) {
    const row = student({ status });
    const db = database([row]);
    assert.equal(await readBaneseStudentIdentity(db.client, UID), null);
    assert.equal(isUniqueEligibleBaneseStudentOwner([row], ALUNO_ID, UID), false);
  }
});

test("preserva estados acadêmicos que não bloqueiam o acesso financeiro", async () => {
  for (const status of [null, "ATIVO", "TRANCADO", "CONCLUIDO"]) {
    const row = student({ status });
    assert.deepEqual(await readBaneseStudentIdentity(database([row]).client, UID), row);
  }
});

test("professor com o mesmo UID não cria ambiguidade nem substitui perfil aluno", async () => {
  const aluno = student();
  const professor = student({ id: OTHER_ALUNO_ID, tipo: "Professor" });
  assert.deepEqual(
    await readBaneseStudentIdentity(database([aluno, professor]).client, UID),
    aluno,
  );
  assert.equal(await readBaneseStudentIdentity(database([professor]).client, UID), null);
});

test("identidade duplicada falha fechada, inclusive com segundo perfil bloqueado", async () => {
  for (const status of ["ATIVO", "BLOQUEADO"]) {
    const rows = [student(), student({ id: OTHER_ALUNO_ID, status })];
    assert.equal(await readBaneseStudentIdentity(database(rows).client, UID), null);
    assert.equal(isUniqueEligibleBaneseStudentOwner(rows, ALUNO_ID, UID), false);
  }
});

test("aluno vinculado só autoriza o próprio pagador", () => {
  assert.equal(isUniqueEligibleBaneseStudentOwner([student()], ALUNO_ID, UID), true);
  assert.equal(isUniqueEligibleBaneseStudentOwner([student()], OTHER_ALUNO_ID, UID), false);
  assert.equal(isUniqueEligibleBaneseStudentOwner([student()], ALUNO_ID, OTHER_UID), false);
  assert.equal(isUniqueEligibleBaneseStudentOwner([], ALUNO_ID, UID), false);
});

test("erro do banco não vira identidade ausente nem autoriza fallback", async () => {
  const failure = new Error("consulta indisponível");
  const db = database([], failure);
  await assert.rejects(() => readBaneseStudentIdentity(db.client, UID), failure);
});
