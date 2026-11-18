-- Caixa da Associação de Moradores · PostgreSQL
-- Dinheiro em NUMERIC (exato). FLOAT erra: 0.1 + 0.2 = 0.30000000000000004.

CREATE TABLE IF NOT EXISTS despesas (
    id            SERIAL PRIMARY KEY,
    descricao     VARCHAR(200)   NOT NULL CHECK (char_length(trim(descricao)) >= 3),
    valor         NUMERIC(10,2)  NOT NULL CHECK (valor > 0),
    categoria     VARCHAR(20)    NOT NULL
                  CHECK (categoria IN ('manutenção','limpeza','eventos','administrativo','outros')),
    data_despesa  DATE           NOT NULL,
    conferida     BOOLEAN        NOT NULL DEFAULT false,
    criada_em     TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_despesas_data_categoria ON despesas (data_despesa, categoria);

-- Boa prática (critério de segurança): usuário da aplicação sem privilégio de admin.
-- Rode como administrador, trocando a senha:
-- CREATE USER usuario_app WITH PASSWORD 'TROQUE_AQUI';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON despesas TO usuario_app;
-- GRANT USAGE, SELECT ON SEQUENCE despesas_id_seq TO usuario_app;
