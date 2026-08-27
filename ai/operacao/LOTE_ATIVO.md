# Lote ativo

Estado: `PUBLICADO_PARCIAL_BACKEND_BANESE_AGUARDANDO_DEMAIS_ETAPAS`

## Lote: 2026-08-26-carnes-alunos-e-baixa-rapida

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
