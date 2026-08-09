import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INSTITUTIONAL_HEADER_EMAIL,
  resolveInstitutionalHeader,
} from './institutional-header.model.ts';

test('resolvedor prioriza overrides, depois polo e por fim empresa', () => {
  const resolved = resolveInstitutionalHeader({
    overrides: {
      nomeFantasia: 'Matriz - Universo Cursos e Consultoria',
      telefone: '(79) 99999-0000',
      email: 'nao-usar@exemplo.com',
    },
    polo: {
      cnpj: '13.278.137/0002-35',
      telefone: '(79) 98888-0000',
      endereco: 'Rua do Polo',
      numero: '20',
      complemento: 'Sala 2',
      bairro: 'Centro',
      cidade: 'Aracaju',
      uf: 'SE',
      cep: '49000-000',
      is_matriz: true,
    },
    company: {
      cnpj: '13.278.137/0001-54',
      telefone: '(79) 97777-0000',
      cidade: 'Japoatã',
      estado: 'SE',
    },
  });

  assert.equal(resolved.name, 'Universo Cursos e Consultoria');
  assert.equal(resolved.phone, '(79) 99999-0000');
  assert.equal(resolved.cnpj, '13.278.137/0002-35');
  assert.equal(resolved.email, INSTITUTIONAL_HEADER_EMAIL);
  assert.equal(resolved.isHeadquarters, true);
  assert.equal(resolved.unitLabel, 'Matriz');
  assert.deepEqual(resolved.leftLines, [
    { label: 'CNPJ', value: '13.278.137/0002-35' },
    { label: 'Contato', value: '(79) 99999-0000' },
    { label: 'E-mail', value: INSTITUTIONAL_HEADER_EMAIL },
  ]);
  assert.deepEqual(resolved.rightLines, [
    { label: 'Cidade/UF', value: 'Aracaju (SE)' },
    { label: 'Endereço', value: 'Rua do Polo, 20, Sala 2' },
    { label: 'Bairro', value: 'Centro · CEP: 49000-000' },
  ]);
});

test('resolvedor aceita aliases camelCase e snake_case', () => {
  const resolved = resolveInstitutionalHeader({
    polo: {
      nome_fantasia: 'Polo Norte',
      logo_url: 'https://example.com/logo.png',
      tax_id: '00.000.000/0001-00',
      address: 'Avenida Norte',
      number: '100',
      complement: '1º andar',
      neighborhood: 'Industrial',
      city: 'Maceió',
      estado: 'AL',
      postal_code: '57000-000',
      phone: '(82) 3333-3333',
      is_headquarters: false,
    },
  });

  assert.equal(resolved.logoUrl, 'https://example.com/logo.png');
  assert.equal(resolved.name, 'Polo Norte');
  assert.equal(resolved.state, 'AL');
  assert.equal(resolved.isHeadquarters, false);
  assert.equal(resolved.unitLabel, 'Polo Maceió');
  assert.equal(resolved.rightLines[0].value, 'Maceió (AL)');
  assert.equal(resolved.rightLines[1].value, 'Avenida Norte, 100, 1º andar');
});

test('resolvedor mantém exatamente três linhas por coluna com placeholders', () => {
  const resolved = resolveInstitutionalHeader({
    overrides: {
      isMatriz: false,
    },
    polo: {
      is_matriz: true,
    },
  });

  assert.equal(resolved.leftLines.length, 3);
  assert.equal(resolved.rightLines.length, 3);
  assert.equal(resolved.isHeadquarters, false);
  assert.equal(resolved.unitLabel, 'Polo');
  assert.deepEqual(resolved.leftLines.map((line) => line.label), [
    'CNPJ',
    'Contato',
    'E-mail',
  ]);
  assert.deepEqual(resolved.rightLines, [
    { label: 'Cidade/UF', value: 'Não informado' },
    { label: 'Endereço', value: 'Não informado' },
    { label: 'Bairro', value: 'Não informado · CEP: Não informado' },
  ]);
});

test('resolvedor identifica matriz e todos os polos ativos pela cidade', () => {
  const units = [
    { cidade: 'JAPOATÃ', is_matriz: true, expected: 'Matriz' },
    { cidade: 'AQUIDABÃ', is_matriz: false, expected: 'Polo AQUIDABÃ' },
    { cidade: 'PORTO DA FOLHA', is_matriz: false, expected: 'Polo PORTO DA FOLHA' },
    { cidade: 'PROPRIÁ', is_matriz: false, expected: 'Polo PROPRIÁ' },
  ];

  units.forEach(({ expected, ...polo }) => {
    assert.equal(resolveInstitutionalHeader({ polo }).unitLabel, expected);
  });
});
