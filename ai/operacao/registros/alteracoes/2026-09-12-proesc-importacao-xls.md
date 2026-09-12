# Importação Proesc com cadastros dos XLS — 4.8.49

Estado: importação das nove turmas, auditoria de dados e habilitação do monitor concluídas; publicação 4.8.49 em andamento.

Base: 4.8.48/revisão 57 publicada pelo PR142, squash b5b185e5067e5a7ea02075edfb6667ddcb5fb72b, com CI, Vercel e versão pública confirmados.

## Etapa publicada em 4.8.48

- 385 pessoas cadastradas por CPF canônico: 382 novos perfis e 3 reutilizados sem sobrescrita. Dois CPFs confirmados pelo usuário receberam proveniência própria; um caso sem CPF permanece pendente.
- Quatro turmas INTEGRAL de Japoatã criadas: T35 (01/06/2024), T38 (08/02/2025), T40 (12/04/2025) e T43 (07/02/2026). São 207 matrículas, respectivamente 45, 58, 43 e 61, com situação acadêmica documentada.
- Histórico financeiro aplicado: 2.940 cobranças e 1.854 cobranças com pagamento confirmado, total recebido de R$ 470.746,72 na Conta Proesc compartilhada. Totais por turma: T35 662/526; T38 993/663; T40 622/382; T43 663/283 (cobranças/pagas).
- 1.086 registros sem situação integral comprovada na API permanecem em conferência. Ausência de pagamento em um recorte não comprova cobrança aberta nem cancelamento; a interface identifica a revisão.
- T42 e Radiologia existentes foram preservadas. Não foram emitidos novos boletos na importação.
- Um email fonte coincidia com Auth sem identidade comprovada. O contato principal foi omitido apenas nesse cadastro, com valor original e referências XLS preservados na proveniência privada. Nenhuma credencial foi vinculada por coincidência de email.

## Continuação aplicada em 4.8.49 e limites

- Aquidabã: T41 (08/04/2025) e T44 (03/03/2026); Porto da Folha: T37 (03/09/2024), T39 (08/04/2025) e T45 (03/03/2026). As cinco turmas SEM receberam INTEGRAL e aulas aos sábados por confirmação expressa do usuário e foram criadas; as 185 matrículas foram aplicadas, totalizando nove turmas, 392 matrículas e 385 alunos; a etapa financeira adicional concluiu 3.131 cobranças, sendo 1.682 com pagamento confirmado. O conjunto das nove turmas contém 6.071 cobranças, 3.536 pagamentos confirmados, R$ 898.688,99 recebidos e 2.535 registros em conferência. A confirmação textual e o dia da semana constam da proveniência privada; horários, data final e calendário de aulas não foram inventados.
- XLS fornece cadastro, turma e situação acadêmica; API fornece obrigações e fatos de pagamento. Não se inferem data final, ID nativo de matrícula, plano vendido ou cobertura de ciclos pelo número da turma/ano/quantidade de parcelas.
- Cobertura individual continua em revisão. Importar ou sincronizar pagamento confirmado não libera segundo ciclo; política e configuração reais continuam necessárias para futura emissão local.
- Canceladas e obrigações sem vínculo seguro permanecem no manifesto privado, sem associação por nome isolado ou preenchimento de CPF fictício.
- Payloads, CPFs, planilhas extraídas, confirmações pessoais e executores reais permanecem privados fora do repositório.

## Contratos e implantação

- RPCs internas autorizam antes do replay, preservam payload imutável e usam locks/claims privados ligados à transação. Alunos existentes são reutilizados; não são criados Auth, convites ou cobranças na etapa acadêmica.
- Matrícula de aluno CURSANDO mantém ATIVO como continuidade acadêmica comprovada, sem aprovar documentação. Trancamento, desistência, cancelamento e transferência pertencem à matrícula.
- Turmas legadas guardam espelhos financeiros neutros e condições em conferência; edição acadêmica não fabrica plano, publicação ou calendário. Geração permanece bloqueada até prova individual.
- Migrations 00–07, 30/40/45/50/60/65/70/75 e extensões 76/78 aplicadas por MCP; fontes aplicadas são imutáveis.
- Edge Proesc v6 publicado pelo coordenador, com paridade dos 11 arquivos conferida. A sincronização processa lotes maiores com concorrência limitada e avança somente o prefixo efetivamente concluído; itens fora de ordem podem repetir com idempotência.
- Quatro eventos de histórico registrados como IMPORTACAO/PARCIAL/PROESC_API, com replay aprovado e conferência residual preservada. A publicação 4.8.48 foi confirmada; a continuação registrou mais cinco eventos PARCIAL/PROESC_API, com replay aprovado para todos. A publicação 4.8.49 depende do fechamento atual.

## Validação

- Ensaio acadêmico/financeiro/cobertura com BEGIN e rollback aprovado antes da importação real: identidade, replay, status, turno pendente, guardas e preservação T42/Radiologia.
- Ensaio de cadastro isolado aprovado: CPF canônico, reuso imutável, origem documental e nenhuma criação de Auth, comunicação, matrícula ou cobrança inesperada.
- Auditoria real dos 385 cadastros: zero CPF inválido/duplicado/divergente, zero Auth indevidamente vinculado, zero convite/notification outbox/push provocado pela importação. Dois CPFs confirmados e email pendente preservados em proveniência.
- Auditoria financeira real aprovada: 2.940 vínculos e recebíveis únicos, uma conta Proesc, 1.854 pagamentos e R$ 470.746,72 recebidos, sem divergências nas guardas auditadas.
- Consulta automática habilitada para 2.940 novos vínculos em 31 blocos, somando 3.286 com a T42. Auditoria global: uma Conta Proesc, zero vínculos inelegíveis e proteção de ciclos mantida. Duas chamadas reais do worker v6 concluíram 60 consultas cada, sem falhas; nova consulta não exige tela aberta.
- Os 75 blocos de auditoria compararam integralmente principal, vencimento, identidade, linhas contábeis, data/valor de pagamento e recibos: nenhuma divergência. Recebimentos foram conferidos por mês de pagamento.
- Build completo 4.8.48 aprovado. Smoke funcional V4 com a identidade Auth real e páginas de 25 confirmou as quatro turmas e separação pago/conferência. O erro 53100 ocorreu no harness amplo que repetia páginas JSON na ordenação; a correção ficou no teste privado, sem alteração adicional do produto.
- Sete testes do worker aprovados; ensaio SQL do cursor por prefixo concluído aprovado pelo coordenador. Novo teste de escala protege falha intermediária e retomada idempotente.
- Interface: 10 testes focados aprovados, TypeScript e ESLint sem diagnósticos no escopo. Smoke sintético do componente real aprovado em Chromium desktop e mobile, sem overflow e com estados Proesc/Banese preservados. Smoke da continuação 4.8.49 e validação integrada de fechamento continuam sob responsabilidade do coordenador.
- Os testes acadêmicos sintéticos exigem banco anterior à importação real e rollback externo; não devem ser executados agora sobre o lote aplicado. O teste individual usa o operador confirmado do escopo, sem representá-lo como usuário Auth.
- Controle de versão 4.8.48/revisão 57 e check:file-lines aprovados; manifesto de 40 arquivos, todos abaixo de 500 linhas. O registro de manifestos para publicação usa a base remota e026a0f mais este lote, preservando referências locais paralelas fora do commit.
- PR 141/4.8.47 é entrega anterior independente. Seu registro foi encerrado neste lote documental: Vercel/produção confirmados; GitHub Actions permaneceu na fila sem runner, sem alegação de CI aprovado.

## Correções da revisão 4.8.49

- O resumo técnico omitira OUTROS_CREDITOS vinculados ao Proesc. A RPC passa a incluir o histórico cuja identidade e escopo foram confirmados, mantendo o filtro de polo e a proteção de títulos Banese.
- A lista apresentava Mensalidade para obrigação Proesc de classificação desconhecida. A classificação e o rótulo são resolvidos no backend; o frontend não infere tipo, parcelas, recebimentos ou totais.
- Somente novas migrations 20260912230000/230001 e seus consumidores/testes entram nesta revisão. Migrations aplicadas de 4.8.48 permanecem imutáveis.
- As duas migrations corretivas foram aplicadas e os testes RPC somente leitura passaram, inclusive a repetição do resumo e dos rótulos após a conclusão das nove turmas. A correção também remove a identificação indevida de baixa manual em recebimento Proesc. Nenhum cálculo financeiro foi acrescentado no frontend.
- Revisão focada: 16 testes Node aprovados, TypeScript e ESLint sem diagnósticos, smoke sintético desktop/mobile da fonte de publicação aprovado. Build completo 4.8.49 aprovado; janela autenticada indisponível para smoke visual.
- Histórico das cinco turmas registrado como PARCIAL/PROESC_API, conferindo 3.131 títulos, 1.682 pagos e 1.449 registros em revisão; todos os replays retornaram o mesmo evento. No conjunto das nove turmas permanecem 2.535 revisões e o caso sem CPF.
- Auditoria integral das nove turmas aprovada: identidade, principal, vencimentos, valores recebidos e dados originais exatos; 3.536 snapshots VERIFIED, zero contas incorretas, zero guardas de ciclo ausentes e zero divergências entre os pagamentos atuais e os snapshots verificados. T42 e Radiologia mantiveram hashes idênticos à linha de base.
- Monitor adicional habilitado em 34 blocos para os 3.131 vínculos das cinco turmas. Auditoria global: 6.071 novos vínculos habilitados e 346 da T42, totalizando 6.417, uma Conta Proesc compartilhada e zero vínculos inelegíveis ou em conta incorreta. Novo acionamento do cron confirmado com HTTP 200: execução adquirida, 60 obrigações consultadas, 60 sem alteração, zero falhas, zero revisões e sem timeout.
- Auditoria acadêmica final: nove turmas, 392 matrículas e 385 alunos; zero divergências de CPF/status, perda de visibilidade entre polos, notificações/push, Auth criado ou flags indevidas de geração. Todas as turmas estão INTEGRAL e com as datas autorizadas.
- Total recebido consolidado das nove turmas: R$ 898.688,99 em 3.536 cobranças pagas. O valor de R$ 470.746,72 da etapa anterior não deve ser somado novamente. Publicação e smoke autenticado da continuação ainda não foram confirmados.

## Manifesto explícito da revisão 4.8.49

Somente os 12 arquivos alterados sobre b5b185e5067e5a7ea02075edfb6667ddcb5fb72b entram nesta revisão. O utilitário de apresentação usa uma cópia de publicação baseada nesse commit, preservando a alteração local paralela fora da entrega. O registro de manifestos remoto já inclui este lote e não exige nova alteração.

- `supabase/migrations/20260912230000_proesc_summary_linked_history.sql`
- `supabase/migrations/20260912230001_proesc_source_obligation_labels.sql`
- `supabase/tests/proesc_summary_linked_history.readonly.sql`
- `supabase/tests/proesc_source_obligation_labels.readonly.sql`
- `modules/gestor/financeiro/financeiro.proesc-evidence.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/modalidade-receber.utils.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/proesc-obligation-label.test.ts`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/MEMORIA_CANONICA.md`
- `ai/operacao/registros/alteracoes/2026-09-12-proesc-importacao-xls.md`


O manifesto publicado de 4.8.48 permanece consultável no [registro do PR142](https://github.com/DenielsonSLima/UniversoCursosConsultoria/blob/b5b185e5067e5a7ea02075edfb6667ddcb5fb72b/ai/operacao/registros/alteracoes/2026-09-12-proesc-importacao-xls.md), com suas 18 migrations e testes preservados no repositório.
