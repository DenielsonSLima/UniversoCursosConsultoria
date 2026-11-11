# NFS-e: consulta de disponibilidade

## Pedido, escopo e aceite

Implementar evidência real para o indicador compacto de Produção, pesquisando o
serviço oficial. Publicação solicitada pelo usuário. Nenhuma emissão, cancelamento,
cadastro, numeração ou dado financeiro deve ser alterado. Mudança crítica por
RPC interna, Edge e publicação; preserva a entrega 4.8.290.

## Fontes e limite da evidência

- Manual oficial dos contribuintes, §1.4, página 4:
  https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf
  documenta GET /dps/{id}, que consulta chave de nota existente mediante certificado
  de um ator. HEAD também existe, mas o GET reutiliza o transporte já implantado.
- Diretório oficial dos ambientes:
  https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao
- Não foi encontrado endpoint oficial geral de saúde. O monitor Serpro anuncia
  reformulação e não oferece evidência utilizável para esta verificação.
- Swagger atual não acessível nesta execução. O envelope estrito tipoAmbiente=1 e
  chaveAcesso exata acompanha o contrato já usado pelo runtime de produção. O manual
  confirma rota/finalidade, mas não detalha esse envelope. Formato inesperado é neutro.
- Verde significa que uma consulta nacional própria foi respondida corretamente nos
  últimos 60 segundos. Não garante emissão, elegibilidade, todos os serviços ou SEFAZ.

## Implementação e segurança

- RPC interna seleciona uma nota própria já autorizada. Leitura autorizada por
  ator/contexto/polo/ambiente; somente service_role, search_path vazio, timeout 8s.
- Edge exige JWT e getUser, reautoriza cada pedido mesmo em cache, aceita somente
  escopo estrito e nunca aceita chave/DPS/certificado fornecidos pelo navegador.
- Certificado e canal existentes são usados somente no servidor; emissor e validade
  são conferidos. Nenhuma credencial é retornada ou registrada em logs.
- Uma única consulta GET oficial por observação. Sem callback que permita POST
  fiscal; nenhum XML é criado, enviado, alterado ou devolvido.
- Cache sanitizado por ator/contexto/polo/ambiente/mês, coalescência e TTL de 60s,
  máximo 200 entradas, limite 8 pedidos/IP/minuto e timeout 10s nos RPCs do probe.
- HTTP 5xx recebido do governo é vermelho. Falhas de relay/rede/certificado,
  401/403/404/429, ausência de referência e dados inesperados ficam neutros.
- Erros internos do emissor continuam vermelhos com descrição própria. Frontend
  consulta somente em Produção, sem retry, a cada minuto em primeiro plano.
  Verde expira sozinho. Homologação e mudança nas Configurações permanecem intactas.

## Validação e pendências

- Cinco testes Deno do probe/handler; parser e validade; isolamento SQL/PGlite;
  interação DOM com expiração; fluxo diário integrado: aprovados localmente.
- ESLint focado e TypeScript estrito da Edge aprovados. CI executa testes sem rede
  fiscal, tipos, build e versão sobre o candidato antes de promover.
- Revisão independente de autorização, sigilo, somente leitura e cache sem P1/P2;
  oito verificações reexecutadas e aprovadas pelo revisor.
- Smoke autenticado real e resposta verde real não executados: Safari sem sessão
  disponível no Mac offline. O usuário fará conferência visual posteriormente.
  Fixtures sintéticas não são tratadas como prova de disponibilidade em produção.
- Aplicação remota exige conferir ACL, guarda negativa e contrato de referência
  sem devolver dados fiscais. Nenhuma consulta real deve emitir ou cancelar nota.

## Manifesto explícito

Total: 18 arquivos

- `.github/workflows/nfse-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-11-nfse-consulta-disponibilidade.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/emissor-nfse/EmissorNfsePage.tsx`
- `modules/gestor/emissor-nfse/components/NfseEnvironmentStatus.tsx`
- `modules/gestor/emissor-nfse/components/NfseEnvironmentStatus.interaction.test.mjs`
- `modules/gestor/emissor-nfse/health/nfse-health.contract.ts`
- `modules/gestor/emissor-nfse/health/nfse-health.contract.test.ts`
- `modules/gestor/emissor-nfse/health/useNfseNationalHealth.ts`
- `supabase/functions/nfse-national-health/index.ts`
- `supabase/functions/nfse-national-health/handler.ts`
- `supabase/functions/nfse-national-health/probe.ts`
- `supabase/functions/nfse-national-health/health.test.ts`
- `supabase/migrations/20261111113000_nfse_health_reference.sql`
- `supabase/tests/nfse_health_reference.isolated.test.mjs`
