# Lote ativo

## Lote: 2026-10-08-ead-certificado-automatico

Estado: implementação e validação da entrega 4.8.185; correção, publicação e liberação dos certificados EAD pendentes autorizadas pelo usuário em 08/10/2026.
Objetivo/aceite: aprovação acadêmica EAD gera certificado finalizado com validação, sem preparação de número, livro ou página; prévia EAD ocupa a tela por portal.
Escopo: somente EAD. Critérios acadêmicos e emissão permanecem no backend; outras modalidades conservam o finalizador anterior.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-10-08-ead-certificado-automatico.md`.
Revisão: três agentes, com frentes de backend, interface e revisão independente/backfill.
Dados: dois certificados EAD pendentes elegíveis no inventário restrito, ambos com aprovação confirmada. Liberação exige conjunto exato revisado, locks e comparação de evidências; nenhuma emissão em massa por status.
Validação: testes SQL do fluxo real, smoke de interface com dados sintéticos, revisão de isolamento por modalidade e CI/Preview antes de publicar.
Limitação: sessão real autenticada de aluno/gestor indisponível; o smoke sintético é registrado separadamente da verificação de produção.

## Entregas anteriores preservadas

Financeiro do aluno 4.8.184: PR #277, produção publicada e verificada; registro `ai/operacao/registros/alteracoes/2026-10-08-aluno-banese-identidade-desconto.md`.
Contrato 4.8.183: PR #276; registro `ai/operacao/registros/alteracoes/2026-10-07-contrato-posicoes-qr-assinaturas.md`.
Financeiro 4.8.182: PR #275; registro `ai/operacao/registros/alteracoes/2026-10-07-aviso-c2-antes-do-assistente.md`.
Restauração T46: PR #274; registro `ai/operacao/registros/alteracoes/2026-10-07-restauracao-c1-t46.md`. Não reaplicada neste lote.
