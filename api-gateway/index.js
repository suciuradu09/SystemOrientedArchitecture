const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// Service URLs
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3002';
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3003';
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3004';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3006';

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-gateway' });
});

// Authentication endpoints (public)
app.post('/api/auth/register', async (req, res) => {
  try {
    const response = await axios.post(`${USER_SERVICE_URL}/register`, req.body);
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Registration failed'
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const response = await axios.post(`${USER_SERVICE_URL}/login`, req.body);
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Login failed'
    });
  }
});

// User endpoints (protected)
app.get('/api/users/me', authenticateToken, async (req, res) => {
  try {
    const response = await axios.get(`${USER_SERVICE_URL}/users/${req.user.userId}`, {
      headers: { 'Authorization': req.headers['authorization'] }
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Failed to fetch user'
    });
  }
});

// Order endpoints (protected)
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const response = await axios.get(`${ORDER_SERVICE_URL}/orders`, {
      headers: { 'Authorization': req.headers['authorization'] },
      params: { userId: req.user.userId }
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Failed to fetch orders'
    });
  }
});

app.post('/api/orders', authenticateToken, async (req, res) => {
  try {
    const orderData = { ...req.body, userId: req.user.userId };
    const response = await axios.post(`${ORDER_SERVICE_URL}/orders`, orderData, {
      headers: { 'Authorization': req.headers['authorization'] }
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Failed to create order'
    });
  }
});

app.get('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const response = await axios.get(`${ORDER_SERVICE_URL}/orders/${req.params.id}`, {
      headers: { 'Authorization': req.headers['authorization'] }
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Failed to fetch order'
    });
  }
});

// Payment endpoints (protected)
app.post('/api/payments', authenticateToken, async (req, res) => {
  try {
    const paymentData = { ...req.body, userId: req.user.userId };
    const response = await axios.post(`${PAYMENT_SERVICE_URL}/payments`, paymentData, {
      headers: { 'Authorization': req.headers['authorization'] }
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Payment failed'
    });
  }
});

// Notification endpoints (protected)
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const response = await axios.get(`${NOTIFICATION_SERVICE_URL}/notifications`, {
      headers: { 'Authorization': req.headers['authorization'] },
      params: { userId: req.user.userId }
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Failed to fetch notifications'
    });
  }
});

// Product endpoints (protected)
app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    const response = await axios.get(`${PRODUCT_SERVICE_URL}/products`);
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Failed to fetch products'
    });
  }
});

app.get('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const response = await axios.get(`${PRODUCT_SERVICE_URL}/products/${req.params.id}`);
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Failed to fetch product'
    });
  }
});

app.post('/api/products', authenticateToken, async (req, res) => {
  try {
    const response = await axios.post(`${PRODUCT_SERVICE_URL}/products`, req.body);
    res.status(201).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Failed to create product'
    });
  }
});

app.put('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const response = await axios.put(`${PRODUCT_SERVICE_URL}/products/${req.params.id}`, req.body);
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Failed to update product'
    });
  }
});

app.delete('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const response = await axios.delete(`${PRODUCT_SERVICE_URL}/products/${req.params.id}`);
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Failed to delete product'
    });
  }
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});
