# Mapa da migração Proesc V1 para V2

Inventário de entrada da tarefa de 01/10/2026. Os caminhos abaixo foram inspecionados antes dos patches da migração; não afirmar que continuam ativos depois de um deploy sem conferir o código e o ambiente. A [decisão](../../../../../docs/decisions/proesc-v2-operacional.md) exige encerrar novas leituras V1, preservando provas antigas.

## Chamadas e dependências anteriores

| Área | Caminhos relativos ao repositório | Comportamento encontrado / aceite |
| --- | --- | --- |
| Entrada da Edge | `supabase/functions/proesc-api/handler.ts` | `internal_sync` coordenava workers com transporte V1; `test_token`/`internal_probe` testavam V1; `internal_accounting_probe` lia V1; `save_token` salvava V1. Migrar ou rejeitar antes de qualquer rede. |
| Configuração por versão | `supabase/functions/proesc-api/connections.ts`, `connection-contract.ts`, `test-token.ts` | Seleção V1/V2, teste V1 configuração/contabilidade. V1 não deve continuar consultável pelo painel ou probe. |
| Cliente por operação | `supabase/functions/proesc-api/operations.ts` | `legacy_configuration` e `legacy_accounting` escolhiam V1. Retirar execução remota antiga, sem fallback. |
| Atualização automática | `supabase/functions/proesc-api/sync-worker.ts`, `sync-observation.ts`, `sync-telemetry.ts` | Cliente V1 e observação em blocos contábeis. Nova coleta usa parcelas V2 e estados explícitos; preservar orçamento, retomada, bloqueio e auditoria. |
| Revisão de ciclos | `supabase/functions/proesc-api/cycle-review-pages.ts`, `cycle-review.ts`, `cycle-review-batch.ts`, `cycle-page-evidence.ts`, `cycle-schedule-source.ts` | Coleta/páginas e projeção tipadas por contabilidade V1. Não desativar consulta antiga deixando revisão automática sem alternativa visível. |
| Diagnóstico contábil | `supabase/functions/proesc-api/diagnostic-readonly.ts`, `diagnostic-accounting-identity.ts` | Consultava contabilidade/extrato V1. Histórico pode permanecer; endpoint de nova leitura antiga precisa ser encerrado. |
| Cliente/parser antigo | `supabase/functions/proesc-api/v1-client.ts`, `v1-accounting.ts`, `v1-paced-transport.ts` | Parser e fixtures podem proteger histórico. Presença do arquivo não significa chamada ativa; rastrear importação executável/transporte. |
| Configuração visual | `modules/gestor/configuracoes/proesc/ProescConfig.tsx`, `ProescConnectionCard.tsx`, `proesc.service.ts` | Expunha conexão V1 e V2. V2 deve ser operacional; informação histórica V1 não pode oferecer nova leitura. |
| Console e consumidores | `modules/gestor/configuracoes/consulta-api-proesc/`, `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/proesc-cycle-review.service.ts` | Verificar consultas existentes, testes e feedback de revisão para não manter botões chamando rotas encerradas. |
| Runtime e agendamento | RPCs `proesc_sync_runtime_service`, `proesc_connection_service`, `proesc_workspace_service`; agendamentos existentes | Conferir credencial, habilitação, payload, transporte e retomada remotos. Trocar somente o cliente ou esconder cartão não encerra todos os caminhos V1. |
| Caixa | `internal_contas.caixa_monthly_delinquency`, `caixa_proesc_effective_snapshot` | Consome evidência canônica. Ajustar/adaptar origem sem perder quitação histórica e sem inferir inadimplência de ausência. |

Testes existentes relevantes: `handler*.test.ts`, `sync-worker*.test.ts`, `sync-observation.test.ts`, `cycle-review*.test.ts`, `cycle-page-evidence.test.ts`, `diagnostic-readonly.test.ts`, `diagnostic-invoices.test.ts`, `test-token-v1.test.ts`, `versioned-connections.test.ts`, além dos testes do painel e serviço Proesc. Testes que descrevem parsers históricos continuam úteis; testes que esperam chamada ativa V1 devem refletir a retirada.

## Aceite proporcional ao contrato

1. Provar acesso V2 com autenticação/WAF e consultar turmas/alunos já existentes por identidade, unidade e matrícula; não criar duplicação ou preencher campos por inferência.
2. Provar `09`, pessoa, vínculos, valores PT-BR, estados e paginação completa em setembro; falhas/incompletude precisam impedir aplicação de conclusões financeiras.
3. Cobrir os caminhos ativos de sincronização, revisão de ciclos, teste/configuração e probes. Captura do transporte deve demonstrar ausência de GET para `app.proesc.com/api/v1`, inclusive em erros V2.
4. Confirmar runtime/agendamentos remotos usam V2, ou registrar exatamente quais foram pausados e por quê. Desligar V1 não deve ser apresentado como sincronização V2 funcionando se o worker ficou sem fonte.
5. Validar Caixa, preservar as 30 Banese do recorte original e distinguir pagamento no corte de pagamento posterior. Parcial/superior/cancelada exigem tratamento explícito, sem forçar completude do indicador.
6. Preservar migrations aplicadas, histórico, snapshots, vínculos e testes-fonte. Não apagar provas V1 para retirar avisos.
7. Registrar separadamente patch local, testes, migration aplicada, deploy e smoke real. Informar lacunas em vez de declarar publicado com base em documentação ou fixture.

## Leitor de ciclos compatível com a interface vigente

O discriminador `source: API_SCHEDULE_REVIEW` permanece no envelope por
compatibilidade. Ele não atesta uma nova consulta externa: `version: v2`,
`evidenceSource` e `evidenceObservedAt` registram a proveniência real. `observedAt`
é a leitura atual da elegibilidade canônica; `validUntil` de cinco minutos só
aparece quando C1 é elegível. O prazo da resposta não renova nem expira fatos
históricos. FULL e UNKNOWN continuam inelegíveis, sem chamadas V1.

## Resultado operacional constatado

Em 01/10 às 22h21 de Brasília, FULL completo e auditado habilitou o runtime V2
e desligou os dois runtimes V1. Edge v28 rejeita as rotas antigas com HTTP410;
nenhuma chamada V1 permanece alcançável pelo handler. Sete migrations mantêm
inventário/paginação/retomada, identidade, aplicação auditada e monitor V2.
O cron V2 iniciou sozinho um RECENT às 22h22, confirmando o agendamento real.

Os parsers, fixtures e provas históricas V1 não foram apagados. A interface
4.8.147 do `main` continua compatível, mas seus cartões/rótulos antigos ainda
precisam dos patches locais. Não há publicação/smoke autenticado desses patches.
Resultados e pendências no [registro auditado](../../../registros/alteracoes/2026-10-01-proesc-v2-operacional.md).

## Fontes preservadas

O mapa é evidência do código de entrada, não uma prescrição de alterar todos os arquivos listados nem uma varredura de dívida. Novos caminhos/splits devem ser documentados depois de confirmados pela implementação responsável. O [contrato V2](v2-operacional.md) é a orientação atual; textos arquivados não autorizam reintroduzir a V1.
