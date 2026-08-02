#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/rodar_migrations.py
============================
Roda um ou mais arquivos sql/*.sql direto no Postgres do Supabase,
sem precisar colar no SQL Editor manualmente. Cada arquivo roda numa
transação própria: se algo no arquivo falhar, ele desfaz só aquele
arquivo e para (não segue pros próximos).

Usa a connection string do Postgres (Project Settings → Database →
Connection string, no Supabase), não a chave anônima — essa credencial
consegue alterar estrutura do banco (criar tabela, política de RLS
etc.), por isso é pedida na hora e não fica salva em lugar nenhum.

Precisa de psycopg2:
    pip install psycopg2-binary

Uso:
    python scripts/rodar_migrations.py sql/07-apuracao-anexos.sql sql/08-guias-parcelamento-campos.sql
"""

import getpass
import os
import sys

try:
    import psycopg2
except ImportError:
    print("Falta instalar o driver do Postgres. Rode:\n    pip install psycopg2-binary")
    sys.exit(1)


def main():
    if len(sys.argv) < 2:
        print("Uso: python scripts/rodar_migrations.py <arquivo.sql> [outro.sql ...]")
        sys.exit(1)

    arquivos = sys.argv[1:]
    for caminho in arquivos:
        if not os.path.isfile(caminho):
            print(f"Arquivo não encontrado: {caminho}")
            sys.exit(1)

    dsn = getpass.getpass(
        "Connection string do Postgres (Supabase → Project Settings → Database → "
        "Connection string, com a senha já dentro): "
    )

    print("Conectando…")
    conn = psycopg2.connect(dsn)
    conn.autocommit = False
    try:
        for caminho in arquivos:
            print(f"\n{caminho}")
            with open(caminho, "r", encoding="utf-8") as f:
                sql = f.read()
            try:
                with conn.cursor() as cur:
                    cur.execute(sql)
                conn.commit()
                print("  ok")
            except Exception as e:
                conn.rollback()
                print(f"  FALHOU — revertido: {e}")
                print("  arquivos seguintes não foram rodados.")
                sys.exit(1)
    finally:
        conn.close()

    print("\nTodas as migrations listadas rodaram com sucesso.")


if __name__ == "__main__":
    main()
