# Testes das migrações do contAI

Suíte executável que valida o esquema, o RLS e as regras de integridade **sem
tocar em nenhum banco remoto**. Usa [PGlite](https://pglite.dev) — PostgreSQL
compilado para WebAssembly, rodando em memória dentro do Node.

```bash
npm run test:db
```

Cada execução cria um banco novo do zero, aplica os três arquivos de
`supabase/migrations/` na ordem dos nomes e roda os testes. Nada persiste.

## O que o ambiente simula

PGlite é Postgres puro: não conhece Supabase. O `harness.mjs` recria o mínimo
necessário antes das migrações:

- schemas `extensions` e `auth`;
- tabela `auth.users` com `raw_user_meta_data`;
- função `auth.uid()`, lendo a claim `sub` de `request.jwt.claims`;
- papéis `anon`, `authenticated` e `service_role`;
- os *default privileges* permissivos que o Supabase aplica ao schema `public`
  — o ponto de partida real que a migração 003 precisa revogar.

Os testes trocam de identidade com `set role` + `set_config('request.jwt.claims', …)`,
que é como o PostgREST autentica as requisições do cliente.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `harness.mjs` | Monta o banco, aplica as migrações, auxiliares `comoUsuario` / `comoAnonimo` / `deveFalhar` |
| `rls.test.mjs` | Isolamento entre usuários, referências cruzadas, CRUD autorizado, exclusão de conta, restrições de valor |
| `regressao.test.mjs` | Os defeitos encontrados na revisão, para que não voltem |

## Limites conhecidos

- **A versão do Postgres difere.** PGlite 0.5.9 é Postgres 18; os projetos
  Supabase rodam 15 ou 17. Os recursos usados aqui (`ON DELETE SET NULL` com
  lista de colunas, constraints adiadas) existem desde o 15, mas a confirmação
  definitiva só vem aplicando num projeto Supabase descartável.
- **O `auth` daqui é um esqueleto.** Confirmações por e-mail, provedores OAuth,
  `auth.jwt()` e a API administrativa não existem neste ambiente.
- **Storage e Edge Functions não são cobertos.**
- O papel `service_role` existe mas não é exercitado: ele ignora o RLS por
  construção e só deve ser usado no servidor.

## Validando num projeto Supabase descartável

Para a confirmação final, antes de aplicar no projeto real:

```bash
# 1. Crie um projeto novo e VAZIO no painel do Supabase (plano gratuito serve)

# 2. Autentique a CLI (abre o navegador; o token fica no seu computador)
npx supabase@latest login

# 3. Crie o config.toml, se ainda não existir
npx supabase@latest init

# 4. Vincule ao projeto DESCARTÁVEL
npx supabase@latest link --project-ref <ref-do-descartavel>

# 5. TRAVA: aborta se a CLI estiver apontando para o projeto principal
node supabase/tests/conferir-alvo.mjs

# 6. Ensaio — lista o que seria aplicado, sem aplicar
npx supabase@latest db push --dry-run

# 7. Aplica no descartável
npx supabase@latest db push

# 8. Confira as quatro consultas do fim de 20261014120200_privilegios.sql
#    no SQL Editor do painel
```

> `supabase db diff` **não** serve como ensaio aqui: ele compara contra um
> Postgres local e exige Docker. O ensaio sem Docker é `db push --dry-run`.

Alternativa sem CLI: abrir o SQL Editor do projeto descartável e colar os três
arquivos **na ordem numérica**, um de cada vez.
