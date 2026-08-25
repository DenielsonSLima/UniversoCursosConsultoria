import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getLegacyCoordinatorRedirect,
  getProfessorModuleFromPath,
  getProfessorPathFromModule,
} from "./coordinator-portal-redirect.ts";

const [appSource, portalSessionSource, professorPageSource] = await Promise.all(
  [
    readFile(new URL("../../App.tsx", import.meta.url), "utf8"),
    readFile(new URL("./portal-session.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../professor/professor.page.tsx", import.meta.url),
      "utf8",
    ),
  ],
);

test("não oferece portal exclusivo de coordenador e preserva deep links antigos", () => {
  assert.match(
    appSource,
    /path="\/coordenador\/\*" element=\{<LegacyCoordinatorRedirect \/>\}/,
  );
  assert.doesNotMatch(appSource, /const CoordenadorPage = lazy/);

  assert.equal(
    getLegacyCoordinatorRedirect({
      pathname: "/coordenador/assinaturas",
      search: "?aba=pendentes",
      hash: "#documento-1",
    }),
    "/professor/assinatura-eletronica?aba=pendentes#documento-1",
  );
  assert.equal(
    getLegacyCoordinatorRedirect({
      pathname: "/coordenador/turmas-diarios",
      search: "",
      hash: "",
    }),
    "/professor/turmas",
  );
  assert.equal(
    getLegacyCoordinatorRedirect({
      pathname: "/coordenador/desconhecido",
      search: "",
      hash: "",
    }),
    "/professor",
  );
  assert.equal(
    getLegacyCoordinatorRedirect({
      pathname: "/coordenador",
      search: "",
      hash: "",
    }),
    "/professor",
  );

  const institutionalProfilesSource = portalSessionSource.slice(
    portalSessionSource.indexOf("export const getInstitutionalProfiles"),
    portalSessionSource.indexOf("const getLinkedAlunoFailureMessage"),
  );
  assert.match(institutionalProfilesSource, /\['Gestor', 'Professor'\]/);
  assert.doesNotMatch(institutionalProfilesSource, /'Coordenador'/);
});

test("hidrata o módulo do professor pela rota canônica", () => {
  assert.equal(
    getProfessorModuleFromPath("/professor/assinatura-eletronica"),
    "assinatura-eletronica",
  );
  assert.equal(getProfessorModuleFromPath("/professor/turmas/"), "turmas");
  assert.equal(getProfessorModuleFromPath("/professor/inexistente"), null);
  assert.equal(
    getProfessorPathFromModule("assinatura-eletronica"),
    "/professor/assinatura-eletronica",
  );
  assert.match(
    professorPageSource,
    /getProfessorModuleFromPath\(location\.pathname\)/,
  );
  assert.match(professorPageSource, /onModuleChange=\{handleModuleChange\}/);
});

test("propaga capability e escopos canônicos ao módulo de assinaturas do professor", () => {
  assert.match(
    professorPageSource,
    /<ProfessorAssinaturasPage[\s\S]*capabilities=\{profile\.capabilities\}/,
  );
  assert.match(
    professorPageSource,
    /<ProfessorAssinaturasPage[\s\S]*scopes=\{profile\.scopes\}/,
  );
});
