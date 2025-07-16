# WebSocket Proxy

[![npm version](https://badgen.net/npm/v/websocket-proxy-plus)](https://www.npmjs.com/package/websocket-proxy-plus)

A lightweight, high-performance WebSocket proxy CLI tool for development and testing environments. This tool enables secure WebSocket communication through firewalls and NAT by establishing proxy tunnels between clients and servers.

## Features

- **Dual Mode Operation**: Run as either a proxy server or proxy client
- **High Performance**: Built with Node.js native networking for optimal performance
- **Comprehensive Logging**: Multiple verbosity levels for debugging and monitoring
- **Robust Error Handling**: Graceful connection management and error recovery
- **Zero External Dependencies**: Uses only Node.js built-in modules for core functionality
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **Production Ready**: Includes comprehensive test coverage and signal handling

## Installation

```bash
npm install -g websocket-proxy-plus
```

## Quick Start

### Server Mode
Start a proxy server that accepts connections and forwards them to a local WebSocket service:

```bash
ws-proxy server --local-port 8080 --proxy-port 9090 -v
```

### Client Mode
Connect to a proxy server and expose the proxied service on a local port:

```bash
ws-proxy client --server-host 192.168.1.100 --server-port 9090 --local-port 8080 -v
```

## Usage

### Command Line Interface

```
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
  --help                       Show help message
```

### Examples

#### Basic Proxy Setup
```bash
# On the server machine (has access to WebSocket service on port 8080)
ws-proxy server --local-port 8080 --proxy-port 9090

# On the client machine (wants to access the WebSocket service)
ws-proxy client --server-host server.example.com --server-port 9090 --local-port 8080
```

#### Development Environment
```bash
# Forward local development server through proxy with debug logging
ws-proxy server --local-port 3000 --proxy-port 9090 -vv

# Connect to proxy from another machine
ws-proxy client --server-host dev-server.local --server-port 9090 --local-port 3000 -v
```

#### Firewall Traversal
```bash
# Inside firewall (proxy server mode)
ws-proxy server --local-port 8080 --proxy-port 443 -v

# Outside firewall (proxy client mode)
ws-proxy client --server-host public.server.com --server-port 443 --local-port 8080 -v
```

## Architecture

The WebSocket proxy operates in two modes:

### Server Mode
- Listens on the proxy port for incoming connections
- Accepts WebSocket handshake requests
- Establishes connections to the local WebSocket service
- Forwards all traffic bidirectionally

### Client Mode
- Listens on the local port for incoming connections
- Connects to the proxy server for each new client connection
- Forwards all traffic through the proxy tunnel

```
[WebSocket Client] → [Proxy Client] → [Network] → [Proxy Server] → [WebSocket Service]
```

## API Reference

### ProxyServer Class

```javascript
const { ProxyServer } = require('websocket-proxy-plus');

const server = new ProxyServer({
  localPort: 8080,    // Port of local WebSocket service
  proxyPort: 9090,    // Port to expose proxy on
  verbosity: 1        // Logging level (0-3)
});

await server.start();
const stats = server.getStats();
await server.stop();
```

### ProxyClient Class

```javascript
const { ProxyClient } = require('websocket-proxy-plus');

const client = new ProxyClient({
  serverHost: 'proxy.example.com',  // Proxy server host
  serverPort: 9090,                 // Proxy server port
  localPort: 8080,                  // Local port to expose
  verbosity: 1                      // Logging level (0-3)
});

await client.start();
const stats = client.getStats();
await client.stop();
```

## Development

### Running Tests
```bash
npm test                # Run all tests
npm run test:coverage   # Run tests with coverage report
npm run test:watch      # Run tests in watch mode
```

### Code Quality
```bash
npm run lint           # Check code style
npm run lint:fix       # Fix code style issues
```

### Building
```bash
npm start              # Start the application
```

## Configuration

### Environment Variables
- `NODE_ENV`: Set to 'production' for production deployments
- `WS_PROXY_LOG_LEVEL`: Override default logging level (0-3)

### Port Requirements
- Ensure proxy ports are accessible through firewalls
- Use ports > 1024 to avoid requiring root privileges
- Consider using standard ports (80, 443) for better firewall compatibility

## Troubleshooting

### Common Issues

**Connection Refused**
```bash
# Check if the local WebSocket service is running
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: test" http://localhost:8080/

# Verify proxy server is listening
netstat -tlnp | grep 9090
```

**High CPU Usage**
- Increase logging verbosity to identify bottlenecks
- Monitor connection count with `-vv` flag
- Consider connection limits for production use

**Memory Leaks**
- Monitor with `process.memoryUsage()`
- Ensure proper connection cleanup
- Use connection timeouts in production

### Debug Mode
Enable maximum verbosity for troubleshooting:
```bash
ws-proxy server -vvv --local-port 8080 --proxy-port 9090
```

## Performance

- **Connection Handling**: Supports hundreds of concurrent connections
- **Memory Usage**: ~10MB base memory footprint
- **Latency**: <1ms additional latency per hop
- **Throughput**: Limited primarily by network bandwidth

## Security Considerations

- This tool provides **no encryption** - use with trusted networks only
- For production use, implement TLS termination at the proxy level
- Consider authentication mechanisms for proxy access
- Monitor connection logs for unusual activity

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## Changelog

### v1.0.0
- Initial release
- Server and client proxy modes
- WebSocket frame handling
- Comprehensive test coverage
- CLI interface with multiple verbosity levels
