import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './index.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';
const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:3003';

// Auth Micro Frontend
const AuthMicroFrontend = ({ onAuthSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const data = isLogin ? { email, password } : { email, password, name };
      
      const response = await axios.post(`${API_URL}${endpoint}`, data);
      
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        
        if (isLogin) {
          setMessage('✅ Login successful! Redirecting to dashboard...');
        } else {
          setMessage('✅ Registration successful! You are now logged in. Redirecting to dashboard...');
        }
        
        // Call the auth success callback to update parent state
        if (onAuthSuccess) {
          setTimeout(() => {
            onAuthSuccess();
          }, 800);
        } else {
          // Fallback: reload page
          setTimeout(() => {
            window.location.href = '/';
            window.location.reload();
          }, 800);
        }
      } else {
        setMessage('Registration successful, but no token received. Please login.');
      }
    } catch (error) {
      setMessage(error.response?.data?.error || 'An error occurred');
    }
  };

  return (
    <div className="micro-frontend">
      <h3>Authentication Micro Frontend</h3>
      <form onSubmit={handleSubmit}>
        {!isLogin && (
          <div className="form-group">
            <label>Name:</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
        )}
        <div className="form-group">
          <label>Email:</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>Password:</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary">
          {isLogin ? 'Login' : 'Register'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setIsLogin(!isLogin)}
          style={{ marginLeft: '10px' }}
        >
          {isLogin ? 'Switch to Register' : 'Switch to Login'}
        </button>
      </form>
      {message && <div className={`notification ${message.includes('Success') ? 'success' : 'error'}`}>{message}</div>}
    </div>
  );
};

// Products Micro Frontend
const ProductsMicroFrontend = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newProduct, setNewProduct] = useState({ name: '', description: '', price: '', stock: '' });

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/products`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProducts(response.data);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_URL}/api/products`, {
        name: newProduct.name,
        description: newProduct.description,
        price: parseFloat(newProduct.price),
        stock: parseInt(newProduct.stock) || 0
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setNewProduct({ name: '', description: '', price: '', stock: '' });
      setProducts(prev => [response.data, ...prev]);
    } catch (error) {
      console.error('Failed to create product:', error);
      alert('Failed to create product: ' + (error.response?.data?.error || error.message));
    }
  };

  if (loading) return <div className="loading">🔄 Loading products...</div>;

  return (
    <div className="micro-frontend">
      <h3>Products Management</h3>
      <form onSubmit={handleCreateProduct} style={{ marginBottom: '20px' }}>
        <div className="form-group">
          <label>Product Name:</label>
          <input
            type="text"
            value={newProduct.name}
            onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label>Description:</label>
          <textarea
            value={newProduct.description}
            onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
            rows="2"
          />
        </div>
        <div className="form-group">
          <label>Price:</label>
          <input
            type="number"
            step="0.01"
            value={newProduct.price}
            onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label>Stock:</label>
          <input
            type="number"
            value={newProduct.stock}
            onChange={(e) => setNewProduct({ ...newProduct, stock: e.target.value })}
          />
        </div>
        <button type="submit" className="btn btn-primary">Create Product</button>
      </form>
      <div>
        <h4>All Products:</h4>
        {products.length === 0 ? (
          <p>No products yet. Create one above!</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '10px' }}>
            {products.map(product => (
              <div key={product.id} className="order-item" style={{ padding: '15px' }}>
                <strong>{product.name}</strong>
                <p style={{ margin: '5px 0', fontSize: '0.9em' }}>{product.description}</p>
                <p style={{ margin: '5px 0' }}><strong>${product.price.toFixed(2)}</strong></p>
                <small>Stock: {product.stock}</small>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Orders Micro Frontend with Shopping Cart
const OrdersMicroFrontend = () => {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
    fetchProducts();
  }, []);

  const fetchOrders = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOrders(response.data);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/products`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProducts(response.data);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    }
  };

  const addToCart = (product) => {
    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
      setCart(cart.map(item =>
        item.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.id !== productId));
  };

  const updateCartQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId);
    } else {
      setCart(cart.map(item =>
        item.id === productId
          ? { ...item, quantity: quantity }
          : item
      ));
    }
  };

  const getCartTotal = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const handlePlaceOrder = async () => {
    if (cart.length === 0) {
      alert('Your cart is empty!');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const items = cart.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price
      }));
      const totalAmount = getCartTotal();

      const response = await axios.post(`${API_URL}/api/orders`, {
        items,
        totalAmount
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setCart([]);
      if (response.data) {
        setOrders(prev => [response.data, ...prev]);
      }
      setTimeout(() => fetchOrders(), 500);
      alert('Order placed successfully! Check notifications for confirmation.');
    } catch (error) {
      console.error('Failed to place order:', error);
      alert('Failed to place order: ' + (error.response?.data?.error || error.message));
    }
  };

  if (loading) return <div className="loading">🔄 Loading orders...</div>;

  return (
    <div className="micro-frontend">
      <h3>Orders & Shopping Cart</h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <div>
          <h4>Available Products</h4>
          {products.length === 0 ? (
            <p>No products available. Create products in the Dashboard!</p>
          ) : (
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {products.map(product => (
                <div key={product.id} className="order-item" style={{ marginBottom: '10px' }}>
                  <strong>{product.name}</strong>
                  <p style={{ margin: '5px 0', fontSize: '0.9em' }}>{product.description}</p>
                  <p style={{ margin: '5px 0' }}><strong>${product.price.toFixed(2)}</strong></p>
                  <button
                    onClick={() => addToCart(product)}
                    className="btn btn-primary"
                    style={{ marginTop: '5px', fontSize: '0.9em' }}
                  >
                    Add to Cart
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h4>Shopping Cart</h4>
          {cart.length === 0 ? (
            <p>Your cart is empty. Add products from the left!</p>
          ) : (
            <>
              <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '10px' }}>
                {cart.map(item => (
                  <div key={item.id} className="order-item" style={{ marginBottom: '10px' }}>
                    <strong>{item.name}</strong>
                    <div className="quantity-control" style={{ marginTop: '8px' }}>
                      <button
                        onClick={() => updateCartQuantity(item.id, item.quantity - 1)}
                        className="quantity-btn"
                      >
                        −
                      </button>
                      <span style={{ fontWeight: '600', minWidth: '60px', textAlign: 'center' }}>Qty: {item.quantity}</span>
                      <button
                        onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
                        className="quantity-btn"
                      >
                        +
                      </button>
                      <span style={{ marginLeft: 'auto', fontWeight: '700', color: '#667eea', fontSize: '1.1em' }}>
                        ${(item.price * item.quantity).toFixed(2)}
                      </span>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="btn btn-danger"
                        style={{ padding: '6px 12px', fontSize: '0.75em', marginLeft: '10px' }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="cart-total-section">
                <div className="cart-total">
                  Total: ${getCartTotal().toFixed(2)}
                </div>
                <button
                  onClick={handlePlaceOrder}
                  className="btn btn-success"
                  style={{ width: '100%', marginTop: '15px', fontSize: '1.1rem', padding: '15px' }}
                >
                  🛒 Place Order
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: '20px' }}>
        <h4>Your Orders:</h4>
        {orders.length === 0 ? (
          <p>No orders yet</p>
        ) : (
          orders.map(order => (
            <div key={order.id} className="order-item">
              <strong>Order #{order.id}</strong> - ${order.totalAmount} - Status: {order.status}
              <br />
              <small>{new Date(order.createdAt).toLocaleString()}</small>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Notifications Micro Frontend
const NotificationsMicroFrontend = () => {
  const [notifications, setNotifications] = useState([]);
  const [ws, setWs] = useState(null);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user.id) return;

    // Fetch existing notifications
    const fetchNotifications = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_URL}/api/notifications`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { userId: user.id }
        });
        setNotifications(response.data);
      } catch (error) {
        console.error('Failed to fetch notifications:', error);
      }
    };

    fetchNotifications();

    // Connect to WebSocket
    const websocket = new WebSocket(WS_URL);
    
    websocket.onopen = () => {
      websocket.send(JSON.stringify({
        type: 'subscribe',
        userId: user.id
      }));
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'notification') {
        setNotifications(prev => [data.data, ...prev]);
      } else if (data.type === 'notifications') {
        setNotifications(data.data);
      }
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    setWs(websocket);

    return () => {
      websocket.close();
    };
  }, []);

  return (
    <div className="micro-frontend">
      <h3>Notifications</h3>
      <div className="notification-list">
        {notifications.length === 0 ? (
          <p>No notifications</p>
        ) : (
          notifications.map(notif => (
            <div key={notif.id} className="notification">
              <strong>{notif.title}</strong>
              <p>{notif.message}</p>
              <small>{new Date(notif.createdAt).toLocaleString()}</small>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Main App Component
const Dashboard = () => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  return (
    <div className="container">
      <div className="header">
        <div className="header-content">
          <div className="logo-section">
            <h1 className="app-title">🛍️ ShopHub</h1>
            <p className="app-subtitle">Modern E-Commerce Platform</p>
          </div>
          <div className="user-greeting">
            <span className="welcome-text">Welcome back,</span>
            <span className="user-name">{user.name || user.email || 'Guest'}</span>
          </div>
        </div>
        <div className="nav">
          <Link to="/">Dashboard</Link>
          <Link to="/orders">Orders</Link>
          <Link to="/notifications">Notifications</Link>
          <button
            className="btn"
            onClick={() => {
              localStorage.removeItem('token');
              localStorage.removeItem('user');
              window.location.reload();
            }}
            style={{ marginLeft: 'auto' }}
          >
            Logout
          </button>
        </div>
      </div>

      <Routes>
        <Route path="/" element={
          <div>
            <ProductsMicroFrontend />
            <NotificationsMicroFrontend />
          </div>
        } />
        <Route path="/orders" element={<OrdersMicroFrontend />} />
        <Route path="/notifications" element={<NotificationsMicroFrontend />} />
      </Routes>
    </div>
  );
};

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
  }, []);

  const handleAuthSuccess = () => {
    setIsAuthenticated(true);
  };

  if (!isAuthenticated) {
    return (
      <div className="container">
        <div className="header">
          <div className="header-content">
            <div className="logo-section">
              <h1 className="app-title">🛍️ ShopHub</h1>
              <p className="app-subtitle">Modern E-Commerce Platform</p>
            </div>
          </div>
        </div>
        <AuthMicroFrontend onAuthSuccess={handleAuthSuccess} />
      </div>
    );
  }

  return (
    <Router>
      <Dashboard />
    </Router>
  );
};

export default App;
