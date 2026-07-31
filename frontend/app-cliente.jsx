import React, { useState } from "react";

/* ============================================================
   PORTAL DO CLIENTE — RN Contabilidade · v3 (navegável completo)
   Login → troca de empresa → início → guias (com Entenda seu
   Imposto embutido) → agenda → pedidos → empresa.
   Todos os valores são reais, extraídos dos PDFs enviados.
   ============================================================ */

function Marca({ tamanho = 64 }) {
  return <img src="logo-rn.png" alt="RN Contabilidade" style={{ height: tamanho, width: "auto", display: "block", borderRadius: tamanho * 0.09 }} />;
}

const HOJE = "2026-07-05";

/* ---------- empresas reais, todas com dados extraídos dos PDFs ---------- */
const EMPRESAS = {
  dff: {
    id: "dff", razao: "D F Fernandes Confecções Ltda", fantasia: "D F Fernandes",
    cnpj: "32.599.342/0001-66", ie: "80906544", regime: "Lucro Presumido", situacao: "Ativa", contato: "Daniel",
    guias: [
      { id: "a1", tipo: "DARJ", nome: "ICMS — Operações Próprias", orgao: "SEFAZ-RJ",
        comp: "05/2026", venc: "2026-06-10", valor: 6934.74, novo: false,
        linha: "85810000069 2 34740359120 7 26061001000 6 21336406539 1",
        composicao: [{ n: "ICMS", v: 2972.04 }, { n: "FECP", v: 3962.70 }] },
      { id: "a2", tipo: "DARF", nome: "COFINS", orgao: "Receita Federal",
        comp: "05/2026", venc: "2026-06-25", valor: 4686.30, novo: false,
        linha: "85800000046 1 86300385261 9 76070126169 0 40085398857 4" },
      { id: "a3", tipo: "DARF", nome: "PIS", orgao: "Receita Federal",
        comp: "05/2026", venc: "2026-06-25", valor: 1015.37, novo: false,
        linha: "85800000010 0 15370385261 0 76070126169 0 39999241201 1" },
    ],
    agenda: [
      { data: "2026-07-10", titulo: "Honorários contábeis", nota: "boleto enviado por e-mail", tipo: "guia" },
      { data: "2026-07-15", titulo: "eSocial e DCTFWeb", nota: "transmissão pelo escritório", tipo: "obrigacao" },
      { data: "2026-07-25", titulo: "PIS e COFINS", nota: "em apuração", tipo: "guia" },
    ],
    panorama: null,
  },
  nam: {
    id: "nam", razao: "Nova American Multimarcas Ltda", fantasia: "Nova American",
    cnpj: "28.885.515/0001-35", ie: "82692002", regime: "Lucro Presumido", situacao: "Ativa", contato: "Daniel",
    guias: [
      { id: "b1", tipo: "DARJ", nome: "ICMS — Diferencial de alíquota", orgao: "SEFAZ-RJ",
        comp: "05/2026", venc: "2026-06-10", valor: 81.95, novo: false,
        linha: "85800000000 3 81950359120 5 26061001000 6 21400058958 9",
        composicao: [{ n: "ICMS", v: 67.53 }, { n: "FECP", v: 14.42 }],
        obs: "DIFAL uso e consumo — frete 162980, NF-e 5900" },
    ],
    agenda: [
      { data: "2026-07-15", titulo: "eSocial e DCTFWeb", nota: "transmissão pelo escritório", tipo: "obrigacao" },
      { data: "2026-07-25", titulo: "PIS e COFINS", nota: "em apuração", tipo: "guia" },
    ],
    panorama: null,
  },
  cad: {
    id: "cad", razao: "Cervejaria Artesanal Angels and Devils Ltda", fantasia: "Angels and Devils",
    cnpj: "24.178.588/0001-36", regime: "Simples Nacional", situacao: "Ativa", contato: "Daniel",
    guias: [
      { id: "c1", tipo: "DAS", nome: "Simples Nacional", orgao: "Receita Federal",
        comp: "05/2026", venc: "2026-06-22", valor: 149.48, novo: false,
        linha: "85860000001 2 49480328261 7 73072026166 6 01275618475 8",
        composicao: [
          { n: "IRPJ", v: 9.84 }, { n: "CSLL", v: 6.26 }, { n: "COFINS", v: 20.59 },
          { n: "PIS", v: 4.45 }, { n: "INSS", v: 67.09 }, { n: "IPI", v: 13.42 }, { n: "ICMS", v: 27.83 },
        ] },
    ],
    agenda: [
      { data: "2026-07-19", titulo: "FGTS Digital", nota: "em apuração", tipo: "guia" },
      { data: "2026-07-22", titulo: "DAS — Simples Nacional", nota: "em apuração", tipo: "guia" },
    ],
    panorama: null,
  },
  lum: {
    id: "lum", razao: "Lumiarina Cervejaria Ltda", fantasia: "Lumiarina",
    cnpj: "27.774.562/0001-49", regime: "Simples Nacional", situacao: "Ativa", contato: "Daniel",
    guias: [],
    agenda: [{ data: "2026-07-22", titulo: "DAS — Simples Nacional", nota: "em apuração", tipo: "guia" }],
    panorama: {
      consultadoEm: "29/07/2026", total: 321.39, impeditivo: 0, pendencias: 2, podeCnd: true,
      itens: [
        { nome: "Contribuição previdenciária (1099-01)", comp: "07/2026", venc: "20/08/2026", valor: 178.31 },
        { nome: "Contribuição previdenciária (1082-01)", comp: "07/2026", venc: "20/08/2026", valor: 143.08 },
      ],
      texto: "Os dois valores estão registrados como exigibilidade suspensa: a Receita reconheceu o débito mas parou a cobrança enquanto faz a análise interna. Nada aqui impede, em princípio, a emissão de certidão. Na Procuradoria da Fazenda Nacional não há pendência alguma.",
      escopo: "Cobre apenas débitos federais na Receita Federal e na Procuradoria da Fazenda Nacional. Não inclui ICMS estadual, ISS municipal nem FGTS.",
      alerta: "Entre 10 e 15 de agosto a Receita processa as exclusões do Simples para 2027. Vamos conferir a situação da sua empresa e avisar.",
    },
  },
  gs: {
    id: "gs", razao: "Gata Serrana Lingerie Ltda", fantasia: "Gata Serrana",
    cnpj: "52.276.638/0001-53", regime: "Simples Nacional", situacao: "Ativa", contato: "Victor",
    guias: [
      {
        id: "g1", tipo: "DAS", nome: "Simples Nacional", orgao: "Receita Federal",
        comp: "06/2026", venc: "2026-07-20", valor: 17844.70, novo: true,
        linha: "85860000001 2 49480328261 7 73072026166 6 01275618475 8",
        entenda: {
          anexo: "Anexo I — Comércio", rpa: 177391.27, rbt12: 2113572.55,
          faixaDe: 1800000.01, faixaAte: 3600000.00,
          aliquotaNominal: 14.30, aliquotaEfetiva: 10.1695527153776,
          tributos: [
            { nome: "INSS/CPP", situacao: "Tributado", aliquota: 4.271212140, valor: 7576.76 },
            { nome: "COFINS",   situacao: "Tributado", aliquota: 1.295601016, valor: 2298.28 },
            { nome: "ICMS",     situacao: "Redução",   aliquota: 3.406800160, valor: 5848.17, reducao: 3.23 },
            { nome: "IRPJ",     situacao: "Tributado", aliquota: 0.559325399, valor: 992.19 },
            { nome: "CSLL",     situacao: "Tributado", aliquota: 0.355934345, valor: 631.40 },
            { nome: "PIS",      situacao: "Tributado", aliquota: 0.280679655, valor: 497.90 },
          ],
          historico: [
            { comp: "06/2025", receita: 25320.69 }, { comp: "07/2025", receita: 62246.98 },
            { comp: "08/2025", receita: 134346.45 }, { comp: "09/2025", receita: 206962.87 },
            { comp: "10/2025", receita: 160162.95 }, { comp: "11/2025", receita: 190049.67 },
            { comp: "12/2025", receita: 148236.18 }, { comp: "01/2026", receita: 186884.71 },
            { comp: "02/2026", receita: 230728.71 }, { comp: "03/2026", receita: 261458.94 },
            { comp: "04/2026", receita: 272062.59 }, { comp: "05/2026", receita: 235111.81 },
          ],
          proximo: { comp: "07/2026", aliquotaEfetiva: 10.4467895612492 },
        },
      },
      { id: "g2", tipo: "DARF", nome: "INSS — segurados descontados", orgao: "Receita Federal",
        comp: "06/2026", venc: "2026-07-20", valor: 707.51, novo: true,
        linha: "85820000007 4 07510385262 1 01071626182 8 79314290059 6",
        composicao: [{ n: "Empregados/avulso", v: 529.20 }, { n: "Contribuinte individual", v: 178.31 }],
        obs: "Contribuição descontada dos funcionários — separada do DAS, mesmo com INSS patronal incluso nele." },
      { id: "g3", tipo: "GFD", nome: "FGTS Digital", orgao: "FGTS Digital",
        comp: "06/2026", venc: "2026-07-20", valor: 542.37, novo: true,
        pix: true,
        obs: "4 trabalhadores · sem rescisório, indenização compensatória ou encargos neste mês." },
    ],
    agenda: [
      { data: "2026-07-08", titulo: "Enviar documentos de junho", nota: "notas e extratos", tipo: "voce" },
      { data: "2026-07-20", titulo: "DAS — Simples Nacional", nota: "R$ 17.844,70", tipo: "guia" },
      { data: "2026-07-20", titulo: "INSS descontado + FGTS", nota: "R$ 1.249,88", tipo: "guia" },
    ],
    panorama: null,
  },
};

const DOCUMENTOS = [
  { id: "d1", nome: "Folha de pagamento — 06/2026", cat: "Pessoal", data: "02/07/2026", novo: true },
  { id: "d2", nome: "Recibos de pagamento — 06/2026", cat: "Pessoal", data: "02/07/2026", novo: true },
  { id: "d3", nome: "Balancete — 05/2026", cat: "Contábil", data: "20/06/2026" },
];

const TIPOS_PEDIDO = [
  { id: "cert", label: "Certidão negativa", prazo: "até 2 dias úteis" },
  { id: "fat", label: "Declaração de faturamento", prazo: "até 2 dias úteis" },
  { id: "adm", label: "Admissão de funcionário", prazo: "até 3 dias úteis" },
  { id: "dem", label: "Demissão ou rescisão", prazo: "até 3 dias úteis" },
  { id: "alt", label: "Alteração contratual", prazo: "até 10 dias úteis" },
  { id: "doc", label: "Enviar documentos", prazo: "confirmação no mesmo dia" },
  { id: "out", label: "Outro assunto", prazo: "retorno em 1 dia útil" },
];

/* ---------- helpers ---------- */
const brl = (v) => v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v, casas = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) + "%";
const dataBR = (iso) => iso.split("-").reverse().join("/");
const dias = (iso) => Math.round((new Date(iso + "T00:00:00") - new Date(HOJE + "T00:00:00")) / 86400000);
const prazo = (iso) => {
  const n = dias(iso);
  if (n < 0) return `${Math.abs(n)} ${Math.abs(n) === 1 ? "dia" : "dias"} em atraso`;
  if (n === 0) return "Vence hoje";
  if (n === 1) return "Vence amanhã";
  return `Vence em ${n} dias`;
};
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function Barras({ seed }) {
  const bars = []; let h = 11;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 9973;
  for (let i = 0; i < 44; i++) { h = (h * 1103515245 + 12345) % 2147483648; bars.push(1 + h % 3); }
  return <div className="barcode" aria-hidden="true">
    {bars.map((w, i) => <span key={i} style={{ width: w + "px", opacity: i % 2 ? .13 : 1 }} />)}
  </div>;
}

/* ============================ APP ============================ */
export default function App() {
  const [logado, setLogado] = useState(false);
  const [empId, setEmpId] = useState("gs");
  const [trocando, setTrocando] = useState(false);
  const [aba, setAba] = useState("inicio");
  const [pedidos, setPedidos] = useState([]);
  const [toast, setToast] = useState(null);
  const emp = EMPRESAS[empId];
  const avisar = (m) => { setToast(m); setTimeout(() => setToast(null), 2200); };

  return (
    <>
      <style>{CSS}</style>
      <div className="moldura">
        <div className="tela">
          {!logado ? <Login onEntrar={() => setLogado(true)} /> : (
            <>
              <Topo aba={aba} emp={emp} onTrocar={() => setTrocando(true)} />
              <main className="conteudo">
                {aba === "inicio" && <Inicio emp={emp} ir={setAba} avisar={avisar} />}
                {aba === "guias" && <Guias emp={emp} avisar={avisar} />}
                {aba === "agenda" && <Agenda emp={emp} />}
                {aba === "pedidos" && <Pedidos emp={emp} pedidos={pedidos} setPedidos={setPedidos} avisar={avisar} />}
                {aba === "empresa" && <Empresa emp={emp} onSair={() => { setLogado(false); setAba("inicio"); }} />}
              </main>
              <Abas aba={aba} setAba={setAba} />
            </>
          )}
          {trocando && (
            <Seletor atual={empId} onEscolher={(id) => { setEmpId(id); setTrocando(false); setAba("inicio"); }}
              onFechar={() => setTrocando(false)} />
          )}
          {toast && <div className="toast">{toast}</div>}
        </div>
      </div>
    </>
  );
}

function Login({ onEntrar }) {
  const [manter, setManter] = useState(true);
  return (
    <div className="login">
      <div className="login-marca"><Marca tamanho={160} /><p>Sua empresa na palma da mão</p></div>
      <div className="login-form">
        <label className="campo"><span>CNPJ ou e-mail</span><input defaultValue="52.276.638/0001-53" /></label>
        <label className="campo"><span>Senha</span><input type="password" defaultValue="••••••••" /></label>
        <button className="switch" onClick={() => setManter(!manter)} aria-pressed={manter}>
          <span className={"trilho" + (manter ? " on" : "")}><i /></span>
          Continuar conectado neste aparelho
        </button>
        <button className="btn-primario" onClick={onEntrar}>Entrar</button>
        <button className="btn-texto">Esqueci minha senha</button>
      </div>
      <p className="rodape">Nova Friburgo · RJ</p>
    </div>
  );
}

function Topo({ aba, emp, onTrocar }) {
  const t = { guias: "Guias e documentos", agenda: "Agenda de julho", pedidos: "Pedidos", empresa: "Minha empresa" };
  return (
    <header className="topo">
      <div className="topo-marca"><Marca tamanho={26} /></div>
      {t[aba] ? <h2 className="topo-titulo">{t[aba]}</h2> : (
        <>
          <p className="topo-ola">Olá, {emp.contato}</p>
          <button className="troca" onClick={onTrocar}><h2>{emp.fantasia}</h2><span className="seta">▾</span></button>
          <p className="topo-cnpj">{emp.cnpj} · {emp.regime}</p>
        </>
      )}
    </header>
  );
}

function Seletor({ atual, onEscolher, onFechar }) {
  return (
    <div className="modal" onClick={onFechar}>
      <div className="folha" onClick={(e) => e.stopPropagation()}>
        <h3 className="folha-titulo">Suas empresas</h3>
        <div className="pilha-fina">
          {Object.values(EMPRESAS).map((e) => {
            const aberto = e.guias.reduce((s, g) => s + g.valor, 0);
            return (
              <button key={e.id} className={"emp" + (e.id === atual ? " on" : "")} onClick={() => onEscolher(e.id)}>
                <div><strong>{e.fantasia}</strong><span className="mono">{e.cnpj}</span><span>{e.regime}</span></div>
                <div className="emp-num"><b>{aberto > 0 ? brl(aberto) : "—"}</b>
                  <span>{e.guias.length} {e.guias.length === 1 ? "guia" : "guias"}</span></div>
              </button>
            );
          })}
        </div>
        <button className="btn-texto largo" onClick={onFechar}>Fechar</button>
      </div>
    </div>
  );
}

function Inicio({ emp, ir, avisar }) {
  const total = emp.guias.reduce((s, g) => s + g.valor, 0);
  const prox = [...emp.guias].sort((a, b) => a.venc.localeCompare(b.venc))[0];
  const novos = DOCUMENTOS.filter((d) => d.novo).length;
  return (
    <div className="pilha">
      <section className="destaque">
        <p className="rotulo">A pagar em julho</p>
        <p className="numero">{total > 0 ? brl(total) : "Nada em aberto"}</p>
        <p className="nota">
          {total > 0 ? `${emp.guias.length} ${emp.guias.length === 1 ? "guia" : "guias"} · a primeira vence em ${dataBR(prox.venc)}`
                     : "Nenhuma guia publicada para este mês ainda"}
        </p>
        {total > 0 && <button className="btn-claro" onClick={() => ir("guias")}>Ver guias</button>}
      </section>

      {emp.panorama && <Panorama p={emp.panorama} />}

      <section>
        <h3 className="secao">Próximos compromissos</h3>
        <div className="pilha-fina">
          {emp.agenda.filter((e) => dias(e.data) >= 0).slice(0, 4).map((e, i) => <Linha e={e} key={i} />)}
        </div>
        <button className="btn-texto largo" onClick={() => ir("agenda")}>Ver agenda completa</button>
      </section>

      <section className="atalhos">
        <button onClick={() => ir("guias")}><b>{novos}</b><span>Documentos novos</span></button>
        <button onClick={() => ir("pedidos")}><b>+</b><span>Fazer um pedido</span></button>
        <button onClick={() => avisar("Abrindo conversa com o escritório")}><b>✆</b><span>Falar com a RN</span></button>
        <button onClick={() => ir("empresa")}><b>◈</b><span>Dados da empresa</span></button>
      </section>
    </div>
  );
}

function Panorama({ p }) {
  const [aberto, setAberto] = useState(false);
  return (
    <section className="panorama">
      <div className="pan-topo">
        <div>
          <span className="etiqueta">Panorama fiscal federal</span>
          <h3>{p.podeCnd ? "Sem pendência impeditiva" : "Pendência impeditiva"}</h3>
          <p className="fino">Consulta feita em {p.consultadoEm}</p>
        </div>
        <span className={"farol " + (p.podeCnd ? "ok" : "risco")} />
      </div>
      <div className="pan-numeros">
        <div><b>{brl(p.total)}</b><span>em análise</span></div>
        <div><b>{brl(p.impeditivo)}</b><span>impeditivo</span></div>
      </div>
      <button className="btn-fantasma largo" onClick={() => setAberto(!aberto)}>
        {aberto ? "Ocultar detalhes" : "Entender o que é isso"}
      </button>
      {aberto && (
        <div className="pan-detalhe">
          <p>{p.texto}</p>
          <div className="pan-itens">
            {p.itens.map((it, i) => (
              <div key={i}><div><strong>{it.nome}</strong><span>competência {it.comp} · vence {it.venc}</span></div>
                <b>{brl(it.valor)}</b></div>
            ))}
          </div>
          <p className="pan-alerta">{p.alerta}</p>
          <p className="pan-escopo">{p.escopo}</p>
        </div>
      )}
    </section>
  );
}

function Linha({ e }) {
  return (
    <div className="linha">
      <div className="bloco-data"><span className="dia">{e.data.slice(8)}</span><span className="mes">{MESES[+e.data.slice(5, 7) - 1]}</span></div>
      <div className="linha-corpo"><strong>{e.titulo}</strong><span>{e.nota}</span></div>
      <span className={"pino " + e.tipo} />
    </div>
  );
}

function Guias({ emp, avisar }) {
  const [vista, setVista] = useState("guias");
  return (
    <div className="pilha">
      <div className="segmentado">
        <button className={vista === "guias" ? "on" : ""} onClick={() => setVista("guias")}>Guias</button>
        <button className={vista === "docs" ? "on" : ""} onClick={() => setVista("docs")}>Documentos</button>
      </div>
      {vista === "guias" ? (
        emp.guias.length
          ? emp.guias.map((g) => <CardGuia key={g.id} g={g} avisar={avisar} />)
          : <p className="vazio">Nenhuma guia publicada para este mês. Avisamos assim que houver.</p>
      ) : (
        <div className="pilha-fina">
          {DOCUMENTOS.map((d) => (
            <button className="doc" key={d.id} onClick={() => avisar("Baixando " + d.nome)}>
              <div><strong>{d.nome} {d.novo && <em className="tag-novo">novo</em>}</strong><span>{d.cat} · {d.data}</span></div>
              <span className="baixar">↓</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CardGuia({ g, avisar }) {
  const [aberto, setAberto] = useState(false);
  const [entenda, setEntenda] = useState(false);
  const [tribAberto, setTribAberto] = useState(null);
  const [histAberto, setHistAberto] = useState(false);
  const [recalculo, setRecalculo] = useState(false);
  const n = dias(g.venc);
  const cor = n < 0 ? "atraso" : n <= 5 ? "atencao" : "normal";
  const e = g.entenda;
  const maxHist = e ? Math.max(...e.historico.map((h) => h.receita)) : 0;

  return (
    <article className={"guia " + cor}>
      <div className="guia-topo">
        <div>
          <span className="selo">{g.tipo}</span>
          {g.novo && <span className="tag-novo solto">novo</span>}
          <h4>{g.nome}</h4>
          <p className="fino">{g.orgao} · competência {g.comp}</p>
        </div>
        <div className="guia-valor"><strong>{brl(g.valor)}</strong><span>{dataBR(g.venc)}</span></div>
      </div>
      <span className={"estado " + cor}>{prazo(g.venc)}</span>
      {g.obs && <p className="obs">{g.obs}</p>}
      {g.composicao && (
        <div className="composicao">
          {g.composicao.map((c, i) => <div key={i}><span>{c.n}</span><b>{brl(c.v)}</b></div>)}
        </div>
      )}

      {g.pix ? (
        <button className="guia-acao" onClick={() => avisar("Chave Pix copiada")}>Copiar Pix copia e cola</button>
      ) : (
        <>
          <button className="guia-acao" onClick={() => setAberto(!aberto)}>
            {aberto ? "Ocultar código de barras" : "Mostrar código de barras"}
          </button>
          {aberto && (
            <div className="digitavel">
              <Barras seed={g.linha} />
              <code>{g.linha}</code>
              <div className="dupla">
                <button className="btn-primario pequeno" onClick={() => avisar("Código copiado")}>Copiar código</button>
                <button className="btn-secundario pequeno" onClick={() => avisar("Baixando guia em PDF")}>PDF</button>
              </div>
            </div>
          )}
        </>
      )}

      {recalculo ? (
        <p className="obs recalculo-ok">✓ Recálculo pedido — a RN vai revisar e te avisar quando a guia for atualizada.</p>
      ) : (
        <button className="guia-acao" onClick={() => {
          setRecalculo(true);
          avisar("Pedido enviado — a RN Contabilidade foi avisada por e-mail");
        }}>Algo errado nesta guia? Pedir recálculo</button>
      )}

      {e && (
        <>
          <button className="guia-acao destaque-acao" onClick={() => setEntenda(!entenda)}>
            {entenda ? "Ocultar Entenda seu imposto" : "◈ Entenda seu imposto"}
          </button>

          {entenda && (
            <div className="entenda">
              <p className="explicacao">
                Sua empresa está no <strong>{e.anexo}</strong>. Sobre o que você faturou nesta
                competência ({brl(e.rpa)}), o Simples aplicou uma alíquota efetiva de{" "}
                <strong>{pct(e.aliquotaEfetiva)}</strong> — não os {pct(e.aliquotaNominal, 2)} nominais
                da sua faixa. A efetiva é sempre menor, porque a tabela tem uma parcela a deduzir
                embutida no cálculo.
              </p>

              <div className="medidor">
                <div className="medidor-linha"><span>Alíquota nominal da faixa</span><b className="apagado">{pct(e.aliquotaNominal, 2)}</b></div>
                <div className="medidor-barra">
                  <div className="medidor-preenchido" style={{ width: `${(e.aliquotaEfetiva / e.aliquotaNominal) * 100}%` }} />
                </div>
                <div className="medidor-linha"><span>O que você paga de fato (efetiva)</span><b>{pct(e.aliquotaEfetiva)}</b></div>
              </div>

              <h5 className="sub">Para onde vai cada real</h5>
              <div className="tributos">
                {e.tributos.map((t, i) => {
                  const abertoTrib = tribAberto === i;
                  const largura = (t.valor / g.valor) * 100;
                  return (
                    <button key={i} className={"trib" + (abertoTrib ? " aberto" : "")}
                            onClick={() => setTribAberto(abertoTrib ? null : i)}>
                      <div className="trib-linha1">
                        <span className="trib-nome">{t.nome}</span>
                        {t.situacao === "Redução" && <span className="chip-reducao">redução</span>}
                        <span className="trib-valor">{brl(t.valor)}</span>
                      </div>
                      <div className="trib-barra-fundo"><div className="trib-barra" style={{ width: `${largura}%` }} /></div>
                      {abertoTrib && (
                        <div className="trib-detalhe">
                          <div><span>Base de cálculo</span><b>{brl(e.rpa)}</b></div>
                          <div><span>Alíquota efetiva deste tributo</span><b>{pct(t.aliquota, 3)}</b></div>
                          {t.reducao && <div><span>Redução aplicada na base do ICMS</span><b>{pct(t.reducao)}</b></div>}
                          <p className="trib-nota">
                            {t.nome === "INSS/CPP" && "A parte da Previdência — a maior fatia do Simples para quem tem funcionários."}
                            {t.nome === "COFINS" && "Contribuição federal sobre o faturamento, embutida na guia única."}
                            {t.nome === "ICMS" && "Imposto estadual sobre a venda de mercadorias, com redução de 3,23% aplicada pelo estado do RJ."}
                            {t.nome === "IRPJ" && "Imposto de Renda da empresa, já recolhido dentro do DAS."}
                            {t.nome === "CSLL" && "Contribuição sobre o lucro, recolhida junto com os demais tributos federais."}
                            {t.nome === "PIS" && "Contribuição federal sobre o faturamento, menor fatia da partilha."}
                          </p>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {e.proximo && (
                <div className="alerta-tendencia">
                  <span className="seta-tendencia">↗</span>
                  <div>
                    <strong>Sua alíquota deve subir no próximo mês</strong>
                    <p>
                      A receita dos últimos 12 meses está subindo — a alíquota efetiva projetada
                      para {e.proximo.comp} é de {pct(e.proximo.aliquotaEfetiva)}, um aumento de{" "}
                      {pct(e.proximo.aliquotaEfetiva - e.aliquotaEfetiva, 2)}. Isso acontece mesmo
                      com faturamento parecido, porque o que entra na conta é o acumulado de 12 meses.
                    </p>
                  </div>
                </div>
              )}

              <button className="btn-fantasma largo" onClick={() => setHistAberto(!histAberto)}>
                {histAberto ? "Ocultar histórico de receita" : "Ver histórico de receita (12 meses)"}
              </button>
              {histAberto && (
                <div className="historico">
                  <div className="historico-grafico">
                    {e.historico.map((h, i) => (
                      <div key={i} className="historico-coluna">
                        <div className="historico-barra" style={{ height: `${(h.receita / maxHist) * 100}%` }} title={brl(h.receita)} />
                        <span>{h.comp.slice(0, 2)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="historico-legenda">Acumulado de 12 meses: {brl(e.rbt12)}</p>
                  <p className="historico-faixa">Faixa de enquadramento: de {brl(e.faixaDe)} a {brl(e.faixaAte)}</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </article>
  );
}

function Agenda({ emp }) {
  const ano = 2026, mes = 6; // julho
  const inicio = new Date(ano, mes, 1).getDay();
  const qtd = new Date(ano, mes + 1, 0).getDate();
  const chave = (d) => `${ano}-07-${String(d).padStart(2, "0")}`;
  return (
    <div className="pilha">
      <div className="navmes"><strong>julho de 2026</strong></div>
      <div className="calendario">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <span className="cab" key={i}>{d}</span>)}
        {Array.from({ length: inicio }).map((_, i) => <span key={"v" + i} />)}
        {Array.from({ length: qtd }).map((_, i) => {
          const d = i + 1;
          const evs = emp.agenda.filter((e) => e.data === chave(d));
          return (
            <span key={d} className={"cel" + (evs.length ? " tem" : "") + (d === 5 ? " hoje" : "")}>
              {d}
              {evs.length > 0 && <i className="pontos">{evs.slice(0, 3).map((e, j) => <b key={j} className={e.tipo} />)}</i>}
            </span>
          );
        })}
      </div>
      <div className="legenda">
        <span><b className="guia" /> Guia a pagar</span>
        <span><b className="dp" /> Pessoal</span>
        <span><b className="obrigacao" /> Escritório</span>
        <span><b className="voce" /> Ação sua</span>
      </div>
      <div className="pilha-fina">{emp.agenda.map((e, i) => <Linha e={e} key={i} />)}</div>
    </div>
  );
}

function Pedidos({ emp, pedidos, setPedidos, avisar }) {
  const [novo, setNovo] = useState(false);
  const [tipo, setTipo] = useState(null);
  const [texto, setTexto] = useState("");
  const meus = pedidos.filter((p) => p.emp === emp.id);

  if (novo) return (
    <div className="pilha">
      <button className="btn-texto" onClick={() => setNovo(false)}>‹ Voltar</button>
      <p className="fino">Pedido para <strong>{emp.fantasia}</strong></p>
      <h3 className="secao">Do que você precisa?</h3>
      <div className="pilha-fina">
        {TIPOS_PEDIDO.map((t) => (
          <button key={t.id} className={"opcao" + (tipo === t.id ? " on" : "")} onClick={() => setTipo(t.id)}>
            <strong>{t.label}</strong><span>{t.prazo}</span>
          </button>
        ))}
      </div>
      <label className="campo"><span>Detalhes (opcional)</span>
        <textarea rows={4} value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder="Conte o que precisa, prazos, nomes envolvidos…" /></label>
      <button className="btn-secundario largo" onClick={() => avisar("Seletor de arquivos")}>Anexar arquivo ou foto</button>
      <button className="btn-primario largo" disabled={!tipo} onClick={() => {
        setPedidos([{ id: "p" + Date.now(), emp: emp.id, tipo: TIPOS_PEDIDO.find((t) => t.id === tipo).label,
          texto: texto || "—", etapas: [["Recebido", "05/07"], ["Em andamento", null], ["Concluído", null]] }, ...pedidos]);
        setNovo(false); setTipo(null); setTexto(""); avisar("Pedido enviado à RN Contabilidade");
      }}>Enviar pedido</button>
    </div>
  );

  return (
    <div className="pilha">
      <button className="btn-primario largo" onClick={() => setNovo(true)}>Fazer um pedido</button>
      {meus.length === 0 && <p className="vazio">Nenhum pedido aberto para {emp.fantasia}.</p>}
      {meus.map((p) => (
        <article className="pedido" key={p.id}>
          <div className="pedido-topo"><strong>{p.tipo}</strong><span className="estado espera">Em andamento</span></div>
          <p className="fino">{p.texto}</p>
          <div className="trilha">
            {p.etapas.map(([n, d], i) => (
              <div key={i} className={"etapa" + (d ? " feita" : "")}><i /><span>{n}</span><em>{d || "—"}</em></div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function Empresa({ emp, onSair }) {
  return (
    <div className="pilha">
      <section className="ficha">
        <h3>{emp.razao}</h3>
        <dl>
          <div><dt>CNPJ</dt><dd className="mono">{emp.cnpj}</dd></div>
          {emp.ie && <div><dt>Inscrição estadual</dt><dd className="mono">{emp.ie}</dd></div>}
          <div><dt>Regime</dt><dd>{emp.regime}</dd></div>
          <div><dt>Situação</dt><dd><span className="estado ok">{emp.situacao}</span></dd></div>
        </dl>
      </section>
      <section className="ficha">
        <h3>Seu contato na RN</h3>
        <div className="socio"><strong>Felipe — Fiscal</strong><span>Guias, apurações e obrigações</span></div>
        <div className="socio"><strong>Ana Clara — Pessoal</strong><span>Folha, admissões e rescisões</span></div>
        <div className="socio"><strong>Danielle — Contábil</strong><span>Balancetes e demonstrações</span></div>
        <div className="socio"><strong>Maroilsson — Legalização</strong><span>Alterações e abertura de empresa</span></div>
        <div className="socio"><strong>Victor — Financeiro</strong><span>Honorários e cobranças</span></div>
      </section>
      <button className="btn-secundario largo" onClick={onSair}>Sair da conta</button>
      <div className="assina"><Marca tamanho={34} /><p>Portal do Cliente · versão 1.0</p></div>
    </div>
  );
}

function Abas({ aba, setAba }) {
  const itens = [["inicio", "Início", "⌂"], ["guias", "Guias", "▤"], ["agenda", "Agenda", "▦"],
    ["pedidos", "Pedidos", "✎"], ["empresa", "Empresa", "◈"]];
  return (
    <nav className="tabbar">
      {itens.map(([k, l, ic]) => (
        <button key={k} className={aba === k ? "on" : ""} onClick={() => setAba(k)}>
          <span className="ic">{ic}</span>{l}
        </button>
      ))}
    </nav>
  );
}

/* ============================ CSS ============================ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400;600;700&family=Jost:wght@300;400;500&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap');

*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
:root{--papel:#F4F3F1;--branco:#fff;--tinta:#0A0A0A;--suave:#6B6B68;--linha:#E2E1DE;
  --ambar:#B8791A;--rubro:#B02A1E;--verde:#1F6B4A}
.moldura{background:#141412;min-height:100vh;display:flex;align-items:center;justify-content:center;
  font-family:'Instrument Sans',system-ui,sans-serif;color:var(--tinta)}
.tela{width:100%;max-width:430px;min-height:100vh;max-height:100vh;background:var(--papel);
  display:flex;flex-direction:column;position:relative;overflow:hidden}
@media(min-width:520px){.tela{min-height:880px;max-height:880px;border-radius:26px;box-shadow:0 30px 80px rgba(0,0,0,.55)}}
.conteudo{flex:1;overflow-y:auto;padding:16px 16px 92px}
.pilha{display:flex;flex-direction:column;gap:16px}
.pilha-fina{display:flex;flex-direction:column;gap:8px}
.mono,code{font-family:'JetBrains Mono',monospace}
.fino{font-size:12.5px;color:var(--suave);line-height:1.5}
.vazio{font-size:13.5px;color:var(--suave);text-align:center;padding:34px 18px;line-height:1.6}

h2,h3,h4,h5{font-family:'Instrument Sans',sans-serif;letter-spacing:-.01em}
.numero,.guia-valor strong,.emp-num b,.pan-numeros b{font-family:'Bodoni Moda',Georgia,serif;font-variant-numeric:tabular-nums;letter-spacing:0}
.etiqueta,.rotulo,.secao,.sub{font-family:'Jost',sans-serif;font-weight:400;letter-spacing:.2em;text-transform:lowercase;font-size:10.5px}

.login{flex:1;display:flex;flex-direction:column;justify-content:center;gap:34px;padding:32px 26px;
  background:#000;color:#F2F2F0;min-height:100vh}
.login-marca{text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px}
.login-marca p{color:#9A9A96;font-size:13.5px;font-family:'Jost',sans-serif;letter-spacing:.05em}
.login-form{display:flex;flex-direction:column;gap:14px}
.campo{display:flex;flex-direction:column;gap:6px}
.campo span{font-family:'Jost',sans-serif;font-size:11px;letter-spacing:.14em;text-transform:lowercase;opacity:.7}
.campo input,.campo textarea{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.16);
  border-radius:12px;padding:14px;color:inherit;font:inherit;font-size:16px}
.conteudo .campo input,.conteudo .campo textarea{background:#fff;border-color:var(--linha);color:var(--tinta)}
.conteudo .campo span{color:var(--suave);opacity:1}
.switch{display:flex;align-items:center;gap:10px;background:none;border:0;color:#B5B5B0;font:inherit;font-size:13px;cursor:pointer}
.trilho{width:38px;height:22px;border-radius:11px;background:rgba(255,255,255,.2);position:relative;flex:none;transition:.2s}
.trilho i{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.2s}
.trilho.on{background:#fff}.trilho.on i{left:19px;background:#000}
.rodape{text-align:center;font-family:'Jost',sans-serif;font-size:11px;color:#7A7A76;letter-spacing:.2em}

.btn-primario{background:var(--tinta);color:#fff;border:0;border-radius:13px;padding:15px;font:inherit;
  font-weight:600;font-size:15px;cursor:pointer}
.btn-primario:disabled{opacity:.32}
.login .btn-primario{background:#fff;color:#000}
.btn-secundario{background:#fff;color:var(--tinta);border:1px solid var(--linha);border-radius:13px;
  padding:14px;font:inherit;font-weight:600;font-size:14px;cursor:pointer}
.btn-claro{background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:11px;
  padding:11px 18px;font:inherit;font-weight:600;font-size:14px;cursor:pointer;align-self:flex-start}
.btn-texto{background:none;border:0;color:var(--tinta);font:inherit;font-weight:600;font-size:14px;cursor:pointer;padding:6px}
.login .btn-texto{color:#B5B5B0}
.btn-fantasma{background:none;border:0;border-top:1px solid var(--linha);color:var(--suave);font:inherit;
  font-weight:600;font-size:13px;cursor:pointer;padding:11px 0 0;text-align:left}
.largo{width:100%}.pequeno{padding:10px 14px;font-size:13px;flex:1}
.dupla{display:flex;gap:8px}

.topo{background:#000;color:#F2F2F0;padding:18px 18px 22px}
.topo-marca{margin-bottom:16px;opacity:.85}
.topo-ola{font-size:13px;color:#9A9A96}
.troca{background:none;border:0;color:inherit;font:inherit;display:flex;align-items:center;gap:8px;padding:2px 0;cursor:pointer}
.troca h2{font-size:23px;font-weight:700}
.seta{font-size:12px;color:#8A8A86}
.topo-cnpj{font-family:'JetBrains Mono';font-size:11px;color:#8A8A86;margin-top:4px}
.topo-titulo{font-size:22px;font-weight:700}

.destaque{background:var(--tinta);color:#fff;border-radius:18px;padding:20px;display:flex;flex-direction:column;gap:6px}
.rotulo{color:#B5B5B0}
.numero{font-size:38px;font-weight:600;line-height:1.05}
.nota{font-size:13px;color:#C6C6C1;margin-bottom:10px}
.secao{color:var(--suave);margin-bottom:10px;display:block}

.panorama{background:#fff;border:1px solid var(--linha);border-radius:16px;padding:17px;display:flex;flex-direction:column;gap:13px}
.pan-topo{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.pan-topo h3{font-size:17px;font-weight:600;margin-top:6px}
.farol{width:11px;height:11px;border-radius:50%;flex:none;margin-top:5px}
.farol.ok{background:var(--verde);box-shadow:0 0 0 4px rgba(31,107,74,.13)}
.farol.risco{background:var(--rubro)}
.pan-numeros{display:flex;gap:10px}
.pan-numeros div{flex:1;background:#F7F6F4;border-radius:11px;padding:11px 13px}
.pan-numeros b{font-size:19px;display:block}
.pan-numeros span{font-size:11px;color:var(--suave)}
.pan-detalhe{display:flex;flex-direction:column;gap:12px}
.pan-detalhe>p{font-size:13.5px;line-height:1.62}
.pan-itens{display:flex;flex-direction:column;gap:7px}
.pan-itens>div{display:flex;justify-content:space-between;gap:12px;align-items:center;background:#F7F6F4;border-radius:10px;padding:11px 13px}
.pan-itens strong{font-size:13px;font-weight:600;display:block}
.pan-itens span{font-size:11.5px;color:var(--suave)}
.pan-itens b{font-variant-numeric:tabular-nums;font-size:14px;flex:none}
.pan-alerta{font-size:12.5px;color:#8A6516;background:#FBF4E6;border-radius:10px;padding:11px 13px;line-height:1.55}
.pan-escopo{font-size:11.5px;color:var(--suave);line-height:1.5}

.linha{background:#fff;border:1px solid var(--linha);border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:13px}
.bloco-data{display:flex;flex-direction:column;align-items:center;min-width:32px}
.bloco-data .dia{font-family:'Bodoni Moda',serif;font-size:20px;font-weight:600;line-height:1}
.bloco-data .mes{font-family:'Jost',sans-serif;font-size:9.5px;letter-spacing:.14em;color:var(--suave)}
.linha-corpo{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}
.linha-corpo strong{font-size:14px;font-weight:600}
.linha-corpo span{font-size:12px;color:var(--suave)}
.pino{width:7px;height:7px;border-radius:50%;flex:none}
.pino.guia,b.guia{background:var(--tinta)}
.pino.dp,b.dp{background:var(--ambar)}
.pino.obrigacao,b.obrigacao{background:#9A9A96}
.pino.voce,b.voce{background:var(--rubro)}

.atalhos{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.atalhos button{background:#fff;border:1px solid var(--linha);border-radius:14px;padding:16px 12px;
  display:flex;flex-direction:column;gap:5px;align-items:flex-start;font:inherit;cursor:pointer;text-align:left}
.atalhos b{font-family:'Bodoni Moda',serif;font-size:22px;font-weight:600}
.atalhos span{font-size:12.5px;color:var(--suave)}

.segmentado{display:flex;background:#E6E5E2;border-radius:11px;padding:3px;gap:3px}
.segmentado button{flex:1;border:0;background:none;padding:9px;border-radius:9px;font:inherit;font-size:14px;
  font-weight:600;color:var(--suave);cursor:pointer}
.segmentado button.on{background:#fff;color:var(--tinta);box-shadow:0 1px 3px rgba(0,0,0,.09)}

.guia{background:#fff;border:1px solid var(--linha);border-radius:14px;padding:15px;display:flex;flex-direction:column;
  gap:11px;border-left:4px solid var(--linha)}
.guia.normal{border-left-color:var(--tinta)}
.guia.atencao{border-left-color:var(--ambar)}
.guia.atraso{border-left-color:var(--rubro)}
.guia-topo{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.selo{display:inline-block;font-family:'JetBrains Mono';font-size:10px;font-weight:600;letter-spacing:.07em;
  background:#EAE9E5;color:var(--suave);padding:3px 7px;border-radius:5px;margin-bottom:7px}
.tag-novo{font-style:normal;font-size:9.5px;background:var(--tinta);color:#fff;padding:2px 6px;border-radius:4px;
  text-transform:uppercase;letter-spacing:.06em;vertical-align:middle}
.tag-novo.solto{margin-left:5px}
.guia h4{font-size:16px;font-weight:600}
.guia-valor{text-align:right;flex:none}
.guia-valor strong{font-size:19px;font-weight:600;display:block}
.guia-valor span{font-family:'JetBrains Mono';font-size:11px;color:var(--suave)}
.estado{font-size:12px;font-weight:600;padding:4px 9px;border-radius:6px;display:inline-block;align-self:flex-start}
.estado.normal{background:#ECEBE7;color:var(--tinta)}
.estado.atencao{background:#FBF4E6;color:#8A6516}
.estado.atraso{background:#FBE9E7;color:var(--rubro)}
.estado.ok{background:#E3EDE7;color:var(--verde)}
.estado.espera{background:#F2EFE6;color:#8A7440}
.obs{font-size:12px;color:var(--suave);background:#F7F6F4;border-radius:9px;padding:10px 12px;line-height:1.5}
.recalculo-ok{color:var(--verde);background:#E3EDE7;font-weight:600}
.composicao{background:#F7F6F4;border-radius:10px;padding:4px 12px}
.composicao div{display:flex;justify-content:space-between;padding:7px 0;font-size:12.5px;border-bottom:1px solid #EBEAE6}
.composicao div:last-child{border:0}
.composicao b{font-variant-numeric:tabular-nums}
.guia-acao{background:none;border:0;border-top:1px dashed var(--linha);padding-top:11px;font:inherit;font-size:13px;
  font-weight:600;color:var(--tinta);cursor:pointer;text-align:left}
.destaque-acao{color:var(--verde);border-top-style:solid}
.digitavel{display:flex;flex-direction:column;gap:9px}
.barcode{display:flex;align-items:flex-end;gap:2px;height:36px;overflow:hidden}
.barcode span{display:block;height:100%;background:var(--tinta)}
.digitavel code{font-size:11px;color:var(--suave);word-break:break-all}

.doc{background:#fff;border:1px solid var(--linha);border-radius:12px;padding:13px 14px;display:flex;
  align-items:center;justify-content:space-between;gap:12px;font:inherit;text-align:left;cursor:pointer;width:100%}
.doc strong{font-size:14px;font-weight:600;display:block;margin-bottom:3px}
.doc span{font-size:12px;color:var(--suave)}
.baixar{font-size:17px;flex:none}

.navmes{background:#fff;border:1px solid var(--linha);border-radius:12px;padding:11px 14px;text-align:center}
.navmes strong{font-family:'Bodoni Moda',serif;font-size:17px;font-weight:600;text-transform:capitalize}
.calendario{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;background:#fff;border:1px solid var(--linha);
  border-radius:14px;padding:12px 10px}
.calendario .cab{text-align:center;font-family:'Jost',sans-serif;font-size:10.5px;letter-spacing:.1em;color:var(--suave);padding-bottom:5px}
.cel{aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:13px;
  border-radius:9px;font-variant-numeric:tabular-nums}
.cel.tem{font-weight:600}
.cel.hoje{background:var(--tinta);color:#fff}
.pontos{display:flex;gap:2px;height:5px}
.pontos b{width:4px;height:4px;border-radius:50%}
.cel.hoje .pontos b{background:#fff}
.legenda{display:flex;gap:13px;flex-wrap:wrap;font-size:11.5px;color:var(--suave);padding:0 3px}
.legenda span{display:flex;align-items:center;gap:5px}
.legenda b{width:7px;height:7px;border-radius:50%}

.opcao{background:#fff;border:1px solid var(--linha);border-radius:12px;padding:13px 14px;display:flex;
  justify-content:space-between;align-items:center;gap:10px;font:inherit;cursor:pointer;text-align:left;width:100%}
.opcao.on{border-color:var(--tinta);background:#EFEEEB;box-shadow:inset 0 0 0 1px var(--tinta)}
.opcao strong{font-size:14px;font-weight:600}
.opcao span{font-size:11.5px;color:var(--suave);flex:none}
.pedido{background:#fff;border:1px solid var(--linha);border-radius:14px;padding:15px;display:flex;flex-direction:column;gap:11px}
.pedido-topo{display:flex;justify-content:space-between;align-items:center;gap:10px}
.pedido-topo strong{font-size:15.5px;font-weight:600}
.trilha{display:flex;gap:6px;border-top:1px dashed var(--linha);padding-top:11px}
.etapa{flex:1;display:flex;flex-direction:column;gap:4px}
.etapa i{height:3px;border-radius:2px;background:var(--linha);display:block}
.etapa.feita i{background:var(--tinta)}
.etapa span{font-size:11px;font-weight:600;color:var(--suave)}
.etapa.feita span{color:var(--tinta)}
.etapa em{font-family:'JetBrains Mono';font-size:10px;font-style:normal;color:var(--suave)}

.ficha{background:#fff;border:1px solid var(--linha);border-radius:14px;padding:16px}
.ficha h3{font-size:15.5px;font-weight:600;margin-bottom:12px}
.ficha dl div{display:flex;justify-content:space-between;gap:14px;padding:8px 0;border-bottom:1px solid #F1F0ED}
.ficha dl div:last-child{border:0}
.ficha dt{font-size:12.5px;color:var(--suave);flex:none}
.ficha dd{font-size:13px;text-align:right;font-weight:500}
.socio{padding:9px 0;border-bottom:1px solid #F1F0ED;display:flex;flex-direction:column;gap:2px}
.socio:last-child{border:0}
.socio strong{font-size:14px;font-weight:600}
.socio span{font-size:12px;color:var(--suave)}
.assina{display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px 0 14px;opacity:.7}
.assina p{font-family:'Jost',sans-serif;font-size:10.5px;letter-spacing:.16em;color:var(--suave)}

.modal{position:absolute;inset:0;background:rgba(10,10,10,.55);z-index:40;display:flex;align-items:flex-end;
  justify-content:center;backdrop-filter:blur(3px)}
.folha{background:var(--papel);width:100%;max-height:88%;overflow-y:auto;border-radius:20px 20px 0 0;padding:20px}
.folha-titulo{font-size:18px;font-weight:600;margin-bottom:14px}
.emp{background:#fff;border:1px solid var(--linha);border-radius:13px;padding:14px;display:flex;justify-content:space-between;
  gap:12px;align-items:center;font:inherit;text-align:left;cursor:pointer;width:100%}
.emp.on{border-color:var(--tinta);box-shadow:inset 0 0 0 1px var(--tinta)}
.emp strong{font-size:14.5px;font-weight:600;display:block}
.emp span{font-size:11.5px;color:var(--suave);display:block;margin-top:2px}
.emp-num{text-align:right;flex:none}
.emp-num b{font-size:16px;font-weight:600;display:block}
.emp-num span{font-size:11px;color:var(--suave)}

.tabbar{position:absolute;bottom:0;left:0;right:0;background:rgba(255,255,255,.97);border-top:1px solid var(--linha);
  display:flex;padding:7px 4px 10px;backdrop-filter:blur(8px)}
.tabbar button{flex:1;background:none;border:0;display:flex;flex-direction:column;align-items:center;gap:3px;font:inherit;
  font-size:10px;font-weight:600;color:var(--suave);cursor:pointer;padding:4px 0}
.tabbar .ic{font-size:17px;line-height:1}
.tabbar button.on{color:var(--tinta)}

.toast{position:absolute;bottom:84px;left:16px;right:16px;background:var(--tinta);color:#fff;padding:13px 16px;
  border-radius:12px;font-size:13.5px;text-align:center;z-index:50;box-shadow:0 8px 24px rgba(0,0,0,.25);animation:sobe .24s ease}
@keyframes sobe{from{opacity:0;transform:translateY(10px)}}

/* entenda seu imposto — dentro do card da guia */
.entenda{display:flex;flex-direction:column;gap:14px;background:#FAFAF8;border:1px solid var(--linha);
  border-radius:12px;padding:15px;margin-top:-3px}
.explicacao{font-size:13px;line-height:1.62;color:#2A2A28}
.explicacao strong{color:var(--tinta)}
.medidor{display:flex;flex-direction:column;gap:6px;background:#fff;border-radius:11px;padding:13px}
.medidor-linha{display:flex;justify-content:space-between;font-size:11.5px;color:var(--suave)}
.medidor-linha b{font-size:13px;color:var(--tinta);font-weight:600}
.medidor-linha b.apagado{color:var(--suave);text-decoration:line-through;font-weight:500}
.medidor-barra{height:7px;background:#E4E3DF;border-radius:5px;overflow:hidden;margin:2px 0}
.medidor-preenchido{height:100%;background:var(--tinta);border-radius:5px}
.tributos{display:flex;flex-direction:column;gap:6px}
.trib{background:#fff;border:1px solid transparent;border-radius:10px;padding:10px 12px;font:inherit;text-align:left;
  cursor:pointer;width:100%;display:flex;flex-direction:column;gap:6px}
.trib.aberto{border-color:var(--linha)}
.trib-linha1{display:flex;align-items:center;gap:8px}
.trib-nome{font-size:13px;font-weight:600;flex:1}
.chip-reducao{font-size:9px;background:#EAF3ED;color:var(--verde);padding:2px 7px;border-radius:20px;font-weight:600;text-transform:lowercase}
.trib-valor{font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}
.trib-barra-fundo{height:4px;background:#E9E8E4;border-radius:3px;overflow:hidden}
.trib-barra{height:100%;background:var(--tinta);border-radius:3px}
.trib-detalhe{display:flex;flex-direction:column;gap:5px;padding-top:5px;border-top:1px dashed var(--linha)}
.trib-detalhe div{display:flex;justify-content:space-between;font-size:11.5px}
.trib-detalhe span{color:var(--suave)}
.trib-detalhe b{font-weight:600}
.trib-nota{font-size:11.5px;color:var(--suave);line-height:1.55;margin-top:2px}
.alerta-tendencia{display:flex;gap:10px;background:#FBF4E6;border-radius:11px;padding:12px 13px}
.seta-tendencia{font-size:17px;color:var(--ambar);flex:none;font-weight:700}
.alerta-tendencia strong{font-size:13px;font-weight:700;display:block;color:#7A5510;margin-bottom:3px}
.alerta-tendencia p{font-size:12px;color:#8A6516;line-height:1.55}
.historico{display:flex;flex-direction:column;gap:8px}
.historico-grafico{display:flex;align-items:flex-end;gap:3px;height:70px;padding:0 2px}
.historico-coluna{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;height:100%}
.historico-barra{width:100%;background:var(--tinta);border-radius:3px 3px 0 0;min-height:3px}
.historico-coluna span{font-family:'Jost',sans-serif;font-size:8.5px;letter-spacing:.05em;color:var(--suave)}
.historico-legenda{font-size:11.5px;color:var(--suave)}
.historico-faixa{font-size:11.5px;color:var(--suave);padding-top:7px;border-top:1px dashed var(--linha)}
button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--tinta);outline-offset:2px}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
