import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase do contAI.
 *
 * Só são lidas variáveis `VITE_*`, que o Vite embute no bundle do navegador —
 * portanto apenas a chave **publicável** pode passar por aqui. A chave secreta
 * (`sb_secret_…`) e a antiga `service_role` nunca devem ser colocadas no
 * frontend: elas ignoram as políticas de RLS e dariam acesso total ao banco a
 * qualquer visitante. Essas chaves pertencem exclusivamente ao servidor
 * (Edge Functions), onde ficam fora do alcance do navegador.
 *
 * Enquanto as variáveis não estiverem preenchidas, `SUPABASE_CONFIGURADO` é
 * `false` e o contAI segue funcionando normalmente em modo local. Nada neste
 * arquivo é executado automaticamente: o cliente só é criado quando alguém
 * chama `getSupabase()`.
 */

/* ------------------------------------------------------------------ *
 * Variáveis de ambiente
 * ------------------------------------------------------------------ */

/** Remove espaços, aspas acidentais e barras no final — erros comuns de cópia. */
const normalizarUrl = (v: string) => v.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');

const URL = normalizarUrl(import.meta.env.VITE_SUPABASE_URL ?? '');

/**
 * O Supabase renomeou as chaves de API: a antiga `anon` (um JWT) passou a se
 * chamar **publishable** (`sb_publishable_…`). Aceitamos os dois nomes de
 * variável para não quebrar projetos criados antes dessa mudança.
 */
const CHAVE = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  ''
).trim();

export const SUPABASE_CONFIGURADO = URL.length > 0 && CHAVE.length > 0;

/* ------------------------------------------------------------------ *
 * Validações defensivas (não imprimem o valor das chaves)
 * ------------------------------------------------------------------ */

export type TipoChave = 'publicavel' | 'secreta' | 'legada_anon' | 'legada_service_role' | 'desconhecida';

/** Identifica o tipo da chave pelo formato, sem revelar o conteúdo. */
export function tipoDaChave(chave = CHAVE): TipoChave {
  if (chave.startsWith('sb_publishable_')) return 'publicavel';
  if (chave.startsWith('sb_secret_')) return 'secreta';
  if (chave.startsWith('eyJ')) {
    // JWT legado: o papel vem no payload (base64url), que não é segredo.
    try {
      const payload = JSON.parse(atob(chave.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload?.role === 'service_role') return 'legada_service_role';
      if (payload?.role === 'anon') return 'legada_anon';
    } catch {
      /* formato inesperado */
    }
  }
  return 'desconhecida';
}

const CHAVES_PROIBIDAS: TipoChave[] = ['secreta', 'legada_service_role'];

/** Palavras de caminho reconhecidas; o resto é mascarado para não vazar valores. */
const SEGMENTOS_CONHECIDOS = ['dashboard', 'project', 'projects', 'rest', 'auth', 'v1', 'storage', 'api', 'functions'];

/**
 * Descreve o **formato** da URL configurada, sem revelar o valor.
 * Serve para diagnosticar erros de cópia com segurança.
 */
export function formatoDaUrl() {
  const semProtocolo = URL.replace(/^https?:\/\//i, '');
  const host = semProtocolo.split('/')[0] ?? '';
  const caminho = semProtocolo.split('/').slice(1).filter(Boolean);
  return {
    preenchida: URL.length > 0,
    protocolo: URL.startsWith('https://') ? 'https' : URL.startsWith('http://') ? 'http' : '(ausente)',
    hostEhSupabase: /\.supabase\.(co|in)$/i.test(host),
    hostEhPainel: /^(www\.)?supabase\.com$/i.test(host),
    caminhoDepoisDoDominio: caminho.map((s) => (SEGMENTOS_CONHECIDOS.includes(s.toLowerCase()) ? s : '<…>')),
    formatoEsperado: caminho.length === 0 && /\.supabase\.(co|in)$/i.test(host),
  };
}

function validar() {
  if (!SUPABASE_CONFIGURADO) {
    throw new Error(
      'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY em .env.local e reinicie o servidor de desenvolvimento.',
    );
  }

  // Validação deliberadamente permissiva: além de <ref>.supabase.co existem
  // domínios personalizados, instâncias regionais e o Supabase local.
  if (!/^https?:\/\/[^/\s]+$/i.test(URL)) {
    throw new Error(
      'VITE_SUPABASE_URL não é uma URL válida. Esperado algo como https://<referencia>.supabase.co, sem caminho depois do domínio.',
    );
  }

  const tipo = tipoDaChave();
  if (CHAVES_PROIBIDAS.includes(tipo)) {
    throw new Error(
      'A chave informada em VITE_SUPABASE_PUBLISHABLE_KEY é uma chave de servidor (secreta/service_role). ' +
        'Ela ignora as políticas de RLS e NÃO pode ficar no frontend, porque o Vite a embute no JavaScript público. ' +
        'Use a chave publicável (sb_publishable_…) e revogue imediatamente a chave secreta exposta no painel do Supabase.',
    );
  }
}

/* ------------------------------------------------------------------ *
 * Cliente (singleton preguiçoso)
 * ------------------------------------------------------------------ */

let cliente: SupabaseClient | null = null;

/** Devolve o cliente Supabase, criando-o na primeira chamada. */
export function getSupabase(): SupabaseClient {
  if (cliente) return cliente;
  validar();
  cliente = createClient(URL, CHAVE, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,       // necessário para link mágico e OAuth
      storageKey: 'contai.auth',
    },
    global: { headers: { 'x-application-name': 'contai' } },
  });
  return cliente;
}

/* ------------------------------------------------------------------ *
 * Diagnóstico de conexão
 * ------------------------------------------------------------------ */

export interface ResultadoDiagnostico {
  configurado: boolean;
  tipoChave: TipoChave;
  urlValida: boolean;
  authAlcancavel: boolean;
  chaveAceita: boolean;
  mensagem: string;
}

/**
 * Testa a conexão sem depender de nenhuma tabela e sem autenticar ninguém.
 * Nenhum valor de chave é retornado ou registrado.
 */
export async function verificarConexao(): Promise<ResultadoDiagnostico> {
  const base: ResultadoDiagnostico = {
    configurado: SUPABASE_CONFIGURADO,
    tipoChave: SUPABASE_CONFIGURADO ? tipoDaChave() : 'desconhecida',
    urlValida: false,
    authAlcancavel: false,
    chaveAceita: false,
    mensagem: '',
  };

  if (!SUPABASE_CONFIGURADO) {
    return { ...base, mensagem: 'VITE_SUPABASE_URL e/ou a chave publicável não estão definidas em .env.local.' };
  }

  if (CHAVES_PROIBIDAS.includes(base.tipoChave)) {
    return {
      ...base,
      mensagem: 'PARE: a chave configurada é de servidor (secreta/service_role) e está exposta no frontend. Revogue-a no painel do Supabase e troque pela publicável.',
    };
  }

  try {
    // 1) O projeto existe e está no ar? Endpoint público de saúde do GoTrue.
    //    Também confirma que a URL aponta para a API, não para o painel: o
    //    painel devolveria HTML, este endpoint devolve JSON.
    const saude = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: CHAVE } });
    const tipo = saude.headers.get('content-type') ?? '';
    base.urlValida = saude.ok && tipo.includes('json');
    base.authAlcancavel = base.urlValida;

    // 2) A chave é aceita? /auth/v1/settings exige uma chave válida (401 sem
    //    ela) e funciona com a publicável, sem criar nada nem exigir tabelas.
    //
    //    Observação: NÃO use /rest/v1/ aqui. Com as chaves novas do Supabase,
    //    a raiz do PostgREST (schema OpenAPI) responde 401 "Only secret API
    //    keys can be used for this endpoint" — comportamento correto, já que a
    //    chave publicável não deve enumerar o schema do banco.
    const config = await fetch(`${URL}/auth/v1/settings`, { headers: { apikey: CHAVE } });
    base.chaveAceita = config.ok;

    const f = formatoDaUrl();
    base.mensagem = base.urlValida && base.chaveAceita
      ? 'Conexão estabelecida: projeto acessível, serviço de autenticação no ar e chave publicável aceita.'
      : f.hostEhPainel
        ? 'A URL aponta para o painel do Supabase (supabase.com/dashboard), não para a API do projeto. Use a Project URL em Project Settings > Data API.'
        : f.caminhoDepoisDoDominio.length > 0
          ? 'A URL tem um caminho depois do domínio. Use apenas https://<referencia>.supabase.co, sem nada após o ".co".'
          : !base.urlValida
            ? 'O endereço respondeu, mas não é a API do projeto Supabase. Confira a Project URL em Project Settings > Data API.'
            : 'O projeto respondeu, mas recusou a chave. Confira se copiou a chave publicável inteira, sem cortes.';
  } catch (e) {
    base.mensagem =
      `Não foi possível alcançar o projeto: ${e instanceof Error ? e.message : 'erro de rede'}. ` +
      'Verifique a VITE_SUPABASE_URL e se o projeto está ativo (projetos gratuitos pausam após inatividade).';
  }

  return base;
}

/**
 * Registra `window.contaiSupabase()` no console do navegador — apenas em
 * desenvolvimento, para você conferir a conexão sem precisar de uma tela nova.
 */
export function registrarDiagnostico() {
  if (!import.meta.env.DEV) return;
  (window as unknown as Record<string, unknown>).contaiSupabase = async () => {
    const r = await verificarConexao();
    console.table({
      'Variáveis preenchidas': r.configurado ? 'sim' : 'não',
      'Tipo da chave': r.tipoChave,
      'URL responde': r.urlValida ? 'sim' : 'não',
      'Chave aceita': r.chaveAceita ? 'sim' : 'não',
      'Serviço de autenticação': r.authAlcancavel ? 'sim' : 'não respondeu',
    });
    console.info(r.mensagem);
    return r.urlValida && r.chaveAceita;
  };
  console.info('[contAI] Diagnóstico disponível: execute contaiSupabase() no console.');
}
