# Notification Service Microservice

<div align="center">

[![Docker Build](https://github.com/iYoNuttxD/notification-service-microservice/actions/workflows/docker-build-and-publish.yml/badge.svg)](https://github.com/iYoNuttxD/notification-service-microservice/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)

Microserviço de notificações multicanal para Click Delivery com suporte a Push (FCM), E-mail (SendGrid) e SMS (Twilio).

[Documentação da API](docs/openapi.yaml) • [Docker Hub](https://hub.docker.com/r/iyonuttxd/notification-service)

</div>

---

## 📋 Sumário

- [Visão Geral](#-visão-geral)
- [Arquitetura](#-arquitetura)
- [Stack Tecnológica](#-stack-tecnológica)
- [Funcionalidades](#-funcionalidades)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Início Rápido](#-início-rápido)
- [Configuração](#-configuração)
- [Eventos NATS](#-eventos-nats)
- [Templates](#-templates)
- [API Endpoints](#-api-endpoints)
- [Segurança e Autorização](#-segurança-e-autorização)
- [Métricas e Observabilidade](#-métricas-e-observabilidade)
- [Deploy](#-deploy)
- [Testes](#-testes)
- [LGPD](#-lgpd)
- [Troubleshooting](#-troubleshooting)
- [Roadmap](#-roadmap)

---

## 🎯 Visão Geral

O **Notification Service** é um microserviço robusto e escalável para gerenciamento de notificações multicanal, desenvolvido especificamente para a plataforma Click Delivery. Ele consome eventos de negócio via NATS e despacha notificações através de múltiplos canais com políticas inteligentes de fallback, retry e preferências de usuário.

### Características Principais

- **Multicanal**: Push (FCM), E-mail (SendGrid/SMTP) e SMS (Twilio)
- **Fallback Inteligente**: Tentativa automática em canais alternativos em caso de falha
- **Retry com Backoff**: Sistema exponencial de retentativas até 24h
- **Preferências de Usuário**: Controle granular por canal e tipo de evento
- **Idempotência**: Proteção contra duplicação de eventos
- **Métricas Prometheus**: Observabilidade completa
- **Clean Architecture**: Estrutura modular com Vertical Slices

---

## 🏗 Arquitetura

O serviço segue os princípios de **Clean Architecture** com **Vertical Slice Architecture** para melhor organização e manutenibilidade.

```
┌─────────────────────────────────────────────────────────────┐
│                     Notification Service                     │
├─────────────────────────────────────────────────────────────┤
│  API Layer (Express)                                         │
│  ├── POST /api/v1/notifications                             │
│  ├── GET  /api/v1/notifications/:id                         │
│  ├── GET  /api/v1/notifications                             │
│  └── PUT  /api/v1/preferences/:userId                       │
├─────────────────────────────────────────────────────────────┤
│  Use Cases Layer                                             │
│  ├── DispatchNotificationUseCase                            │
│  ├── RetryPendingUseCase                                    │
│  └── UpdatePreferencesUseCase                               │
├─────────────────────────────────────────────────────────────┤
│  Domain Layer                                                │
│  ├── Entities (Notification, Attempt, Template, Prefs)      │
│  └── Ports (Repository interfaces, Adapters)                │
├─────────────────────────────────────────────────────────────┤
│  Infrastructure Layer                                        │
│  ├── Repositories (MongoDB)                                 │
│  ├── NATS Event Bus                                         │
│  ├── Channel Senders (FCM, SendGrid, Twilio)                │
│  ├── Auth (JWT/JWKS)                                        │
│  └── OPA Client                                             │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
    MongoDB Atlas         NATS Server         External APIs
                                              (FCM, SendGrid, Twilio)
```

### Diagrama C4

O diagrama de arquitetura completo está disponível em [`C4Model3.drawio`](./C4Model3.drawio).

**Referências de Arquitetura:**
- Sistema de pedidos e entregas integrado com notificações multicanal
- Arquitetura de microserviços com comunicação via NATS
- Conformidade com padrões do ecossistema (orders-service, delivery-service)

---

## 🛠 Stack Tecnológica

### Core
- **Node.js 18+**: Runtime JavaScript
- **Express 4.x**: Framework web
- **MongoDB 7**: Banco de dados NoSQL

### Messaging & Events
- **NATS 2.10**: Message broker para eventos assíncronos
- **JetStream**: Suporte opcional para stream processing (configurável)

### Notification Providers
- **Firebase Cloud Messaging (FCM)**: Push notifications
- **SendGrid** (SMTP): Envio de e-mails
- **Twilio**: Envio de SMS

### Observability & Security
- **Winston**: Logging estruturado com mascaramento de PII
- **Prometheus** (prom-client): Métricas e monitoramento
- **Helmet**: Security headers
- **JWT/JWKS**: Autenticação
- **OPA**: Autorização baseada em políticas

### Templates & Validation
- **Handlebars**: Template engine
- **AJV**: Validação de schemas JSON

### DevOps
- **Docker**: Containerização
- **Docker Compose**: Ambiente de desenvolvimento
- **GitHub Actions**: CI/CD

---

## ✨ Funcionalidades

### 1. Notificações Multicanal

Envio de notificações através de múltiplos canais:

- **Push**: Via Firebase Cloud Messaging para dispositivos móveis
- **E-mail**: Via SendGrid com templates personalizados (HTML + texto plano)
- **SMS**: Via Twilio (priorizado para entregadores)

### 2. Política de Fallback

Sistema inteligente de fallback entre canais:

```
Push → E-mail → SMS (apenas para deliverer)
```

Se um canal falha, o sistema automaticamente tenta o próximo canal disponível.

### 3. Retry com Backoff Exponencial

Sistema de retentativa configurável com backoff exponencial:

```
5s → 25s → 2min → 10min → 30min → 2h → 6h → 24h
```

**SLA**: Tentativas por até 24 horas

#### Retry Scheduler

O serviço implementa duas estratégias de retry dependendo da configuração de JetStream:

- **Com JetStream habilitado (`NATS_JETSTREAM_ENABLED=true`)**: Utiliza a redelivery nativa do JetStream
- **Com JetStream desabilitado**: Executa um scheduler lightweight que periodicamente processa notificações pendentes

O `RetryScheduler` verifica a cada 30 segundos (configurável via `RETRY_SCHEDULER_INTERVAL_MS`) por notificações com:
- Status `RETRY` ou `QUEUED`
- `nextAttemptAt <= now`

Quando todas as tentativas são esgotadas, a notificação é enviada para o Dead Letter Queue (`notifications.dlq`).


### 4. Preferências de Usuário

Controle granular de preferências por:
- Canal (email, push, sms)
- Tipo de evento (orders.paid, delivery.assigned, etc)
- Quiet hours (horários de silêncio)
- Locale (pt-BR, en-US, etc)

### 5. Idempotência e Deduplicação

- **Idempotency Key**: Por `eventId + channel`
- **Deduplication Window**: 10 minutos (configurável)
- **Inbox Pattern**: Proteção contra processamento duplicado

### 6. Templates Dinâmicos

Templates Handlebars com variáveis dinâmicas:

```handlebars
Olá {{customerName}},

Seu pedido #{{orderId}} foi confirmado!
Valor: R$ {{amount}}
Restaurante: {{restaurantName}}
```

### 7. Retenção e Auditoria

- **TTL**: 90 dias para notificações e tentativas
- **Logs**: Mascaramento automático de PII
- **Tentativas**: Registro completo com duração e códigos de erro

### 8. Segurança

- **JWT**: Autenticação baseada em tokens
- **JWKS**: Suporte a chaves públicas rotativas
- **OPA**: Autorização baseada em políticas (fail-open configurável)
- **mTLS**: Suporte a mutual TLS (configurável)
- **Rate Limiting**: 100 req/15min por IP
- **PII Masking**: Mascaramento automático de emails, telefones e device tokens em logs

### 9. Índices e TTL

O serviço garante a criação automática de índices no startup através da função `ensureIndexes()`:

**Notifications:**
- `status + createdAt` (para queries de retry)
- `recipient.userId` (para busca por usuário)
- `idempotencyKey` (único, para dedupe)
- `metadata.orderId` (para rastreamento)
- `createdAt` com TTL de 90 dias (RETENTION_DAYS)

**Attempts:**
- `notificationId` (para buscar tentativas de uma notificação)
- `channel + provider` (para métricas)
- `startedAt` com TTL de 90 dias

**Inbox:**
- `eventId` (único, para dedupe)
- `processedAt` com TTL configurável (NOTIF_DEDUP_WINDOW_SEC)

**Templates:**
- `key + channel + locale` (único)

**Preferences:**
- `_id` (userId)
- `updatedAt`

Todos os índices são criados de forma idempotente, seguro para múltiplas execuções.

---

## 📂 Estrutura do Projeto

```
notification-service-microservice/
├── src/
│   ├── domain/                      # Camada de domínio
│   │   ├── entities/                # Entidades de negócio
│   │   │   ├── Notification.js
│   │   │   ├── Attempt.js
│   │   │   ├── Template.js
│   │   │   └── Preferences.js
│   │   ├── value-objects/           # Value objects
│   │   └── ports/                   # Interfaces/contratos
│   │
│   ├── infra/                       # Camada de infraestrutura
│   │   ├── repositories/            # Implementações MongoDB
│   │   │   ├── MongoNotificationRepository.js
│   │   │   ├── MongoAttemptRepository.js
│   │   │   ├── MongoTemplateRepository.js
│   │   │   ├── MongoPreferencesRepository.js
│   │   │   └── MongoInboxRepository.js
│   │   ├── adapters/
│   │   │   ├── nats/                # NATS event bus
│   │   │   ├── email/               # SendGrid sender
│   │   │   ├── sms/                 # Twilio sender
│   │   │   ├── push/                # FCM sender
│   │   │   ├── opa/                 # OPA client
│   │   │   └── auth/                # JWT verifier
│   │   ├── scheduler/
│   │   │   └── RetryScheduler.js    # Retry scheduler (quando JetStream desabilitado)
│   │   ├── db/
│   │   │   └── ensureIndexes.js     # Criação centralizada de índices
│   │   └── utils/
│   │       ├── logger.js            # Winston logger
│   │       ├── metrics.js           # Prometheus metrics
│   │       ├── backoff.js           # Backoff utilities
│   │       └── pii.js               # PII masking utilities
│   │
│   ├── features/                    # Vertical slices
│   │   ├── notifications/
│   │   │   ├── http/                # Controllers & routes
│   │   │   │   └── routes.js
│   │   │   └── use-cases/           # Business logic
│   │   │       ├── DispatchNotificationUseCase.js
│   │   │       ├── RetryPendingUseCase.js
│   │   │       ├── RenderTemplateUseCase.js
│   │   │       └── PublishStatusUseCase.js
│   │   ├── preferences/
│   │   │   ├── http/
│   │   │   │   └── routes.js
│   │   │   └── use-cases/
│   │   └── system/                  # System endpoints
│   │       └── http/
│   │           └── routes.js        # Health, metrics
│   │
│   └── main/                        # Entry point
│       ├── app.js                   # Express app with Swagger
│       ├── container.js             # DI container
│       ├── subscribers.js           # NATS subscribers
│       └── server.js                # Main server
│
├── tests/                           # Testes
│   ├── unit/                        # Testes unitários
│   └── integration/                 # Testes de integração
│
├── docs/                            # Documentação
│   ├── openapi.yaml                 # OpenAPI spec
│   └── schemas/                     # JSON schemas
│       └── event.schema.json
│
├── scripts/
│   └── seedTemplates.js             # Script para popular templates padrão
│
├── .github/
│   └── workflows/
│       └── docker-build-and-publish.yml
│
├── C4Model3.drawio                  # Diagrama C4 de arquitetura
├── docker-compose.dev.yml           # Docker Compose para dev
├── Dockerfile                       # Dockerfile de produção
├── .env.example                     # Exemplo de configuração
├── package.json
└── README.md
```

---

## 🚀 Início Rápido

### Pré-requisitos

- Node.js 18+ e npm
- Docker e Docker Compose
- MongoDB Atlas (ou local)
- Chaves de API: SendGrid, FCM, Twilio

### Desenvolvimento Local

1. **Clone o repositório**

```bash
git clone https://github.com/iYoNuttxD/notification-service-microservice.git
cd notification-service-microservice
```

2. **Instale as dependências**

```bash
npm install
```

3. **Configure as variáveis de ambiente**

```bash
cp .env.example .env
# Edite .env com suas credenciais
```

4. **Inicie com Docker Compose**

```bash
docker-compose -f docker-compose.dev.yml up -d
```

Serviços disponíveis:
- **API**: http://localhost:3003
- **Swagger UI**: http://localhost:3003/api-docs
- **Health**: http://localhost:3003/api/v1/health
- **Metrics**: http://localhost:3003/api/v1/metrics
- **MongoDB**: localhost:27017
- **NATS**: localhost:4222

**Nota sobre Swagger UI**: O Swagger UI está configurado com CSP relaxado apenas para a rota `/api-docs`. Todas as outras rotas mantêm configurações de segurança estritas do Helmet.

**Nota sobre `/api-docs` fallback**: Se o arquivo `docs/openapi.yaml` não estiver presente no artefato deployado, o endpoint `/api-docs` retornará uma resposta JSON informativa (HTTP 200) explicando que a especificação OpenAPI está ausente, em vez de retornar 404. Quando o arquivo está presente, o Swagger UI é exibido normalmente.

5. **Teste a API**

```bash
# Health check
curl http://localhost:3003/api/v1/health

# Criar uma notificação (modo dev sem auth)
curl -X POST http://localhost:3003/api/v1/notifications \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": {
      "userId": "user-123",
      "email": "test@example.com",
      "role": "customer"
    },
    "templateKey": "order_paid",
    "data": {
      "orderId": "12345",
      "customerName": "João Silva",
      "amount": "45.90",
      "restaurantName": "Pizza Express"
    }
  }'
```

---

## ⚙️ Configuração

### Variáveis de Ambiente

Consulte [`.env.example`](.env.example) para a lista completa. Principais configurações:

#### Core

```env
NODE_ENV=development
PORT=3003
LOG_LEVEL=info
METRICS_ENABLED=true
```

#### MongoDB

```env
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=notifications_db
```

#### NATS

```env
NATS_URL=nats://localhost:4222
NATS_JETSTREAM_ENABLED=false
NATS_SUBJECTS=orders.created,orders.paid,orders.canceled,delivery.assigned,...
NATS_QUEUE_GROUP=notification-service-workers
```

#### SendGrid (SMTP)

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=<your-sendgrid-api-key>
EMAIL_FROM=notifications@clickdelivery.com.br
```

**Configuração DNS**: Para garantir a deliverabilidade, configure os registros DNS do domínio:

- **SPF**: `v=spf1 include:sendgrid.net ~all`
- **DKIM**: Configure via painel do SendGrid
- **DMARC**: `v=DMARC1; p=quarantine; rua=mailto:dmarc@clickdelivery.com.br`

#### Firebase Cloud Messaging

```env
FCM_PROJECT_ID=your-firebase-project
FCM_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

#### Twilio

```env
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_FROM=+5511999999999
```

#### Autenticação e Autorização

```env
AUTH_JWT_ISSUER=https://auth.clickdelivery.com.br
AUTH_JWT_AUDIENCE=notification-service
AUTH_JWKS_URI=https://auth.clickdelivery.com.br/.well-known/jwks.json
AUTH_JWT_SECRET=<secret-for-dev>
AUTH_JWT_REQUIRED=true

OPA_URL=http://localhost:8181
OPA_POLICY_PATH=/v1/data/notifications/allow
OPA_FAIL_OPEN=true
```

#### Políticas

```env
NOTIF_MAX_ATTEMPTS_PER_CHANNEL=3
NOTIF_BACKOFF_SEQUENCE=5s,25s,120s,10m,30m,2h,6h,24h
NOTIF_DEDUP_WINDOW_SEC=600
RETENTION_DAYS=90
```

#### Feature Flags

```env
FEATURE_PREFERENCES=true
FEATURE_WHATSAPP=false

SEED_TEMPLATES=true
MOCK_PROVIDERS=false
```

---

## 📨 Eventos NATS

### Subjects Consumidos

O serviço consome os seguintes eventos:

| Subject | Descrição |
|---------|-----------|
| `orders.created` | Pedido criado |
| `orders.paid` | Pedido pago/confirmado |
| `orders.canceled` | Pedido cancelado |
| `delivery.assigned` | Entrega atribuída a entregador |
| `delivery.status.updated` | Status da entrega atualizado |
| `delivery.completed` | Entrega concluída |
| `rental.started` | Locação iniciada |
| `rental.renewed` | Locação renovada |
| `rental.ended` | Locação finalizada |
| `notifications.dlq` | Dead Letter Queue para falhas |

### Subjects Publicados

| Subject | Descrição |
|---------|-----------|
| `notifications.status.updated` | Status da notificação atualizado |
| `notifications.dlq` | Eventos com falha permanente |

### Contrato de Evento

Todos os eventos devem seguir o schema definido em [`docs/schemas/event.schema.json`](docs/schemas/event.schema.json):

```json
{
  "eventId": "evt-123456",
  "eventType": "orders.paid",
  "occurredAt": "2024-01-15T10:30:00Z",
  "correlationId": "corr-abc",
  "traceId": "trace-xyz",
  "recipient": {
    "userId": "user-123",
    "email": "customer@example.com",
    "phone": "+5511999999999",
    "deviceToken": "fcm-token-abc123",
    "role": "customer"
  },
  "templateKey": "order_paid",
  "data": {
    "orderId": "12345",
    "customerName": "João Silva",
    "amount": "45.90",
    "restaurantName": "Pizza Express"
  }
}
```

### Queue Groups

O serviço utiliza **queue groups** para escalonamento horizontal. Múltiplas instâncias compartilham a carga de trabalho automaticamente.

---

## 📝 Templates

### Templates Padrão

O serviço inclui templates iniciais em português para os principais eventos:

#### 1. `order_paid` (Pedido Pago)

**E-mail:**
```
Assunto: Pedido confirmado - #{{orderId}}
Corpo: Olá {{customerName}}, seu pedido #{{orderId}} foi confirmado...
```

**SMS:**
```
Click Delivery: Pedido #{{orderId}} confirmado! Valor: R$ {{amount}}...
```

**Push:**
```
Título: Pedido confirmado!
Corpo: Seu pedido #{{orderId}} foi confirmado...
```

#### 2. `delivery_assigned` (Entrega Atribuída)

Para entregadores quando uma nova entrega é disponibilizada.

#### 3. `rental_started` (Locação Iniciada)

Para locadores e entregadores quando uma locação de veículo é iniciada.

### Variáveis Disponíveis

Templates suportam variáveis Handlebars baseadas no campo `data` do evento.

### Seed Templates

O serviço pode popular automaticamente os templates padrão no startup configurando `SEED_TEMPLATES=true` no `.env`. Isso garante que os templates essenciais estejam disponíveis sem necessidade de configuração manual.

Você também pode executar o script manualmente:
```bash
node scripts/seedTemplates.js
```

---

## 🔌 API Endpoints

### System Slice

O sistema fornece endpoints de monitoramento e documentação através do slice `system`:

#### `GET /api/v1/health`
Health check do serviço - não requer autenticação.

**Resposta:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "uptime": 12345
}
```

#### `GET /api/v1/metrics`
Métricas Prometheus em formato text/plain.

### Notifications

#### `POST /api/v1/notifications`
Cria uma notificação manualmente (admin/interno).

**Autenticação:** JWT Bearer token

**Body:**
```json
{
  "recipient": {
    "userId": "user-123",
    "email": "customer@example.com",
    "phone": "+5511999999999",
    "deviceToken": "fcm-token",
    "role": "customer"
  },
  "templateKey": "order_paid",
  "data": {
    "orderId": "12345",
    "customerName": "João",
    "amount": "45.90"
  }
}
```

#### `GET /api/v1/notifications/:id`
Obtém detalhes de uma notificação.

**Autenticação:** JWT Bearer token

#### `GET /api/v1/notifications`
Lista notificações com filtros.

**Query Params:**
- `status`: QUEUED, SENT, FAILED, PARTIAL, RETRY
- `recipient.userId`: ID do destinatário
- `eventType`: Tipo do evento
- `from`, `to`: Filtro por data
- `page`, `limit`: Paginação

#### `DELETE /api/v1/notifications/user/:userId`
Remove todos os dados relacionados ao usuário (LGPD/GDPR compliance).

**Autenticação:** JWT Bearer token (apenas admin)

**Resposta:**
```json
{
  "success": true,
  "message": "User data deleted successfully",
  "deleted": {
    "notifications": 10,
    "attempts": 25,
    "preferences": 1,
    "inbox": 0
  }
}
```

Este endpoint remove:
- Todas as notificações do usuário
- Todas as tentativas de envio relacionadas
- Preferências do usuário
- Registros de inbox (se houver)

### Preferences

#### `PUT /api/v1/preferences/:userId`
Atualiza preferências do usuário.

**Autenticação:** JWT Bearer token (próprio usuário ou admin)

**Body:**
```json
{
  "channels": {
    "email": true,
    "push": true,
    "sms": false
  },
  "events": {
    "orders.paid": {
      "email": true,
      "push": true
    }
  },
  "quietHours": {
    "start": 22,
    "end": 8
  },
  "locale": "pt-BR"
}
```

#### `GET /api/v1/preferences/:userId`
Obtém preferências do usuário.

**Documentação Completa:** http://localhost:3003/api-docs

---

## 🔒 Segurança e Autorização

### Autenticação JWT

O serviço suporta autenticação via JWT com:
- **JWKS**: Chaves públicas rotativas
- **Validação de issuer e audience**
- **Support para múltiplos issuers**

### Autorização OPA

Políticas de autorização via Open Policy Agent:

- **Admin** (role=admin): Acesso total
- **Usuário Regular**: Acesso apenas às próprias notificações

**Fail-open configurável** para evitar indisponibilidade.

### mTLS

Suporte a mutual TLS configurável:

```env
MTLS_ENABLED=true
MTLS_CA_CERT_PATH=/path/to/ca.crt
MTLS_CERT_PATH=/path/to/client.crt
MTLS_KEY_PATH=/path/to/client.key
```

---

## 📊 Métricas e Observabilidade

### Métricas Prometheus

Disponíveis em `/api/v1/metrics`:

| Métrica | Tipo | Descrição |
|---------|------|-----------|
| `notifications_received_total` | Counter | Total de eventos recebidos por tipo |
| `notifications_dispatched_total` | Counter | Total de notificações despachadas por canal/provider |
| `notifications_sent_total` | Counter | Total de notificações enviadas com sucesso |
| `notifications_failed_total` | Counter | Total de falhas por canal/provider/errorCode |
| `notifications_attempt_duration_seconds` | Histogram | Duração das tentativas de envio |
| `notifications_inflight` | Gauge | Notificações sendo processadas no momento |
| `dedupe_hits_total` | Counter | Eventos duplicados detectados via idempotency |
| `provider_rate_limited_total` | Counter | Rate limits recebidos dos providers |

Cada métrica inclui labels relevantes como `channel`, `provider`, `status`, `errorCode` para análise detalhada.

### Logging

Winston com:
- Formato JSON em produção
- Mascaramento automático de PII (email, telefone, device tokens)
- Propagação de `correlationId` e `traceId`

---

## 🚢 Deploy

### Docker

#### Build Local

```bash
docker build -t notification-service:latest .
```

#### Executar

```bash
docker run -d \
  -p 3003:3003 \
  --env-file .env \
  --name notification-service \
  notification-service:latest
```

### Azure App Service

1. Publique a imagem no Docker Hub via GitHub Actions
2. Configure o App Service para usar a imagem
3. Configure as variáveis de ambiente no portal
4. Habilite health check em `/api/v1/health`

### K3s (Kubernetes)

Exemplo de deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: notification-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: notification-service
  template:
    metadata:
      labels:
        app: notification-service
    spec:
      containers:
      - name: notification-service
        image: iyonuttxd/notification-service:latest
        ports:
        - containerPort: 3003
        envFrom:
        - secretRef:
            name: notification-service-secrets
        livenessProbe:
          httpGet:
            path: /api/v1/health
            port: 3003
          initialDelaySeconds: 30
          periodSeconds: 10
```

Com Traefik Ingress:

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: notification-service
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`notifications.clickdelivery.com.br`)
      kind: Rule
      services:
        - name: notification-service
          port: 3003
```

---

## 🧪 Testes

### Executar Testes

```bash
# Testes unitários (padrão)
npm test

# Testes de integração (requer MongoDB e NATS rodando)
npm run test:integration

# Com coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Estrutura de Testes

- **Unit**: Entidades, use cases e adapters isolados
- **Integration**: Testes com MongoDB e NATS reais (em `tests/integration/`)
  - Dispatch básico de notificações
  - Fallback entre canais (push → email)
  - Deduplicação/idempotência
  - Retry com sucesso após falha inicial
  - Exclusão de dados por userId (LGPD)

**Nota**: Testes de integração são ignorados por padrão e requerem MongoDB e NATS em execução. Execute com `npm run test:integration` após iniciar os serviços:

```bash
docker-compose -f docker-compose.dev.yml up -d mongo nats
npm run test:integration
```

---

## 🔐 LGPD

### Conformidade

O serviço implementa práticas LGPD-friendly:

1. **Mascaramento de PII**: Logs automaticamente mascarados usando `maskEmail()`, `maskPhone()` e `maskDeviceToken()`
2. **Retenção de Dados**: TTL de 90 dias (configurável via `RETENTION_DAYS`)
3. **Direito ao Esquecimento**: Endpoint REST para deletar todos os dados do usuário

### Deletar Dados do Usuário

O endpoint `DELETE /api/v1/notifications/user/:userId` (apenas admin) remove todos os dados relacionados:

```bash
curl -X DELETE http://localhost:3003/api/v1/notifications/user/user-123 \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

**Resposta:**
```json
{
  "success": true,
  "message": "User data deleted successfully",
  "deleted": {
    "notifications": 15,
    "attempts": 42,
    "preferences": 1,
    "inbox": 0
  }
}
```

Coleções afetadas:
- `notifications`: Todas as notificações do usuário
- `attempts`: Todas as tentativas relacionadas às notificações do usuário
- `preferences`: Preferências de notificação do usuário
- `inbox`: Registros de deduplicação (quando aplicável)


---

## 🐛 Troubleshooting

### Problema: Notificações não sendo enviadas

**Causa Comum**: Providers em modo mock ou credenciais inválidas

**Solução:**
```bash
# Verifique .env
MOCK_PROVIDERS=false

# Verifique logs
docker-compose -f docker-compose.dev.yml logs -f notification-service
```

### Problema: NATS não conectando

**Solução:**
```bash
# Verifique status do NATS
docker-compose -f docker-compose.dev.yml ps nats

# Teste conectividade
telnet localhost 4222
```

### Problema: MongoDB indexes não criados

**Solução:**
Os índices são criados automaticamente no startup. Reinicie o serviço.

---

## 🗺 Roadmap

### v1.1
- [ ] Suporte a WhatsApp via Twilio
- [ ] Dashboard administrativo
- [ ] Templates com rich media

### v2.0
- [ ] Suporte a webhooks
- [ ] Agendamento de notificações
- [ ] A/B testing de templates
- [ ] Suporte a múltiplos idiomas (i18n)

---

## 📄 Licença

Este projeto está licenciado sob a licença MIT - veja o arquivo [LICENSE](LICENSE) para detalhes.

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor:

1. Fork o repositório
2. Crie uma feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

---

## 📞 Contato

Click Delivery Team - [GitHub](https://github.com/iYoNuttxD)

**Imagem Docker:** [docker.io/iyonuttxd/notification-service](https://hub.docker.com/r/iyonuttxd/notification-service)

---

<div align="center">

Desenvolvido com ❤️ para Click Delivery

</div>