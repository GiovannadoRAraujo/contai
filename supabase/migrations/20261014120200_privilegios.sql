-- =============================================================================
-- contAI — migração 003: privilégios de tabela
--
-- Por que esta migração existe: no Supabase, o schema `public` já vem com
-- GRANT para os papéis `anon` e `authenticated`. O RLS sozinho protege as
-- linhas, mas manter o GRANT para `anon` significa que uma política criada por
-- engano com `to public` ou `using (true)` exporia dados financeiros a
-- visitantes não autenticados. Revogar o privilégio de `anon` fecha essa porta
-- em definitivo: nem com uma política permissiva por acidente o visitante lê.
--
-- Camadas, da mais externa para a mais interna:
--   1. GRANT/REVOKE  — quem pode tocar na tabela           (esta migração)
--   2. RLS           — quais linhas cada um enxerga        (migração 002)
--   3. FK compostas  — a qual usuário cada vínculo pertence (migração 001)
--   4. CHECK         — quais valores são aceitáveis         (migração 001)
--
-- NÃO aplicada em nenhum banco. Para revisão.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Nenhum acesso anônimo aos dados financeiros
-- -----------------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;

-- ATENÇÃO: funções exigem revogar de PUBLIC, não apenas de `anon`.
-- O Postgres concede EXECUTE a PUBLIC em toda função criada, e PUBLIC inclui
-- todos os papéis — inclusive `anon`. Revogar só de `anon` deixa o privilégio
-- herdado intacto: foi verificado em teste que a ACL continuava `=X/postgres`
-- (ou seja, PUBLIC com EXECUTE) depois de um `revoke ... from anon`.
revoke all on all functions in schema public from public, anon;

-- Evita que objetos criados no futuro nasçam acessíveis ao visitante.
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from public, anon;

-- As duas funções do contAI são de gatilho — o Postgres recusa chamadas
-- diretas, então nem precisariam de EXECUTE para ninguém.
revoke all on function public.tocar_atualizado_em()            from public, anon, authenticated;
revoke all on function public.criar_perfil_para_novo_usuario() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Usuário autenticado: apenas o necessário, tabela por tabela
--    (explícito de propósito — `grant ... on all tables` alcançaria também
--    tabelas futuras sem revisão)
--
-- A revogação abaixo é indispensável e vem PRIMEIRO. O Supabase concede ALL
-- em toda tabela do schema public aos papéis anon, authenticated e
-- service_role através de default privileges. Sem zerar isso, os GRANTs
-- seguintes seriam decorativos: `authenticated` já teria SELECT, INSERT,
-- UPDATE, DELETE, TRUNCATE, REFERENCES e TRIGGER em tudo.
--
-- Verificado em teste: antes desta revogação, `mensagens` aparecia com UPDATE
-- e `perfis` com DELETE concedidos a authenticated, embora nenhuma das duas
-- tenha política para esses comandos. O RLS bloqueava na prática, mas a
-- intenção ("histórico não se reescreve", "perfil não se apaga") ficava
-- sustentada por uma camada só, e TRUNCATE — que ignora RLS — permanecia
-- concedido.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from authenticated;
alter default privileges in schema public revoke all on tables from authenticated;
grant select, insert, update          on public.perfis            to authenticated;
grant select, insert, update, delete  on public.contas            to authenticated;
grant select, insert, update, delete  on public.faturas           to authenticated;
grant select, insert, update, delete  on public.movimentacoes     to authenticated;
grant select, insert, update, delete  on public.investimentos     to authenticated;
grant select, insert, update, delete  on public.metas             to authenticated;
grant select, insert, update, delete  on public.orcamentos        to authenticated;
grant select, insert, update, delete  on public.recorrentes       to authenticated;
grant select, insert, update, delete  on public.categorias_custom to authenticated;
grant select, insert, update, delete  on public.regras_categoria  to authenticated;
grant select, insert,         delete  on public.mensagens         to authenticated;

-- `perfis` recebe INSERT (restrito ao próprio id pela política) para que um
-- usuário sem perfil consiga recriá-lo; não recebe DELETE, pois o perfil só
-- desaparece em cascata com a conta em auth.users.
-- `mensagens` não recebe UPDATE: histórico do assistente não se reescreve.

-- -----------------------------------------------------------------------------
-- 2b. Risco residual conhecido: tabelas futuras
--
-- Verificado em teste: uma tabela criada DEPOIS destas migrações nasce com
-- RLS DESATIVADO e com todos os privilégios para `authenticated` (herança dos
-- default privileges do Supabase, que revogamos apenas para `anon`).
--
-- Depois da revogação dos default privileges acima, uma tabela nova nasce sem
-- privilégio para `anon` nem para `authenticated` — mas ainda nasce com
-- RLS DESATIVADO. Toda migração futura precisa incluir explicitamente:
--
--     alter table public.<nova> enable row level security;
--     create policy ... on public.<nova> for select to authenticated using (...);
--     grant select, insert, update, delete on public.<nova> to authenticated;
--
-- O mesmo vale para funções: como os default privileges de EXECUTE foram
-- revogados de PUBLIC, uma função RPC nova não será executável por ninguém até
-- receber `grant execute on function ... to authenticated`.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 3. Sequências
--
-- Todas as chaves primárias usam uuid com gen_random_uuid(), então o esquema
-- não cria nenhuma sequência própria — não há `nextval` a conceder. A consulta
-- abaixo serve de conferência na revisão: o resultado esperado é zero linhas.
--
--   select sequence_schema, sequence_name
--     from information_schema.sequences
--    where sequence_schema = 'public';
--
-- Se alguma sequência surgir em migrações futuras (colunas identity/serial),
-- ela precisará de `grant usage, select on sequence ... to authenticated`.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 4. Conferências pós-aplicação (executar manualmente após o deploy)
-- -----------------------------------------------------------------------------
-- 4.1 Toda tabela do schema public com RLS ativado? Esperado: rowsecurity = true
--
--   select tablename, rowsecurity
--     from pg_tables
--    where schemaname = 'public'
--    order by tablename;
--
-- 4.2 Existe alguma política concedida a anon ou a public? Esperado: zero linhas
--
--   select schemaname, tablename, policyname, roles
--     from pg_policies
--    where schemaname = 'public'
--      and (roles && array['anon','public']::name[]);
--
-- 4.3 Alguma tabela com RLS ativo e nenhuma política? Esperado: zero linhas
--     (significaria acesso totalmente bloqueado por esquecimento)
--
--   select t.tablename
--     from pg_tables t
--    where t.schemaname = 'public'
--      and t.rowsecurity
--      and not exists (
--            select 1 from pg_policies p
--             where p.schemaname = t.schemaname and p.tablename = t.tablename
--          );
--
-- 4.4 Sobrou algum privilégio para anon? Esperado: zero linhas
--
--   select table_name, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'public' and grantee = 'anon';
-- -----------------------------------------------------------------------------
