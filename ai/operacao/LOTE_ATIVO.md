# Lote ativo

## Lote: 2026-10-09-login-matricula-academica

Estado: validação da entrega 4.8.190; correção de login autorizada.
Aceite: matrícula acadêmica do cadastro acessa a mesma conta, inclusive sem e-mail pessoal.
Causa: o resolvedor consultava apenas a matrícula de acesso separada.
Escopo: resolução no backend; alias antigo preservado e ambiguidades recusadas.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-10-09-login-matricula-academica.md`.
Banco: migration 20261009112324 aplicada; RPC somente service_role e search_path vazio.
Validação: 17 testes focados e autenticação nativa real pelo identificador acadêmico.
Credencial: ajuste individual autorizado, sem dados pessoais no repositório.
Limitação: navegador Safari autenticado indisponível; verificação real ocorreu no backend.
Publicação: revisão de três agentes, CI e Preview antes do merge autorizado.

## Entregas anteriores preservadas

4.8.189: carteirinha e fundos; PR #282. 4.8.188: identidade e PDF EAD; PR #281.
4.8.187–184: modelo e grade EAD, emissão automática, Banese e desconto.
