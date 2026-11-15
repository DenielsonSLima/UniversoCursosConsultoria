# Lote ativo

## Lote: 2026-11-15-seletor-contas-rolagem-saldo
Objetivo: estabilizar a rolagem do seletor de contas nos pagamentos/recebimentos e mostrar saldo na primeira linha de cada opção.
Status: envio ao GitHub e prévia autorizados pelo usuário; preparação isolada da versão 4.8.342. Produção permanece sem autorização.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-15-seletor-contas-rolagem-saldo.md`.
Aceite: hover e atualização das opções preservam rolagem; teclado revela somente dentro da lista; saldo canônico aparece ao lado da conta, incluindo zero/negativo e ausência explícita.
Validação: reprodução autenticada no Safari; patch validado em fixture local do modal real no Safari, com atualizações automáticas, busca, teclado, saldos e ambos os fluxos. Teste interativo, tipagem focada, lint, auditoria de linhas e build na base remota isolada aprovados.
Lote anterior publicado: NFS-e 4.8.341 pela PR #431; registro `ai/operacao/registros/alteracoes/2026-11-14-nfse-servico-pos-emissao.md`.
