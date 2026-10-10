# Revisão do recebimento em cinco etapas

Revisão de 4.8.201/PR295 solicitada em 10/10/2026. Correção preparada para 4.8.202, revisão 211, na autorização vigente de publicação do fluxo.

## Achados e aceite

P1: após conferir as cobranças, a revisão era marcada como desatualizada imediatamente. A consulta somente leitura do retorno JSONB confirmou a ordem `itens, versao`, enquanto o cliente reconstruía `versao, itens`. O hook comparava JSON.stringify, recusando conteúdo equivalente. Agora usa o comparador semântico já utilizado no envio final. Aluno, itens, ordem da lista, datas, valores e fingerprint continuam protegidos; só a ordem das propriedades deixa de invalidar a conferência.

P2: na Gestão/Turma, voltar ao passo Aluno e selecionar novamente a opção atual limpava origem, motivo, observações, aproveitamentos e cronograma. O UUID não mudava, então o efeito de carregamento não rodava. Reselecionar o mesmo UUID agora preserva o rascunho e a revisão; outro aluno continua reiniciando seus dados e padrões.

P2: desligar e religar opções financeiras antes de aplicar gerava um patch artificial. Ao voltar da lista personalizada, isso podia substituir valores e condições individuais pelos padrões. As opções booleanas agora refletem somente mudanças efetivas. Reativação após uma desativação já aplicada continua enviando a configuração necessária.

## Revisão independente

- Assistente: reproduzidos o reset indevido e o falso bloqueio da revisão, usando hook e footer reais com RPC isolado.
- Regra 365: não encontrada regressão na fronteira inclusiva, autenticação/polo, replay, preservação de vínculo e prova de transferência.
- Financeiro: reprodução do patch indevido com helper e função publicada em consulta somente leitura; revisão independente aprovou as correções de comparação e alternância de opções.
- Produção anterior conferida: main `8b86598c9ec77560a1d17b66859cb6d123413f05`, Vercel concluída e checks pós-merge verdes. Cinco migrations presentes, T40 com 3 módulos/27 disciplinas, zero permissões transitórias persistentes.

Limitação anterior, fora deste hotfix: a RPC legada do modal de Parceiros recusa matrícula técnica; o caminho válido permanece Gestão → Turma. Nenhuma alteração desse contrato foi incluída.

## Validação

Reproduções novas falharam antes do patch e passaram após a correção. Validação final focada: 18 testes Node e 23 Deno, todos aprovados. Inclui avanço pelo footer real de Cobranças para Revisão, resposta com ordem JSONB, cronograma vazio, troca de aluno, mudanças de valor/data/regra, opções booleanas, preservação do outro ciclo e fronteira de 365 dias. Comparação adicional com o plano real retornado pelo banco confirmou equivalência e rejeição de alteração de um centavo. Lint dos arquivos alterados aprovado. TypeScript e build aprovados. Limite de linhas validado no fechamento; o manifesto permanece restrito aos nove arquivos abaixo. Nenhuma migration adicional é necessária.

A conferência visual segue pendente com o usuário. A revisão automática recusou o Safari por possível interferência com outra automação, além da orientação de concluir o código e testar depois. Nenhum aluno real ou cobrança deve ser criado como teste.

## Manifesto explícito

Total: 9 arquivos.

- `modules/gestor/gestao/tecnicos/detalhes/components/academic/useReceiveExternalTransfer.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer-wizard.behavior.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer-financial-configuration.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer-financial-configuration.test.ts`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-10-10-revisao-transferencia-cinco-etapas.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
