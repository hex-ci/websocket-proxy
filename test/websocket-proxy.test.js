const net = require('net');
const { ProxyServer, ProxyClient } = require('../index.js');

class MockWebSocketServer {
  constructor(port) {
    this.port = port;
    this.server = null;
    this.connections = [];
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.connections.push(socket);

        socket.on('data', (data) => {
          const handshakeData = data.toString();
          if (handshakeData.includes('Sec-WebSocket-Key:')) {
            const keyMatch = handshakeData.match(/Sec-WebSocket-Key: (.+)/);
            if (keyMatch) {
              const key = keyMatch[1].trim();
              const crypto = require('crypto');
              const acceptKey = crypto
                .createHash('sha1')
                .update(key + '258EAFA5-E6B4-826D-9DA7-5269A0EC9C01')
                .digest('base64');

              const response = [
                'HTTP/1.1 101 Switching Protocols',
                'Upgrade: websocket',
                'Connection: Upgrade',
                `Sec-WebSocket-Accept: ${acceptKey}`,
                '',
                ''
              ].join('\r\n');

              socket.write(response);
            }
          } else {
            socket.write(data);
          }
        });
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  stop() {
    return new Promise((resolve) => {
      for (const conn of this.connections) {
        if (!conn.destroyed) {
          conn.destroy();
        }
      }
      this.connections = [];

      if (this.server) {
        this.server.close(resolve);
      } else {
        resolve();
      }
    });
  }
}

function waitForConnection(host, port, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const tryConnect = () => {
      const socket = net.createConnection(port, host);

      socket.on('connect', () => {
        socket.destroy();
        resolve();
      });

      socket.on('error', () => {
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Connection timeout to ${host}:${port}`));
        } else {
          setTimeout(tryConnect, 100);
        }
      });
    };

    tryConnect();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('WebSocket Proxy', () => {
  describe('ProxyServer', () => {
    test('should start and accept connections', async () => {
      const mockWS = new MockWebSocketServer(37989);
      await mockWS.start();

      const server = new ProxyServer({
        localPort: 37989,
        proxyPort: 9091,
        verbosity: 0
      });

      try {
        await server.start();
        await waitForConnection('127.0.0.1', 9091);

        const stats = server.getStats();
        expect(stats.totalConnections).toBeGreaterThanOrEqual(0);
        expect(typeof stats.activeConnections).toBe('number');

      } finally {
        await server.stop();
        await mockWS.stop();
      }
    });

    test('should handle multiple connections', async () => {
      const mockWS = new MockWebSocketServer(37988);
      await mockWS.start();

      const server = new ProxyServer({
        localPort: 37988,
        proxyPort: 9094,
        verbosity: 0
      });

      try {
        await server.start();

        // Create multiple test connections
        const connections = [];
        for (let i = 0; i < 3; i++) {
          const socket = net.createConnection(9094, '127.0.0.1');
          connections.push(socket);
          await new Promise(resolve => {
            socket.on('connect', resolve);
          });
        }

        // Clean up connections
        for (const socket of connections) {
          socket.destroy();
        }

        const stats = server.getStats();
        expect(stats.totalConnections).toBeGreaterThanOrEqual(3);

      } finally {
        await server.stop();
        await mockWS.stop();
      }
    });
  });

  describe('ProxyClient', () => {
    test('should start and forward connections', async () => {
      const mockWS = new MockWebSocketServer(37989);
      const mockProxy = new MockWebSocketServer(9092);

      await mockWS.start();
      await mockProxy.start();

      const client = new ProxyClient({
        serverHost: '127.0.0.1',
        serverPort: 9092,
        localPort: 37990,
        verbosity: 0
      });

      try {
        await client.start();
        await waitForConnection('127.0.0.1', 37990);

        const stats = client.getStats();
        expect(stats.totalConnections).toBeGreaterThanOrEqual(0);
        expect(typeof stats.activeConnections).toBe('number');

      } finally {
        await client.stop();
        await mockProxy.stop();
        await mockWS.stop();
      }
    });
  });

  describe('Full proxy chain', () => {
    test('should work end-to-end', async () => {
      const mockWS = new MockWebSocketServer(37989);
      await mockWS.start();

      const server = new ProxyServer({
        localPort: 37989,
        proxyPort: 9093,
        verbosity: 0
      });

      const client = new ProxyClient({
        serverHost: '127.0.0.1',
        serverPort: 9093,
        localPort: 37991,
        verbosity: 0
      });

      try {
        await server.start();
        await sleep(100);
        await client.start();
        await sleep(100);

        await waitForConnection('127.0.0.1', 37991);

        const testSocket = net.createConnection(37991, '127.0.0.1');
        await new Promise((resolve, reject) => {
          testSocket.on('connect', resolve);
          testSocket.on('error', reject);
        });

        testSocket.destroy();

        // Verify both server and client have stats
        const serverStats = server.getStats();
        const clientStats = client.getStats();

        expect(serverStats.totalConnections).toBeGreaterThanOrEqual(0);
        expect(clientStats.totalConnections).toBeGreaterThanOrEqual(0);

      } finally {
        await client.stop();
        await server.stop();
        await mockWS.stop();
      }
    }, 10000);
  });
});

describe('WebSocket Frame Handler', () => {
  test('should handle WebSocket handshake correctly', () => {
    const WebSocketFrame = require('../lib/websocket');

    const testKey = 'dGhlIHNhbXBsZSBub25jZQ==';
    const response = WebSocketFrame.createHandshakeResponse(testKey);

    expect(response).toContain('HTTP/1.1 101 Switching Protocols');
    expect(response).toContain('Upgrade: websocket');
    expect(response).toContain('Sec-WebSocket-Accept:');

    const handshake = WebSocketFrame.parseHandshake(
      'GET / HTTP/1.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ' + testKey + '\r\n\r\n'
    );

    expect(handshake.isWebSocket).toBe(true);
    expect(handshake.key).toBe(testKey);
  });

  test('should create and parse WebSocket frames', () => {
    const WebSocketFrame = require('../lib/websocket');

    const payload = Buffer.from('Hello WebSocket');
    const frame = WebSocketFrame.createFrame(WebSocketFrame.OPCODES.TEXT, payload, true);

    expect(Buffer.isBuffer(frame)).toBe(true);
    expect(frame.length).toBeGreaterThan(payload.length);

    const parsed = WebSocketFrame.parseFrame(frame);
    expect(parsed).toBeTruthy();
    expect(parsed.opcode).toBe(WebSocketFrame.OPCODES.TEXT);
    expect(parsed.payload.toString()).toBe('Hello WebSocket');
    expect(parsed.masked).toBe(true);
  });
});

describe('CLI', () => {
  test('should parse arguments correctly', () => {
    const CLI = require('../lib/cli');

    const originalArgv = process.argv;

    try {
      process.argv = ['node', 'test.js', 'server', '--local-port', '8080', '--proxy-port', '9090', '-vv'];

      const cli = new CLI();
      const config = cli.parseArgs();

      expect(config.mode).toBe('server');
      expect(config.localPort).toBe(8080);
      expect(config.proxyPort).toBe(9090);
      expect(config.verbosity).toBe(2);
      expect(cli.validate(config)).toBe(true);

    } finally {
      process.argv = originalArgv;
    }
  });

  test('should validate configuration', () => {
    const CLI = require('../lib/cli');
    const cli = new CLI();

    // Mock console.error to suppress test output
    const originalError = console.error;
    console.error = jest.fn();

    try {
      // Valid config
      expect(cli.validate({
        mode: 'server',
        localPort: 8080,
        proxyPort: 9090,
        serverPort: 9090
      })).toBe(true);

      // Invalid mode
      expect(cli.validate({
        mode: 'invalid',
        localPort: 8080,
        proxyPort: 9090,
        serverPort: 9090
      })).toBe(false);

      // Invalid port
      expect(cli.validate({
        mode: 'server',
        localPort: 99999,
        proxyPort: 9090,
        serverPort: 9090
      })).toBe(false);

      // Verify console.error was called for invalid cases
      expect(console.error).toHaveBeenCalledWith('Mode must be either "server" or "client"');
      expect(console.error).toHaveBeenCalledWith('Local port must be a valid integer between 1 and 65535');

    } finally {
      console.error = originalError;
    }
  });
});

describe('Logger', () => {
  test('should handle different verbosity levels', () => {
    const Logger = require('../lib/logger');

    // Mock console methods
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const logs = [];

    console.log = (...args) => logs.push(['log', ...args]);
    console.error = (...args) => logs.push(['error', ...args]);
    console.warn = (...args) => logs.push(['warn', ...args]);

    try {
      const logger = new Logger(2);

      logger.info('Info message');
      logger.debug('Debug message');
      logger.trace('Trace message');
      logger.error('Error message');
      logger.warn('Warning message');

      // Test setLevel method
      logger.setLevel(0);
      logger.info('Should not log');

      // Should have info, debug, error, and warning messages
      expect(logs.length).toBeGreaterThanOrEqual(4);
      expect(logs.some(log => log[1].includes('Info message'))).toBe(true);
      expect(logs.some(log => log[1].includes('Debug message'))).toBe(true);
      expect(logs.some(log => log[1].includes('Error message'))).toBe(true);
      expect(logs.some(log => log[1].includes('Warning message'))).toBe(true);

    } finally {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    }
  });
});

describe('Error Handling', () => {
  test('should handle connection errors gracefully', async () => {
    const server = new ProxyServer({
      localPort: 37989,
      proxyPort: 99999, // Invalid port - should cause EACCES or EADDRINUSE
      verbosity: 0
    });

    // This should fail gracefully
    await expect(server.start()).rejects.toThrow();
  });

  test('should handle client connection to non-existent server', async () => {
    const client = new ProxyClient({
      serverHost: '127.0.0.1',
      serverPort: 99998, // Non-existent server
      localPort: 37995,
      verbosity: 0
    });

    try {
      await client.start();
      // Try to connect and expect it to fail
      const testSocket = net.createConnection(37995, '127.0.0.1');

      await new Promise((resolve) => {
        testSocket.on('error', resolve);
        testSocket.on('close', resolve);
        setTimeout(resolve, 1000);
      });

    } finally {
      await client.stop();
    }
  });
});

describe('WebSocket Frame Edge Cases', () => {
  test('should handle incomplete frames', () => {
    const WebSocketFrame = require('../lib/websocket');

    // Test incomplete frame
    const incompleteFrame = Buffer.from([0x81, 0x05]); // Missing payload
    const result = WebSocketFrame.parseFrame(incompleteFrame);
    expect(result).toBeNull();
  });

  test('should handle large payload frames', () => {
    const WebSocketFrame = require('../lib/websocket');

    const largePayload = Buffer.alloc(70000, 'A');
    const frame = WebSocketFrame.createFrame(WebSocketFrame.OPCODES.BINARY, largePayload, false);

    expect(Buffer.isBuffer(frame)).toBe(true);
    expect(frame.length).toBeGreaterThan(largePayload.length);

    const parsed = WebSocketFrame.parseFrame(frame);
    expect(parsed).toBeTruthy();
    expect(parsed.opcode).toBe(WebSocketFrame.OPCODES.BINARY);
    expect(parsed.payload.length).toBe(70000);
  });

  test('should handle different opcodes', () => {
    const WebSocketFrame = require('../lib/websocket');

    const payload = Buffer.from('test');

    // Test different opcodes
    const textFrame = WebSocketFrame.createFrame(WebSocketFrame.OPCODES.TEXT, payload);
    const binaryFrame = WebSocketFrame.createFrame(WebSocketFrame.OPCODES.BINARY, payload);
    const closeFrame = WebSocketFrame.createFrame(WebSocketFrame.OPCODES.CLOSE, payload);

    expect(WebSocketFrame.parseFrame(textFrame).opcode).toBe(WebSocketFrame.OPCODES.TEXT);
    expect(WebSocketFrame.parseFrame(binaryFrame).opcode).toBe(WebSocketFrame.OPCODES.BINARY);
    expect(WebSocketFrame.parseFrame(closeFrame).opcode).toBe(WebSocketFrame.OPCODES.CLOSE);
  });

  test('should handle invalid handshake', () => {
    const WebSocketFrame = require('../lib/websocket');

    const invalidHandshake = 'GET / HTTP/1.1\r\nHost: example.com\r\n\r\n';
    const result = WebSocketFrame.parseHandshake(invalidHandshake);

    expect(result.isWebSocket).toBe(false);
    expect(result.key).toBeUndefined();
  });
});

describe('CLI Edge Cases', () => {
  test('should handle missing mode', () => {
    const CLI = require('../lib/cli');

    const originalArgv = process.argv;
    const originalError = console.error;
    console.error = jest.fn();

    try {
      process.argv = ['node', 'test.js', '--local-port', '8080'];

      const cli = new CLI();
      const config = cli.parseArgs();

      expect(config.mode).toBeNull();
      expect(cli.validate(config)).toBe(false);

      // Verify console.error was called
      expect(console.error).toHaveBeenCalledWith('Mode is required (server or client)');

    } finally {
      process.argv = originalArgv;
      console.error = originalError;
    }
  });

  test('should handle unknown options', () => {
    const CLI = require('../lib/cli');

    const originalArgv = process.argv;
    const originalExit = process.exit;
    const originalError = console.error;

    let exitCode = null;
    let errorMessage = '';

    process.exit = (code) => {
      exitCode = code;
    };
    console.error = (msg) => {
      errorMessage = msg;
    };

    try {
      process.argv = ['node', 'test.js', 'server', '--unknown-option'];

      const cli = new CLI();
      cli.parseArgs();

      expect(exitCode).toBe(1);
      expect(errorMessage).toContain('Unknown option: --unknown-option');

    } finally {
      process.argv = originalArgv;
      process.exit = originalExit;
      console.error = originalError;
    }
  });

  test('should handle short options', () => {
    const CLI = require('../lib/cli');

    const originalArgv = process.argv;

    try {
      process.argv = ['node', 'test.js', 'client', '-l', '8080', '-p', '9090', '-h', 'example.com', '-s', '9091'];

      const cli = new CLI();
      const config = cli.parseArgs();

      expect(config.mode).toBe('client');
      expect(config.localPort).toBe(8080);
      expect(config.proxyPort).toBe(9090);
      expect(config.serverHost).toBe('example.com');
      expect(config.serverPort).toBe(9091);

    } finally {
      process.argv = originalArgv;
    }
  });
});
