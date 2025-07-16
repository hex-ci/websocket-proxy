const net = require('net');
const WebSocketFrame = require('./websocket');
const Logger = require('./logger');

class ProxyServer {
  constructor(config) {
    this.config = config;
    this.logger = new Logger(config.verbosity);
    this.proxyServer = null;
    this.connections = new Map();
    this.connectionId = 0;
  }

  start() {
    return new Promise((resolve, reject) => {
      if (this.proxyServer) {
        reject(new Error('Server is already running'));
        return;
      }

      this.proxyServer = net.createServer();

      this.proxyServer.on('connection', (clientSocket) => {
        this.handleConnection(clientSocket);
      });

      this.proxyServer.on('error', (error) => {
        this.logger.error(`Proxy server error: ${error.message}`);
        this.proxyServer = null; // Reset server state on error
        reject(error);
      });

      this.proxyServer.listen(this.config.proxyPort, '0.0.0.0', (error) => {
        if (error) {
          this.logger.error(`Failed to start proxy server: ${error.message}`);
          this.proxyServer = null;
          reject(error);
          return;
        }

        this.logger.info(`Proxy server listening on 0.0.0.0:${this.config.proxyPort}`);
        this.logger.info(`Proxying to local WebSocket service at 127.0.0.1:${this.config.localPort}`);
        resolve();
      });
    });
  }

  handleConnection(clientSocket) {
    const connId = ++this.connectionId;
    this.logger.debug(`New client connection ${connId} from ${clientSocket.remoteAddress}:${clientSocket.remotePort}`);

    let localSocket = null;
    let handshakeComplete = false;
    let buffer = Buffer.alloc(0);

    const cleanup = () => {
      this.connections.delete(connId);
      if (localSocket && !localSocket.destroyed) {
        localSocket.destroy();
      }
      if (clientSocket && !clientSocket.destroyed) {
        clientSocket.destroy();
      }
      this.logger.debug(`Connection ${connId} cleaned up`);
    };

    clientSocket.on('data', (data) => {
      this.logger.trace(`Client ${connId} sent ${data.length} bytes`);

      if (!handshakeComplete) {
        buffer = Buffer.concat([buffer, data]);

        const handshakeEnd = buffer.indexOf('\r\n\r\n');
        if (handshakeEnd !== -1) {
          const handshakeData = buffer.slice(0, handshakeEnd + 4);
          const remainingData = buffer.slice(handshakeEnd + 4);

          const handshake = WebSocketFrame.parseHandshake(handshakeData);

          if (handshake.isWebSocket && handshake.key) {
            localSocket = this.connectToLocal(connId, clientSocket, handshake, remainingData);
            handshakeComplete = true;
          } else {
            this.logger.warn(`Invalid WebSocket handshake from client ${connId}`);
            cleanup();
            return;
          }
        }
      } else if (localSocket) {
        localSocket.write(data);
      }
    });

    clientSocket.on('error', (error) => {
      this.logger.debug(`Client ${connId} error: ${error.message}`);
      cleanup();
    });

    clientSocket.on('close', () => {
      this.logger.debug(`Client ${connId} disconnected`);
      cleanup();
    });

    this.connections.set(connId, { clientSocket, localSocket, cleanup });
  }

  connectToLocal(connId, clientSocket, handshake, remainingData) {
    const newLocalSocket = net.createConnection(this.config.localPort, '127.0.0.1');

    newLocalSocket.setTimeout(10000);

    newLocalSocket.on('connect', () => {
      this.logger.debug(`Connected to local WebSocket service for client ${connId}`);

      const handshakeRequest = [
        'GET / HTTP/1.1',
        'Host: 127.0.0.1',
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Key: ' + handshake.key,
        'Sec-WebSocket-Version: 13',
        '',
        ''
      ].join('\r\n');

      newLocalSocket.write(handshakeRequest);

      if (remainingData.length > 0) {
        newLocalSocket.write(remainingData);
      }
    });

    newLocalSocket.on('data', (data) => {
      this.logger.trace(`Local service sent ${data.length} bytes to client ${connId}`);
      clientSocket.write(data);
    });

    newLocalSocket.on('timeout', () => {
      this.logger.warn(`Connection timeout to local service for client ${connId}`);
      const connection = this.connections.get(connId);
      if (connection) {
        connection.cleanup();
      }
    });

    newLocalSocket.on('error', (error) => {
      if (error.code === 'ECONNREFUSED') {
        this.logger.error(`Local WebSocket service not available on port ${this.config.localPort}`);
      } else {
        this.logger.debug(`Local connection ${connId} error: ${error.message}`);
      }
      const connection = this.connections.get(connId);
      if (connection) {
        connection.cleanup();
      }
    });

    newLocalSocket.on('close', () => {
      this.logger.debug(`Local connection ${connId} closed`);
      const connection = this.connections.get(connId);
      if (connection) {
        connection.cleanup();
      }
    });

    const connection = this.connections.get(connId);
    if (connection) {
      connection.localSocket = newLocalSocket;
    }

    return newLocalSocket;
  }

  stop() {
    return new Promise((resolve) => {
      this.logger.info('Stopping proxy server...');

      for (const connection of this.connections.values()) {
        connection.cleanup();
      }
      this.connections.clear();

      if (this.proxyServer) {
        this.proxyServer.close(() => {
          this.logger.info('Proxy server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getStats() {
    return {
      activeConnections: this.connections.size,
      totalConnections: this.connectionId
    };
  }
}

module.exports = ProxyServer;
