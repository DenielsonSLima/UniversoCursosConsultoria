# Proesc V2: candidatos anteriores

## [4.8.196-rc.3] - 2026-10-09

- Prepara migration atômica com ativação desligada, preservando a continuidade dos hashes de evidência.
- Valida rollback integral quando um leitor ou escritor diverge e executa o arquivo real em PostgreSQL 17 descartável.
- Instalação, validação do histórico e ativação continuam dependendo de autorização específica.

## [4.8.196-rc.2] - 2026-10-09

- Inclui no inventário exato o leitor de revisão do Caixa encontrado no catálogo, sem alterar sua regra financeira.
- Amplia testes com RLS/ACL observadas, gatilhos reais dos snapshots e concorrência entre página e chave OFF.
- Mantém a implantação e a ativação bloqueadas até autorização própria; não altera dados de produção.

## [4.8.196-rc.1] - 2026-10-09

- Candidato de revisão para compartilhar payloads Proesc V2 repetidos, preservando observações por execução e evidência financeira.
- Validação isolada de SQL, concorrência PostgreSQL 17 e arquivo recuperável com dados sintéticos.
- Recursos permanecem desligados; não aplica migrations, não envia arquivos ao Storage e não remove histórico de produção.


## [4.8.196-rc.4] - 2026-10-09

- Registra instalação autorizada da estrutura e validação dos vínculos Proesc V2, mantendo a escrita canônica desligada.
- Concilia os nomes dos arquivos com as versões atribuídas pelo MCP, preservando o SQL já aplicado.
- Testa a migration de validação efetiva; ativação, Storage e remoção continuam pendentes de autorização.
- Candidatos anteriores: [RC.1 a RC.3](./2026-10-09-proesc-v2-candidatos-rc1-a-rc3.md).

## [4.8.197-rc.1] - 2026-10-10

- Prepara Storage privado gzip com readback/restauração, exportador V2 limitado e catálogo copy-only em draft local.
- Mantém upload real, políticas, buckets e limpeza fora desta etapa; testes não acessam a conta de Storage.
- Registra ativação autorizada do reaproveitamento Proesc; acompanhamento do FULL natural permanece aberto.

## [4.8.198-rc.1] - 2026-10-10

- Prepara endpoint backend V2 copy-only com autenticação existente, SDK pinado, prazos e restauração verificada.
- Inclui roteiro de instalação e piloto único; deploy, grants e cópia real dependem de aprovação específica.
- Preserva o lote paralelo de recebimento no extrato da turma e mantém o acompanhamento do FULL natural.

## [4.8.198-rc.2] - 2026-10-10

- Limita explicitamente a descompressão gzip do backend copy-only em runtimes Deno antigos e atuais.
- Mantém o teste de arquivo expansivo e a restauração em memória antes do recibo, sem relaxar os limites.
- Preserva a preparação do piloto privado e os gates de instalação, deploy e cópia real.
