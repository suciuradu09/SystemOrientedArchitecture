# Payment Service - Purpose and Usage

## Overview

The Payment Service is a microservice responsible for processing payments for orders in the SOA system. It demonstrates asynchronous communication patterns using RabbitMQ and event streaming with Kafka.

## Main Functions

### 1. **Process Payments for Orders**
When an order is created, the Payment Service automatically processes the payment asynchronously:
- Receives payment requests via RabbitMQ message queue
- Processes the payment (simulated in this demo)
- Stores payment records in PostgreSQL database
- Updates the order status to "paid"

### 2. **Direct Payment Processing**
The service also exposes a REST API endpoint for direct payment processing:
- `POST /payments` - Process a payment directly via API call
- `GET /payments/:id` - Retrieve payment information by ID

### 3. **Event Publishing**
After processing a payment, the service:
- Publishes payment completion events to Kafka (`payment-events` topic)
- Sends messages to RabbitMQ to update order status
- Enables other services to react to payment events

## How It Works in the System

### Automatic Payment Flow (When Order is Created)

```
1. User creates order → Order Service
2. Order Service sends message to RabbitMQ queue: "payment.request"
3. Payment Service consumes the message
4. Payment Service processes payment and saves to database
5. Payment Service sends message: "order.payment.processed"
6. Order Service receives message and updates order status to "paid"
7. Payment Service publishes event to Kafka: "payment.completed"
```

### Payment Processing Steps

1. **Receive Payment Request** (via RabbitMQ or direct API)
   - Order ID
   - User ID
   - Amount
   - Payment Method (optional, defaults to 'credit_card')

2. **Process Payment**
   - Validates required fields
   - Creates payment record in database
   - Sets status to 'completed' (simulated - in production would integrate with payment gateway)

3. **Notify Other Services**
   - Sends `order.payment.processed` message to RabbitMQ
   - Publishes `payment.completed` event to Kafka
   - Order Service updates order status automatically

4. **Store Payment Record**
   - Payment ID
   - Order ID (linked to order)
   - User ID
   - Amount
   - Payment Method
   - Status
   - Timestamp

## Database Schema

The Payment Service stores data in the `payments` table:

```sql
CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  payment_method VARCHAR(50) DEFAULT 'credit_card',
  status VARCHAR(50) DEFAULT 'completed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## API Endpoints

### Process Payment (Direct)
```http
POST http://localhost:8081/api/payments
Authorization: Bearer <token>
Content-Type: application/json

{
  "orderId": 1,
  "userId": 1,
  "amount": 99.99,
  "paymentMethod": "credit_card"
}
```

### Get Payment by ID
```http
GET http://localhost:8081/api/payments/1
Authorization: Bearer <token>
```

## Integration Points

### With Order Service
- **Receives**: Payment requests via RabbitMQ (`payment.request` queue)
- **Sends**: Payment processed notifications via RabbitMQ (`order.payment.processed` queue)
- **Result**: Order status automatically updated from "pending" to "paid"

### With Kafka
- **Publishes**: Payment events to `payment-events` topic
- **Event Type**: `payment.completed`
- **Data**: Payment ID, Order ID, User ID, Amount, Timestamp

### With Database
- **Stores**: All payment transactions
- **Links**: Payments to orders via `order_id` foreign key
- **Tracks**: Payment history for users

## Use Cases

1. **E-commerce Checkout**: Process payments when customers complete orders
2. **Order Fulfillment**: Trigger order fulfillment after payment confirmation
3. **Financial Reporting**: Track all payment transactions
4. **Audit Trail**: Maintain payment history for compliance
5. **Refund Processing**: (Future enhancement) Process refunds for orders

## Current Implementation

- ✅ Asynchronous payment processing via RabbitMQ
- ✅ Direct payment API endpoint
- ✅ Payment storage in PostgreSQL
- ✅ Event streaming to Kafka
- ✅ Automatic order status updates
- ⚠️ Simulated payment processing (no real payment gateway integration)

## Future Enhancements

- Integration with real payment gateways (Stripe, PayPal, etc.)
- Payment method validation
- Refund processing
- Payment status tracking (pending, processing, completed, failed)
- Payment retry logic
- Fraud detection
- Payment webhooks

## Testing the Payment Service

### View Payments in Database
```sql
-- In pgAdmin or psql
SELECT * FROM payments ORDER BY created_at DESC;

-- View payments with order details
SELECT 
  p.id as payment_id,
  p.amount,
  p.payment_method,
  p.status,
  o.id as order_id,
  o.total_amount,
  o.status as order_status,
  u.email
FROM payments p
JOIN orders o ON p.order_id = o.id
JOIN users u ON p.user_id = u.id
ORDER BY p.created_at DESC;
```

### Test via API
```bash
# Process payment directly
curl -X POST http://localhost:8081/api/payments \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": 1,
    "userId": 1,
    "amount": 99.99,
    "paymentMethod": "credit_card"
  }'
```

## Summary

The Payment Service is a critical component that:
- **Decouples** payment processing from order creation
- **Enables** asynchronous processing for better performance
- **Maintains** payment records for audit and reporting
- **Integrates** with other services via message queues and event streaming
- **Demonstrates** microservices communication patterns (RabbitMQ, Kafka)

It's automatically triggered when orders are created, ensuring payments are processed without blocking the order creation flow.
