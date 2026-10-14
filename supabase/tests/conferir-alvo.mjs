/**
 * Trava de segurança: confirma que o projeto Supabase vinculado pela CLI
 * NÃO é o projeto principal do contAI.
 *
 * Compara a referência gravada pela CLI em `supabase/.temp/project-ref` com a
 * referência que está em `.env.local` (o projeto principal). Se forem iguais,
 * sai com erro — qualquer `db push` deve ser abortado.
 *
 * As referências aparecem mascaradas: o suficiente para você reconhecer qual
 * projeto está vinculado, sem despejar os valores inteiros.
 *
 *   node supabase/tests/conferir-alvo.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const mascarar = (s) =>
  !s ? '(vazio)' : s.length <= 8 ? `${s.slice(0, 2)}…` : `${s.slice(0, 4)}…${s.slice(-4)}`;

/* Referência do projeto PRINCIPAL, extraída da URL em .env.local */
function refPrincipal() {
  const env = resolve(RAIZ, '.env.local');
  if (!existsSync(env)) return null;
  const linha = readFileSync(env, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith('VITE_SUPABASE_URL='));
  if (!linha) return null;
  const url = linha.slice(linha.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
  const m = url.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.(co|in)/i);
  return m ? m[1] : null;
}

/* Referência do projeto VINCULADO pela CLI */
function refVinculado() {
  for (const p of ['supabase/.temp/project-ref', 'supabase/.branches/_current_branch']) {
    const f = resolve(RAIZ, p);
    if (existsSync(f)) {
      const v = readFileSync(f, 'utf8').trim();
      if (v) return v;
    }
  }
  return null;
}

const principal = refPrincipal();
const vinculado = refVinculado();

console.log('');
console.log('  Projeto PRINCIPAL (.env.local) :', mascarar(principal));
console.log('  Projeto VINCULADO  (CLI)       :', mascarar(vinculado));
console.log('');

if (!vinculado) {
  console.error('  ERRO: nenhum projeto vinculado. Rode `npx supabase@latest link --project-ref <ref-do-descartavel>` antes.');
  process.exit(2);
}

if (!principal) {
  console.error('  AVISO: não consegui ler a referência do projeto principal em .env.local.');
  console.error('  Confirme manualmente, no painel do Supabase, que a referência vinculada acima é a do DESCARTÁVEL.');
  process.exit(3);
}

if (principal === vinculado) {
  console.error('  ABORTAR: a CLI está vinculada ao PROJETO PRINCIPAL do contAI.');
  console.error('  Rode `npx supabase@latest link --project-ref <ref-do-descartavel>` e tente de novo.');
  process.exit(1);
}

console.log('  OK: o projeto vinculado é diferente do principal.');
console.log('  Confirme no painel do Supabase que a referência vinculada é mesmo a do descartável.');
process.exit(0);
