# Lote ativo

Estado: IMPORTACAO PROESC — FECHAMENTO 4.8.49 EM ANDAMENTO

## Lote: 2026-09-12-proesc-importacao-xls

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-12-proesc-importacao-xls.md`

- Importação autorizada das nove turmas fornecidas; T42 e Radiologia preservadas.
- Cadastros concluídos: 385 pessoas, sendo 382 novas e 3 reutilizadas, sem sobrescrever identidade existente ou criar Auth/convites.
- Quatro turmas INTEGRAL de Japoatã criadas: T35, T38, T40 e T43, com 207 matrículas e situação acadêmica comprovada na fonte.
- Histórico dessas quatro turmas: 2.940 cobranças e 1.854 pagamentos importados, total recebido de R$ 470.746,72; vencimentos, valores recebidos e datas efetivas preservados.
- Usuário confirmou T37/T39/T41/T44/T45 como INTEGRAL, com aulas aos sábados. As cinco turmas foram criadas nos polos/datas autorizados; as 185 matrículas foram aplicadas, totalizando nove turmas e 392 matrículas para 385 alunos. A etapa financeira adicional concluiu 3.131 cobranças e 1.682 pagamentos. O conjunto das nove turmas contém 6.071 cobranças, 3.536 pagamentos confirmados, R$ 898.688,99 recebidos e 2.535 registros em conferência. Um cadastro permanece pendente por falta de CPF.
- Cobertura de ciclos exige prova individual; histórico importado não autoriza geração do segundo ciclo. Canceladas e obrigações sem vínculo seguro permanecem no manifesto privado de conferência.
- Banco acadêmico/financeiro e extensões de visibilidade/sincronização aplicados por MCP; nove eventos de histórico PARCIAL/PROESC_API registrados, com replay aprovado. Consulta real v6 processou 60 obrigações sem falhas; monitor habilitado para 6.071 novos vínculos mais 346 da T42, em uma Conta Proesc compartilhada, sem vínculos inelegíveis. Novo acionamento do cron confirmado com HTTP 200: 60 consultadas e sem alteração, zero falhas/revisões, sem timeout.
- Base 4.8.48/revisão 57 publicada no PR142, squash b5b185e5067e5a7ea02075edfb6667ddcb5fb72b. CI, Vercel e versão pública HTTP200 confirmados. A revisão detectou omissão de OUTROS_CREDITOS Proesc no resumo e rótulo indevido Mensalidade; correções focadas aplicadas no banco para 4.8.49/revisão 58, com testes RPC e build aprovados; resumo e rótulos revalidados após as nove turmas. Totais e classificação pertencem às RPCs; o frontend apresenta os dados canônicos, sem cálculos próprios. Não declarar conclusão ou publicação antes da validação final.
- Auditoria integral das nove turmas aprovada: identidade, datas e valores exatos; zero divergências em pagamentos verificados, contas ou guardas de ciclo. Hashes de T42/Radiologia preservados. Auditoria acadêmica sem divergência de CPF/status/visibilidade nem criação de Auth, notificações ou push. Monitor adicional concluído; publicação e smoke autenticado da revisão ainda pendentes.
- Payloads, CPFs, planilhas extraídas e executores reais permanecem privados fora do repositório.

## Entrega anterior: 2026-09-12-revisao-banese-proesc

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-12-revisao-banese-proesc.md`

- Entrega 4.8.47 concluída: PR 141 incorporado por squash e026a0f56c301f86ba9aee30c263042d97ff1631, Vercel success e versão pública confirmada pelo coordenador com HTTP 200 em main-BeqyXds2.js.
- Radiologia/Banese: pagamento no primeiro dia útil nacional de 2026 reconhecido sem alterar termos ou emitir novo título. Auditoria posterior confirmou PAGO por R$ 260,00 em 08/09/2026, com vencimento original em 06/09/2026.
- T42/Proesc: 346 vínculos, 204 pagos, 142 abertos e R$ 53.813,57 recebidos preservados. Duas provas históricas gravadas após a publicação; ambas VERIFIED e projetadas como CONCILIADO_POR_CONFERENCIA_PROESC, com desconto de R$ 19,90 cada, juros e multa zero. Recebíveis intactos e replay idempotente.
- Componentes desconhecidos continuam nulos; nenhum desconto inferido de diferença ou recebimento parcial. Calendário bancário limitado ao ano de 2026 comprovado.
- Validação local: 53 testes Caixa, 43 testes Deno, TypeScript, ESLint focado e build aprovados; ensaios SQL com rollback e PDF nativo renderizado aprovados.
- GitHub Actions do HEAD 17e83e67 permaneceu QUEUED sem runner ou etapas executadas, runs 34717154177/178. Não registrar CI aprovado. A consulta da branch main mostrou checks obrigatórios desativados.
- Worker100, payment-gateway-api32 e asaas-api96 publicados por MCP; migrations de composição/calendário aplicadas permanecem imutáveis. Detalhes e manifesto no registro anterior.
- A importação das nove turmas por XLS pertence ao lote corrente acima e não integra o PR 141.

