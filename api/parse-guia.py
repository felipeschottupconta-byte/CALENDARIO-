# api/parse-guia.py
# ============================================================
# Serverless Function Python da Vercel. Recebe um PDF via multipart
# POST, chama o parser determinístico (parsers/guia_parser.py) e
# devolve o resultado como JSON. Não decide nada sozinho — quem decide
# se publica ou vai pra revisão é o painel, com base nos campos que
# esta function devolve (publicavel, alertas).
#
# Sem framework: Vercel reconhece uma classe `handler` que estende
# BaseHTTPRequestHandler em qualquer arquivo api/*.py. O multipart é
# parseado só com biblioteca padrão (email.parser) — não precisa de
# Flask nem de cgi (removido do Python 3.13).
# ============================================================

import json
import os
import sys
import tempfile
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "parsers"))

from guia_parser import parse_guia  # noqa: E402


def _extrair_pdf_do_multipart(content_type: str, corpo: bytes):
    """Devolve (bytes_do_pdf, nome_original) ou (None, None) se não achar
    o campo de arquivo. Monta uma mensagem MIME sintética pra reusar o
    parser de multipart da biblioteca padrão em vez de reimplementar."""
    cabecalho = f"Content-Type: {content_type}\r\n\r\n".encode("utf-8")
    mensagem = BytesParser(policy=policy.default).parsebytes(cabecalho + corpo)

    if not mensagem.is_multipart():
        return None, None

    for parte in mensagem.iter_parts():
        nome_campo = parte.get_param("name", header="Content-Disposition")
        if nome_campo in ("arquivo", "file", "pdf"):
            return parte.get_payload(decode=True), parte.get_filename()
    return None, None


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_type = self.headers.get("Content-Type", "")
            content_length = int(self.headers.get("Content-Length", 0))
            corpo = self.rfile.read(content_length) if content_length else b""

            if "multipart/form-data" not in content_type:
                self._responder(400, {"erro": "Envie multipart/form-data com o campo 'arquivo'."})
                return

            pdf_bytes, nome_original = _extrair_pdf_do_multipart(content_type, corpo)
            if not pdf_bytes:
                self._responder(400, {"erro": "Campo 'arquivo' (PDF) não encontrado no multipart."})
                return

            caminho_tmp = None
            try:
                with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                    tmp.write(pdf_bytes)
                    caminho_tmp = tmp.name

                guia = parse_guia(caminho_tmp)
                resultado = guia.to_dict()
                # o parser usa o nome do arquivo temporário — devolve o
                # nome original que o cliente enviou, não "tmpXXXXXX.pdf"
                resultado["arquivo"] = nome_original or resultado["arquivo"]
            finally:
                if caminho_tmp and os.path.exists(caminho_tmp):
                    os.unlink(caminho_tmp)

            self._responder(200, resultado)
        except Exception as e:  # nunca deixa o upload em silêncio — devolve o erro
            self._responder(500, {"erro": "Falha ao processar o PDF", "detalhe": str(e)})

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
