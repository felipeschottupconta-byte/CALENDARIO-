// api/notificar-pedido.js
// ============================================================
// Envia pelo Gmail via SMTP (nodemailer).
//
// Requer: npm install nodemailer
//
// Esta function precisa rodar em Node.js, não em "edge" — o
// nodemailer não funciona no runtime edge da Vercel.
//
// Configuração necessária (Vercel → Settings → Environment Variables):
//   GMAIL_USER            o e-mail do Gmail que vai enviar
//   GMAIL_APP_PASSWORD    senha de app gerada nas configurações do Google
//                         (NÃO é a senha normal da conta — ver instruções abaixo)
//   EMAIL_DESTINO         e-mail do escritório que recebe os avisos
//                         (pode ser o mesmo GMAIL_USER)
//
// Como gerar a senha de app no Google:
//   1. myaccount.google.com/security
//   2. Ativar verificação em duas etapas (obrigatório para senha de app)
//   3. Buscar "Senhas de app" → gerar uma nova → copiar os 16 caracteres
//   4. Colar em GMAIL_APP_PASSWORD (sem espaços)
//
// Limite do Gmail: ~500 e-mails/dia numa conta pessoal. Para o volume
// de pedidos de 110 clientes, isso é folga de sobra.
// ============================================================

import nodemailer from "nodemailer";

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
    const usuario = (process.env.GMAIL_USER || "").trim();
    const senha = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");

    const transporte = nodemailer.createTransport({
      service: "gmail",
      auth: { user: usuario, pass: senha },
    });

    await transporte.sendMail({
      from: `"Portal RN Contabilidade" <${usuario}>`,
      to: (process.env.EMAIL_DESTINO || "").trim(),
      subject: assunto,
      text: texto,
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Erro ao enviar e-mail via Gmail:", e);
    return res.status(500).json({ erro: "Falha ao enviar e-mail", detalhe: String(e) });
  }
}
