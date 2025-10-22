# Server Architecture

## Directory Structure

```
server/
├── config/              # Configuration management
│   └── index.js        # Centralized config with validation
├── core/                # Application core
│   ├── app.js          # Express app factory
│   └── scheduler.js    # Periodic task scheduler
├── database/            # Database layer
│   ├── client.js       # Prisma client manager
│   └── repositories/   # Data access repositories
│       └── snapshotRepository.js
├── middleware/          # Express middleware
│   ├── errorHandler.js # Error handling & async wrapper
│   └── security.js     # Authentication & authorization
├── routes/              # HTTP routes
│   ├── index.js        # Route aggregator
│   ├── healthRoutes.js # Health check endpoints
│   ├── arkhamRoutes.js # Arkham header management
│   └── dataRoutes.js   # Data retrieval endpoints
├── services/            # Business logic
│   ├── arkhamService.js      # Arkham API client
│   ├── normalizerService.js  # Data transformation
│   ├── balanceService.js     # Balance processing
│   └── transferService.js    # Transfer analytics
├── utils/               # Utilities
│   ├── logger.js       # Structured logging
│   └── formatters.js   # Data formatters & validators
├── websocket/           # WebSocket layer
│   └── socketManager.js # Socket.IO management
└── index.js            # Application entry point
```

## Dependency Flow

```
index.js
  ├─> config           (configuration)
  ├─> database/client  (database connection)
  ├─> repositories     (data access)
  ├─> services         (business logic)
  ├─> core/app         (Express setup)
  ├─> core/scheduler   (periodic tasks)
  └─> websocket        (real-time updates)
```

## Key Principles

### 1. Separation of Concerns
- **Routes**: HTTP request/response handling only
- **Services**: Business logic and orchestration
- **Repositories**: Database operations only
- **Middleware**: Cross-cutting concerns (logging, errors, auth)

### 2. Dependency Injection
- Services receive dependencies via constructor
- Makes testing and mocking easier
- Clear dependency graph

### 3. Error Handling
- All async routes wrapped with `asyncHandler`
- Global error handler middleware
- Structured error logging
- Graceful degradation

### 4. Configuration Management
- Single source of truth in `config/index.js`
- Environment variable validation
- Type-safe access to configuration

### 5. Logging
- Structured logging with context
- Different log levels (error, warn, info, debug)
- Child loggers for different modules

## Adding New Features

### Adding a New Service

1. Create service file in `services/`:
```javascript
import { createLogger } from '../utils/logger.js';

const logger = createLogger('MyService');

class MyService {
  constructor(dependency) {
    this.dependency = dependency;
  }

  async doSomething() {
    try {
      logger.info('Doing something');
      // Implementation
    } catch (error) {
      logger.error('Failed to do something', { error: error.message });
      throw error;
    }
  }
}

export default MyService;
```

2. Initialize in `index.js`
3. Use in routes or scheduler

### Adding a New Route

1. Create route file in `routes/`:
```javascript
import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

router.get('/my-endpoint', asyncHandler(async (req, res) => {
  // Handle request
  res.json({ ok: true });
}));

export default router;
```

2. Import and mount in `routes/index.js`

### Adding a New Repository

1. Create repository in `database/repositories/`:
```javascript
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('MyRepository');

class MyRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async findById(id) {
    try {
      return await this.prisma.myModel.findUnique({
        where: { id }
      });
    } catch (error) {
      logger.error('Find failed', { id, error: error.message });
      throw error;
    }
  }
}

export default MyRepository;
```

2. Initialize with Prisma client in `index.js`

## Testing Strategy

### Unit Tests
- Test individual functions and methods
- Mock all external dependencies
- Focus on business logic in services

### Integration Tests
- Test database operations with test database
- Test API endpoints with supertest
- Test WebSocket events

### E2E Tests
- Test complete user flows
- Use real database (or Docker)
- Verify end-to-end functionality

## Performance Considerations

1. **Database Queries**
   - Use indexes for frequently queried fields
   - Avoid N+1 queries
   - Use `include` wisely

2. **Caching**
   - Cache in-memory for frequently accessed data
   - Use Redis for distributed caching (future)

3. **Async Operations**
   - Don't block the event loop
   - Use background jobs for heavy tasks
   - Consider queue systems for high load

4. **Error Recovery**
   - Implement retry logic for transient failures
   - Circuit breakers for external services
   - Graceful degradation when services are down

## Monitoring

### Logs
- Use structured logging for parsing
- Include correlation IDs for request tracking
- Log levels: ERROR for issues, INFO for important events, DEBUG for troubleshooting

### Metrics (Future)
- Request latency
- Error rates
- Database query performance
- WebSocket connection count

### Health Checks
- `/api/health` endpoint
- Database connectivity
- External API status


