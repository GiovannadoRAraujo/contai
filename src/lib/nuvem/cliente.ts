import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase — usado SÓ para a conta opcional e a sincronização.
 * O app funciona inteiro sem ele. Usa apenas a chave PUBLICÁVEL (segura no
 * navegador); o acesso aos dados é limitado pelo RLS do banco. Nenhuma chave
 * secreta (service_role / sb_secret_) pode aparecer no frontend.
 */
const URL_SUPABASE = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const CHAVE_PUBLICA = ((import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined)?.trim() ?? '';

if (/sb_secret_|service_role/i.test(CHAVE_PUBLICA)) {
  // Falha alto: uma chave secreta no bundle daria acesso total ao banco.
  throw new Error('Chave secreta do Supabase configurada no frontend. Use a chave publicável (sb_publishable_…).');
}

// https em produção; http só para localhost (Supabase local da CLI)
export const NUVEM_CONFIGURADA =
  (/^https:\/\/.+/.test(URL_SUPABASE) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(URL_SUPABASE)) && CHAVE_PUBLICA.length > 20;

export const supabase: SupabaseClient | null = NUVEM_CONFIGURADA
  ? createClient(URL_SUPABASE, CHAVE_PUBLICA, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // implícito: o link do e-mail funciona mesmo se aberto em outro aparelho/navegador
        flowType: 'implicit',
        storageKey: 'contai.sessao',
      },
    })
  : null;

/**
 * Link de "esqueci a senha": o evento PASSWORD_RECOVERY é emitido enquanto o
 * cliente inicializa — antes de a interface existir. Capturamos aqui, na carga
 * do módulo, para a tela de nova senha abrir mesmo assim.
 */
export const recuperacao = {
  pendente: typeof window !== 'undefined' && /type=recovery/.test(window.location.hash),
};
supabase?.auth.onAuthStateChange((evento) => {
  if (evento === 'PASSWORD_RECOVERY') recuperacao.pendente = true;
});

/** Endereço para onde os links de confirmação e de nova senha devem voltar. */
export const urlRetorno = () => `${window.location.origin}${window.location.pathname}`;

/** Traduz as mensagens do Supabase Auth para português claro. */
export function traduzirErro(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Confirme o seu e-mail pelo link que enviamos antes de entrar.';
  if (m.includes('user already registered') || m.includes('already been registered')) return 'Já existe uma conta com este e-mail. Use “Entrar” ou recupere a senha.';
  if (m.includes('password should be') || m.includes('weak password') || m.includes('password is known')) return 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.';
  if (m.includes('rate limit') || m.includes('over_email_send_rate_limit') || m.includes('too many')) return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.';
  if (m.includes('invalid email') || m.includes('unable to validate email')) return 'E-mail inválido.';
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) return 'O cadastro de novas contas está desativado neste projeto.';
  if (m.includes('same password') || m.includes('should be different')) return 'A nova senha precisa ser diferente da atual.';
  if (m.includes('expired') || m.includes('invalid jwt') || m.includes('otp')) return 'O link expirou ou já foi usado. Peça um novo.';
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed')) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  return msg || 'Não foi possível concluir. Tente de novo.';
}

/* ------------------------------ Arquivos ------------------------------ */
const BUCKET = 'documentos';

export async function enviarArquivo(uid: string, id: string, blob: Blob) {
  if (!supabase) return;
  const { error } = await supabase.storage.from(BUCKET).upload(`${uid}/${id}`, blob, { upsert: true, contentType: blob.type || undefined });
  if (error) throw error;
}

export async function baixarArquivoDaNuvem(id: string): Promise<Blob | undefined> {
  if (!supabase) return undefined;
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) return undefined;
  const { data, error } = await supabase.storage.from(BUCKET).download(`${uid}/${id}`);
  if (error) return undefined;
  return data;
}

export async function apagarArquivoDaNuvem(uid: string, id: string) {
  if (!supabase) return;
  await supabase.storage.from(BUCKET).remove([`${uid}/${id}`]);
}

export async function apagarTodosArquivos(uid: string) {
  if (!supabase) return;
  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list(uid, { limit: 100 });
    if (error) throw error;
    if (!data?.length) return;
    const { error: e2 } = await supabase.storage.from(BUCKET).remove(data.map((f) => `${uid}/${f.name}`));
    if (e2) throw e2;
  }
}
