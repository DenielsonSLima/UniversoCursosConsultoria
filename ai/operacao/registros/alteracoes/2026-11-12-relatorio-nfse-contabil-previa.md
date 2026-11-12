# Relatório contábil NFS-e — prévia para aprovação

Status: prévias aprovadas pelo usuário e publicação autorizada. Preparação da versão 4.8.301 sobre main 39f7d41, preservando correção de município.
Smoke autenticado Safari pendente: MacBook offline. Publicação não concluída.

## Escopo

- Central de Relatórios: NFS-e Emitidas, por polo e geral exclusivo da matriz.
- Paisagem A4, duas linhas por nota, faixas alternadas por registro.
- Emissão, número, parceiro, chave completa, data do serviço, competência, CPF/CNPJ,
  tributação nacional, NBS, valor bruto, ISS/retido e polo.
- Totais no servidor: geral, tributação nacional, NBS e polo. Desconhecido não vira zero.
- XML autorizado é fonte fiscal; data do serviço é snapshot imutável da emissão.
- Somente emitidas ativas, retirando cancelamentos confirmados, período de emissão em America/Maceio.
- Consolidação exige matriz e autorização de todos os polos ativos da mesma empresa.
- Preview, download e impressão usam o mesmo Blob vetorial e cabeçalho canônico.
- Identidade e marca paisagem configuradas são carregadas por polo, com falha explícita se indisponíveis.

## Manifesto explícito

- `.github/workflows/nfse-regressions.yml`
- `modules/gestor/components/GestorModuleContent.tsx`
- `modules/gestor/relatorios/RelatoriosPage.tsx`
- `modules/gestor/relatorios/components/RelatoriosCatalog.tsx`
- `modules/gestor/relatorios/nfse/RelatorioNfse.tsx`
- `modules/gestor/relatorios/nfse/nfse-accounting.types.ts`
- `modules/gestor/relatorios/nfse/nfse-accounting.service.ts`
- `modules/gestor/relatorios/nfse/nfse-accounting.resources.ts`
- `modules/gestor/relatorios/nfse/nfse-accounting.pdf.ts`
- `modules/gestor/relatorios/nfse/nfse-accounting.fixture.ts`
- `modules/gestor/relatorios/nfse/nfse-accounting.pdf.test.mjs`
- `supabase/migrations/20261112121741_nfse_accounting_xml_fields.sql`
- `supabase/migrations/20261112121751_nfse_accounting_report.sql`
- `supabase/tests/nfse_accounting_report.isolated.test.mjs`
- `ai/operacao/registros/alteracoes/2026-11-12-relatorio-nfse-contabil-previa.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 19 arquivos

## Validação

- PGlite com parser XML real: 5 testes passaram (escopo, matriz, XML, total,
  canceladas, outra empresa, polo sem notas, datas, entidades e grants).
- PDF: 6 testes passaram (duas linhas, chaves completas, vetor, datas, desconhecidos,
  paginação, resumo, vazio e compositor institucional).
- TypeScript noEmit: passou sem diagnósticos.
- ESLint dos novos TS/TSX: passou.
- Build completo: passou.
- Prévia de ambos os modelos renderizada e inspecionada via MuPDF.
- Poppler apresentou fallback de fonte do ambiente; conferência MuPDF confirmou
  Helvetica normal, sem cortes/colisões. PDF mantém texto nativo e logo isolada.

## Pendente antes de produção

- Aprovação visual recebida; usuário autorizou publicar.
- Migrations aplicadas via MCP: 20261112121741 e 20261112121751. Contrato XML sintético remoto e bloqueio sem contexto verificados.
- Validar RPC no ambiente alvo com sessão autorizada e comportamento multi-polo.
- Smoke autenticado no Safari: abertura da Central, filtros, PDF/baixar/imprimir e
  mudança de escopo. Não executado neste container; fixtures não substituem esse smoke.
- Nenhuma nota emitida/cancelada, credencial alterada ou transação financeira.

## Verificação remota e publicação

- Rebase sobre 39f7d41 preserva 4.8.300 e correção do município do tomador.
- RPC STABLE, search_path vazio e timeout 30s; somente authenticated tem EXECUTE, com guarda interna de acesso/contexto/polo. Helper XML privado sem grants.
- Chamada sem contexto foi bloqueada com SQLSTATE 42501. Parser XML remoto sintético retornou valores esperados.
- Advisors antes/depois: nenhum novo alerta de search_path ou anon; um alerta esperado de authenticated SECURITY DEFINER documentado, necessário à leitura autorizada de tabelas privadas.
- Nenhuma emissão/cancelamento nem atualização de registros fiscais.
- MacBook offline impede smoke autenticado Safari; não substituir por outro navegador nem publicar sem a verificação.

- CI cobre novo PDF e SQL. O relatório usa PGlite 0.5.16 isolado para XML real, sem alterar a versão 0.3.14 dos contratos anteriores.
