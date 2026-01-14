const express = require('express');
const amqp = require('amqplib');
const { Kafka } = require('kafkajs');
const axios = require('axios');
const redis = require('redis');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3002;
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3004';
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
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        items JSONB NOT NULL,
        total_amount DECIMAL(10, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        payment_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    await rabbitmqChannel.assertQueue('order.created', { durable: true });
    await rabbitmqChannel.assertQueue('order.payment.processed', { durable: true });
    
    // Consume payment processed messages
    rabbitmqChannel.consume('order.payment.processed', async (msg) => {
      if (msg) {
        try {
          const data = JSON.parse(msg.content.toString());
          await pool.query(
            'UPDATE orders SET status = $1, payment_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
            ['paid', data.paymentId, data.orderId]
          );
          rabbitmqChannel.ack(msg);
        } catch (error) {
          console.error('Error updating order status:', error);
          rabbitmqChannel.nack(msg, false, true);
        }
      }
    });
    
    console.log('Connected to RabbitMQ');
  } catch (error) {
    console.error('RabbitMQ connection error:', error);
  }
})();

// Initialize Kafka
const kafka = new Kafka({
  clientId: 'order-service',
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
    res.json({ status: 'ok', service: 'order-service', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', service: 'order-service', database: 'disconnected' });
  }
});

// Get all orders for a user
app.get('/orders', async (req, res) => {
  try {
    const userId = parseInt(req.query.userId);
    const result = await pool.query(
      'SELECT id, user_id, items, total_amount, status, payment_id, created_at, updated_at FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    res.json(result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      items: row.items,
      totalAmount: parseFloat(row.total_amount),
      status: row.status,
      paymentId: row.payment_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })));
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get order by ID
app.get('/orders/:id', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const result = await pool.query(
      'SELECT id, user_id, items, total_amount, status, payment_id, created_at, updated_at FROM orders WHERE id = $1',
      [orderId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const row = result.rows[0];
    res.json({
      id: row.id,
      userId: row.user_id,
      items: row.items,
      totalAmount: parseFloat(row.total_amount),
      status: row.status,
      paymentId: row.payment_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Create order
app.post('/orders', async (req, res) => {
  try {
    const { userId, items, totalAmount } = req.body;

    if (!userId || !items || !totalAmount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Insert order into database
    const result = await pool.query(
      'INSERT INTO orders (user_id, items, total_amount, status) VALUES ($1, $2, $3, $4) RETURNING id, user_id, items, total_amount, status, created_at',
      [userId, JSON.stringify(items), totalAmount, 'pending']
    );
    const order = result.rows[0];

    const orderData = {
      id: order.id,
      userId: order.user_id,
      items: order.items,
      totalAmount: parseFloat(order.total_amount),
      status: order.status,
      createdAt: order.created_at
    };

    // Publish to RabbitMQ
    if (rabbitmqChannel) {
      rabbitmqChannel.sendToQueue('order.created', Buffer.from(JSON.stringify({
        orderId: order.id,
        userId: order.user_id,
        totalAmount: order.total_amount
      })));
      
      // Also send notification request directly via RabbitMQ
      const notificationMessage = {
        userId: order.user_id,
        type: 'order',
        title: 'Order Created',
        message: `Your order #${order.id} has been created`,
        data: { orderId: order.id }
      };
      console.log('Sending notification to RabbitMQ:', notificationMessage);
      rabbitmqChannel.sendToQueue('notifications', Buffer.from(JSON.stringify(notificationMessage)));
      console.log('Notification message sent to RabbitMQ queue: notifications');
    } else {
      console.error('RabbitMQ channel not available - cannot send notification');
    }

    // Publish to Kafka (optional - don't fail if Kafka is down)
    if (kafkaProducer) {
      try {
        await kafkaProducer.send({
          topic: 'order-events',
          messages: [{
            key: 'order.created',
            value: JSON.stringify({
              orderId: order.id,
              userId: order.user_id,
              totalAmount: order.total_amount,
              timestamp: new Date().toISOString()
            })
          }]
        });
      } catch (error) {
        console.error('Kafka publish error (non-critical):', error.message);
        // Don't fail order creation if Kafka is down
      }
    }

    // Process payment asynchronously via RabbitMQ
    if (rabbitmqChannel) {
      rabbitmqChannel.sendToQueue('payment.request', Buffer.from(JSON.stringify({
        orderId: order.id,
        userId: order.user_id,
        amount: order.total_amount
      })));
    }

    res.status(201).json(orderData);
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

app.listen(PORT, () => {
  console.log(`Order Service running on port ${PORT}`);
});
