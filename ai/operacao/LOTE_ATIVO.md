# Lote ativo

## Lote: 2026-10-09-contrato-identidade-segunda-via

Estado: implementação revisada; aguardando CI/Preview.
Aceite: CIN individual sem duplicação CPF/RG no contrato; CPF e RG legados conforme cadastro;
declarações antigas e novas com segunda via PDF fiel, sem erro da camada de texto.
Base: 4.8.192, commit 638f21a377f85e382dcf52495e551cdc3e65f5a5.
Escopo: identidade canônica do contrato e PDF de declarações matrícula/cursando.
Backend: snapshot novo com tipo documental; projeção de leitura de contratos antigos,
preservando cláusulas, financeiro, código, datas, auditoria e documentos assinados.
PDF: modelo cadastrado, texto vetorial, mesmo Blob na prévia/download/impressão.
Dispatcher browser separado do compositor nativo compatível com Deno.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-10-09-contrato-identidade-segunda-via.md`.
Validação: SQL 11/11, consulta 7/7, PDF contrato 3/3 e declaração 4/4;
declaração validada em origem HTTPS controlada até o término da impressão sem erro;
três contratos reais conferidos, registros originais e advisors preservados.
Limitação: Safari autenticado e impressora física indisponíveis no ambiente.
Publicação: GitHub MCP, CI e Preview antes do merge autorizado pelo usuário.

## Entregas anteriores preservadas

4.8.192: crachá PDF, consulta CIE atual e dias na grade, PR #285.
4.8.191: identidade das declarações e PDF EAD, PR #284.
4.8.190: login por matrícula acadêmica, PR #283.
