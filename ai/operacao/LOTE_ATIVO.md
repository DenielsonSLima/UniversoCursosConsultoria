# Lote ativo
## Lote: 2026-09-27-caixa-workspace-v2-redesign
Estado: ETAPA 2 APLICADA — PUBLICAÇÃO AUTORIZADA
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-27-caixa-workspace-v2-redesign.md`
- Etapa 0 confirmou o baseline remoto de dez RPCs atuais do Caixa sem escrever no Supabase.
- Etapa 1 fechou o contrato semântico e o wireframe responsivo da mesa de tesouraria.
- Todo cálculo financeiro, percentual, projeção, classificação e paginação permanece no backend/RPC.
- A Etapa 2 criou e validou o núcleo privado e os contratos tipados do Workspace v2.
- As duas migrations foram aplicadas e verificadas no Supabase; o core permanece privado, sem `EXECUTE` para papéis clientes e sem impacto visual neste checkpoint.
- O usuário autorizou publicar o lote atômico no GitHub como versão 4.8.122.
- O próximo checkpoint continua sendo o wrapper seguro por escopo, sem cutover antecipado da interface.
