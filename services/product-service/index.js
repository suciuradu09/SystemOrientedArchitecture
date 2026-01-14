const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3006;
const DB_HOST = process.env.DB_HOST || 'postgres';
const DB_PORT = process.env.DB_PORT || 5432;
const DB_USER = process.env.DB_USER || 'soa_user';
const DB_PASSWORD = process.env.DB_PASSWORD || 'soa_password';
const DB_NAME = process.env.DB_NAME || 'soa_db';

app.use(express.json());

// Database connection
const pool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
});

// Initialize database schema
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10, 2) NOT NULL,
        stock INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Product table ensured to exist.');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
})();

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'product-service', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', service: 'product-service', database: 'disconnected' });
  }
});

// Get all products
app.get('/products', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, description, price, stock, created_at, updated_at FROM products ORDER BY created_at DESC'
    );
    const products = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      price: parseFloat(row.price),
      stock: row.stock,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
    res.json(products);
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get product by ID
app.get('/products/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const result = await pool.query(
      'SELECT id, name, description, price, stock, created_at, updated_at FROM products WHERE id = $1',
      [productId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const row = result.rows[0];
    res.json({
      id: row.id,
      name: row.name,
      description: row.description,
      price: parseFloat(row.price),
      stock: row.stock,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Create product
app.post('/products', async (req, res) => {
  try {
    const { name, description, price, stock } = req.body;

    if (!name || !price) {
      return res.status(400).json({ error: 'Name and price are required' });
    }

    const result = await pool.query(
      'INSERT INTO products (name, description, price, stock) VALUES ($1, $2, $3, $4) RETURNING id, name, description, price, stock, created_at, updated_at',
      [name, description || null, price, stock || 0]
    );
    
    const product = result.rows[0];
    res.status(201).json({
      id: product.id,
      name: product.name,
      description: product.description,
      price: parseFloat(product.price),
      stock: product.stock,
      createdAt: product.created_at,
      updatedAt: product.updated_at
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product
app.put('/products/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const { name, description, price, stock } = req.body;

    const result = await pool.query(
      'UPDATE products SET name = $1, description = $2, price = $3, stock = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING id, name, description, price, stock, created_at, updated_at',
      [name, description, price, stock, productId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const product = result.rows[0];
    res.json({
      id: product.id,
      name: product.name,
      description: product.description,
      price: parseFloat(product.price),
      stock: product.stock,
      createdAt: product.created_at,
      updatedAt: product.updated_at
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete product
app.delete('/products/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [productId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

app.listen(PORT, () => {
  console.log(`Product Service running on port ${PORT}`);
});
