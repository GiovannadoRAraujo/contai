-- =============================================================================
-- contAI — migração 004: sincronização entre aparelhos (login opcional)
--
-- O app continua local-first (IndexedDB). Quem cria uma conta passa a espelhar
-- os registros nesta tabela genérica: uma linha por registro do app, com o JSON
-- do registro, a data de modificação (para "a alteração mais recente vence") e
-- uma marca de exclusão (tombstone), para que exclusões também se propaguem.
--
-- As tabelas tipadas das migrações 001–003 continuam existindo e intactas,
-- mas não são usadas pelo app atual: o modelo de dados mudou (documentos,
-- regras, correções, memória do assistente, ids locais em texto).
--
-- Camadas de proteção (iguais às da migração 003):
--   1. GRANT/REVOKE — anon não toca em nada; authenticated só no necessário
--   2. RLS          — cada usuário só enxerga as próprias linhas
--   3. CHECK        — coleções conhecidas, tamanho máximo, datas plausíveis
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabela de registros sincronizados
-- -----------------------------------------------------------------------------
create table if not exists public.registros_sync (
  user_id             uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  colecao             text        not null,
  id                  text        not null,
  dados               jsonb,
  modificado_em       timestamptz not null,
  excluido            boolean     not null default false,
  atualizado_servidor timestamptz not null default clock_timestamp(),
  primary key (user_id, colecao, id),

  constraint registros_sync_colecao_valida check (colecao in (
    'contas', 'movimentacoes', 'faturas', 'documentos', 'investimentos', 'metas',
    'orcamentos', 'recorrentes', 'categorias', 'regras', 'correcoes', 'conversas', '_kv'
  )),
  constraint registros_sync_id_valido check (char_length(id) between 1 and 200),
  constraint registros_sync_dados_ou_exclusao check (excluido or dados is not null),
  constraint registros_sync_dados_objeto check (dados is null or jsonb_typeof(dados) = 'object'),
  constraint registros_sync_tamanho check (dados is null or pg_column_size(dados) <= 512 * 1024),
  -- relógio do aparelho muito adiantado tornaria o registro "imbatível"
  constraint registros_sync_data_plausivel check (modificado_em < '2100-01-01'::timestamptz)
);

comment on table public.registros_sync is
  'contAI: espelho dos registros locais (IndexedDB) de quem ativou a sincronização. Última alteração vence por modificado_em.';

-- Busca incremental: "o que mudou no servidor desde o meu último pull"
create index if not exists registros_sync_usuario_atualizacao
  on public.registros_sync (user_id, atualizado_servidor);

-- atualizado_servidor é sempre o relógio do servidor, nunca o do aparelho
create or replace function public.registros_sync_tocar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_servidor := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists registros_sync_tocar on public.registros_sync;
create trigger registros_sync_tocar
  before insert or update on public.registros_sync
  for each row execute function public.registros_sync_tocar();

-- -----------------------------------------------------------------------------
-- 2. RLS
-- -----------------------------------------------------------------------------
alter table public.registros_sync enable row level security;

drop policy if exists registros_sync_ler on public.registros_sync;
create policy registros_sync_ler on public.registros_sync
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists registros_sync_inserir on public.registros_sync;
create policy registros_sync_inserir on public.registros_sync
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists registros_sync_alterar on public.registros_sync;
create policy registros_sync_alterar on public.registros_sync
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists registros_sync_excluir on public.registros_sync;
create policy registros_sync_excluir on public.registros_sync
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- 3. Envio em lote com "a alteração mais recente vence"
--    SECURITY INVOKER: roda com os privilégios e o RLS de quem chama.
-- -----------------------------------------------------------------------------
create or replace function public.sincronizar_registros(lote jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  alterados integer;
begin
  if auth.uid() is null then
    raise exception 'não autenticado' using errcode = '42501';
  end if;
  if jsonb_typeof(lote) <> 'array' then
    raise exception 'o lote deve ser uma lista' using errcode = '22023';
  end if;
  if jsonb_array_length(lote) > 500 then
    raise exception 'lote grande demais (máximo de 500 registros)' using errcode = '54000';
  end if;

  insert into public.registros_sync as r (user_id, colecao, id, dados, modificado_em, excluido)
  select auth.uid(),
         item ->> 'colecao',
         item ->> 'id',
         case when coalesce((item ->> 'excluido')::boolean, false) then null else item -> 'dados' end,
         (item ->> 'modificado_em')::timestamptz,
         coalesce((item ->> 'excluido')::boolean, false)
  from jsonb_array_elements(lote) as item
  on conflict (user_id, colecao, id) do update
    set dados         = excluded.dados,
        modificado_em = excluded.modificado_em,
        excluido      = excluded.excluido
    where r.modificado_em < excluded.modificado_em;

  get diagnostics alterados = row_count;
  return alterados;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Exclusão da conta pelo próprio usuário (LGPD, art. 18)
--    SECURITY DEFINER porque auth.users não é acessível a `authenticated`.
--    Só apaga a linha de quem chama; o resto sai em cascata (registros_sync e
--    as tabelas das migrações 001–003). Os arquivos do Storage são removidos
--    pelo app antes de chamar esta função.
-- -----------------------------------------------------------------------------
create or replace function public.excluir_minha_conta()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'não autenticado' using errcode = '42501';
  end if;
  delete from public.registros_sync where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Privilégios (a migração 003 zerou os defaults; aqui é tudo explícito)
-- -----------------------------------------------------------------------------
revoke all on public.registros_sync from public, anon, authenticated;
grant select, insert, update, delete on public.registros_sync to authenticated;

revoke all on function public.registros_sync_tocar()          from public, anon, authenticated;
revoke all on function public.sincronizar_registros(jsonb)    from public, anon;
revoke all on function public.excluir_minha_conta()           from public, anon;
grant execute on function public.sincronizar_registros(jsonb) to authenticated;
grant execute on function public.excluir_minha_conta()        to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Storage: arquivos das faturas em bucket PRIVADO, uma pasta por usuário
--    Caminho: documentos/<user_id>/<id do documento>
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 15728640,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists contai_documentos_ler on storage.objects;
create policy contai_documentos_ler on storage.objects
  for select to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists contai_documentos_enviar on storage.objects;
create policy contai_documentos_enviar on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists contai_documentos_substituir on storage.objects;
create policy contai_documentos_substituir on storage.objects
  for update to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'documentos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists contai_documentos_apagar on storage.objects;
create policy contai_documentos_apagar on storage.objects
  for delete to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = (select auth.uid())::text);
