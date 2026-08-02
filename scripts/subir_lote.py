#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/subir_lote.py
======================
Sobe todos os PDFs de uma pasta pro Supabase de produção, fazendo
exatamente o que o painel faria: manda cada arquivo pros endpoints já
existentes (/api/parse-guia, /api/parse-extrato — os mesmos que o
painel usa), que classificam o layout e identificam a empresa pelo
CNPJ do CONTEÚDO do PDF (nunca pelo nome do arquivo ou da pasta).
Depois grava exatamente nas tabelas que o painel gravaria.

Não publica nada sozinho: guia nova entra como "processando"/"revisao"
(igual ao painel) e apuração de extrato entra com publicada=false —
alguém ainda precisa abrir o painel e liberar. Ver CLAUDE.md, invariante 3.

Não guarda sua senha em lugar nenhum — pede na hora, com entrada
mascarada (getpass).

Uso:
    python scripts/subir_lote.py "E:\\caminho\\da\\pasta\\com\\os\\pdfs"

Pré-requisito: rodar sql/10-rls-empresas-staff.sql no Supabase antes,
se a empresa dos PDFs ainda não estiver cadastrada (sem essa migration,
o cadastro automático abaixo falha por falta de política de RLS).
"""

import getpass
import json
import os
import sys
import uuid
import urllib.error
import urllib.request

SUPABASE_URL = "https://kusnksdiuqlakmivqcko.supabase.co"
SUPABASE_ANON_KEY = "sb_publishable_yIQXjH1Ls3LJjAtoblrsww_vV1SvhtU"
# confira se é o domínio real do seu deploy antes de rodar
APP_URL = "https://calendario-fawn-seven.vercel.app"

NOME_PARCELAMENTO = {
    "PARCSN": "Parcelamento do Simples Nacional",
    "PARCSN-ESP": "Parcelamento especial do Simples Nacional",
    "PARCMEI": "Parcelamento do MEI",
    "PARCMEI-ESP": "Parcelamento especial do MEI",
    "RELP": "RELP — Simples Nacional",
}


# ---------------------------------------------------------------- HTTP
def _post_json(url, body, token=None):
    headers = {"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
    with urllib.request.urlopen(req) as resp:
        corpo = resp.read().decode("utf-8")
        return json.loads(corpo) if corpo else None


def _get_json(url, token):
    headers = {"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req) as resp:
        corpo = resp.read().decode("utf-8")
        return json.loads(corpo) if corpo else []


def _rest_insert(table, rows, token):
    headers = {
        "apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}",
        "Content-Type": "application/json", "Prefer": "return=representation",
    }
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{table}", data=json.dumps(rows).encode("utf-8"),
                                  headers=headers, method="POST")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _multipart(campos, nome_arquivo, pdf_bytes):
    boundary = uuid.uuid4().hex
    partes = []
    for nome, valor in campos.items():
        partes.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{nome}"\r\n\r\n{valor}\r\n'.encode("utf-8"))
    partes.append(
        (f'--{boundary}\r\nContent-Disposition: form-data; name="arquivo"; filename="{nome_arquivo}"\r\n'
         f'Content-Type: application/pdf\r\n\r\n').encode("utf-8") + pdf_bytes + b"\r\n"
    )
    partes.append(f"--{boundary}--\r\n".encode("utf-8"))
    return f"multipart/form-data; boundary={boundary}", b"".join(partes)


def _parsear(endpoint, caminho_pdf, empresas):
    with open(caminho_pdf, "rb") as f:
        pdf_bytes = f.read()
    content_type, corpo = _multipart({"empresas": json.dumps(empresas)}, os.path.basename(caminho_pdf), pdf_bytes)
    req = urllib.request.Request(f"{APP_URL}{endpoint}", data=corpo, headers={"Content-Type": content_type}, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8")), pdf_bytes
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode("utf-8")), pdf_bytes


def _subir_storage(caminho_storage, pdf_bytes, token):
    headers = {"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/pdf"}
    req = urllib.request.Request(f"{SUPABASE_URL}/storage/v1/object/guias/{caminho_storage}",
                                  data=pdf_bytes, headers=headers, method="POST")
    try:
        urllib.request.urlopen(req)
        return None
    except urllib.error.HTTPError as e:
        return e.read().decode("utf-8")


def _ja_existe(table, hash_, token):
    return bool(_get_json(f"{SUPABASE_URL}/rest/v1/{table}?select=id&arquivo_hash=eq.{hash_}", token))


# ---------------------------------------------------------------- fluxo
def entrar(email, senha):
    resp = _post_json(f"{SUPABASE_URL}/auth/v1/token?grant_type=password", {"email": email, "password": senha})
    return resp["access_token"]


def buscar_empresas(token):
    return _get_json(f"{SUPABASE_URL}/rest/v1/empresas?select=id,cnpj,razao_social,nome_fantasia", token)


def subir_guia(dados, pdf_bytes, caminho_pdf, empresas, token):
    if _ja_existe("guias", dados["arquivo_hash"], token):
        print("  já processado antes (hash duplicado) — pulando")
        return

    ident = dados.get("identificacao") or {}
    empresa = next((e for e in empresas if e["id"] == ident.get("empresa_id")), None)
    if not empresa:
        motivo = "empresa ambígua" if len(ident.get("candidatos") or []) > 1 else (
            " · ".join(ident.get("motivos") or []) or "CNPJ não cadastrado")
        print(f"  REVISÃO — empresa não identificada com confiança: {motivo}")
        return

    ano = dados["vencimento"][:4] if dados.get("vencimento") else "2026"
    caminho_storage = f"guias/{dados['cnpj']}/{ano}/{dados['arquivo_hash']}.pdf"
    erro = _subir_storage(caminho_storage, pdf_bytes, token)
    if erro:
        print(f"  ERRO no upload do PDF: {erro}")
        return

    eh_pix = dados.get("tipo") == "GFD"
    descricao = (
        NOME_PARCELAMENTO.get(dados.get("parcelamento_sigla"), f"Parcelamento {dados.get('parcelamento_sigla')}")
        if dados.get("eh_parcelamento") else (dados.get("subtipo") or dados.get("tipo"))
    )
    alertas = list(dados.get("alertas") or []) + (ident.get("motivos") or [] if ident.get("exige_revisao") else [])
    status = "revisao" if (alertas or not dados.get("publicavel")) else "processando"

    _rest_insert("guias", [{
        "empresa_id": empresa["id"], "tipo": dados["tipo"], "descricao": descricao,
        "competencia": None if dados.get("eh_parcelamento") else dados.get("competencia"),
        "vencimento": dados.get("vencimento"), "valor": dados.get("valor"),
        "eh_parcelamento": bool(dados.get("eh_parcelamento")),
        "parcelamento_sigla": dados.get("parcelamento_sigla"),
        "parcelamento_numero": dados.get("parcelamento_numero"),
        "parcela_atual": dados.get("parcela_atual"), "parcela_total": dados.get("parcela_total"),
        "valor_principal": dados.get("valor_principal"), "valor_multa": dados.get("valor_multa"),
        "valor_juros": dados.get("valor_juros"),
        "linha_digitavel": None if eh_pix else dados.get("linha_digitavel"),
        "pix_copia_cola": dados.get("linha_digitavel") if eh_pix else None,
        "status": status, "storage_path": caminho_storage, "arquivo_hash": dados["arquivo_hash"],
        "nome_original": dados.get("arquivo") or os.path.basename(caminho_pdf), "origem": "manual",
        "confianca": dados.get("confianca"), "classificado_por": dados.get("layout") or "regex",
    }], token)
    print(f"  gravada como '{status}' — {descricao} · R$ {dados.get('valor')}")


def subir_extrato(caminho_pdf, empresas, guias_existentes, token):
    dados, pdf_bytes = _parsear("/api/parse-extrato", caminho_pdf, empresas)
    if "erro" in dados:
        print(f"  ERRO ao processar: {dados['erro']}")
        return

    if _ja_existe("apuracoes_simples", dados["arquivo_hash"], token):
        print("  já processado antes (hash duplicado) — pulando")
        return

    ident = dados.get("identificacao") or {}
    empresa = next((e for e in empresas if e["id"] == ident.get("empresa_id")), None)
    if not empresa:
        motivo = "empresa ambígua" if len(ident.get("candidatos") or []) > 1 else (
            " · ".join(ident.get("motivos") or []) or "CNPJ não cadastrado")
        print(f"  REVISÃO — empresa não identificada com confiança: {motivo}")
        return

    guia_das = next((g for g in guias_existentes if g.get("empresa_id") == empresa["id"]
                      and g.get("tipo") == "DAS" and g.get("competencia") == dados.get("competencia")), None)

    ano = dados["competencia"][3:7] if dados.get("competencia") else "2026"
    caminho_storage = f"extratos/{dados['cnpj']}/{ano}/{dados['arquivo_hash']}.pdf"
    erro = _subir_storage(caminho_storage, pdf_bytes, token)
    if erro:
        print(f"  ERRO no upload do PDF: {erro}")
        return

    anexos = dados.get("anexos") or []
    multiplo = bool(dados.get("multiplos_anexos"))
    anexo_unico = None if multiplo else (anexos[0] if anexos else None)

    apuracao = _rest_insert("apuracoes_simples", [{
        "empresa_id": empresa["id"], "guia_id": guia_das["id"] if guia_das else None,
        "competencia": dados.get("competencia"), "anexo": anexo_unico["anexo"] if anexo_unico else None,
        "rpa": dados.get("rpa"), "rbt12": dados.get("rbt12"),
        "faixa_de": dados.get("faixa_de"), "faixa_ate": dados.get("faixa_ate"),
        "aliquota_nominal": anexo_unico["aliquota_nominal"] if anexo_unico else None,
        "aliquota_efetiva": anexo_unico["aliquota_efetiva"] if anexo_unico else dados.get("aliquota_efetiva_media"),
        "parcela_deduzir": anexo_unico["parcela_deduzir"] if anexo_unico else None,
        "total_a_recolher": dados.get("total_a_recolher"),
        "storage_path": caminho_storage, "arquivo_hash": dados["arquivo_hash"], "publicada": False,
    }], token)[0]
    apuracao_id = apuracao["id"]

    historico = dados.get("historico_rbt12") or []
    if historico:
        _rest_insert("apuracao_historico_receita", [{
            "apuracao_id": apuracao_id, "competencia": h["competencia"],
            "receita_interna": h["receita_interna"], "receita_exportacao": h["receita_exportacao"],
        } for h in historico], token)

    if multiplo:
        for a in anexos:
            anexo_inserido = _rest_insert("apuracao_anexos", [{
                "apuracao_id": apuracao_id, "anexo": a["anexo"], "receita_tributada": a["receita_tributada"],
                "aliquota_nominal": a["aliquota_nominal"], "aliquota_efetiva": a["aliquota_efetiva"],
                "parcela_deduzir": a["parcela_deduzir"], "percentual_reducao_icms": a["percentual_reducao_icms"],
                "subtotal": a["subtotal"],
            }], token)[0]
            if a.get("tributos"):
                _rest_insert("apuracao_tributos", [{
                    "apuracao_id": apuracao_id, "apuracao_anexo_id": anexo_inserido["id"], "nome": t["nome"],
                    "situacao": t["situacao"], "base_calculo": t["base_calculo"], "aliquota": t["aliquota"],
                    "percentual_reducao": a["percentual_reducao_icms"], "valor": t["valor"],
                } for t in a["tributos"]], token)
    elif anexo_unico and anexo_unico.get("tributos"):
        _rest_insert("apuracao_tributos", [{
            "apuracao_id": apuracao_id, "nome": t["nome"], "situacao": t["situacao"],
            "base_calculo": t["base_calculo"], "aliquota": t["aliquota"],
            "percentual_reducao": anexo_unico["percentual_reducao_icms"], "valor": t["valor"],
        } for t in anexo_unico["tributos"]], token)

    aviso = " (com alertas — revisar antes de publicar)" if dados.get("precisa_revisao") else ""
    print(f"  gravado, publicada=false{aviso} — abra a aba Extratos no painel pra publicar")


def main():
    if len(sys.argv) < 2:
        print("Uso: python scripts/subir_lote.py <pasta com os PDFs>")
        sys.exit(1)
    pasta = sys.argv[1]
    if not os.path.isdir(pasta):
        print(f"Pasta não encontrada: {pasta}")
        sys.exit(1)

    email = input("E-mail do admin: ").strip()
    senha = getpass.getpass("Senha: ")
    print("Entrando…")
    try:
        token = entrar(email, senha)
    except urllib.error.HTTPError as e:
        print(f"Falha no login: {e.read().decode('utf-8')}")
        sys.exit(1)
    print("Sessão ok.\n")

    empresas = buscar_empresas(token)

    cnpj_pasta = input("CNPJ da empresa (só números, ENTER se já estiver cadastrada): ").strip()
    cnpj_pasta = "".join(c for c in cnpj_pasta if c.isdigit())
    if cnpj_pasta and not any(e["cnpj"] == cnpj_pasta for e in empresas):
        razao = input("Empresa não cadastrada. Razão social: ").strip()
        regime = input("Regime (simples/presumido/real/mei/imune) [simples]: ").strip() or "simples"
        try:
            nova = _rest_insert("empresas", [{"cnpj": cnpj_pasta, "razao_social": razao, "regime": regime}], token)[0]
        except urllib.error.HTTPError as e:
            print(f"Falha ao cadastrar empresa: {e.read().decode('utf-8')}")
            print("Se for erro de RLS, rode sql/10-rls-empresas-staff.sql no Supabase e tente de novo.")
            sys.exit(1)
        empresas.append(nova)
        print(f"  cadastrada: {nova['id']}\n")

    arquivos = sorted(f for f in os.listdir(pasta) if f.lower().endswith(".pdf"))
    if not arquivos:
        print("Nenhum PDF encontrado na pasta.")
        return

    pendentes_extrato = []
    for nome in arquivos:
        caminho = os.path.join(pasta, nome)
        print(f"\n{nome}")
        dados, pdf_bytes = _parsear("/api/parse-guia", caminho, empresas)
        layout_reconhecido = "erro" not in dados and dados.get("tipo") not in (None, "?")
        if layout_reconhecido:
            subir_guia(dados, pdf_bytes, caminho, empresas, token)
        else:
            pendentes_extrato.append(caminho)  # layout não é de guia — deve ser extrato

    if pendentes_extrato:
        guias_existentes = _get_json(f"{SUPABASE_URL}/rest/v1/guias?select=id,empresa_id,tipo,competencia", token)
        for caminho in pendentes_extrato:
            print(f"\n{os.path.basename(caminho)} (extrato)")
            subir_extrato(caminho, empresas, guias_existentes, token)

    print("\nPronto. Abra o painel (aba Guias e aba Extratos) pra revisar e publicar.")


if __name__ == "__main__":
    main()
