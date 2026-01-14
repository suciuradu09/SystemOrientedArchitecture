# System Architecture Documentation

## Overview

This document describes the architecture of the Service-Oriented Architecture (SOA) system, including all components, their interactions, and design decisions.

## System Components

### 1. API Gateway
- **Purpose**: Single entry point for all client requests
- **Technology**: Node.js/Express
- **Features**:
  - JWT-based authentication
  - Request routing to microservices
  - Rate limiting
  - Security headers (Helmet)
  - CORS handling

### 2. Microservices

#### User Service (Port 3001)
- User registration and authentication
- JWT token generation
- User profile management
- Integrates with RabbitMQ, Kafka, and Redis

#### Order Service (Port 3002)
- Order creation and management
- Order status tracking
- Communicates with Payment Service via RabbitMQ
- Publishes events to Kafka

#### Notification Service (Port 3003)
- Real-time notifications via WebSocket
- Notification history
- Redis pub/sub for scalable WebSocket distribution
- Consumes events from Kafka

#### Payment Service (Port 3004)
- Payment processing
- Payment status management
- Consumes payment requests from RabbitMQ
- Publishes payment events to Kafka

### 3. Communication Infrastructure

#### RabbitMQ (Message Broker)
- **Queues**:
  - `user.created`: User creation events
  - `order.created`: Order creation events
  - `order.payment.processed`: Payment completion events
  - `payment.request`: Payment processing requests
  - `notifications`: Notification messages

#### Kafka (Event Streaming)
- **Topics**:
  - `user-events`: User-related events
  - `order-events`: Order-related events
  - `payment-events`: Payment-related events

#### Redis
- Caching layer for user data
- Pub/sub for WebSocket scaling
- Session management

### 4. Load Balancer (Nginx)
- Load balancing for API Gateway instances
- WebSocket support with sticky sessions
- Rate limiting
- Health checks

### 5. FaaS (Function as a Service)
- Serverless function execution
- Built-in functions: calculate-total, format-order, validate-email
- Dynamic function registration

### 6. Web Application
- React-based micro frontend architecture
- Consumes REST APIs
- Real-time notifications via WebSocket
- Micro frontends:
  - Authentication Micro Frontend
  - Orders Micro Frontend
  - Notifications Micro Frontend

## Communication Patterns

### Synchronous Communication
- REST API calls through API Gateway
- Direct HTTP calls between services (when needed)

### Asynchronous Communication
- **RabbitMQ**: Point-to-point messaging, request/response patterns
- **Kafka**: Event streaming, pub/sub patterns

### Real-time Communication
- WebSocket connections for server-side notifications
- Redis pub/sub for scaling WebSocket across instances

## Security

1. **JWT Authentication**: All protected endpoints require valid JWT tokens
2. **Rate Limiting**: Prevents abuse at API Gateway level
3. **Security Headers**: Helmet.js for security headers
4. **CORS**: Configured for web application

## Scalability

1. **Load Balancing**: Nginx distributes requests across multiple API Gateway instances
2. **Redis Pub/Sub**: Enables WebSocket scaling across multiple Notification Service instances
3. **Message Queues**: Decouple services for independent scaling
4. **Event Streaming**: Kafka enables event-driven architecture for scalability

## Deployment

All services are containerized using Docker and orchestrated with Docker Compose. Each service can be scaled independently by running multiple container instances.
