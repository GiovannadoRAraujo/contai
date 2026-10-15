import { novoBanco, comoUsuario, comoAnonimo, deveFalhar } from './harness.mjs';
const r = []; const ok = (n,c,d='') => r.push({n, ok:!!c, d});
const { db } = await novoBanco();

// R1 — cadastro com nome de 300 chars agora funciona e trunca
await db.query(`insert into auth.users (email, raw_user_meta_data) values ('longo@ex.com', jsonb_build_object('nome',$1::text))`, ['x'.repeat(300)]);
const p1 = await db.query(`select char_length(nome) n from public.perfis where email='longo@ex.com'`);
ok('R1 cadastro com nome de 300 chars NÃO quebra', p1.rows.length===1, `nome truncado para ${p1.rows[0]?.n} chars`);

// R2 — e-mail longo sem metadados
await db.query(`insert into auth.users (email) values ($1)`, ['y'.repeat(200)+'@ex.com']);
const p2 = await db.query(`select char_length(nome) n from public.perfis where email like 'yyy%'`);
ok('R2 cadastro com e-mail de 200 chars NÃO quebra', p2.rows.length===1, `nome truncado para ${p2.rows[0]?.n} chars`);

// R3 — usuário sem perfil consegue recriar o próprio
const U = (await db.query(`insert into auth.users (email, raw_user_meta_data) values ('u@ex.com','{"nome":"U"}'::jsonb) returning id`)).rows[0].id;
const V = (await db.query(`insert into auth.users (email, raw_user_meta_data) values ('v@ex.com','{"nome":"V"}'::jsonb) returning id`)).rows[0].id;
await db.query(`delete from public.perfis where id=$1`, [U]);
await comoUsuario(db, U, async () => {
  const ins = await deveFalhar(() => db.query(`insert into public.perfis (id,nome) values ($1,'U')`, [U]));
  ok('R3 usuário recria o próprio perfil', ins===null, ins ?? '');
  const forja = await deveFalhar(() => db.query(`insert into public.perfis (id,nome) values ($1,'invasor')`, [V]));
  ok('R3b mas NÃO cria perfil em nome de outro', !!forja, forja ?? 'CRIOU — FALHA GRAVE');
});

// R4 — PUBLIC perdeu EXECUTE nas funções
const acl = await db.query(`select p.proname, coalesce(array_to_string(p.proacl,','),'(padrão: PUBLIC executa)') a
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`);
acl.rows.forEach(x => ok(`R4 ${x.proname}: PUBLIC sem EXECUTE`, !/^=X|,=X/.test(x.a), x.a));

// R5 — CHECK de data agora é imutável
const c = await db.query(`select pg_get_constraintdef(oid) d from pg_constraint where conname='movimentacoes_data_plausivel'`);
ok('R5 CHECK de data sem função volátil', !/current_date|now\(/.test(c.rows[0].d), c.rows[0].d);

// R6 — enums seguem em public
const en = await db.query(`select count(*) n from pg_type t join pg_namespace ns on ns.oid=t.typnamespace
  where ns.nspname='public' and t.typtype='e'`);
ok('R6 os 6 enums existem em public', Number(en.rows[0].n)===6, `${en.rows[0].n} enums`);

// R7 — anon continua sem nada
await comoAnonimo(db, async () => {
  const e = await deveFalhar(() => db.query(`select * from public.perfis`));
  ok('R7 anon segue sem acesso a perfis', !!e, e ?? 'LEU — FALHA GRAVE');
});

// R8 — idempotência: reaplicar as 3 migrações não quebra
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const MIG = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
let erroIdem=null;
for (const f of readdirSync(MIG).filter(x=>x.endsWith('.sql')).sort()) {
  try { await db.exec(readFileSync(`${MIG}/${f}`,'utf8')); } catch(e){ erroIdem=`${f}: ${e.message.split('\n')[0]}`; break; }
}
ok('R8 migrações são idempotentes (reaplicadas sem erro)', erroIdem===null, erroIdem ?? '');

const falhas = r.filter(x=>!x.ok);
console.log('\n'+'='.repeat(74));
r.forEach(x=>console.log(`${x.ok?' PASSOU ':' FALHOU '} ${x.n}${x.d?'  ·  '+x.d:''}`));
console.log('='.repeat(74));
console.log(`${r.length-falhas.length}/${r.length} testes passaram`);
process.exitCode = falhas.length?1:0;
