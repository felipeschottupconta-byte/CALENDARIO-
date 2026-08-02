import React, { useState, useMemo, useEffect } from "react";
import { useAuth } from "./src/lib/useAuth.js";
import { supabase } from "./src/lib/supabase.js";
import { nomeParcelamento } from "./src/lib/parcelamento.js";

/* ============================================================
   PAINEL DE PUBLICAÇÃO — RN Contabilidade
   Interface interna. Fica entre o watcher e o app do cliente.
   Nada chega ao cliente sem passar por aqui.
   Dados reais extraídos pelos parsers.
   ============================================================ */

function Marca({ tamanho = 30 }) {
  return <img src="/logo-rn.png" alt="RN Contabilidade" style={{ height: tamanho, width: "auto", display: "block", borderRadius: tamanho * 0.09 }} />;
}

/* ---------- dados de referência/demo — a aba Relatórios ainda não tem
   tabela própria no banco (só as guias e o cadastro de empresas foram
   ligados nesta rodada), então continua com este mock. A fila de guias
   (DADOS_INICIAIS de antes) foi removida — vem do banco agora. ---------- */
const RELATORIOS = [
  {
    id: "r1",
    empresa: "LUMIARINA CERVEJARIA LTDA",
    cnpj: "27774562000149",
    emitido: "29/07/2026 14:58",
    pendencias: 2,
    total: 321.39,
    impeditivo: 0,
    podeCnd: true,
    verificacao: "ok",
    minuta: {
      titulo: "Situação fiscal federal — julho de 2026",
      resumo:
        "A consulta feita na Receita Federal em 29 de julho apontou dois débitos previdenciários da competência 07/2026, com vencimento em 20/08/2026, somando R$ 321,39. Ambos estão registrados com exigibilidade suspensa, ou seja, a cobrança está parada enquanto a Receita analisa. Na Procuradoria da Fazenda Nacional não foi detectada nenhuma pendência.",
      secoes: [
        {
          titulo: "Os dois débitos em análise",
          texto:
            "São contribuições previdenciárias (códigos 1099-01 e 1082-01), de R$ 178,31 e R$ 143,08, ambas referentes a julho de 2026 e com vencimento em 20 de agosto. A Receita classificou as duas como \"a analisar\", o que significa que o valor foi registrado mas ainda está sob verificação interna. Enquanto essa análise não termina, a cobrança fica suspensa.",
        },
        {
          titulo: "Efeito sobre certidões",
          texto:
            "Débito com exigibilidade suspensa, em princípio, não impede a emissão de certidão. Ainda assim, a certidão precisa ser consultada separadamente — este relatório não a substitui.",
        },
        {
          titulo: "Aviso da Receita sobre o Simples Nacional",
          texto:
            "O documento traz um alerta geral: entre 10 e 15 de agosto de 2026 a Receita fará o processamento final das exclusões do Simples para 2027. Empresas que receberam termo de exclusão devem conferir o resultado no Portal do Simples Nacional. Vamos verificar isso para a sua empresa.",
        },
      ],
      escopo:
        "Este relatório cobre apenas débitos federais na Receita Federal e na Procuradoria da Fazenda Nacional. Não inclui ICMS estadual, ISS municipal, FGTS nem parcelamentos fora do âmbito federal.",
      passo: "Vamos acompanhar a análise dos dois débitos e avisamos assim que houver definição.",
    },
  },
];

/* ---------- helpers ---------- */
const brl = (v) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");
const cnpjFmt = (c) =>
  c ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "—";

function cnpjValido(cnpj) {
  const c = (cnpj || "").replace(/\D/g, "");
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const digito = (base) => {
    let soma = 0, peso = base.length - 7;
    for (let i = 0; i < base.length; i++) {
      soma += parseInt(base[i], 10) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const dv1 = digito(c.slice(0, 12));
  const dv2 = digito(c.slice(0, 12) + dv1);
  return c === c.slice(0, 12) + String(dv1) + String(dv2);
}

const ROTULO_REGIME = { simples: "Simples Nacional", presumido: "Lucro Presumido", real: "Lucro Real", mei: "MEI", imune: "Imune" };

// Traduz uma linha real de `guias` (+ empresa via join) pro formato que os
// cartões/detalhe já sabem desenhar. Dois campos que o protótipo mostrava
// não têm coluna própria hoje: `orgao` (emissor) e `alertas` persistidos —
// os alertas só existem no momento do upload, ver ÁreaUpload.
function guiaParaCard(g) {
  return {
    id: g.id,
    arquivo: g.nome_original || "(sem nome de arquivo)",
    tipo: g.tipo,
    subtipo: g.descricao,
    orgao: null,
    cnpj: g.empresas?.cnpj || null,
    razao: g.empresas?.razao_social || null,
    competencia: g.competencia,
    vencimento: g.vencimento,
    valor: g.valor != null ? Number(g.valor) : null,
    codigo: null,
    confianca: g.confianca != null ? Number(g.confianca) : 0,
    layout: g.classificado_por,
    linha: g.linha_digitavel,
    hash: g.arquivo_hash,
    alertas: [],
    estado: g.status === "publicada" || g.status === "paga" ? "publicada" : g.status === "revisao" ? "revisao" : "pronta",
  };
}

/* ============================ APP ============================ */
export default function App() {
  const { carregando, sessao, perfil, semAcesso, entrar, sair } = useAuth();

  if (carregando) {
    return <><style>{CSS}</style><div className="app"><p style={{ padding: 24 }}>Carregando…</p></div></>;
  }
  if (!sessao) {
    return <><style>{CSS}</style><TelaLoginPainel entrar={entrar} /></>;
  }
  if (semAcesso || (perfil && !["admin", "colaborador"].includes(perfil.papel))) {
    return <><style>{CSS}</style><TelaSemAcessoPainel sair={sair} /></>;
  }
  return <><style>{CSS}</style><PainelPrincipal perfil={perfil} sair={sair} /></>;
}

function TelaLoginPainel({ entrar }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const tentar = async () => {
    if (!email || !senha) { setErro("Preencha e-mail e senha."); return; }
    setEnviando(true);
    const msg = await entrar(email, senha);
    setEnviando(false);
    setErro(msg ? "E-mail ou senha incorretos." : null);
  };

  return (
    <div className="app" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div className="ficha" style={{ width: "100%", maxWidth: 360, padding: 22 }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}><Marca tamanho={44} /></div>
        <h3 style={{ marginBottom: 16 }}>Painel de publicação</h3>
        <div className="form">
          <label><span>E-mail</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tentar()} /></label>
          <label><span>Senha</span>
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tentar()} /></label>
        </div>
        {erro && <p className="alerta" style={{ marginTop: 10 }}>{erro}</p>}
        <button className="btn-primario largo" disabled={enviando} onClick={tentar} style={{ marginTop: 14 }}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </div>
    </div>
  );
}

function TelaSemAcessoPainel({ sair }) {
  return (
    <div className="app" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div className="ficha" style={{ width: "100%", maxWidth: 360, padding: 22, textAlign: "center" }}>
        <Marca tamanho={44} />
        <p className="dica" style={{ marginTop: 14 }}>
          Este login não tem acesso liberado ao painel. Confirme se o perfil foi cadastrado com
          papel "admin" ou "colaborador" — ver README-TESTE.md.
        </p>
        <button className="btn-secundario largo" onClick={sair} style={{ marginTop: 10 }}>Sair</button>
      </div>
    </div>
  );
}

function PainelPrincipal({ perfil, sair }) {
  const [guias, setGuias] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [apuracoes, setApuracoes] = useState([]);
  const [aba, setAba] = useState("guias");
  const [filtro, setFiltro] = useState("pronta");
  const [sel, setSel] = useState(new Set());
  const [aberta, setAberta] = useState(null);
  const [toast, setToast] = useState(null);
  const [carregandoLista, setCarregandoLista] = useState(true);

  const avisar = (m) => { setToast(m); setTimeout(() => setToast(null), 2400); };

  const recarregarGuias = async () => {
    const { data } = await supabase
      .from("guias")
      .select("*, empresas(razao_social, nome_fantasia, cnpj)")
      .order("criada_em", { ascending: false });
    setGuias((data || []).map(guiaParaCard));
  };

  const recarregarEmpresas = async () => {
    const { data } = await supabase.from("empresas").select("*").order("razao_social");
    setEmpresas(data || []);
  };

  const recarregarApuracoes = async () => {
    const { data } = await supabase
      .from("apuracoes_simples")
      .select("*, empresas(razao_social, nome_fantasia, cnpj), apuracao_anexos(*)")
      .order("competencia", { ascending: false });
    setApuracoes(data || []);
  };

  useEffect(() => {
    setCarregandoLista(true);
    Promise.all([recarregarGuias(), recarregarEmpresas(), recarregarApuracoes()]).finally(() => setCarregandoLista(false));
  }, []);

  const contagem = useMemo(() => ({
    pronta: guias.filter((g) => g.estado === "pronta").length,
    revisao: guias.filter((g) => g.estado === "revisao").length,
    publicada: guias.filter((g) => g.estado === "publicada").length,
  }), [guias]);

  const lista = guias.filter((g) => g.estado === filtro);

  const alternar = (id) => {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  };

  const publicar = async () => {
    const ids = [...sel];
    const n = ids.length;
    const { error } = await supabase.from("guias").update({ status: "publicada" }).in("id", ids);
    if (error) { avisar("Falha ao publicar: " + error.message); return; }
    const resultados = await Promise.all(ids.map((id) =>
      supabase.from("guia_eventos").insert({ guia_id: id, tipo: "publicada", usuario_id: perfil.id })
    ));
    const falhas = resultados.filter((r) => r.error);
    if (falhas.length) console.error(`${falhas.length} evento(s) 'publicada' não gravados:`, falhas[0].error.message);
    setSel(new Set());
    await recarregarGuias();
    avisar(`${n} ${n === 1 ? "guia publicada" : "guias publicadas"} — clientes notificados`);
  };

  const totalSel = guias
    .filter((g) => sel.has(g.id))
    .reduce((s, g) => s + (g.valor || 0), 0);

  return (
    <div className="app">
      <header className="topo">
        <div className="marca">
          <Marca tamanho={30} />
          <div>
            <strong>Painel de publicação</strong>
            <span>{perfil.nome} · {perfil.papel}</span>
          </div>
          <button className="btn-fantasma" style={{ marginLeft: "auto", color: "#8E8E8A" }} onClick={sair}>Sair</button>
        </div>
        <nav className="abas">
          <button className={aba === "guias" ? "on" : ""} onClick={() => setAba("guias")}>
            Guias {contagem.revisao > 0 && <i className="badge">{contagem.revisao}</i>}
          </button>
          <button className={aba === "extratos" ? "on" : ""} onClick={() => setAba("extratos")}>
            Extratos {apuracoes.filter((a) => !a.publicada).length > 0 && (
              <i className="badge">{apuracoes.filter((a) => !a.publicada).length}</i>
            )}
          </button>
          <button className={aba === "relatorios" ? "on" : ""} onClick={() => setAba("relatorios")}>
            Relatórios <i className="badge">{RELATORIOS.length}</i>
          </button>
          <button className={aba === "empresas" ? "on" : ""} onClick={() => setAba("empresas")}>
            Empresas <i className="badge">{empresas.length}</i>
          </button>
        </nav>
      </header>

      {aba === "guias" && (
        <>
          <AreaUpload empresas={empresas} avisar={avisar} aoTerminar={recarregarGuias} />

          <div className="painel-filtros">
            {[
              ["pronta", "Prontas", contagem.pronta],
              ["revisao", "Revisão", contagem.revisao],
              ["publicada", "Publicadas", contagem.publicada],
            ].map(([k, l, n]) => (
              <button key={k} className={"filtro" + (filtro === k ? " on" : "") + (k === "revisao" && n > 0 ? " urgente" : "")}
                onClick={() => { setFiltro(k); setSel(new Set()); }}>
                <b>{n}</b><span>{l}</span>
              </button>
            ))}
          </div>

          <main className="lista">
            {carregandoLista && <p className="vazio">Carregando…</p>}
            {!carregandoLista && lista.length === 0 && (
              <p className="vazio">Nada aqui. Suba PDFs acima ou espere o watcher.</p>
            )}
            {lista.map((g) => (
              <CardGuia key={g.id} g={g} sel={sel.has(g.id)}
                onSel={() => alternar(g.id)} onAbrir={() => setAberta(g)} />
            ))}
          </main>

          {sel.size > 0 && (
            <div className="barra-acao">
              <div>
                <strong>{sel.size} selecionada{sel.size > 1 ? "s" : ""}</strong>
                <span>{brl(totalSel)}</span>
              </div>
              <div className="barra-botoes">
                <button className="btn-fantasma" onClick={() => setSel(new Set())}>Limpar</button>
                <button className="btn-primario" onClick={publicar}>Publicar</button>
              </div>
            </div>
          )}
        </>
      )}

      {aba === "extratos" && (
        <>
          <AreaUploadExtrato empresas={empresas} guias={guias} avisar={avisar} aoTerminar={recarregarApuracoes} />
          <main className="lista">
            {carregandoLista && <p className="vazio">Carregando…</p>}
            {!carregandoLista && apuracoes.length === 0 && (
              <p className="vazio">Nenhum extrato gravado ainda. Suba um PDF acima.</p>
            )}
            {apuracoes.map((a) => (
              <CardApuracao key={a.id} a={a} avisar={avisar} aoAtualizar={recarregarApuracoes} />
            ))}
          </main>
        </>
      )}

      {aba === "relatorios" && (
        <main className="lista">
          {RELATORIOS.map((r) => <CardRelatorio key={r.id} r={r} avisar={avisar} />)}
        </main>
      )}

      {aba === "empresas" && (
        <AbaEmpresas empresas={empresas} avisar={avisar} aoCadastrar={recarregarEmpresas} />
      )}

      {aberta && (
        <Detalhe g={aberta} onFechar={() => setAberta(null)} avisar={avisar}
          perfil={perfil} aoAtualizar={recarregarGuias} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ---------- upload e classificação ---------- */
function AreaUpload({ empresas, avisar, aoTerminar }) {
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState([]); // [{arquivo, situacao, detalhe}]

  const processarArquivos = async (arquivos) => {
    setProcessando(true);
    setProgresso(arquivos.map((f) => ({ arquivo: f.name, situacao: "processando", detalhe: "" })));

    let classificadas = 0, revisao = 0, duplicadas = 0;

    for (let i = 0; i < arquivos.length; i++) {
      const arquivo = arquivos[i];
      const atualizar = (patch) => setProgresso((p) => p.map((item, j) => (j === i ? { ...item, ...patch } : item)));

      try {
        const form = new FormData();
        form.append("arquivo", arquivo);
        // a identificação da empresa roda no servidor (parsers/identificador_empresa.py),
        // cruzando CNPJ completo, raiz do CNPJ e nome — não só um .find() por CNPJ exato
        form.append("empresas", JSON.stringify(empresas.map((e) => ({
          id: e.id, cnpj: e.cnpj, razao_social: e.razao_social, nome_fantasia: e.nome_fantasia,
        }))));
        const resp = await fetch("/api/parse-guia", { method: "POST", body: form });
        const dados = await resp.json();

        if (!resp.ok) {
          atualizar({ situacao: "erro", detalhe: dados.erro || "falha ao processar" });
          continue;
        }

        // dedup por hash — nunca insere duas vezes o mesmo arquivo
        const { data: existente } = await supabase
          .from("guias").select("id").eq("arquivo_hash", dados.arquivo_hash).maybeSingle();
        if (existente) {
          duplicadas++;
          atualizar({ situacao: "duplicada", detalhe: "arquivo já processado" });
          continue;
        }

        const ident = dados.identificacao || {};
        const empresa = ident.empresa_id ? empresas.find((e) => e.id === ident.empresa_id) : null;

        if (!empresa) {
          revisao++;
          const motivo = ident.candidatos && ident.candidatos.length > 1
            ? "empresa ambígua — mais de uma corresponde, selecionar manualmente"
            : (ident.motivos || []).join(" · ") || "CNPJ não cadastrado no sistema — cadastre a empresa e suba de novo";
          atualizar({ situacao: "revisao", detalhe: motivo });
          continue;
        }

        // vai pra revisão se: o parser sinalizou algo, a identificação não
        // teve certeza suficiente (raiz sem nome, nome sozinho, pasta
        // divergente...), ou faltou algum campo obrigatório pro cliente ver.
        const alertas = [...(dados.alertas || []), ...(ident.exige_revisao ? ident.motivos : [])];
        const status = (alertas.length > 0 || !dados.publicavel) ? "revisao" : "processando";
        if (status === "revisao") revisao++; else classificadas++;

        const ano = dados.vencimento ? dados.vencimento.slice(0, 4) : new Date().getFullYear();
        const caminhoStorage = `guias/${dados.cnpj}/${ano}/${dados.arquivo_hash}.pdf`;
        const { error: erroUpload } = await supabase.storage.from("guias").upload(caminhoStorage, arquivo, {
          contentType: "application/pdf", upsert: false,
        });
        if (erroUpload) {
          atualizar({ situacao: "erro", detalhe: "falha no upload: " + erroUpload.message });
          continue;
        }

        // GFD não tem linha de barras — guia_parser.py guarda o payload Pix
        // no mesmo campo linha_digitavel; aqui é roteado pra coluna certa.
        const ehPix = dados.tipo === "GFD";
        // guia de parcelamento não tem competência (cobre "Diversos") e a
        // descrição vira o nome traduzido da sigla, nunca a sigla crua
        const descricao = dados.eh_parcelamento ? nomeParcelamento(dados.parcelamento_sigla) : (dados.subtipo || dados.tipo);

        const { error: erroInsert } = await supabase.from("guias").insert({
          empresa_id: empresa.id,
          tipo: dados.tipo,
          descricao,
          competencia: dados.eh_parcelamento ? null : dados.competencia,
          vencimento: dados.vencimento,
          valor: dados.valor,
          eh_parcelamento: !!dados.eh_parcelamento,
          parcelamento_sigla: dados.parcelamento_sigla || null,
          parcelamento_numero: dados.parcelamento_numero || null,
          parcela_atual: dados.parcela_atual ?? null,
          parcela_total: dados.parcela_total ?? null,
          valor_principal: dados.valor_principal ?? null,
          valor_multa: dados.valor_multa ?? null,
          valor_juros: dados.valor_juros ?? null,
          linha_digitavel: ehPix ? null : dados.linha_digitavel,
          pix_copia_cola: ehPix ? dados.linha_digitavel : null,
          status,
          storage_path: caminhoStorage,
          arquivo_hash: dados.arquivo_hash,
          nome_original: dados.arquivo,
          origem: "manual",
          confianca: dados.confianca,
          classificado_por: dados.layout || "regex",
        });
        if (erroInsert) {
          atualizar({ situacao: "erro", detalhe: erroInsert.message });
          continue;
        }

        atualizar({ situacao: status === "revisao" ? "revisao" : "pronta", detalhe: alertas.join(" · ") || "classificada" });
      } catch (e) {
        atualizar({ situacao: "erro", detalhe: String(e.message || e) });
      }
    }

    setProcessando(false);
    avisar(`${classificadas} classificada${classificadas === 1 ? "" : "s"}, ${revisao} em revisão, ${duplicadas} duplicada${duplicadas === 1 ? "" : "s"}`);
    await aoTerminar();
  };

  return (
    <div className="upload">
      <label className="upload-botao">
        {processando ? "Processando…" : "Subir PDFs"}
        <input type="file" accept="application/pdf" multiple disabled={processando}
          onChange={(e) => { const fs = [...e.target.files]; e.target.value = ""; if (fs.length) processarArquivos(fs); }}
          style={{ display: "none" }} />
      </label>
      {progresso.length > 0 && (
        <div className="upload-lista">
          {progresso.map((p, i) => (
            <div key={i} className={"upload-item " + p.situacao}>
              <span className="mono">{p.arquivo}</span>
              <span>{p.situacao}{p.detalhe ? " — " + p.detalhe : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- upload do extrato do Simples (RBT12/alíquota) ----------
   Diferente da guia: sem vencimento, sem linha digitável. Alimenta
   apuracoes_simples + apuracao_anexos (quando há mais de um) +
   apuracao_tributos + apuracao_historico_receita — sempre com
   publicada=false. Quem libera pro cliente é o "Publicar" em
   CardApuracao, nunca o upload sozinho (ver CLAUDE.md, invariante 3). */
function AreaUploadExtrato({ empresas, guias, avisar, aoTerminar }) {
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState([]);

  const processarArquivos = async (arquivos) => {
    setProcessando(true);
    setProgresso(arquivos.map((f) => ({ arquivo: f.name, situacao: "processando", detalhe: "" })));

    let gravadas = 0, revisao = 0, duplicadas = 0;

    for (let i = 0; i < arquivos.length; i++) {
      const arquivo = arquivos[i];
      const atualizar = (patch) => setProgresso((p) => p.map((item, j) => (j === i ? { ...item, ...patch } : item)));

      try {
        const form = new FormData();
        form.append("arquivo", arquivo);
        form.append("empresas", JSON.stringify(empresas.map((e) => ({
          id: e.id, cnpj: e.cnpj, razao_social: e.razao_social, nome_fantasia: e.nome_fantasia,
        }))));
        const resp = await fetch("/api/parse-extrato", { method: "POST", body: form });
        const dados = await resp.json();

        if (!resp.ok) {
          atualizar({ situacao: "erro", detalhe: dados.erro || "falha ao processar" });
          continue;
        }

        const { data: existente } = await supabase
          .from("apuracoes_simples").select("id").eq("arquivo_hash", dados.arquivo_hash).maybeSingle();
        if (existente) {
          duplicadas++;
          atualizar({ situacao: "duplicada", detalhe: "arquivo já processado" });
          continue;
        }

        const ident = dados.identificacao || {};
        const empresa = ident.empresa_id ? empresas.find((e) => e.id === ident.empresa_id) : null;

        if (!empresa) {
          revisao++;
          const motivo = ident.candidatos && ident.candidatos.length > 1
            ? "empresa ambígua — mais de uma corresponde, selecionar manualmente"
            : (ident.motivos || []).join(" · ") || "CNPJ não cadastrado no sistema — cadastre a empresa e suba de novo";
          atualizar({ situacao: "revisao", detalhe: motivo });
          continue;
        }

        // linka no DAS da mesma competência, se já existir — só facilita
        // a conferência cruzada, nunca é obrigatório
        const guiaDas = guias.find((g) =>
          g.cnpj === empresa.cnpj && g.tipo === "DAS" && g.competencia === dados.competencia);

        const ano = dados.competencia ? dados.competencia.slice(3, 7) : String(new Date().getFullYear());
        const caminhoStorage = `extratos/${dados.cnpj}/${ano}/${dados.arquivo_hash}.pdf`;
        const { error: erroUpload } = await supabase.storage.from("guias").upload(caminhoStorage, arquivo, {
          contentType: "application/pdf", upsert: false,
        });
        if (erroUpload) {
          atualizar({ situacao: "erro", detalhe: "falha no upload: " + erroUpload.message });
          continue;
        }

        const anexoUnico = !dados.multiplos_anexos ? dados.anexos[0] : null;

        const { data: apuracaoInserida, error: erroApuracao } = await supabase.from("apuracoes_simples").insert({
          empresa_id: empresa.id,
          guia_id: guiaDas ? guiaDas.id : null,
          competencia: dados.competencia,
          anexo: anexoUnico ? anexoUnico.anexo : null,
          rpa: dados.rpa,
          rbt12: dados.rbt12,
          faixa_de: dados.faixa_de,
          faixa_ate: dados.faixa_ate,
          aliquota_nominal: anexoUnico ? anexoUnico.aliquota_nominal : null,
          aliquota_efetiva: anexoUnico ? anexoUnico.aliquota_efetiva : dados.aliquota_efetiva_media,
          parcela_deduzir: anexoUnico ? anexoUnico.parcela_deduzir : null,
          total_a_recolher: dados.total_a_recolher,
          storage_path: caminhoStorage,
          arquivo_hash: dados.arquivo_hash,
          publicada: false,
        }).select("id").single();
        if (erroApuracao) {
          atualizar({ situacao: "erro", detalhe: erroApuracao.message });
          continue;
        }
        const apuracaoId = apuracaoInserida.id;

        if (dados.historico_rbt12?.length) {
          const { error: erroHist } = await supabase.from("apuracao_historico_receita").insert(
            dados.historico_rbt12.map((h) => ({
              apuracao_id: apuracaoId, competencia: h.competencia,
              receita_interna: h.receita_interna, receita_exportacao: h.receita_exportacao,
            }))
          );
          if (erroHist) console.error("Falha ao gravar histórico de receita:", erroHist.message);
        }

        if (dados.multiplos_anexos) {
          for (const a of dados.anexos) {
            const { data: anexoInserido, error: erroAnexo } = await supabase.from("apuracao_anexos").insert({
              apuracao_id: apuracaoId, anexo: a.anexo, receita_tributada: a.receita_tributada,
              aliquota_nominal: a.aliquota_nominal, aliquota_efetiva: a.aliquota_efetiva,
              parcela_deduzir: a.parcela_deduzir, percentual_reducao_icms: a.percentual_reducao_icms,
              subtotal: a.subtotal,
            }).select("id").single();
            if (erroAnexo) { console.error("Falha ao gravar anexo:", erroAnexo.message); continue; }
            if (a.tributos?.length) {
              const { error: erroTrib } = await supabase.from("apuracao_tributos").insert(
                a.tributos.map((t) => ({
                  apuracao_id: apuracaoId, apuracao_anexo_id: anexoInserido.id, nome: t.nome,
                  situacao: t.situacao, base_calculo: t.base_calculo, aliquota: t.aliquota,
                  percentual_reducao: a.percentual_reducao_icms, valor: t.valor,
                }))
              );
              if (erroTrib) console.error("Falha ao gravar tributos do anexo:", erroTrib.message);
            }
          }
        } else if (anexoUnico?.tributos?.length) {
          const { error: erroTrib } = await supabase.from("apuracao_tributos").insert(
            anexoUnico.tributos.map((t) => ({
              apuracao_id: apuracaoId, nome: t.nome, situacao: t.situacao,
              base_calculo: t.base_calculo, aliquota: t.aliquota,
              percentual_reducao: anexoUnico.percentual_reducao_icms, valor: t.valor,
            }))
          );
          if (erroTrib) console.error("Falha ao gravar tributos:", erroTrib.message);
        }

        gravadas++;
        atualizar({
          situacao: dados.precisa_revisao ? "revisao" : "pronta",
          detalhe: dados.precisa_revisao ? (dados.alertas || []).join(" · ") : "gravado — falta publicar",
        });
      } catch (e) {
        atualizar({ situacao: "erro", detalhe: String(e.message || e) });
      }
    }

    setProcessando(false);
    avisar(`${gravadas} extrato${gravadas === 1 ? "" : "s"} gravado${gravadas === 1 ? "" : "s"}, ${revisao} em revisão, ${duplicadas} duplicado${duplicadas === 1 ? "" : "s"}`);
    await aoTerminar();
  };

  return (
    <div className="upload">
      <label className="upload-botao">
        {processando ? "Processando…" : "Subir extrato do Simples"}
        <input type="file" accept="application/pdf" multiple disabled={processando}
          onChange={(e) => { const fs = [...e.target.files]; e.target.value = ""; if (fs.length) processarArquivos(fs); }}
          style={{ display: "none" }} />
      </label>
      {progresso.length > 0 && (
        <div className="upload-lista">
          {progresso.map((p, i) => (
            <div key={i} className={"upload-item " + p.situacao}>
              <span className="mono">{p.arquivo}</span>
              <span>{p.situacao}{p.detalhe ? " — " + p.detalhe : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- card de apuração do extrato ---------- */
function CardApuracao({ a, avisar, aoAtualizar }) {
  const [publicando, setPublicando] = useState(false);
  const anexos = a.apuracao_anexos || [];
  const multiplo = anexos.length > 1;
  const empresa = a.empresas;

  const publicar = async () => {
    setPublicando(true);
    try {
      const { error } = await supabase.from("apuracoes_simples").update({ publicada: true }).eq("id", a.id);
      if (error) { avisar("Falha ao publicar: " + error.message); return; }
      avisar("Extrato publicado — visível no \"Entenda seu imposto\" do cliente");
      await aoAtualizar();
    } catch (e) {
      avisar("Erro inesperado ao publicar: " + (e.message || e));
    } finally {
      setPublicando(false);
    }
  };

  return (
    <article className={"card" + (!a.publicada ? " rev" : "")} style={{ flexDirection: "column", padding: 14, alignItems: "stretch", gap: 8 }}>
      <div className="card-linha1">
        <span className="selo das">EXTRATO</span>
        <strong>{empresa?.nome_fantasia || empresa?.razao_social || "empresa não identificada"}</strong>
        <span className="valor">{pctFmt(a.aliquota_efetiva)}</span>
      </div>
      <div className="card-linha3">
        <span className="mono">{cnpjFmt(empresa?.cnpj)}</span>
        <span>·</span>
        <span>competência {a.competencia}</span>
        <span>·</span>
        <span>RBT12 {brl(a.rbt12)}</span>
        {multiplo && <span>· {anexos.length} anexos</span>}
      </div>
      <div className="acoes">
        <span style={{ flex: 1, alignSelf: "center", fontSize: 12.5, color: a.publicada ? "#1F6B4A" : "#B8791A", fontWeight: 600 }}>
          {a.publicada ? "Publicado" : "Aguardando publicação"}
        </span>
        {!a.publicada && (
          <button className="btn-primario" disabled={publicando} onClick={publicar}>
            {publicando ? "Publicando…" : "Publicar"}
          </button>
        )}
      </div>
    </article>
  );
}

// aliquota_efetiva é gravada como número "de fato" (6,50), não fração —
// mesma convenção usada no app do cliente (ver pct() em app-cliente.jsx)
const pctFmt = (v) => (v == null ? "—" : `${Number(v).toFixed(2).replace(".", ",")}%`);

/* ---------- cadastro de empresas ---------- */
function AbaEmpresas({ empresas, avisar, aoCadastrar }) {
  const [novo, setNovo] = useState(false);
  if (novo) return <FormNovaEmpresa onCancelar={() => setNovo(false)} avisar={avisar}
    aoCadastrar={async () => { await aoCadastrar(); setNovo(false); }} />;
  return (
    <main className="lista">
      <button className="btn-primario largo" onClick={() => setNovo(true)}>Nova empresa</button>
      {empresas.map((e) => (
        <article className="card" key={e.id} style={{ padding: 14, flexDirection: "column", alignItems: "stretch", gap: 4 }}>
          <strong>{e.nome_fantasia || e.razao_social}</strong>
          <span className="empresa mono">{cnpjFmt(e.cnpj)}</span>
          <span className="empresa">{ROTULO_REGIME[e.regime] || e.regime} · {e.municipio}/{e.uf}</span>
        </article>
      ))}
    </main>
  );
}

function FormNovaEmpresa({ onCancelar, avisar, aoCadastrar }) {
  const [f, setF] = useState({
    cnpj: "", razao_social: "", nome_fantasia: "", regime: "simples",
    inscricao_estadual: "", inscricao_municipal: "", municipio: "Nova Friburgo", uf: "RJ",
    tem_funcionarios: false, tem_prolabore: false, contribuinte_icms: false, contribuinte_iss: false,
    pasta_origem: "",
  });
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const set = (campo) => (v) => setF((s) => ({ ...s, [campo]: v }));

  const salvar = async () => {
    const cnpjDigitos = f.cnpj.replace(/\D/g, "");
    if (!cnpjValido(cnpjDigitos)) { setErro("CNPJ inválido — confira o dígito verificador."); return; }
    if (!f.razao_social.trim()) { setErro("Razão social é obrigatória."); return; }

    setSalvando(true);
    const { error } = await supabase.from("empresas").insert({
      cnpj: cnpjDigitos,
      razao_social: f.razao_social.trim(),
      nome_fantasia: f.nome_fantasia.trim() || null,
      regime: f.regime,
      inscricao_estadual: f.inscricao_estadual || null,
      inscricao_municipal: f.inscricao_municipal || null,
      municipio: f.municipio,
      uf: f.uf,
      tem_funcionarios: f.tem_funcionarios,
      tem_prolabore: f.tem_prolabore,
      contribuinte_icms: f.contribuinte_icms,
      contribuinte_iss: f.contribuinte_iss,
      pasta_origem: f.pasta_origem || null,
    });
    setSalvando(false);

    if (error) {
      setErro(error.code === "23505" ? "Já existe uma empresa com esse CNPJ." : error.message);
      return;
    }
    avisar("Empresa cadastrada");
    await aoCadastrar();
  };

  return (
    <main className="lista">
      <div className="ficha" style={{ padding: 16 }}>
        <h3 className="sub" style={{ marginTop: 0 }}>Nova empresa</h3>
        <div className="form">
          <label><span>CNPJ</span>
            <input value={f.cnpj} onChange={(e) => set("cnpj")(e.target.value)} placeholder="00.000.000/0000-00" /></label>
          <label><span>Razão social</span>
            <input value={f.razao_social} onChange={(e) => set("razao_social")(e.target.value)} /></label>
          <label><span>Nome fantasia</span>
            <input value={f.nome_fantasia} onChange={(e) => set("nome_fantasia")(e.target.value)} /></label>
          <label><span>Regime</span>
            <select value={f.regime} onChange={(e) => set("regime")(e.target.value)}
              style={{ font: "inherit", padding: 12, border: "1px solid var(--linha)", borderRadius: 10 }}>
              {Object.entries(ROTULO_REGIME).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></label>
          <label><span>Inscrição estadual</span>
            <input value={f.inscricao_estadual} onChange={(e) => set("inscricao_estadual")(e.target.value)} /></label>
          <label><span>Inscrição municipal</span>
            <input value={f.inscricao_municipal} onChange={(e) => set("inscricao_municipal")(e.target.value)} /></label>
          <label><span>Município</span>
            <input value={f.municipio} onChange={(e) => set("municipio")(e.target.value)} /></label>
          <label><span>UF</span>
            <input value={f.uf} maxLength={2} onChange={(e) => set("uf")(e.target.value.toUpperCase())} /></label>
          <label><span>Pasta de origem (watcher)</span>
            <input value={f.pasta_origem} onChange={(e) => set("pasta_origem")(e.target.value)} placeholder="\\servidor\clientes\..." /></label>
          {[["tem_funcionarios", "Tem funcionários"], ["tem_prolabore", "Tem pró-labore"],
            ["contribuinte_icms", "Contribuinte de ICMS"], ["contribuinte_iss", "Contribuinte de ISS"]].map(([campo, rotulo]) => (
            <label key={campo} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={f[campo]} onChange={(e) => set(campo)(e.target.checked)} style={{ width: "auto" }} />
              <span style={{ textTransform: "none", fontSize: 13, fontWeight: 500 }}>{rotulo}</span>
            </label>
          ))}
        </div>
        {erro && <p className="alerta" style={{ marginTop: 10 }}>{erro}</p>}
        <div className="acoes">
          <button className="btn-secundario" onClick={onCancelar}>Cancelar</button>
          <button className="btn-primario" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Cadastrar"}</button>
        </div>
      </div>
    </main>
  );
}

/* ---------- card de guia ---------- */
function CardGuia({ g, sel, onSel, onAbrir }) {
  const revisao = g.estado === "revisao";
  return (
    <article className={"card" + (revisao ? " rev" : "") + (sel ? " sel" : "")}>
      {!revisao && (
        <button className={"caixa" + (sel ? " on" : "")} onClick={onSel} aria-label="Selecionar">
          {sel && "✓"}
        </button>
      )}
      <button className="card-corpo" onClick={onAbrir}>
        <div className="card-linha1">
          <span className={"selo " + (g.tipo || "?").toLowerCase()}>{g.tipo}</span>
          <strong>{g.subtipo || g.arquivo}</strong>
          <span className="valor">{brl(g.valor)}</span>
        </div>
        <div className="card-linha2">
          <span className="empresa">{g.razao || <em>empresa não identificada</em>}</span>
        </div>
        <div className="card-linha3">
          <span className="mono">{cnpjFmt(g.cnpj)}</span>
          <span>·</span>
          <span>comp. {g.competencia || "—"}</span>
          <span>·</span>
          <span>venc. {dataBR(g.vencimento)}</span>
          {g.confianca > 0 && (
            <span className="conf">{Math.round(g.confianca * 100)}%</span>
          )}
        </div>
        {g.alertas.map((a, i) => (
          <p className="alerta" key={i}>{a}</p>
        ))}
      </button>
    </article>
  );
}

/* ---------- detalhe ---------- */
function Detalhe({ g, onFechar, avisar, perfil, aoAtualizar }) {
  const [ed, setEd] = useState({
    competencia: g.competencia || "", vencimento: g.vencimento || "", valor: g.valor ?? "",
  });
  const [salvando, setSalvando] = useState(false);
  const revisao = g.estado === "revisao";

  const salvarELiberar = async () => {
    setSalvando(true);
    try {
      const valorNum = typeof ed.valor === "string" ? parseFloat(ed.valor.replace(",", ".")) : ed.valor;
      const { error } = await supabase.from("guias").update({
        competencia: ed.competencia || null,
        vencimento: ed.vencimento || null,
        valor: Number.isNaN(valorNum) ? null : valorNum,
        status: "processando",
        revisado_por: perfil?.id,
        revisado_em: new Date().toISOString(),
      }).eq("id", g.id);
      if (error) { avisar("Falha ao salvar: " + error.message); return; }
      avisar("Correção salva — guia movida para prontas");
      await aoAtualizar();
      onFechar();
    } catch (e) {
      avisar("Erro inesperado ao salvar: " + (e.message || e));
    } finally {
      setSalvando(false);
    }
  };

  const publicarUma = async () => {
    setSalvando(true);
    try {
      const { error } = await supabase.from("guias").update({ status: "publicada" }).eq("id", g.id);
      if (error) { avisar("Falha ao publicar: " + error.message); return; }
      const { error: erroEvento } = await supabase.from("guia_eventos").insert({ guia_id: g.id, tipo: "publicada", usuario_id: perfil?.id });
      if (erroEvento) console.error("Falha ao registrar evento 'publicada':", erroEvento.message);
      avisar("Guia publicada — cliente notificado");
      await aoAtualizar();
      onFechar();
    } catch (e) {
      avisar("Erro inesperado ao publicar: " + (e.message || e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="modal" onClick={onFechar}>
      <div className="folha" onClick={(e) => e.stopPropagation()}>
        <div className="folha-topo">
          <div>
            <span className={"selo " + (g.tipo || "?").toLowerCase()}>{g.tipo}</span>
            <h3>{g.subtipo || "Não classificado"}</h3>
            <p className="mono arquivo">{g.arquivo}</p>
          </div>
          <button className="fechar" onClick={onFechar}>✕</button>
        </div>

        {revisao ? (
          <>
            <div className="aviso-rev">
              {g.alertas.map((a, i) => <p key={i}>{a}</p>)}
            </div>
            <p className="dica">
              Corrija os campos abaixo ou envie o arquivo para OCR. Guia em revisão
              não aparece para o cliente.
            </p>
            <p className="mono arquivo">CNPJ do documento: {cnpjFmt(g.cnpj)}</p>
            <div className="form">
              <label><span>Competência</span>
                <input value={ed.competencia} onChange={(e) => setEd({ ...ed, competencia: e.target.value })}
                  placeholder="MM/AAAA" /></label>
              <label><span>Vencimento</span>
                <input type="date" value={ed.vencimento}
                  onChange={(e) => setEd({ ...ed, vencimento: e.target.value })} /></label>
              <label><span>Valor</span>
                <input value={ed.valor} onChange={(e) => setEd({ ...ed, valor: e.target.value })}
                  placeholder="0,00" /></label>
            </div>
            <div className="acoes">
              <button className="btn-secundario" onClick={() => avisar("Arquivo enviado para OCR")}>
                Enviar para OCR
              </button>
              <button className="btn-primario" disabled={salvando} onClick={salvarELiberar}>
                {salvando ? "Salvando…" : "Salvar e liberar"}
              </button>
            </div>
            {g.duplicata && (
              <button className="btn-fantasma largo" onClick={() => avisar("Arquivo descartado como duplicata")}>
                Descartar — é cópia de {g.duplicata}
              </button>
            )}
          </>
        ) : (
          <>
            <dl className="ficha">
              <div><dt>Empresa</dt><dd>{g.razao}</dd></div>
              <div><dt>CNPJ</dt><dd className="mono">{cnpjFmt(g.cnpj)}</dd></div>
              <div><dt>Órgão</dt><dd>{g.orgao}</dd></div>
              <div><dt>Competência</dt><dd>{g.competencia}</dd></div>
              <div><dt>Vencimento</dt><dd>{dataBR(g.vencimento)}</dd></div>
              <div><dt>Valor</dt><dd className="destaque">{brl(g.valor)}</dd></div>
              {g.codigo && <div><dt>Código da receita</dt><dd className="mono">{g.codigo}</dd></div>}
              <div><dt>Extração</dt><dd>{g.layout} · {Math.round(g.confianca * 100)}% de confiança</dd></div>
              <div><dt>Hash</dt><dd className="mono">{g.hash}</dd></div>
            </dl>

            {g.composicao && (
              <>
                <h4 className="sub">Composição</h4>
                <div className="comp">
                  {g.composicao.map((c, i) => (
                    <div key={i}><span>{c.n}</span><b>{brl(c.v)}</b></div>
                  ))}
                  <div className="soma"><span>Total</span><b>{brl(g.valor)}</b></div>
                </div>
              </>
            )}

            {g.obs && <p className="obs">{g.obs}</p>}

            {g.linha && (
              <>
                <h4 className="sub">Linha digitável</h4>
                <code className="linha">{g.linha}</code>
              </>
            )}

            <div className="acoes">
              <button className="btn-secundario" onClick={() => avisar("Abrindo PDF original")}>
                Ver PDF
              </button>
              <button className="btn-primario" onClick={() => { avisar("Guia publicada — cliente notificado"); onFechar(); }}>
                Publicar para o cliente
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- relatório fiscal ---------- */
function CardRelatorio({ r, avisar }) {
  const [aberto, setAberto] = useState(true);
  return (
    <article className="card rel">
      <div className="rel-topo">
        <div>
          <span className="selo sitfis">SITFIS</span>
          <strong>{r.empresa}</strong>
          <p className="mono">{cnpjFmt(r.cnpj)} · consulta de {r.emitido}</p>
        </div>
        <div className="rel-num">
          <b>{brl(r.total)}</b>
          <span>{r.pendencias} pendências</span>
        </div>
      </div>

      <div className="checks">
        <span className="check ok">✓ Números conferidos contra o PDF</span>
        <span className={"check " + (r.podeCnd ? "ok" : "alerta")}>
          {r.podeCnd ? "✓ Nada impeditivo para certidão" : "! Pendência impeditiva"}
        </span>
        <span className="check ok">✓ Impeditivo: {brl(r.impeditivo)}</span>
      </div>

      <button className="btn-fantasma largo" onClick={() => setAberto(!aberto)}>
        {aberto ? "Ocultar minuta" : "Ver minuta"}
      </button>

      {aberto && (
        <div className="minuta">
          <h4>{r.minuta.titulo}</h4>
          <p className="resumo">{r.minuta.resumo}</p>
          {r.minuta.secoes.map((s, i) => (
            <div key={i}>
              <h5>{s.titulo}</h5>
              <p>{s.texto}</p>
            </div>
          ))}
          <p className="escopo">{r.minuta.escopo}</p>
          <p className="passo">{r.minuta.passo}</p>
        </div>
      )}

      <div className="acoes">
        <button className="btn-secundario" onClick={() => avisar("Minuta aberta para edição")}>Editar texto</button>
        <button className="btn-primario" onClick={() => avisar("Relatório publicado no app do cliente")}>
          Aprovar e publicar
        </button>
      </div>
    </article>
  );
}

/* ============================ CSS ============================ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;600;700;800&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap');

*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
:root{
  --papel:#F4F4F2;--branco:#fff;--tinta:#0A0A0A;--suave:#6B6B68;--linha:#E2E2DF;
  --ambar:#B8791A;--rubro:#B02A1E;--verde:#1F6B4A;
}
.app{min-height:100vh;background:var(--papel);font-family:'Instrument Sans',system-ui,sans-serif;
  color:var(--tinta);padding-bottom:110px}
h1,h2,h3,h4,.valor,.destaque,b{font-family:'Bricolage Grotesque',sans-serif;letter-spacing:-.02em}
.mono,code{font-family:'JetBrains Mono',monospace}

.topo{background:#000;color:#F2F2F0;padding:16px 18px 0;position:sticky;top:0;z-index:20}
.marca{display:flex;align-items:center;gap:11px;padding-bottom:14px}
.marca strong{display:block;font-size:16px;font-family:'Bricolage Grotesque';font-weight:700}
.marca span{font-size:11.5px;color:#8E8E8A}
.abas{display:flex;gap:22px}
.abas button{background:none;border:0;color:#8E8E8A;font:inherit;font-size:14px;font-weight:600;
  padding:0 0 12px;cursor:pointer;border-bottom:2px solid transparent;display:flex;align-items:center;gap:7px}
.abas button.on{color:#fff;border-bottom-color:#fff}
.badge{font-style:normal;background:var(--rubro);color:#fff;font-size:10.5px;font-weight:700;
  padding:1px 6px;border-radius:9px;font-family:'JetBrains Mono'}

.upload{padding:14px 16px 0;max-width:860px;margin:0 auto}
.upload-botao{display:block;text-align:center;background:var(--branco);border:1.5px dashed var(--linha);
  border-radius:13px;padding:16px;font:inherit;font-weight:600;font-size:14px;color:var(--tinta);cursor:pointer}
.upload-lista{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.upload-item{background:var(--branco);border:1px solid var(--linha);border-radius:10px;padding:9px 12px;
  display:flex;justify-content:space-between;gap:10px;font-size:12px}
.upload-item.pronta{border-left:3px solid var(--verde)}
.upload-item.revisao{border-left:3px solid var(--ambar)}
.upload-item.duplicada{border-left:3px solid var(--suave)}
.upload-item.erro{border-left:3px solid var(--rubro)}
.painel-filtros{display:flex;gap:8px;padding:14px 16px 0}
.filtro{flex:1;background:var(--branco);border:1px solid var(--linha);border-radius:12px;
  padding:11px 8px;display:flex;flex-direction:column;align-items:center;gap:1px;font:inherit;cursor:pointer}
.filtro b{font-size:20px;font-weight:700}
.filtro span{font-size:11px;color:var(--suave);font-weight:600}
.filtro.on{background:var(--tinta);border-color:var(--tinta);color:#fff}
.filtro.on span{color:#B5B5B0}
.filtro.urgente b{color:var(--rubro)}
.filtro.on.urgente b{color:#FF8A7A}

.lista{padding:14px 16px;display:flex;flex-direction:column;gap:9px;max-width:860px;margin:0 auto}
.vazio{text-align:center;color:var(--suave);font-size:13.5px;padding:44px 20px}

.card{background:var(--branco);border:1px solid var(--linha);border-radius:14px;display:flex;
  align-items:flex-start;overflow:hidden}
.card.sel{border-color:var(--tinta);box-shadow:0 0 0 1px var(--tinta)}
.card.rev{border-left:4px solid var(--ambar)}
.caixa{width:22px;height:22px;border:1.5px solid #C9C9C4;border-radius:6px;background:none;
  margin:16px 0 0 14px;flex:none;cursor:pointer;color:#fff;font-size:12px;line-height:1;
  display:flex;align-items:center;justify-content:center}
.caixa.on{background:var(--tinta);border-color:var(--tinta)}
.card-corpo{flex:1;background:none;border:0;font:inherit;text-align:left;padding:14px;cursor:pointer;
  display:flex;flex-direction:column;gap:5px;min-width:0}
.card-linha1{display:flex;align-items:center;gap:9px}
.card-linha1 strong{font-size:14.5px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card-linha1 .valor{font-size:15.5px;font-weight:700;font-variant-numeric:tabular-nums;flex:none}
.selo{font-family:'JetBrains Mono';font-size:9.5px;font-weight:600;letter-spacing:.06em;
  padding:3px 7px;border-radius:5px;background:#EAEAE6;color:var(--suave);flex:none}
.selo.darf,.selo.das{background:#E3EDE7;color:var(--verde)}
.selo.darj{background:#E8E6F0;color:#4A417A}
.selo.sitfis{background:#EAEAE6;color:var(--tinta)}
.selo\\?{background:#F5EADA;color:var(--ambar)}
.empresa{font-size:12.5px;color:var(--suave);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.empresa em{color:var(--ambar);font-style:normal}
.card-linha3{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:11.5px;color:var(--suave)}
.conf{margin-left:auto;font-family:'JetBrains Mono';font-size:10.5px;background:#F0F0EC;
  padding:2px 6px;border-radius:5px}
.alerta{font-size:12px;color:var(--ambar);background:#FBF4E6;border-radius:7px;padding:7px 10px;margin-top:4px}

.barra-acao{position:fixed;bottom:0;left:0;right:0;background:var(--tinta);color:#fff;
  padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:14px;z-index:30}
.barra-acao strong{display:block;font-size:14px}
.barra-acao span{font-size:12.5px;color:#B5B5B0;font-variant-numeric:tabular-nums}
.barra-botoes{display:flex;gap:8px}

.btn-primario{background:var(--tinta);color:#fff;border:0;border-radius:11px;padding:12px 18px;
  font:inherit;font-weight:600;font-size:14px;cursor:pointer}
.barra-acao .btn-primario{background:#fff;color:var(--tinta)}
.btn-secundario{background:var(--branco);color:var(--tinta);border:1px solid var(--linha);
  border-radius:11px;padding:12px 18px;font:inherit;font-weight:600;font-size:14px;cursor:pointer}
.btn-fantasma{background:none;border:0;color:var(--suave);font:inherit;font-weight:600;
  font-size:13.5px;cursor:pointer;padding:9px}
.barra-acao .btn-fantasma{color:#B5B5B0}
.largo{width:100%}
.acoes{display:flex;gap:8px;margin-top:14px}
.acoes button{flex:1}

/* modal */
.modal{position:fixed;inset:0;background:rgba(10,10,10,.55);z-index:40;display:flex;
  align-items:flex-end;justify-content:center;backdrop-filter:blur(3px)}
.folha{background:var(--papel);width:100%;max-width:560px;max-height:92vh;overflow-y:auto;
  border-radius:20px 20px 0 0;padding:20px}
@media(min-width:640px){.modal{align-items:center}.folha{border-radius:20px}}
.folha-topo{display:flex;justify-content:space-between;gap:14px;margin-bottom:16px}
.folha-topo h3{font-size:19px;font-weight:700;margin-top:7px}
.arquivo{font-size:11px;color:var(--suave);margin-top:3px}
.fechar{background:none;border:0;font-size:19px;color:var(--suave);cursor:pointer;padding:2px 6px}
.ficha{background:var(--branco);border:1px solid var(--linha);border-radius:13px;padding:6px 15px}
.ficha div{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-bottom:1px solid #F1F1EE}
.ficha div:last-child{border:0}
.ficha dt{font-size:12.5px;color:var(--suave);flex:none}
.ficha dd{font-size:13px;text-align:right;font-weight:500}
.ficha dd.destaque{font-size:16px;font-weight:700}
.sub{font-size:11.5px;text-transform:uppercase;letter-spacing:.09em;color:var(--suave);
  font-weight:600;margin:18px 0 8px}
.comp{background:var(--branco);border:1px solid var(--linha);border-radius:13px;padding:6px 15px}
.comp div{display:flex;justify-content:space-between;padding:8px 0;font-size:13px;border-bottom:1px solid #F1F1EE}
.comp div:last-child{border:0}
.comp b{font-variant-numeric:tabular-nums}
.comp .soma{font-weight:700;border-top:1.5px solid var(--tinta);border-bottom:0;margin-top:2px}
.linha{display:block;background:var(--branco);border:1px solid var(--linha);border-radius:11px;
  padding:12px;font-size:12px;word-break:break-all;color:var(--suave)}
.obs{font-size:12.5px;color:var(--suave);background:#F0F0EC;border-radius:9px;padding:11px;margin-top:12px}
.aviso-rev{background:#FBF4E6;border:1px solid #EBD9B4;border-radius:12px;padding:13px;margin-bottom:12px}
.aviso-rev p{font-size:13px;color:#8A6516;font-weight:500}
.aviso-rev p+p{margin-top:5px}
.dica{font-size:12.5px;color:var(--suave);margin-bottom:14px;line-height:1.5}
.form{display:flex;flex-direction:column;gap:11px}
.form label{display:flex;flex-direction:column;gap:5px}
.form span{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--suave)}
.form input{background:var(--branco);border:1px solid var(--linha);border-radius:10px;padding:12px;
  font:inherit;font-size:15px;color:var(--tinta)}
.form input:focus{outline:2px solid var(--tinta);outline-offset:1px}

/* relatório */
.card.rel{flex-direction:column;padding:16px;gap:12px}
.rel-topo{display:flex;justify-content:space-between;gap:14px;width:100%}
.rel-topo strong{display:block;font-size:15px;font-weight:600;margin-top:7px}
.rel-topo p{font-size:11px;color:var(--suave);margin-top:3px}
.rel-num{text-align:right;flex:none}
.rel-num b{font-size:18px;font-weight:700;display:block;font-variant-numeric:tabular-nums}
.rel-num span{font-size:11.5px;color:var(--suave)}
.checks{display:flex;flex-direction:column;gap:5px;width:100%}
.check{font-size:12px;font-weight:500}
.check.ok{color:var(--verde)}
.check.alerta{color:var(--rubro)}
.minuta{background:var(--branco);border:1px solid var(--linha);border-radius:13px;padding:16px;width:100%}
.minuta h4{font-size:16px;font-weight:700;margin-bottom:9px}
.minuta h5{font-size:13px;font-weight:600;margin:14px 0 5px;font-family:'Instrument Sans'}
.minuta p{font-size:13.5px;line-height:1.62;color:#2A2A28}
.minuta .resumo{color:var(--tinta);font-weight:500}
.minuta .escopo{margin-top:16px;padding-top:12px;border-top:1px solid var(--linha);
  font-size:12px;color:var(--suave)}
.minuta .passo{margin-top:8px;font-size:12.5px;font-weight:600}

.toast{position:fixed;bottom:96px;left:16px;right:16px;max-width:520px;margin:0 auto;
  background:var(--tinta);color:#fff;padding:13px 16px;border-radius:12px;font-size:13.5px;
  text-align:center;z-index:50;box-shadow:0 8px 26px rgba(0,0,0,.3);animation:sobe .22s ease}
@keyframes sobe{from{opacity:0;transform:translateY(9px)}}
button:focus-visible,input:focus-visible{outline:2px solid var(--tinta);outline-offset:2px}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
