# Lote ativo

## Lote: 2026-11-10-nfse-certificado-runtime-edge

Corrigir a validação A1 após a publicação 4.8.281, removendo dependência de APIs X509 ausentes no Deno 2.1.4. Preservar interface, senha UTF-8, confiança, CNPJ, validade, credenciais e bloqueio de emissão.

Mudança crítica por segurança/Edge/publicação. Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-10-nfse-certificado-runtime-edge.md`. Base main 678b4264f00df6f6ea48c6b01992450f3395c49c, versão 4.8.281, revisão 290; candidata 4.8.282, revisão 291. Quinze testes sintéticos passaram em Deno 2.1.4 e 2.9.6; tipos do index/testes passaram no atual. CI do SHA final, Preview e implantação deste lote pendentes. Novo job 2.1.4 preserva CI atual; modo node-modules-dir=none ainda exige confirmação no runner limpo. Smoke Safari autenticado indisponível com o computador offline. Somente certificados sintéticos; sem senha real, migrações ou permissões novas. A publicação deve observar a autorização do novo lote e PR.
