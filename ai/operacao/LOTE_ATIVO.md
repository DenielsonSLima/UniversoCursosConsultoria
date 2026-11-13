# Lote ativo

## Lote: 2026-11-13-sincronizacao-fontes-publicadas
Objetivo: completar o GitHub com fontes fiscais já aplicadas e atualizar os comprovantes de publicação recentes.
Status: revisão das diferenças e correspondência com produção concluídas; entrega operacional 4.8.335, revisão 344, sujeita aos gates da PR e à conferência do deploy associado.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-13-sincronizacao-fontes-publicadas.md`.
Base confirmada: 4.8.334, main b82b04a412050e2d3defe0ec450e7e83094e0e44, produção READY e HTTP 200. Confiança EAD ativada em 13/11 às 01:08:48 de Maceió.
Aceite do usuário: revisar e conferir antes de atualizar o projeto, corrigindo as pendências identificadas na conferência com três agentes.
Entrega: três migrations administrativas imutáveis, dois testes e registro da importação externa; comprovantes finais de Pix, portal compacto e confiança EAD; versão e manifestos correspondentes.
Guarda: não reaplicar migrations, modificar dados, emitir/cancelar documentos ou cobranças, nem reimplantar funções Edge. Sem sessão de navegador controlada. Nenhuma sincronização ampla do checkout ou integração de PRs históricos.
Validação: hashes locais e SQL do ledger coincidentes; testes fiscais sintéticos em PGlite; versão/histórico, teto de 500 linhas, revisão independente, CI e Preview. Migrations de 11–13/11: 138/138 presentes por nome em produção.
Limite: smoke autenticado dos fluxos existentes permanece pendente; disponibilidade HTTP e assets não o substituem. Evidências finais de GitHub e Vercel ficam associadas à PR desta entrega.
