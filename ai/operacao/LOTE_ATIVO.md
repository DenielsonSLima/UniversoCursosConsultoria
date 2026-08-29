# Lote ativo

Estado: `CONCLUIDO`

## Lote: 2026-08-29-conciliacao-banese-importados-radiologia

- Pedido: apurar os erros da conciliação/baixa automática Banese, distinguir histórico de turma, importações legadas e os 13 títulos recuperados; consultar recebimentos de Radiologia entre 26 e 29/08 e publicar a correção no GitHub.
- Registro: `ai/operacao/registros/alteracoes/2026-08-29-conciliacao-banese-importados-radiologia.md`.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-08-29-conciliacao-banese-importados-radiologia.md`.
- Autorização: o usuário autorizou expressamente a correção financeira em produção e a atualização completa do GitHub.
- Risco: crítico, por envolver seleção de conciliação, persistência de baixa, migrations e histórico financeiro.

### Resultado confirmado

1. O histórico puro das turmas não entra na fila Banese.
2. A conciliação exclui importações `BANESE_API_LEGACY_DISCOVERY`, sem modificar títulos, transações ou baixas existentes.
3. A persistência reconhece o `service_role` transportado pelo worker em `request.jwt.claims`; não amplia acesso de usuários.
4. Dos 300 boletos de Radiologia importados pela API Banese e dos 12 importados pelo portal legado, nenhum recebeu baixa entre 26 e 29/08/2026.
5. Os 13 títulos recuperados permanecem em quarentena para retentativa controlada; não houve reemissão, cancelamento nem baixa automática neste lote.

### Fechamento

- As migrations `20260829194500` e `20260829194600` foram aplicadas e validadas diretamente no banco.
- A publicação GitHub usa exclusivamente o manifesto do registro e preserva alterações paralelas.
