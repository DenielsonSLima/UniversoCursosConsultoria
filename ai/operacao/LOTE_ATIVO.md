# Lote ativo

Estado: `CONCLUIDO`

## Lote: 2026-08-27-bolepix-rematricula

- Pedido: recuperar o QR Code Pix oficial nos boletos e carnês Banese emitidos hoje, corrigir a rematrícula que aparecia como parcela zero e publicar o hotfix completo.
- Registro: `ai/operacao/registros/alteracoes/2026-08-27-bolepix-rematricula.md`.
- Manifesto explícito: seção `Manifesto explícito` do registro acima.
- Autorização: o usuário solicitou expressamente a correção em produção e a atualização completa do GitHub.
- Risco: crítico, por envolver financeiro, payload BolePix, PDF bancário, Edge Functions e publicação.

### Contratos preservados

1. O usuário está correto sobre o contrato em princípio: o GET oficial por convênio e Nosso Número pode devolver código de barras, linha digitável e o `QrCode` fixo do mesmo boleto.
2. O sistema aceita somente o Pix oficial devolvido pelo Banese e só o associa depois de validar a identidade bancária completa; nenhuma consulta cria ou reemite boleto.
3. A emissão falha fechada antes do POST quando o Nosso Número já pertence a outro título. Em produção, uma nova reserva também exige faixa exclusiva formalmente confirmada pelo banco.
4. A rematrícula continua identificada por `tipo_lancamento`, sem ser convertida em mensalidade zero e sem perder seus dados acadêmicos ou financeiros.
5. Alterações paralelas, migrations não autorizadas e decisões comerciais ficam fora do manifesto.

### Resultado confirmado

- Os 13 Nossos Números atribuídos localmente não identificavam os 13 recebíveis de 2026/27: o GET oficial devolveu títulos Banese de 2018 no valor de R$ 200,00.
- Nenhum desses códigos de barras, linhas digitáveis ou Pix foi associado aos recebíveis atuais. As 13 identidades locais sem prova de POST foram quarentenadas por CAS, preservando 12 parcelas de R$ 279,90 e uma rematrícula de R$ 100,00, além de matrícula, turma, vencimento e status.
- O gateway agora faz preflight GET antes de qualquer POST, bloqueia colisão e valida identidade completa antes de persistir dados bancários. Um POST novo continua aceitando a resposta mínima oficial e preserva o `QrCode` devolvido.
- A recuperação futura pelo GET do Nosso Número persiste o par Pix somente quando proveniência, banco, identidade, valor e vencimento/fator confirmam o mesmo título.
- Tela e relatório priorizam o rótulo `Rematrícula`; o fluxo não apresenta mais esse lançamento como `Parcela 0`.
- `TipoJuroMora = 3` é tratado como juros isentos quando o valor é nulo ou zero; divergências continuam falhando fechadas.
- Worker e gateway mantêm isolamento por título, persistência atômica, locks, CAS integral e retomada pós-baixa pelo marcador servidor autorizado.
- A revisão independente encerrou sem achados P0/P1/P2 e emitiu parecer `APPROVE`.

### Produção e pendências

- `asaas-api` v88 está `ACTIVE`, SHA-256 `b2ca242bbbbe322edebf7d1f22b27340972e63bcda619e4c823c8ca78c2d439a`.
- `banese-reconciliation-worker` v49 está `ACTIVE`, SHA-256 `f6124a5f4b3fca1cb32ee18a98c4f512fae227d64b887a6eea70edb0ec9d71fc`; os logs da versão 49 registraram execução HTTP 200.
- As nove migrations do hotfix, de `20260827224500` a `20260827224643`, foram aplicadas sob os IDs remotos `20260828024316`, `20260828024319`, `20260828024321`, `20260828030305`, `20260828031759`, `20260828050448`, `20260828050650`, `20260828050800` e `20260828050808`.
- A migration local `20260827172000_register_banese_boletos_adenize_cycle2.sql`, que atribuía identidades sem prova bancária, foi excluída do lote, ignorada explicitamente e nunca será publicada no GitHub.
- Emissão Banese e reconciliador permanecem `PAUSED`. Não haverá POST, reemissão ou nova reserva até o banco confirmar formalmente uma faixa exclusiva de Nosso Número e identificar os três títulos citados no atendimento.
- Foram aprovados 151 testes de adaptador/gateway, 16 do worker, 35 de `test:banese-ui` e mais 11 testes focados de `modalidade-receber` para a apresentação da rematrícula, além de TypeScript `--noEmit`, dois `deno check`, build de produção, teto de 500 linhas e revisão independente. A publicação no GitHub usa o manifesto atômico registrado neste lote.
- O smoke autenticado de PDF continua pendente por indisponibilidade de sessão controlável; nenhum dado financeiro foi criado ou alterado para fabricar evidência.
- O erro CNAB por EDI7 e decisões de recriação, vencimento, valor ou regra comercial não pertencem a este hotfix.

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
