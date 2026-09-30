import assert from "node:assert/strict";
import test from "node:test";
import { validateAlunoProfessorIdentity } from "./parceiro-validators.ts";

test("permite professor parcial sem CPF e e-mail em atualização", () => {
  const professor = {
    tipo: "Professor",
    nome: "Professor Parcial",
    cpf: "",
    email: "",
  };

  assert.doesNotThrow(() => validateAlunoProfessorIdentity(professor));
});

test("exige CPF válido do professor no cadastro inicial", () => {
  assert.throws(
    () => validateAlunoProfessorIdentity(
      { tipo: "Professor", nome: "Professor sem CPF", cpf: "" },
      { requireProfessorCpf: true },
    ),
    /CPF válido para cadastrar o professor/i,
  );
});

test("permite aluno sem e-mail quando o CPF obrigatório é válido", () => {
  const aluno = {
    tipo: "Aluno",
    cpf: "529.982.247-25",
    email: "",
  };

  assert.doesNotThrow(() => validateAlunoProfessorIdentity(
    aluno,
    { requireAlunoCpf: true },
  ));
});

test("continua recusando e-mail de aluno preenchido em formato inválido", () => {
  assert.throws(
    () => validateAlunoProfessorIdentity({
      tipo: "Aluno",
      email: "email-inválido",
    }),
    /E-mail inválido/i,
  );
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
