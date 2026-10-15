/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * URL de um backend próprio que encapsula OCR e modelo de linguagem.
   * As chaves dos provedores de IA ficam nesse servidor — nunca no frontend.
   */
  readonly VITE_IA_ENDPOINT?: string;

  /** URL do projeto Supabase (conta opcional e sincronização): https://<ref>.supabase.co */
  readonly VITE_SUPABASE_URL?: string;

  /**
   * Chave PUBLICÁVEL do Supabase (sb_publishable_…). Nunca a secreta (sb_secret_)
   * nem a service_role: tudo que começa com VITE_ vai para o JavaScript público.
   */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;

  /** Nome legado da chave publicável, aceito por compatibilidade. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
