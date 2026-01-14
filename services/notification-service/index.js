const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const amqp = require('amqplib');
const { Kafka } = require('kafkajs');
const redis = require('redis');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3003;
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
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        type VARCHAR(50),
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Database schema initialized');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
})();

// Store WebSocket connections by userId
const connections = new Map();
let rabbitmqChannel = null;
let kafkaConsumer = null;
let redisClient = null;
let redisSubscriber = null;

// Initialize Redis
(async () => {
  try {
    redisClient = redis.createClient({ url: REDIS_URL });
    redisSubscriber = redis.createClient({ url: REDIS_URL });
    await redisClient.connect();
    await redisSubscriber.connect();
    console.log('Connected to Redis');
    
    // Subscribe to notification channel for pub/sub
    await redisSubscriber.subscribe('notifications', (message) => {
      const notification = JSON.parse(message);
      broadcastNotification(notification);
    });
  } catch (error) {
    console.error('Redis connection error:', error);
  }
})();

// Initialize RabbitMQ
(async () => {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    rabbitmqChannel = await connection.createChannel();
    await rabbitmqChannel.assertQueue('notifications', { durable: true });
    
    // Consume notifications from RabbitMQ
    rabbitmqChannel.consume('notifications', async (msg) => {
      if (msg) {
        try {
          const notification = JSON.parse(msg.content.toString());
          console.log('Received notification request:', notification);
          const created = await createNotification(notification);
          console.log('Notification created successfully:', created.id);
          rabbitmqChannel.ack(msg);
        } catch (error) {
          console.error('Error creating notification:', error);
          rabbitmqChannel.nack(msg, false, true);
        }
      }
    });
    
    console.log('Waiting for notifications on RabbitMQ queue: notifications');
    
    console.log('Connected to RabbitMQ');
  } catch (error) {
    console.error('RabbitMQ connection error:', error);
  }
})();

// Initialize Kafka Consumer (optional - notifications also work via RabbitMQ)
const kafka = new Kafka({
  clientId: 'notification-service',
  brokers: [KAFKA_BROKER]
});
kafkaConsumer = kafka.consumer({ groupId: 'notification-group' });
(async () => {
  try {
    await kafkaConsumer.connect();
    await kafkaConsumer.subscribe({ topic: 'order-events', fromBeginning: false });
    await kafkaConsumer.subscribe({ topic: 'user-events', fromBeginning: false });
    
    await kafkaConsumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const messageKey = message.key ? message.key.toString() : null;
          const event = JSON.parse(message.value.toString());
          
          // Create notification based on event
          if (topic === 'order-events' && messageKey === 'order.created') {
            await createNotification({
              userId: event.userId,
              type: 'order',
              title: 'Order Created',
              message: `Your order #${event.orderId} has been created`,
              data: { orderId: event.orderId }
            });
          }
        } catch (error) {
          console.error('Error processing Kafka message:', error);
        }
      }
    });
    
    console.log('Connected to Kafka');
  } catch (error) {
    console.error('Kafka connection error (notifications will work via RabbitMQ):', error.message);
    // Notifications will still work via RabbitMQ, so this is not critical
  }
})();

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection');
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'subscribe' && data.userId) {
        // Store connection by userId
        if (!connections.has(data.userId)) {
          connections.set(data.userId, []);
        }
        connections.get(data.userId).push(ws);
        ws.userId = data.userId;
        
        // Send existing notifications from database
        try {
          const result = await pool.query(
            'SELECT id, user_id, type, title, message, data, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
            [data.userId]
          );
          const userNotifications = result.rows.map(row => ({
            id: row.id,
            userId: row.user_id,
            type: row.type,
            title: row.title,
            message: row.message,
            data: row.data,
            createdAt: row.created_at
          }));
          ws.send(JSON.stringify({ type: 'notifications', data: userNotifications }));
        } catch (error) {
          console.error('Error fetching notifications:', error);
        }
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    if (ws.userId && connections.has(ws.userId)) {
      const userConnections = connections.get(ws.userId);
      const index = userConnections.indexOf(ws);
      if (index > -1) {
        userConnections.splice(index, 1);
      }
      if (userConnections.length === 0) {
        connections.delete(ws.userId);
      }
    }
  });
});

// Create notification
async function createNotification(notification) {
  try {
    console.log('Creating notification in database:', notification);
    // Insert notification into database
    const result = await pool.query(
      'INSERT INTO notifications (user_id, type, title, message, data) VALUES ($1, $2, $3, $4, $5) RETURNING id, user_id, type, title, message, data, created_at',
      [notification.userId, notification.type || 'info', notification.title, notification.message, JSON.stringify(notification.data || {})]
    );
    const newNotification = {
      id: result.rows[0].id,
      userId: result.rows[0].user_id,
      type: result.rows[0].type,
      title: result.rows[0].title,
      message: result.rows[0].message,
      data: result.rows[0].data,
      createdAt: result.rows[0].created_at
    };
    
    console.log('Notification saved to database:', newNotification.id);
    
    // Publish to Redis for pub/sub scaling
    if (redisClient) {
      await redisClient.publish('notifications', JSON.stringify(newNotification));
    }
    
    // Broadcast via WebSocket
    broadcastNotification(newNotification);
    
    return newNotification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
}

// Broadcast notification to connected clients
function broadcastNotification(notification) {
  const userConnections = connections.get(notification.userId);
  if (userConnections) {
    userConnections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'notification',
          data: notification
        }));
      }
    });
  }
}

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'notification-service', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', service: 'notification-service', database: 'disconnected' });
  }
});

// Get notifications for a user
app.get('/notifications', async (req, res) => {
  try {
    const userId = parseInt(req.query.userId);
    const result = await pool.query(
      'SELECT id, user_id, type, title, message, data, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    const notifications = result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      type: row.type,
      title: row.title,
      message: row.message,
      data: row.data,
      createdAt: row.created_at
    }));
    res.json(notifications);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

server.listen(PORT, () => {
  console.log(`Notification Service running on port ${PORT}`);
});
