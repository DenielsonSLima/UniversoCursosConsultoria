# Composição Proesc na conciliação — 2026-09-16

## Objetivo e autorização

Apresentar na conciliação os componentes financeiros Proesc já discriminados pelo resolver canônico utilizado no Caixa. O usuário solicitou a correção e mantém a orientação de validação interna, sem navegador. Este registro descreve a correção, seus critérios de aceite e a validação realizada.

## Diagnóstico e correção

- A projeção da conciliação consultava o resolver financeiro compartilhado, mas liberava a composição Proesc somente para o estado conferido.
- Componentes parciais informados pela API, calculados pelas regras informadas e mistos acabavam ocultos na projeção, embora disponíveis ao Caixa.
- A correção permite esses estados e preserva sua proveniência, sem recalcular os valores no frontend nem alterar o resolver.
- A hidratação dos componentes continua após a paginação. Filtros, contagens, escopo, autorização e proteções de desempenho permanecem inalterados.
- A interface já diferencia composição conferida, parcial e calculada. Na ausência de horário, passa a informar especificamente que o horário não está disponível na integração Proesc.

## Critérios de aceite

- Valores, estado e proveniência expostos devem corresponder ao resolver canônico usado pelo Caixa.
- Campos desconhecidos permanecem nulos; zero explícito permanece zero. Diferenças não discriminadas continuam visíveis para conferência.
- Composição calculada ou parcial não pode ser apresentada como conferida no Proesc.
- Data de pagamento não é substituída pela data da consulta ou da conferência. Horário, forma e conta ausentes não são inferidos.
- Componentes conhecidos são apresentados em desktop e celular; registros sem composição continuam informando a ausência.
- Dados financeiros, contratos, recebimentos, títulos bancários e PDF do Caixa não são modificados.

## Manifesto explícito

- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoRecebimentoRows.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoRecebimentoRows.test.tsx`
- `supabase/migrations/20260917030000_align_reconciliation_proesc_composition.sql`
- `supabase/tests/reconciliation_proesc_composition.transaction.sql`
- `.github/workflows/quality-gates.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-16-conciliacao-composicao-proesc.md`

Total: 10 arquivos. Memória, histórico anterior, PDFs e artefatos temporários ficam fora do manifesto.

## Validação

- Dezesseis testes de renderização e mapper aprovados, incluindo a distinção entre composição calculada, mista e conferida, valores nulos e zeros, além da preservação dos metadados ausentes.
- Renderização estática verifica as apresentações desktop e celular sem navegador. Timestamp de sincronização não é usado como horário da baixa.
- Lint focado aprovado; revisão independente da interface sem achados.
- O teste SQL transacional compara a projeção com o resolver canônico, verifica campos preservados e usa rollback. Onze cenários passaram, incluindo comparação ao resolver real, resíduos, origens alternativas e recebível não pago.
- CI acrescenta os testes de renderização e mapper; os testes existentes do PDF do Caixa permanecem intactos.
- TypeScript, build, lint e teto do manifesto aprovados. Os dezesseis testes passaram novamente após o ajuste final de texto.
- Migration aplicada via MCP. A RPC autenticada confirmou juros, multa, desconto, acréscimos e diferença iguais ao resolver utilizado pelo Caixa. ACLs preservadas; cálculo compartilhado, relatório e função de listagem permanecem idênticos.
- Consulta paginada padrão validada sob o limite autenticado existente. Reindexação única no fechamento.

## Entrega

Versão 4.8.67 / revisão 76 validada sobre a entrega fechada 4.8.66 / PR158. Correção do banco aplicada e validada; publicação da interface em andamento. Resultado final de CI, Preview e produção registrado no PR deste lote. GitHub e Supabase restritos aos respectivos MCPs e ao manifesto explícito. Sem dados pessoais, identidades de produção ou telemetria privada neste registro.
