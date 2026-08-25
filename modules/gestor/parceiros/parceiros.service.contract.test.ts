import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const serviceSource = await readFile(
  new URL("./parceiros.service.ts", import.meta.url),
  "utf8",
);
const activationSource = await readFile(
  new URL("./portal-activation.service.ts", import.meta.url),
  "utf8",
);
const mutationsSource = await readFile(
  new URL("./hooks/useParceirosMutations.ts", import.meta.url),
  "utf8",
);
const professorDetailsSource = await readFile(
  new URL(
    "./components/viewparceiros/professor/ParceiroProfessorDetalhes.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("parceria PJ global aparece em cada polo, sem incluir aluno global", () => {
  assert.match(
    serviceSource,
    /filterTipo === 'PJ'[\s\S]*?query\.or\(`\$\{scopedFilter\},polo_id\.is\.null`\)/,
  );
  assert.match(
    serviceSource,
    /!filterTipo[\s\S]*?and\(polo_id\.is\.null,tipo\.eq\.PJ\)/,
  );
  assert.match(serviceSource, /filterTipo !== 'Aluno'[\s\S]*?tipo\.neq\.Aluno/);
});

test("feedback do Professor preserva primeiro acesso pendente em identidade compartilhada", () => {
  assert.match(activationSource, /institutionalAccessPending\?: boolean/);
  assert.match(
    serviceSource,
    /institutionalAccessPending: Boolean\(result\.institutionalAccessPending\)/,
  );
  for (const source of [mutationsSource, professorDetailsSource]) {
    assert.match(
      source,
      /institutionalProfileLinked[\s\S]*?institutionalAccessPending/,
    );
    assert.match(source, /institutionalProfileLinkMessage/);
    assert.match(source, /primeiro acesso pendente/i);
  }
});
