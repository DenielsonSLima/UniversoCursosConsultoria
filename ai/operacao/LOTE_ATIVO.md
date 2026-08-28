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

- A reunião técnica separou definitivamente os dois fluxos: 312 títulos históricos importados de Radiologia, válidos sem Pix, e 13 emissões próprias da Adenize que exigem Pix oficial.
- Os 312 históricos permaneceram intactos na faixa 9356–9715, todos com Nosso Número, linha de 47 dígitos, código de barras de 44 dígitos e uma transação; nenhum foi enviado ou reenviado.
- Os 13 recebíveis da Adenize foram recuperados automaticamente: 12 parcelas de R$ 279,90 e uma rematrícula de R$ 100,00 agora possuem Nosso Número exclusivo, linha, barras, payload/imagem Pix, termos confirmados e uma única transação.
- A sequência de produção foi restaurada ao piso comprovado 9715 e avançou sem colisão até 9728. Toda emissão nova executa preflight GET antes do POST e só persiste a resposta bancária compatível.
- Tela e relatório priorizam o rótulo `Rematrícula`; o fluxo não apresenta mais esse lançamento como `Parcela 0`.
- Títulos Banese existentes sempre oferecem `Abrir`; o ramo `Enviar/Reenviar ao banco` não é exibido para históricos nem para títulos já registrados.
- Worker, gateway e documentos mantêm isolamento por título, persistência atômica, locks, CAS e validação de identidade bancária.

### Produção e pendências

- `banese-reconciliation-worker` v54 concluiu os 13 alvos; `asaas-api` v89, `payment-gateway-api` v18, `payment-checkout` v22, `checkout-api` v17, `dependencia-banese-checkout` v9, `banese-cancellation-worker` v2 e `secretaria-banese-document-groups` v3 estão `ACTIVE`.
- As migrations `20260828093000_enable_banese_collision_preflight_allocation` e `20260828094000_recover_unlinked_banese_incident_titles` foram aplicadas após as migrations anteriores do hotfix.
- A migration local `20260827172000_register_banese_boletos_adenize_cycle2.sql`, que atribuía identidades sem prova bancária, foi excluída do lote, ignorada explicitamente e nunca será publicada no GitHub.
- A emissão Banese está habilitada em produção com consulta preventiva de colisão. O reconciliador geral permanece pausado para não consultar em massa os 225 históricos enfileirados; isso não bloqueia abertura, PDF, carnê nem novas emissões.
- Foram aprovados 257 testes focados, TypeScript `--noEmit`, `deno check`, contratos de boleto/carnê e auditoria remota dos 312 históricos e 13 títulos Adenize.
- O smoke autenticado de clique permanece limitado pela ausência de sessão reutilizável no navegador controlado; a origem de produção redirecionou ao login e nenhuma credencial foi extraída ou usuário artificial criado.
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
