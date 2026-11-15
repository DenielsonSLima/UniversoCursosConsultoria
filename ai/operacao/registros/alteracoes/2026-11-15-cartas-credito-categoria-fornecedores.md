# Cartas de crédito: categoria e fornecedores

Data: 15/11/2026. Classificação: operação crítica de dados financeiros.
Status: executado em produção via MCP Supabase e conferido após a gravação.

## Escopo e aceite

- Somente três lançamentos identificados pelas capturas e pela consulta real da Matriz, do tipo DESPESA_FIXA, pagos e classificados em DIVERSOS.
- Criar CARTAS DE CRÉDITO ativa com o mesmo tipo e reclassificar esses três IDs.
- Vincular o cadastro existente do Banese sem alterá-lo.
- Cadastrar Banco do Brasil S.A. e Banco Cooperativo Sicredi S.A. como PJ, categoria BANCO, relação FORNECEDOR, ativos e globais, sem acesso institucional.
- Corrigir somente SINCRED para SICREDI na descrição correspondente.
- Preservar integralmente valores, datas, contas, formas de pagamento, histórico e rateios.

## Identificação das instituições

O usuário autorizou pesquisar os cadastros gerais; instituição de Sergipe seria alternativa somente se não houvesse cadastro geral apropriado. Foram encontrados os dois cadastros gerais oficiais, sem escolher uma cooperativa local arbitrária:

- Banco do Brasil S.A., CNPJ 00.000.000/0001-91, Brasília/DF. Fonte: [identificação geral divulgada pelo BB](https://www.bb.com.br/docs/portal/gesem/PrestacaodeContasTCU1T2024.pdf).
- Banco Cooperativo Sicredi S.A., CNPJ 01.181.521/0001-55, Porto Alegre/RS. Fonte: [declaração oficial de 2026](https://www.sicredi.com.br/media/produtos/filer_public/2026/03/17/declaracao_unificada_-_banco_sicredi_administrador-manifesto.pdf).

Os vínculos usam os cadastros gerais solicitados; não se inferiu a identidade de uma administradora de consórcio específica a partir da descrição da despesa.

## Método e validação

- Projeto Supabase confirmado: `kfekgwyqozhicpfuunpo`; todas as operações exclusivamente pelo MCP.
- SQL com IDs explícitos, bloqueios, hashes das demais colunas, pré-condições exatas, marcador idempotente e auditoria em sistema_eventos.
- Triggers de proteção e projeção permanecem ativos; sem mudança de schema, RLS, Auth ou regras financeiras.
- Comparação integral de eventos, componentes e rateios, além do cadastro anterior do Banese.
- Operação: `1b8ceb31-2bc6-4719-add4-446e7f9d9cf2`. SQL e saída temporária em `/private/tmp/universo-cartas-credito-20261115`, fora do manifesto.
- Revisão independente concluída; escopo global exige `polo_id` nulo e `polo_ids` vazio, com bloqueio `FOR SHARE` dos parceiros existentes e verificação explícita de ausência de acesso institucional.
- Ensaio transacional com ROLLBACK aprovado antes da aplicação; SQL aplicado idêntico ao ensaio, alterando somente o encerramento para COMMIT.
- Pós-consulta confirmou uma categoria criada, dois cadastros PJ criados e três lançamentos reclassificados e vinculados, com SINCRED corrigido para SICREDI.
- Hashes das demais colunas preservados nos três lançamentos (3/3); valores, datas, contas, formas de pagamento, status pago, eventos, componentes e rateios permaneceram intactos. Cadastro existente do Banese preservado.
- Auditoria consolidada em `sistema_eventos`: `2309133f-93b6-4444-bc45-ebb503a26009`.
- Contrato afetado validado no backend real. Smoke visual autenticado não realizado devido à indisponibilidade da automação Safari registrada na etapa anterior.
- Operação somente de dados: nenhum build ou deploy de frontend necessário; sem nova baixa, estorno ou pagamento real.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-11-15-cartas-credito-categoria-fornecedores.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 3 arquivos.
