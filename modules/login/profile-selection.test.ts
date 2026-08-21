import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getProfileSelectionErrorMessage,
  requiresProfessorPoloSelection,
  resolvePortalActivePoloId,
  resolveProfilePostLoginRoute,
} from "./profile-selection.ts";

const portalSessionSource = await readFile(
  new URL('./portal-session.ts', import.meta.url),
  'utf8',
);

test("preserva deep link compatível com o perfil escolhido", () => {
  assert.equal(
    resolveProfilePostLoginRoute("Professor", "/professor/plano-curso?turma=1"),
    "/professor/plano-curso?turma=1",
  );
  assert.equal(
    resolveProfilePostLoginRoute("Gestor", "/gestor/financeiro"),
    "/gestor/financeiro",
  );
  assert.equal(
    resolveProfilePostLoginRoute("Responsavel", "/responsavel/assinaturas"),
    "/responsavel/assinaturas",
  );
  assert.equal(
    resolveProfilePostLoginRoute("Coordenador", "/coordenador/turmas"),
    "/coordenador/turmas",
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
  assert.equal(
    resolveProfilePostLoginRoute("Responsavel", "/aluno/secretaria"),
    "/responsavel",
  );
  assert.equal(
    resolveProfilePostLoginRoute("Coordenador", "/professor/turmas"),
    "/coordenador",
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
  assert.equal(
    resolveProfilePostLoginRoute("Aluno", "https://externo.example/aluno"),
    "/aluno",
  );
  assert.equal(
    resolveProfilePostLoginRoute("Aluno", "/gestor/financeiro"),
    "/aluno",
  );
});

test("identifica quando a escolha de professor precisa carregar polos", () => {
  assert.equal(
    requiresProfessorPoloSelection({
      tipo: "Professor",
      poloIds: ["polo-a", "polo-b"],
      requiresPoloSelection: true,
    }),
    true,
  );
  assert.equal(
    requiresProfessorPoloSelection({
      tipo: "Professor",
      poloIds: ["polo-a"],
      requiresPoloSelection: false,
    }),
    false,
  );
  assert.equal(
    requiresProfessorPoloSelection({
      tipo: "Professor",
      poloIds: ["polo-a", "polo-b"],
    }),
    false,
  );
  assert.equal(
    requiresProfessorPoloSelection({ tipo: "Gestor", poloIds: ["a", "b"] }),
    false,
  );
  assert.equal(
    requiresProfessorPoloSelection({
      tipo: "Coordenador",
      poloIds: ["a", "b"],
      requiresPoloSelection: true,
    }),
    true,
  );
  assert.equal(
    requiresProfessorPoloSelection({
      tipo: "Professor",
      poloIds: ["a", "b"],
      requiresPoloSelection: false,
    }),
    false,
  );
});

test("usa uma mensagem segura quando a seleção de perfil falha", () => {
  assert.equal(
    getProfileSelectionErrorMessage({
      tipo: "Professor",
      poloIds: ["polo-a", "polo-b"],
      requiresPoloSelection: true,
    }),
    "Não foi possível carregar os polos vinculados a este perfil. Tente novamente.",
  );
  assert.equal(
    getProfileSelectionErrorMessage({ tipo: "Gestor" }),
    "Não foi possível concluir o acesso com este perfil. Tente novamente.",
  );
});

test("preserva o polo B escolhido para Professor e Coordenador quando continua autorizado", () => {
  const canonicalPoloIds = ["polo-a", "polo-b"];
  assert.equal(
    resolvePortalActivePoloId("Professor", canonicalPoloIds, "polo-b"),
    "polo-b",
  );
  assert.equal(
    resolvePortalActivePoloId("Coordenador", canonicalPoloIds, "polo-b"),
    "polo-b",
  );
});

test("rejeita polo persistido removido e volta ao primeiro polo canônico", () => {
  assert.equal(
    resolvePortalActivePoloId("Professor", ["polo-a", "polo-b"], "polo-removido"),
    "polo-a",
  );
  assert.equal(
    resolvePortalActivePoloId("Coordenador", ["polo-a"], null),
    "polo-a",
  );
});

test("Gestor e Aluno não herdam preferência de polo de outro portal", () => {
  const canonicalPoloIds = ["polo-a", "polo-b"];
  assert.equal(
    resolvePortalActivePoloId("Gestor", canonicalPoloIds, "polo-b"),
    "polo-a",
  );
  assert.equal(
    resolvePortalActivePoloId("Aluno", canonicalPoloIds, "polo-b"),
    "polo-a",
  );
  assert.equal(resolvePortalActivePoloId("Professor", [], "polo-b"), null);
});

test("a hidratação da sessão cruza a preferência com o escopo canônico", () => {
  assert.match(
    portalSessionSource,
    /resolvePortalActivePoloId\([\s\S]*context\.role,[\s\S]*context\.poloIds,[\s\S]*persistedPoloId/,
  );
});
