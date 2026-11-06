# Publicação visual do Gestor — 4.8.248

## Objetivo e autorização

Publicar os ajustes visuais de Secretaria, Parceiros e Gestão apresentados nas prévias desta conversa. Autorização explícita do responsável: "publique", após recapitulação dos três módulos pendentes. Uma entrega coesa do padrão compacto do Portal do Gestor.

## Critérios de aceite

- Secretaria organizada em grupos, tipografia compacta e ícones centralizados verticalmente nas linhas.
- Parceiros com quatro cartões por linha em desktop amplo e ficha de aluno com cabeçalho, abas e campos mais leves.
- Gestão com entrada, filtros, cartões e cabeçalho/resumo das turmas de Técnicos, Livres, Especialização e EAD refinados.
- Informações, totais, filtros, consultas, permissões e operações preservados; nenhum documento, matrícula ou cobrança alterado.
- Sem dependências novas, migrations ou Edge Functions. Harnesses e artefatos temporários fora da publicação.

## Manifesto explícito

- `modules/gestor/secretaria/SecretariaPage.tsx`
- `modules/gestor/secretaria/components/SecretariaDashboard.tsx`
- `modules/gestor/parceiros/ParceirosPage.tsx`
- `modules/gestor/parceiros/components/ParceirosKpis.tsx`
- `modules/gestor/parceiros/components/ParceirosList.tsx`
- `modules/gestor/parceiros/components/cards/AlunoCard.tsx`
- `modules/gestor/parceiros/components/cards/ProfessorCard.tsx`
- `modules/gestor/parceiros/components/cards/PFCard.tsx`
- `modules/gestor/parceiros/components/cards/PJCard.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDetalhes.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoNavigation.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDados.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDisplayField.tsx`
- `modules/gestor/parceiros/aluno-card-typography.contract.test.ts`
- `modules/gestor/parceiros/parceiros-workspace.css`
- `modules/gestor/parceiros/components/viewparceiros/aluno/parceiro-profile.css`
- `ai/operacao/registros/alteracoes/2026-11-05-parceiros-compact-workspace.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `modules/gestor/gestao/GestaoPage.tsx`
- `modules/gestor/gestao/resumo/GestaoResumo.tsx`
- `modules/gestor/gestao/gestao-entry-workspace.css`
- `modules/gestor/gestao/components/TurmasFilters.tsx`
- `modules/gestor/gestao/components/TurmaCard.tsx`
- `modules/gestor/gestao/tecnicos/GestaoTecnicos.tsx`
- `modules/gestor/gestao/livres/GestaoLivres.tsx`
- `modules/gestor/gestao/especializacao/GestaoEspecializacao.tsx`
- `modules/gestor/gestao/ead/GestaoEad.tsx`
- `modules/gestor/gestao/components/gestao-catalog-workspace.css`
- `modules/gestor/gestao/tecnicos/detalhes/TurmaTecnicoDetalhes.tsx`
- `modules/gestor/gestao/livres/detalhes/TurmaLivreDetalhes.tsx`
- `modules/gestor/gestao/especializacao/detalhes/TurmaEspecializacaoDetalhes.tsx`
- `modules/gestor/gestao/ead/detalhes/TurmaEadDetalhes.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaResumo.tsx`
- `modules/gestor/gestao/ead/detalhes/components/EadStatCard.tsx`
- `modules/gestor/gestao/components/TurmaDetailsHeader.tsx`
- `modules/gestor/gestao/components/gestao-turma-details.css`
- `ai/operacao/registros/alteracoes/2026-11-05-gestao-compact-workspace.md`
- `ai/operacao/registros/alteracoes/2026-11-05-publicacao-visual-gestor-4-8-248.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

- `modules/gestor/components/GestorPortalShell.tsx`
- `modules/gestor/components/GestorPortalHeader.tsx`
- `modules/gestor/components/gestor-portal-scroll.contract.test.mjs`

Total: 44 arquivos.

## Validação e entrega

Base main remota: `1f73df9727c9019165acebfa43219f8da6eaad5d`. Fontes anteriores dos arquivos de produto conferidas via MCP GitHub. Prévia e CI devem corresponder ao manifesto deste registro.

Os lotes de Parceiros e Gestão registram lint, tipagem, contratos focados e smoke Safari desktop com dados sintéticos. Fechamento integrado aprovado: ESLint, TypeScript, build Node 24.22.1, 34 testes de acesso, 20 contratos focados e seis contratos de rolagem. Checagem de teto de linhas aprovada no candidato completo. Safari 390×744 conferiu Gestão (entrada, resumo EAD e rolagem), Secretaria (grupos, abrir Busca 360 e voltar) e Parceiros (cartões empilhados e abertura da ficha). PR e produção serão acompanhadas por MCP após envio deste manifesto. O workspace parcial possui arquivos ausentes fora deste lote; candidato isolado de base completa usado para tipagem/build. Nenhuma alteração desses outros domínios será enviada.

Conferência móvel detectou compensação duplicada do cabeçalho fixo. O scroller agora começa abaixo da barra móvel de 60px, com cabeçalho sticky no topo do próprio scroller e foco compensado por sua altura. Contrato de rolagem atualizado para proteger esse encaixe.

## Limites do smoke

Prévias com componentes reais e dados sintéticos; operações de escrita, financeiro e documentos não foram acionadas. Consulta autenticada em produção será apenas visual. Demais abas internas fora da alteração mantêm seus componentes e não tiveram smoke exaustivo.
