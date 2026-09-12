# Lote ativo

Estado: IMPORTACAO PROESC POR XLS — FECHAMENTO 4.8.48 EM VALIDACAO

## Lote: 2026-09-12-proesc-importacao-xls

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-12-proesc-importacao-xls.md`

- Importação autorizada das nove turmas fornecidas; T42 e Radiologia preservadas.
- Cadastros concluídos: 385 pessoas, sendo 382 novas e 3 reutilizadas, sem sobrescrever identidade existente ou criar Auth/convites.
- Quatro turmas INTEGRAL de Japoatã criadas: T35, T38, T40 e T43, com 207 matrículas e situação acadêmica comprovada na fonte.
- Histórico dessas quatro turmas: 2.940 cobranças e 1.854 pagamentos importados, total recebido de R$ 470.746,72; vencimentos, valores recebidos e datas efetivas preservados.
- Cinco turmas SEM de Aquidabã/Porto da Folha aguardam confirmação de turno, com 185 matrículas previstas. Um cadastro permanece pendente por falta de CPF.
- Cobertura de ciclos exige prova individual; histórico importado não autoriza geração do segundo ciclo. Canceladas e obrigações sem vínculo seguro permanecem no manifesto privado de conferência.
- Banco acadêmico/financeiro e extensões de visibilidade/sincronização aplicados por MCP; quatro eventos de histórico PARCIAL registrados. Consulta real v6 processou 60 obrigações sem falhas; habilitação do monitor por blocos e smoke público acompanhados pelo coordenador.
- Versão local preparada: 4.8.48, revisão 57. Publicação, CI e auditoria final ainda não concluídos neste registro.
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

