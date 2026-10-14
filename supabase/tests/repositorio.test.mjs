/**
 * Testes de integração do repositório contra um projeto Supabase REAL.
 * SOMENTE para o projeto descartável — recusa rodar contra o projeto principal.
 *
 * Divide-se em dois blocos:
 *
 *   BLOCO A — comportamento diante de erros. Não precisa de sessão nem cria
 *             nada. Roda sempre.
 *   BLOCO B — CRUD, chaves estrangeiras e ordem de escrita. Precisa de dois
 *             usuários autenticados. Se não houver como autenticar, é pulado
 *             com explicação, em vez de falhar.
 *
 * Credenciais dos usuários de teste ficam em `.env.test.local` (ignorado pelo
 * Git) e são REUTILIZADAS entre execuções, para não acumular contas no projeto.
 *
 *   node supabase/tests/repositorio.test.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const imp = (p) => import('file:///' + resolve(RAIZ, p).replace(/\\/g, '/'));
const { criarRepositorio } = await imp('src/lib/repositorio.ts');
const { novoId } = await imp('src/lib/mapeamento.ts');

const lerEnv = (arq) => {
  const f = resolve(RAIZ, arq);
  if (!existsSync(f)) return {};
  return Object.fromEntries(
    readFileSync(f, 'utf8').split(/\r?\n/)
      .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
};

const teste = lerEnv('.env.test.local');
const principal = lerEnv('.env.local');
const URL = (teste.SUPABASE_TEST_URL ?? '').replace(/\/+$/, '');
const CHAVE = teste.SUPABASE_TEST_PUBLISHABLE_KEY ?? '';
const ref = (u) => (String(u).match(/^https?:\/\/([a-z0-9-]+)\./i) ?? [])[1] ?? '';

if (!URL || !CHAVE) { console.error('Faltam SUPABASE_TEST_URL / SUPABASE_TEST_PUBLISHABLE_KEY em .env.test.local.'); process.exit(2); }
if (CHAVE.startsWith('sb_secret_')) { console.error('PARE: chave secreta. Use a publicável.'); process.exit(2); }
if (ref(URL) && ref(URL) === ref(principal.VITE_SUPABASE_URL ?? '')) {
  console.error('ABORTAR: a URL de teste é a do PROJETO PRINCIPAL.'); process.exit(1);
}

const r = [];
const ok = (n, c, d = '') => r.push({ n, ok: !!c, d });
const pulado = [];
const cliente = () => createClient(URL, CHAVE, { auth: { persistSession: false, autoRefreshToken: false } });
const categoriaDe = async (fn) => { try { await fn(); return null; } catch (e) { return e?.categoria ?? `(sem categoria: ${e?.message})`; } };

console.log(`\nProjeto: ${ref(URL)}\n`);

/* ==================================================================== *
 * BLOCO A — comportamento diante de erros (sem sessão, sem criar nada)
 * ==================================================================== */
console.log('BLOCO A — erros\n');

const repoAnon = criarRepositorio(cliente());

ok('sem sessão, usuarioId() devolve categoria "sessao"',
   (await categoriaDe(() => repoAnon.usuarioId())) === 'sessao');

ok('leitura anônima devolve categoria "permissao"',
   (await categoriaDe(() => repoAnon.movimentacoes.listar())) === 'permissao');

ok('inserção anônima falha antes de tocar o banco ("sessao")',
   (await categoriaDe(() => repoAnon.contas.inserir({ id: novoId(), nome: 'X', tipo: 'corrente', saldoInicial: 0, cor: '#8B5CF6' }))) === 'sessao');

const repoRede = criarRepositorio(
  createClient('https://projeto-que-nao-existe-contai.supabase.co', CHAVE, { auth: { persistSession: false } }),
);
const catRede = await categoriaDe(() => repoRede.movimentacoes.listar());
ok('host inexistente devolve categoria "rede"', catRede === 'rede', `obtido: ${catRede}`);

/* ==================================================================== *
 * BLOCO B — CRUD, chaves estrangeiras e ordem
 * ==================================================================== */
async function autenticar(rotulo) {
  const chaveEmail = `TESTE_${rotulo}_EMAIL`;
  const chaveSenha = `TESTE_${rotulo}_SENHA`;
  let email = teste[chaveEmail];
  let senha = teste[chaveSenha];

  const sb = cliente();

  if (email && senha) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (!error && data.session) return { sb, id: data.user.id, email };
  }

  // Sem credenciais guardadas: só dá para criar se a autoconfirmação estiver ligada.
  const cfg = await (await fetch(`${URL}/auth/v1/settings`, { headers: { apikey: CHAVE } })).json();
  if (!cfg.mailer_autoconfirm) {
    throw new Error('confirmação de e-mail está ligada e não há credenciais guardadas em .env.test.local');
  }

  email = `repo-${rotulo.toLowerCase()}-${Date.now()}@example.com`;
  senha = `Repo!${novoId().slice(0, 12)}`;
  const { data, error } = await sb.auth.signUp({ email, password: senha, options: { data: { nome: `Repo ${rotulo}` } } });
  if (error) throw new Error(`cadastro falhou: ${error.message}`);
  if (!data.session) {
    const { error: e2 } = await sb.auth.signInWithPassword({ email, password: senha });
    if (e2) throw new Error(`login falhou: ${e2.message}`);
  }
  // Guarda para reutilizar nas próximas execuções, em vez de acumular contas.
  appendFileSync(resolve(RAIZ, '.env.test.local'), `\n${chaveEmail}=${email}\n${chaveSenha}=${senha}\n`);
  return { sb, id: (await sb.auth.getUser()).data.user.id, email };
}

let A = null; let B = null; let motivoPulo = null;
try {
  A = await autenticar('A');
  B = await autenticar('B');
} catch (e) {
  motivoPulo = e.message;
}

if (!A || !B) {
  console.log(`\nBLOCO B — PULADO\n  motivo: ${motivoPulo}\n`);
  pulado.push('CRUD, chaves estrangeiras, ordem de escrita e isolamento entre usuários');
} else {
  console.log('\nBLOCO B — CRUD e integridade\n');
  const repoA = criarRepositorio(A.sb);
  const repoB = criarRepositorio(B.sb);

  // Estado limpo antes de começar
  await repoA.limparTudo();
  await repoB.limparTudo();

  /* ----------------------------- Perfil ----------------------------- */
  const perfilA = await repoA.perfil.obter();
  ok('perfil do usuário existe e é lido', !!perfilA, perfilA?.nome);
  const atualizado = await repoA.perfil.atualizar({ consentimentoIA: true, ocultarValores: true });
  ok('perfil: atualização parcial grava e devolve', atualizado.consentimentoIA === true && atualizado.ocultarValores === true);
  await repoA.perfil.atualizar({ consentimentoIA: false, ocultarValores: false });

  /* -------------------- Ordem de inserção: conta → fatura → mov ------- */
  const idConta = novoId();
  const [conta] = await repoA.contas.inserir({ id: idConta, nome: 'Nubank', tipo: 'corrente', saldoInicial: 1234.56, cor: '#8B5CF6' });
  ok('conta inserida e devolvida com os mesmos valores',
     conta.id === idConta && conta.saldoInicial === 1234.56 && conta.nome === 'Nubank');

  const idFatura = novoId();
  const [fatura] = await repoA.faturas.inserir({
    id: idFatura, contaId: idConta, emissor: 'Enel', referencia: 'Conta de luz',
    valor: 189.9, vencimento: '2026-10-17', status: 'pendente', cor: '#FF9F43', sigla: 'en', paginas: 1, importada: false,
  });
  ok('fatura inserida vinculada à conta', fatura.contaId === idConta && fatura.valor === 189.9);

  const idMov = novoId();
  const [mov] = await repoA.movimentacoes.inserir({
    id: idMov, tipo: 'despesa', descricao: 'Enel', valor: 189.9, data: '2026-10-09',
    categoria: 'Moradia', contaId: idConta, origem: 'manual', faturaId: idFatura,
    parcela: { atual: 2, total: 12 }, hash: 'h1',
  });
  ok('movimentação inserida com conta, fatura e parcela',
     mov.contaId === idConta && mov.faturaId === idFatura && mov.parcela?.atual === 2 && mov.parcela?.total === 12);

  /* ----------------- Importação sem fatura (importacao_id) ----------- */
  const lote = novoId();
  const [movLote] = await repoA.movimentacoes.inserir({
    id: novoId(), tipo: 'despesa', descricao: 'IFOOD', valor: 54.3, data: '2026-10-10',
    categoria: 'Alimentação', contaId: idConta, origem: 'ia', importacaoId: lote,
  });
  ok('movimentação importada sem fatura usa importacao_id',
     movLote.importacaoId === lote && movLote.faturaId === undefined);

  /* -------------------------- Leitura e volta ------------------------ */
  const lidas = await repoA.movimentacoes.listar();
  const lida = lidas.find((x) => x.id === idMov);
  ok('leitura devolve o mesmo que foi gravado',
     lida && lida.valor === 189.9 && lida.categoria === 'Moradia' && lida.parcela?.total === 12);
  ok('listagem vem ordenada por data decrescente',
     lidas.length === 2 && lidas[0].data >= lidas[1].data);

  /* ------------------------------ Update ----------------------------- */
  const alterada = await repoA.movimentacoes.atualizar({ ...lida, valor: 200.5, descricao: 'Enel (revisado)' });
  ok('atualização grava e devolve o novo valor', alterada.valor === 200.5 && alterada.descricao === 'Enel (revisado)');

  /* ----------------- Erros: UUID inválido e id inexistente ----------- */
  const catUuid = await categoriaDe(() => repoA.movimentacoes.excluir('nao-e-uuid'));
  ok('id em formato inválido devolve "validacao"', catUuid === 'validacao', `obtido: ${catUuid}`);

  const catInexistente = await categoriaDe(() => repoA.movimentacoes.excluir(novoId()));
  ok('id inexistente devolve "permissao" (RLS filtrou, zero linhas)', catInexistente === 'permissao', `obtido: ${catInexistente}`);

  /* ------------------ Isolamento e referência cruzada ---------------- */
  ok('B não enxerga os dados de A', (await repoB.movimentacoes.listar()).length === 0);

  const catCruzada = await categoriaDe(() => repoB.movimentacoes.inserir({
    id: novoId(), tipo: 'despesa', descricao: 'cruzada', valor: 10, data: '2026-10-10',
    categoria: 'Outros', contaId: idConta, origem: 'manual',
  }));
  ok('B não vincula movimentação à conta de A', catCruzada === 'vinculo', `obtido: ${catCruzada}`);

  const catRoubo = await categoriaDe(() => repoB.movimentacoes.atualizar({ ...lida, valor: 1 }));
  ok('B não altera a movimentação de A', catRoubo === 'permissao', `obtido: ${catRoubo}`);

  /* ----------------------- Ordem de exclusão ------------------------ */
  const catOrdem = await categoriaDe(() => repoA.contas.excluir(idConta));
  ok('excluir conta antes das movimentações devolve "vinculo"', catOrdem === 'vinculo', `obtido: ${catOrdem}`);

  await repoA.movimentacoes.excluir(idMov);
  await repoA.movimentacoes.excluir(movLote.id);
  await repoA.faturas.excluir(idFatura);
  await repoA.contas.excluir(idConta);
  ok('na ordem correta, a exclusão completa funciona',
     (await repoA.movimentacoes.listar()).length === 0 && (await repoA.contas.listar()).length === 0);

  /* ------------------- Demais entidades, ida e volta ----------------- */
  const [inv] = await repoA.investimentos.inserir({ id: novoId(), nome: 'Tesouro Selic', modalidade: 'Tesouro Direto', valorInvestido: 5000, rentabilidade: 8.24, atualizadoEm: '2026-10-12', ativo: true });
  ok('investimento: ida e volta pelo banco', inv.valorInvestido === 5000 && inv.atualizadoEm === '2026-10-12');

  const [meta] = await repoA.metas.inserir({ id: novoId(), nome: 'Viagem', alvo: 6000, atual: 3600, prazo: '2027-06-01', cor: '#A855F7' });
  ok('meta: ida e volta pelo banco', meta.alvo === 6000 && meta.atual === 3600);

  const [orc] = await repoA.orcamentos.inserir({ categoria: 'Alimentação', limite: 900 });
  ok('orçamento: ida e volta pelo banco', orc.categoria === 'Alimentação' && orc.limite === 900);

  const [rec] = await repoA.recorrentes.inserir({ id: novoId(), descricao: 'Aluguel', valor: 950, diaVencimento: 5, tipo: 'despesa', categoria: 'Moradia', ativo: true });
  ok('recorrente: ida e volta pelo banco', rec.diaVencimento === 5 && rec.valor === 950);

  const [msg] = await repoA.mensagens.inserir({ id: novoId(), autor: 'ia', texto: 'Olá', detalhe: 'fonte', sugestoes: ['a', 'b'], em: new Date().toISOString() });
  ok('mensagem: ida e volta pelo banco', msg.texto === 'Olá' && msg.sugestoes?.length === 2);

  await repoA.categorias.adicionar('Pets');
  ok('categoria própria criada e lida', (await repoA.categorias.listar()).includes('Pets'));
  const catDup = await categoriaDe(() => repoA.categorias.adicionar('Pets'));
  ok('categoria repetida devolve "duplicado"', catDup === 'duplicado', `obtido: ${catDup}`);

  await repoA.regras.definir({ padrao: 'MP*SERV', categoria: 'Serviços' });
  await repoA.regras.definir({ padrao: 'mp*serv', categoria: 'Assinaturas' });
  const regras = await repoA.regras.listar();
  ok('regra regravada substitui em vez de duplicar',
     Object.keys(regras).length === 1 && regras['mp*serv'] === 'Assinaturas');

  /* ------------- Conta repetida e carga completa do estado ----------- */
  await repoA.contas.inserir({ id: novoId(), nome: 'Carteira', tipo: 'carteira', saldoInicial: 0, cor: '#2DE2A6' });
  const catNome = await categoriaDe(() => repoA.contas.inserir({ id: novoId(), nome: 'Carteira', tipo: 'carteira', saldoInicial: 0, cor: '#2DE2A6' }));
  ok('nome de conta repetido devolve "duplicado"', catNome === 'duplicado', `obtido: ${catNome}`);

  const estado = await repoA.carregarTudo();
  ok('carregarTudo devolve o estado completo',
     estado.usuario && estado.contas.length === 1 && estado.investimentos.length === 1 &&
     estado.metas.length === 1 && estado.orcamentos.length === 1 && estado.recorrentes.length === 1 &&
     estado.categoriasCustom.length === 1 && Object.keys(estado.regrasCategoria).length === 1 &&
     estado.conversas.length === 1,
     `contas=${estado.contas.length} inv=${estado.investimentos.length} msgs=${estado.conversas.length}`);

  /* ------------------------------ Limpeza --------------------------- */
  const contagemA = await repoA.limparTudo();
  const contagemB = await repoB.limparTudo();
  const totalA = Object.values(contagemA).reduce((s, n) => s + n, 0);
  ok('limparTudo remove tudo na ordem correta', totalA > 0, JSON.stringify(contagemA));
  const sobrou = await repoA.carregarTudo();
  ok('nada sobrou após a limpeza',
     sobrou.contas.length === 0 && sobrou.movimentacoes.length === 0 && sobrou.conversas.length === 0 &&
     Object.values(contagemB).reduce((s, n) => s + n, 0) === 0);

  // E-mails mascarados: as credenciais vivem só em .env.test.local.
  const mascarar = (e) => e.replace(/^(.{6}).*(@.*)$/, '$1…$2');
  console.log(`\n  usuários reutilizáveis: ${mascarar(A.email)} e ${mascarar(B.email)}`);
  console.log('  credenciais guardadas em .env.test.local — as próximas execuções reaproveitam.');
}

/* --------------------------------- Relatório ------------------------------ */
const falhas = r.filter((x) => !x.ok);
console.log('\n' + '='.repeat(76));
r.forEach((x) => console.log(`${x.ok ? ' PASSOU ' : ' FALHOU '} ${x.n}${x.d ? '  ·  ' + x.d : ''}`));
console.log('='.repeat(76));
console.log(`${r.length - falhas.length}/${r.length} testes passaram`);
if (pulado.length) console.log(`PULADO: ${pulado.join('; ')}`);
process.exitCode = falhas.length ? 1 : 0;
