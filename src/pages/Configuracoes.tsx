import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Brain, Check, Database, Download, Eye, FileText, HardDrive, Pencil, Plus, ShieldCheck, Tags,
  Trash2, Upload, Wallet, X,
} from 'lucide-react';
import { Badge, CabecalhoCard, Campo, Card, Confirmacao, Entrada, Modal, Selecao } from '@/components/ui';
import { useApp } from '@/store/app';
import { brl, dataBR, hoje, parseBRL, uid } from '@/lib/format';
import { IA_CONFIGURADA, IA_ENDPOINT } from '@/lib/documentos';
import { usoArmazenamento, pedirPersistencia } from '@/lib/db';
import { baixar, gerarBackup, gravarArquivosDoBackup, validarBackup, type ResultadoValidacao } from '@/lib/backup';
import { CATEGORIAS_DESPESA, CATEGORIAS_RECEITA } from '@/lib/categorias';
import type { Conta } from '@/types';
import { CartaoConta } from '@/components/Conta';
import { useNav } from '@/store/nav';
import { useNuvem } from '@/store/nuvem';

const CORES = ['#8B5CF6', '#27D9D0', '#2DE2A6', '#FF9F43', '#F052A0', '#60A5FA'];

export default function Configuracoes() {
  return (
    <div className="grid gap-5 pb-8 xl:grid-cols-2">
      <div className="space-y-5">
        <CartaoConta />
        <ArmazenamentoLocal />
        <PrivacidadeIA />
        <Contas />
        <Categorias />
      </div>
      <div className="space-y-5">
        <Backup />
        <Memoria />
        <Demonstracao />
        <ZonaPerigo />
      </div>
    </div>
  );
}

/* --------------------------- Armazenamento --------------------------- */
function ArmazenamentoLocal() {
  const { avisar, persistencia } = useApp();
  const { usuario } = useNuvem();
  const [uso, setUso] = useState<Awaited<ReturnType<typeof usoArmazenamento>>>(null);

  useEffect(() => { void usoArmazenamento().then(setUso).catch(() => setUso(null)); }, []);

  return (
    <Card className="p-5">
      <CabecalhoCard titulo="Onde seus dados ficam" icone={<HardDrive size={16} className="text-roxo-luz" />} />
      {usuario ? (
        <ul className="space-y-2 text-[12.5px] leading-relaxed text-txt2">
          <li className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-verde" />
            <span>Os dados ficam <strong className="text-txt">neste navegador (IndexedDB)</strong> e também <strong className="text-txt">na sua conta</strong> ({usuario.email}), num banco Supabase onde cada usuário só acessa as próprias linhas.</span></li>
          <li className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-verde" />
            <span>Celular e computador ficam iguais ao entrar com a mesma conta. Sem internet, as alterações esperam e sobem depois.</span></li>
          <li className="flex gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-laranja" />
            <span>Não há criptografia de ponta a ponta: quem administra o projeto Supabase tem acesso técnico ao banco. Você pode excluir a conta e todos os dados do servidor em “Conta e sincronização”.</span></li>
        </ul>
      ) : (
      <ul className="space-y-2 text-[12.5px] leading-relaxed text-txt2">
        <li className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-verde" />
          <span>Tudo fica salvo <strong className="text-txt">somente neste navegador, neste dispositivo</strong>, no banco local IndexedDB. Não há servidor do contAI guardando seus dados.</span></li>
        <li className="flex gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-laranja" />
          <span><strong className="text-txt">Não há sincronização</strong> entre celular e computador, nem entre navegadores diferentes, e isto <strong className="text-txt">não é um backup na nuvem</strong>. Limpar os dados do site, usar janela anônima ou trocar de aparelho faz os dados sumirem — exporte backups.</span></li>
        <li className="flex gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-laranja" />
          <span>O contAI funciona <strong className="text-txt">sem login</strong>. Qualquer pessoa com acesso a este navegador consegue ver os dados. Se o app estiver publicado na internet, abrir o endereço <strong className="text-txt">não equivale a ter uma conta privada</strong>: cada navegador tem os seus próprios dados locais. Para usar em mais de um aparelho, crie uma conta opcional em “Conta e sincronização”.</span></li>
      </ul>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card2/50 p-3 text-[12px] text-txt2">
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${persistencia === 'erro' ? 'bg-rosa' : 'bg-verde'}`} />
          {persistencia === 'erro' ? 'Falha ao gravar' : persistencia === 'salvando' ? 'Salvando…' : 'Salvo neste navegador'}
        </span>
        {uso && (
          <>
            <span className="text-txt3">·</span>
            <span>{(uso.usado / 1024 / 1024).toFixed(1)} MB usados</span>
            <span className="text-txt3">·</span>
            <span>{uso.persistente ? 'Armazenamento protegido contra limpeza automática' : 'O navegador pode limpar os dados se faltar espaço'}</span>
          </>
        )}
        {uso && !uso.persistente && (
          <button type="button" className="ml-auto font-semibold text-roxo-luz hover:text-txt" onClick={async () => {
            const ok = await pedirPersistencia();
            setUso(await usoArmazenamento());
            avisar(ok ? 'O navegador vai manter os dados mesmo com pouco espaço.' : 'O navegador não concedeu a proteção agora. Mantenha backups em dia.', ok ? 'ok' : 'info');
          }}>Pedir proteção</button>
        )}
      </div>
    </Card>
  );
}

/* ----------------------------- Privacidade ----------------------------- */
function PrivacidadeIA() {
  const { estado, dispatch, avisar } = useApp();
  const { ir } = useNav();
  return (
    <Card className="p-5">
      <CabecalhoCard titulo="Privacidade e IA" icone={<ShieldCheck size={16} className="text-roxo-luz" />} />
      <div className="space-y-2.5">
        <Opcao
          titulo="Permitir que o assistente consulte meus registros"
          descricao="O Assistente contAI lê, no próprio navegador, só os registros necessários para cada pergunta. Nada é enviado para fora."
          ligado={estado.prefs.consentimentoIA}
          onMudar={(v) => { dispatch({ t: 'prefs', dados: { consentimentoIA: v } }); avisar(v ? 'Permissão concedida.' : 'Permissão revogada. O assistente não lerá seus registros.', 'info'); }}
        />
        <Opcao
          titulo="Enviar documentos e dados ao serviço de IA externo"
          descricao={IA_CONFIGURADA
            ? `Autoriza o envio de documentos e de resumos financeiros ao backend ${IA_ENDPOINT}. Sem isso, tudo é processado localmente.`
            : 'Nenhum serviço externo de IA está configurado nesta instalação (VITE_IA_ENDPOINT vazio). Esta opção não tem efeito.'}
          ligado={estado.prefs.consentimentoEnvioExterno}
          desativado={!IA_CONFIGURADA}
          onMudar={(v) => { dispatch({ t: 'prefs', dados: { consentimentoEnvioExterno: v } }); avisar(v ? 'Envio externo autorizado.' : 'Envio externo revogado.', 'info'); }}
        />
        <Opcao
          titulo="Ocultar valores na tela"
          descricao="Substitui os valores por marcadores em todas as telas. Útil em locais públicos."
          ligado={estado.prefs.ocultarValores}
          onMudar={(v) => dispatch({ t: 'prefs', dados: { ocultarValores: v } })}
          icone={<Eye size={15} />}
        />
      </div>
      <button type="button" onClick={() => ir('privacidade')}
        className="mt-3 flex w-full items-center justify-between rounded-xl border border-line bg-card2/50 px-3.5 py-3 text-left text-[13px] font-medium text-txt transition-colors hover:border-roxo/50">
        <span className="flex items-center gap-2"><FileText size={15} className="text-roxo-luz" /> Termos de uso e Política de privacidade</span>
        <span className="text-txt3">›</span>
      </button>
      <p className="mt-3 text-[11.5px] leading-relaxed text-txt3">
        Documentos enviados são validados (formato, tamanho e conteúdo real do arquivo) e lidos no navegador com pdf.js e OCR.
        Na primeira leitura de imagem, o motor de OCR e o modelo de português são baixados da CDN jsDelivr — o seu arquivo não é enviado.
        Nenhuma chave de API fica no aplicativo.
      </p>
    </Card>
  );
}

/* -------------------------------- Contas -------------------------------- */
function Contas() {
  const { estado, dispatch, avisar } = useApp();
  const vazio = { nome: '', tipo: 'corrente' as Conta['tipo'], saldo: '', limite: '', cor: CORES[0] };
  const [form, setForm] = useState(vazio);
  const [editando, setEditando] = useState<Conta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [excluir, setExcluir] = useState<Conta | null>(null);

  const abrir = (c?: Conta) => {
    setErro(null);
    setEditando(c ?? null);
    setForm(c ? { nome: c.nome, tipo: c.tipo, saldo: c.saldoInicial.toFixed(2).replace('.', ','), limite: (c.limite ?? 0).toFixed(2).replace('.', ','), cor: c.cor } : vazio);
  };

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) { setErro('Informe o nome.'); return; }
    if (form.tipo === 'cartao' && !(parseBRL(form.limite) > 0)) { setErro('Informe o limite do cartão.'); return; }
    const conta: Conta = {
      ...(editando ?? {}),
      id: editando?.id ?? uid(),
      nome: form.nome.trim(),
      tipo: form.tipo,
      saldoInicial: form.tipo === 'cartao' ? 0 : parseBRL(form.saldo),
      limite: form.tipo === 'cartao' ? parseBRL(form.limite) : undefined,
      cor: form.cor,
    };
    dispatch(editando ? { t: 'conta.upd', conta } : { t: 'conta.add', conta });
    avisar(editando ? 'Conta atualizada.' : 'Conta adicionada.');
    setEditando(null);
    setForm(vazio);
    setErro(null);
  };

  const emUso = (id: string) => estado.movimentacoes.filter((m) => m.contaId === id).length;

  return (
    <Card className="p-5">
      <CabecalhoCard titulo="Contas e cartões" icone={<Wallet size={16} className="text-roxo-luz" />} />
      <ul className="mb-4 space-y-2">
        {estado.contas.map((c) => (
          <li key={c.id} className="flex items-center gap-3 rounded-xl border border-line bg-card2/50 p-3">
            <span className="h-9 w-1.5 rounded-full" style={{ background: c.cor }} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-txt">{c.nome}{c.demo && <Badge tom="laranja" className="!py-0">Demo</Badge>}</span>
              <span className="block text-[11.5px] text-txt3">
                {c.tipo === 'cartao' ? `Cartão de crédito · limite ${brl(c.limite ?? 0)}` : `${{ corrente: 'Conta corrente', poupanca: 'Poupança', carteira: 'Carteira', cartao: '' }[c.tipo]} · saldo inicial ${brl(c.saldoInicial)}`}
                {' · '}{emUso(c.id)} lançamento(s)
              </span>
            </span>
            <button type="button" onClick={() => abrir(c)} aria-label={`Editar ${c.nome}`} className="rounded-lg p-1.5 text-txt3 hover:bg-card hover:text-roxo-luz"><Pencil size={14} /></button>
            <button type="button" onClick={() => setExcluir(c)} aria-label={`Excluir ${c.nome}`} className="rounded-lg p-1.5 text-txt3 hover:bg-card hover:text-rosa"><Trash2 size={14} /></button>
          </li>
        ))}
      </ul>

      <form onSubmit={salvar} noValidate className="space-y-3 rounded-xl border border-line/70 p-3">
        <p className="text-[12.5px] font-semibold text-txt">{editando ? `Editar “${editando.nome}”` : 'Nova conta ou cartão'}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Nome"><Entrada value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Banco digital" /></Campo>
          <Campo rotulo="Tipo">
            <Selecao value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as Conta['tipo'] })}>
              <option value="corrente">Conta corrente</option>
              <option value="poupanca">Poupança</option>
              <option value="carteira">Carteira (dinheiro)</option>
              <option value="cartao">Cartão de crédito</option>
            </Selecao>
          </Campo>
          {form.tipo === 'cartao'
            ? <Campo rotulo="Limite (R$)"><Entrada value={form.limite} onChange={(e) => setForm({ ...form, limite: e.target.value })} inputMode="decimal" placeholder="3.000,00" /></Campo>
            : <Campo rotulo="Saldo inicial (R$)" dica="Saldo antes do primeiro lançamento no contAI"><Entrada value={form.saldo} onChange={(e) => setForm({ ...form, saldo: e.target.value })} inputMode="decimal" placeholder="0,00" /></Campo>}
          <Campo rotulo="Cor">
            <div className="flex gap-2 py-1.5">
              {CORES.map((c) => (
                <button key={c} type="button" onClick={() => setForm({ ...form, cor: c })} aria-label={`Cor ${c}`}
                  className={`h-7 w-7 rounded-full transition-transform ${form.cor === c ? 'scale-110 ring-2 ring-white/70 ring-offset-2 ring-offset-card' : ''}`} style={{ background: c }} />
              ))}
            </div>
          </Campo>
        </div>
        {erro && <p className="text-[12px] text-rosa">{erro}</p>}
        <div className="flex justify-end gap-2">
          {editando && <button type="button" className="btn-ghost" onClick={() => abrir()}>Cancelar</button>}
          <button type="submit" className="btn-primary"><Plus size={15} /> {editando ? 'Salvar' : 'Adicionar'}</button>
        </div>
      </form>

      <Confirmacao
        aberto={!!excluir}
        titulo="Excluir conta"
        mensagem={excluir ? (emUso(excluir.id)
          ? `“${excluir.nome}” tem ${emUso(excluir.id)} lançamento(s). Para não deixar movimentações sem conta, mova ou exclua esses lançamentos antes.`
          : `“${excluir.nome}” será removida.`) : ''}
        rotuloConfirmar={excluir && emUso(excluir.id) ? 'Entendi' : 'Excluir'}
        perigoso={!excluir || !emUso(excluir.id)}
        onCancelar={() => setExcluir(null)}
        onConfirmar={() => {
          if (excluir && !emUso(excluir.id)) { dispatch({ t: 'conta.del', id: excluir.id }); avisar('Conta excluída.', 'info'); }
          setExcluir(null);
        }}
      />
    </Card>
  );
}

/* ------------------------------ Categorias ------------------------------ */
function Categorias() {
  const { estado, dispatch, avisar } = useApp();
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<'despesa' | 'receita'>('despesa');
  const [erro, setErro] = useState<string | null>(null);

  const criar = (e: React.FormEvent) => {
    e.preventDefault();
    const n = nome.trim();
    if (!n) { setErro('Informe o nome da categoria.'); return; }
    const padrao = (tipo === 'despesa' ? CATEGORIAS_DESPESA : CATEGORIAS_RECEITA) as readonly string[];
    if (padrao.some((c) => c.toLowerCase() === n.toLowerCase()) || estado.categorias.some((c) => c.nome.toLowerCase() === n.toLowerCase() && c.tipo === tipo)) {
      setErro('Essa categoria já existe.'); return;
    }
    dispatch({ t: 'categoria.add', nome: n, tipo });
    avisar(`Categoria “${n}” criada.`);
    setNome('');
    setErro(null);
  };

  return (
    <Card className="p-5">
      <CabecalhoCard titulo="Categorias e regras de classificação" icone={<Tags size={16} className="text-roxo-luz" />} />
      <form onSubmit={criar} noValidate className="flex flex-wrap items-end gap-2">
        <Campo rotulo="Nova categoria" erro={erro ?? undefined} className="min-w-[180px] flex-1">
          <Entrada value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Pets" />
        </Campo>
        <Campo rotulo="Tipo" className="w-[130px]">
          <Selecao value={tipo} onChange={(e) => setTipo(e.target.value as 'despesa' | 'receita')}>
            <option value="despesa">Despesa</option>
            <option value="receita">Receita</option>
          </Selecao>
        </Campo>
        <button type="submit" className="btn-ghost"><Plus size={15} /> Criar</button>
      </form>

      {estado.categorias.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {estado.categorias.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-roxo/30 bg-roxo/10 py-1 pl-2.5 pr-1 text-[11.5px] font-medium text-roxo-luz">
              {c.nome} <span className="text-txt3">· {c.tipo}</span>
              <button type="button" aria-label={`Excluir categoria ${c.nome}`} onClick={() => { dispatch({ t: 'categoria.del', id: c.id }); avisar(`Categoria “${c.nome}” removida. Lançamentos existentes mantêm o nome.`, 'info'); }}
                className="rounded-full p-0.5 hover:bg-roxo/25 hover:text-txt"><X size={12} /></button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-5">
        <p className="mb-2 text-[12.5px] font-medium text-txt2">Regras aprendidas ({estado.regras.length})</p>
        {estado.regras.length === 0 ? (
          <p className="text-[12px] leading-relaxed text-txt3">
            Nenhuma regra ainda. Elas surgem quando você responde a uma dúvida na revisão de faturas, corrige a categoria
            de um lançamento importado ou diz ao assistente “classifique X como Y”.
          </p>
        ) : (
          <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {estado.regras.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-lg border border-line bg-card2/60 px-3 py-1.5 text-[12px]">
                <code className="min-w-0 truncate text-roxo-luz">{r.padrao}</code>
                <span className="text-txt3">→</span>
                <span className="text-txt">{r.categoria}</span>
                <span className="ml-auto shrink-0 text-[10.5px] text-txt3">{{ revisao: 'revisão', movimentacao: 'correção', assistente: 'assistente', manual: 'manual' }[r.origem]}</span>
                <button type="button" aria-label={`Excluir regra ${r.padrao}`} onClick={() => dispatch({ t: 'regra.del', id: r.id })}
                  className="rounded p-1 text-txt3 hover:text-rosa"><Trash2 size={12} /></button>
              </li>
            ))}
          </ul>
        )}
        {estado.correcoes.length > 0 && (
          <p className="mt-2 text-[11.5px] text-txt3">{estado.correcoes.length} correção(ões) de classificação registradas no histórico.</p>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------- Memória ------------------------------- */
function Memoria() {
  const { estado, dispatch, avisar } = useApp();
  const [confirmar, setConfirmar] = useState<'conversa' | 'aprendizado' | null>(null);

  return (
    <Card className="p-5">
      <CabecalhoCard titulo="Memória do assistente" icone={<Brain size={16} className="text-roxo-luz" />} />
      <p className="text-[12.5px] leading-relaxed text-txt2">
        Guardada neste navegador e recuperada quando você reabre o app: {estado.conversas.length} mensagem(ns) de conversa,{' '}
        {estado.memoria.preferencias.length} preferência(s), {estado.regras.length} regra(s) e {estado.correcoes.length} correção(ões).
      </p>
      {estado.memoria.preferencias.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {estado.memoria.preferencias.map((x) => (
            <li key={x.id} className="flex items-start gap-2 rounded-lg border border-line bg-card2/60 px-3 py-2 text-[12px] text-txt">
              <span className="min-w-0 flex-1">“{x.texto}” <span className="text-txt3">· {dataBR(x.em)}</span></span>
              <button type="button" aria-label="Esquecer esta preferência"
                onClick={() => dispatch({ t: 'memoria', dados: { preferencias: estado.memoria.preferencias.filter((y) => y.id !== x.id) } })}
                className="rounded p-0.5 text-txt3 hover:text-rosa"><X size={13} /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" disabled={!estado.conversas.length} onClick={() => setConfirmar('conversa')}>
          <Trash2 size={14} /> Apagar histórico de conversas
        </button>
        <button type="button" className="btn-ghost" disabled={!estado.memoria.preferencias.length && !estado.regras.length && !estado.correcoes.length}
          onClick={() => setConfirmar('aprendizado')}>
          <Brain size={14} /> Limpar informações aprendidas
        </button>
      </div>
      <Confirmacao
        aberto={!!confirmar}
        titulo={confirmar === 'conversa' ? 'Apagar histórico de conversas' : 'Limpar informações aprendidas'}
        mensagem={confirmar === 'conversa'
          ? 'Todas as mensagens trocadas com o assistente serão apagadas deste navegador.'
          : 'Preferências anotadas, regras de classificação e o histórico de correções serão apagados. As categorias e movimentações continuam.'}
        rotuloConfirmar="Apagar"
        onCancelar={() => setConfirmar(null)}
        onConfirmar={() => {
          dispatch(confirmar === 'conversa' ? { t: 'chat.limpar' } : { t: 'memoria.limpar' });
          avisar(confirmar === 'conversa' ? 'Histórico de conversas apagado.' : 'Informações aprendidas apagadas.', 'info');
          setConfirmar(null);
        }}
      />
    </Card>
  );
}

/* -------------------------------- Backup -------------------------------- */
function Backup() {
  const { estado, avisar, restaurar } = useApp();
  const [comArquivos, setComArquivos] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [validacao, setValidacao] = useState<ResultadoValidacao | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [importando, setImportando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const exportar = async () => {
    setExportando(true);
    try {
      const blob = await gerarBackup(estado, comArquivos);
      baixar(blob, `contai-backup-${hoje()}.json`);
      avisar(`Backup gerado (${(blob.size / 1024).toFixed(0)} KB). Guarde o arquivo em local seguro: ele contém seus dados financeiros.`);
    } catch (e) {
      avisar(`Não foi possível gerar o backup: ${e instanceof Error ? e.message : 'erro desconhecido'}.`, 'erro');
    } finally {
      setExportando(false);
    }
  };

  const exportarCsv = () => {
    const linhas = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Conta', 'Valor', 'Origem']];
    for (const m of estado.movimentacoes) {
      linhas.push([dataBR(m.data), m.tipo, m.descricao, m.categoria, estado.contas.find((c) => c.id === m.contaId)?.nome ?? '', m.valor.toFixed(2).replace('.', ','), m.origem]);
    }
    const csv = '﻿' + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    baixar(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `contai-movimentacoes-${hoje()}.csv`);
    avisar('Planilha de movimentações exportada.');
  };

  const escolher = async (f: File | undefined) => {
    if (!f) return;
    setNomeArquivo(f.name);
    setValidacao(await validarBackup(f));
  };

  const confirmarImportacao = async () => {
    if (!validacao?.ok || !validacao.estado) return;
    setImportando(true);
    try {
      await restaurar(validacao.estado);
      if (validacao.arquivos) await gravarArquivosDoBackup(validacao.arquivos);
      avisar('Backup restaurado com sucesso. Os dados anteriores deste navegador foram substituídos.');
      setValidacao(null);
    } catch (e) {
      avisar(`Falha ao restaurar: ${e instanceof Error ? e.message : 'erro ao gravar'}. Nenhum dado parcial foi mantido nas coleções.`, 'erro');
    } finally {
      setImportando(false);
    }
  };

  return (
    <Card className="p-5">
      <CabecalhoCard titulo="Backup e exportação" icone={<Database size={16} className="text-roxo-luz" />} />
      <p className="text-[12.5px] leading-relaxed text-txt2">
        O backup é um arquivo .json com todos os seus registros, preferências e memória do assistente. Use-o para guardar
        uma cópia ou levar os dados para outro navegador.
      </p>
      <label className="mt-3 flex items-center gap-2 text-[12.5px] text-txt2">
        <input type="checkbox" checked={comArquivos} onChange={(e) => setComArquivos(e.target.checked)} className="h-4 w-4 accent-[#7C3AED]" />
        Incluir os arquivos das faturas ({estado.documentos.length})
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={() => void exportar()} disabled={exportando}>
          <Download size={15} /> {exportando ? 'Gerando…' : 'Exportar backup'}
        </button>
        <button type="button" className="btn-ghost" onClick={() => input.current?.click()}>
          <Upload size={15} /> Importar backup
        </button>
        <button type="button" className="btn-ghost" onClick={exportarCsv} disabled={!estado.movimentacoes.length}>
          <Download size={15} /> Movimentações (CSV)
        </button>
        <input ref={input} type="file" accept="application/json,.json" className="sr-only" aria-label="Arquivo de backup"
          onChange={(e) => { void escolher(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      <Modal aberto={!!validacao} onFechar={() => setValidacao(null)} titulo="Importar backup" descricao={nomeArquivo} largura="max-w-md">
        {validacao && !validacao.ok && (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-rosa"><AlertTriangle size={16} /> O arquivo não pode ser importado</p>
            <ul className="space-y-1 rounded-xl border border-rosa/30 bg-rosa/[0.06] p-3 text-[12px] text-txt2">
              {validacao.erros.map((e) => <li key={e}>• {e}</li>)}
            </ul>
            <p className="text-[12px] text-txt3">Nenhum dado foi alterado.</p>
            <div className="flex justify-end"><button type="button" className="btn-ghost" onClick={() => setValidacao(null)}>Fechar</button></div>
          </div>
        )}
        {validacao?.ok && (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-verde"><Check size={16} /> Backup válido{validacao.exportadoEm ? `, exportado em ${dataBR(validacao.exportadoEm)}` : ''}</p>
            <ul className="grid grid-cols-2 gap-1.5 text-[12px]">
              {validacao.resumo?.map(([k, v]) => (
                <li key={k} className="flex justify-between rounded-lg border border-line bg-card2/60 px-2.5 py-1.5"><span className="text-txt2">{k}</span><strong className="text-txt">{v}</strong></li>
              ))}
            </ul>
            <p className="rounded-xl border border-laranja/40 bg-laranja/10 p-3 text-[12px] leading-relaxed text-txt">
              <strong className="text-laranja">Atenção:</strong> importar substitui <strong>todos</strong> os dados atuais deste navegador
              ({estado.movimentacoes.length} movimentações hoje). Se quiser manter uma cópia, exporte um backup antes.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setValidacao(null)}>Cancelar</button>
              <button type="button" className="btn-primary" onClick={() => void confirmarImportacao()} disabled={importando}>
                {importando ? 'Restaurando…' : 'Substituir e restaurar'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

/* ---------------------------- Demonstração ---------------------------- */
function Demonstracao() {
  const { dispatch, avisar, temDemo } = useApp();
  return (
    <Card className="p-5">
      <CabecalhoCard titulo="Dados de demonstração" />
      <p className="text-[12.5px] leading-relaxed text-txt2">
        Registros fictícios para conhecer o app. Ficam marcados como “Demo”, não usam dados bancários reais e podem ser
        removidos a qualquer momento sem afetar os seus registros.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {temDemo ? (
          <button type="button" className="btn border border-laranja/40 bg-laranja/10 text-laranja hover:bg-laranja/20"
            onClick={() => { dispatch({ t: 'demo.remover' }); avisar('Dados de demonstração removidos.'); }}>
            <Trash2 size={15} /> Remover dados de demonstração
          </button>
        ) : (
          <button type="button" className="btn-ghost" onClick={() => { dispatch({ t: 'demo.carregar' }); avisar('Dados de demonstração carregados.', 'info'); }}>
            <Database size={15} /> Carregar dados de demonstração
          </button>
        )}
      </div>
    </Card>
  );
}

/* ----------------------------- Zona de perigo ----------------------------- */
function ZonaPerigo() {
  const { apagarTudo, avisar } = useApp();
  const nuvem = useNuvem();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [apagando, setApagando] = useState(false);

  return (
    <Card className="border-rosa/30 p-5">
      <CabecalhoCard titulo="Apagar todos os dados" icone={<AlertTriangle size={16} className="text-rosa" />} />
      <p className="text-[12.5px] leading-relaxed text-txt2">
        Remove deste navegador todas as movimentações, contas, faturas e arquivos, metas, orçamentos, investimentos,
        preferências, conversas e memória do assistente. Não pode ser desfeito.
        {nuvem.usuario && (
          <> Com a conta conectada, este aparelho também <strong className="text-txt">sai da conta</strong>; os dados continuam no servidor.
          Para apagá-los de lá, use “Excluir conta”.</>
        )}
      </p>
      <button type="button" className="btn mt-3 border border-rosa/40 bg-rosa/10 text-rosa hover:bg-rosa/20" onClick={() => { setTexto(''); setAberto(true); }}>
        <Trash2 size={15} /> Apagar todos os dados
      </button>
      <Modal aberto={aberto} onFechar={() => setAberto(false)} titulo="Apagar todos os dados?" largura="max-w-md">
        <p className="text-[13px] leading-relaxed text-txt2">
          Esta ação apaga definitivamente tudo o que o contAI guardou neste navegador. Para confirmar, digite <strong className="text-txt">APAGAR</strong>.
        </p>
        <Entrada className="mt-3" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="APAGAR" aria-label="Confirmação" autoFocus />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => setAberto(false)}>Cancelar</button>
          <button type="button" disabled={texto.trim().toUpperCase() !== 'APAGAR' || apagando}
            className="btn bg-rosa/90 text-white hover:bg-rosa"
            onClick={async () => {
              setApagando(true);
              try {
                if (nuvem.usuario) await nuvem.sair();
                else await apagarTudo();
                avisar('Todos os dados locais foram apagados.', 'info');
                setAberto(false);
              } catch (e) {
                avisar(`Não foi possível apagar: ${e instanceof Error ? e.message : 'erro'}.`, 'erro');
              } finally {
                setApagando(false);
              }
            }}>
            {apagando ? 'Apagando…' : 'Apagar definitivamente'}
          </button>
        </div>
      </Modal>
    </Card>
  );
}

function Opcao({
  titulo, descricao, ligado, onMudar, icone, desativado = false,
}: { titulo: string; descricao: string; ligado: boolean; onMudar: (v: boolean) => void; icone?: React.ReactNode; desativado?: boolean }) {
  return (
    <div className={`flex items-start gap-3 rounded-xl border border-line bg-card2/50 p-3.5 ${desativado ? 'opacity-60' : ''}`}>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[13px] font-medium text-txt">{icone}{titulo}</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-txt2">{descricao}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-label={titulo}
        disabled={desativado}
        onClick={() => onMudar(!ligado)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${ligado ? 'bg-roxo' : 'border border-line bg-card2'}`}
      >
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${ligado ? 'left-6' : 'left-1'}`} />
      </button>
    </div>
  );
}
