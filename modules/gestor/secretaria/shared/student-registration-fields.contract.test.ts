import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { formatCpf } from '../../../../lib/documentFormatters.ts';
import { formatCep } from '../../../shared/utils/brazilianCep.ts';

const VOTER_TOKENS = [
  '{{ALUNO_TITULO_ELEITOR}}',
  '{{ALUNO_TITULO_ZONA}}',
  '{{ALUNO_TITULO_SECAO}}',
  '{{ALUNO_TITULO_EMISSAO}}',
  '{{ALUNO_TITULO_UF}}',
];

test('documentos oficiais reutilizam os formatadores compartilhados de CPF e CEP', async () => {
  assert.equal(formatCpf('00000000000'), '000.000.000-00');
  assert.equal(formatCep('00000000'), '00000-000');

  const [previewService, templateParser, fichaModal] = await Promise.all([
    readFile(new URL('../../cadastros/ficha-matricula/student-template-preview.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../historico-emissoes/template-parser.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../parceiros/components/viewparceiros/aluno/ficha/FichaAlunoModal.tsx', import.meta.url), 'utf8'),
  ]);

  for (const source of [previewService, templateParser, fichaModal]) {
    assert.match(source, /formatCpf/);
    assert.match(source, /formatCep/);
  }
  assert.match(templateParser, /formatCpf\(emissionData\.studentCpf/);
  assert.match(templateParser, /formatCep\(emissionData\.studentZipCode\)/);
});

test('ficha cadastral, ficha de matrícula e pasta expõem o bloco eleitoral sem alterar paginação', async () => {
  const [
    fichaCadastral,
    layouts,
    fichaTemplateService,
    fichasService,
    variables,
    parser,
    snapshotService,
  ] = await Promise.all([
    readFile(new URL('../../cadastros/modelos-documentos/ficha-cadastral/ficha-cadastral.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../cadastros/ficha-matricula/document-layouts.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../cadastros/ficha-matricula/ficha-matricula-template.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../cadastros/ficha-matricula/fichas-matricula.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../cadastros/modelos-documentos/shared/documentVariables.ts', import.meta.url), 'utf8'),
    readFile(new URL('../historico-emissoes/template-parser.ts', import.meta.url), 'utf8'),
    readFile(new URL('./secretaria-documentos.service.ts', import.meta.url), 'utf8'),
  ]);

  for (const token of VOTER_TOKENS) {
    assert.ok(fichaCadastral.includes(token), `Ficha de inscrição sem ${token}`);
    assert.ok(layouts.includes(token), `Ficha/Pasta sem ${token}`);
    assert.ok(parser.includes(token), `Renderizador oficial sem ${token}`);
  }

  assert.ok(variables.includes('{{ALUNO_TITULO_EMISSAO}}'));
  assert.ok(variables.includes('{{ALUNO_TITULO_UF}}'));
  assert.match(snapshotService, /studentVoterZone:/);
  assert.match(snapshotService, /studentVoterSection:/);
  assert.match(snapshotService, /studentVoterIssueDate:/);
  assert.match(snapshotService, /studentVoterState:/);

  assert.match(fichaCadastral, /pageCount: 2,\s+v: 5,/);
  assert.match(fichaCadastral, /hasFichaCadastralVoterContent/);
  assert.match(fichaCadastral, /FICHA_CADASTRAL_VOTER_BLOCK_PATTERN/);
  assert.match(layouts, /const DOCUMENTS_HEIGHT = 92;/);
  assert.match(layouts, /pastaIdentificacaoDefaultTemplate[\s\S]*?pageCount: 1,\s+v: 12,/);
  assert.match(layouts, /fichaMatriculaDefaultTemplate[\s\S]*?pageCount: 1,[\s\S]*?v: 12,/);
  assert.match(layouts, /registrationTemplateNeedsVoterUpgrade/);
  assert.match(layouts, /!REGISTRATION_VOTER_TOKENS\.every/);
  assert.match(layouts, /field\?\.id === fieldId[\s\S]*?injectMissingVoterFields\([\s\S]*?field\.value/);
  assert.match(layouts, /repairedFields\.push\(JSON\.parse\(JSON\.stringify\(canonicalDocumentField\)\)\)/);
  assert.match(layouts, /v: Math\.max\([\s\S]*?normalizeTemplateVersion\(template\?\.v\)[\s\S]*?normalizeTemplateVersion\(defaultTemplate\?\.v\)/);
  assert.doesNotMatch(layouts, /for \(const defaultField of defaultFields\)/);
  assert.match(fichaTemplateService, /registrationTemplateNeedsVoterUpgrade/);
  assert.doesNotMatch(fichasService, /mergeDefaultAbsoluteFields/);
  assert.doesNotMatch(fichasService, /persistTemplateUpgrades/);
  assert.doesNotMatch(fichaTemplateService, /fichasMatriculaService\.update\([\s\S]*?upgradedTemplate/);
  assert.doesNotMatch(layouts, /pastaIdentificacaoBaseService\.saveTemplate\([\s\S]*?upgradedTemplate/);
  assert.doesNotMatch(fichaCadastral, /hasTwoPageStructure|saveTemplate\(poloId, upgradedTemplate\)/);
  assert.match(
    fichasService,
    /absoluteFields: Array\.isArray\(storedTemplate\.absoluteFields\)[\s\S]*?\? storedTemplate\.absoluteFields[\s\S]*?: \[\]/,
  );
  assert.doesNotMatch(`${fichaCadastral}\n${layouts}\n${parser}`, /html2canvas|createElement\(['"]canvas|toDataURL\(|addImage\(/);
});
