// src/lib/supabase.js
// ============================================================
// Client único do Supabase, compartilhado pelo app do cliente e pelo
// painel de publicação. Usa sempre a chave publishable/anon — nunca a
// secret key aqui, o navegador expõe qualquer coisa que for embutida
// no bundle. O sigilo entre empresas é garantido pela RLS no banco,
// não por esconder a chave.
// ============================================================

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ausentes — confira o .env.local (veja README-TESTE.md)."
  );
}

export const supabase = createClient(url, anonKey);
