# Lote ativo

Estado: `PRONTO_PARA_PUBLICACAO`

## Lote: 2026-08-07-documentos-secretaria-calendario

- Estado: PRONTO_PARA_PUBLICACAO
- Objetivo: Transformar a minuta de contrato de aluno em modelo editável e emissão segura; disponibilizar carteira de preceptor para professores; e gerar/exportar calendário de aulas a partir da grade da turma, preservando marca d'água, QR Code e padrões documentais.
- Escopo incluído: análise da minuta e da referência visual, Modelos de Documentos, Secretaria, Calendário, QR Code/validação, serviços/hooks/query keys, banco/RPC/RLS/Realtime estritamente necessários, templates editáveis, emissões individual/lote/personalizada, documentação de planejamento e memória/RAG.
- Fora de escopo: cálculos/regras no frontend, alteração dos dados acadêmicos existentes sem RPC, e substituição de modelos não relacionados.
- Regras/RPC/segurança aplicáveis: Supabase/GitHub exclusivamente por MCP; identificação, elegibilidade, composição, dados de validação, QR Code e emissão de lote ficam no backend/RPC; frontend coleta opções e exibe retorno; permissões por módulo/aba e polo; TanStack Query/Realtime com invalidação de escopo mínimo; arquivos emitidos por rota autenticada.
- Critérios de aceite: contrato disponível como modelo padrão editável e emissível para modalidades elegíveis, com QR verificável; carteira de preceptor disponível como modelo e emissão somente para professores; calendário filtra modalidade/turma, gera a partir da grade canônica e exporta no padrão visual aprovado; todos suportam individual, lote e personalizado quando aplicável; estados de carregamento/erro/vazio e validação visual funcionam sem cálculos no browser.
- Arquivos previstos: planejamento em `ai/operacao/planejamentos/`, migrations/RPCs, tipos, módulos isolados de Modelos/Secretaria/Calendário, templates, testes focados, registros e memória.
- Validações focadas: revisão de contrato visual e estrutural, testes de contratos/RPC/RLS, testes de query keys e filtros, renderização de documentos/PDFs, lint focado e build uma única vez no fechamento.
- Validação final: testes de contrato PDF vetorial (3/3), validação pública (26/26), calendário (4/4), contratos SQL/RPC (6/6), validação documental (124/124), lint e build concluídos. A auditoria nativa confirmou A4, texto extraível e ausência de imagem de página inteira; o calendário também abre o mesmo Blob na prévia, download e impressão. Falta somente a conferência do commit/Preview antes da Produção.
- Publicação prevista: usuário autorizou expressamente nesta conversa. Publicar um único commit atômico por MCP GitHub, com PR/merge controlado e uma Preview Vercel do lote completo; após confirmar a Preview, promover o mesmo conteúdo para Produção.
- Responsável pela consolidação: Codex, após reunião interna com três frentes delimitadas.
- Pendências ou riscos: o modelo técnico exige aprovação auditada deliberada antes de novas emissões; Livre e Superior permanecem em revisão jurídica, sem emissão. A minuta não será copiada para RAG/logs; QR aponta apenas para validação canônica sem dados pessoais. O lote aguarda apenas as validações finais e a publicação autorizada.

## Lote: 2026-08-06-operacao-memoria-rag

- Estado: PRONTO_PARA_VALIDACAO
- Objetivo: Implantar memória canônica, recuperação RAG restrita, registros de lote e protocolo único de publicação para todos os agentes.
- Escopo incluído: `AGENTS.md`, `ai/operacao/`, marcadores de legado em `ai/`, skill global do Codex, scripts de RAG e sincronização OpenContext.
- Fora de escopo: produto do portal, dados acadêmicos/financeiros, migrations, Edge Functions e produção.
- Regras/RPC/segurança aplicáveis: GitHub e Supabase exclusivamente por MCP; corpus sem segredos ou dados pessoais; frontend continua sem regras/cálculos canônicos.
- Critérios de aceite: busca local retorna fontes citáveis; índice é limitado ao manifesto; OpenContext recebe cópia sincronizável; todos os agentes recebem o protocolo pelo `AGENTS.md`; há registros separados de alterações, commits e deploys.
- Arquivos previstos: documentação operacional, scripts e `.gitignore`.
- Validações focadas: testes dos scripts RAG e de sincronização aprovados; pesquisa lexical de amostra retornou a memória canônica; skill global validada.
- Validação final: TypeScript/lint não se aplicam aos Markdown; build de produto não é necessário porque não há alteração de produto.
- Publicação prevista: commit `70e52473c852707d179783ae0d23156281167023`, PR #61 aberta como rascunho e uma Preview Vercel concluída com sucesso. Produção não autorizada.
- Responsável pela consolidação: Codex.
- Pendências ou riscos: embeddings semânticos externos dependem de `OPENAI_API_KEY` aprovada; a camada lexical já está ativa. A PR #61 permanece aberta como rascunho, portanto este lote não deve ser marcado como publicado/mesclado.

## Lote: 2026-08-06-patrimonio-contas-a-pagar-emprestimos

- Estado: PRONTO_PARA_VALIDACAO
- Objetivo: Criar o módulo Patrimônio por polo, transformar Despesas em Contas a Pagar, adicionar rateio canônico às Contas a Pagar e permitir empréstimos rateados pela Matriz ou próprios de cada polo, refletindo obrigações/custos corretamente no Caixa.
- Escopo incluído: banco/RPC/RLS/Realtime necessários, `modules/gestor/patrimonio/`, Financeiro, Caixa, query keys, testes focados, registros e documentação operacional. O complemento atual inclui: rateio genérico de Contas a Pagar com um título e uma baixa integral na Matriz; empréstimo da Matriz com rateio; e empréstimo próprio do polo sem rateio.
- Fora de escopo: produção, cálculo financeiro no frontend, migração de dados históricos não compatível e alteração dos gateways de cobrança.
- Regras/RPC/segurança aplicáveis: Supabase/GitHub exclusivamente por MCP; valores, rateio, parcelas, baixas e indicadores do Caixa são canônicos no backend/RPC; frontend apenas coleta/exibe; isolamento por empresa e polo; TanStack Query e Realtime preservados.
- Critérios de aceite: patrimônio cadastra, busca e alterna card/tabela por polo; Contas a Pagar substitui a nomenclatura de Despesas sem quebrar dados; uma Conta a Pagar lançada pela Matriz pode ratear seu custo para todos ou polos selecionados sem criar títulos/baixas duplicados; empréstimo da Matriz usa apenas `TODOS`/`SELECIONADOS`, enquanto empréstimo do polo usa somente `SEM_RATEIO` e gera Conta a Pagar/baixa apenas nele; salários/obrigações podem permanecer em aberto e ter desdobramento opcional; Caixa separa financiamento de custo operacional; estados de loading/erro/vazio e atualizações em tempo real funcionam.
- Arquivos previstos: migrations, RPCs, tipos gerados, services/hooks/componentes do Gestor, páginas Financeiro/Caixa, testes e registros.
- Validações focadas: `npm run test:caixa-report` (20/20), `npm run test:gestor-access` (30/30), `npm run test:financeiro-rpc` (6/6), testes Deno de empréstimos (9/9), lint focado dos módulos aprovado, verificação de RPC/RLS/índices/Realtime pelo MCP Supabase e revisão independente do lote aprovadas.
- Validação final: build de `2.3.0-beta.1` aprovado após o complemento de rateio em Contas a Pagar e empréstimos por polo. As migrations `20260807035000`, `20260807035500`, `20260807036000` e `20260807037000` foram aplicadas pelo MCP Supabase. O TypeScript amplo mantém um erro pré-existente, fora do lote, em `tmp/pdfs/review-caixa/real-report-harness.tsx`.
- Publicação prevista: um commit atômico, uma PR e uma Preview Vercel; produção somente por solicitação explícita.
- Responsável pela consolidação: Codex, com três frentes técnicas fechadas.
- Pendências ou riscos: a publicação web ainda não foi feita; deve ser um único commit/PR/Preview contendo somente o manifesto deste lote. Perfis personalizados precisam receber explicitamente as novas permissões de Patrimônio e Empréstimos quando forem usados; a sessão deve ser renovada para o menu refletir a alteração. Não havia empréstimos legados no banco no fechamento, portanto o backfill de escopo de rateio não alterou histórico. O rateio genérico de Contas a Pagar não pode alterar o pagamento físico nem criar uma segunda obrigação para os polos. As RPCs antigas de empréstimo permanecem sem `EXECUTE` para usuários autenticados para não contornar o escopo Matriz/polo.

Abra um novo bloco abaixo antes de alterar produto, infraestrutura, banco, publicação ou documentação operacional relevante.

```md
## Lote: AAAA-MM-DD-identificador-curto

- Estado: PLANEJADO | EM_EXECUCAO | PRONTO_PARA_VALIDACAO | PUBLICADO | BLOQUEADO
- Objetivo:
- Escopo incluído:
- Fora de escopo:
- Regras/RPC/segurança aplicáveis:
- Critérios de aceite:
- Arquivos previstos:
- Validações focadas:
- Validação final:
- Publicação prevista: PR / Preview / Produção
- Responsável pela consolidação:
- Pendências ou riscos:
```
