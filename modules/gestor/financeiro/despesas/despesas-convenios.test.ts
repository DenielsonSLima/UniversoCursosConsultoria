import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { mapLancamento } from './despesas.mapper.ts';
import { validateConvenioExpenseMvp } from './despesas-convenios.model.ts';

const fixture = {
  requestId: '11111111-1111-4111-8111-111111111111',
  poloId: '22222222-2222-4222-8222-222222222222',
  tipo: 'DESPESA_FIXA' as const,
  descricao: 'Salário',
  valor: 1000,
  dataVencimento: '2026-09-30',
};

test('convênio aceita somente vínculo integral e uma parcela no MVP', () => {
  assert.doesNotThrow(() => validateConvenioExpenseMvp({
    ...fixture,
    convenioMesId: '33333333-3333-4333-8333-333333333333',
    totalParcelas: 1,
    markAsPaid: true,
  }));

  assert.throws(() => validateConvenioExpenseMvp({
    ...fixture,
    convenioMesId: '33333333-3333-4333-8333-333333333333',
    totalParcelas: 2,
  }), /parcela única/);

  assert.throws(() => validateConvenioExpenseMvp({
    ...fixture,
    convenioMesId: '33333333-3333-4333-8333-333333333333',
    rateio: { modo: 'TODOS' },
  }), /sem rateio/);
});

test('mapper preserva os quatro campos canônicos do vínculo', () => {
  const mapped = mapLancamento({
    id: 'despesa-1',
    tipo: 'DESPESA_FIXA',
    descricao: 'Salário',
    valor: 1000,
    data_vencimento: '2026-09-30',
    status: 'PENDENTE',
    parcela_numero: 1,
    total_parcelas: 1,
    created_at: '2026-09-27T00:00:00Z',
    convenio_mes_id: 'mes-1',
    convenio_id: 'convenio-1',
    convenio_nome: 'Anhanguera',
    convenio_competencia: '2026-09-01',
  });
  assert.deepEqual({
    mes: mapped.convenioMesId,
    convenio: mapped.convenioId,
    nome: mapped.convenioNome,
    competencia: mapped.convenioCompetencia,
  }, {
    mes: 'mes-1',
    convenio: 'convenio-1',
    nome: 'Anhanguera',
    competencia: '2026-09-01',
  });
});

test('integração usa wrapper atômico e consulta somente competências abertas', () => {
  const base = fileURLToPath(new URL('.', import.meta.url));
  const service = readFileSync(`${base}/despesas-lancamentos.service.ts`, 'utf8');
  const form = readFileSync(`${base}/components/DespesaForm.tsx`, 'utf8');

  assert.match(service, /rpc\('criar_despesa_convenio_secure'/);
  assert.match(service, /p_convenio_mes_id: input\.convenioMesId/);
  assert.match(form, /useConveniosListQuery\(poloId, 'ABERTOS', ''\)/);
  assert.match(form, /invalidateConveniosScope\(queryClient, poloId, convenioMesId\)/);
});
