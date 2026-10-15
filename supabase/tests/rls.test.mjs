import { novoBanco, comoUsuario, comoAnonimo, deveFalhar } from './harness.mjs';

const r = [];
const ok = (n, c, d = '') => r.push({ n, ok: !!c, d });

const { db } = await novoBanco();

/* ---------------------------------------------------------------- *
 * Cadastro de dois usuários (como o Supabase Auth faria)
 * ---------------------------------------------------------------- */
const A = (await db.query(
  `insert into auth.users (email, raw_user_meta_data) values ('a@exemplo.com','{"nome":"Ana"}'::jsonb) returning id`,
)).rows[0].id;
const B = (await db.query(
  `insert into auth.users (email, raw_user_meta_data) values ('b@exemplo.com','{"nome":"Bruno"}'::jsonb) returning id`,
)).rows[0].id;

// T1 — gatilho de criação de perfil
const perfis = await db.query(`select id, nome, email, consentimento_ia from public.perfis order by email`);
ok('T1 perfil criado automaticamente no cadastro', perfis.rows.length === 2,
   JSON.stringify(perfis.rows.map(p => p.nome)));
ok('T1b consentimento_ia começa desativado (opt-in)', perfis.rows.every(p => p.consentimento_ia === false));

// Semente: cada usuário com conta, fatura e movimentação (como postgres, dono)
const contaA = (await db.query(`insert into public.contas (user_id,nome,tipo) values ($1,'Nubank','corrente') returning id`, [A])).rows[0].id;
const contaB = (await db.query(`insert into public.contas (user_id,nome,tipo) values ($1,'Itau','corrente') returning id`, [B])).rows[0].id;
const fatA   = (await db.query(`insert into public.faturas (user_id,conta_id,emissor,valor,vencimento) values ($1,$2,'Enel',189.90,current_date+3) returning id`, [A, contaA])).rows[0].id;
const movA   = (await db.query(`insert into public.movimentacoes (user_id,tipo,descricao,valor,data,conta_id,fatura_id) values ($1,'despesa','Luz',189.90,current_date,$2,$3) returning id`, [A, contaA, fatA])).rows[0].id;
const movB   = (await db.query(`insert into public.movimentacoes (user_id,tipo,descricao,valor,data,conta_id) values ($1,'receita','Salario',5800,current_date,$2) returning id`, [B, contaB])).rows[0].id;

/* ---------------------------------------------------------------- *
 * Isolamento entre usuários
 * ---------------------------------------------------------------- */
await comoUsuario(db, A, async () => {
  const vis = await db.query(`select id from public.movimentacoes`);
  ok('T2 A enxerga apenas as próprias movimentações',
     vis.rows.length === 1 && vis.rows[0].id === movA, `viu ${vis.rows.length} linha(s)`);

  const contas = await db.query(`select id from public.contas`);
  ok('T3 A enxerga apenas as próprias contas', contas.rows.length === 1 && contas.rows[0].id === contaA);

  const upd = await db.query(`update public.movimentacoes set descricao='invadido' where id=$1 returning id`, [movB]);
  ok('T4 A não consegue ALTERAR linha de B', upd.rows.length === 0, `${upd.rows.length} linha(s) afetada(s)`);

  const del = await db.query(`delete from public.movimentacoes where id=$1 returning id`, [movB]);
  ok('T5 A não consegue EXCLUIR linha de B', del.rows.length === 0, `${del.rows.length} linha(s) afetada(s)`);

  const e6 = await deveFalhar(() =>
    db.query(`insert into public.movimentacoes (user_id,tipo,descricao,valor,data,conta_id) values ($1,'despesa','forjada',10,current_date,$2)`, [B, contaB]));
  ok('T6 A não consegue INSERIR em nome de B', !!e6, e6 ?? 'INSERIU — FALHA GRAVE');

  // Referência cruzada: linha própria apontando para conta de B
  const e7 = await deveFalhar(() =>
    db.query(`insert into public.movimentacoes (user_id,tipo,descricao,valor,data,conta_id) values ($1,'despesa','cruzada',10,current_date,$2)`, [A, contaB]));
  ok('T7 A não consegue vincular à CONTA de B (FK composta)', !!e7, e7 ?? 'VINCULOU — FALHA GRAVE');

  const e7b = await deveFalhar(() =>
    db.query(`insert into public.faturas (user_id,conta_id,emissor,valor,vencimento) values ($1,$2,'X',1,current_date)`, [A, contaB]));
  ok('T7b A não consegue vincular FATURA à conta de B', !!e7b, e7b ?? 'VINCULOU — FALHA GRAVE');

  // Transferir a própria linha para B (with check do UPDATE)
  const e9 = await deveFalhar(() =>
    db.query(`update public.movimentacoes set user_id=$1 where id=$2`, [B, movA]));
  ok('T9 A não consegue transferir a própria linha para B', !!e9, e9 ?? 'TRANSFERIU — FALHA GRAVE');
});

// T8 — "roubo": A tenta puxar a linha de B para si
await comoUsuario(db, A, async () => {
  const roubo = await db.query(`update public.movimentacoes set user_id=$1 where id=$2 returning id`, [A, movB]);
  ok('T8 A não consegue ROUBAR a linha de B', roubo.rows.length === 0, `${roubo.rows.length} linha(s)`);
});

/* ---------------------------------------------------------------- *
 * Operações autorizadas
 * ---------------------------------------------------------------- */
await comoUsuario(db, A, async () => {
  const ins = await db.query(
    `insert into public.movimentacoes (user_id,tipo,descricao,valor,data,conta_id) values ($1,'despesa','Mercado',250.40,current_date,$2) returning id`, [A, contaA]);
  ok('T10a INSERT autorizado funciona', ins.rows.length === 1);

  const upd = await db.query(`update public.movimentacoes set valor=260 where id=$1 returning valor, atualizado_em`, [ins.rows[0].id]);
  ok('T10b UPDATE autorizado funciona', upd.rows.length === 1 && Number(upd.rows[0].valor) === 260);

  const del = await db.query(`delete from public.movimentacoes where id=$1 returning id`, [ins.rows[0].id]);
  ok('T10c DELETE autorizado funciona', del.rows.length === 1);

  const p = await db.query(`update public.perfis set consentimento_ia=true where id=$1 returning consentimento_ia`, [A]);
  ok('T10d usuário atualiza o próprio perfil', p.rows.length === 1 && p.rows[0].consentimento_ia === true);

  const ep = await deveFalhar(() => db.query(`update public.perfis set consentimento_ia=true where id=$1`, [B]));
  const p2 = await db.query(`select consentimento_ia from public.perfis where id=$1`, [B]);
  ok('T10e A não altera o perfil de B', ep !== null || p2.rows.length === 0);
});

/* ---------------------------------------------------------------- *
 * Visitante anônimo
 * ---------------------------------------------------------------- */
await comoAnonimo(db, async () => {
  const e = await deveFalhar(() => db.query(`select * from public.movimentacoes`));
  ok('T14 anon não tem privilégio em movimentacoes', !!e, e ?? 'LEU — FALHA GRAVE');
  const e2 = await deveFalhar(() => db.query(`select * from public.perfis`));
  ok('T14b anon não tem privilégio em perfis', !!e2, e2 ?? 'LEU — FALHA GRAVE');
  const e3 = await deveFalhar(() => db.query(`insert into public.movimentacoes (user_id,tipo,descricao,valor,data,conta_id) values ($1,'despesa','x',1,current_date,$2)`, [A, contaA]));
  ok('T14c anon não consegue inserir', !!e3, e3 ?? 'INSERIU — FALHA GRAVE');
});

/* ---------------------------------------------------------------- *
 * Integridade e exclusão
 * ---------------------------------------------------------------- */
// T11 — apagar conta com movimentações deve falhar (FK adiada, erro no commit)
await db.exec('begin');
let erroT11 = null;
try {
  await db.query(`delete from public.contas where id=$1`, [contaA]);
  await db.exec('commit');
} catch (e) {
  erroT11 = e.message.split('\n')[0];
  await db.exec('rollback').catch(() => {});
}
ok('T11 não apaga conta que ainda tem movimentações', !!erroT11, erroT11 ?? 'APAGOU — perda de histórico');

// T12 — apagar fatura preserva movimentações e anula o vínculo
await db.query(`delete from public.faturas where id=$1`, [fatA]);
const sobrou = await db.query(`select fatura_id from public.movimentacoes where id=$1`, [movA]);
ok('T12 apagar fatura preserva a movimentação', sobrou.rows.length === 1, `${sobrou.rows.length} linha(s)`);
ok('T12b vínculo fatura_id foi anulado (SET NULL)', sobrou.rows.length === 1 && sobrou.rows[0].fatura_id === null);

// T13 — exclusão da conta de usuário apaga tudo, apesar da FK adiada
let erroT13 = null;
try {
  await db.query(`delete from auth.users where id=$1`, [A]);
} catch (e) {
  erroT13 = e.message.split('\n')[0];
}
const restou = await db.query(
  `select (select count(*) from public.movimentacoes where user_id=$1) m,
          (select count(*) from public.contas        where user_id=$1) c,
          (select count(*) from public.perfis        where id=$1)      p`, [A]);
const z = restou.rows[0];
ok('T13 exclusão da conta de usuário não é bloqueada pela FK adiada', erroT13 === null, erroT13 ?? '');
ok('T13b exclusão apaga movimentações, contas e perfil (LGPD)',
   Number(z.m) === 0 && Number(z.c) === 0 && Number(z.p) === 0, `m=${z.m} c=${z.c} p=${z.p}`);
const sobrouB = await db.query(`select count(*) n from public.movimentacoes where user_id=$1`, [B]);
ok('T13c dados de B permanecem intactos', Number(sobrouB.rows[0].n) === 1);

/* ---------------------------------------------------------------- *
 * Restrições de valor
 * ---------------------------------------------------------------- */
const eNeg = await deveFalhar(() => db.query(
  `insert into public.movimentacoes (user_id,tipo,descricao,valor,data,conta_id) values ($1,'despesa','neg',-5,current_date,$2)`, [B, contaB]));
ok('T16a valor negativo rejeitado', !!eNeg);
const eParc = await deveFalhar(() => db.query(
  `insert into public.movimentacoes (user_id,tipo,descricao,valor,data,conta_id,parcela_atual,parcela_total) values ($1,'despesa','p',10,current_date,$2,5,3)`, [B, contaB]));
ok('T16b parcela incoerente (5/3) rejeitada', !!eParc);
const eCor = await deveFalhar(() => db.query(`insert into public.contas (user_id,nome,cor) values ($1,'X','vermelho')`, [B]));
ok('T16c cor fora do padrão hex rejeitada', !!eCor);
const eLim = await deveFalhar(() => db.query(`insert into public.contas (user_id,nome,tipo,limite) values ($1,'Y','corrente',500)`, [B]));
ok('T16d limite em conta que não é cartão rejeitado', !!eLim);
const eMeta = await deveFalhar(() => db.query(`insert into public.metas (user_id,nome,alvo,atual,prazo) values ($1,'M',100,200,current_date)`, [B]));
ok('T16e meta com guardado > alvo rejeitada', !!eMeta);

/* ---------------------------------------------------------------- *
 * Relatório
 * ---------------------------------------------------------------- */
const falhas = r.filter((x) => !x.ok);
console.log('\n' + '='.repeat(74));
r.forEach((x) => console.log(`${x.ok ? ' PASSOU ' : ' FALHOU '} ${x.n}${x.d ? '  ·  ' + x.d : ''}`));
console.log('='.repeat(74));
console.log(`${r.length - falhas.length}/${r.length} testes passaram`);
process.exitCode = falhas.length ? 1 : 0;
