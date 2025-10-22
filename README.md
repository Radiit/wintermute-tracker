# Wintermute Tracker

Real-time cryptocurrency portfolio tracker for Wintermute entity using Arkham Intelligence API.

## Features

- **Real-time Balance Tracking**: Monitor asset holdings with configurable intervals
- **Transfer Analytics**: Track top transfers with USD value aggregation
- **WebSocket Updates**: Live data streaming to connected clients
- **Historical Snapshots**: PostgreSQL storage for balance history
- **Flexible Baselines**: Compare against previous snapshots or configurable lookback periods
- **Production Ready**: Clean architecture, graceful shutdown, error handling

## Architecture

```
server/
├── config/              # Configuration management
├── core/                # Application core (app, scheduler)
├── database/            # Database client and repositories
│   └── repositories/    # Data access layer
├── middleware/          # Express middleware (errors, security)
├── routes/              # HTTP route handlers
├── services/            # Business logic services
├── utils/               # Utility functions (logger, formatters)
├── websocket/           # WebSocket management
└── index.js            # Application entry point
```

### Design Patterns

- **Repository Pattern**: Database operations abstracted in repositories
- **Service Layer**: Business logic separated from HTTP handlers
- **Dependency Injection**: Services receive dependencies via constructor
- **Singleton Pattern**: Shared instances for config, logger, database
- **Graceful Shutdown**: Proper cleanup of resources on termination

## Prerequisites

- Node.js >= 18
- PostgreSQL database
- Arkham Intelligence API access (headers required)

## Installation

```bash
npm install
```

## Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Configure environment variables:
   - `DATABASE_URL`: PostgreSQL connection string
   - `ARKHAM_COOKIE`, `ARKHAM_X_PAYLOAD`, `ARKHAM_X_TIMESTAMP`: Arkham API credentials
   - Other settings as needed (see `.env.example`)

3. Run database migrations:
```bash
npm run prisma:migrate
```

## Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

### Database Operations
```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Development migrations
npm run prisma:dev
```

## API Endpoints

### Health Check
```
GET /api/health
```
Returns server status, database connectivity, and configuration info.

### Get Latest Data
```
GET /api/latest
```
Returns the most recent balance snapshot and transfer data.

### Update Arkham Headers
```
POST /api/arkham/headers
Headers: x-sig: <shared-secret>
Body: {
  "cookie": "...",
  "xPayload": "...",
  "xTimestamp": "..."
}
```
Dynamically update Arkham API credentials (requires signature).

### Get Arkham Headers Status
```
GET /api/arkham/headers
```
Check which Arkham headers are configured.

## WebSocket Events

### Connection
```javascript
const socket = io();
socket.on('connect', () => console.log('Connected'));
```

### Updates
```javascript
socket.on('update', (payload) => {
  // payload contains balance rows, transfers, timestamps
  console.log(payload);
});
```

## Docker Deployment

```bash
# Build image
docker build -t wintermute-tracker .

# Run container
docker run -p 3000:3000 --env-file .env wintermute-tracker
```

## Project Structure Details

### Configuration (`server/config/`)
- Centralized environment variable management
- Validation on startup
- Type-safe configuration access

### Services (`server/services/`)
- **arkhamService**: Arkham API client with header management
- **normalizerService**: Data normalization and transformation
- **balanceService**: Balance processing and comparison logic
- **transferService**: Transfer aggregation and top-N computation

### Repositories (`server/database/repositories/`)
- **snapshotRepository**: CRUD operations for balance snapshots
- Prisma ORM integration
- Error handling and logging

### Middleware (`server/middleware/`)
- **errorHandler**: Global error handling and 404 responses
- **security**: Signature verification for sensitive endpoints

### Core (`server/core/`)
- **app.js**: Express application factory
- **scheduler.js**: Periodic task management (balances, transfers)

### Utils (`server/utils/`)
- **logger**: Structured logging with levels
- **formatters**: Data conversion and validation utilities

## Development Guidelines

### Code Style
- Use ES6 modules (`import`/`export`)
- Async/await for asynchronous operations
- Descriptive variable and function names
- JSDoc comments for public APIs

### Error Handling
- Always wrap errors with context
- Log errors with structured data
- Return appropriate HTTP status codes
- Use try/catch in async functions

### Logging
```javascript
import { createLogger } from '../utils/logger.js';
const logger = createLogger('ModuleName');

logger.info('Operation completed', { key: 'value' });
logger.error('Operation failed', { error: error.message });
```

### Testing Recommendations
- Unit tests for services and utilities
- Integration tests for repositories
- E2E tests for API endpoints
- Mock external dependencies (Arkham API)

## Troubleshooting

### Database Connection Issues
- Verify `DATABASE_URL` is correct
- Check PostgreSQL is running
- Ensure migrations are applied

### Arkham API Errors
- Verify headers are configured correctly
- Check `ARKHAM_COOKIE`, `ARKHAM_X_PAYLOAD`, `ARKHAM_X_TIMESTAMP`
- Headers may need periodic refresh

### WebSocket Disconnections
- Check firewall rules for WebSocket connections
- Verify CORS settings in production
- Monitor server logs for errors

## Performance Optimization

- **Database Indexes**: Composite index on `(entity, ts)` for fast lookback queries
- **Connection Pooling**: Prisma manages database connections efficiently
- **Caching**: In-memory caching of last payload for fast `/api/latest` responses
- **Pagination**: Client-side pagination for large datasets

## Security Considerations

- **Signature Verification**: Protect header update endpoint with shared secret
- **Input Validation**: Validate all external inputs
- **Error Messages**: Don't expose sensitive info in production errors
- **HTTPS**: Use HTTPS in production for encrypted connections
- **Environment Variables**: Never commit `.env` file

## License

Private/Proprietary - All rights reserved

## Support

For issues or questions, please contact the development team.


