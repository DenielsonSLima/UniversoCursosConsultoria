import assert from "node:assert/strict";
import { normalizeCursosTecnicosCardContract } from "./curso-tecnico-card.contract.ts";
import type { Curso } from "../cadastros.types.ts";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const baseCurso: Curso = {
  id: "curso-tecnico-1",
  nome: "Técnico em Testes",
  modalidade: "TECNICO",
  carga_horaria: 1200,
  status: "ativo",
};

const [pageSource, errorSource, serviceSource, cardSource] = await Promise.all([
  Deno.readTextFile(new URL("./CursosTecnicosPage.tsx", import.meta.url)),
  Deno.readTextFile(
    new URL("./components/CursosTecnicosQueryError.tsx", import.meta.url),
  ),
  Deno.readTextFile(new URL("./cursos-tecnicos.service.ts", import.meta.url)),
  Deno.readTextFile(
    new URL("./components/CursoTecnicoCard.tsx", import.meta.url),
  ),
]);

Deno.test("normaliza somente o total autoritativo retornado pela RPC", () => {
  for (const value of [0, "0", 12, "12"]) {
    const [curso] = normalizeCursosTecnicosCardContract([{
      ...baseCurso,
      total_disciplinas: value as number,
    }]);
    assert.equal(curso.total_disciplinas, Number(value));
  }
});

Deno.test("falha explicitamente quando a RPC não entrega um total válido", () => {
  assert.throws(
    () => normalizeCursosTecnicosCardContract([baseCurso]),
    /não retornou o total de disciplinas/i,
  );
  for (const value of [-1, null, "", " ", false, "1.0", "1e0"]) {
    assert.throws(
      () => normalizeCursosTecnicosCardContract([{
        ...baseCurso,
        total_disciplinas: value as unknown as number,
      }]),
      /não retornou o total de disciplinas/i,
    );
  }
});

Deno.test("lista diferencia erro de vazio e oferece nova tentativa", () => {
  assert.match(
    serviceSource,
    /getCursosByModalidade\('TECNICO'\)[\s\S]*?normalizeCursosTecnicosCardContract/,
  );
  assert.match(pageSource, /loadError \? \([\s\S]*?<CursosTecnicosQueryError/);
  assert.match(
    pageSource,
    /onRetry=\{\(\) => \{ void cursosQuery\.refetch\(\); \}\}/,
  );
  assert.match(errorSource, /role="alert"/);
  assert.match(errorSource, /Tentar novamente/);
  assert.doesNotMatch(cardSource, /total_disciplinas \?\? 0/);
});
