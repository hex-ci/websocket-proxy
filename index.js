const CLI = require('./lib/cli');
const ProxyServer = require('./lib/server');
const ProxyClient = require('./lib/client');

// Separate function for creating proxy instances (testable)
function createProxy(config) {
  if (config.mode === 'server') {
    return new ProxyServer(config);
  } else if (config.mode === 'client') {
    return new ProxyClient(config);
  } else {
    throw new Error(`Invalid mode: ${config.mode}`);
  }
}

// Main application logic (more testable)
async function startProxy(config, options = {}) {
  const {
    skipSignalHandlers = false,
    skipStatsInterval = false,
    console: consoleObj = console
  } = options;

  const proxy = createProxy(config);
  
  if (config.mode === 'server') {
    consoleObj.log('Starting WebSocket proxy server...');
  } else {
    consoleObj.log('Starting WebSocket proxy client...');
  }

  await proxy.start();

  if (!skipSignalHandlers) {
    const signalHandler = async (signal) => {
      consoleObj.log(`\nReceived ${signal}, shutting down gracefully...`);
      try {
        await proxy.stop();
        process.exit(0);
      } catch (error) {
        consoleObj.error(`Error during shutdown: ${error.message}`);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => signalHandler('SIGINT'));
    process.on('SIGTERM', () => signalHandler('SIGTERM'));
  }

  if (!skipStatsInterval && config.verbosity >= 2) {
    const statsInterval = setInterval(() => {
      const stats = proxy.getStats();
      consoleObj.log(`Stats: ${stats.activeConnections} active, ${stats.totalConnections} total connections`);
    }, 30000);

    // Return cleanup function for tests
    return {
      proxy,
      cleanup: () => {
        clearInterval(statsInterval);
        return proxy.stop();
      }
    };
  }

  return { proxy, cleanup: () => proxy.stop() };
}

async function main() {
  const cli = new CLI();
  const config = cli.parseArgs();

  if (config.help || !config.mode) {
    cli.showHelp();
    process.exit(0);
  }

  if (!cli.validate(config)) {
    process.exit(1);
  }

  try {
    await startProxy(config);
  } catch (error) {
    console.error(`Failed to start proxy: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = { ProxyServer, ProxyClient, CLI, createProxy, startProxy, main };
