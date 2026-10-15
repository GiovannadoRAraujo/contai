/**
 * Testes da migração 004 (sincronização): isolamento, "mais recente vence",
 * exclusões, limites, privilégios, exclusão de conta e Storage.
 * Roda em PGlite, sem tocar em nenhum banco remoto.
 */
import { novoBanco, comoUsuario, comoAnonimo, deveFalhar } from './harness.mjs';

const r = [];
const ok = (n, c, d = '') => r.push({ n, ok: !!c, d });

const { db } = await novoBanco();
const novoUsuario = async (email) =>
  (await db.query(`insert into auth.users (email) values ($1) returning id`, [email])).rows[0].id;
const A = await novoUsuario('a@exemplo.com');
const B = await novoUsuario('b@exemplo.com');

const enviar = (lote) => db.query(`select public.sincronizar_registros($1::jsonb) as n`, [JSON.stringify(lote)]);
const reg = (id, valor, em, extra = {}) => ({
  colecao: 'movimentacoes', id, modificado_em: em,
  dados: { id, descricao: `Mov ${id}`, valor }, ...extra,
});

// S1 — envio em lote
await comoUsuario(db, A, async () => {
  const res = await enviar([reg('m1', 10, '2026-10-01T10:00:00Z'), reg('m2', 20, '2026-10-01T10:00:00Z')]);
  ok('S1 envio em lote grava os registros', res.rows[0].n === 2);
});

// S2 — mais recente vence; mais antigo é ignorado
await comoUsuario(db, A, async () => {
  const antigo = await enviar([reg('m1', 999, '2026-09-30T10:00:00Z')]);
  const novo = await enviar([reg('m2', 25, '2026-10-02T10:00:00Z')]);
  const linhas = (await db.query(`select id, dados->>'valor' as v from public.registros_sync order by id`)).rows;
  ok('S2 alteração mais antiga não sobrescreve', antigo.rows[0].n === 0 && linhas[0].v === '10');
  ok('S2b alteração mais recente sobrescreve', novo.rows[0].n === 1 && linhas[1].v === '25');
});

// S3 — exclusão vira tombstone e propaga
await comoUsuario(db, A, async () => {
  await enviar([{ colecao: 'movimentacoes', id: 'm1', modificado_em: '2026-10-03T10:00:00Z', excluido: true }]);
  const l = (await db.query(`select excluido, dados from public.registros_sync where id = 'm1'`)).rows[0];
  ok('S3 exclusão registrada como tombstone sem dados', l.excluido === true && l.dados === null);
});

// S4 — atualizado_servidor é do servidor e avança a cada mudança
await comoUsuario(db, A, async () => {
  const antes = (await db.query(`select atualizado_servidor from public.registros_sync where id='m2'`)).rows[0].atualizado_servidor;
  await enviar([reg('m2', 30, '2026-10-04T10:00:00Z')]);
  const depois = (await db.query(`select atualizado_servidor from public.registros_sync where id='m2'`)).rows[0].atualizado_servidor;
  ok('S4 atualizado_servidor avança a cada alteração', new Date(depois) > new Date(antes));
});

// S5 — isolamento entre usuários
await comoUsuario(db, B, async () => {
  await enviar([reg('m1', 1, '2026-10-05T10:00:00Z')]); // mesmo id, outro usuário
  const vis = (await db.query(`select user_id from public.registros_sync`)).rows;
  ok('S5 B enxerga só as próprias linhas', vis.length === 1 && vis.every((x) => x.user_id === B));
  const upd = await db.query(`update public.registros_sync set excluido = true where user_id = $1`, [A]);
  ok('S5b B não altera linhas de A', upd.affectedRows === 0);
  const ins = await deveFalhar(() => db.query(
    `insert into public.registros_sync (user_id, colecao, id, dados, modificado_em) values ($1,'metas','x','{}','2026-10-05')`, [A]));
  ok('S5c B não insere em nome de A', ins !== null, ins ?? '');
});
await comoUsuario(db, A, async () => {
  const m1 = (await db.query(`select excluido from public.registros_sync where id = 'm1'`)).rows;
  ok('S5d o m1 de B não afetou o m1 de A', m1.length === 1 && m1[0].excluido === true);
});

// S6 — anônimo não acessa nada
await comoAnonimo(db, async () => {
  const sel = await deveFalhar(() => db.query(`select * from public.registros_sync`));
  const rpc = await deveFalhar(() => enviar([reg('z', 1, '2026-10-01')]));
  const del = await deveFalhar(() => db.query(`select public.excluir_minha_conta()`));
  ok('S6 anônimo sem acesso à tabela', sel !== null, sel ?? '');
  ok('S6b anônimo não executa o envio', rpc !== null, rpc ?? '');
  ok('S6c anônimo não executa exclusão de conta', del !== null, del ?? '');
});

// S7 — validações
await comoUsuario(db, A, async () => {
  const col = await deveFalhar(() => enviar([{ colecao: 'senhas', id: 'x', modificado_em: '2026-10-01', dados: {} }]));
  const futuro = await deveFalhar(() => enviar([reg('f', 1, '2999-01-01T00:00:00Z')]));
  const naoObj = await deveFalhar(() => enviar([{ colecao: 'metas', id: 'y', modificado_em: '2026-10-01', dados: [1, 2] }]));
  const grande = await deveFalhar(() => enviar(Array.from({ length: 501 }, (_, i) => reg(`g${i}`, i, '2026-10-01'))));
  ok('S7 coleção desconhecida recusada', col !== null, col ?? '');
  ok('S7b data no futuro distante recusada', futuro !== null, futuro ?? '');
  ok('S7c dados precisam ser objeto', naoObj !== null, naoObj ?? '');
  ok('S7d lote acima de 500 recusado', grande !== null, grande ?? '');
});

// S8 — Storage: cada um só na própria pasta
await db.query(`insert into storage.objects (bucket_id, name) values ('documentos', $1)`, [`${A}/doc1`]);
await comoUsuario(db, B, async () => {
  const ver = (await db.query(`select name from storage.objects`)).rows;
  const enviaFora = await deveFalhar(() => db.query(`insert into storage.objects (bucket_id, name) values ('documentos', $1)`, [`${A}/invasao`]));
  await db.query(`insert into storage.objects (bucket_id, name) values ('documentos', $1)`, [`${B}/doc2`]);
  ok('S8 B não vê arquivos de A', ver.length === 0);
  ok('S8b B não grava na pasta de A', enviaFora !== null, enviaFora ?? '');
});
const bucket = (await db.query(`select public from storage.buckets where id='documentos'`)).rows[0];
ok('S8c bucket de documentos é privado', bucket && bucket.public === false);

// S9 — exclusão da própria conta remove usuário e dados, sem tocar no outro
await comoUsuario(db, A, async () => { await db.query(`select public.excluir_minha_conta()`); });
const restA = (await db.query(`select count(*)::int n from public.registros_sync where user_id = $1`, [A])).rows[0].n;
const userA = (await db.query(`select count(*)::int n from auth.users where id = $1`, [A])).rows[0].n;
const restB = (await db.query(`select count(*)::int n from public.registros_sync where user_id = $1`, [B])).rows[0].n;
ok('S9 conta excluída: usuário e registros de A removidos', restA === 0 && userA === 0);
ok('S9b dados de B preservados', restB === 1);

// --------------------------------------------------------------------------
const falhas = r.filter((x) => !x.ok);
for (const x of r) console.log(`${x.ok ? '✓' : '✗'} ${x.n}${x.d ? `  — ${x.d}` : ''}`);
console.log(`\n${r.length - falhas.length}/${r.length} testes de sincronização passaram`);
process.exit(falhas.length ? 1 : 0);
