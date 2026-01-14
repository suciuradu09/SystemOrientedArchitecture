# Service-Oriented Architecture System

A comprehensive microservices-based system demonstrating various SOA patterns and technologies.

## Architecture Overview

This system consists of:
- **API Gateway**: Secured REST API server
- **Microservices**: User Service, Order Service, Notification Service, Payment Service
- **Message Broker**: RabbitMQ for async communication
- **Event Streaming**: Kafka for event streaming
- **FaaS**: Serverless functions for on-demand processing
- **Web Application**: Micro frontend architecture consuming REST services
- **Load Balancer**: Nginx for scalability
- **Containerization**: Docker and Docker Compose

## System Components

### API Gateway
- Exposes secured REST endpoints
- JWT-based authentication
- Routes requests to appropriate microservices

### Microservices
1. **User Service**: User management and authentication
2. **Order Service**: Order processing
3. **Notification Service**: Real-time notifications
4. **Payment Service**: Payment processing

### Communication
- **RabbitMQ**: Message broker for async communication between services
- **Kafka**: Event streaming for event-driven architecture
- **REST**: Synchronous communication via API Gateway

### Web Application
- Micro frontend architecture
- Consumes REST APIs
- Receives server-side notifications via WebSocket

## Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)
- Git

## Quick Start

1. Clone the repository
2. Start all services:
   ```bash
   docker-compose up -d
   ```
3. Access the web application at `http://localhost:3000`
4. API Gateway is available at `http://localhost:8080`

## Documentation

- [Architecture Documentation](./docs/architecture.md)
- [UML Diagrams](./docs/uml/)
- [C4 Models](./docs/c4/)
- [Tutorial: Securing REST API](./docs/tutorial-securing-rest-api.md)

## Project Structure

```
.
├── api-gateway/          # API Gateway service
├── services/             # Microservices
│   ├── user-service/
│   ├── order-service/
│   ├── notification-service/
│   └── payment-service/
├── web-app/              # Web application (micro frontend)
├── faas/                 # Serverless functions
├── nginx/                # Load balancer configuration
├── docs/                 # Documentation
├── docker-compose.yml    # Docker Compose configuration
└── README.md
```
