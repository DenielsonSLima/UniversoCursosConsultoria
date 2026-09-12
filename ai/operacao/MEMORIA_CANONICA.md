# Memória canônica do projeto

Atualizada em: 2026-09-12

## Finalidade

Este arquivo é um índice curto de contexto durável. Ajustes rápidos não precisam lê-lo. Detalhes de domínio ficam nas políticas específicas e são carregados somente quando a tarefa os envolve.

## Operação

- AGENTS.md define a classificação entre ajuste rápido, mudança padrão e mudança crítica.
- LOTE_ATIVO.md contém somente um lote corrente; históricos ficam em ai/operacao/registros/.
- Um agente é o padrão. Delegação só ocorre para frentes independentes e materialmente úteis.
- A validação deve exercer o fluxo real afetado antes de build ou suítes amplas.
- Regras globais não são acrescentadas durante hotfix de produto.

## Arquitetura e qualidade

- O frontend React/TypeScript/Vite coleta intenção e apresenta o retorno canônico.
- Regras acadêmicas, financeiras, autorização, elegibilidade, valores e paginação pertencem ao backend/RPC quando aplicável.
- TanStack Query e Realtime usam invalidação pelo menor escopo afetado.
- O teto arquitetural é de 500 linhas físicas por arquivo manual. Todo arquivo tocado acima disso deve ser modularizado no próprio lote; a adoção é incremental pelos manifestos auditados.
- Migrations já aplicadas permanecem imutáveis mesmo acima do teto. Novas migrations devem ser divididas antes da aplicação quando a separação for tecnicamente segura; gerados, lockfiles, binários e terceiros ficam fora da contagem.
- Testes-fonte e migrations permanecem no repositório mesmo depois de executados.
- tmp, caches, relatórios e PDFs/PNGs de QA são regeneráveis e podem ser limpos.

## Políticas condicionais

- PDFs gerados pelo produto: politicas/PDFS_OFICIAIS.md
- Supabase e segurança: politicas/SUPABASE_E_SEGURANCA.md
- Financeiro: politicas/FINANCEIRO.md
- Plano de Curso: politicas/PLANO_CURSO.md
- Interface: politicas/INTERFACE.md
- Entrega e publicação: PROTOCOLO_DE_LOTES.md

## RAG

- Fontes padrão: AGENTS.md, esta memória, lote corrente, protocolo, políticas e docs/decisions/.
- Registros históricos não entram no corpus padrão.
- search lê somente o índice existente e nunca grava ou reindexa.
- index é executado explicitamente uma vez no fechamento de lote relevante.
- Embeddings e OpenContext são opcionais e nunca bloqueiam a operação.

## Entrega financeira publicada — 2026-09-12 (4.8.47)

- PR 141: squash e026a0f56c301f86ba9aee30c263042d97ff1631; Vercel success e versão pública 4.8.47 confirmada. GitHub Actions ficou QUEUED sem runner; não confundir testes locais aprovados com CI concluído.
- Banese reconhece o próximo dia útil nacional comprovado de 2026, sem alterar os termos. Título revisado da Radiologia pago por R$ 260,00 em 08/09/2026.
- Composição Proesc exige prova compatível com principal, recebido e data; evidência posterior conflitante invalida a prova. Desconhecido permanece nulo. Duas provas históricas foram gravadas com desconto de R$ 19,90 cada e recebíveis preservados.
- Auditoria da T42 após essas provas: 346 vínculos, 204 pagos, 142 abertos, R$ 53.813,57 recebidos. A importação de outras turmas possui lote e conferência próprios; não inferir cobertura de ciclos pelo número da turma.
- Registro: registros/alteracoes/2026-09-12-revisao-banese-proesc.md.

## Importação Proesc por XLS — 2026-09-12

- Cadastros por CPF canônico preservam pessoas existentes; estado acadêmico pertence à matrícula, não ao cadastro global. Reuso em outro polo acrescenta visibilidade sem mover o polo original.
- A fonte XLS comprova cadastro, turma e situação acadêmica; os pagamentos são conferidos pela API. Turno, data final, ID nativo e cobertura financeira não são inferidos quando ausentes.
- Etapa aplicada: 385 pessoas (382 novas, 3 reutilizadas), quatro turmas INTEGRAL de Japoatã e 207 matrículas; histórico com 2.940 cobranças e 1.854 pagamentos, total recebido de R$ 470.746,72. Cinco turmas SEM aguardam turno e um cadastro aguarda CPF.
- Cobertura financeira é individual e permanece em revisão até prova suficiente. Sincronizar pagamento confirmado não autoriza criar outro ciclo ou boleto. T42 e Radiologia mantêm as regras existentes.
- Fechamento local 4.8.48 em validação; não presumir publicação ou CI concluídos. Registro: registros/alteracoes/2026-09-12-proesc-importacao-xls.md.
