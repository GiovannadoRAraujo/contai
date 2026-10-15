import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { EstadoApp } from '@/types';
import { useApp } from './app';
import * as db from '@/lib/db';
import {
  apagarArquivoDaNuvem, apagarTodosArquivos, enviarArquivo, NUVEM_CONFIGURADA, recuperacao, supabase, traduzirErro, urlRetorno,
} from '@/lib/nuvem/cliente';
import { diferencas, todasAsMudancas, type LinhaRemota, type Mudanca } from '@/lib/nuvem/mesclar';
import { TERMOS_VERSAO } from '@/lib/legal';

/**
 * Conta opcional + sincronização entre aparelhos.
 *
 * Local-first: toda alteração é gravada no IndexedDB (AppProvider) e, se houver
 * uma conta conectada, entra numa fila persistente que é enviada em segundo
 * plano. Alterações de outros aparelhos são buscadas de forma incremental.
 * Sem conta, nada sai do navegador.
 */

export type StatusSync = 'desligado' | 'sincronizando' | 'sincronizado' | 'offline' | 'erro';

export interface Usuario { id: string; email: string }

interface NuvemCtx {
  configurada: boolean;
  /** A sessão salva já foi verificada (evita piscar a tela de entrada para quem já está conectado). */
  sessaoVerificada: boolean;
  usuario: Usuario | null;
  status: StatusSync;
  ultimaSync: string | null;
  erro: string | null;
  pendentes: number;
  recuperandoSenha: boolean;
  setRecuperandoSenha: (v: boolean) => void;
  entrar: (email: string, senha: string) => Promise<void>;
  criarConta: (email: string, senha: string) => Promise<'conectado' | 'confirmar-email'>;
  recuperarSenha: (email: string) => Promise<void>;
  definirNovaSenha: (senha: string) => Promise<void>;
  /** Sai da conta e apaga a cópia local deste aparelho (os dados continuam na conta). */
  sair: () => Promise<void>;
  /** Exclui a conta e todos os dados do servidor e do aparelho. */
  excluirConta: () => Promise<void>;
  sincronizarAgora: () => Promise<void>;
}

const Ctx = createContext<NuvemCtx | null>(null);
const LOTE = 200;
const INTERVALO_MS = 45_000;
const ehErroDeRede = (e: unknown) => /failed to fetch|network|load failed|fetch failed/i.test(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));

export function NuvemProvider({ children }: { children: React.ReactNode }) {
  const { estado, dispatch, avisar, geracao, apagarTudo } = useApp();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [sessaoVerificada, setSessaoVerificada] = useState(!NUVEM_CONFIGURADA);
  const [status, setStatus] = useState<StatusSync>('desligado');
  const [ultimaSync, setUltimaSync] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendentes, setPendentes] = useState(0);
  const [recuperandoSenha, setRecuperandoSenhaEstado] = useState(recuperacao.pendente);
  const setRecuperandoSenha = useCallback((v: boolean) => { recuperacao.pendente = v; setRecuperandoSenhaEstado(v); }, []);

  const estadoRef = useRef<EstadoApp>(estado);
  const anterior = useRef<EstadoApp>(estado);
  const geracaoRef = useRef(geracao);
  const usuarioRef = useRef<Usuario | null>(null);
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  const rodando = useRef<Promise<void> | null>(null);
  const deNovo = useRef(false);
  const timer = useRef<number | null>(null);
  estadoRef.current = estado;
  usuarioRef.current = usuario;

  const atualizarPendentes = useCallback(async () => {
    try { setPendentes((await db.lerFila()).length); } catch { /* sem IndexedDB */ }
  }, []);

  /* ------------------------------ envio + recebimento ------------------------------ */
  const executar = useCallback(async () => {
    const u = usuarioRef.current;
    if (!supabase || !u) return;
    if (!navigator.onLine) { setStatus('offline'); return; }
    setStatus('sincronizando');
    try {
      await fila.current; // garante que o que foi enfileirado já está no IndexedDB

      // 1. Envio
      const itens = await db.lerFila();
      for (let i = 0; i < itens.length; i += LOTE) {
        const lote = itens.slice(i, i + LOTE);
        for (const it of lote.filter((x) => x.colecao === 'documentos')) {
          try {
            if (it.excluido) await apagarArquivoDaNuvem(u.id, it.id);
            else {
              const blob = await db.lerArquivo(it.id);
              if (blob) await enviarArquivo(u.id, it.id, blob);
            }
          } catch (e) {
            if (ehErroDeRede(e)) throw e;
            // falha num arquivo não impede a sincronização dos registros
            console.warn('Arquivo não sincronizado', it.id, e);
          }
        }
        const { error } = await supabase.rpc('sincronizar_registros', {
          lote: lote.map(({ colecao, id, dados, modificado_em, excluido }) => ({ colecao, id, dados: excluido ? null : dados, modificado_em, excluido })),
        });
        if (error) throw error;
        await db.confirmarEnvio(lote);
      }

      // 2. Recebimento incremental (com margem de 10 s para transações concorrentes)
      const cursor = await db.lerMeta<string>(`sync.cursor.${u.id}`);
      let desde = cursor ? new Date(Date.parse(cursor) - 10_000).toISOString() : null;
      let maior = cursor ?? null;
      for (let pagina = 0; pagina < 50; pagina++) {
        let q = supabase
          .from('registros_sync')
          .select('colecao,id,dados,modificado_em,excluido,atualizado_servidor')
          .order('atualizado_servidor', { ascending: true })
          .limit(1000);
        if (desde) q = q.gte('atualizado_servidor', desde);
        const { data, error } = await q;
        if (error) throw error;
        const linhas = (data ?? []) as LinhaRemota[];
        if (linhas.length) {
          dispatch({ t: 'sync.aplicar', linhas });
          maior = linhas[linhas.length - 1].atualizado_servidor ?? maior;
        }
        if (linhas.length < 1000) break;
        desde = maior;
      }
      if (maior) await db.gravarMeta(`sync.cursor.${u.id}`, maior);

      setUltimaSync(new Date().toISOString());
      setErro(null);
      setStatus('sincronizado');
    } catch (e) {
      if (ehErroDeRede(e)) setStatus('offline');
      else { setStatus('erro'); setErro(traduzirErro(e)); }
    } finally {
      await atualizarPendentes();
    }
  }, [dispatch, atualizarPendentes]);

  const sincronizarAgora = useCallback(async () => {
    if (rodando.current) { deNovo.current = true; return rodando.current; }
    rodando.current = (async () => {
      do { deNovo.current = false; await executar(); } while (deNovo.current);
    })().finally(() => { rodando.current = null; });
    return rodando.current;
  }, [executar]);

  const agendar = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void sincronizarAgora(), 1500);
  }, [sincronizarAgora]);

  const enfileirar = useCallback((mudancas: Mudanca[]) => {
    if (!mudancas.length) return;
    fila.current = fila.current
      .then(() => db.enfileirar(mudancas))
      .then(atualizarPendentes)
      .catch((e) => { setStatus('erro'); setErro(`Falha ao preparar o envio: ${traduzirErro(e)}`); });
    agendar();
  }, [agendar, atualizarPendentes]);

  /* --------------------------------- sessão --------------------------------- */
  const iniciarSessao = useCallback(async (u: Usuario) => {
    const anteriorUid = await db.lerMeta<string>('sync.usuario');
    if (anteriorUid && anteriorUid !== u.id) {
      // Outra pessoa usou este aparelho antes: os dados dela nunca vão para esta conta
      await apagarTudo();
      await db.gravarMeta('sync.usuario', u.id);
    } else if (anteriorUid !== u.id) {
      // Primeira conta deste aparelho: o que já existia aqui (sem conta) sobe e se junta à conta
      await db.limparFila();
      await db.enfileirar(todasAsMudancas(estadoRef.current));
      await db.gravarMeta('sync.usuario', u.id);
    }
    await sincronizarAgora();
  }, [sincronizarAgora, apagarTudo]);

  useEffect(() => {
    if (!supabase) return;
    // Erros vindos de links de e-mail expirados (#error=…&error_description=…)
    const hash = new URLSearchParams(window.location.hash.replace(/^#\/?/, ''));
    if (hash.get('error_description')) {
      avisar(traduzirErro(hash.get('error_description')), 'erro');
      window.history.replaceState(null, '', window.location.pathname);
    }
    const aplicar = (s: { user: { id: string; email?: string } } | null) => {
      const novo = s ? { id: s.user.id, email: s.user.email ?? '' } : null;
      setUsuario((atual) => (atual?.id === novo?.id ? atual : novo));
    };
    void supabase.auth.getSession()
      .then(({ data }) => aplicar(data.session))
      .finally(() => setSessaoVerificada(true));
    const { data } = supabase.auth.onAuthStateChange((evento, sessao) => {
      if (evento === 'PASSWORD_RECOVERY') setRecuperandoSenha(true);
      aplicar(sessao);
    });
    return () => data.subscription.unsubscribe();
  }, [avisar, setRecuperandoSenha]);

  useEffect(() => {
    if (!usuario) { setStatus('desligado'); return; }
    void iniciarSessao(usuario);
    const intervalo = window.setInterval(() => void sincronizarAgora(), INTERVALO_MS);
    const aoVoltar = () => void sincronizarAgora();
    const aoCair = () => setStatus('offline');
    window.addEventListener('focus', aoVoltar);
    window.addEventListener('online', aoVoltar);
    window.addEventListener('offline', aoCair);
    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener('focus', aoVoltar);
      window.removeEventListener('online', aoVoltar);
      window.removeEventListener('offline', aoCair);
    };
  }, [usuario, iniciarSessao, sincronizarAgora]);

  // Cada alteração local de quem está conectado entra na fila de envio
  useEffect(() => {
    const antes = anterior.current;
    anterior.current = estado;
    if (geracaoRef.current !== geracao) {
      geracaoRef.current = geracao;
      // backup restaurado com a conta conectada: o conteúdo restaurado se junta à conta
      if (usuarioRef.current) enfileirar(todasAsMudancas(estado));
      return;
    }
    if (!usuarioRef.current || antes === estado) return;
    enfileirar(diferencas(antes, estado));
  }, [estado, geracao, enfileirar]);

  /* --------------------------------- ações --------------------------------- */
  const entrar = useCallback(async (email: string, senha: string) => {
    if (!supabase) throw new Error('Sincronização não configurada.');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) throw new Error(traduzirErro(error));
    // Registra o aceite da versão atual dos termos (feito na tela de entrada)
    void supabase.auth.updateUser({ data: { termos_versao: TERMOS_VERSAO, termos_aceitos_em: new Date().toISOString() } });
  }, []);

  const criarConta = useCallback(async (email: string, senha: string) => {
    if (!supabase) throw new Error('Sincronização não configurada.');
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: senha,
      options: {
        emailRedirectTo: urlRetorno(),
        data: { termos_versao: TERMOS_VERSAO, termos_aceitos_em: new Date().toISOString() },
      },
    });
    if (error) throw new Error(traduzirErro(error));
    // Com confirmação de e-mail ligada, o Supabase devolve um usuário sem identidades se o e-mail já existe
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error('Já existe uma conta com este e-mail. Use “Entrar” ou recupere a senha.');
    }
    return data.session ? 'conectado' : 'confirmar-email';
  }, []);

  const recuperarSenha = useCallback(async (email: string) => {
    if (!supabase) throw new Error('Sincronização não configurada.');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: urlRetorno() });
    if (error) throw new Error(traduzirErro(error));
  }, []);

  const definirNovaSenha = useCallback(async (senha: string) => {
    if (!supabase) throw new Error('Sincronização não configurada.');
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) throw new Error(traduzirErro(error));
    setRecuperandoSenha(false);
  }, [setRecuperandoSenha]);

  // Ao sair, a cópia local é apagada: com login obrigatório o aparelho pode ser de outra pessoa
  const desconectarLocal = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    await supabase?.auth.signOut({ scope: 'local' });
    setUsuario(null);
    setPendentes(0);
    await apagarTudo(); // limpa registros, arquivos, fila e metadados
  }, [apagarTudo]);

  const sair = useCallback(async () => {
    await desconectarLocal();
  }, [desconectarLocal]);

  const excluirConta = useCallback(async () => {
    const u = usuarioRef.current;
    if (!supabase || !u) throw new Error('Nenhuma conta conectada.');
    try {
      await apagarTodosArquivos(u.id);
      const { error } = await supabase.rpc('excluir_minha_conta');
      if (error) throw error;
    } catch (e) {
      throw new Error(traduzirErro(e));
    }
    await desconectarLocal();
  }, [desconectarLocal]);

  const valor = useMemo<NuvemCtx>(() => ({
    configurada: NUVEM_CONFIGURADA,
    sessaoVerificada,
    usuario, status, ultimaSync, erro, pendentes, recuperandoSenha, setRecuperandoSenha,
    entrar, criarConta, recuperarSenha, definirNovaSenha, sair, excluirConta, sincronizarAgora,
  }), [sessaoVerificada, usuario, status, ultimaSync, erro, pendentes, recuperandoSenha, setRecuperandoSenha, entrar, criarConta, recuperarSenha, definirNovaSenha, sair, excluirConta, sincronizarAgora]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useNuvem() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useNuvem precisa estar dentro de <NuvemProvider>');
  return c;
}
