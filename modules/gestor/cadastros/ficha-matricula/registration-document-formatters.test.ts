import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatRegistrationIssuerState,
  formatRegistrationReservist,
  formatRegistrationVoterId,
  replaceRegistrationIssuerState,
} from './registration-document-formatters.ts';

test('título eleitoral ganha grupos legíveis sem alterar os dígitos legados', () => {
  assert.equal(formatRegistrationVoterId('019396952135'), '0193 9695 2135');
  assert.equal(formatRegistrationVoterId('01939695213'), '019 3969 5213');
  assert.equal(formatRegistrationVoterId('0193 9695 2135'), '0193 9695 2135');
  assert.equal(formatRegistrationVoterId('não informado'), 'não informado');
  assert.equal(formatRegistrationVoterId('12345'), '12345');
  assert.equal(formatRegistrationVoterId(null), '');
});

test('órgão expedidor reúne apenas partes presentes sem duplicar UF', () => {
  assert.equal(formatRegistrationIssuerState('SSP/SE', ''), 'SSP/SE');
  assert.equal(formatRegistrationIssuerState('SSP/SE /', null), 'SSP/SE');
  assert.equal(formatRegistrationIssuerState('SSP/SE', 'SE'), 'SSP/SE');
  assert.equal(formatRegistrationIssuerState('SSP / se', 'SE'), 'SSP / se');
  assert.equal(formatRegistrationIssuerState('SSP', 'SE'), 'SSP / SE');
  assert.equal(formatRegistrationIssuerState('', 'SE'), 'SE');
  assert.equal(formatRegistrationIssuerState(null, null), '');
});

test('reservista feminino exibe NÃO POSSUI e demais valores permanecem fiéis', () => {
  for (const sex of ['F', 'f', ' Feminino ']) {
    assert.equal(formatRegistrationReservist('', sex), 'NÃO POSSUI');
    assert.equal(formatRegistrationReservist('12345', sex), 'NÃO POSSUI');
  }
  assert.equal(formatRegistrationReservist('12345', 'M'), '12345');
  assert.equal(formatRegistrationReservist('', 'Masculino'), '');
  assert.equal(formatRegistrationReservist('', ''), '');
});

test('combinação de órgão/UF preserva marcação configurada e outros campos', () => {
  const template = '<b>Órgão / UF</b><span>{{ALUNO_RG_ORGAO}} / {{ALUNO_RG_UF}}</span><i>{{ALUNO_RG}}</i>';
  assert.equal(
    replaceRegistrationIssuerState(template, 'SSP/SE'),
    '<b>Órgão / UF</b><span>SSP/SE</span><i>{{ALUNO_RG}}</i>',
  );
  assert.equal(replaceRegistrationIssuerState('{{ALUNO_RG_ORGAO}}/{{ALUNO_RG_UF}}', 'SSP/SE'), 'SSP/SE');
  assert.equal(replaceRegistrationIssuerState('{{ALUNO_RG_ORGAO}}', 'SSP/SE'), '{{ALUNO_RG_ORGAO}}');
  assert.equal(replaceRegistrationIssuerState('{{ALUNO_RG_ORGAO}} / {{ALUNO_RG_UF}}', '$&'), '$&');
});
