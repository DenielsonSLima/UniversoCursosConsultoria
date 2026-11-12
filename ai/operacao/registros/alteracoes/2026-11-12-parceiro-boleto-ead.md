# Boletos EAD no cadastro do aluno

## Objetivo e autorização
Usuário solicitou botão Abrir em nova aba para boleto EAD no cadastro do aluno, inclusive usuários institucionais sem financeiro, e autorizou publicar após revisão. Não emitir, cancelar, baixar nem enviar cobranças.

## Escopo
- UI Parceiros > aluno > Financeiro: RPC mínima, totais canônicos e botão condicionado à capacidade do servidor.
- RPC de leitura com modalidade EAD, matrícula e polo válidos; histórico legado permanece sob RLS existente.
- Edge PDF existente recebe exceção restrita de leitura EAD; demais regras bancárias preservadas.
- Cache isolado por usuário/contexto/polo/aluno; popup síncrono sem opener, cancelamento ao sair e revogação de Blob.

## Validação
- Fotos fornecidas inspecionadas; causa: tabela sem ação e leitura sem contrato restrito EAD.
- Testes focados UI/popup/hidratação, contrato Edge e SQL isolado.
- TypeScript, ESLint e build aprovados antes de publicação; CI final controla integração.
- Smoke autenticado Safari pendente se computador do usuário estiver offline; não substituir por resultado automatizado.

## Manifesto
`modules/gestor/components/GestorModuleContent.tsx`, `modules/gestor/parceiros/ParceirosPage.tsx`, arquivos `ParceiroAlunoDetalhes`, `ParceiroAlunoFinanceiro`, `EadBoletoButton`, `ead-boleto-tab`, `parceiro-aluno-financeiro.service` e testes em `modules/gestor/parceiros/components/viewparceiros/aluno/`; `supabase/functions/banese-boleto-document/{index,ead-read-access,ead-read-access.test}.ts`; migration `20261112123418_partner_ead_boleto_read.sql`; teste `supabase/tests/partner_ead_boleto_read.pglite.mjs`; registro e versão4.8.302.

## Implantação de backend
Migration aplicada via MCP com versão remota `20261112123418`; arquivo local renomeado para corresponder exatamente à história remota, sem reaplicar SQL. Edge `banese-boleto-document` v24 ACTIVE/JWT. Contrato remoto de leitura validou identidade institucional, retorno EAD, resumo, negação de aluno inexistente e execução anônima. Nenhuma cobrança emitida/cancelada/alterada.
