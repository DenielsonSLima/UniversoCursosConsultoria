# Início da turma de Radiologia alinhado à primeira cobrança

Data: 2026-08-26
Estado: aplicado e validado em produção

## Objetivo

Definir o início da turma histórica de Radiologia de Japoatã exatamente 30 dias antes da primeira cobrança existente, preservando sua duração, os quatro períodos, os recebíveis e as guardas acadêmicas.

## Evidência anterior

- A turma estava configurada de 01/06/2026 a 01/06/2028 após uma correção provisória anterior.
- A primeira cobrança existente vence em 11/04/2026; o primeiro boleto Banese vence em 11/05/2026.
- O vencimento padrão da turma ainda estava em 20/07/2026 e não representava o histórico importado.
- A turma possuía 27 matrículas e 338 cobranças, mas nenhuma aula, frequência, nota, prática, observação ou fechamento acadêmico lançado.
- Os quatro períodos estavam materializados, somente um estava aberto e as guardas acadêmicas estavam ativas.

## Decisão

- Nova data de início: 12/03/2026, exatamente 30 dias antes de 11/04/2026.
- Novo término previsto: 12/03/2028, preservando a duração planejada de dois anos.
- Primeiro vencimento padrão: 11/04/2026.
- Os quatro períodos foram redistribuídos proporcionalmente entre as novas datas, sem lacunas.
- A geração e a sincronização de cobranças futuras permaneceram desativadas.
- Nenhuma cobrança foi criada, removida, cancelada, recebida ou recalculada por esta correção.

## Produção

- Migration remota: `20260826235407_align_radiology_japoata_start_to_first_charge`.
- Simulação integral com rollback aprovada antes da aplicação.
- Aplicação definitiva concluída com as guardas acadêmicas reativadas.

## Manifesto explícito

Total: 5 arquivos

- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/qualidade/migrations-aplicadas.json`
- `ai/operacao/registros/alteracoes/2026-08-26-inicio-radiologia-japoata-primeira-cobranca.md`
- `supabase/migrations/20260826235000_align_radiology_japoata_start_to_first_charge.sql`
- `supabase/tests/radiology_japoata_start_date.contract.test.ts`

## Validação

- Contrato local: 4/4 testes aprovados; `deno fmt --check`, lint e `git diff --check` aprovados.
- Turma: 12/03/2026 a 12/03/2028, vencimento padrão em 11/04/2026.
- Intervalo entre início e primeira cobrança: 30 dias.
- Períodos: 4, com 1 aberto, início e fim alinhados à turma e 0 lacunas.
- Atividade acadêmica existente: 0 registros nas tabelas protegidas.
- Cobranças: 338 preservadas; a migration não alterou seus estados ou valores.
- Guardas acadêmicas: 4/4 ativas após a aplicação.
