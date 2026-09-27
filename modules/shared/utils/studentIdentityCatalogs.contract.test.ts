import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const read = (relativePath: string) => Deno.readTextFile(new URL(relativePath, import.meta.url));

const [newStudent, studentPersonal, studentDetails, profilePersonal, studentProfile, mapper, documentRules] = await Promise.all([
  read('../../gestor/parceiros/components/formularioparceiros/aluno/ParceiroAlunoFormStepPersonal.tsx'),
  read('../../gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoPersonalSection.tsx'),
  read('../../gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDetailsSections.tsx'),
  read('../../aluno/perfil/PerfilDadosTab.tsx'),
  read('../../aluno/perfil/PerfilTechnicalSection.tsx'),
  read('../../gestor/parceiros/utils/parceiro-mappers.ts'),
  read('./technicalEnrollmentRequirements.ts'),
]);

Deno.test('cadastro, edição e perfil usam os mesmos catálogos editáveis', () => {
  for (const source of [newStudent, studentPersonal, profilePersonal]) {
    assert.match(source, /EditableCombobox/);
    assert.match(source, /searchNationalityCatalog/);
    assert.match(source, /searchMunicipalityCatalog/);
  }
});

Deno.test('códigos de nacionalidade e naturalidade não substituem o texto livre', () => {
  assert.match(mapper, /nacionalidade_codigo_iso3/);
  assert.match(mapper, /naturalidade_codigo_ibge/);
  assert.match(mapper, /naturalidade_uf/);
  assert.match(mapper, /const nationality = source\.nacionalidade \|\| 'BRASILEIRA'/);
  assert.match(mapper, /nacionalidade:\s*nationality/);
  assert.match(mapper, /nacionalidade_codigo_iso3:\s*nationalityCode/);
  assert.match(mapper, /naturalidade:\s*source\.naturalidade/);
});

Deno.test('CIN usa o nome oficial e não é presumida quando o tipo está vazio', () => {
  assert.match(documentRules, /CARTEIRA DE IDENTIDADE NACIONAL/);
  assert.match(documentRules, /if \(!normalized\) return ''/);
  for (const source of [studentDetails, studentProfile]) {
    assert.match(source, /Número da CIN \(CPF\)/);
    assert.match(source, /readOnly|aria-readonly/);
  }
});
