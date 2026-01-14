const express = require('express');
const app = express();
const PORT = process.env.PORT || 3005;

app.use(express.json());

// Function registry
const functions = {};

// Register a function
app.post('/functions/register', (req, res) => {
  const { name, handler } = req.body;
  if (!name || !handler) {
    return res.status(400).json({ error: 'Function name and handler required' });
  }
  functions[name] = handler;
  res.json({ message: `Function ${name} registered successfully` });
});

// Invoke a function
app.post('/functions/invoke/:name', async (req, res) => {
  const functionName = req.params.name;
  const functionHandler = functions[functionName];
  
  if (!functionHandler) {
    return res.status(404).json({ error: `Function ${functionName} not found` });
  }
  
  try {
    // In a real FaaS, this would execute the function in an isolated environment
    const result = await eval(`(${functionHandler})(req.body)`);
    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Built-in functions
functions['calculate-total'] = (data) => {
  const { items } = data;
  return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
};

functions['format-order'] = (data) => {
  const { order } = data;
  return {
    id: order.id,
    total: order.totalAmount,
    formattedDate: new Date(order.createdAt).toLocaleString(),
    itemCount: order.items.length
  };
};

functions['validate-email'] = (data) => {
  const { email } = data;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return { valid: emailRegex.test(email) };
};

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'faas', functions: Object.keys(functions) });
});

app.listen(PORT, () => {
  console.log(`FaaS Server running on port ${PORT}`);
});
