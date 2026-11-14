# Lote ativo

## Lote: 2026-11-14-nfse-servico-pos-emissao
Objetivo: NFS-e de serviço autorizada navega para Emitidas e abre prévia; alunos mantêm fluxo atual.
Status: publicação no GitHub e produção autorizada expressamente pelo usuário; preparação da 4.8.341, revisão 350.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-14-nfse-servico-pos-emissao.md`.
Aceite: uma navegação por autorização, lote integral de serviços, última nota na prévia; isolamento por escopo, identidade canônica e negativas de aluno/misto/falha/cancelamento/acesso.
Validação: 15 testes focados aprovados, revisão independente e teto de 500 linhas; TypeScript/ESLint aprovados na base isolada.
Limitação: teste DOM com serviços sintéticos e fronteira do visualizador; nenhuma nota real emitida no smoke.
Lote anterior: Caixa publicado pela PR #430 na 4.8.340, revisão 349; registro `ai/operacao/registros/alteracoes/2026-11-14-caixa-pdfs-e-link-credito.md`.
