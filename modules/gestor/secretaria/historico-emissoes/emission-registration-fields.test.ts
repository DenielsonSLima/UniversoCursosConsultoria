import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRegistrationSnapshotTemplate } from './emission-registration-snapshot';
import type { EmissionLog, PreviewResources } from './historico-emissoes.types';

const template = '<span>{{ALUNO_TITULO_ELEITOR}}</span>|<span>{{ALUNO_RG_ORGAO}} / {{ALUNO_RG_UF}}</span>|{{ALUNO_RESERVISTA}}';
const preview = { polo: {}, template: {} } as PreviewResources;
const emission = (snapshot: Record<string, unknown>) => ({
  documento: 'pasta_identificacao',
  emitido_em: '2026-09-19T12:00:00Z',
  dados_emissao: snapshot,
  aluno: { sexo: 'F', reservista: 'DADO VIVO', orgao_emissor: 'DADO VIVO', titulo_eleitor: '999999999999' },
} as unknown as EmissionLog);

test('pasta emite título legado formatado, órgão sem barra solta e reservista feminino', () => {
  const result = resolveRegistrationSnapshotTemplate(template, emission({
    studentVoterId: '01939695213', studentRgIssuer: 'SSP/SE', studentRgState: '',
    studentReservist: '', studentSex: 'F',
  }), preview);
  assert.equal(result, '<span>019 3969 5213</span>|<span>SSP/SE</span>|NÃO POSSUI');
});

test('formatação preserva ausência explícita no snapshot e reservista masculino cadastrado', () => {
  const result = resolveRegistrationSnapshotTemplate(template, emission({
    studentVoterId: '', studentRgIssuer: '', studentRgState: '',
    studentReservist: '123456', studentSex: 'M',
  }), preview);
  assert.equal(result, '<span></span>|<span></span>|123456');
  assert.doesNotMatch(result, /DADO VIVO|9999|NÃO POSSUI/);
});

test('combinação de órgão/UF continua escapando conteúdo no HTML', () => {
  const result = resolveRegistrationSnapshotTemplate(template, emission({
    studentVoterId: '019396952135', studentRgIssuer: 'SSP & OUTRO', studentRgState: 'SE',
    studentReservist: '', studentSex: '',
  }), preview);
  assert.equal(result, '<span>0193 9695 2135</span>|<span>SSP &amp; OUTRO / SE</span>|');
});
