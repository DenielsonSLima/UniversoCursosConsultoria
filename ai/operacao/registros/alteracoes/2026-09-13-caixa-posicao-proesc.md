# Caixa — posição Proesc e indicadores parciais

Estado: migration aplicada e validada; frontend 4.8.56 em publicação, autorizado pelo usuário.
## Objetivo e aceite

- Corrigir o bloqueio da posição total mostrado em Aquidabã no corte de 13/09/2026.
- Usar os movimentos históricos comprovados da conta técnica Proesc, mantendo a exigência de saldo-base para contas físicas.
- Identificar inadimplência e margem como parciais quando a fonte ainda não comprova a situação de cobranças; mostrar quantidade e valor nominal em conferência.
- Não alterar cobranças, pagamentos, saldos-base, integrações ou critérios de classificação para eliminar avisos.

## Manifesto explícito

- `supabase/migrations/20260913123752_caixa_posicao_total_proesc_control.sql`
- `supabase/tests/caixa_posicao_total_proesc.contract.test.mjs`
- `supabase/tests/caixa_posicao_total_proesc.readonly.mjs`
- `modules/gestor/caixa/components/CaixaCompromissosCards.tsx`
- `modules/gestor/caixa/components/CaixaCompromissosCards.test.tsx`
- `ai/operacao/registros/alteracoes/2026-09-13-caixa-posicao-proesc.md`

- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 9 arquivos.

## Diagnóstico e solução

- Reprodução autenticada no Safari confirmou os dois avisos e a posição corrente do polo. As duas imagens fornecidas foram conferidas.
- A única conta sem `data_saldo` é o controle técnico Proesc, cuja configuração deliberadamente não representa saldo-base bancário. A RPC antiga bloqueava qualquer escopo que incluísse essa conta.
- A exceção nova exige identidade técnica exata, `system_managed`, saldo inicial zero e ausência de data-base. Agrega movimentos pagos com data e valor comprovados até o corte; o vínculo de acesso criado na importação não elimina pagamentos históricos do polo. O consolidado soma cada conta uma vez.
- Contas físicas sem base válida e movimentos técnicos pagos sem data/valor continuam indisponíveis. Nenhuma data ou quantia foi estimada.
- O mês possui oito cobranças elegíveis, principal de R$ 2.239,20, e 59 em conferência, valor nominal de R$ 16.564,20. A história disponível não comprova estado OPEN/PAID dessas 59. O monitor consultou a origem no dia da análise; ausência de recebimento em uma fatia contábil V1 não comprova dívida aberta.
- A UI preserva os números da RPC, acrescenta “(parcial)” aos dois indicadores e explicita base conferida e montante nominal pendente de confirmação.

## Validação

- Três agentes independentes: posição histórica; evidência/classificação Proesc; contrato visual e revisão cruzada. A revisão fechou guardas de data, valor e escopo.
- Cinco testes de contrato SQL e quatro testes funcionais do componente aprovados. Tipagem focada sem diagnósticos.
- Build completo aprovado; aviso de chunks grandes já existente, sem erro de compilação.
- Ensaio via MCP Supabase, com transação somente leitura e sem DDL, executou o corpo SQL candidato: sete cenários de polo/período/global, acesso sem identidade negado e cinco guardas de conta aprovados.
- Aquidabã: contribuição comprovada Proesc de R$ 122.729,22 em julho, R$ 135.122,42 em agosto e R$ 138.646,63 no corte atual. Posição corrente candidata confere com as RPCs canônicas de contas.
- Smoke visual local no Safari confirmou o componente real com os agregados observados, rótulos parciais e R$ 16.564,20 em conferência. A aba Proesc aberta contém extrato de movimentação, sem estado explícito das 59 cobranças.

## Limites e entrega

- Usuário autorizou aplicar e publicar. Migration aplicada via MCP sob versão 20260913123752; conteúdo preservado e nome local alinhado ao ledger. RPC real validou três competências de Aquidabã, igualdade com o retorno do relatório, preservação das 59 revisões e acesso sem identidade negado.
- A conferência financeira das 59 permanece pendente de fonte com estado explícito, como V2 autorizada ou relatório documental adequado; não tratá-las como pagas, vencidas ou canceladas por ausência de evidência.
- O retorno canônico do relatório após aplicação confere com a RPC da tela. Nenhum exportador PDF foi alterado. Validação pós-publicação por MCP, testes e HTTP; navegador proibido pelo usuário.
- O lote ativo de diários operacionais está sendo alterado por outra frente; foi preservado. Este registro mantém o escopo Caixa separado, sem alterar memória ou políticas. Versão/changelog/registro de manifestos são preparados isoladamente sobre a base remota; os arquivos locais paralelos de versão 4.8.55 são preservados.
- O teto de 500 linhas é conferido diretamente para os nove arquivos deste manifesto. Saídas temporárias ficam em `/private/tmp/caixa-fix-20260913` e não integram a entrega.
- `npm run check:file-lines` executado: a verificação global apontou apenas a ausência do rótulo “Manifesto explícito” no lote ativo paralelo de diários. Os nove arquivos deste manifesto passaram na contagem direta; o lote alheio foi preservado.
- O usuário determinou posteriormente que toda conferência deve ser interna e proibiu uso de navegador. Nenhuma nova operação de navegador foi feita após essa instrução; validação futura segue código, testes e MCP.

- Versão reservada para o Caixa: 4.8.56, revisão 65, sem incluir a entrega acadêmica 4.8.55 ainda paralela. Publicar apenas o overlay explícito deste manifesto.
