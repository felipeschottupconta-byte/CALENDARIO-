import React, { useState, useMemo } from "react";

/* ============================================================
   PAINEL DE PUBLICAÇÃO — RN Contabilidade
   Interface interna. Fica entre o watcher e o app do cliente.
   Nada chega ao cliente sem passar por aqui.
   Dados reais extraídos pelos parsers.
   ============================================================ */

function Marca({ tamanho = 30 }) {
  return <img src="logo-rn.png" alt="RN Contabilidade" style={{ height: tamanho, width: "auto", display: "block", borderRadius: tamanho * 0.09 }} />;
}

const DADOS_INICIAIS = [
  {
    id: "1",
    arquivo: "807-COFINS-052026.pdf",
    tipo: "DARF", subtipo: "COFINS", orgao: "RFB",
    cnpj: "32599342000166", razao: "D F FERNANDES CONFECCOES LTDA",
    competencia: "05/2026", vencimento: "2026-06-25", valor: 4686.30,
    codigo: "2172", confianca: 0.97, layout: "senda",
    linha: "85800000046 1 86300385261 9 76070126169 0 40085398857 4",
    hash: "a71f3c…", alertas: [], estado: "pronta",
  },
  {
    id: "2",
    arquivo: "807-PIS-052026.pdf",
    tipo: "DARF", subtipo: "PIS", orgao: "RFB",
    cnpj: "32599342000166", razao: "D F FERNANDES CONFECCOES LTDA",
    competencia: "05/2026", vencimento: "2026-06-25", valor: 1015.37,
    codigo: "8109", confianca: 0.97, layout: "senda",
    linha: "85800000010 0 15370385261 0 76070126169 0 39999241201 1",
    hash: "c40b91…", alertas: [], estado: "pronta",
  },
  {
    id: "3",
    arquivo: "807-ICMS-052026.pdf",
    tipo: "DARJ", subtipo: "Operações Próprias — Apuração", orgao: "SEFAZ-RJ",
    cnpj: "32599342000166", razao: "D F FERNANDES CONFECCOES LTDA",
    competencia: "05/2026", vencimento: "2026-06-10", valor: 6934.74,
    confianca: 0.93, layout: "darj",
    linha: "85810000069 2 34740359120 7 26061001000 6 21336406539 1",
    hash: "e18d55…", alertas: [], estado: "pronta",
    composicao: [{ n: "ICMS", v: 2972.04 }, { n: "FECP", v: 3962.70 }],
  },
  {
    id: "4",
    arquivo: "ICMS_DIFAL_05_2026.pdf",
    tipo: "DARJ", subtipo: "Diferencial de alíquota", orgao: "SEFAZ-RJ",
    cnpj: "28885515000135", razao: "NOVA AMERICAN MULTIMARCAS LTDA",
    competencia: "05/2026", vencimento: "2026-06-10", valor: 81.95,
    confianca: 0.93, layout: "darj",
    linha: "85800000000 3 81950359120 5 26061001000 6 21400058958 9",
    hash: "77ac02…", alertas: [], estado: "pronta",
    composicao: [{ n: "ICMS", v: 67.53 }, { n: "FECP", v: 14.42 }],
    obs: "ICMS DIFAL USO E CONSUMO REF FRETE 162980 TJ4 E NFE 5900 ECOBELA",
  },
  {
    id: "5",
    arquivo: "Simples_Nacional_-_052026.pdf",
    tipo: "DAS", subtipo: "Simples Nacional", orgao: "RFB",
    cnpj: "24178588000136", razao: "CERVEJARIA ARTESANAL ANGELS AND DEVILS LTDA",
    competencia: "05/2026", vencimento: "2026-06-22", valor: 149.48,
    confianca: 0.97, layout: "senda",
    linha: "85860000001 2 49480328261 7 73072026166 6 01275618475 8",
    hash: "3b9e07…", alertas: [], estado: "pronta",
    composicao: [
      { n: "IRPJ", v: 9.84 }, { n: "CSLL", v: 6.26 }, { n: "COFINS", v: 20.59 },
      { n: "PIS", v: 4.45 }, { n: "INSS", v: 67.09 }, { n: "IPI", v: 13.42 },
      { n: "ICMS", v: 27.83 },
    ],
  },
  {
    id: "6",
    arquivo: "ISS_-_052026.PDF",
    tipo: "?", subtipo: null, orgao: null,
    cnpj: null, razao: null, competencia: null, vencimento: null, valor: null,
    confianca: 0, layout: null, hash: "6ae4ef…",
    alertas: ["PDF sem camada de texto — precisa de OCR."],
    estado: "revisao",
  },
  {
    id: "7",
    arquivo: "ISS_-_052026__1_.PDF",
    tipo: "?", subtipo: null, orgao: null,
    cnpj: null, razao: null, competencia: null, vencimento: null, valor: null,
    confianca: 0, layout: null, hash: "6ae4ef…",
    alertas: ["PDF sem camada de texto — precisa de OCR.", "Arquivo idêntico a ISS_-_052026.PDF"],
    estado: "revisao", duplicata: "ISS_-_052026.PDF",
  },
];

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

/* ============================ APP ============================ */
export default function App() {
  const [guias, setGuias] = useState(DADOS_INICIAIS);
  const [aba, setAba] = useState("guias");
  const [filtro, setFiltro] = useState("pronta");
  const [sel, setSel] = useState(new Set());
  const [aberta, setAberta] = useState(null);
  const [toast, setToast] = useState(null);

  const avisar = (m) => { setToast(m); setTimeout(() => setToast(null), 2400); };

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

  const publicar = () => {
    const n = sel.size;
    setGuias(guias.map((g) => (sel.has(g.id) ? { ...g, estado: "publicada" } : g)));
    setSel(new Set());
    avisar(`${n} ${n === 1 ? "guia publicada" : "guias publicadas"} — clientes notificados`);
  };

  const totalSel = guias
    .filter((g) => sel.has(g.id))
    .reduce((s, g) => s + (g.valor || 0), 0);

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <header className="topo">
          <div className="marca">
            <Marca tamanho={30} />
            <div>
              <strong>Painel de publicação</strong>
              <span>Fila do watcher · 30/07/2026</span>
            </div>
          </div>
          <nav className="abas">
            <button className={aba === "guias" ? "on" : ""} onClick={() => setAba("guias")}>
              Guias {contagem.revisao > 0 && <i className="badge">{contagem.revisao}</i>}
            </button>
            <button className={aba === "relatorios" ? "on" : ""} onClick={() => setAba("relatorios")}>
              Relatórios <i className="badge">{RELATORIOS.length}</i>
            </button>
          </nav>
        </header>

        {aba === "guias" ? (
          <>
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
              {lista.length === 0 && (
                <p className="vazio">Nada aqui. O watcher publica novos arquivos automaticamente.</p>
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
        ) : (
          <main className="lista">
            {RELATORIOS.map((r) => <CardRelatorio key={r.id} r={r} avisar={avisar} />)}
          </main>
        )}

        {aberta && <Detalhe g={aberta} onFechar={() => setAberta(null)} avisar={avisar} />}
        {toast && <div className="toast">{toast}</div>}
      </div>
    </>
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
function Detalhe({ g, onFechar, avisar }) {
  const [ed, setEd] = useState({
    competencia: g.competencia || "", vencimento: g.vencimento || "",
    valor: g.valor ?? "", cnpj: g.cnpj || "",
  });
  const revisao = g.estado === "revisao";

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
            <div className="form">
              <label><span>CNPJ</span>
                <input value={ed.cnpj} onChange={(e) => setEd({ ...ed, cnpj: e.target.value })}
                  placeholder="somente dígitos" /></label>
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
              <button className="btn-primario" onClick={() => avisar("Correção salva — guia movida para prontas")}>
                Salvar e liberar
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
