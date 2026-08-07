import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  GESTOR_CADASTRO_NAVIGATION,
  GESTOR_COMMUNICATION_NAVIGATION,
  GESTOR_MAIN_NAVIGATION,
  GESTOR_MODULE_ORDER,
} from './gestor-navigation.config.ts';

describe('configuração da navegação do gestor', () => {
  it('mantém a ordem operacional acordada e o perfil apenas no rodapé', () => {
    assert.deepEqual(
      GESTOR_MAIN_NAVIGATION.map(item => item.id),
      [
        'inicio', 'parceiros',
        'gestao', 'secretaria',
        'calendario', 'comunicacao', 'caixa', 'financeiro', 'patrimonio',
        'cadastros', 'biblioteca',
        'relatorios',
        'configuracoes',
      ],
    );
    assert.equal(GESTOR_MAIN_NAVIGATION.map(item => String(item.id)).includes('meu-perfil'), false);
    assert.equal(GESTOR_MODULE_ORDER.at(-1), 'meu-perfil');
    assert.deepEqual(
      GESTOR_MAIN_NAVIGATION.map(item => item.label),
      [
        'Início', 'Parceiros', 'Gestão', 'Secretaria',
        'Calendário', 'Comunicação', 'Caixa', 'Financeiro', 'Patrimônio',
        'Formações', 'Biblioteca', 'Relatórios', 'Configurações',
      ],
    );
    assert.deepEqual(
      GESTOR_MAIN_NAVIGATION.map(item => item.group),
      [
        'visao-geral', 'relacionamento',
        'operacao-academica', 'operacao-academica',
        'operacao-academica', 'relacionamento', 'financeiro', 'financeiro', 'financeiro',
        'estrutura-apoio', 'estrutura-apoio',
        'inteligencia',
        'administracao',
      ],
    );
    assert.deepEqual(
      GESTOR_MAIN_NAVIGATION
        .filter(item => 'dividerBefore' in item && item.dividerBefore)
        .map(item => item.id),
      ['calendario', 'cadastros', 'configuracoes'],
    );
  });

  it('organiza cadastros por cursos antes dos documentos de apoio', () => {
    assert.deepEqual(
      GESTOR_CADASTRO_NAVIGATION.map(item => item.id),
      [
        'cadastros-tecnicos', 'cadastros-livres', 'cadastros-especializacao',
        'cadastros-ead', 'cadastros-superior', 'cadastros-ficha',
        'cadastros-checklist', 'cadastros-modelos',
      ],
    );
  });

  it('mantém ações de comunicação antes das configurações', () => {
    assert.deepEqual(
      GESTOR_COMMUNICATION_NAVIGATION.map(item => item.id),
      [
        'comunicacao-atendimento', 'comunicacao-atrasados',
        'comunicacao-notificacoes-push', 'comunicacao-automacoes',
        'comunicacao-fluxos', 'comunicacao-agentes',
        'comunicacao-atendimento-config', 'comunicacao-configuracoes',
      ],
    );
  });
});
