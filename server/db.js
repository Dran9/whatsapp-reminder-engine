const mysql = require('mysql2/promise');

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      family: 4,
      waitForConnections: true,
      connectionLimit: 10,
      timezone: '-04:00',
    });
  }
  return pool;
}

async function query(sql, params) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

async function initDB() {
  const db = getPool();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS clients (
      id INT AUTO_INCREMENT PRIMARY KEY,
      phone VARCHAR(20) NOT NULL UNIQUE,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      age TINYINT UNSIGNED,
      country VARCHAR(100) DEFAULT 'Bolivia',
      city ENUM('Cochabamba','Santa Cruz','La Paz','Sucre','Otro') DEFAULT 'Cochabamba',
      timezone VARCHAR(50) DEFAULT 'America/La_Paz',
      source ENUM('Referencia de amigos','Redes sociales','Otro') DEFAULT 'Otro',
      status ENUM('Nuevo','Prospecto','Activo','Inactivo','Bloqueado') DEFAULT 'Nuevo',
      fee DECIMAL(10,2) DEFAULT 250.00,
      wants_reschedule BOOLEAN DEFAULT FALSE,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_phone (phone),
      INDEX idx_status (status)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      client_id INT NOT NULL,
      date_time DATETIME NOT NULL,
      gcal_event_id VARCHAR(255),
      status ENUM('Confirmada','Reagendada','Cancelada','Completada','No-show') DEFAULT 'Confirmada',
      confirmed_at DATETIME,
      is_first BOOLEAN DEFAULT FALSE,
      session_number INT,
      notes TEXT,
      phone VARCHAR(20),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      INDEX idx_client (client_id),
      INDEX idx_datetime (date_time),
      INDEX idx_status (status)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS config (
      id INT PRIMARY KEY DEFAULT 1,
      available_hours JSON NOT NULL,
      available_days JSON NOT NULL,
      window_days INT DEFAULT 10,
      buffer_hours INT DEFAULT 3,
      min_age INT DEFAULT 23,
      max_age INT DEFAULT 75,
      appointment_duration INT DEFAULT 60,
      break_start VARCHAR(5) DEFAULT '13:00',
      break_end VARCHAR(5) DEFAULT '15:59',
      default_fee DECIMAL(10,2) DEFAULT 250.00,
      capital_fee DECIMAL(10,2) DEFAULT 300.00,
      capital_cities VARCHAR(255) DEFAULT 'Santa Cruz,La Paz',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS webhooks_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      event VARCHAR(255),
      type ENUM('cita_confirmada','reagendar_solicitado','cliente_nuevo','notificar_daniel','cita_cancelada','cita_reagendada'),
      payload JSON,
      status ENUM('enviado','recibido','error','no_configurado') DEFAULT 'enviado',
      client_phone VARCHAR(20),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed config if empty
  const [existing] = await db.execute('SELECT id FROM config WHERE id = 1');
  if (existing.length === 0) {
    const defaultHours = {
      lunes: ['08:00','09:00','10:00','11:00','12:00','16:00','17:00','18:00','19:00'],
      martes: ['08:00','09:00','10:00','11:00','12:00','16:00','17:00','18:00','19:00'],
      miercoles: ['08:00','09:00','10:00','11:00','12:00','16:00','17:00','18:00','19:00'],
      jueves: ['08:00','09:00','10:00','11:00','12:00','16:00','17:00','18:00','19:00'],
      viernes: ['08:00','09:00','10:00','11:00','12:00','16:00','17:00','18:00','19:00'],
    };
    const defaultDays = ['lunes','martes','miercoles','jueves','viernes'];
    await db.execute(
      `INSERT INTO config (id, available_hours, available_days) VALUES (1, ?, ?)`,
      [JSON.stringify(defaultHours), JSON.stringify(defaultDays)]
    );
    console.log('[db] Config seeded');
  }

  console.log('[db] Tables initialized');
}

module.exports = { getPool, query, initDB };
