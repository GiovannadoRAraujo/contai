/**
 * Ambiente isolado para validar as migrações do contAI.
 * PGlite = PostgreSQL em WASM, em memória. Nada toca o banco remoto.
 *
 * Reproduz o mínimo do Supabase necessário: schema `extensions`, schema `auth`
 * com `auth.users` e `auth.uid()`, e os papéis anon / authenticated / service_role.
 */
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Caminho relativo a este arquivo, para a suíte rodar de qualquer diretório.
const MIG = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function novoBanco() {
  const db = await PGlite.create({ extensions: { pg_trgm } });

  // --- Infra que o Supabase já fornece -------------------------------------
  await db.exec(`
    create schema if not exists extensions;
    create schema if not exists auth;

    -- Papéis do Supabase
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
    end $$;

    grant usage on schema public to anon, authenticated, service_role;
    grant usage on schema extensions to anon, authenticated, service_role;

    -- Privilégios padrão do Supabase no schema public (o ponto de partida real,
    -- que a migração 003 precisa revogar)
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

    create table if not exists auth.users (
      id uuid primary key default gen_random_uuid(),
      email text,
      raw_user_meta_data jsonb default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
    grant usage on schema auth to authenticated, anon;

    -- auth.uid() lê a claim 'sub' do JWT, como no Supabase
    create or replace function auth.uid() returns uuid
    language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid;
    $$;
    grant execute on function auth.uid() to anon, authenticated;

    -- Esqueleto do Storage: o suficiente para criar bucket e políticas
    create schema if not exists storage;
    create table if not exists storage.buckets (
      id text primary key, name text not null, public boolean default false,
      file_size_limit bigint, allowed_mime_types text[]
    );
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text references storage.buckets (id),
      name text not null,
      owner uuid
    );
    alter table storage.objects enable row level security;
    create or replace function storage.foldername(name text) returns text[]
    language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    grant usage on schema storage to authenticated, anon;
    grant select, insert, update, delete on storage.objects to authenticated;
    grant execute on function storage.foldername(text) to authenticated;
  `);

  // --- Migrações do projeto, na ordem dos nomes dos arquivos ---------------
  const arquivos = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
  const aplicadas = [];
  for (const f of arquivos) {
    const sql = readFileSync(join(MIG, f), 'utf8');
    try {
      await db.exec(sql);
      aplicadas.push({ arquivo: f, ok: true });
    } catch (e) {
      aplicadas.push({ arquivo: f, ok: false, erro: e.message });
      throw Object.assign(new Error(`FALHA em ${f}: ${e.message}`), { aplicadas });
    }
  }
  return { db, aplicadas };
}

/**
 * Executa como um usuário autenticado específico (papel + claim sub).
 * Usa configuração de SESSÃO (set_config com `false`), não `set local`:
 * fora de uma transação explícita, `SET LOCAL` não teria efeito.
 */
export async function comoUsuario(db, userId, fn) {
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ]);
  await db.exec(`set role authenticated;`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role;`);
    await db.query(`select set_config('request.jwt.claims', '', false)`);
  }
}

/** Executa como visitante não autenticado. */
export async function comoAnonimo(db, fn) {
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ role: 'anon' })]);
  await db.exec(`set role anon;`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role;`);
    await db.query(`select set_config('request.jwt.claims', '', false)`);
  }
}

/** Captura o erro de uma operação que deve falhar. */
export async function deveFalhar(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    return e.message.split('\n')[0];
  }
}
