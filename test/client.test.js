const net = require('net');
const ProxyClient = require('../lib/client');

class MockProxyServer {
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
          // Echo data back (simple proxy behavior)
          socket.write(data);
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('ProxyClient', () => {
  describe('Constructor', () => {
    test('should initialize with proper defaults', () => {
      const config = {
        serverHost: 'localhost',
        serverPort: 9090,
        localPort: 8080,
        verbosity: 1
      };

      const client = new ProxyClient(config);

      expect(client.config).toBe(config);
      expect(client.localServer).toBeNull();
      expect(client.connections).toBeInstanceOf(Map);
      expect(client.connectionId).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle local port already in use error', async () => {
      const client1 = new ProxyClient({
        serverHost: '127.0.0.1',
        serverPort: 9090,
        localPort: 9103,
        verbosity: 0
      });

      const client2 = new ProxyClient({
        serverHost: '127.0.0.1',
        serverPort: 9090,
        localPort: 9103,  // Same port - should fail
        verbosity: 0
      });

      try {
        await client1.start();
        await expect(client2.start()).rejects.toThrow();
      } finally {
        await client1.stop();
      }
    });

    test('should handle invalid local port error', async () => {
      const client = new ProxyClient({
        serverHost: '127.0.0.1',
        serverPort: 9090,
        localPort: 99999,  // Invalid port
        verbosity: 0
      });

      await expect(client.start()).rejects.toThrow();
    });

    test('should handle remote server unavailable', async () => {
      const client = new ProxyClient({
        serverHost: '127.0.0.1',
        serverPort: 65533,  // No server running on this port
        localPort: 9104,
        verbosity: 0
      });

      try {
        await client.start();

        // Try to connect to local client - should fail when it tries to connect to remote server
        const localSocket = net.createConnection(9104, '127.0.0.1');

        const handshakeRequest = [
          'GET / HTTP/1.1',
          'Host: 127.0.0.1',
          'Upgrade: websocket',
          'Connection: Upgrade',
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version: 13',
          '',
          ''
        ].join('\r\n');

        await new Promise((resolve) => {
          localSocket.on('connect', () => {
            localSocket.write(handshakeRequest);
          });

          localSocket.on('error', resolve);
          localSocket.on('close', resolve);

          setTimeout(resolve, 1000);
        });

        localSocket.destroy();
      } finally {
        await client.stop();
      }
    });

    test('should handle ENOTFOUND error for invalid host', async () => {
      const client = new ProxyClient({
        serverHost: 'invalid-host-that-does-not-exist.com',
        serverPort: 9090,
        localPort: 9105,
        verbosity: 0
      });

      try {
        await client.start();

        const localSocket = net.createConnection(9105, '127.0.0.1');

        const handshakeRequest = [
          'GET / HTTP/1.1',
          'Host: 127.0.0.1',
          'Upgrade: websocket',
          'Connection: Upgrade',
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version: 13',
          '',
          ''
        ].join('\r\n');

        await new Promise((resolve) => {
          localSocket.on('connect', () => {
            localSocket.write(handshakeRequest);
          });

          localSocket.on('error', resolve);
          localSocket.on('close', resolve);

          setTimeout(resolve, 2000);
        });

        localSocket.destroy();
      } finally {
        await client.stop();
      }
    });
  });

  describe('Connection Management', () => {
    test('should properly clean up connections on local client disconnect', async () => {
      const mockProxy = new MockProxyServer(9106);
      await mockProxy.start();

      const client = new ProxyClient({
        serverHost: '127.0.0.1',
        serverPort: 9106,
        localPort: 9107,
        verbosity: 0
      });

      try {
        await client.start();

        const localSocket = net.createConnection(9107, '127.0.0.1');

        await new Promise((resolve) => {
          localSocket.on('connect', resolve);
        });

        // Verify connection was added
        expect(client.getStats().totalConnections).toBe(1);
        expect(client.getStats().activeConnections).toBe(1);

        // Disconnect local client
        localSocket.destroy();

        // Wait for cleanup
        await sleep(100);

        // Verify connection was cleaned up
        expect(client.getStats().activeConnections).toBe(0);

      } finally {
        await client.stop();
        await mockProxy.stop();
      }
    });

    test('should handle invalid WebSocket handshake', async () => {
      const client = new ProxyClient({
        serverHost: '127.0.0.1',
        serverPort: 9090,
        localPort: 9108,
        verbosity: 0
      });

      try {
        await client.start();

        const localSocket = net.createConnection(9108, '127.0.0.1');

        await new Promise((resolve) => {
          localSocket.on('connect', () => {
            // Send invalid handshake (missing WebSocket headers)
            const invalidHandshake = [
              'GET / HTTP/1.1',
              'Host: 127.0.0.1',
              '',
              ''
            ].join('\r\n');

            localSocket.write(invalidHandshake);
          });

          localSocket.on('error', resolve);
          localSocket.on('close', resolve);

          setTimeout(resolve, 500);
        });

      } finally {
        await client.stop();
      }
    });

    test('should handle partial handshake data', async () => {
      const mockProxy = new MockProxyServer(9109);
      await mockProxy.start();

      const client = new ProxyClient({
        serverHost: '127.0.0.1',
        serverPort: 9109,
        localPort: 9110,
        verbosity: 0
      });

      try {
        await client.start();

        const localSocket = net.createConnection(9110, '127.0.0.1');

        await new Promise((resolve) => {
          localSocket.on('connect', () => {
            // Send partial handshake
            localSocket.write('GET / HTTP/1.1\r\n');

            setTimeout(() => {
              // Send rest of handshake
              const restOfHandshake = [
                'Host: 127.0.0.1',
                'Upgrade: websocket',
                'Connection: Upgrade',
                'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
                'Sec-WebSocket-Version: 13',
                '',
                ''
              ].join('\r\n');

              localSocket.write(restOfHandshake);
            }, 100);
          });

          localSocket.on('error', resolve);
          localSocket.on('close', resolve);

          setTimeout(resolve, 1000);
        });

        localSocket.destroy();

      } finally {
        await client.stop();
        await mockProxy.stop();
      }
    });

    test('should handle timeout on remote connection', async () => {
      const client = new ProxyClient({
        serverHost: '127.0.0.1',
        serverPort: 9111,
        localPort: 9112,
        verbosity: 0
      });

      try {
        await client.start();

        const localSocket = net.createConnection(9112, '127.0.0.1');

        const handshakeRequest = [
          'GET / HTTP/1.1',
          'Host: 127.0.0.1',
          'Upgrade: websocket',
          'Connection: Upgrade',
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version: 13',
          '',
          ''
        ].join('\r\n');

        await new Promise((resolve) => {
          localSocket.on('connect', () => {
            localSocket.write(handshakeRequest);
          });

          localSocket.on('error', resolve);
          localSocket.on('close', resolve);

          setTimeout(resolve, 1000);
        });

        localSocket.destroy();
      } finally {
        await client.stop();
      }
    });
  });

  describe('Statistics', () => {
    test('should track connection statistics correctly', async () => {
      const mockProxy = new MockProxyServer(9113);
      await mockProxy.start();

      const client = new ProxyClient({
        serverHost: '127.0.0.1',
        serverPort: 9113,
        localPort: 9114,
        verbosity: 0
      });

      try {
        await client.start();

        // Create multiple connections
        const sockets = [];
        for (let i = 0; i < 3; i++) {
          const socket = net.createConnection(9114, '127.0.0.1');
          sockets.push(socket);

          await new Promise((resolve) => {
            socket.on('connect', resolve);
          });
        }

        // Check stats
        const stats = client.getStats();
        expect(stats.totalConnections).toBe(3);
        expect(stats.activeConnections).toBe(3);

        // Close one connection
        sockets[0].destroy();
        await sleep(100);

        const updatedStats = client.getStats();
        expect(updatedStats.totalConnections).toBe(3);
        expect(updatedStats.activeConnections).toBe(2);

        // Cleanup remaining connections
        for (let i = 1; i < sockets.length; i++) {
          sockets[i].destroy();
        }

      } finally {
        await client.stop();
        await mockProxy.stop();
      }
    });
  });

  describe('Stop functionality', () => {
    test('should stop gracefully when no server is running', async () => {
      const client = new ProxyClient({
        serverHost: '127.0.0.1',
        serverPort: 9090,
        localPort: 9115,
        verbosity: 0
      });

      // Should not throw when stopping without starting
      await expect(client.stop()).resolves.toBeUndefined();
    });

    test('should clean up all connections when stopping', async () => {
      const mockProxy = new MockProxyServer(9116);
      await mockProxy.start();

      const client = new ProxyClient({
        serverHost: '127.0.0.1',
        serverPort: 9116,
        localPort: 9117,
        verbosity: 0
      });

      try {
        await client.start();

        // Create connection
        const socket = net.createConnection(9117, '127.0.0.1');
        await new Promise((resolve) => {
          socket.on('connect', resolve);
        });

        expect(client.getStats().activeConnections).toBe(1);

        // Stop client
        await client.stop();

        // Verify all connections are cleaned up
        expect(client.getStats().activeConnections).toBe(0);

      } finally {
        await mockProxy.stop();
      }
    });
  });
});
