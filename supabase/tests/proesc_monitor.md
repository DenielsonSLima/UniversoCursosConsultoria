# Validação isolada da Consulta API Proesc

Execute cada arquivo por uma chamada MCP Supabase separada. Não concatene os
arquivos nem coloque todas as RPCs em um único bloco DO. Cada unidade usa uma
transação somente leitura, timeout de 3 segundos e ROLLBACK.

1. `proesc_monitor.readonly.sql`: autorização negativa e contratos inválidos;
   as chamadas devem ser rejeitadas antes de consultar os dados financeiros.
2. `proesc_monitor_dashboard.readonly.sql`: uma chamada válida de dashboard.
3. `proesc_monitor_runs.readonly.sql`: uma página de execuções.
4. `proesc_monitor_observations.readonly.sql`: uma página de observações.
5. `proesc_monitor_settlements.readonly.sql`: uma página de baixas comprovadas.
6. `proesc_monitor_errors.readonly.sql`: uma página de erros sanitizados.

Execute uma unidade por vez, com o painel sem polling paralelo. Ao receber
57014, pare e registre qual unidade falhou; não aumente o timeout nem repita
o conjunto. Meça separadamente a RPC afetada antes de continuar.

As unidades usam a identidade Auth real vinculada ao configurador da integração.
Não presumem que o UUID de usuarios_sistema seja o UUID de auth.users.
O teste de mascaramento adicional depende das permissões dessa identidade;
quando ela possui acesso financeiro, esse ramo não substitui teste com perfil
restrito. Nenhum teste consulta o token ou chama a API externa.

`proesc_execution_ledger.transaction.sql` é um ensaio separado com alterações
revertidas por ROLLBACK. Requer autorização explícita, lease livre e exclusividade;
não faz parte das unidades somente leitura e não deve rodar junto ao worker.
