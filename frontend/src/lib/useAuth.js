// src/lib/useAuth.js
// ============================================================
// Login com Supabase Auth (e-mail + senha) + busca do perfil.
// O papel do usuário (admin/colaborador/cliente) decide o que ele
// enxerga — nunca o inverso. Se não existe perfil pra este auth.uid(),
// a RLS já bloqueia qualquer leitura; aqui só traduzimos isso numa
// mensagem legível em vez de deixar a tela em branco.
// ============================================================

import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase";

export function useAuth() {
  const [carregando, setCarregando] = useState(true);
  const [sessao, setSessao] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [semAcesso, setSemAcesso] = useState(false);

  const carregarPerfil = useCallback(async (session) => {
    if (!session) {
      setSessao(null);
      setPerfil(null);
      setSemAcesso(false);
      setCarregando(false);
      return;
    }
    setSessao(session);
    const { data, error } = await supabase
      .from("perfis")
      .select("id, nome, email, papel, ativo")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error || !data || !data.ativo) {
      setPerfil(null);
      setSemAcesso(true);
    } else {
      setPerfil(data);
      setSemAcesso(false);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    let ativo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (ativo) carregarPerfil(data.session);
    });
    const { data: assinatura } = supabase.auth.onAuthStateChange((_evento, session) => {
      if (!ativo) return;
      setCarregando(true);
      carregarPerfil(session);
    });
    return () => {
      ativo = false;
      assinatura.subscription.unsubscribe();
    };
  }, [carregarPerfil]);

  const entrar = async (email, senha) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    return error ? error.message : null;
  };

  const sair = () => supabase.auth.signOut();

  return { carregando, sessao, perfil, semAcesso, entrar, sair };
}
