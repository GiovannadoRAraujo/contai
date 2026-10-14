/**
 * Teste de isolamento entre dois usuários contra um projeto Supabase REAL,
 * passando pela API (PostgREST + RLS) — o mesmo caminho que o aplicativo usa.
 *
 * SOMENTE para o projeto DESCARTÁVEL. O script recusa rodar se a URL apontar
 * para o mesmo projeto do `.env.local`.
 *
 * Não precisa da senha do banco nem de chave secreta: usa apenas a URL e a
 * chave publicável do descartável, lidas de `.env.test.local` (ignorado pelo Git).
 *
 *   # .env.test.local
 *   SUPABASE_TEST_URL=https://<ref-do-descartavel>.supabase.co
 *   SUPABASE_TEST_PUBLISHABLE_KEY=sb_publishable_...
 *
 * Pré-requisito no projeto descartável:
 *   Authentication > Providers > Email > desligar "Confirm email"
 *   (sem isso o login logo após o cadastro não acontece)
 *
 *   node supabase/tests/isolamento-remoto.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function lerEnv(arquivo) {
  const f = resolve(RAIZ, arquivo);
  if (!existsSync(f)) return {};
  return Object.fromEntries(
    readFileSync(f, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
  );
}

const teste = lerEnv('.env.test.local');
const principal = lerEnv('.env.local');
const URL = (teste.SUPABASE_TEST_URL ?? '').replace(/\/+$/, '');
const CHAVE = teste.SUPABASE_TEST_PUBLISHABLE_KEY ?? '';
const ref = (u) => (u.match(/^https?:\/\/([a-z0-9-]+)\./i) ?? [])[1] ?? '';

if (!URL || !CHAVE) {
  console.error('Faltam SUPABASE_TEST_URL e SUPABASE_TEST_PUBLISHABLE_KEY em .env.test.local.');
  process.exit(2);
}
if (CHAVE.startsWith('sb_secret_')) {
  console.error('PARE: isso é uma chave secreta. Use a publicável (sb_publishable_…).');
  process.exit(2);
}
if (ref(URL) && ref(URL) === ref(principal.VITE_SUPABASE_URL ?? '')) {
  console.error('ABORTAR: a URL de teste é a do PROJETO PRINCIPAL do contAI.');
  process.exit(1);
}

/**
 * Guarda: com a confirmação de e-mail ligada, o `signUp` cria a conta mas não
 * devolve sessão. Sem esta checagem o teste falharia DEPOIS de já ter criado
 * dois usuários não confirmados, impossíveis de apagar sem a chave secreta.
 * Melhor parar antes de criar qualquer coisa.
 */
{
  const cfg = await (await fetch(`${URL}/auth/v1/settings`, { headers: { apikey: CHAVE } })).json();
  if (!cfg.mailer_autoconfirm) {
    console.error('\nPARADO antes de criar qualquer usuário.');
    console.error('A confirmação de e-mail está LIGADA neste projeto, então o cadastro não devolve sessão.');
    console.error('Desligue em Authentication > Sign In / Providers > Email > "Confirm email" e rode de novo.');
    process.exit(2);
  }
}

const r = [];
const ok = (n, c, d = '') => r.push({ n, ok: !!c, d });
const carimbo = Date.now();
const cred = (q) => ({ email: `teste-${q}-${carimbo}@example.com`, password: `Teste!${carimbo}${q}` });

async function entrar(c, rotulo) {
  const sb = createClient(URL, CHAVE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.signUp({ ...c, options: { data: { nome: `Usuário de teste ${rotulo}` } } });
  if (error) throw new Error(`cadastro falhou: ${error.message}`);
  if (!data.session) {
    const { data: d2, error: e2 } = await sb.auth.signInWithPassword(c);
    if (e2) throw new Error(`login falhou (confirmação de e-mail ainda ligada?): ${e2.message}`);
    if (!d2.session) throw new Error('sem sessão após login');
  }
  return { sb, id: (await sb.auth.getUser()).data.user.id };
}

console.log(`\nProjeto de teste: ${ref(URL)}\n`);

const A = await entrar(cred('a'), 'A');
const B = await entrar(cred('b'), 'B');

// 1) Perfil criado pelo gatilho
const pA = await A.sb.from('perfis').select('id,nome,consentimento_ia').eq('id', A.id).single();
ok('perfil criado automaticamente no cadastro', !pA.error && pA.data?.id === A.id, pA.error?.message ?? pA.data?.nome);
ok('consentimento_ia começa desligado', pA.data?.consentimento_ia === false);

// 2) Cada usuário cria conta e movimentação
const cA = await A.sb.from('contas').insert({ user_id: A.id, nome: 'Conta A', tipo: 'corrente' }).select('id').single();
ok('A cria a própria conta', !cA.error, cA.error?.message ?? '');
const cB = await B.sb.from('contas').insert({ user_id: B.id, nome: 'Conta B', tipo: 'corrente' }).select('id').single();
ok('B cria a própria conta', !cB.error, cB.error?.message ?? '');

const mA = await A.sb.from('movimentacoes').insert({
  user_id: A.id, tipo: 'despesa', descricao: 'Mercado A', valor: 120.5,
  data: new Date().toISOString().slice(0, 10), conta_id: cA.data?.id,
}).select('id').single();
ok('A cria a própria movimentação', !mA.error, mA.error?.message ?? '');

const mB = await B.sb.from('movimentacoes').insert({
  user_id: B.id, tipo: 'receita', descricao: 'Salário B', valor: 5800,
  data: new Date().toISOString().slice(0, 10), conta_id: cB.data?.id,
}).select('id').single();
ok('B cria a própria movimentação', !mB.error, mB.error?.message ?? '');

// 3) Isolamento de leitura
const leA = await A.sb.from('movimentacoes').select('id,descricao');
ok('A enxerga apenas as próprias movimentações',
   !leA.error && leA.data?.length === 1 && leA.data[0].id === mA.data?.id,
   `viu ${leA.data?.length ?? '?'} linha(s)`);

const espiar = await A.sb.from('movimentacoes').select('id').eq('id', mB.data?.id);
ok('A não lê a movimentação de B pelo id', !espiar.error && espiar.data?.length === 0,
   `${espiar.data?.length ?? '?'} linha(s)`);

// 4) Isolamento de escrita
const alt = await A.sb.from('movimentacoes').update({ descricao: 'invadido' }).eq('id', mB.data?.id).select('id');
ok('A não altera a linha de B', !alt.error && alt.data?.length === 0, `${alt.data?.length ?? '?'} linha(s)`);

const exc = await A.sb.from('movimentacoes').delete().eq('id', mB.data?.id).select('id');
ok('A não exclui a linha de B', !exc.error && exc.data?.length === 0, `${exc.data?.length ?? '?'} linha(s)`);

const forja = await A.sb.from('movimentacoes').insert({
  user_id: B.id, tipo: 'despesa', descricao: 'forjada', valor: 10,
  data: new Date().toISOString().slice(0, 10), conta_id: cB.data?.id,
}).select('id');
ok('A não insere em nome de B', !!forja.error, forja.error?.message ?? 'INSERIU — FALHA GRAVE');

// 5) Referência cruzada: linha própria apontando para a conta de B
const cruz = await A.sb.from('movimentacoes').insert({
  user_id: A.id, tipo: 'despesa', descricao: 'cruzada', valor: 10,
  data: new Date().toISOString().slice(0, 10), conta_id: cB.data?.id,
}).select('id');
ok('A não vincula movimentação à CONTA de B', !!cruz.error, cruz.error?.message ?? 'VINCULOU — FALHA GRAVE');

// 6) Transferência de propriedade
const transf = await A.sb.from('movimentacoes').update({ user_id: B.id }).eq('id', mA.data?.id).select('id');
ok('A não transfere a própria linha para B', !!transf.error || transf.data?.length === 0,
   transf.error?.message ?? `${transf.data?.length ?? '?'} linha(s)`);

// 7) Visitante anônimo (cliente sem sessão)
const anon = createClient(URL, CHAVE, { auth: { persistSession: false } });
const leAnon = await anon.from('movimentacoes').select('id');
ok('anônimo não lê movimentações', !!leAnon.error || leAnon.data?.length === 0,
   leAnon.error?.message ?? `${leAnon.data?.length ?? '?'} linha(s)`);
const leAnonP = await anon.from('perfis').select('id');
ok('anônimo não lê perfis', !!leAnonP.error || leAnonP.data?.length === 0,
   leAnonP.error?.message ?? `${leAnonP.data?.length ?? '?'} linha(s)`);

// 8) Exclusão de conta com registros relacionados (não apaga conta com histórico)
const apagar = await A.sb.from('contas').delete().eq('id', cA.data?.id).select('id');
ok('não apaga conta que ainda tem movimentações', !!apagar.error,
   apagar.error?.message ?? 'APAGOU — perda de histórico');

/* ---------------------------------------------------------------- *
 * Limpeza
 *
 * Cada usuário apaga os PRÓPRIOS registros, usando a própria sessão — ou seja,
 * passando pelo RLS como qualquer operação do aplicativo. A ordem respeita as
 * chaves estrangeiras: movimentações, depois faturas, depois contas.
 *
 * As duas contas em auth.users NÃO são removidas: apagar usuário exige a API
 * administrativa e a chave secreta, que este script deliberadamente não usa.
 * Em projeto descartável isso é inofensivo; a remoção fica no painel.
 * ---------------------------------------------------------------- */
async function limpar(u, rotulo) {
  const passos = [];
  for (const tabela of ['movimentacoes', 'faturas', 'contas']) {
    const { error, data } = await u.sb.from(tabela).delete().eq('user_id', u.id).select('id');
    passos.push(`${tabela}: ${error ? 'ERRO — ' + error.message : (data?.length ?? 0) + ' removido(s)'}`);
  }
  console.log(`  ${rotulo} → ${passos.join(' · ')}`);
  return passos.every((p) => !p.includes('ERRO'));
}

console.log('\nLimpando os dados criados pelo teste:');
const limpoA = await limpar(A, 'usuário A');
const limpoB = await limpar(B, 'usuário B');

// Confirma que não sobrou nada
const sobrouA = await A.sb.from('movimentacoes').select('id');
const sobrouB = await B.sb.from('movimentacoes').select('id');
ok('limpeza removeu todos os dados de teste',
   limpoA && limpoB && sobrouA.data?.length === 0 && sobrouB.data?.length === 0,
   `restaram A=${sobrouA.data?.length ?? '?'} B=${sobrouB.data?.length ?? '?'}`);

const falhas = r.filter((x) => !x.ok);
console.log('='.repeat(76));
r.forEach((x) => console.log(`${x.ok ? ' PASSOU ' : ' FALHOU '} ${x.n}${x.d ? '  ·  ' + x.d : ''}`));
console.log('='.repeat(76));
console.log(`${r.length - falhas.length}/${r.length} testes passaram`);
console.log(`\nDados de teste: removidos pelo próprio script.`);
console.log(`Contas de acesso: 2 usuários continuam em auth.users (${A.id.slice(0, 8)}…, ${B.id.slice(0, 8)}…).`);
console.log('Apagá-los exige a chave secreta pela API administrativa, que este script não usa.');
console.log('Remova em Authentication > Users se quiser o projeto totalmente limpo.');
process.exitCode = falhas.length ? 1 : 0;
