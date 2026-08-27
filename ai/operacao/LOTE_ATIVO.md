# Lote ativo

Estado: `PUBLICADO_COM_PENDENCIA_BANCARIA_HISTORICA`

## Lote: 2026-08-27-bolepix-rematricula

- Pedido: recuperar o QR Code Pix oficial nos boletos e carnês Banese emitidos hoje, corrigir a rematrícula que aparecia como parcela zero e publicar o hotfix completo.
- Registro: `ai/operacao/registros/alteracoes/2026-08-27-bolepix-rematricula.md`.
- Manifesto explícito: seção `Manifesto explícito` do registro acima.
- Autorização: o usuário solicitou expressamente a correção em produção e a atualização completa do GitHub.
- Risco: crítico, por envolver financeiro, payload BolePix, PDF bancário, Edge Functions e publicação.

### Contratos preservados

1. O sistema aceita somente o payload Pix oficial devolvido pelo Banese; nenhum QR Code ou código bancário é fabricado.
2. A consulta de recuperação não cria nem reemite boleto e só completa o mesmo título depois de validar identidade e termos financeiros.
3. Uma divergência por título fica isolada em revisão e não interrompe as demais cobranças do lote.
4. A rematrícula é identificada por `tipo_lancamento`, sem convertê-la em mensalidade zero.
5. Alterações locais paralelas, migrations não publicadas e mudanças comerciais ficam fora do manifesto.

### Resultado

- O worker voltou a autenticar o agendamento e executar com resposta 200.
- O gateway preserva o `QrCode` exato do POST e aceita completá-lo por consulta somente se o banco também devolver o campo; payload e imagem são persistidos de forma atômica.
- Linha digitável inválida só é reparada quando o código de barras oficial prova que se trata do mesmo título.
- Tela e relatório exibem `Rematrícula`; a sincronização possui retorno visível e uma falha de PDF não fecha silenciosamente a aba preparada.
- A migration remota restaurou o automático P3–P9 e endureceu contratos e permissões dos RPCs sem alterar os perfis manuais P17–P20.
- 202 testes focados, TypeScript, Deno check, build e limite de linhas foram aprovados.

### Publicação e pendências

- `banese-reconciliation-worker` v34 e `asaas-api` v84 estão `ACTIVE` no projeto `kfekgwyqozhicpfuunpo`.
- A migration remota registrada como `20260827222743_repair_banese_automatic_profile_floor` foi aplicada e validada.
- O cron em P3 processou 15 títulos, manteve 2 pendentes e isolou 13 com `REMOTE_INTEREST_TYPE_INVALID`; nenhum título diferente foi associado e nenhum QR Code foi fabricado.
- Os 13 retornos POST históricos continuam sem par Pix persistido. O GET público documentado não fornece QR; a recuperação exige o retorno exato do banco por título ou autorização explícita para reemissão individual.
- O smoke autenticado permanece pendente pela indisponibilidade de uma sessão controlável; o fechamento não criou cobrança nem alterou dado financeiro para teste.
- O erro CNAB por EDI7 e decisões de recriação ou regra comercial não pertencem a este hotfix.

## Lote anterior preservado: 2026-08-26-carnes-alunos-e-baixa-rapida

- Pedido: separar a emissão documental de carnês Banese dos recebimentos da Secretaria e permitir baixa manual no modal rápido "Financeiro do aluno" do Início.
- Registro: `ai/operacao/registros/alteracoes/2026-08-26-carnes-alunos-e-baixa-rapida.md`.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-08-26-carnes-alunos-e-baixa-rapida.md`.
- Autorização: em 2026-08-26 foi autorizado e concluído somente o deploy das três Edge Functions documentais Banese (`secretaria-banese-document-groups`, `banese-boleto-document` e `banese-carnet-document`). Migration, `asaas-api`, frontend, baixa real e demais operações remotas continuam fora da autorização.
- Risco: crítico, por envolver financeiro, autorização, PDF bancário em produção e ação de baixa.

### Contratos preservados

1. `Recebimentos` continua sendo o único submódulo da Secretaria que altera o estado financeiro. `Carnês dos alunos` é separado e estritamente documental.
2. O catálogo usa somente cobranças Banese existentes, registradas e confirmadas. Não cria, reemite, sincroniza, recalcula nem registra cobrança no banco ou no Banese.
3. Boleto individual e carnê reutilizam os compositores Banese validados em produção: boleto em uma página A4 e carnê do mesmo pagador, matrícula, polo, ambiente, emissor, convênio e agência.
4. Os modos individual, lote e personalizado selecionam grupos documentais; nunca misturam matrículas ou escopos bancários incompatíveis.
5. A baixa no Início reutiliza o fluxo canônico, mantém confirmação explícita e exige `Financeiro > Receber`. Consultar ou emitir documentos não concede baixa.
6. O contexto da ação rápida aceita somente títulos existentes de tipo conhecido e suprime geração ou sincronização de parcelas futuras, inclusive em replay.
7. Nenhum smoke confirma baixa real e nenhuma operação remota é executada sem nova autorização explícita.

### Resultado local

- A Secretaria possui cards e rotas distintos para `Recebimentos` e `Carnês dos alunos`.
- O novo submódulo possui seleção individual, em lote e personalizada, com prévia, download e impressão do mesmo Blob PDF vetorial.
- O catálogo agrupa `1–2` parcelas como boletos individuais e `3–30` como carnê; títulos históricos encerrados não consomem o limite dos títulos atuais.
- O modal rápido do Início abre a confirmação canônica, atualiza seus caches e permanece na mesma tela.
- RBAC documental, baixa, polo e RPC foram revisados de forma independente; os dois achados encontrados foram corrigidos e o parecer final foi não bloqueador.
- Testes focados, TypeScript, ESLint, Deno fmt/check, PDFs canônicos e build Vite isolado foram aprovados.

### Publicação remota parcial

- Projeto confirmado: `kfekgwyqozhicpfuunpo`.
- `banese-boleto-document` foi atualizado da versão 13 para 14 e `banese-carnet-document` da versão 11 para 12; `secretaria-banese-document-groups` foi publicada na versão 1.
- As três funções estão `ACTIVE`, com `verify_jwt=true`, e o código remoto foi relido depois do deploy.
- Os renderizadores foram publicados em bundle híbrido controlado: 15 arquivos de cada bundle oficial anterior foram preservados byte a byte e somente as guardas/seleções documentais autorizadas foram substituídas.
- O catálogo possui oito arquivos, é estruturalmente somente leitura e não contém criação, atualização, reemissão, sincronização ou reserva de cobrança.
- Nenhum `POST` autenticado, UUID real, PDF, baixa ou operação bancária foi usado no smoke remoto.

### Pendências obrigatórias

- O smoke interativo autenticado permanece pendente porque o navegador interno e uma sessão de gestor reutilizável não estavam disponíveis. Não foi substituído por uma baixa simulada em dados reais.
- A migration e `asaas-api` permanecem apenas no workspace local; o catálogo e os dois renderizadores Banese já estão publicados.
- A publicação futura restante continua backend-first: migration, `asaas-api` e somente então frontend. Publicar o frontend contra a Edge Asaas antiga é proibido, pois o contexto de supressão não existiria no backend antigo.
- O manifesto exato e as evidências estão no registro do lote. Alterações paralelas já presentes em arquivos compartilhados foram preservadas e não são atribuídas silenciosamente a este lote.
