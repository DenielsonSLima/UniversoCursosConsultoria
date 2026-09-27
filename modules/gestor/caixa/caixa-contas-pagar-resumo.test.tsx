import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  assertCaixaContasPagarResumoRequest,
  caixaQueryKeys,
  caixaService,
  mapCaixaContasPagarResumo,
} from './caixa.service';
import { CaixaContasPagarResumoCard } from './components/CaixaContasPagarResumoCard';
import { supabase } from '../../../lib/supabase';

const payload = {
  versao: 1,
  competencia: '2026-09-01',
  periodo_inicio: '2026-09-01',
  periodo_fim_exclusivo: '2026-10-01',
  data_corte: '2026-09-27',
  escopo_tipo: 'POLO',
  polo_id: 'polo-a',
  criterio: 'POSICAO_REEXPRESSA_NO_CORTE',
  contas_competencia: { valor: '99999999999999.99', quantidade: 12 },
  pagas_competencia: { valor: '2500.00', quantidade: 4 },
  a_vencer_competencia: { valor: '1200.50', quantidade: 3 },
  em_atraso: { valor: '300.25', quantidade: 2, data_mais_antiga: '2026-09-05' },
  agenda_financeira: {
    hoje: { data: '2026-09-27', valor: '50.00', quantidade: 1 },
    proximos_sete_dias: {
      periodo_inicio: '2026-09-28',
      periodo_fim_exclusivo: '2026-10-05',
      valor: '700.50',
      quantidade: 2,
    },
    dias: Array.from({ length: 8 }, (_, index) => ({
      data: `2026-${index < 4 ? '09' : '10'}-${String(index < 4 ? 27 + index : index - 3).padStart(2, '0')}`,
      valor: index === 0 ? '50.00' : '0.00',
      quantidade: index === 0 ? 1 : 0,
    })),
  },
};

test('mapeia o contrato v1 sem converter ou recalcular valores monetários', () => {
  const resumo = mapCaixaContasPagarResumo(payload);

  assert.equal(resumo.contasCompetencia.valor, '99999999999999.99');
  assert.deepEqual(resumo.pagasCompetencia, { valor: '2500.00', quantidade: 4 });
  assert.deepEqual(resumo.aVencerCompetencia, { valor: '1200.50', quantidade: 3 });
  assert.deepEqual(resumo.emAtraso, {
    valor: '300.25', quantidade: 2, dataMaisAntiga: '2026-09-05',
  });
  assert.deepEqual(resumo.agendaFinanceira.hoje, {
    data: '2026-09-27', valor: '50.00', quantidade: 1,
  });
  assert.deepEqual(resumo.agendaFinanceira.proximosSeteDias, {
    periodoInicio: '2026-09-28', periodoFimExclusivo: '2026-10-05',
    valor: '700.50', quantidade: 2,
  });
  assert.equal(resumo.agendaFinanceira.dias.length, 8);
});

test('rejeita dinheiro numérico, contagem inválida e agenda sem data canônica', () => {
  assert.throws(
    () => mapCaixaContasPagarResumo({
      ...payload,
      contas_competencia: { valor: 2500, quantidade: 12 },
    }),
    /Contrato inválido do resumo de contas a pagar/,
  );
  assert.throws(
    () => mapCaixaContasPagarResumo({
      ...payload,
      pagas_competencia: { valor: '2500.00', quantidade: -1 },
    }),
    /Contrato inválido do resumo de contas a pagar/,
  );
  assert.throws(
    () => mapCaixaContasPagarResumo({
      ...payload,
      agenda_financeira: {
        ...payload.agenda_financeira,
        hoje: { ...payload.agenda_financeira.hoje, data: '27/09/2026' },
      },
    }),
    /Contrato inválido do resumo de contas a pagar/,
  );
  assert.throws(
    () => mapCaixaContasPagarResumo({
      ...payload,
      agenda_financeira: {
        ...payload.agenda_financeira,
        dias: payload.agenda_financeira.dias.slice(0, 7),
      },
    }),
    /Contrato inválido do resumo de contas a pagar/,
  );
});

test('isola cache e recusa resposta de outro escopo ou competência', () => {
  const resumo = mapCaixaContasPagarResumo(payload);
  assert.deepEqual(
    caixaQueryKeys.contasPagarResumo('polo-a', '2026-09-01'),
    ['caixa', 'contas-pagar-resumo', 'polo-a', '2026-09-01'],
  );
  assert.doesNotThrow(() => {
    assertCaixaContasPagarResumoRequest(resumo, 'polo-a', '2026-09-01');
  });
  assert.throws(
    () => assertCaixaContasPagarResumoRequest(resumo, 'polo-b', '2026-09-01'),
    /escopo diferente/,
  );
  assert.throws(
    () => assertCaixaContasPagarResumoRequest(resumo, 'polo-a', '2026-10-01'),
    /escopo diferente/,
  );
});

test('serviço envia polo, competência e AbortSignal à RPC canônica', async (t) => {
  let rpcName = '';
  let rpcArgs: Record<string, unknown> = {};
  let seenSignal: AbortSignal | undefined;
  t.mock.method(supabase, 'rpc', (name: string, args: Record<string, unknown>) => {
    rpcName = name;
    rpcArgs = args;
    return {
      abortSignal(signal: AbortSignal) {
        seenSignal = signal;
        return this;
      },
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve({ data: payload, error: null }).then(resolve);
      },
    };
  });
  const controller = new AbortController();

  const resumo = await caixaService.getContasPagarResumo(
    'polo-a',
    '2026-09-01',
    controller.signal,
  );

  assert.equal(rpcName, 'get_caixa_contas_pagar_resumo_secure');
  assert.deepEqual(rpcArgs, { p_polo_id: 'polo-a', p_competencia: '2026-09-01' });
  assert.equal(seenSignal, controller.signal);
  assert.equal(resumo.emAtraso.valor, '300.25');
});

test('card mostra os três KPIs canônicos e o subtom a vencer', () => {
  const html = renderToStaticMarkup(
    <CaixaContasPagarResumoCard
      resumo={mapCaixaContasPagarResumo(payload)}
      isLoading={false}
      hasError={false}
    />,
  );

  assert.match(html, /Contas da competência/);
  assert.match(html, /R\$ 99\.999\.999\.999\.999,99/);
  assert.match(html, /Pagamentos na competência/);
  assert.match(html, /R\$ 2\.500,00/);
  assert.match(html, /4 título\(s\) integralmente quitado\(s\)/);
  assert.match(html, /O valor inclui pagamentos efetivos, inclusive parciais/);
  assert.match(html, /Em atraso no corte/);
  assert.match(html, /R\$ 300,25/);
  assert.match(html, /A vencer: R\$ 1\.200,50/);
  assert.match(html, /Mais antiga em 05\/09\/2026/);
});

test('integra somente a RPC canônica e não recompõe os KPIs no componente', () => {
  const caixaRoot = join(process.cwd(), 'modules/gestor/caixa');
  const serviceSource = readFileSync(join(caixaRoot, 'caixa.service.ts'), 'utf8');
  const pageSource = readFileSync(join(caixaRoot, 'CaixaPage.tsx'), 'utf8');
  const cardSource = readFileSync(
    join(caixaRoot, 'components/CaixaContasPagarResumoCard.tsx'),
    'utf8',
  );

  assert.match(serviceSource, /rpc\('get_caixa_contas_pagar_resumo_secure', \{/);
  assert.match(serviceSource, /p_polo_id: normalizedPoloId/);
  assert.match(serviceSource, /p_competencia: competencia/);
  assert.match(pageSource, /<CaixaContasPagarResumoCard/);
  assert.doesNotMatch(cardSource, /contasCompetencia\.valor\s*[-+]/);
  assert.doesNotMatch(cardSource, /pagasCompetencia\.valor\s*[-+]/);
});
