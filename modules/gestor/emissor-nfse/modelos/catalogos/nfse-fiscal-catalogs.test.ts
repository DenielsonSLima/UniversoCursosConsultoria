import assert from 'node:assert/strict';
import test from 'node:test';
import catalogs from './generated/nfse-fiscal-catalogs.json';
import type { NfseFiscalCatalogOption } from './nfse-fiscal-catalogs.types';

const description = (rows: readonly NfseFiscalCatalogOption[], code: string) =>
  rows.find(row => row.code === code)?.description;

test('official production catalogs contain unique selectable leaves with descriptions', () => {
  for (const [rows, count, digits] of [
    [catalogs.nationalServices, 338, 6],
    [catalogs.nbs, 917, 9],
    [catalogs.operationIndicators, 26, 6],
  ] as const) {
    assert.equal(rows.length, count);
    assert.equal(new Set(rows.map(row => row.code)).size, count);
    for (const row of rows) {
      assert.match(row.code, new RegExp(`^\\d{${digits}}$`));
      assert.ok(row.description.trim().length > 0, `Missing description for ${row.code}`);
      assert.equal(row.description, row.description.trim());
      assert.doesNotMatch(row.description, /[\r\n\t]/);
    }
  }
  assert.ok(description(catalogs.nationalServices, '010101'), 'Leading zero must survive XLSX extraction');
  assert.equal(description(catalogs.nationalServices, '0801'), undefined);
  assert.equal(description(catalogs.nbs, '122040000'), undefined, 'Education heading is not a selectable NBS leaf');
  assert.equal(description(catalogs.nbs, '999999999'), undefined, 'Official row without a description is not selectable');
});

test('education options preserve official codes and descriptions without guessing a classification', () => {
  assert.equal(description(catalogs.nationalServices, '080101'), 'Ensino regular pré-escolar, fundamental e médio.');
  assert.equal(description(catalogs.nationalServices, '080102'), 'Ensino regular superior.');
  assert.equal(description(catalogs.nationalServices, '080201'),
    'Instrução, treinamento, orientação pedagógica e educacional, avaliação de conhecimentos de qualquer natureza.');
  assert.equal(description(catalogs.nbs, '122020000'), 'Serviços de educação técnica de nível médio');
  assert.equal(description(catalogs.nbs, '122041000'), 'Serviços educacionais de graduação');
  assert.equal(description(catalogs.nbs, '122051900'),
    'Outros serviços de educação, inclusive treinamento, não classificados em subposições anteriores');
  assert.equal(catalogs.provenance.correlationsEnforced, false);
});

test('operation descriptions retain merged type and distinct location from the official worksheet', () => {
  const prefix = 'Serviço prestado fisicamente sobre a pessoa ou fruído presencialmente por pessoa física — ';
  assert.equal(description(catalogs.operationIndicators, '030101'), prefix + 'Estabelecimento do fornecedor');
  assert.equal(description(catalogs.operationIndicators, '030102'), prefix + 'Endereço do adquirente');
  assert.equal(description(catalogs.operationIndicators, '030103'), prefix + 'Endereço do destinatário');
  assert.equal(description(catalogs.operationIndicators, '030104'),
    prefix + 'Endereço diverso do fornecedor, adquirente ou destinatário');
  assert.equal(description(catalogs.operationIndicators, '100301'),
    'Demais serviços, em operações onerosas — Local do domicílio principal do adquirente (3)');
  // The same digits belong to separate domain tables and must not be conflated.
  assert.match(description(catalogs.operationIndicators, '080101') || '', /exploração de via/);
  assert.match(description(catalogs.nationalServices, '080101') || '', /Ensino regular/);
});

test('catalog provenance pins the reviewed official production snapshots and excluded row', () => {
  const provenance = catalogs.provenance;
  assert.equal(provenance.schemaVersion, 1);
  assert.equal(provenance.catalogVersion, 'production-2026-11-08');
  assert.equal(provenance.documentationUrl,
    'https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual');
  assert.deepEqual(provenance.sources.map(source => source.sha256), [
    'e74b0be8ad204e458932efb1716225a3fb5703a84e5475ce5c4c6789d1c61b1a',
    'f59f066c5c3584ac26cc07d9b23f9fb6713e4bc9212b5e37fededf9244f29d15',
  ]);
  for (const source of provenance.sources) {
    const url = new URL(source.url);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, 'www.gov.br');
    assert.ok(url.pathname.startsWith('/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/'));
    assert.ok(url.pathname.endsWith('.xlsx'));
  }
  assert.deepEqual(provenance.excludedEntries, [
    { catalog: 'nbs', code: '999999999', reason: 'Official row has no description.' },
  ]);
  assert.equal(provenance.operationNotes.length, 6);
});
