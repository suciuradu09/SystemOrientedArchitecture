# Tutorial: Securing a REST API with JWT Authentication

## Introduction

This tutorial demonstrates how to secure a REST API using JSON Web Tokens (JWT) in a microservices architecture. We'll walk through a working example from our SOA system, showing how the API Gateway implements authentication and authorization to protect microservice endpoints.

## Prerequisites

- Basic understanding of REST APIs
- Familiarity with Node.js and Express
- Understanding of HTTP authentication concepts

## Overview

Our system implements JWT-based authentication at the API Gateway level, providing a centralized security layer that protects all microservice endpoints. This approach offers several advantages:

1. **Centralized Security**: All authentication logic is in one place
2. **Stateless**: JWT tokens don't require server-side session storage
3. **Scalable**: Works seamlessly across multiple service instances
4. **Flexible**: Easy to add role-based access control

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Client    │────────>│ API Gateway  │────────>│ Microservice│
│             │  JWT    │  (Auth)      │  Valid  │             │
└─────────────┘  Token  └──────────────┘  Token  └─────────────┘
```

## Implementation Steps

### Step 1: User Registration and Login

The authentication flow starts when a user registers or logs in through the User Service. Let's examine the login endpoint:

**File: `services/user-service/index.js`**

```javascript
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user and verify password
    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
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
    
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});
```

**Key Points:**
- Passwords are hashed using bcrypt before storage
- JWT token contains user ID and email (payload)
- Token expires in 24 hours
- Secret key is used to sign the token

### Step 2: API Gateway Authentication Middleware

The API Gateway implements an authentication middleware that validates JWT tokens for protected endpoints:

**File: `api-gateway/index.js`**

```javascript
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Extract token from "Bearer <token>"
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user; // Attach user info to request
    next();
  });
};
```

**How it works:**
1. Extracts the token from the `Authorization` header (format: `Bearer <token>`)
2. Verifies the token signature using the secret key
3. Checks token expiration
4. Attaches decoded user information to the request object
5. Calls `next()` to proceed to the route handler

### Step 3: Protecting Endpoints

Protected endpoints use the authentication middleware:

```javascript
// Protected endpoint example
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    // req.user contains { userId, email } from the JWT token
    const response = await axios.get(`${ORDER_SERVICE_URL}/orders`, {
      headers: { 'Authorization': req.headers['authorization'] },
      params: { userId: req.user.userId }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});
```

**Security Features:**
- Only authenticated users can access protected endpoints
- User ID is automatically extracted from the token
- Token is forwarded to microservices for additional validation if needed

### Step 4: Client-Side Implementation

The web application stores the token and includes it in API requests:

**File: `web-app/src/App.js`**

```javascript
// After successful login
localStorage.setItem('token', response.data.token);
localStorage.setItem('user', JSON.stringify(response.data.user));

// Making authenticated requests
const token = localStorage.getItem('token');
const response = await axios.get(`${API_URL}/api/orders`, {
  headers: { Authorization: `Bearer ${token}` }
});
```

## Security Best Practices Implemented

### 1. Password Hashing
```javascript
const hashedPassword = await bcrypt.hash(password, 10);
```
- Passwords are never stored in plain text
- Uses bcrypt with salt rounds for secure hashing

### 2. Token Expiration
```javascript
{ expiresIn: '24h' }
```
- Tokens expire after 24 hours, requiring re-authentication
- Reduces risk if a token is compromised

### 3. Rate Limiting
```javascript
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);
```
- Prevents brute force attacks
- Limits requests per IP address

### 4. Security Headers
```javascript
app.use(helmet());
```
- Helmet.js adds security headers (X-Content-Type-Options, X-Frame-Options, etc.)
- Protects against common web vulnerabilities

### 5. CORS Configuration
```javascript
app.use(cors());
```
- Controls which origins can access the API
- Prevents unauthorized cross-origin requests

## Testing the Implementation

### 1. Register a New User
```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"secure123","name":"John Doe"}'
```

### 2. Login and Get Token
```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"secure123"}'
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

### 3. Access Protected Endpoint
```bash
curl -X GET http://localhost:8080/api/orders \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### 4. Test Without Token (Should Fail)
```bash
curl -X GET http://localhost:8080/api/orders
```

Response:
```json
{
  "error": "Access token required"
}
```

## Advanced Features

### Token Refresh (Future Enhancement)

For production systems, consider implementing token refresh:

```javascript
// Generate refresh token (longer expiration)
const refreshToken = jwt.sign(
  { userId: user.id },
  REFRESH_SECRET,
  { expiresIn: '7d' }
);

// Store refresh token securely (e.g., HttpOnly cookie)
res.cookie('refreshToken', refreshToken, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict'
});
```

### Role-Based Access Control (RBAC)

Extend JWT payload to include roles:

```javascript
const token = jwt.sign(
  { 
    userId: user.id, 
    email: user.email,
    roles: ['user', 'admin'] // Add roles
  },
  JWT_SECRET,
  { expiresIn: '24h' }
);

// Middleware for role checking
const requireRole = (role) => {
  return (req, res, next) => {
    if (!req.user.roles.includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

// Usage
app.delete('/api/users/:id', authenticateToken, requireRole('admin'), ...);
```

## Common Security Issues and Solutions

### Issue 1: Token Storage
**Problem**: Storing tokens in localStorage is vulnerable to XSS attacks.

**Solution**: Use HttpOnly cookies for sensitive applications:
```javascript
res.cookie('token', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict'
});
```

### Issue 2: Token Theft
**Problem**: Tokens can be intercepted if transmitted over HTTP.

**Solution**: Always use HTTPS in production. Our Docker setup can be extended with SSL/TLS termination at the Nginx level.

### Issue 3: Secret Key Management
**Problem**: Hardcoded secrets in code.

**Solution**: Use environment variables:
```javascript
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-for-dev-only';
```

## Conclusion

This tutorial demonstrated how to secure a REST API using JWT authentication in a microservices architecture. The implementation provides:

- ✅ Secure user authentication
- ✅ Protected API endpoints
- ✅ Stateless authentication
- ✅ Scalable architecture
- ✅ Security best practices

The complete working example is available in our public repository. You can clone it, run `docker-compose up`, and test the authentication flow yourself.

## References

- [JWT.io](https://jwt.io/) - JWT specification and debugging tools
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)

## Repository

The complete source code is available at:
```
https://github.com/your-username/soa-system
```

To run the system:
```bash
git clone https://github.com/your-username/soa-system
cd soa-system
docker-compose up -d
```

Access the web application at `http://localhost:3000` and test the authentication flow.
