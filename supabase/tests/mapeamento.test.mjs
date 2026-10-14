/**
 * Testes da conversão camelCase ↔ snake_case ↔ UUID.
 * Puros: não tocam banco nem rede.
 *
 *   node supabase/tests/mapeamento.test.mjs
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const M = await import(
  'file:///' + resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'lib', 'mapeamento.ts').replace(/\\/g, '/')
);

const r = [];
const ok = (n, c, d = '') => r.push({ n, ok: !!c, d });
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const UID = '11111111-1111-4111-8111-111111111111';

/* ----------------------------- Identificadores ----------------------------- */
ok('novoId() gera UUID v4 válido', M.ehUuid(M.novoId()));
ok('100 ids gerados são todos únicos e válidos', (() => {
  const s = new Set(Array.from({ length: 100 }, () => M.novoId()));
  return s.size === 100 && [...s].every(M.ehUuid);
})());
ok('ehUuid recusa o formato do uid() antigo', !M.ehUuid('m3k2j1abc123'));
ok('ehUuid recusa string vazia e nulo', !M.ehUuid('') && !M.ehUuid(null) && !M.ehUuid(undefined));

/* --------------------------------- Conta --------------------------------- */
const conta = { id: UID, nome: 'Nubank', tipo: 'corrente', saldoInicial: 12455.9, limite: undefined, cor: '#8B5CF6' };
const lConta = M.contaParaLinha(conta, UID);
ok('conta: saldoInicial → saldo_inicial', lConta.saldo_inicial === 12455.9);
ok('conta: user_id preenchido', lConta.user_id === UID);
ok('conta: ida e volta preserva o objeto', igual(M.contaParaDominio(lConta), conta));

const cartao = { id: UID, nome: 'Cartão', tipo: 'cartao', saldoInicial: 0, limite: 1800, cor: '#8B5CF6' };
ok('cartão: limite preservado', M.contaParaLinha(cartao, UID).limite === 1800);
ok('conta corrente com limite → limite vira null (restrição do banco)',
   M.contaParaLinha({ ...conta, limite: 500 }, UID).limite === null);

/* -------------------------------- Fatura --------------------------------- */
const fatura = {
  id: UID, contaId: UID, emissor: 'Enel', referencia: 'Conta de luz', valor: 189.9,
  vencimento: '2026-10-17', status: 'pendente', arquivoNome: 'luz.pdf',
  arquivoTipo: 'application/pdf', paginas: 1, importada: false, cor: '#FF9F43', sigla: 'en',
};
const lFatura = M.faturaParaLinha({ ...fatura, arquivoUrl: 'blob:http://localhost/efemero' }, UID);
ok('fatura: arquivoUrl NÃO é persistido', !('arquivo_url' in lFatura) && lFatura.arquivo_caminho === null);
ok('fatura: contaId → conta_id', lFatura.conta_id === UID);
ok('fatura: sem conta vira null', M.faturaParaLinha({ ...fatura, contaId: undefined }, UID).conta_id === null);
ok('fatura: sigla é truncada em 8 (restrição do banco)',
   M.faturaParaLinha({ ...fatura, sigla: 'umasiglagigante' }, UID).sigla.length === 8);
ok('fatura: ida e volta preserva os campos', igual(M.faturaParaDominio(lFatura), fatura));

/* ----------------------------- Movimentação ------------------------------ */
const mov = {
  id: UID, tipo: 'despesa', descricao: 'Enel', valor: 189.9, data: '2026-10-09',
  categoria: 'Moradia', contaId: UID, origem: 'manual',
};
const lMov = M.movimentacaoParaLinha(mov, UID);
ok('movimentação: contaId → conta_id', lMov.conta_id === UID);
ok('movimentação: sem parcela, as duas colunas ficam nulas',
   lMov.parcela_atual === null && lMov.parcela_total === null);
ok('movimentação: ida e volta preserva o objeto', igual(M.movimentacaoParaDominio(lMov), mov));

const parcelada = { ...mov, parcela: { atual: 3, total: 10 } };
const lParc = M.movimentacaoParaLinha(parcelada, UID);
ok('parcela: objeto → duas colunas', lParc.parcela_atual === 3 && lParc.parcela_total === 10);
ok('parcela: duas colunas → objeto', igual(M.movimentacaoParaDominio(lParc).parcela, { atual: 3, total: 10 }));

const comImportacao = { ...mov, importacaoId: UID, faturaId: undefined };
const lImp = M.movimentacaoParaLinha(comImportacao, UID);
ok('importacaoId → importacao_id, sem fatura_id', lImp.importacao_id === UID && lImp.fatura_id === null);

ok('valor numérico vindo como string é coagido',
   M.movimentacaoParaDominio({ ...lMov, valor: '189.90' }).valor === 189.9);
ok('valor inválido vira 0 em vez de NaN',
   M.movimentacaoParaDominio({ ...lMov, valor: 'abc' }).valor === 0);

/* ----------------------------- Investimento ------------------------------ */
const inv = { id: UID, nome: 'Tesouro Selic', modalidade: 'Tesouro Direto', valorInvestido: 5000, rentabilidade: 8.24, atualizadoEm: '2026-10-12', ativo: true };
const lInv = M.investimentoParaLinha(inv, UID);
ok('investimento: atualizadoEm → data_atualizacao (não a auditoria)', lInv.data_atualizacao === '2026-10-12');
ok('investimento: valorInvestido → valor_investido', lInv.valor_investido === 5000);
ok('investimento: ida e volta', igual(M.investimentoParaDominio(lInv), inv));
ok('rentabilidade negativa preservada',
   M.investimentoParaDominio(M.investimentoParaLinha({ ...inv, rentabilidade: -12.5 }, UID)).rentabilidade === -12.5);

/* -------------------------- Meta, orçamento, recorrente ------------------- */
const meta = { id: UID, nome: 'Viagem', alvo: 6000, atual: 3600, prazo: '2027-06-01', cor: '#A855F7' };
ok('meta: ida e volta', igual(M.metaParaDominio(M.metaParaLinha(meta, UID)), meta));

const orc = { categoria: 'Alimentação', limite: 900 };
const lOrc = M.orcamentoParaLinha(orc, UID);
ok('orçamento ganha id UUID (o app não tem id)', M.ehUuid(lOrc.id));
ok('orçamento: ida e volta preserva categoria e limite',
   M.orcamentoParaDominio(lOrc).categoria === 'Alimentação' && M.orcamentoParaDominio(lOrc).limite === 900);

const rec = { id: UID, descricao: 'Aluguel', valor: 950, diaVencimento: 5, tipo: 'despesa', categoria: 'Moradia', ativo: true };
ok('recorrente: diaVencimento → dia_vencimento', M.recorrenteParaLinha(rec, UID).dia_vencimento === 5);
ok('recorrente: ida e volta', igual(M.recorrenteParaDominio(M.recorrenteParaLinha(rec, UID)), rec));

/* -------------------------- Categorias e regras -------------------------- */
ok('categorias: linhas → array de nomes',
   igual(M.categoriasParaDominio([{ id: UID, user_id: UID, nome: 'Pets' }, { id: UID, user_id: UID, nome: 'Doações' }]), ['Pets', 'Doações']));
ok('regras: linhas → objeto { padrão: categoria }',
   igual(M.regrasParaDominio([{ id: UID, user_id: UID, padrao: 'MP', categoria: 'Serviços' }]), { mp: 'Serviços' }));
ok('regra: padrão é normalizado para minúsculas (índice único do banco)',
   M.regraParaLinha({ padrao: 'MP*SERV', categoria: 'Serviços' }, UID).padrao === 'mp*serv');

/* -------------------------------- Mensagem -------------------------------- */
const msg = { id: UID, autor: 'ia', texto: 'Você gastou R$ 712,39', detalhe: '4 lançamentos', sugestoes: ['Quais despesas aumentaram?'], em: '2026-10-14T12:00:00.000Z' };
const lMsg = M.mensagemParaLinha(msg, UID);
ok('mensagem: em → criado_em', lMsg.criado_em === msg.em);
ok('mensagem: sugestões viram text[]', Array.isArray(lMsg.sugestoes) && lMsg.sugestoes.length === 1);
ok('mensagem sem sugestões vira array vazio, não null',
   igual(M.mensagemParaLinha({ ...msg, sugestoes: undefined }, UID).sugestoes, []));
ok('mensagem: ida e volta', igual(M.mensagemParaDominio(lMsg), msg));

/* --------------------------------- Perfil --------------------------------- */
const perfilLinha = { id: UID, nome: 'Ana Souza', email: 'a@ex.com', consentimento_ia: true, ocultar_valores: false };
ok('perfil: consentimento_ia → consentimentoIA',
   M.perfilParaDominio(perfilLinha).consentimentoIA === true);
ok('perfil: atualização parcial envia só o que mudou',
   igual(M.perfilParaLinha({ ocultarValores: true }), { ocultar_valores: true }));
ok('perfil: nulos do banco viram strings vazias',
   M.perfilParaDominio({ ...perfilLinha, email: null, nome: '' }).email === '');

/* --------------------------------- Relatório ------------------------------ */
const falhas = r.filter((x) => !x.ok);
console.log('='.repeat(76));
r.forEach((x) => console.log(`${x.ok ? ' PASSOU ' : ' FALHOU '} ${x.n}${x.d ? '  ·  ' + x.d : ''}`));
console.log('='.repeat(76));
console.log(`${r.length - falhas.length}/${r.length} testes de mapeamento passaram`);
process.exitCode = falhas.length ? 1 : 0;
