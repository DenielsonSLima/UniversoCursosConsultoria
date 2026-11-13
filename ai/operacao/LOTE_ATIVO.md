# Lote ativo

## Lote: 2026-11-12-caixa-servicos-nfse-pdf-resumido
Objetivo: classificar Serviços NFS-e realizados no Caixa e oferecer PDF Completo ou Resumido em modal de tela cheia.
Status: implementação e validação local concluídas; candidato 4.8.328 em CI para PR empilhada sobre Serviços 4.8.327.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-12-caixa-servicos-nfse-pdf-resumido.md`.
Base: Serviços 4.8.327, commit 0f9bf4b8f458067467ff79ee3e9f6a74cde0180b (PR #416), herdando PIX 4.8.325, retorno fiscal 4.8.326 e Auth/EAD publicados.
Aceite: recebimentos e pagamentos parciais canônicos sem dupla soma, isolamento por polo, Completo preservado, Resumido integral em até duas páginas e mesmo snapshot/Blob.
Validação: SQL isolado, regressões Caixa, smoke DOM dedicado, extração nativa, recursos e render de PDFs sintéticos; TypeScript e teto de linhas aprovados.
Estado remoto: três migrations Caixa aplicadas via MCP; Serviços dependente publicado com dezesseis migrations, quatro Edges e worker ativo. Nenhuma emissão, cobrança ou baixa real usada como teste.
Limitações: sem navegador; inspeção interativa autenticada mantida com o usuário no acesso local.
