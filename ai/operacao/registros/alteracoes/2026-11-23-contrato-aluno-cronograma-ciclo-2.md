# Contrato do Aluno — vencimentos e encargos do segundo ciclo

Data: 2026-11-23
Versão: 4.8.369
Escopo: Contrato do Aluno na modalidade Técnica.

## Entrega

- Projeta a rematrícula no mês seguinte à última mensalidade do primeiro ciclo, seguida pelas parcelas do segundo ciclo. As condições individuais e os vencimentos revisados têm precedência.
- A projeção ocorre no contrato. A emissão de cobranças continua no fluxo do Financeiro.
- Separa os ciclos no plano, com valores e datas em negrito. Na cláusula de encargos, destaca em vermelho os rótulos de pontualidade, juros e multa e identifica mensalidades com termos distintos.

## Manifesto explícito

- `.github/workflows/contract-individual-terms.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-23-contrato-aluno-cronograma-ciclo-2.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-11-versao-4-8-297.md`
- `internal/versioning/system-version.json`
- `modules/shared/contrato-aluno/semantic-format.ts`
- `supabase/migrations/20261124000739_contract_financial_schedule_presentation.sql`
- `supabase/tests/contract_individual_schedule.isolated.test.mjs`

Total: 10 arquivos.

## Validação

- SQL isolado com a minuta técnica e o compositor oficial. Na simulação de 24 mensalidades, a rematrícula vence em 15/10/2027 e o segundo ciclo vai de 15/11/2027 a 15/10/2028.
- Texto, destaques e recursos vetoriais verificados no PDF de exemplo, nas páginas da cláusula 6ª.
- Migration `20261124000739` registrada no Supabase de produção. Consulta sintética confirmou datas, total de R$ 7.017,60 e execução das funções restrita ao backend.
- Conferência de produção por ferramentas internas, conforme solicitado. Smoke autenticado por navegador fora do escopo da publicação.
