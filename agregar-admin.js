const { db } = require('./database');

const email = process.argv[2];
const nombre = process.argv[3];

if (!email || !nombre) {
  console.log('Uso: node agregar-admin.js EMAIL NOMBRE');
  console.log('Ejemplo: node agregar-admin.js admin@empresa.com "Juan Pérez"');
  process.exit(1);
}

db.run(
  'INSERT INTO administradores (email, nombre) VALUES (?, ?)',
  [email, nombre],
  function(err) {
    if (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
    console.log(` Administrador agregado: ${nombre} (${email})`);
    db.close();
    process.exit(0);
  }
);
