import { useEffect, useState } from 'react';
import {
  AlertTriangle, Check, Cloud, CloudOff, Eye, EyeOff, KeyRound, Loader2, LogOut, Mail, RefreshCw, ShieldCheck, Trash2, UserPlus,
} from 'lucide-react';
import clsx from 'clsx';
import { CabecalhoCard, Campo, Card, Entrada, Modal } from './ui';
import { Marca } from './Logo';
import { useApp } from '@/store/app';
import { useNuvem, type StatusSync } from '@/store/nuvem';
import { useNav } from '@/store/nav';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validarSenha(s: string): string | null {
  if (s.length < 8) return 'Use pelo menos 8 caracteres.';
  if (!/[a-zA-Z]/.test(s) || !/\d/.test(s)) return 'Misture letras e números.';
  return null;
}

const ROTULO_STATUS: Record<StatusSync, { texto: string; cor: string }> = {
  desligado: { texto: 'Desconectado', cor: 'text-txt3' },
  sincronizando: { texto: 'Sincronizando…', cor: 'text-roxo-luz' },
  sincronizado: { texto: 'Sincronizado', cor: 'text-verde' },
  offline: { texto: 'Sem conexão — as alterações ficam guardadas e sobem quando a internet voltar', cor: 'text-laranja' },
  erro: { texto: 'Erro na sincronização', cor: 'text-rosa' },
};

const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'ainda não';

/* ------------------------- Indicador no topo ------------------------- */
export function IndicadorSync({ compacto = false }: { compacto?: boolean }) {
  const { usuario, status, pendentes } = useNuvem();
  const { ir } = useNav();
  if (!usuario) return null;
  const Icone = status === 'offline' || status === 'erro' ? CloudOff : Cloud;
  const cor = status === 'erro' ? 'text-rosa' : status === 'offline' ? 'text-laranja' : status === 'sincronizando' ? 'text-roxo-luz' : 'text-verde';
  const titulo = `${ROTULO_STATUS[status].texto}${pendentes ? ` · ${pendentes} alteração(ões) aguardando envio` : ''}`;
  return (
    <button type="button" onClick={() => ir('configuracoes')} title={titulo} aria-label={`Sincronização: ${titulo}`}
      className={clsx('relative grid place-items-center transition-colors hover:text-txt',
        compacto ? 'h-9 w-9 rounded-lg hover:bg-card2' : 'h-10 w-10 rounded-xl border border-line bg-card hover:border-roxo/50')}>
      <Icone size={18} className={clsx(cor, status === 'sincronizando' && 'animate-pulse')} />
      {status === 'sincronizado' && !pendentes && (
        <span className="absolute bottom-1.5 right-1.5 grid h-3 w-3 place-items-center rounded-full bg-verde text-bg"><Check size={8} strokeWidth={4} /></span>
      )}
    </button>
  );
}

/* --------------------- Cartão em Configurações --------------------- */
export function CartaoConta() {
  const nuvem = useNuvem();
  const { avisar } = useApp();
  const [modo, setModo] = useState<Modo | null>(null);
  const [sair, setSair] = useState(false);
  const [excluir, setExcluir] = useState(false);

  if (!nuvem.configurada) {
    return (
      <Card className="p-5">
        <CabecalhoCard titulo="Conta e sincronização" icone={<Cloud size={16} className="text-roxo-luz" />} />
        <p className="text-[12.5px] leading-relaxed text-txt2">
          A conta opcional (e-mail e senha) para sincronizar celular e computador <strong className="text-txt">não está configurada nesta
          instalação</strong>. O app continua funcionando normalmente, só com os dados deste navegador.
        </p>
        <p className="mt-2 text-[11.5px] leading-relaxed text-txt3">
          Para ativar: aplique a migração <code className="text-roxo-luz">supabase/migrations/20261015120000_sincronizacao.sql</code> no
          projeto Supabase e defina <code className="text-roxo-luz">VITE_SUPABASE_URL</code> e <code className="text-roxo-luz">VITE_SUPABASE_PUBLISHABLE_KEY</code> (veja o README).
        </p>
      </Card>
    );
  }

  if (!nuvem.usuario) {
    return (
      <Card className="p-5">
        <CabecalhoCard titulo="Conta e sincronização" icone={<Cloud size={16} className="text-roxo-luz" />} />
        <p className="text-[12.5px] leading-relaxed text-txt2">
          Opcional. Com uma conta de e-mail e senha, seus dados ficam iguais no celular e no computador. Sem conta, tudo continua
          funcionando só neste navegador.
        </p>
        <ul className="mt-3 space-y-1.5 text-[12px] text-txt2">
          <li className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-verde" /> O que já está neste aparelho é enviado e se junta à conta — nada é apagado.</li>
          <li className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-verde" /> Continua funcionando sem internet; as alterações sobem quando a conexão voltar.</li>
          <li className="flex gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-laranja" /> Com a conta, os dados também ficam no servidor (Supabase), protegidos por usuário, mas sem criptografia de ponta a ponta.</li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => setModo('criar')}><UserPlus size={15} /> Criar conta</button>
          <button type="button" className="btn-ghost" onClick={() => setModo('entrar')}>Entrar</button>
        </div>
        <ModalConta modo={modo} setModo={setModo} />
      </Card>
    );
  }

  const st = ROTULO_STATUS[nuvem.status];
  return (
    <Card className="p-5">
      <CabecalhoCard titulo="Conta e sincronização" icone={<Cloud size={16} className="text-roxo-luz" />} />
      <div className="flex items-center gap-3 rounded-xl border border-line bg-card2/50 p-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-roxo/20 text-roxo-luz"><Mail size={17} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-txt">{nuvem.usuario.email}</p>
          <p className={clsx('text-[11.5px]', st.cor)}>{st.texto}</p>
        </div>
        <button type="button" className="btn-ghost px-3 py-2 text-[12px]" disabled={nuvem.status === 'sincronizando'}
          onClick={() => void nuvem.sincronizarAgora().then(() => avisar('Sincronização concluída.', 'info'))}>
          <RefreshCw size={14} className={nuvem.status === 'sincronizando' ? 'animate-spin' : ''} /> Sincronizar
        </button>
      </div>
      <p className="mt-2 text-[11.5px] text-txt3">
        Última sincronização: {quando(nuvem.ultimaSync)}
        {nuvem.pendentes > 0 && <> · <span className="text-laranja">{nuvem.pendentes} alteração(ões) aguardando envio</span></>}
      </p>
      {nuvem.erro && <p className="mt-2 rounded-lg border border-rosa/40 bg-rosa/10 px-3 py-2 text-[12px] text-rosa">{nuvem.erro}</p>}
      <p className="mt-3 text-[12px] leading-relaxed text-txt2">
        Os dados ficam neste aparelho e na sua conta, isolados por usuário no banco. Abra o contAI em outro aparelho e entre com
        o mesmo e-mail para ver tudo lá. Em conflitos, vale a alteração mais recente.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" onClick={() => setSair(true)}><LogOut size={15} /> Sair</button>
        <button type="button" className="btn border border-rosa/40 bg-rosa/10 text-rosa hover:bg-rosa/20" onClick={() => setExcluir(true)}>
          <Trash2 size={15} /> Excluir conta
        </button>
      </div>
      <ModalSair aberto={sair} onFechar={() => setSair(false)} />
      <ModalExcluirConta aberto={excluir} onFechar={() => setExcluir(false)} />
    </Card>
  );
}

/* ---------------------- Entrar / Criar / Recuperar ---------------------- */
type Modo = 'entrar' | 'criar' | 'recuperar';

export function ModalConta({ modo, setModo }: { modo: Modo | null; setModo: (m: Modo | null) => void }) {
  const nuvem = useNuvem();
  const { avisar, estado } = useApp();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [ver, setVer] = useState(false);
  const [ciente, setCiente] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => { setErros({}); setAviso(null); setSenha(''); setConfirmar(''); }, [modo]);

  const locais = estado.movimentacoes.filter((m) => !m.demo).length;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!EMAIL.test(email.trim())) er.email = 'Informe um e-mail válido.';
    if (modo !== 'recuperar') {
      if (!senha) er.senha = 'Informe a senha.';
      else if (modo === 'criar') { const p = validarSenha(senha); if (p) er.senha = p; }
    }
    if (modo === 'criar') {
      if (confirmar !== senha) er.confirmar = 'As senhas não conferem.';
      if (!ciente) er.ciente = 'Confirme que entendeu onde os dados ficarão guardados.';
    }
    setErros(er);
    if (Object.keys(er).length) return;

    setEnviando(true);
    try {
      if (modo === 'entrar') {
        await nuvem.entrar(email, senha);
        avisar('Conta conectada. Sincronizando seus dados…');
        setModo(null);
      } else if (modo === 'criar') {
        const r = await nuvem.criarConta(email, senha);
        if (r === 'conectado') { avisar('Conta criada e conectada. Sincronizando seus dados…'); setModo(null); }
        else setAviso(`Enviamos um link de confirmação para ${email.trim()}. Abra o e-mail, confirme e depois entre com a sua senha.`);
      } else if (modo === 'recuperar') {
        await nuvem.recuperarSenha(email);
        setAviso(`Se existir uma conta com ${email.trim()}, enviamos um link para criar uma nova senha. Abra-o neste ou em outro aparelho.`);
      }
    } catch (err) {
      setErros({ geral: err instanceof Error ? err.message : 'Não foi possível concluir.' });
    } finally {
      setEnviando(false);
    }
  };

  const titulos: Record<Modo, string> = { entrar: 'Entrar na sua conta', criar: 'Criar conta', recuperar: 'Recuperar senha' };

  return (
    <Modal aberto={!!modo} onFechar={() => setModo(null)} titulo={modo ? titulos[modo] : ''} largura="max-w-md"
      descricao={modo === 'recuperar' ? 'Enviaremos um link para você criar uma nova senha.' : 'Opcional — serve para sincronizar seus aparelhos.'}>
      {aviso ? (
        <div className="space-y-4 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-verde/15 text-verde"><Mail size={22} /></span>
          <p className="text-[13px] leading-relaxed text-txt2">{aviso}</p>
          <button type="button" className="btn-primary w-full" onClick={() => setModo(modo === 'criar' || modo === 'recuperar' ? 'entrar' : null)}>Ir para “Entrar”</button>
        </div>
      ) : (
        <form onSubmit={enviar} noValidate className="space-y-3.5">
          <div className="flex justify-center pb-1"><Marca tamanho={44} fundo /></div>
          <Campo rotulo="E-mail" erro={erros.email}>
            <Entrada type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" autoFocus />
          </Campo>
          {modo !== 'recuperar' && (
            <Campo rotulo="Senha" erro={erros.senha} dica={modo === 'criar' ? 'Mínimo de 8 caracteres, com letras e números.' : undefined}>
              <div className="relative">
                <Entrada type={ver ? 'text' : 'password'} autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
                  value={senha} onChange={(e) => setSenha(e.target.value)} className="pr-10" />
                <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-txt3 hover:text-txt">
                  {ver ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Campo>
          )}
          {modo === 'criar' && (
            <>
              <Campo rotulo="Confirmar senha" erro={erros.confirmar}>
                <Entrada type={ver ? 'text' : 'password'} autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
              </Campo>
              <label className="flex items-start gap-2 rounded-xl border border-line bg-card2/50 p-3 text-[12px] leading-relaxed text-txt2">
                <input type="checkbox" checked={ciente} onChange={(e) => setCiente(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#7C3AED]" />
                <span>
                  Entendo que, com a conta, meus dados financeiros {locais ? `(incluindo os ${locais} lançamentos deste aparelho) ` : ''}serão
                  guardados também no servidor do contAI (Supabase), acessíveis só à minha conta, e que posso excluí-los a qualquer momento.
                </span>
              </label>
              {erros.ciente && <p className="-mt-2 text-[11px] font-medium text-rosa">{erros.ciente}</p>}
            </>
          )}
          {modo === 'entrar' && locais > 0 && (
            <p className="text-[11.5px] leading-relaxed text-txt3">Os {locais} lançamentos deste aparelho serão juntados aos da sua conta.</p>
          )}
          {erros.geral && <p role="alert" className="rounded-lg border border-rosa/40 bg-rosa/10 px-3 py-2 text-[12.5px] text-rosa">{erros.geral}</p>}
          <button type="submit" className="btn-primary w-full" disabled={enviando}>
            {enviando && <Loader2 size={15} className="animate-spin" />}
            {modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar conta' : 'Enviar link'}
          </button>
          <div className="flex flex-wrap justify-between gap-2 text-[12px]">
            {modo !== 'entrar' && <button type="button" className="font-semibold text-roxo-luz hover:text-txt" onClick={() => setModo('entrar')}>Já tenho conta</button>}
            {modo !== 'criar' && <button type="button" className="font-semibold text-roxo-luz hover:text-txt" onClick={() => setModo('criar')}>Criar uma conta</button>}
            {modo === 'entrar' && <button type="button" className="text-txt2 hover:text-txt" onClick={() => setModo('recuperar')}>Esqueci a senha</button>}
          </div>
        </form>
      )}
    </Modal>
  );
}

/* -------------------- Nova senha (link de recuperação) -------------------- */
export function ModalNovaSenha() {
  const { recuperandoSenha, setRecuperandoSenha, definirNovaSenha } = useNuvem();
  const { avisar } = useApp();
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = validarSenha(senha);
    if (p) { setErro(p); return; }
    if (senha !== confirmar) { setErro('As senhas não conferem.'); return; }
    setEnviando(true);
    try {
      await definirNovaSenha(senha);
      avisar('Senha alterada. Você já está conectado.');
      setSenha(''); setConfirmar(''); setErro(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível alterar a senha.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal aberto={recuperandoSenha} onFechar={() => setRecuperandoSenha(false)} titulo="Criar nova senha" descricao="Defina a nova senha da sua conta contAI." largura="max-w-md">
      <form onSubmit={salvar} noValidate className="space-y-3.5">
        <Campo rotulo="Nova senha" dica="Mínimo de 8 caracteres, com letras e números.">
          <Entrada type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus />
        </Campo>
        <Campo rotulo="Confirmar nova senha">
          <Entrada type="password" autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
        </Campo>
        {erro && <p role="alert" className="text-[12px] font-medium text-rosa">{erro}</p>}
        <button type="submit" className="btn-primary w-full" disabled={enviando}>
          {enviando ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Salvar nova senha
        </button>
      </form>
    </Modal>
  );
}

/* ---------------------------------- Sair ---------------------------------- */
function ModalSair({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const { sair, pendentes, status } = useNuvem();
  const { avisar } = useApp();
  const [apagarLocal, setApagarLocal] = useState(false);
  const [saindo, setSaindo] = useState(false);

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Sair da conta" largura="max-w-md">
      <p className="text-[13px] leading-relaxed text-txt2">
        A sincronização deste aparelho será desligada. Os dados continuam guardados na sua conta.
      </p>
      {pendentes > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-laranja/40 bg-laranja/10 p-3 text-[12.5px] text-txt">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-laranja" />
          {pendentes} alteração(ões) ainda não foram enviadas{status === 'offline' ? ' (sem conexão)' : ''}. Se sair agora, elas ficam só neste aparelho.
        </p>
      )}
      <label className="mt-3 flex items-start gap-2 text-[12.5px] text-txt2">
        <input type="checkbox" checked={apagarLocal} onChange={(e) => setApagarLocal(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#7C3AED]" />
        Também apagar os dados deste aparelho (recomendado em aparelho compartilhado)
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
        <button type="button" className="btn-primary" disabled={saindo} onClick={async () => {
          setSaindo(true);
          try {
            await sair(apagarLocal);
            avisar(apagarLocal ? 'Você saiu e os dados deste aparelho foram apagados.' : 'Você saiu. Os dados continuam neste aparelho e na sua conta.', 'info');
            onFechar();
          } finally { setSaindo(false); }
        }}>
          <LogOut size={15} /> Sair
        </button>
      </div>
    </Modal>
  );
}

/* ---------------------------- Excluir conta ---------------------------- */
function ModalExcluirConta({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const { excluirConta, usuario } = useNuvem();
  const { avisar } = useApp();
  const [texto, setTexto] = useState('');
  const [apagarLocal, setApagarLocal] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => { if (aberto) { setTexto(''); setErro(null); } }, [aberto]);

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Excluir conta" largura="max-w-md">
      <p className="text-[13px] leading-relaxed text-txt2">
        A conta <strong className="text-txt">{usuario?.email}</strong> e <strong className="text-txt">todos os dados guardados no servidor</strong>
        {' '}(registros, memória do assistente e arquivos das faturas) serão apagados definitivamente. Outros aparelhos conectados deixam de sincronizar.
      </p>
      <label className="mt-3 flex items-start gap-2 text-[12.5px] text-txt2">
        <input type="checkbox" checked={apagarLocal} onChange={(e) => setApagarLocal(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#7C3AED]" />
        Também apagar os dados deste aparelho
      </label>
      <p className="mt-3 text-[12.5px] text-txt2">Para confirmar, digite <strong className="text-txt">EXCLUIR</strong>.</p>
      <Entrada className="mt-2" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="EXCLUIR" aria-label="Confirmação" />
      {erro && <p role="alert" className="mt-2 text-[12px] font-medium text-rosa">{erro}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
        <button type="button" className="btn bg-rosa/90 text-white hover:bg-rosa" disabled={texto.trim().toUpperCase() !== 'EXCLUIR' || excluindo}
          onClick={async () => {
            setExcluindo(true);
            try {
              await excluirConta(apagarLocal);
              avisar('Conta e dados do servidor excluídos.', 'info');
              onFechar();
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Não foi possível excluir a conta.');
            } finally { setExcluindo(false); }
          }}>
          {excluindo ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Excluir definitivamente
        </button>
      </div>
    </Modal>
  );
}
