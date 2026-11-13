# Portal do aluno — interface compacta

## Objetivo e autorização

Aplicar o padrão compacto da gestão ao acesso do aluno, priorizando celular e as ações de estudar, pagar e obter documentos. O usuário solicitou revisão com três agentes, prévia local e, depois, autorizou expressamente GitHub e produção. Entrega 4.8.333, revisão 342, publicada pela [PR424](https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/424), merge `3882478317aaed8c4a277ab17ff41631bf3d50ae` em `main`; a base 4.8.332 foi preservada.

## Etapas da entrega

1. Início e navegação: cartões leves, fontes regulares, continuação em um toque e Documentos imediatamente após Financeiro. Barra móvel com Início, Meus cursos, Financeiro, Documentos e Mais.
2. Meus cursos: lista e detalhes compactos, busca, filtros, progresso, fixação e acesso EAD preservados.
3. Cursos e inscrição: catálogo, seletores pesquisáveis e diálogos compactos, com rolagem e rodapé de pagamento visível.
4. Financeiro: totais legíveis, agrupamento recolhível, valor/vencimento/ação antes dos detalhes, Pix e boleto prioritários e retorno acessível.
5. Documentos: carteirinha entre os documentos rápidos para aluno elegível; pedidos e identificação com abas compactas, seletor próprio e retorno explícito.
6. Sala EAD: etapas horizontais menores no celular, prova antes da lista lateral, alternativas acessíveis e conclusão/certificado com ações existentes.

Professor, geradores PDF, banco, Auth, autorização, contratos acadêmicos, cálculos e operações financeiras permanecem fora do lote visual.

## Contratos preservados

- O destino da navegação continua `secretaria`; a aba de documentos pessoais do perfil não foi reutilizada.
- Handlers, IDs, elegibilidade, bloqueios, códigos de validação, dados de cobrança, checkout e estados pendentes existentes foram preservados.
- BolePix permanece o mesmo título; nenhum QR, cobrança, pagamento, matrícula, prova ou certificado real foi criado como teste.
- Novo CSS dos cursos atua somente em tela e exclui a área do certificado; blocos de impressão e compositores permanecem iguais.
- Checkout, confiança EAD e demais alterações paralelas são preservados e não constituem escopo funcional desta entrega.

## Validação e limites

- Três agentes revisaram navegação, visual e celular; revisões cruzadas não encontraram bloqueadores funcionais após corrigir a quebra de valores em telas estreitas.
- Tipagem focada do manifesto aprovada. Compilações focadas e ESLint das frentes aprovados; cinco testes de checkout e um de expiração aprovados.
- Suíte de interface Banese: 34/35; falha de contrato preexistente em ordenação de campos de `modules/ead/asaas.service.ts`, fora do manifesto visual.
- Prévia offline temporária com componentes reais e dados sintéticos em `http://127.0.0.1:4786`; sem ligação com produção.
- Safari: desktop, 390/320 px; navegação, menu/Escape/teclado, fixação, documentos/pedidos, cobrança, sala EAD e prova simulada de dez questões exercitados. Certificado da simulação apenas registra ação de download.
- Smoke autenticado de aluno e documentos oficiais permanece pendente por ausência de sessão útil; a prévia não comprova autorização, liquidação bancária, emissão documental ou latência real.
- Build completo aprovado com Node24.22.1, ESLint do manifesto e teto de500 linhas aprovados. Os 12/12 workflows da árvore final `6bc8d393031bf8e07900e0a1bdc6fc8e51730d33` concluíram com sucesso, incluindo [Qualidade do produto](https://github.com/DenielsonSLima/UniversoCursosConsultoria/actions/runs/43360728488) e Documentos e grade do aluno.
- [Deploy 4.8.333 de produção](https://vercel.com/denielson-limas-projects/universo-cursos-consultoria/AtdDg3WuDn7Hwt2cVPxATghyYKF5) `dpl_AtdDg3WuDn7Hwt2cVPxATghyYKF5` READY, sem erro de alias, pronto em 13/11/2026 às 00:50:41 (America/Maceio), no commit do merge. A conferência MCP Vercel de 13/11 confirmou a entrega no histórico; a produção ativa já avançou para 4.8.334 pela PR425, que preserva o portal compacto. O domínio público e seu bundle principal responderam HTTP200 com a versão4.8.334. Smoke autenticado permanece pendente conforme descrito acima.
- O hook do Início apenas expõe indicadores de carregamento já disponíveis; não houve alteração de query, cálculo ou payload.

## Manifesto explícito

Total: 33 arquivos.

- `modules/aluno/components/AlunoPortalShell.tsx`
- `modules/aluno/components/mobile/AlunoMobileBottomNav.tsx`
- `modules/aluno/inicio/InicioPage.tsx`
- `modules/aluno/inicio/components/AlunoDesktopHome.tsx`
- `modules/aluno/inicio/components/AlunoHomePanels.tsx`
- `modules/aluno/inicio/components/AlunoMobileHome.tsx`
- `modules/aluno/secretaria/components/mobile/AlunoMobileSecretaria.tsx`
- `modules/aluno/secretaria/components/AlunoIdentityDocuments.tsx`
- `modules/aluno/turmas/TurmasPage.tsx`
- `modules/aluno/turmas/components/AlunoTurmasList.tsx`
- `modules/aluno/turmas/components/mobile/AlunoMobileCourseCard.tsx`
- `modules/aluno/turmas/components/TurmaDetail.tsx`
- `modules/aluno/turmas/components/turma-detail/CertificateTab.tsx`
- `modules/aluno/financeiro/AlunoFinanceiroSummary.tsx`
- `modules/aluno/financeiro/components/mobile/AlunoMobileFinanceSummary.tsx`
- `modules/aluno/financeiro/FinanceiroCardItem.tsx`
- `modules/aluno/financeiro/AlunoFinanceiroFilters.tsx`
- `modules/aluno/financeiro/banese/BanesePaymentPage.tsx`
- `modules/aluno/financeiro/banese/components/BanesePixPanel.tsx`
- `modules/aluno/financeiro/banese/components/BaneseBoletoPanel.tsx`
- `modules/aluno/financeiro/banese/components/BanesePaymentHeader.tsx`
- `modules/aluno/cursos/components/CourseCatalogView.tsx`
- `modules/aluno/cursos/components/CourseCatalogGrid.tsx`
- `modules/aluno/cursos/components/EadCourseRoom.tsx`
- `modules/aluno/cursos/components/EadLearningContent.tsx`
- `modules/aluno/cursos/components/aluno-courses-compact.css`
- `modules/aluno/financeiro/FinanceiroPage.tsx`
- `ai/operacao/registros/alteracoes/2026-11-13-aluno-interface-compacta.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `modules/aluno/inicio/useAlunoHomeData.ts`
- `internal/versioning/changelog/2026-11-08-versao-4-8-265.md`
