const net = require('net');
const ProxyServer = require('../lib/server');

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('ProxyServer', () => {
  describe('Constructor', () => {
    test('should initialize with proper defaults', () => {
      const config = {
        localPort: 8080,
        proxyPort: 9090,
        verbosity: 1
      };

      const server = new ProxyServer(config);

      expect(server.config).toBe(config);
      expect(server.proxyServer).toBeNull();
      expect(server.connections).toBeInstanceOf(Map);
      expect(server.connectionId).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle port already in use error', async () => {
      const mockWS = new MockWebSocketServer(38100);
      await mockWS.start();

      const server1 = new ProxyServer({
        localPort: 38100,
        proxyPort: 9300,
        verbosity: 0
      });

      const server2 = new ProxyServer({
        localPort: 38100,
        proxyPort: 9300,  // Same port - should fail
        verbosity: 0
      });

      try {
        await server1.start();
        await expect(server2.start()).rejects.toThrow();
      } finally {
        await server1.stop();
        await mockWS.stop();
      }
    });

    test('should handle invalid proxy port error', async () => {
      const server = new ProxyServer({
        localPort: 37989,
        proxyPort: 99999,  // Invalid port
        verbosity: 0
      });

      await expect(server.start()).rejects.toThrow();
    });

    test('should handle local service unavailable', async () => {
      const server = new ProxyServer({
        localPort: 65534,  // No service running on this port
        proxyPort: 9301,
        verbosity: 0
      });

      try {
        await server.start();

        // Try to connect to proxy - should fail when it tries to connect to local service
        const clientSocket = net.createConnection(9301, '127.0.0.1');

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
          clientSocket.on('connect', () => {
            clientSocket.write(handshakeRequest);
          });

          clientSocket.on('error', resolve);
          clientSocket.on('close', resolve);

          setTimeout(resolve, 1000);
        });

        clientSocket.destroy();
      } finally {
        await server.stop();
      }
    });
  });

  describe('Connection Management', () => {
    test('should properly clean up connections on client disconnect', async () => {
      const mockWS = new MockWebSocketServer(38101);
      await mockWS.start();

      const server = new ProxyServer({
        localPort: 38101,
        proxyPort: 9302,
        verbosity: 0
      });

      try {
        await server.start();

        const clientSocket = net.createConnection(9302, '127.0.0.1');

        await new Promise((resolve) => {
          clientSocket.on('connect', resolve);
        });

        // Verify connection was added
        expect(server.getStats().totalConnections).toBe(1);
        expect(server.getStats().activeConnections).toBe(1);

        // Disconnect client
        clientSocket.destroy();

        // Wait for cleanup
        await sleep(100);

        // Verify connection was cleaned up
        expect(server.getStats().activeConnections).toBe(0);

      } finally {
        await server.stop();
        await mockWS.stop();
      }
    });

    test('should handle invalid WebSocket handshake', async () => {
      const server = new ProxyServer({
        localPort: 38102,
        proxyPort: 9303,
        verbosity: 0
      });

      try {
        await server.start();

        const clientSocket = net.createConnection(9303, '127.0.0.1');

        await new Promise((resolve) => {
          clientSocket.on('connect', () => {
            // Send invalid handshake (missing WebSocket headers)
            const invalidHandshake = [
              'GET / HTTP/1.1',
              'Host: 127.0.0.1',
              '',
              ''
            ].join('\r\n');

            clientSocket.write(invalidHandshake);
          });

          clientSocket.on('error', resolve);
          clientSocket.on('close', resolve);

          setTimeout(resolve, 500);
        });

      } finally {
        await server.stop();
      }
    });

    test('should handle partial handshake data', async () => {
      const server = new ProxyServer({
        localPort: 38103,
        proxyPort: 9304,
        verbosity: 0
      });

      try {
        await server.start();

        const clientSocket = net.createConnection(9304, '127.0.0.1');

        await new Promise((resolve) => {
          clientSocket.on('connect', () => {
            // Send partial handshake
            clientSocket.write('GET / HTTP/1.1\r\n');

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

              clientSocket.write(restOfHandshake);
            }, 100);
          });

          clientSocket.on('error', resolve);
          clientSocket.on('close', resolve);

          setTimeout(resolve, 1000);
        });

        clientSocket.destroy();

      } finally {
        await server.stop();
      }
    });
  });

  describe('Statistics', () => {
    test('should track connection statistics correctly', async () => {
      const mockWS = new MockWebSocketServer(38105);
      await mockWS.start();

      const server = new ProxyServer({
        localPort: 38105,
        proxyPort: 9305,
        verbosity: 0
      });

      try {
        await server.start();

        // Create multiple connections
        const sockets = [];
        for (let i = 0; i < 3; i++) {
          const socket = net.createConnection(9305, '127.0.0.1');
          sockets.push(socket);

          await new Promise((resolve) => {
            socket.on('connect', resolve);
          });
        }

        // Check stats
        const stats = server.getStats();
        expect(stats.totalConnections).toBe(3);
        expect(stats.activeConnections).toBe(3);

        // Close one connection
        sockets[0].destroy();
        await sleep(100);

        const updatedStats = server.getStats();
        expect(updatedStats.totalConnections).toBe(3);
        expect(updatedStats.activeConnections).toBe(2);

        // Cleanup remaining connections
        for (let i = 1; i < sockets.length; i++) {
          sockets[i].destroy();
        }

      } finally {
        await server.stop();
        await mockWS.stop();
      }
    });
  });

  describe('Stop functionality', () => {
    test('should stop gracefully when no server is running', async () => {
      const server = new ProxyServer({
        localPort: 37989,
        proxyPort: 9101,
        verbosity: 0
      });

      // Should not throw when stopping without starting
      await expect(server.stop()).resolves.toBeUndefined();
    });

    test('should clean up all connections when stopping', async () => {
      const mockWS = new MockWebSocketServer(38106);
      await mockWS.start();

      const server = new ProxyServer({
        localPort: 38106,
        proxyPort: 9306,
        verbosity: 0
      });

      try {
        await server.start();

        // Create connection
        const socket = net.createConnection(9306, '127.0.0.1');
        await new Promise((resolve) => {
          socket.on('connect', resolve);
        });

        expect(server.getStats().activeConnections).toBe(1);

        // Stop server
        await server.stop();

        // Verify all connections are cleaned up
        expect(server.getStats().activeConnections).toBe(0);

      } finally {
        await mockWS.stop();
      }
    });
  });
});
