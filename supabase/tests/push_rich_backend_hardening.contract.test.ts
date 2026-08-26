// @ts-nocheck -- contrato executado pelo Deno, fora do runtime TypeScript da aplicação.

const migrationUrl = new URL(
  "../migrations/20260804184017_harden_rich_push_queue_lifecycle.sql",
  import.meta.url,
);
const migration = await Deno.readTextFile(migrationUrl);
const cleanupMigration = await Deno.readTextFile(
  new URL(
    "../migrations/20260804190536_complete_push_asset_cleanup_worker.sql",
    import.meta.url,
  ),
);
const service = await Deno.readTextFile(
  new URL(
    "../../modules/gestor/comunicacao/notificacoes-push/notificacoes-push.service.ts",
    import.meta.url,
  ),
);
const page = await Deno.readTextFile(
  new URL(
    "../../modules/gestor/comunicacao/notificacoes-push/NotificacoesPushPage.tsx",
    import.meta.url,
  ),
);
const assetFunction = await Deno.readTextFile(
  new URL("../functions/push-notification-assets/index.ts", import.meta.url),
);
const dispatcherAssetRuntime = await Deno.readTextFile(
  new URL(
    "../functions/push-notification-dispatcher/push-assets.ts",
    import.meta.url,
  ),
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertMatch(value: string, pattern: RegExp, message: string) {
  assert(pattern.test(value), message);
}

Deno.test("campanha sem destinatários termina sem ficar queued ou scheduled", () => {
  assertMatch(
    migration,
    /when v_recipients = 0 then 'failed'[\s\S]*'reason',[\s\S]*'NO_ELIGIBLE_RECIPIENTS'/,
    "o enqueue deve persistir estado terminal e devolver o motivo canônico",
  );
  assertMatch(
    migration,
    /create trigger comunicacao_push_campanhas_require_jobs[\s\S]*guard_push_campaign_has_jobs/,
    "uma transição defensiva não pode deixar campanha ativa sem jobs",
  );
  assertMatch(
    migration,
    /ios_devices,[\s\S]*'draft', p_scheduled_at/,
    "a criação deve permanecer draft até o enqueue materializar os jobs",
  );
});

Deno.test("aniversário possui claim diário, índice e retries limitados", () => {
  assertMatch(
    migration,
    /create table if not exists public\.push_birthday_runs[\s\S]*run_date date primary key/,
    "cada data local precisa ter um único claim",
  );
  assertMatch(
    migration,
    /create index if not exists idx_parceiros_active_birthday[\s\S]*extract\(month from data_nascimento\)[\s\S]*extract\(day from data_nascimento\)/,
    "a seleção diária precisa usar índice de mês/dia para alunos ativos",
  );
  assertMatch(
    migration,
    /run\.status in \('pending', 'failed'\)[\s\S]*run\.attempts < 3[\s\S]*for update skip locked/,
    "o claim precisa ser concorrente e limitar tentativas",
  );
  const scheduledStart = migration.indexOf(
    "create or replace function public.enqueue_scheduled_push_notifications()",
  );
  const scheduledEnd = migration.indexOf(
    "-- Asset upload reservations",
    scheduledStart,
  );
  const scheduledRoutine = migration.slice(scheduledStart, scheduledEnd);
  assert(
    !scheduledRoutine.includes("data_nascimento") &&
      !scheduledRoutine.includes("'birthday'"),
    "a rotina transacional não deve fazer uma segunda varredura de aniversários",
  );
});

Deno.test("consentimento, política e aniversário são revalidados e cancelam o futuro", () => {
  assertMatch(
    migration,
    /create trigger push_notification_jobs_revalidate_claim[\s\S]*guard_push_notification_job_claim/,
    "todo claim precisa executar o predicado canônico",
  );
  for (
    const code of [
      "PUSH_POLICY_DISABLED",
      "PUSH_CATEGORY_DISABLED",
      "PUSH_MARKETING_CONSENT_REVOKED",
      "BIRTHDAY_PUSH_DISABLED",
      "BIRTHDAY_STUDENT_INELIGIBLE",
    ]
  ) {
    assert(
      migration.includes(code),
      `o predicado de claim deve falhar fechado com ${code}`,
    );
  }
  assertMatch(
    migration,
    /create trigger comunicacao_preferencias_cancel_invalid_push[\s\S]*create trigger push_notification_policies_cancel_invalid_jobs[\s\S]*create trigger push_birthday_settings_cancel_invalid_jobs/,
    "mudanças nas três fontes de autorização precisam cancelar jobs materializados",
  );
  assertMatch(
    migration,
    /where inbox\.source_job_id = new\.id[\s\S]*inbox\.visible_at > now\(\)/,
    "a caixa futura associada ao job cancelado precisa ser arquivada",
  );
});

Deno.test("progresso canônico usa alunos e o frontend apenas exibe", () => {
  assertMatch(
    migration,
    /sent_count \+ failed_count \+ skipped_count = processed_count/,
    "os resultados precisam ser mutuamente exclusivos na mesma unidade",
  );
  assertMatch(
    migration,
    /create or replace function public\.comunicacao_push_campanhas_listar_v3[\s\S]*recipient_count integer[\s\S]*processed_count integer[\s\S]*progress_percent integer/,
    "o RPC precisa devolver denominador, processados e percentual canônicos",
  );
  assert(
    service.includes("comunicacao_push_campanhas_listar_v3"),
    "o frontend deve consumir o RPC canônico",
  );
  assert(
    page.includes("campaign.progressPercent") &&
      !page.includes("Math.round((handled / campaign.eligibleDevices)"),
    "a tela deve renderizar o percentual sem recalcular unidades",
  );
});

Deno.test("upload reserva quota atômica e registra metadados com a reserva", () => {
  assertMatch(
    migration,
    /pg_advisory_xact_lock[\s\S]*requested_at >= now\(\) - interval '10 minutes'[\s\S]*v_recent_requests >= 10/,
    "a janela de dez uploads deve ser serializada por gestor",
  );
  assertMatch(
    migration,
    /created_at >= now\(\) - interval '30 days'[\s\S]*v_recent_assets >= 100/,
    "assets recentes também precisam de teto persistente",
  );
  assert(
    assetFunction.includes("comunicacao_push_asset_upload_autorizar_v2") &&
      assetFunction.includes("comunicacao_push_asset_upload_registrar") &&
      !assetFunction.includes(
        '.from("push_notification_assets")\n      .insert',
      ),
    "a Edge Function precisa consumir a reserva em vez de inserir metadados diretamente",
  );
});

Deno.test("cleanup só enfileira assets antigos e sem qualquer referência", () => {
  assertMatch(
    migration,
    /asset\.created_at < now\(\) - interval '30 days'[\s\S]*not public\.push_notification_asset_is_referenced\(asset\.id\)/,
    "a retenção deve proteger imagens recentes",
  );
  for (
    const table of [
      "comunicacao_push_campanhas",
      "push_birthday_settings",
      "push_notification_jobs",
      "aluno_notificacoes",
    ]
  ) {
    assert(
      migration.includes(`from public.${table}`),
      `cleanup precisa revalidar referência em ${table}`,
    );
  }
  assertMatch(
    migration,
    /'storageDeleted', false[\s\S]*create or replace function public\.claim_push_notification_asset_cleanup/,
    "o cron deve apenas enfileirar; remoção do Storage exige worker e confirmação",
  );
  assertMatch(
    migration,
    /if public\.push_notification_asset_is_referenced\(v_queue\.asset_id\)[\s\S]*'ASSET_BECAME_REFERENCED'/,
    "o worker deve revalidar referências imediatamente antes de confirmar",
  );
});

Deno.test("cleanup reativa filas terminais e possui consumidor com revalidação", () => {
  assertMatch(
    cleanupMigration,
    /on conflict \(asset_id\) do update[\s\S]*status = 'pending'[\s\S]*attempts = 0[\s\S]*status in \('cancelled', 'completed'\)/,
    "assets novamente órfãos precisam reativar a fila terminal",
  );
  assertMatch(
    cleanupMigration,
    /create or replace function public\.revalidate_push_notification_asset_cleanup[\s\S]*status <> 'processing'[\s\S]*push_notification_asset_is_referenced/,
    "o worker precisa revalidar lease, estado e referências por RPC",
  );
  assertMatch(
    cleanupMigration,
    /create trigger comunicacao_push_campanhas_asset_ready[\s\S]*create trigger push_birthday_settings_asset_ready[\s\S]*create trigger push_notification_jobs_asset_ready[\s\S]*create trigger aluno_notificacoes_asset_ready/,
    "novas referências não podem correr contra a remoção do Storage",
  );
  assert(
    dispatcherAssetRuntime.includes("claim_push_notification_asset_cleanup") &&
      dispatcherAssetRuntime.includes(
        "revalidate_push_notification_asset_cleanup",
      ) &&
      dispatcherAssetRuntime.includes(
        "complete_push_notification_asset_cleanup",
      ),
    "o dispatcher agendado precisa consumir claim, revalidar e concluir cleanup",
  );
});
