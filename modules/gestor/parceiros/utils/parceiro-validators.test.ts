import assert from "node:assert/strict";
import test from "node:test";
import { validateAlunoProfessorIdentity } from "./parceiro-validators.ts";

test("permite professor parcial sem CPF e e-mail para cadastro inicial", () => {
  const professor = {
    tipo: "Professor",
    nome: "Professor Parcial",
    cpf: "",
    email: "",
  };

  assert.doesNotThrow(() => validateAlunoProfessorIdentity(professor));
});

test("continua recusando identificadores de professor parcialmente preenchidos e inválidos", () => {
  assert.throws(
    () => validateAlunoProfessorIdentity({
      tipo: "Professor",
      cpf: "123",
      email: "",
    }),
    /CPF inválido/i,
  );
  assert.throws(
    () => validateAlunoProfessorIdentity({
      tipo: "Professor",
      cpf: "",
      email: "email-inválido",
    }),
    /E-mail inválido/i,
  );
});
