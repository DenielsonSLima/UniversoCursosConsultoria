import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const migration = readFileSync(resolve(
  root,
  'supabase/migrations/20260930200000_add_photo_to_turma_students_rpc.sql',
), 'utf8');

test('RPC de alunos da turma inclui a foto sem alterar a função interna', () => {
  assert.match(migration, /drop function if exists public\.get_turma_alunos_academico\(uuid\)/);
  assert.match(migration, /returns table\(\s*matricula_id uuid,\s*aluno_id uuid,\s*nome text,\s*cpf text,\s*data_nascimento date,\s*data_matricula timestamp with time zone,\s*status text,\s*frequencia_percent numeric,\s*tem_lancamentos_academicos boolean,\s*pode_remover boolean,\s*foto_url text\s*\)/);
  assert.match(migration, /partner\.foto_url/);
  assert.match(migration, /internal_academic\.p1_get_turma_alunos_academico_20260719\(p_turma_id\)/);
  assert.match(migration, /join public\.parceiros partner on partner\.id = roster\.aluno_id/);
  assert.match(migration, /order by roster\.nome/);
});

test('RPC preserva autorização, endurecimento e grants mínimos', () => {
  assert.match(migration, /can_operate_turma_academics\(p_turma_id\)/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path to ''/);
  assert.match(migration, /using errcode = '42501'/);
  assert.match(migration, /from public, anon, authenticated, service_role/);
  assert.match(migration, /to authenticated, service_role/);
});
