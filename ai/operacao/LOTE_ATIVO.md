# Lote ativo

## Lote: 2026-10-08-ead-grade-certificado

Estado: validação da entrega 4.8.186; correção EAD e publicação autorizadas em 08/10/2026.
Objetivo/aceite: verso com os seis módulos; backend fornece conteúdo, ordem e páginas para Secretaria, aluno e reimpressão.
Causa: grade não fazia parte do snapshot da emissão; o adapter do certificado substituía o campo pela frase genérica.
Escopo: somente EAD. Modelo configurado, demais modalidades e liberação automática da entrega anterior preservados.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-10-08-ead-grade-certificado.md`.
Revisão: três agentes; backend, interface e revisão independente do PDF real.
Dados: complemento privado da grade ausente em dois certificados EAD finalizados, com curso inalterado desde a emissão, mantendo códigos, datas, nota, status e contadores.
Validação: SQL de emissão/complemento, contrato UI, PDF real do compositor, texto extraído, recursos e inspeção visual do verso; CI e Preview antes de publicar.
Limitação: sessão autenticada real indisponível; render de validação usa dados pessoais sintéticos e modelo configurado inventariado.

## Entregas anteriores preservadas

Certificação EAD 4.8.185: PR #278, produção publicada; dois certificados pendentes liberados e verificados. Registro `ai/operacao/registros/alteracoes/2026-10-08-ead-certificado-automatico.md`.
Financeiro do aluno 4.8.184: PR #277, produção publicada e verificada. Registro `ai/operacao/registros/alteracoes/2026-10-08-aluno-banese-identidade-desconto.md`.
Contrato 4.8.183: PR #276. Registro `ai/operacao/registros/alteracoes/2026-10-07-contrato-posicoes-qr-assinaturas.md`.
