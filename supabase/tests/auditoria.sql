-- =============================================================================
-- contAI — auditoria pós-aplicação
--
-- Cole no SQL Editor do projeto e execute. É UMA única consulta que reúne as
-- quatro conferências da migração 003 mais dois inventários, para que o editor
-- mostre tudo de uma vez (ele exibe apenas o resultado da última instrução).
--
-- SOMENTE LEITURA: lê catálogos do sistema, não cria, altera nem apaga nada.
--
-- Resultado esperado: a coluna SITUACAO deve dizer "ok" em todas as linhas de
-- verificação. Qualquer "PROBLEMA" merece investigação antes de seguir.
-- =============================================================================

with
-- 4.1 — RLS ativado em todas as tabelas do schema public
rls as (
  select tablename, rowsecurity from pg_tables where schemaname = 'public'
),
-- 4.2 — políticas concedidas a anon ou public
pol_abertas as (
  select tablename, policyname, roles::text as roles
    from pg_policies
   where schemaname = 'public' and (roles && array['anon','public']::name[])
),
-- 4.3 — tabelas com RLS ativo e nenhuma política
sem_politica as (
  select t.tablename
    from pg_tables t
   where t.schemaname = 'public' and t.rowsecurity
     and not exists (
           select 1 from pg_policies p
            where p.schemaname = t.schemaname and p.tablename = t.tablename
         )
),
-- 4.4 — privilégios restantes para anon
anon_priv as (
  select table_name, privilege_type
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon'
),
-- extra — privilégios de authenticated
auth_priv as (
  select table_name,
         string_agg(distinct privilege_type, ',' order by privilege_type) as privilegios
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'authenticated'
   group by table_name
),
-- extra — políticas por tabela
pol_tab as (
  select tablename,
         count(*)::int as qtd,
         string_agg(distinct cmd, ',' order by cmd) as comandos
    from pg_policies where schemaname = 'public' group by tablename
)
select * from (
  select 1 as ord, '4.1 RLS'  as verificacao,
         'tabelas no schema public: ' || (select count(*) from rls) ||
         ' | sem RLS: '              || (select count(*) from rls where not rowsecurity) as detalhe,
         case when (select count(*) from rls where not rowsecurity) = 0
                   and (select count(*) from rls) = 11
              then 'ok' else 'PROBLEMA' end as situacao
  union all
  select 2, '4.2 políticas abertas',
         'políticas para anon/public: ' || (select count(*) from pol_abertas),
         case when (select count(*) from pol_abertas) = 0 then 'ok' else 'PROBLEMA' end
  union all
  select 3, '4.3 RLS sem política',
         'tabelas com RLS e zero políticas: ' || (select count(*) from sem_politica),
         case when (select count(*) from sem_politica) = 0 then 'ok' else 'PROBLEMA' end
  union all
  select 4, '4.4 privilégios de anon',
         'privilégios restantes para anon: ' || (select count(*) from anon_priv),
         case when (select count(*) from anon_priv) = 0 then 'ok' else 'PROBLEMA' end
  union all
  select 5, 'extra: total de políticas',
         'políticas no schema public: ' || (select coalesce(sum(qtd),0) from pol_tab),
         case when (select coalesce(sum(qtd),0) from pol_tab) = 42 then 'ok' else 'conferir' end
  union all
  select 6, 'extra: privilégios amplos',
         'tabelas com TRUNCATE/REFERENCES/TRIGGER para authenticated: ' ||
         (select count(*) from auth_priv where privilegios ~ 'TRUNCATE|REFERENCES|TRIGGER'),
         case when (select count(*) from auth_priv where privilegios ~ 'TRUNCATE|REFERENCES|TRIGGER') = 0
              then 'ok' else 'PROBLEMA' end
  union all
  select 7, 'extra: gatilho no auth.users',
         'gatilhos criar_perfil_apos_cadastro: ' ||
         (select count(*) from pg_trigger where tgname = 'criar_perfil_apos_cadastro' and not tgisinternal),
         case when (select count(*) from pg_trigger where tgname = 'criar_perfil_apos_cadastro' and not tgisinternal) = 1
              then 'ok' else 'PROBLEMA' end
  union all
  -- detalhamento por tabela
  select 10, 'tabela: ' || r.tablename,
         'RLS=' || case when r.rowsecurity then 'sim' else 'NAO' end ||
         ' | políticas=' || coalesce(p.comandos, 'nenhuma') ||
         ' | authenticated=' || coalesce(a.privilegios, 'nenhum'),
         case when r.rowsecurity and p.qtd > 0 then 'ok' else 'PROBLEMA' end
    from rls r
    left join pol_tab  p on p.tablename  = r.tablename
    left join auth_priv a on a.table_name = r.tablename
) t
order by ord, verificacao;
