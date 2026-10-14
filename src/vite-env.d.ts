/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL do backend próprio que encapsula OCR e modelo de linguagem. */
  readonly VITE_IA_ENDPOINT?: string;

  /** URL do projeto Supabase: https://<referencia>.supabase.co */
  readonly VITE_SUPABASE_URL?: string;

  /**
   * Chave **publicável** do Supabase (`sb_publishable_…`).
   * Nunca use aqui a chave secreta (`sb_secret_…`) nem a legada `service_role`:
   * tudo que começa com VITE_ é embutido no JavaScript público.
   */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;

  /** Nome legado da chave publicável, aceito por compatibilidade. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
