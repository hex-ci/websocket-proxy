const Logger = require('./logger');

class CLI {
  constructor() {
    this.args = process.argv.slice(2);
    this.logger = new Logger();
  }

  parseArgs() {
    const config = {
      mode: null,
      localPort: 37989,
      proxyPort: 9090,
      serverHost: 'localhost',
      serverPort: 9090,
      verbosity: 0,
      help: false
    };

    for (let i = 0; i < this.args.length; i++) {
      const arg = this.args[i];

      switch (arg) {
      case 'server':
      case 'client':
        config.mode = arg;
        break;
      case '--local-port':
      case '-l':
        config.localPort = parseInt(this.args[++i]);
        break;
      case '--proxy-port':
      case '-p':
        config.proxyPort = parseInt(this.args[++i]);
        break;
      case '--server-host':
      case '-h':
        config.serverHost = this.args[++i];
        break;
      case '--server-port':
      case '-s':
        config.serverPort = parseInt(this.args[++i]);
        break;
      case '-v':
        config.verbosity = 1;
        break;
      case '-vv':
        config.verbosity = 2;
        break;
      case '-vvv':
        config.verbosity = 3;
        break;
      case '--help':
        config.help = true;
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
      }
    }

    this.logger.setLevel(config.verbosity);
    return config;
  }

  showHelp() {
    console.log(`
WebSocket Proxy CLI

Usage:
  ws-proxy server [options]    Start proxy server mode
  ws-proxy client [options]    Start proxy client mode

Server Mode Options:
  --local-port, -l <port>      Local WebSocket port to proxy (default: 37989)
  --proxy-port, -p <port>      Port to expose proxy on (default: 9090)

Client Mode Options:
  --server-host, -h <host>     Proxy server host (default: localhost)
  --server-port, -s <port>     Proxy server port (default: 9090)
  --local-port, -l <port>      Local port to expose service (default: 37989)

Global Options:
  -v                           Verbose logging (info level)
  -vv                          More verbose logging (debug level)
  -vvv                         Most verbose logging (trace level)
  --help                       Show this help message

Examples:
  ws-proxy server -l 8080 -p 9090 -v
  ws-proxy client -h 192.168.1.100 -s 9090 -l 8080 -vv
`);
  }

  validate(config) {
    if (!config.mode) {
      console.error('Mode is required (server or client)');
      return false;
    }

    if (config.mode !== 'server' && config.mode !== 'client') {
      console.error('Mode must be either "server" or "client"');
      return false;
    }

    // Validate local port
    if (isNaN(config.localPort) || !Number.isInteger(config.localPort) || config.localPort < 1 || config.localPort > 65535) {
      console.error('Local port must be a valid integer between 1 and 65535');
      return false;
    }

    // Validate proxy port
    if (isNaN(config.proxyPort) || !Number.isInteger(config.proxyPort) || config.proxyPort < 1 || config.proxyPort > 65535) {
      console.error('Proxy port must be a valid integer between 1 and 65535');
      return false;
    }

    // Validate server port
    if (isNaN(config.serverPort) || !Number.isInteger(config.serverPort) || config.serverPort < 1 || config.serverPort > 65535) {
      console.error('Server port must be a valid integer between 1 and 65535');
      return false;
    }

    return true;
  }
}

module.exports = CLI;
