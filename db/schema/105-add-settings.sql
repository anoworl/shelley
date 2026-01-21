-- Settings table (singleton)
-- Stores application settings as a JSON blob

CREATE TABLE settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL DEFAULT '{}',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO settings (id, data) VALUES (1, '{}');
