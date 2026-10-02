import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  CaixaComposicaoMensalPayload,
  CaixaComposicaoSecao,
} from '../caixa-composicao.types.ts';
import { CaixaCompositionCards } from './CaixaCompositionCards.tsx';

const completeSection = (overrides: Partial<NonNullable<CaixaComposicaoSecao['dados']>> = {}): CaixaComposicaoSecao => ({
  disponivel: true,
  completo: true,
  motivo: null,
  observacao: null,
  dados: {
    total: '0.00',
    quantidade: 0,
    base: '0.00',
    juros: '0.00',
    multa: '0.00',
    acrescimo: '0.00',
    desconto: '0.00',
    diferenca_a_conferir: '0.00',
    quantidade_a_conferir: 0,
    ...overrides,
  },
});

const payload = (
  recebimentos: CaixaComposicaoSecao = completeSection(),
  despesas: CaixaComposicaoSecao = completeSection(),
): CaixaComposicaoMensalPayload => ({
  versao: 1,
  competencia: '2026-10-01',
  periodo_inicio: '2026-10-01',
  periodo_fim_exclusivo: '2026-11-01',
  escopo_tipo: 'POLO',
  polo_id: '44444444-4444-4444-4444-444444444444',
  gerado_em: '2026-10-01T21:30:00-03:00',
  recebimentos,
  despesas,
});

const render = (composicao?: CaixaComposicaoMensalPayload, hasError = false) => (
  renderToStaticMarkup(
    <CaixaCompositionCards
      composicao={composicao}
      isLoading={false}
      hasError={hasError}
    />,
  )
);

test('estado completo zero preserva zero real, quantidade e os dois cards', () => {
  const html = render(payload());
  assert.match(html, /Composição dos recebimentos confirmados/);
  assert.match(html, /Composição das despesas pagas/);
  assert.match(html, /Total recebido/);
  assert.match(html, /Total pago/);
  assert.match(html, /R\$ 0,00/);
  assert.match(html, />0<\/strong> recebimento\(s\) confirmado\(s\)/);
  assert.match(html, />0<\/strong> pagamento\(s\) confirmado\(s\)/);
  assert.match(html, /Composição comprovada/);
});

test('renderiza somente strings canônicas recebidas, sem perder precisão', () => {
  const html = render(payload(completeSection({
    total: '9007199254740993.07',
    quantidade: 3,
    base: '9007199254740900.00',
  })));
  assert.match(html, /R\$ 9\.007\.199\.254\.740\.993,07/);
  assert.match(html, /R\$ 9\.007\.199\.254\.740\.900,00/);
  assert.match(html, />3<\/strong> recebimento\(s\) confirmado\(s\)/);
});

test('estado parcial usa travessão no que não foi comprovado e anuncia conferência', () => {
  const partial: CaixaComposicaoSecao = {
    disponivel: true,
    completo: false,
    motivo: 'DADOS_INCOMPLETOS',
    observacao: 'Componentes ainda dependem da conferência da origem.',
    dados: {
      total: '280.00',
      quantidade: 4,
      base: '300.00',
      juros: null,
      multa: null,
      acrescimo: null,
      desconto: '20.00',
      diferenca_a_conferir: '-20.00',
      quantidade_a_conferir: 2,
    },
  };
  const html = render(payload(partial));
  assert.match(html, /Leitura parcial/);
  assert.match(html, /2 movimento\(s\) a conferir/);
  assert.match(html, /Componentes ainda dependem da conferência da origem/);
  assert.match(html, /aria-label="Juros: valor não comprovado"/);
  assert.match(html, /aria-label="Multa: valor não comprovado"/);
  assert.match(html, /R\$ -20,00/);
  assert.match(html, /R\$ 280,00/);
});

test('fonte indisponível não apresenta ausência como zero', () => {
  const unavailable: CaixaComposicaoSecao = {
    disponivel: false,
    completo: false,
    motivo: 'FONTE_INDISPONIVEL',
    observacao: 'A origem dos recebimentos não respondeu.',
    dados: null,
  };
  const html = render(payload(unavailable, completeSection({ total: '25.00' })));
  assert.match(html, /Fonte temporariamente indisponível/);
  assert.match(html, /A origem dos recebimentos não respondeu/);
  assert.match(html, /Total pago/);
  assert.match(html, /R\$ 25,00/);
  assert.doesNotMatch(html, /Total recebido[\s\S]{0,180}R\$ 0,00/);
});

test('Japoatã mantém desconto conhecido de 79,60 com um recebimento ainda em conferência', () => {
  const partial: CaixaComposicaoSecao = {
    disponivel: true, completo: false, motivo: 'DADOS_INCOMPLETOS',
    observacao: 'Uma composição ainda não foi discriminada.',
    dados: {
      total: '1300.00', quantidade: 5, base: '1399.50',
      juros: '0.00', multa: '0.00', acrescimo: '0.00', desconto: '79.60',
      diferenca_a_conferir: '-19.90', quantidade_a_conferir: 1,
    },
  };
  const html = render(payload(partial));
  for (const value of ['1.300,00', '1.399,50', '79,60', '-19,90']) {
    assert.ok(html.includes(`R$ ${value}`));
  }
  assert.match(html, /Subtotal identificado/);
  assert.match(html, /Componentes não informados não integram os subtotais/);
  assert.match(html, /1 movimento\(s\) a conferir/);
  assert.match(html, /Ver componentes disponíveis/);
  assert.doesNotMatch(html, /79,60[\s\S]{0,20}Composição comprovada/);
});

test('componentes inteiramente desconhecidos continuam travessão sem subtotal zero', () => {
  const html = render(payload({
    disponivel: true, completo: false, motivo: 'DADOS_INCOMPLETOS',
    observacao: 'Nenhum componente informado.',
    dados: {
      total: '260.00', quantidade: 1, base: '279.90',
      juros: null, multa: null, acrescimo: null, desconto: null,
      diferenca_a_conferir: '-19.90', quantidade_a_conferir: 1,
    },
  }));
  assert.match(html, /aria-label="Desconto: valor não comprovado"/);
  assert.doesNotMatch(html, /Subtotal identificado/);
});

test('disclosure móvel é navegável por teclado e respeita movimento reduzido', () => {
  const html = render(payload());
  assert.match(html, /<details class="group relative mt-4 sm:hidden">/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /min-h-11/);
  assert.match(html, /focus-visible:ring-2/);
  assert.match(html, /motion-reduce:transition-none/);
});

test('loading e erro têm semântica acessível e retry com alvo de 44px', () => {
  const loading = renderToStaticMarkup(
    <CaixaCompositionCards isLoading hasError={false} />,
  );
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /motion-reduce:animate-none/);

  const error = renderToStaticMarkup(
    <CaixaCompositionCards
      isLoading={false}
      hasError
      onRetry={() => undefined}
    />,
  );
  assert.match(error, /role="alert"/);
  assert.match(error, /Tentar novamente/);
  assert.match(error, /min-h-11/);
});
