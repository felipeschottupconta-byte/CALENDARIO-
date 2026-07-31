// api/notificar-pedido.js
// ============================================================
// Envia os avisos de pedido/recálculo por e-mail via Resend.
// Troquei de Gmail SMTP pra cá porque login SMTP com senha de app
// é frágil de configurar via variável de ambiente (espaço/quebra de
// linha invisível já causou "BadCredentials" mais de uma vez aqui).
// Resend só precisa de uma chave, sem usuário/senha.
//
// Não precisa instalar nada — é uma chamada HTTP direta pra API da
// Resend, sem SDK.
//
// Configuração necessária (Vercel → Settings → Environment Variables):
//   RESEND_API_KEY   chave gerada em resend.com (Dashboard → API Keys)
//   EMAIL_DESTINO    e-mail do escritório que recebe os avisos
//
// Sem domínio próprio verificado na Resend, o remetente tem que ser
// "onboarding@resend.dev" (domínio de testes deles, funciona de
// primeira). Quando comprar um domínio, dá pra trocar o remetente.
// ============================================================

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  const {
    tipo,             // "pedido" | "recalculo"
    empresaNome,
    empresaCnpj,
    contatoNome,
    pedidoTipo,
    detalhe,
    guiaNome,
    guiaCompetencia,
    guiaValor,
  } = req.body || {};

  if (!empresaNome || !empresaCnpj) {
    return res.status(400).json({ erro: "Dados da empresa ausentes" });
  }

  const ehRecalculo = tipo === "recalculo";

  const assunto = ehRecalculo
    ? `Recálculo solicitado — ${empresaNome} (${guiaNome || "guia"})`
    : `Novo pedido — ${empresaNome}: ${pedidoTipo || "assunto não informado"}`;

  const linhasDetalhe = ehRecalculo
    ? `Guia: ${guiaNome || "—"}\nCompetência: ${guiaCompetencia || "—"}\nValor atual: ${guiaValor || "—"}`
    : `Tipo de pedido: ${pedidoTipo || "—"}`;

  const texto = `
${ehRecalculo ? "PEDIDO DE RECÁLCULO DE GUIA" : "NOVO PEDIDO NO PORTAL"}

Empresa: ${empresaNome}
CNPJ: ${empresaCnpj}
Solicitado por: ${contatoNome || "—"}
${linhasDetalhe}
${detalhe ? `\nDetalhes informados:\n${detalhe}` : ""}

---
Enviado automaticamente pelo Portal do Cliente RN Contabilidade.
  `.trim();

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Portal RN Contabilidade <onboarding@resend.dev>",
        to: [process.env.EMAIL_DESTINO],
        subject: assunto,
        text: texto,
      }),
    });

    if (!r.ok) {
      const corpo = await r.text();
      throw new Error(`Resend respondeu ${r.status}: ${corpo}`);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Erro ao enviar e-mail via Resend:", e);
    return res.status(500).json({ erro: "Falha ao enviar e-mail", detalhe: String(e) });
  }
}
