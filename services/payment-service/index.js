const express = require('express');
const amqp = require('amqplib');
const { Kafka } = require('kafkajs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3004;
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';
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
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        payment_method VARCHAR(50) DEFAULT 'credit_card',
        status VARCHAR(50) DEFAULT 'completed',
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

// Initialize RabbitMQ
(async () => {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    rabbitmqChannel = await connection.createChannel();
    await rabbitmqChannel.assertQueue('payment.request', { durable: true });
    
    // Consume payment requests
    rabbitmqChannel.consume('payment.request', async (msg) => {
      if (msg) {
        try {
          const paymentRequest = JSON.parse(msg.content.toString());
          
          // Process payment (simulated) and save to database
          const result = await pool.query(
            'INSERT INTO payments (order_id, user_id, amount, status) VALUES ($1, $2, $3, $4) RETURNING id, order_id, user_id, amount, status, created_at',
            [paymentRequest.orderId, paymentRequest.userId, paymentRequest.amount, 'completed']
          );
          const payment = result.rows[0];
          
          // Publish payment processed event
          rabbitmqChannel.sendToQueue('order.payment.processed', Buffer.from(JSON.stringify({
            orderId: payment.order_id,
            paymentId: payment.id
          })));
          
          // Publish to Kafka
          if (kafkaProducer) {
            await kafkaProducer.send({
              topic: 'payment-events',
              messages: [{
                key: 'payment.completed',
                value: JSON.stringify({
                  paymentId: payment.id,
                  orderId: payment.order_id,
                  userId: payment.user_id,
                  amount: payment.amount,
                  timestamp: new Date().toISOString()
                })
              }]
            });
          }
          
          rabbitmqChannel.ack(msg);
        } catch (error) {
          console.error('Payment processing error:', error);
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
  clientId: 'payment-service',
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
    res.json({ status: 'ok', service: 'payment-service', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', service: 'payment-service', database: 'disconnected' });
  }
});

// Process payment (direct API call)
app.post('/payments', async (req, res) => {
  try {
    const { orderId, userId, amount, paymentMethod } = req.body;

    if (!orderId || !userId || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Insert payment into database
    const result = await pool.query(
      'INSERT INTO payments (order_id, user_id, amount, payment_method, status) VALUES ($1, $2, $3, $4, $5) RETURNING id, order_id, user_id, amount, payment_method, status, created_at',
      [orderId, userId, amount, paymentMethod || 'credit_card', 'completed']
    );
    const payment = result.rows[0];

    const paymentData = {
      id: payment.id,
      orderId: payment.order_id,
      userId: payment.user_id,
      amount: parseFloat(payment.amount),
      paymentMethod: payment.payment_method,
      status: payment.status,
      createdAt: payment.created_at
    };

    // Publish to RabbitMQ
    if (rabbitmqChannel) {
      rabbitmqChannel.sendToQueue('order.payment.processed', Buffer.from(JSON.stringify({
        orderId: payment.order_id,
        paymentId: payment.id
      })));
    }

    // Publish to Kafka
    if (kafkaProducer) {
      await kafkaProducer.send({
        topic: 'payment-events',
        messages: [{
          key: 'payment.completed',
          value: JSON.stringify({
            paymentId: payment.id,
            orderId: payment.order_id,
            userId: payment.user_id,
            amount: payment.amount,
            timestamp: new Date().toISOString()
          })
        }]
      });
    }

    res.status(201).json(paymentData);
  } catch (error) {
    console.error('Payment processing error:', error);
    res.status(500).json({ error: 'Payment processing failed' });
  }
});

// Get payment by ID
app.get('/payments/:id', async (req, res) => {
  try {
    const paymentId = parseInt(req.params.id);
    const result = await pool.query(
      'SELECT id, order_id, user_id, amount, payment_method, status, created_at FROM payments WHERE id = $1',
      [paymentId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    const payment = result.rows[0];
    res.json({
      id: payment.id,
      orderId: payment.order_id,
      userId: payment.user_id,
      amount: parseFloat(payment.amount),
      paymentMethod: payment.payment_method,
      status: payment.status,
      createdAt: payment.created_at
    });
  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({ error: 'Failed to fetch payment' });
  }
});

app.listen(PORT, () => {
  console.log(`Payment Service running on port ${PORT}`);
});
