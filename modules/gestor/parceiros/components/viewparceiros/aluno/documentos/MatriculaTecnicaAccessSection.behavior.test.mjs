import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transform } from 'esbuild';

// Executa o componente real com o snapshot canônico recebido do backend.
const source = await readFile(new URL('./MatriculaTecnicaAccessSection.tsx', import.meta.url), 'utf8');
const compiled = await transform(source, { loader: 'tsx', format: 'cjs', jsx: 'transform' });
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.code)(
  createRequire(import.meta.url), module, module.exports,
);
const AccessSection = module.exports.default;

const enrollment = (overrides = {}) => ({
  matriculaId: 'matricula-teste', alunoId: 'aluno-teste', turmaId: 'turma-teste',
  turmaNome: 'Turma técnica', cursoNome: 'Curso técnico',
  status: 'ATIVO', turmaStatus: 'EM_ANDAMENTO', fluxo: 'REGULAR',
  pagamento: { estado: 'PENDENTE' },
  documentacao: {
    concluida: false, obrigatoriosTotal: 9, concluidos: 2, pendentes: 7,
    dadosPessoaisPendentes: true, envioEmAndamento: true,
  },
  liberacaoAcademica: null,
  acoes: {
    ativarRegular: { permitida: false, bloqueios: ['STATUS_INCOMPATIVEL'] },
    liberarImplantacao: { permitida: false, bloqueios: ['STATUS_INCOMPATIVEL'] },
    revogarLiberacao: { permitida: false, bloqueios: ['LIBERACAO_INATIVA_OU_SEM_PERMISSAO'] },
  },
  ...overrides,
});

const props = (item, overrides = {}) => ({
  enrollments: [item], activatePending: false,
  implantationReleasePending: false, implantationRevokePending: false,
  onActivate() {}, onOpenImplantation() {}, onRevokeImplantation() {},
  onValidationError() {}, ...overrides,
});

const elements = (node) => {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
};
const text = (node) => React.isValidElement(node)
  ? React.Children.toArray(node.props.children).map(text).join('')
  : String(node ?? '');
const button = (tree, label) => elements(tree).find(
  (element) => element.type === 'button' && text(element).includes(label),
);

test('vínculo ativo mantém emissões liberadas e exibe pendências separadas', () => {
  const tree = AccessSection(props(enrollment()));
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Matrícula ativa/);
  assert.match(html, /libera carteirinha e ficha de matrícula/);
  assert.match(html, /sem bloquear essas emissões/);
  assert.match(html, /Pagamento a concluir/);
  assert.match(html, /Documentos 2\/9/);
  assert.equal(button(tree, 'Ativar matrícula regular'), undefined);
  assert.equal(button(tree, 'Converter e liberar implantação'), undefined);
});

test('recuperação regular respeita autorização canônica sem recalcular pendências', () => {
  const item = enrollment({ status: 'PENDENTE' });
  item.acoes.ativarRegular = { permitida: true, bloqueios: [] };
  let activated = null;
  const tree = AccessSection(props(item, { onActivate: (selected) => { activated = selected; } }));
  const activateButton = button(tree, 'Ativar matrícula regular');
  assert.equal(activateButton.props.disabled, false);
  activateButton.props.onClick();
  assert.equal(activated, item);
  assert.match(text(tree), /Ativação acadêmica sem aguardar pagamento ou documentos/);
});

for (const [blocker, message] of [
  ['SEM_PERMISSAO', 'Seu perfil não pode executar esta ação.'],
  ['TURMA_FORA_DE_ANDAMENTO', 'A turma ainda não está em andamento.'],
]) {
  test(`recuperação preserva bloqueio canônico ${blocker}`, () => {
    const item = enrollment({ status: 'PENDENTE' });
    item.acoes.ativarRegular = { permitida: false, bloqueios: [blocker] };
    const tree = AccessSection(props(item));
    assert.equal(button(tree, 'Ativar matrícula regular').props.disabled, true);
    assert.ok(text(tree).includes(message));
  });
}

test('implantação continua em fluxo separado e não exibe ativação regular', () => {
  const item = enrollment({ status: 'PENDENTE', fluxo: 'IMPLANTACAO' });
  item.acoes.liberarImplantacao = { permitida: true, bloqueios: [] };
  const tree = AccessSection(props(item));
  assert.equal(button(tree, 'Ativar matrícula regular'), undefined);
  assert.equal(button(tree, 'Reliberar acesso de implantação').props.disabled, false);
  assert.doesNotMatch(text(tree), /Pagamento a concluir/);
});
