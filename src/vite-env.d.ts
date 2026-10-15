/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * URL de um backend próprio que encapsula OCR e modelo de linguagem.
   * As chaves dos provedores de IA ficam nesse servidor — nunca no frontend.
   */
  readonly VITE_IA_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
