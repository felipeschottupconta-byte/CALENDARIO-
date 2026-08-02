# api/parse-extrato.py
# ============================================================
# Serverless Function Python da Vercel. Recebe o extrato/memória de
# cálculo do Simples Nacional via multipart POST, chama o parser
# (parsers/extrato_simples_parser.py) e devolve o JSON, já com a
# identificação de empresa (mesmo módulo usado em parse-guia.py).
#
# Diferente da guia, o extrato não tem vencimento — ele só explica a
# alíquota e o RBT12. Quem decide gravar e publicar é o painel.
# ============================================================

import json
import os
import sys
import tempfile
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "parsers"))

from extrato_simples_parser import parse_extrato_simples  # noqa: E402
from identificador_empresa import identificar  # noqa: E402


def _extrair_campos_do_multipart(content_type: str, corpo: bytes):
    cabecalho = f"Content-Type: {content_type}\r\n\r\n".encode("utf-8")
    mensagem = BytesParser(policy=policy.default).parsebytes(cabecalho + corpo)
    if not mensagem.is_multipart():
        return {}
    campos = {}
    for parte in mensagem.iter_parts():
        nome_campo = parte.get_param("name", header="Content-Disposition")
        if not nome_campo:
            continue
        if nome_campo in ("arquivo", "file", "pdf"):
            campos["_arquivo_bytes"] = parte.get_payload(decode=True)
            campos["_arquivo_nome"] = parte.get_filename()
        else:
            payload = parte.get_payload(decode=True)
            campos[nome_campo] = payload.decode("utf-8") if payload else ""
    return campos


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_type = self.headers.get("Content-Type", "")
            content_length = int(self.headers.get("Content-Length", 0))
            corpo = self.rfile.read(content_length) if content_length else b""

            if "multipart/form-data" not in content_type:
                self._responder(400, {"erro": "Envie multipart/form-data com o campo 'arquivo'."})
                return

            campos = _extrair_campos_do_multipart(content_type, corpo)
            pdf_bytes = campos.get("_arquivo_bytes")
            if not pdf_bytes:
                self._responder(400, {"erro": "Campo 'arquivo' (PDF) não encontrado no multipart."})
                return

            caminho_tmp = None
            try:
                with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                    tmp.write(pdf_bytes)
                    caminho_tmp = tmp.name

                extrato = parse_extrato_simples(caminho_tmp)
                resultado = extrato.to_dict()
                resultado["arquivo_hash"] = _hash_arquivo(pdf_bytes)
            finally:
                if caminho_tmp and os.path.exists(caminho_tmp):
                    os.unlink(caminho_tmp)

            try:
                empresas = json.loads(campos["empresas"]) if campos.get("empresas") else []
            except (json.JSONDecodeError, TypeError):
                empresas = []

            ident = identificar(resultado.get("cnpj"), resultado.get("razao_social"), empresas, None)
            resultado["identificacao"] = {
                "empresa_id": ident.empresa["id"] if ident.empresa else None,
                "metodo": ident.metodo,
                "confianca": ident.confianca,
                "exige_revisao": ident.exige_revisao,
                "motivos": ident.motivos,
                "candidatos": [c["id"] for c in ident.candidatos],
            }

            self._responder(200, resultado)
        except Exception as e:
            self._responder(500, {"erro": "Falha ao processar o extrato", "detalhe": str(e)})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _responder(self, status: int, corpo: dict):
        payload = json.dumps(corpo, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)


def _hash_arquivo(dados_bytes: bytes) -> str:
    import hashlib
    return hashlib.sha256(dados_bytes).hexdigest()
