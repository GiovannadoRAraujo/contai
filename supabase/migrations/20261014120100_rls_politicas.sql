-- =============================================================================
-- contAI — migração 002: políticas de Row Level Security
--
-- Princípios aplicados:
--
--  * Uma política explícita por comando (SELECT, INSERT, UPDATE, DELETE).
--    Nada de política única com `for all`: comandos diferentes merecem
--    verificações diferentes e revisão independente.
--
--  * `TO authenticated` em todas elas. O papel `anon` não aparece em nenhuma
--    política, portanto visitante não autenticado não enxerga nada.
--
--  * UPDATE valida as duas pontas: `using` autoriza a linha existente e
--    `with check` autoriza a linha resultante. Sem o `with check` um usuário
--    poderia reatribuir `user_id` e transferir o próprio registro para outra
--    pessoa — ou roubar um registro alterando a linha para si.
--
--  * INSERT valida o proprietário via `with check`, impedindo gravar linha em
--    nome de terceiro.
--
--  * `(select auth.uid())` em vez de `auth.uid()` puro: o Postgres avalia a
--    subconsulta uma única vez por comando (InitPlan) em vez de uma vez por
--    linha, o que muda muito o desempenho em tabelas grandes.
--
--  * A integridade entre usuários em tabelas filhas NÃO depende destas
--    políticas: as chaves estrangeiras compostas (conta_id, user_id) da
--    migração 001 já tornam impossível referenciar dado de outro usuário.
--    O RLS aqui é a segunda camada, não a única.
--
-- Aplicada no projeto principal do contAI em 2026-10-14 (Supabase, Postgres 17.11),
-- via `supabase db push`. Revisada antes da aplicação.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- perfis — a PK é o próprio usuário.
--
-- O perfil normalmente nasce do gatilho `criar_perfil_apos_cadastro`. Ainda
-- assim existe política de INSERT, restrita ao próprio id: sem ela, um usuário
-- que por qualquer motivo ficasse sem linha em `perfis` (conta criada antes
-- desta migração, gatilho removido, falha pontual) não teria como recuperá-la
-- e o aplicativo ficaria permanentemente quebrado para ele. Verificado em teste.
-- O `with check` garante que ninguém crie perfil em nome de outra pessoa.
--
-- Não há DELETE: o perfil só desaparece junto com a conta em auth.users
-- (cascade), evitando que o usuário se apague por engano e perca as preferências.
-- -----------------------------------------------------------------------------
drop policy if exists perfis_inserir on public.perfis;
create policy perfis_inserir on public.perfis
  for insert to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists perfis_selecionar on public.perfis;
create policy perfis_selecionar on public.perfis
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists perfis_atualizar on public.perfis;
create policy perfis_atualizar on public.perfis
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- -----------------------------------------------------------------------------
-- contas
-- -----------------------------------------------------------------------------
drop policy if exists contas_selecionar on public.contas;
create policy contas_selecionar on public.contas
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists contas_inserir on public.contas;
create policy contas_inserir on public.contas
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists contas_atualizar on public.contas;
create policy contas_atualizar on public.contas
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists contas_excluir on public.contas;
create policy contas_excluir on public.contas
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- faturas
-- -----------------------------------------------------------------------------
drop policy if exists faturas_selecionar on public.faturas;
create policy faturas_selecionar on public.faturas
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists faturas_inserir on public.faturas;
create policy faturas_inserir on public.faturas
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists faturas_atualizar on public.faturas;
create policy faturas_atualizar on public.faturas
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists faturas_excluir on public.faturas;
create policy faturas_excluir on public.faturas
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- movimentacoes
-- -----------------------------------------------------------------------------
drop policy if exists movimentacoes_selecionar on public.movimentacoes;
create policy movimentacoes_selecionar on public.movimentacoes
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists movimentacoes_inserir on public.movimentacoes;
create policy movimentacoes_inserir on public.movimentacoes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists movimentacoes_atualizar on public.movimentacoes;
create policy movimentacoes_atualizar on public.movimentacoes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists movimentacoes_excluir on public.movimentacoes;
create policy movimentacoes_excluir on public.movimentacoes
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- investimentos
-- -----------------------------------------------------------------------------
drop policy if exists investimentos_selecionar on public.investimentos;
create policy investimentos_selecionar on public.investimentos
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists investimentos_inserir on public.investimentos;
create policy investimentos_inserir on public.investimentos
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists investimentos_atualizar on public.investimentos;
create policy investimentos_atualizar on public.investimentos
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists investimentos_excluir on public.investimentos;
create policy investimentos_excluir on public.investimentos
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- metas
-- -----------------------------------------------------------------------------
drop policy if exists metas_selecionar on public.metas;
create policy metas_selecionar on public.metas
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists metas_inserir on public.metas;
create policy metas_inserir on public.metas
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists metas_atualizar on public.metas;
create policy metas_atualizar on public.metas
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists metas_excluir on public.metas;
create policy metas_excluir on public.metas
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- orcamentos
-- -----------------------------------------------------------------------------
drop policy if exists orcamentos_selecionar on public.orcamentos;
create policy orcamentos_selecionar on public.orcamentos
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists orcamentos_inserir on public.orcamentos;
create policy orcamentos_inserir on public.orcamentos
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists orcamentos_atualizar on public.orcamentos;
create policy orcamentos_atualizar on public.orcamentos
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists orcamentos_excluir on public.orcamentos;
create policy orcamentos_excluir on public.orcamentos
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- recorrentes
-- -----------------------------------------------------------------------------
drop policy if exists recorrentes_selecionar on public.recorrentes;
create policy recorrentes_selecionar on public.recorrentes
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists recorrentes_inserir on public.recorrentes;
create policy recorrentes_inserir on public.recorrentes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists recorrentes_atualizar on public.recorrentes;
create policy recorrentes_atualizar on public.recorrentes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists recorrentes_excluir on public.recorrentes;
create policy recorrentes_excluir on public.recorrentes
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- categorias_custom
-- -----------------------------------------------------------------------------
drop policy if exists categorias_custom_selecionar on public.categorias_custom;
create policy categorias_custom_selecionar on public.categorias_custom
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists categorias_custom_inserir on public.categorias_custom;
create policy categorias_custom_inserir on public.categorias_custom
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists categorias_custom_atualizar on public.categorias_custom;
create policy categorias_custom_atualizar on public.categorias_custom
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists categorias_custom_excluir on public.categorias_custom;
create policy categorias_custom_excluir on public.categorias_custom
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- regras_categoria
-- -----------------------------------------------------------------------------
drop policy if exists regras_categoria_selecionar on public.regras_categoria;
create policy regras_categoria_selecionar on public.regras_categoria
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists regras_categoria_inserir on public.regras_categoria;
create policy regras_categoria_inserir on public.regras_categoria
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists regras_categoria_atualizar on public.regras_categoria;
create policy regras_categoria_atualizar on public.regras_categoria
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists regras_categoria_excluir on public.regras_categoria;
create policy regras_categoria_excluir on public.regras_categoria
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- mensagens — histórico do assistente.
-- Sem política de UPDATE: mensagem trocada não se reescreve. O usuário pode
-- apagar a conversa (DELETE), que é o que o botão "Limpar conversa" faz.
-- -----------------------------------------------------------------------------
drop policy if exists mensagens_selecionar on public.mensagens;
create policy mensagens_selecionar on public.mensagens
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists mensagens_inserir on public.mensagens;
create policy mensagens_inserir on public.mensagens
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists mensagens_excluir on public.mensagens;
create policy mensagens_excluir on public.mensagens
  for delete to authenticated
  using ((select auth.uid()) = user_id);
