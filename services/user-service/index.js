const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const amqp = require('amqplib');
const { Kafka } = require('kafkajs');
const redis = require('redis');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
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
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Database schema initialized');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
})();

let rabbitmqChannel = null;
let kafkaProducer = null;
let redisClient = null;

// Initialize Redis
(async () => {
  try {
    redisClient = redis.createClient({ url: REDIS_URL });
    await redisClient.connect();
    console.log('Connected to Redis');
  } catch (error) {
    console.error('Redis connection error:', error);
  }
})();

// Initialize RabbitMQ
(async () => {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    rabbitmqChannel = await connection.createChannel();
    await rabbitmqChannel.assertQueue('user.created', { durable: true });
    console.log('Connected to RabbitMQ');
  } catch (error) {
    console.error('RabbitMQ connection error:', error);
  }
})();

// Initialize Kafka
const kafka = new Kafka({
  clientId: 'user-service',
  brokers: [KAFKA_BROKER]
});
kafkaProducer = kafka.producer();
(async () => {
  try {
    await kafkaProducer.connect();
    console.log('Connected to Kafka');
  } catch (error) {
    console.error('Kafka connection error:', error);
  }
})();

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'user-service', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', service: 'user-service', database: 'disconnected' });
  }
});

// Register user
app.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check if user exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user in database
    const result = await pool.query(
      'INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
      [email, hashedPassword, name || email]
    );
    const user = result.rows[0];

    // Publish to RabbitMQ
    if (rabbitmqChannel) {
      rabbitmqChannel.sendToQueue('user.created', Buffer.from(JSON.stringify({
        userId: user.id,
        email: user.email,
        name: user.name
      })));
    }

    // Publish to Kafka
    if (kafkaProducer) {
      await kafkaProducer.send({
        topic: 'user-events',
        messages: [{
          key: 'user.created',
          value: JSON.stringify({
            userId: user.id,
            email: user.email,
            timestamp: new Date().toISOString()
          })
        }]
      });
    }

    // Cache user in Redis
    if (redisClient) {
      await redisClient.setEx(`user:${user.id}`, 3600, JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name
      }));
    }

    // Automatically generate token for instant login after registration
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'User created successfully',
      token: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login user
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check Redis cache first
    let user = null;
    if (redisClient) {
      // Try to find user by email in cache (we'd need to store email->id mapping for this)
      // For now, query database
    }

    // Query database
    const result = await pool.query('SELECT id, email, password, name FROM users WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    user = result.rows[0];

    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Cache user in Redis
    if (redisClient) {
      await redisClient.setEx(`user:${user.id}`, 3600, JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name
      }));
    }

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get user by ID
app.get('/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Check Redis cache first
    let userData = null;
    if (redisClient) {
      const cached = await redisClient.get(`user:${userId}`);
      if (cached) {
        userData = JSON.parse(cached);
      }
    }

    // If not in cache, query database
    if (!userData) {
      const result = await pool.query('SELECT id, email, name FROM users WHERE id = $1', [userId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      userData = result.rows[0];

      // Cache in Redis
      if (redisClient) {
        await redisClient.setEx(`user:${userId}`, 3600, JSON.stringify(userData));
      }
    }

    res.json(userData);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.listen(PORT, () => {
  console.log(`User Service running on port ${PORT}`);
});
