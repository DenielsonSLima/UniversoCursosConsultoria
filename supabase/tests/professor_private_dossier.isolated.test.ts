import { PGlite } from 'npm:@electric-sql/pglite@0.3.14';
import {
  ACTOR,
  dossierFixture,
  OTHER_PROFESSOR,
  PROFESSOR,
} from './professor_private_dossier.fixture.ts';

type Json = Record<string, any>;
const assert = (condition: unknown, label: string) => {
  if (!condition) throw new Error(label);
};

Deno.test('dossiê privado: solicitações, versões, revisão, replay e barreiras de acesso reais', async (t) => {
  const db = new PGlite();
  const operate = async (
    action: string,
    payload: Json,
    requestId = crypto.randomUUID(),
    professorId = PROFESSOR,
  ) =>
    (await db.query<{ value: Json }>(
      'SELECT public.gestor_operar_documento_professor($1,$2,$3,$4) value',
      [professorId, action, JSON.stringify(payload), requestId],
    )).rows[0].value;
  const list = async (professorId = PROFESSOR, offset = 0) =>
    (await db.query<{ value: Json }>(
      'SELECT public.gestor_listar_documentos_professor($1,$2,20) value',
      [professorId, offset],
    )).rows[0].value;
  const denied = async (operation: () => Promise<unknown>, label: string) => {
    let failed = false;
    try {
      await operation();
    } catch {
      failed = true;
    }
    assert(failed, label);
  };
  const request = crypto.randomUUID();
  const solicitation = {
    nome: 'Diploma informado',
    categoria: 'formacao',
    instrucao: 'Frente e verso.',
  };
  let documentId = '';
  let reserved: Json;
  try {
    await db.exec(dossierFixture);
    for (
      const name of [
        '20261114033433_professor_private_dossier_schema',
        '20261114033440_professor_private_dossier_rpc',
      ]
    ) {
      await db.exec(await Deno.readTextFile(new URL(`../migrations/${name}.sql`, import.meta.url)));
    }
    await t.step(
      'não presume documentos obrigatórios; criar é auditado e idempotente',
      async () => {
        assert((await list()).total === 0, 'Dossiê inicia vazio');
        documentId = (await operate('solicitar', solicitation, request)).documentoId;
        assert(
          (await operate('solicitar', solicitation, request)).documentoId === documentId,
          'Replay retorna o mesmo ID',
        );
        const panel = await list();
        assert(
          panel.total === 1 && panel.pendentes === 1 && panel.itens[0].status === 'pendente',
          'Pendência explícita',
        );
        const events = (await db.query<{ ator_id: string }>(
          'SELECT ator_id FROM public.professor_documentos_eventos',
        )).rows;
        assert(
          events.length === 1 && events[0].ator_id === ACTOR,
          'Uma auditoria com identidade canônica',
        );
      },
    );
    await t.step('replay recusa payload, ator ou escopo alterados', async () => {
      await denied(
        () => operate('solicitar', { ...solicitation, nome: 'Alterado' }, request),
        'Payload imutável',
      );
      await db.exec(`SELECT set_config('test.actor','${OTHER_PROFESSOR}',false)`);
      await denied(() => operate('solicitar', solicitation, request), 'Replay de outro ator');
      await db.exec(
        `SELECT set_config('test.actor','${ACTOR}',false),set_config('test.allowed','false',false)`,
      );
      await denied(() => operate('solicitar', solicitation, request), 'Autoriza antes de replay');
      await denied(() => list(), 'Leitura sem módulo/polo recusada');
      await db.exec(
        "SELECT set_config('test.allowed','true',false),set_config('test.actor','',false)",
      );
      await denied(
        () => operate('solicitar', solicitation, request),
        'Anônimo recusado antes de replay',
      );
      await denied(() => list(), 'Anônimo não lista');
      await db.exec(`SELECT set_config('test.actor','${ACTOR}',false)`);
      await denied(() => list(OTHER_PROFESSOR), 'Outro polo não lista');
    });
    await t.step(
      'validação de entrada e vínculo não permitem anexar a outro professor',
      async () => {
        await denied(
          () => operate('solicitar', { ...solicitation, categoria: null }),
          'Categoria nula',
        );
        await denied(() =>
          operate('reservar', {
            documentoId: documentId,
            nome: 'a.exe',
            mimeType: 'application/octet-stream',
            tamanho: 10,
          }), 'MIME bloqueado');
        await denied(() =>
          operate('reservar', {
            documentoId: documentId,
            nome: 'a.pdf',
            mimeType: 'application/pdf',
            tamanho: 10485761,
          }), 'Limite 10 MB');
        await denied(() =>
          operate('reservar', {
            documentoId: documentId,
            nome: 'a.pdf',
            mimeType: 'application/pdf',
            tamanho: 0,
          }), 'Arquivo vazio');
        await denied(() =>
          operate('reservar', {
            documentoId: OTHER_PROFESSOR,
            nome: 'a.pdf',
            mimeType: 'application/pdf',
            tamanho: 10,
          }), 'Documento alheio');
      },
    );
    await t.step(
      'reserva privada e confirmação verificam o objeto real antes da análise',
      async () => {
        reserved = await operate('reservar', {
          documentoId: documentId,
          nome: 'diploma.pdf',
          mimeType: 'application/pdf',
          tamanho: 42,
        });
        assert(
          reserved.bucket === 'documentos-professores' &&
            reserved.path.startsWith(`${PROFESSOR}/${documentId}/`),
          'Caminho derivado no servidor',
        );
        const payload = { documentoId: documentId, arquivoId: reserved.id };
        await denied(() => operate('confirmar', payload), 'Objeto ausente não conclui');
        await db.exec('SET ROLE authenticated');
        await db.query('INSERT INTO storage.objects(bucket_id,name,metadata) VALUES($1,$2,$3)', [
          reserved.bucket,
          reserved.path,
          JSON.stringify({ size: 41, mimetype: 'application/pdf' }),
        ]);
        await db.exec('RESET ROLE');
        await denied(() => operate('confirmar', payload), 'Tamanho incompatível não conclui');
        await db.exec(
          'UPDATE storage.objects SET metadata = \'{"size":42,"mimetype":"image/png"}\'',
        );
        await denied(() => operate('confirmar', payload), 'MIME incompatível não conclui');
        await db.exec(
          'UPDATE storage.objects SET metadata = \'{"size":42,"mimetype":"application/pdf"}\'',
        );
        const confirmation = crypto.randomUUID();
        await operate('confirmar', payload, confirmation);
        await operate('confirmar', payload, confirmation);
        const panel = await list();
        assert(
          panel.emAnalise === 1 && panel.itens[0].arquivos.length === 1,
          'Envio real em análise',
        );
        assert(panel.itens[0].arquivoAtualId === reserved.id, 'Versão atual canônica');
      },
    );
    await t.step(
      'revisão exige versão atual e motivo; novo envio preserva versões e auditoria',
      async () => {
        const payload = {
          documentoId: documentId,
          arquivoId: reserved.id,
          status: 'recusado',
          observacao: '',
        };
        await denied(() => operate('revisar', payload), 'Recusa exige motivo');
        const reviewId = crypto.randomUUID();
        await operate('revisar', { ...payload, observacao: 'Verso ilegível.' }, reviewId);
        await operate('revisar', { ...payload, observacao: 'Verso ilegível.' }, reviewId);
        assert((await list()).itens[0].status === 'recusado', 'Reenvio solicitado');
        const next = await operate('reservar', {
          documentoId: documentId,
          nome: 'diploma-novo.png',
          mimeType: 'image/png',
          tamanho: 50,
        });
        await db.query('INSERT INTO storage.objects(bucket_id,name,metadata) VALUES($1,$2,$3)', [
          next.bucket,
          next.path,
          JSON.stringify({ size: 50, mimetype: 'image/png' }),
        ]);
        await operate('confirmar', { documentoId: documentId, arquivoId: next.id });
        await denied(
          () => operate('revisar', { ...payload, status: 'aprovado' }),
          'Revisão antiga não aprova arquivo novo',
        );
        await operate('revisar', {
          documentoId: documentId,
          arquivoId: next.id,
          status: 'aprovado',
          observacao: '',
        });
        const panel = await list();
        assert(
          panel.aprovados === 1 && panel.itens[0].arquivos.length === 2,
          'Duas versões preservadas',
        );
        assert(
          panel.itens[0].historico.length === 5,
          'Histórico não perde eventos nem duplica replay',
        );
      },
    );
    await t.step('RLS do Storage prevalece sobre política legada permissiva', async () => {
      await db.exec('SET ROLE authenticated');
      assert(
        (await db.query('SELECT * FROM storage.objects')).rows.length === 2,
        'Gestor autorizado lê versões',
      );
      await db.exec("SELECT set_config('test.allowed','false',false)");
      assert(
        (await db.query('SELECT * FROM storage.objects')).rows.length === 0,
        'Outro escopo não lê arquivos',
      );
      await denied(
        () =>
          db.exec(
            "INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('documentos-professores','arbitrario','{}')",
          ),
        'Caminho sem reserva bloqueado',
      );
      await db.exec("SELECT set_config('test.allowed','true',false)");
      assert(
        (await db.query('DELETE FROM storage.objects RETURNING name')).rows.length === 0,
        'Não apaga histórico',
      );
      assert(
        (await db.query("UPDATE storage.objects SET metadata='{}' RETURNING name")).rows.length ===
          0,
        'Não substitui versões',
      );
      assert(
        (await db.query('SELECT * FROM public.professor_documentos')).rows.length === 1,
        'Tabela de Realtime segue RLS',
      );
      await denied(
        () => db.exec("UPDATE public.professor_documentos SET status='aprovado'"),
        'Sem DML direto',
      );
      await db.exec('RESET ROLE');
      await db.exec("SET ROLE anon; SELECT set_config('test.actor','',false)");
      assert(
        (await db.query('SELECT * FROM storage.objects')).rows.length === 0,
        'Anônimo não lê bucket privado',
      );
      await denied(
        () =>
          db.exec(
            "INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('documentos-professores','arbitrario','{}')",
          ),
        'Anônimo não envia',
      );
      assert(
        (await db.query('DELETE FROM storage.objects RETURNING name')).rows.length === 0,
        'Anônimo não apaga',
      );
      assert(
        (await db.query("UPDATE storage.objects SET metadata='{}' RETURNING name")).rows.length ===
          0,
        'Anônimo não substitui',
      );
      await db.exec('RESET ROLE');
    });
  } finally {
    await db.close();
  }
});
