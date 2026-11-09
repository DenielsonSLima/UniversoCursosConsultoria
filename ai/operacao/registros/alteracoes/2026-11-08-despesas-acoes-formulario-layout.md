# Despesas — disposição das ações e campos finais

- Data: 2026-11-08.
- Base: main 61417273f021a1bf5e65d9e683059eed9b3d633f (4.8.274).
- Candidata: 4.8.275, revisão 284.
- Classificação: publicação de ajuste visual em domínio financeiro; um agente de implementação.
- Escopo: cinco arquivos de interface. Sem migration, serviço, cálculo ou autorização alterados.

## Aceite

- Linha 1 da despesa paga: Pago / Clonar. Linha 2: Prévia / Estornar.
- Tabela e cartões usam duas colunas, controles alinhados, altura/largura uniformes e rótulos curtos.
- Indicador de situação continua não interativo; nenhuma ação anterior é removida.
- Anexo fica após Estornar, preservando o bloco primário 2×2 também em despesas com comprovante.
- Ações extras de anexo/histórico e estados pendentes, cancelados e derivados de rateio preservados.
- No formulário, data e configuração do pagamento aparecem antes de Observação e Foto ou PDF.
- Mudança usa ordem do DOM; tabulação acompanha a leitura, sem ordenação visual por CSS.
- Observação/anexo extraídos para componente próprio; estado, validação, aceite de formatos/tamanho, remoção e envio permanecem no pai.

## Validação

- TypeScript e ESLint focados aprovados.
- Renderização dos componentes reais em harness descartável sem rede: ordem Pago/Clonar/Prévia/Estornar na tabela e cartão; pagamento antes de Observação e Foto/PDF; input de arquivo único, formatos e demais valores preservados.
- Revisão independente encerrada: ordem do Anexo corrigida e conferida; condições/callbacks preservados, sem outros achados relevantes.
- Harness e artefatos temporários não entram no manifesto.
- Smoke visual/interativo desktop/mobile: PENDENTE. Chrome retornou “Sky Computer Use native pipe startup failed”.
- CI e Preview de publicação: aguardando execução.
- Todos os arquivos manuais do manifesto devem ficar até 500 linhas; cheque global local tem 39 caminhos legados ausentes já conhecidos, CI usa checkout completo.
- Migrations aplicadas e dados financeiros não são tocados por este lote.

## Manifesto explícito

- `modules/gestor/financeiro/despesas/components/DespesaTable.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaCard.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaForm.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaFormAssociations.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaFormNotes.tsx`
- `ai/operacao/registros/alteracoes/2026-11-08-despesas-acoes-formulario-layout.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 9 arquivos.

## Publicação

- GitHub exclusivamente por MCP, manifesto explícito e commit atômico.
- Produção depende de autorização explícita após candidata revisada.

