/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL do backend próprio que encapsula OCR e modelo de linguagem. */
  readonly VITE_IA_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
