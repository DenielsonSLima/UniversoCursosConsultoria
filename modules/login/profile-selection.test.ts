import assert from "node:assert/strict";
import test from "node:test";
import {
  getProfileSelectionErrorMessage,
  requiresProfessorPoloSelection,
  resolveProfilePostLoginRoute,
} from "./profile-selection.ts";

test("preserva deep link compatível com o perfil escolhido", () => {
  assert.equal(
    resolveProfilePostLoginRoute("Professor", "/professor/plano-curso?turma=1"),
    "/professor/plano-curso?turma=1",
  );
  assert.equal(
    resolveProfilePostLoginRoute("Gestor", "/gestor/financeiro"),
    "/gestor/financeiro",
  );
});

test("prioriza o perfil escolhido quando o redirect pertence a outro portal", () => {
  assert.equal(
    resolveProfilePostLoginRoute("Professor", "/gestor/financeiro"),
    "/professor",
  );
  assert.equal(
    resolveProfilePostLoginRoute("Gestor", "/professor/plano-curso"),
    "/gestor",
  );
});

test("não aceita prefixos parecidos como rota do perfil", () => {
  assert.equal(
    resolveProfilePostLoginRoute("Professor", "/professores"),
    "/professor",
  );
  assert.equal(
    resolveProfilePostLoginRoute("Gestor", "/gestor-extra"),
    "/gestor",
  );
});

test("normaliza segmentos de caminho antes de validar o perfil", () => {
  assert.equal(
    resolveProfilePostLoginRoute(
      "Professor",
      "/professor/../gestor/financeiro",
    ),
    "/professor",
  );
  assert.equal(
    resolveProfilePostLoginRoute("Gestor", "//externo.example/gestor"),
    "/gestor",
  );
});

test("identifica quando a escolha de professor precisa carregar polos", () => {
  assert.equal(
    requiresProfessorPoloSelection({
      tipo: "Professor",
      poloIds: ["polo-a", "polo-b"],
    }),
    true,
  );
  assert.equal(
    requiresProfessorPoloSelection({
      tipo: "Professor",
      poloIds: ["polo-a"],
    }),
    false,
  );
  assert.equal(
    requiresProfessorPoloSelection({ tipo: "Gestor", poloIds: ["a", "b"] }),
    false,
  );
});

test("usa uma mensagem segura quando a seleção de perfil falha", () => {
  assert.equal(
    getProfileSelectionErrorMessage({
      tipo: "Professor",
      poloIds: ["polo-a", "polo-b"],
    }),
    "Não foi possível carregar os polos vinculados a este perfil. Tente novamente.",
  );
  assert.equal(
    getProfileSelectionErrorMessage({ tipo: "Gestor" }),
    "Não foi possível concluir o acesso com este perfil. Tente novamente.",
  );
});
