const express = require('express')
const cors = require('cors')
const mysql = require('mysql2/promise')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const dotenv = require('dotenv')

dotenv.config()

const PORT = process.env.PORT || 3001
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me'
const SEED_USER_EMAIL = process.env.SEED_USER_EMAIL || 'demo@demo.com'
const SEED_USER_PASSWORD = process.env.SEED_USER_PASSWORD || 'Demo123!'
const DB_HOST = process.env.DB_HOST || 'localhost'
const DB_USER = process.env.DB_USER || 'root'
const DB_PASSWORD = process.env.DB_PASSWORD || 'root'
const DB_NAME = process.env.DB_NAME || 'ventas_seguras'

const createPool = async () => {
  const connection = await mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
  })
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``)
  await connection.end()

  return mysql.createPool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  })
}

const query = async (pool, sql, params = []) => {
  const [rows] = await pool.execute(sql, params)
  return rows
}

const initDb = async (pool) => {
  await query(
    pool,
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(180) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`,
  )
  await query(
    pool,
    `CREATE TABLE IF NOT EXISTS products (
      id INT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      price DECIMAL(10, 2) NOT NULL,
      description TEXT,
      category VARCHAR(100),
      image VARCHAR(255)
    ) ENGINE=InnoDB`,
  )
  await query(
    pool,
    `CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      product_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (product_id) REFERENCES products (id)
    ) ENGINE=InnoDB`,
  )
}

const seedUser = async (pool) => {
  const rows = await query(pool, 'SELECT id FROM users WHERE email = ?', [
    SEED_USER_EMAIL,
  ])
  if (rows.length > 0) return
  const passwordHash = await bcrypt.hash(SEED_USER_PASSWORD, 10)
  await query(pool, 'INSERT INTO users (email, password_hash) VALUES (?, ?)', [
    SEED_USER_EMAIL,
    passwordHash,
  ])
}

const syncProductsIfEmpty = async (pool) => {
  const rows = await query(pool, 'SELECT COUNT(*) as count FROM products')
  if (rows[0] && rows[0].count > 0) return

  const response = await fetch('https://dummyjson.com/products')
  if (!response.ok) {
    throw new Error('No se pudo consumir la API externa')
  }
  const payload = await response.json()
  const products = Array.isArray(payload.products) ? payload.products : []

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    for (const product of products) {
      const image = product.thumbnail || product.images?.[0] || ''
      await connection.execute(
        `INSERT INTO products (id, title, price, description, category, image)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           title = VALUES(title),
           price = VALUES(price),
           description = VALUES(description),
           category = VALUES(category),
           image = VALUES(image)`,
        [
          product.id,
          product.title,
          product.price,
          product.description,
          product.category,
          image,
        ],
      )
    }
    await connection.commit()
  } catch (err) {
    await connection.rollback()
    throw err
  } finally {
    connection.release()
  }
}

const createToken = (user) =>
  jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '2h' })

const authenticate = (req, res, next) => {
  const header = req.headers.authorization || ''
  const token = header.replace('Bearer ', '')
  if (!token) {
    return res.status(401).json({ message: 'Token requerido' })
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    return next()
  } catch (err) {
    return res.status(401).json({ message: 'Token invalido' })
  }
}

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.get('/api/products', async (req, res) => {
  try {
    const pool = req.app.locals.db
    await syncProductsIfEmpty(pool)
    const products = await query(pool, 'SELECT * FROM products ORDER BY id')
    res.json(products)
  } catch (err) {
    res.status(500).json({ message: 'No se pudo cargar el catalogo' })
  }
})

app.get('/api/products/search', async (req, res) => {
  const q = String(req.query.q || '').trim()
  try {
    const pool = req.app.locals.db
    await syncProductsIfEmpty(pool)
    if (!q) {
      const products = await query(pool, 'SELECT * FROM products ORDER BY id')
      return res.json(products)
    }
    const pattern = `%${q}%`
    const products = await query(
      pool,
      `SELECT * FROM products
       WHERE title LIKE ? OR description LIKE ?
       ORDER BY id`,
      [pattern, pattern],
    )
    return res.json(products)
  } catch (err) {
    return res.status(500).json({ message: 'Busqueda fallida' })
  }
})

app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ message: 'Email y contrasena requeridos' })
  }
  try {
    const pool = req.app.locals.db
    const existing = await query(pool, 'SELECT id FROM users WHERE email = ?', [
      email,
    ])
    if (existing.length > 0) {
      return res.status(409).json({ message: 'El usuario ya existe' })
    }
    const passwordHash = await bcrypt.hash(password, 10)
    const result = await query(
      pool,
      'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      [email, passwordHash],
    )
    const user = { id: result.insertId, email }
    const token = createToken(user)
    return res.json({ token, email })
  } catch (err) {
    return res.status(500).json({ message: 'Registro fallido' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ message: 'Email y contrasena requeridos' })
  }
  try {
    const pool = req.app.locals.db
    const rows = await query(
      pool,
      'SELECT id, email, password_hash FROM users WHERE email = ?',
      [email],
    )
    const user = rows[0]
    if (!user) {
      return res.status(401).json({ message: 'Credenciales invalidas' })
    }
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return res.status(401).json({ message: 'Credenciales invalidas' })
    }
    const token = createToken(user)
    return res.json({ token, email: user.email })
  } catch (err) {
    return res.status(500).json({ message: 'Login fallido' })
  }
})

app.post('/api/orders', authenticate, async (req, res) => {
  const { productId } = req.body
  if (!productId) {
    return res.status(400).json({ message: 'Producto requerido' })
  }
  try {
    const pool = req.app.locals.db 
    const rows = await query(pool, 'SELECT id FROM products WHERE id = ?', [
      productId,
    ])
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Producto no encontrado' })
    }
    await query(pool, 'INSERT INTO orders (user_id, product_id) VALUES (?, ?)', [
      req.user.id,
      productId,
    ])
    return res.json({ message: 'Compra registrada' })
  } catch (err) {
    return res.status(500).json({ message: 'No se pudo registrar la compra' })
  }
})

const startServer = async () => {
  try {
    const pool = await createPool()
    await initDb(pool)
    await seedUser(pool)
    app.locals.db = pool
    app.listen(PORT, () => {
      console.log(`API escuchando en puerto ${PORT}`)
    })
  } catch (err) {
    console.error('Error inicializando la base de datos', err)
    process.exit(1)
  }
}

startServer()