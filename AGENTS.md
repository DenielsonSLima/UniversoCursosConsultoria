# Instrucoes Do Agente

## Regra Critica De Git E GitHub

Neste projeto, operacoes remotas de GitHub devem ser realizadas somente por MCP.

- Nao execute `git ...` nem `gh ...` para publicar, criar branch, commit, push ou pull request.
- Use o conector MCP do GitHub para leitura, criacao de branch, commit atomico e pull request.
- Antes de publicar, preserve alteracoes paralelas e inclua somente os arquivos do escopo solicitado.
- Na ausencia do MCP GitHub, interrompa a publicacao e informe o bloqueio; nao use CLI como alternativa.

## Regra Critica De Supabase

Neste projeto, Supabase e somente via MCP.

- Nao execute nenhum comando `supabase ...`, nem para consulta, listagem, ambiente local, migrations, status, link, db push/start/reset ou deploy de Edge Functions.
- Use MCP Supabase para banco, migrations, logs, Auth, Storage, RLS e Edge Functions.
- Se a CLI aparecer como caminho possivel, descarte e procure a ferramenta MCP equivalente.
- Erro `401 Unauthorized` da Supabase CLI nao e bloqueio quando o MCP estiver disponivel.

## Regras Duraveis Da Integracao Financeira

- Novas cobrancas usam apenas Banese para boleto/Pix e Mercado Pago para cartao.
- Banese nao processa cartao. O Pix Banese permanece bloqueado em homologacao e so pode ser ativado em producao depois da liberacao formal do banco.
- A API Banese e o fluxo principal. CNAB240 e contingencia operacional e exige o codigo EDI7 real; nunca invente esse codigo.
- O Banese retorna dados do titulo, nao o PDF final. Boleto e carne sao montados pelo sistema e entregues por rota privada/autenticada.
- Asaas e Banco Inter nao podem ser selecionados para novas cobrancas. Preserve dados, webhooks e rotinas estritamente necessarios para auditoria e encerramento seguro de historico.
- Mercado Pago permanece bloqueado para cobranca real ate a homologacao completa do cartao, webhook, idempotencia e recuperacao de criacao ambigua.
- Pagamento confirmado ativa automaticamente EAD, curso livre e especializacao. Curso tecnico permanece aguardando analise documental mesmo depois da baixa financeira.
- Calculos financeiros, validacoes de valor e regras de juros, multa e desconto pertencem ao backend. O frontend apenas coleta entradas e exibe o resultado canonico.
- Alteracoes de consultas devem preservar invalidacao do TanStack Query e atualizacao por Realtime.
