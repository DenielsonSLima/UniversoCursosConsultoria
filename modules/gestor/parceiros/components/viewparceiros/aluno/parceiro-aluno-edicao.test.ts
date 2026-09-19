import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAlunoSexo, normalizeAlunoOrgao, prepareAlunoSaveData, updateAlunoDraft } from './parceiro-aluno-edicao.ts';

test('sexo legado M/F corresponde às opções, sem apagar valores desconhecidos', () => {
  assert.equal(normalizeAlunoSexo(' f '), 'FEMININO');
  assert.equal(normalizeAlunoSexo('m'), 'MASCULINO');
  assert.equal(normalizeAlunoSexo('NÃO-BINÁRIO'), 'NÃO-BINÁRIO');
  assert.equal(normalizeAlunoSexo('OUTRO REGISTRO'), 'OUTRO REGISTRO');
  assert.equal(normalizeAlunoSexo(null), '');
});

test('separa órgão/UF sem duplicar e preserva diferenças de dados existentes', () => {
  assert.deepEqual(normalizeAlunoOrgao('SSP / SE', ''), { orgaoEmissor: 'SSP', rgUfEmissao: 'SE' });
  assert.deepEqual(normalizeAlunoOrgao('SSP/SE', 'SE'), { orgaoEmissor: 'SSP', rgUfEmissao: 'SE' });
  assert.deepEqual(normalizeAlunoOrgao('SSP/SE', 'AL'), { orgaoEmissor: 'SSP/SE', rgUfEmissao: 'AL' });
  assert.deepEqual(normalizeAlunoOrgao('ÓRGÃO/ESPECIAL', ''), { orgaoEmissor: 'ÓRGÃO/ESPECIAL', rgUfEmissao: '' });
});

test('alternar certidão/escolaridade preserva dados condicionais até salvar', () => {
  const initial = { certidaoModelo: 'ANTIGO', certidaoLivro: 'A-3', certidaoFolha: '22', certidaoTermo: '173', certidaoMatricula: '123', situacaoEnsinoMedio: 'CURSANDO', serieEnsinoMedioAtual: '3', anoPrevisaoConclusaoEnsinoMedio: '2027', anoConclusaoEnsinoMedio: '2026' };
  let draft = updateAlunoDraft(initial, 'certidaoModelo', 'NOVO');
  draft = updateAlunoDraft(draft, 'certidaoModelo', 'ANTIGO');
  draft = updateAlunoDraft(draft, 'situacaoEnsinoMedio', 'CONCLUIDO');
  draft = updateAlunoDraft(draft, 'situacaoEnsinoMedio', 'CURSANDO');
  assert.deepEqual(draft, initial);
  assert.notEqual(draft, initial);
});

test('atualizar telefone mantém contato1 sincronizado e dados não editados intactos', () => {
  const result = updateAlunoDraft({ telefone: 'antigo', contato1: 'antigo', contato2: 'segundo', pcd: true }, 'telefone', '(79) 99999-1234');
  assert.deepEqual(result, { telefone: '(79) 99999-1234', contato1: '(79) 99999-1234', contato2: 'segundo', pcd: true });
});

test('editar nome atualiza o alias priorizado pelo mapper de persistência', () => {
  const result = updateAlunoDraft({ nome: 'ANTERIOR', nomeCompleto: 'ANTERIOR', nomeSocial: 'SOCIAL' }, 'nome', 'ATUALIZADO');
  assert.equal(result.nome, 'ATUALIZADO');
  assert.equal(result.nomeCompleto, 'ATUALIZADO');
  assert.equal(result.nomeSocial, 'SOCIAL');
});


test('prepara apenas payload compatível com as condições, preservando rascunho se salvar falhar', () => {
  const draft = { certidaoModelo: 'NOVO', certidaoMatricula: '123', certidaoLivro: 'A-3', certidaoFolha: '22', certidaoTermo: '173', certidao_livro: 'legado', situacaoEnsinoMedio: 'CONCLUIDO', serieEnsinoMedioAtual: '3', anoPrevisaoConclusaoEnsinoMedio: '2027', anoPrevistoConclusaoEnsinoMedio: '2027', anoConclusaoEnsinoMedio: '2026' };
  const original = { ...draft };
  const payload = prepareAlunoSaveData(draft, { ...draft, certidaoModelo: 'ANTIGO', situacaoEnsinoMedio: 'CURSANDO' });
  assert.equal(payload.certidaoMatricula, '123');
  assert.equal(payload.certidaoLivro, '');
  assert.equal(payload.certidao_livro, null);
  assert.equal(payload.certidaoFolha, '');
  assert.equal(payload.certidaoTermo, '');
  assert.equal(payload.serieEnsinoMedioAtual, '');
  assert.equal(payload.anoPrevisaoConclusaoEnsinoMedio, '');
  assert.equal(payload.anoPrevistoConclusaoEnsinoMedio, '');
  assert.equal(payload.anoConclusaoEnsinoMedio, '2026');
  assert.deepEqual(draft, original);
  const old = prepareAlunoSaveData({ ...draft, certidaoModelo: 'ANTIGO', situacaoEnsinoMedio: 'CURSANDO' }, draft);
  assert.equal(old.certidaoLivro, 'A-3');
  assert.equal(old.certidaoMatricula, '');
  assert.equal(old.certidao_matricula, null);
  assert.equal(old.anoConclusaoEnsinoMedio, '');
  assert.equal(old.serieEnsinoMedioAtual, '3');
});


test('editar contato não apaga dados condicionais legados quando os seletores não mudam', () => {
  const baseline = { telefone: 'antigo', certidaoModelo: 'NOVO', certidaoMatricula: '123', certidaoLivro: 'A-3', certidaoFolha: '22', certidaoTermo: '173', certidao_livro: 'legado', situacaoEnsinoMedio: '', serieEnsinoMedioAtual: '3', anoPrevisaoConclusaoEnsinoMedio: '2027', anoPrevistoConclusaoEnsinoMedio: '2027', anoConclusaoEnsinoMedio: '2026' };
  const draft = { ...baseline, telefone: '(79) 99999-1234' };
  assert.deepEqual(prepareAlunoSaveData(draft, baseline), draft);
  const switched = updateAlunoDraft(updateAlunoDraft(draft, 'certidaoModelo', 'ANTIGO'), 'certidaoModelo', 'NOVO');
  assert.deepEqual(prepareAlunoSaveData(switched, baseline), draft);
});
