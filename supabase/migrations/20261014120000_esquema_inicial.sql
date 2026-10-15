-- =============================================================================
-- contAI — migração 001: esquema inicial
--
-- Cria tipos, tabelas, restrições, índices e gatilhos de auditoria.
-- O RLS é ativado AQUI MESMO, na criação de cada tabela: sem políticas o
-- Postgres nega tudo, então não existe janela em que os dados fiquem expostos
-- entre esta migração e a 002.
--
-- Requer PostgreSQL 15+ (usa ON DELETE SET NULL com lista de colunas).
-- Todo projeto Supabase criado atualmente atende a esse requisito.
--
-- NÃO aplicada em nenhum banco. Para revisão.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensões
-- pg_trgm é usada pelo índice de busca textual em movimentacoes.descricao.
-- No Supabase as extensões vivem no schema `extensions`.
-- -----------------------------------------------------------------------------
create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Tipos enumerados (conjuntos estáveis definidos pelo aplicativo)
-- As categorias NÃO entram aqui: o usuário pode criar as suas.
-- -----------------------------------------------------------------------------
-- `to_regtype` é qualificado por schema: um tipo homônimo em outro schema não
-- faz o `create` ser pulado, o que deixaria `public.<tipo>` inexistente e
-- quebraria a criação das tabelas adiante.
do $$
begin
  if to_regtype('public.tipo_movimentacao') is null then
    create type public.tipo_movimentacao as enum ('receita', 'despesa');
  end if;

  if to_regtype('public.origem_movimentacao') is null then
    create type public.origem_movimentacao as enum ('manual', 'importacao', 'ia');
  end if;

  if to_regtype('public.tipo_conta') is null then
    create type public.tipo_conta as enum ('corrente', 'poupanca', 'cartao', 'carteira');
  end if;

  if to_regtype('public.status_fatura') is null then
    create type public.status_fatura as enum ('pendente', 'paga', 'em_analise');
  end if;

  if to_regtype('public.modalidade_investimento') is null then
    create type public.modalidade_investimento as enum (
      'Renda fixa', 'Tesouro Direto', 'CDB', 'LCI/LCA',
      'Fundos', 'Ações', 'ETFs', 'Outros'
    );
  end if;

  if to_regtype('public.autor_mensagem') is null then
    create type public.autor_mensagem as enum ('user', 'ia');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Gatilho de auditoria: mantém atualizado_em sempre coerente
-- -----------------------------------------------------------------------------
create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

comment on function public.tocar_atualizado_em() is
  'Atualiza atualizado_em em cada UPDATE. Usada por todas as tabelas do contAI.';

-- =============================================================================
-- perfis — dados do usuário (Usuario em src/types.ts)
-- A PK é o próprio id de auth.users: um perfil por usuário, sem user_id extra.
-- =============================================================================
create table if not exists public.perfis (
  id                uuid primary key references auth.users (id) on delete cascade,
  nome              text        not null default '',
  email             text,
  consentimento_ia  boolean     not null default false,
  ocultar_valores   boolean     not null default false,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),

  constraint perfis_nome_tamanho check (char_length(nome) <= 120)
);

alter table public.perfis enable row level security;

comment on table public.perfis is 'Perfil e preferências do usuário. consentimento_ia controla o acesso do assistente aos dados financeiros (LGPD).';
comment on column public.perfis.consentimento_ia is 'Autorização explícita para o assistente ler os dados financeiros. Revogável a qualquer momento.';

-- =============================================================================
-- contas — contas bancárias, carteira e cartões (Conta)
-- =============================================================================
create table if not exists public.contas (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users (id) on delete cascade,
  nome           text        not null,
  tipo           public.tipo_conta not null default 'corrente',
  saldo_inicial  numeric(14,2) not null default 0,
  limite         numeric(14,2),
  cor            text        not null default '#8B5CF6',
  arquivada      boolean     not null default false,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),

  constraint contas_nome_preenchido check (char_length(btrim(nome)) between 1 and 80),
  constraint contas_cor_hex         check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  -- limite existe apenas em cartão de crédito, e quando existe precisa ser positivo
  constraint contas_limite_coerente check (
    (tipo = 'cartao'  and (limite is null or limite > 0)) or
    (tipo <> 'cartao' and  limite is null)
  ),
  constraint contas_nome_unico_por_usuario unique (user_id, nome),
  -- necessária para as chaves estrangeiras compostas das tabelas filhas
  constraint contas_id_user unique (id, user_id)
);

alter table public.contas enable row level security;

create index if not exists contas_user_idx on public.contas (user_id);

drop trigger if exists contas_tocar_atualizado_em on public.contas;
create trigger contas_tocar_atualizado_em
  before update on public.contas
  for each row execute function public.tocar_atualizado_em();

comment on constraint contas_id_user on public.contas is
  'Permite FK composta (conta_id, user_id) nas tabelas filhas, impedindo no próprio banco que um usuário referencie a conta de outro.';

-- =============================================================================
-- faturas — documentos a pagar e faturas de cartão (Fatura)
-- =============================================================================
create table if not exists public.faturas (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  conta_id        uuid,
  emissor         text        not null,
  referencia      text        not null default '',
  valor           numeric(14,2) not null,
  vencimento      date        not null,
  status          public.status_fatura not null default 'pendente',
  -- Caminho do arquivo no Supabase Storage (bucket privado).
  -- Substitui o arquivoUrl do app, que era um object URL efêmero do navegador.
  arquivo_caminho text,
  arquivo_nome    text,
  arquivo_tipo    text,
  paginas         integer,
  importada       boolean     not null default false,
  cor             text        not null default '#8B5CF6',
  sigla           text        not null default '',
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  constraint faturas_emissor_preenchido check (char_length(btrim(emissor)) between 1 and 80),
  constraint faturas_valor_nao_negativo check (valor >= 0),
  constraint faturas_paginas_positivas  check (paginas is null or paginas > 0),
  constraint faturas_cor_hex            check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  constraint faturas_sigla_curta        check (char_length(sigla) <= 8),

  -- A conta precisa pertencer ao mesmo usuário (validado pelo banco, não pelo frontend).
  -- Apagar a conta não apaga a fatura: apenas desfaz o vínculo.
  constraint faturas_conta_fk foreign key (conta_id, user_id)
    references public.contas (id, user_id)
    on update cascade
    on delete set null (conta_id),

  constraint faturas_id_user unique (id, user_id)
);

alter table public.faturas enable row level security;

create index if not exists faturas_user_vencimento_idx on public.faturas (user_id, vencimento);
create index if not exists faturas_user_status_idx     on public.faturas (user_id, status);
create index if not exists faturas_conta_idx           on public.faturas (conta_id) where conta_id is not null;

drop trigger if exists faturas_tocar_atualizado_em on public.faturas;
create trigger faturas_tocar_atualizado_em
  before update on public.faturas
  for each row execute function public.tocar_atualizado_em();

comment on column public.faturas.arquivo_caminho is
  'Caminho no bucket privado do Storage (ex.: <user_id>/<fatura_id>.pdf). Nunca uma URL pública.';

-- =============================================================================
-- movimentacoes — receitas e despesas (Movimentacao)
-- =============================================================================
create table if not exists public.movimentacoes (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users (id) on delete cascade,
  tipo           public.tipo_movimentacao not null,
  descricao      text        not null,
  -- Sempre positivo: o sinal vem de `tipo`, como no aplicativo.
  valor          numeric(14,2) not null,
  data           date        not null,
  categoria      text        not null default 'Outros',
  conta_id       uuid        not null,
  origem         public.origem_movimentacao not null default 'manual',

  -- Fatura de origem, quando o documento virou registro em `faturas`.
  fatura_id      uuid,
  -- Lote de importação. O app grava o id do documento analisado em toda
  -- transação importada, mas a fatura só é criada se o usuário pedir — por isso
  -- este campo não tem FK: ele agrupa o lote, não referencia uma linha.
  importacao_id  uuid,

  parcela_atual  smallint,
  parcela_total  smallint,
  observacao     text,
  -- Chave de deduplicação (data|valor|descrição). NÃO é única: duas compras
  -- idênticas no mesmo dia são legítimas. Serve para alertar na revisão.
  hash           text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),

  constraint movimentacoes_descricao_preenchida check (char_length(btrim(descricao)) between 1 and 200),
  constraint movimentacoes_valor_positivo       check (valor > 0),
  constraint movimentacoes_observacao_tamanho   check (observacao is null or char_length(observacao) <= 500),
  -- Limites ESTÁTICOS de propósito. `current_date` é volátil e o Postgres o
  -- aceita em CHECK sem reclamar, mas a restrição passaria a significar coisas
  -- diferentes conforme o dia — e uma restauração de dump reavaliaria as linhas
  -- antigas com a janela de outra data. Faixa fixa e ampla resolve.
  constraint movimentacoes_data_plausivel       check (data between date '1970-01-01' and date '2100-01-01'),
  -- Parcelamento: ou os dois campos são nulos, ou os dois são coerentes.
  constraint movimentacoes_parcela_coerente check (
    (parcela_atual is null and parcela_total is null) or
    (parcela_atual is not null and parcela_total is not null
      and parcela_atual >= 1 and parcela_total >= 1
      and parcela_atual <= parcela_total and parcela_total <= 72)
  ),

  -- Conta obrigatória e do mesmo usuário. Protege o histórico: não se apaga uma
  -- conta que ainda tem movimentações.
  --
  -- NO ACTION DEFERRABLE, e não RESTRICT, de propósito. RESTRICT é verificado
  -- na hora e abortaria a exclusão da conta de usuário: o cascade de auth.users
  -- remove `contas` e `movimentacoes` em etapas separadas, e o RESTRICT
  -- dispararia no intervalo entre as duas. Adiada para o commit, a verificação
  -- enxerga o estado final — bloqueia apagar uma conta com histórico, mas não
  -- impede o usuário de excluir a própria conta (LGPD, art. 18).
  constraint movimentacoes_conta_fk foreign key (conta_id, user_id)
    references public.contas (id, user_id)
    on update cascade
    on delete no action
    deferrable initially deferred,

  -- Fatura opcional e do mesmo usuário. Apagar a fatura preserva as
  -- movimentações já importadas, como o aplicativo faz hoje.
  constraint movimentacoes_fatura_fk foreign key (fatura_id, user_id)
    references public.faturas (id, user_id)
    on update cascade
    on delete set null (fatura_id)
);

alter table public.movimentacoes enable row level security;

create index if not exists movimentacoes_user_data_idx      on public.movimentacoes (user_id, data desc);
create index if not exists movimentacoes_user_categoria_idx on public.movimentacoes (user_id, categoria);
create index if not exists movimentacoes_user_tipo_idx      on public.movimentacoes (user_id, tipo);
create index if not exists movimentacoes_conta_idx          on public.movimentacoes (conta_id);
create index if not exists movimentacoes_fatura_idx         on public.movimentacoes (fatura_id) where fatura_id is not null;
create index if not exists movimentacoes_importacao_idx     on public.movimentacoes (importacao_id) where importacao_id is not null;
create index if not exists movimentacoes_user_hash_idx      on public.movimentacoes (user_id, hash) where hash is not null;
-- Busca textual por descrição (tela Movimentações)
create index if not exists movimentacoes_descricao_trgm_idx on public.movimentacoes using gin (descricao extensions.gin_trgm_ops);

drop trigger if exists movimentacoes_tocar_atualizado_em on public.movimentacoes;
create trigger movimentacoes_tocar_atualizado_em
  before update on public.movimentacoes
  for each row execute function public.tocar_atualizado_em();

-- =============================================================================
-- investimentos — carteira cadastrada manualmente (Investimento)
-- =============================================================================
create table if not exists public.investimentos (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users (id) on delete cascade,
  nome               text        not null,
  modalidade         public.modalidade_investimento not null default 'Renda fixa',
  valor_investido    numeric(14,2) not null,
  -- Rentabilidade acumulada informada pelo usuário; pode ser negativa.
  rentabilidade      numeric(8,4) not null default 0,
  -- Data informada pelo usuário ("última atualização"), distinta da auditoria.
  data_atualizacao   date        not null default current_date,
  ativo              boolean     not null default true,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),

  constraint investimentos_nome_preenchido check (char_length(btrim(nome)) between 1 and 120),
  constraint investimentos_valor_positivo  check (valor_investido >= 0),
  constraint investimentos_rentabilidade_plausivel check (rentabilidade between -100 and 10000)
);

alter table public.investimentos enable row level security;

create index if not exists investimentos_user_idx on public.investimentos (user_id, ativo);

drop trigger if exists investimentos_tocar_atualizado_em on public.investimentos;
create trigger investimentos_tocar_atualizado_em
  before update on public.investimentos
  for each row execute function public.tocar_atualizado_em();

-- =============================================================================
-- metas — objetivos de economia (Meta)
-- =============================================================================
create table if not exists public.metas (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users (id) on delete cascade,
  nome           text        not null,
  alvo           numeric(14,2) not null,
  atual          numeric(14,2) not null default 0,
  prazo          date        not null,
  cor            text        not null default '#A855F7',
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),

  constraint metas_nome_preenchido check (char_length(btrim(nome)) between 1 and 80),
  constraint metas_alvo_positivo   check (alvo > 0),
  constraint metas_atual_valido    check (atual >= 0 and atual <= alvo),
  constraint metas_cor_hex         check (cor ~ '^#[0-9A-Fa-f]{6}$')
);

alter table public.metas enable row level security;

create index if not exists metas_user_idx on public.metas (user_id, prazo);

drop trigger if exists metas_tocar_atualizado_em on public.metas;
create trigger metas_tocar_atualizado_em
  before update on public.metas
  for each row execute function public.tocar_atualizado_em();

-- =============================================================================
-- orcamentos — limite mensal por categoria (Orcamento)
-- No app a chave é a categoria; aqui ganha id próprio e unicidade por usuário.
-- =============================================================================
create table if not exists public.orcamentos (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users (id) on delete cascade,
  categoria      text        not null,
  limite         numeric(14,2) not null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),

  constraint orcamentos_categoria_preenchida check (char_length(btrim(categoria)) between 1 and 60),
  constraint orcamentos_limite_positivo      check (limite > 0),
  constraint orcamentos_categoria_unica      unique (user_id, categoria)
);

alter table public.orcamentos enable row level security;

drop trigger if exists orcamentos_tocar_atualizado_em on public.orcamentos;
create trigger orcamentos_tocar_atualizado_em
  before update on public.orcamentos
  for each row execute function public.tocar_atualizado_em();

-- =============================================================================
-- recorrentes — contas fixas previstas (Recorrente)
-- Não gera lançamentos automáticos; serve para previsão, como no app.
-- =============================================================================
create table if not exists public.recorrentes (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  descricao       text        not null,
  valor           numeric(14,2) not null,
  dia_vencimento  smallint    not null,
  tipo            public.tipo_movimentacao not null default 'despesa',
  categoria       text        not null default 'Outros',
  ativo           boolean     not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  constraint recorrentes_descricao_preenchida check (char_length(btrim(descricao)) between 1 and 120),
  constraint recorrentes_valor_positivo       check (valor > 0),
  constraint recorrentes_dia_valido           check (dia_vencimento between 1 and 31)
);

alter table public.recorrentes enable row level security;

create index if not exists recorrentes_user_idx on public.recorrentes (user_id, ativo);

drop trigger if exists recorrentes_tocar_atualizado_em on public.recorrentes;
create trigger recorrentes_tocar_atualizado_em
  before update on public.recorrentes
  for each row execute function public.tocar_atualizado_em();

-- =============================================================================
-- categorias_custom — categorias criadas pelo usuário (categoriasCustom[])
-- =============================================================================
create table if not exists public.categorias_custom (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  nome       text        not null,
  criado_em  timestamptz not null default now(),

  constraint categorias_custom_nome_preenchido check (char_length(btrim(nome)) between 1 and 60),
  constraint categorias_custom_nome_unico      unique (user_id, nome)
);

alter table public.categorias_custom enable row level security;

-- =============================================================================
-- regras_categoria — aprendizado das correções do usuário (regrasCategoria{})
-- O app normaliza o padrão para minúsculas; o índice único reflete isso.
-- =============================================================================
create table if not exists public.regras_categoria (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users (id) on delete cascade,
  padrao         text        not null,
  categoria      text        not null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),

  constraint regras_categoria_padrao_preenchido    check (char_length(btrim(padrao)) between 1 and 60),
  constraint regras_categoria_categoria_preenchida check (char_length(btrim(categoria)) between 1 and 60)
);

alter table public.regras_categoria enable row level security;

create unique index if not exists regras_categoria_padrao_unico_idx
  on public.regras_categoria (user_id, lower(padrao));

drop trigger if exists regras_categoria_tocar_atualizado_em on public.regras_categoria;
create trigger regras_categoria_tocar_atualizado_em
  before update on public.regras_categoria
  for each row execute function public.tocar_atualizado_em();

-- =============================================================================
-- mensagens — histórico do Assistente contAI (conversas: Mensagem[])
-- =============================================================================
create table if not exists public.mensagens (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  autor      public.autor_mensagem not null,
  texto      text        not null,
  -- "De onde vêm os números": explicação da origem dos dados citados.
  detalhe    text,
  sugestoes  text[]      not null default '{}',
  criado_em  timestamptz not null default now(),

  constraint mensagens_texto_preenchido check (char_length(btrim(texto)) between 1 and 8000),
  constraint mensagens_sugestoes_limite check (array_length(sugestoes, 1) is null or array_length(sugestoes, 1) <= 8)
);

alter table public.mensagens enable row level security;

create index if not exists mensagens_user_criado_idx on public.mensagens (user_id, criado_em);

-- =============================================================================
-- Criação automática do perfil no cadastro
-- SECURITY DEFINER porque o gatilho roda no contexto de auth.users.
-- search_path vazio evita sequestro de resolução de nomes.
-- =============================================================================
create or replace function public.criar_perfil_para_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- `left(..., 120)` não é cosmético: sem ele, um cadastro com nome longo nos
  -- metadados (ou um e-mail longo, que vira o nome por padrão) viola o CHECK
  -- perfis_nome_tamanho, o gatilho aborta e O CADASTRO INTEIRO FALHA —
  -- o usuário simplesmente não consegue criar conta. Verificado em teste.
  insert into public.perfis (id, nome, email)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'nome'), ''),
        split_part(coalesce(new.email, ''), '@', 1)
      ),
      120
    ),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- O EXECUTE concedido a PUBLIC por padrão é removido na migração 003.
-- Ambas as funções são de gatilho e o Postgres recusa chamadas diretas, mas a
-- revogação explícita evita que o padrão permissivo se propague.

drop trigger if exists criar_perfil_apos_cadastro on auth.users;
create trigger criar_perfil_apos_cadastro
  after insert on auth.users
  for each row execute function public.criar_perfil_para_novo_usuario();

-- =============================================================================
-- Fim da migração 001.
-- Neste ponto todas as tabelas têm RLS ativado e NENHUMA política definida —
-- ou seja, o acesso está negado para todos. As políticas vêm na migração 002.
-- =============================================================================
