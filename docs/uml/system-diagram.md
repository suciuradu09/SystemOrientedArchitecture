# UML System Diagrams

## Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Web Application                         │
│                  (Micro Frontend Architecture)               │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/WebSocket
                         │
┌────────────────────────▼────────────────────────────────────┐
│                      Nginx Load Balancer                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ HTTP/WebSocket
                         │
┌────────────────────────▼────────────────────────────────────┐
│                      API Gateway                             │
│                  (Secured REST API)                          │
└─────┬────────┬────────┬────────┬────────────────────────────┘
      │        │        │        │
      │        │        │        │ HTTP
      │        │        │        │
┌─────▼──┐ ┌───▼───┐ ┌─▼────┐ ┌─▼──────┐
│ User   │ │ Order │ │ Notif│ │Payment │
│Service │ │Service│ │Service│ │Service │
└────┬───┘ └───┬───┘ └─┬────┘ └─┬──────┘
     │         │       │        │
     │         │       │        │
     └─────────┴───────┴────────┘
              │        │        │
              │        │        │
     ┌────────▼──┐ ┌───▼───┐ ┌─▼────┐
     │ RabbitMQ  │ │ Kafka │ │Redis │
     │(Message   │ │(Event │ │(Cache│
     │ Broker)   │ │Stream)│ │/PubSub│
     └───────────┘ └───────┘ └──────┘
```

## Sequence Diagram - Order Creation Flow

```
User        Web App    API Gateway  Order Service  Payment Service  RabbitMQ  Kafka  Notification Service
 │            │            │             │               │             │         │            │
 │──POST /api/orders───────────────────────────────────────────────────────────────────────────>│
 │            │            │             │               │             │         │            │
 │            │            │──POST /orders─────────────────────────────────────────────────────>│
 │            │            │             │               │             │         │            │
 │            │            │             │──Publish to Queue───────────────────────────────────>│
 │            │            │             │               │             │         │            │
 │            │            │             │──Publish Event───────────────────────────────────────>│
 │            │            │             │               │             │         │            │
 │            │            │             │               │──Consume Message─────────────────────>│
 │            │            │             │               │             │         │            │
 │            │            │             │               │──Process Payment─────────────────────>│
 │            │            │             │               │             │         │            │
 │            │            │             │<──Payment Processed───────────────────────────────────│
 │            │            │             │               │             │         │            │
 │            │            │             │──Publish Event───────────────────────────────────────>│
 │            │            │             │               │             │         │            │
 │            │            │             │               │             │         │<──Consume Event──│
 │            │            │             │               │             │         │            │
 │            │            │             │               │             │         │            │──Send Notification──>│
 │            │            │             │               │             │         │            │
 │<──Response─────────────────────────────────────────────────────────────────────────────────────│
```

## Class Diagram - Microservices Structure

```
┌─────────────────────────────────┐
│        API Gateway               │
├─────────────────────────────────┤
│ + authenticateToken()           │
│ + routeRequest()                │
│ + rateLimit()                   │
└────────────┬────────────────────┘
             │
             │ uses
             │
┌────────────▼────────────────────┐
│      User Service               │
├─────────────────────────────────┤
│ - users: Array                  │
│ - redisClient: Redis            │
│ - rabbitmqChannel: Channel      │
│ - kafkaProducer: Producer       │
├─────────────────────────────────┤
│ + register()                    │
│ + login()                       │
│ + getUser()                     │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│      Order Service              │
├─────────────────────────────────┤
│ - orders: Array                 │
│ - rabbitmqChannel: Channel      │
│ - kafkaProducer: Producer       │
├─────────────────────────────────┤
│ + createOrder()                 │
│ + getOrders()                   │
│ + getOrder()                    │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│   Notification Service          │
├─────────────────────────────────┤
│ - connections: Map               │
│ - notifications: Array           │
│ - wss: WebSocketServer          │
│ - redisClient: Redis            │
├─────────────────────────────────┤
│ + createNotification()          │
│ + broadcastNotification()       │
│ + handleWebSocket()             │
└─────────────────────────────────┘
```

## Deployment Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Host                              │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Container  │  │   Container  │  │   Container  │      │
│  │  API Gateway │  │  User Service│  │ Order Service│      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Container  │  │   Container  │  │   Container  │      │
│  │Notification │  │Payment Service│  │   Web App    │      │
│  │   Service   │  │               │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Container  │  │   Container  │  │   Container  │      │
│  │   RabbitMQ   │  │    Kafka     │  │    Redis     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │   Container  │  │   Container  │                        │
│  │    Nginx     │  │     FaaS     │                        │
│  └──────────────┘  └──────────────┘                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```
