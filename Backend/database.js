const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Crear o abrir base de datos
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Inicializar tablas
db.serialize(() => {
    // Tabla de destinatarios
    db.run(`
        CREATE TABLE IF NOT EXISTS destinatarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            nombre TEXT,
            activo INTEGER DEFAULT 1,
            fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabla de tokens enviados
    db.run(`
        CREATE TABLE IF NOT EXISTS tokens_enviados (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT NOT NULL,
            fecha_envio DATETIME DEFAULT CURRENT_TIMESTAMP,
            destinatarios INTEGER,
            mensaje_id TEXT
        )
    `);

    // Tabla de configuración
    db.run(`
        CREATE TABLE IF NOT EXISTS configuracion (
            clave TEXT PRIMARY KEY,
            valor TEXT,
            fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Insertar configuración inicial si no existe
    db.get("SELECT * FROM configuracion WHERE clave = 'ultimo_token'", (err, row) => {
        if (!row) {
            db.run("INSERT INTO configuracion (clave, valor) VALUES ('ultimo_token', '')");
            db.run("INSERT INTO configuracion (clave, valor) VALUES ('ultimo_token_fecha', '')");
            db.run("INSERT INTO configuracion (clave, valor) VALUES ('ultimo_envio_fecha', '')");
        }
    });
});

const dbService = {
    // Destinatarios
    getDestinatarios: () => {
        return new Promise((resolve, reject) => {
            db.all("SELECT * FROM destinatarios WHERE activo = 1 ORDER BY id DESC", (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    addDestinatario: (email, nombre = '') => {
        return new Promise((resolve, reject) => {
            db.run(
                "INSERT OR IGNORE INTO destinatarios (email, nombre) VALUES (?, ?)",
                [email.toLowerCase(), nombre],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes > 0);
                }
            );
        });
    },

    removeDestinatario: (email) => {
        return new Promise((resolve, reject) => {
            db.run(
                "UPDATE destinatarios SET activo = 0 WHERE email = ?",
                [email.toLowerCase()],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes > 0);
                }
            );
        });
    },

    // Tokens
    saveTokenEnviado: (token, destinatarios, mensajeId) => {
        return new Promise((resolve, reject) => {
            db.run(
                "INSERT INTO tokens_enviados (token, destinatarios, mensaje_id) VALUES (?, ?, ?)",
                [token, destinatarios, mensajeId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    },

    getUltimoToken: () => {
        return new Promise((resolve, reject) => {
            db.get("SELECT valor FROM configuracion WHERE clave = 'ultimo_token'", (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.valor : null);
            });
        });
    },

    setUltimoToken: (token) => {
        return new Promise((resolve, reject) => {
            db.run(
                "UPDATE configuracion SET valor = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE clave = 'ultimo_token'",
                [token],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    },

    getUltimoEnvio: () => {
        return new Promise((resolve, reject) => {
            db.get("SELECT valor FROM configuracion WHERE clave = 'ultimo_envio_fecha'", (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.valor : null);
            });
        });
    },

    setUltimoEnvio: (fecha) => {
        return new Promise((resolve, reject) => {
            db.run(
                "UPDATE configuracion SET valor = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE clave = 'ultimo_envio_fecha'",
                [fecha],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    },

    getEstadisticas: () => {
        return new Promise((resolve, reject) => {
            db.get(`
                SELECT 
                    (SELECT COUNT(*) FROM destinatarios WHERE activo = 1) as total_destinatarios,
                    (SELECT COUNT(*) FROM tokens_enviados) as total_envios,
                    (SELECT token FROM tokens_enviados ORDER BY id DESC LIMIT 1) as ultimo_token_enviado,
                    (SELECT fecha_envio FROM tokens_enviados ORDER BY id DESC LIMIT 1) as ultima_fecha_envio
            `, (err, row) => {
                if (err) reject(err);
                else resolve(row || {});
            });
        });
    }
};

module.exports = dbService;