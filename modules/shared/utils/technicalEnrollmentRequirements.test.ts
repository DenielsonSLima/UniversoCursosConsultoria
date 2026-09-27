import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CIN_DOCUMENT_TYPE,
  formatTechnicalEnrollmentMissingFields,
  formatTechnicalDocumentTypeLabel,
  getTechnicalEnrollmentMissingFields,
  isAcceptedTechnicalDocumentType,
  isCinDocumentType,
  normalizeTechnicalDocumentType,
} from './technicalEnrollmentRequirements.ts';

const completeProfile = {
  nome: 'ALUNA TESTE',
  cpf_cnpj: '529.982.247-25',
  nome_mae: 'MÃE DA ALUNA',
  nome_pai: 'PAI DA ALUNA',
  endereco: 'RUA PRINCIPAL',
  cep: '49.950-000',
  bairro: 'CENTRO',
  cidade: 'JAPOATÃ',
  uf: 'SE',
  situacao_ensino_medio: 'CONCLUIDO',
  escola_ensino_medio: 'COLÉGIO TESTE',
  ano_conclusao_ensino_medio: 2025,
};

test('aceita cadastro mínimo técnico sem exigir número ou documento anexado', () => {
  assert.deepEqual(getTechnicalEnrollmentMissingFields(completeProfile), []);
});

test('aceita os aliases camelCase usados pelo formulário do aluno', () => {
  const profile = {
    nomeCompleto: completeProfile.nome,
    cpf: completeProfile.cpf_cnpj,
    nomeMae: completeProfile.nome_mae,
    nomePai: completeProfile.nome_pai,
    endereco: completeProfile.endereco,
    cep: completeProfile.cep,
    bairro: completeProfile.bairro,
    cidade: completeProfile.cidade,
    uf: completeProfile.uf,
    situacaoEnsinoMedio: completeProfile.situacao_ensino_medio,
    escolaEnsinoMedio: completeProfile.escola_ensino_medio,
    anoConclusaoEnsinoMedio: completeProfile.ano_conclusao_ensino_medio,
  };

  assert.deepEqual(getTechnicalEnrollmentMissingFields(profile), []);
});

test('lista somente o mínimo pessoal e bancário sem cobrar Ensino Médio ou anexos', () => {
  const keys = getTechnicalEnrollmentMissingFields({}).map((field) => field.key);

  assert.deepEqual(keys, [
    'nomeCompleto',
    'cpf',
    'nomeMae',
    'nomePai',
    'endereco',
    'cep',
    'bairro',
    'cidade',
    'uf',
  ]);
});

test('rejeita CPF, CEP e UF apenas formatados, mas estruturalmente inválidos', () => {
  const missing = getTechnicalEnrollmentMissingFields({
    ...completeProfile,
    cpf_cnpj: '111.111.111-11',
    cep: '49950-00',
    uf: 'SERGIPE',
  });

  assert.equal(formatTechnicalEnrollmentMissingFields({
    ...completeProfile,
    cpf_cnpj: '111.111.111-11',
    cep: '49950-00',
    uf: 'SERGIPE',
  }), 'CPF válido, CEP válido, UF válida');
  assert.deepEqual(missing.map((field) => field.key), ['cpf', 'cep', 'uf']);
});

test('Ensino Médio vazio ou informado como EJA não bloqueia a matrícula', () => {
  const withoutHighSchool = {
    ...completeProfile,
    situacao_ensino_medio: null,
    escola_ensino_medio: null,
    ano_conclusao_ensino_medio: null,
    ano_previsto_conclusao_ensino_medio: null,
  };
  const eja = {
    ...withoutHighSchool,
    situacao_ensino_medio: 'EJA',
  };

  assert.deepEqual(getTechnicalEnrollmentMissingFields(withoutHighSchool), []);
  assert.deepEqual(getTechnicalEnrollmentMissingFields(eja), []);
});

test('normaliza CIN explícita sem reclassificar o default legado ambíguo', () => {
  assert.equal(normalizeTechnicalDocumentType(''), '');
  assert.equal(normalizeTechnicalDocumentType(null), '');
  assert.equal(normalizeTechnicalDocumentType('CIN'), CIN_DOCUMENT_TYPE);
  assert.equal(normalizeTechnicalDocumentType('CNI'), CIN_DOCUMENT_TYPE);
  assert.equal(
    normalizeTechnicalDocumentType('CARTEIRA NACIONAL DE IDENTIFICAÇÃO'),
    'CARTEIRA NACIONAL DE IDENTIFICAÇÃO',
  );
  assert.equal(isCinDocumentType('CARTEIRA NACIONAL DE IDENTIDADE'), true);
  assert.equal(formatTechnicalDocumentTypeLabel('CNI'), 'CIN - Carteira de Identidade Nacional');
  assert.equal(normalizeTechnicalDocumentType('IDENTIDADE'), 'RG (ANTIGO)');
  assert.equal(normalizeTechnicalDocumentType('CNH DIGITAL'), 'CNH');
});

test('preserva tipo documental desconhecido para compatibilidade com cadastros existentes', () => {
  assert.equal(normalizeTechnicalDocumentType('PASSAPORTE'), 'PASSAPORTE');
  assert.equal(isAcceptedTechnicalDocumentType('PASSAPORTE'), true);
  assert.equal(isAcceptedTechnicalDocumentType('CARTEIRA PROFISSIONAL'), true);
  assert.equal(formatTechnicalDocumentTypeLabel('DOCUMENTO ESTRANGEIRO'), 'DOCUMENTO ESTRANGEIRO');
});
