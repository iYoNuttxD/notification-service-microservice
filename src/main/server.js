require('dotenv').config();
const { createContainer, closeContainer } = require('./container');
const createApp = require('./app');
const { setupSubscribers } = require('./subscribers');

async function main() {
  let container;

  try {
    // Initialize container
    container = await createContainer();
    const { logger } = container;

    // Setup NATS subscribers
    await setupSubscribers(container);

    // Create Express app
    const app = createApp(container);

    // Start server
    const port = process.env.PORT || 3003;
    const server = app.listen(port, () => {
      logger.info(`Notification service started on port ${port}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`API docs available at http://localhost:${port}/api-docs`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received, shutting down gracefully...`);

      server.close(async () => {
        logger.info('HTTP server closed');
        await closeContainer(container);
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('Failed to start application:', error);
    if (container) {
      await closeContainer(container);
    }
    process.exit(1);
  }
}

main();
