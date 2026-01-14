Securing a REST API with JWT Authentication

This tutorial explains how to secure a REST API using JSON Web Tokens (JWT) in a microservices-based Service-Oriented Architecture (SOA). The implementation is taken directly from the ShopHub project and demonstrates a production-ready authentication flow centralized at the API Gateway.
1. User Registration and JWT Generation
User registration is handled by the User Service. Passwords are validated and securely hashed using bcrypt before being stored in the database. After successful registration, a JWT token is generated and returned to the client.

app.post('/register', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const result = await pool.query(
    'INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id, email, name',
    [email, hashedPassword, name || email]
  );

  const token = jwt.sign(
    { userId: result.rows[0].id, email: result.rows[0].email },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.status(201).json({ token });
});

2. User Login
During login, the system verifies the user credentials by comparing the provided password with the stored bcrypt hash. If authentication is successful, a new JWT token is issued.

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const result = await pool.query(
    'SELECT id, email, password FROM users WHERE email = $1',
    [email]
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const isValid = await bcrypt.compare(password, result.rows[0].password);

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { userId: result.rows[0].id, email: result.rows[0].email },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ token });
});

3. API Gateway Authentication Middleware
The API Gateway validates JWT tokens for all protected routes. If the token is missing, invalid, or expired, access is denied.

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

4. Protecting API Endpoints
Endpoints are protected using the authentication middleware. The user identity is extracted directly from the JWT token, preventing impersonation.

app.get('/api/orders', authenticateToken, async (req, res) => {
  const response = await axios.get(
    `${ORDER_SERVICE_URL}/orders`,
    { params: { userId: req.user.userId } }
  );
  res.json(response.data);
});

5. Client-Side Token Usage
The frontend application stores the JWT token and includes it in the Authorization header for all protected API requests.

localStorage.setItem('token', response.data.token);

axios.get('/api/orders', {
  headers: {
    Authorization: `Bearer ${localStorage.getItem('token')}`
  }
});

6. Conclusion
This tutorial demonstrated a complete JWT-based authentication flow implemented in a microservices architecture. The solution is secure, scalable, and follows industry best practices.