const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'horarios.db'), (err) => {
    if (err) {
        console.error('❌ Error conectando a la base de datos:', err);
    } else {
        console.log('✅ Conectado a la base de datos SQLite');
    }
});

db.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telefono TEXT UNIQUE NOT NULL,
    nombre TEXT,
    email TEXT,
    es_admin BOOLEAN DEFAULT 0,
    activo BOOLEAN DEFAULT 1,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS registros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telefono TEXT NOT NULL,
    accion TEXT NOT NULL,
    fecha_hora DATETIME NOT NULL,
    ip_address TEXT,
    FOREIGN KEY (telefono) REFERENCES usuarios(telefono)
)`);

db.run(`ALTER TABLE registros ADD COLUMN ip_address TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
        // Columna ya existe, no es error crítico
    }
});

function registrarAccion(telefono, accion, ip, callback) {
    const fecha_hora = new Date().toISOString();
    db.run(
        `INSERT INTO registros (telefono, accion, fecha_hora, ip_address) VALUES (?, ?, ?, ?)`,
        [telefono, accion, fecha_hora, ip],
        function(err) {
            if (err) return callback(err);
            callback(null, { 
                id: this.lastID, 
                telefono, 
                accion, 
                fecha_hora, 
                ip_address: ip 
            });
        }
    );
}

function obtenerRegistrosUsuario(telefono, mesAno, callback) {
    let query = 'SELECT * FROM registros WHERE telefono = ?';
    const params = [telefono];
    
    if (mesAno) {
        query += ' AND fecha_hora LIKE ?';
        params.push(`${mesAno}%`);
    }
    
    query += ' ORDER BY fecha_hora DESC';
    db.all(query, params, callback);
}

function obtenerRegistrosMes(mesAno, callback) {
    db.all(
        `SELECT * FROM registros WHERE fecha_hora LIKE ? ORDER BY fecha_hora DESC`,
        [`${mesAno}%`],
        callback
    );
}

function obtenerResumenMensual(mesAno, callback) {
    db.all(
        `SELECT telefono, accion, COUNT(*) as total 
         FROM registros 
         WHERE fecha_hora LIKE ? 
         GROUP BY telefono, accion`,
        [`${mesAno}%`],
        callback
    );
}

function obtenerAdministradores(callback) {
    db.all(
        'SELECT * FROM usuarios WHERE es_admin = 1 AND activo = 1',
        callback
    );
}

function crearUsuario(telefono, nombre, email, callback) {
    db.run(
        `INSERT INTO usuarios (telefono, nombre, email) 
         VALUES (?, ?, ?) 
         ON CONFLICT(telefono) DO UPDATE SET nombre = ?, email = ?`,
        [telefono, nombre, email, nombre, email],
        callback
    );
}

module.exports = {
    db,
    registrarAccion,
    obtenerRegistrosUsuario,
    obtenerRegistrosMes,
    obtenerResumenMensual,
    obtenerAdministradores,
    crearUsuario
};
