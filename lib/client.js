const net = require('net');
const WebSocketFrame = require('./websocket');
const Logger = require('./logger');

class ProxyClient {
  constructor(config) {
    this.config = config;
    this.logger = new Logger(config.verbosity);
    this.localServer = null;
    this.connections = new Map();
    this.connectionId = 0;
  }

  start() {
    return new Promise((resolve, reject) => {
      if (this.localServer) {
        reject(new Error('Client is already running'));
        return;
      }

      this.localServer = net.createServer();

      this.localServer.on('connection', (clientSocket) => {
        this.handleLocalConnection(clientSocket);
      });

      this.localServer.on('error', (error) => {
        this.logger.error(`Local server error: ${error.message}`);
        this.localServer = null; // Reset server state on error
        reject(error);
      });

      this.localServer.listen(this.config.localPort, '127.0.0.1', (error) => {
        if (error) {
          this.logger.error(`Failed to start local proxy server: ${error.message}`);
          this.localServer = null;
          reject(error);
          return;
        }

        this.logger.info(`Local proxy server listening on 127.0.0.1:${this.config.localPort}`);
        this.logger.info(`Forwarding to remote proxy at ${this.config.serverHost}:${this.config.serverPort}`);
        resolve();
      });
    });
  }

  handleLocalConnection(clientSocket) {
    const connId = ++this.connectionId;
    this.logger.debug(`New local client connection ${connId}`);

    let remoteSocket = null;
    let handshakeComplete = false;
    let buffer = Buffer.alloc(0);

    const cleanup = () => {
      this.connections.delete(connId);
      if (remoteSocket && !remoteSocket.destroyed) {
        remoteSocket.destroy();
      }
      if (clientSocket && !clientSocket.destroyed) {
        clientSocket.destroy();
      }
      this.logger.debug(`Client connection ${connId} cleaned up`);
    };

    clientSocket.on('data', (data) => {
      this.logger.trace(`Local client ${connId} sent ${data.length} bytes`);

      if (!handshakeComplete) {
        buffer = Buffer.concat([buffer, data]);

        const handshakeEnd = buffer.indexOf('\r\n\r\n');
        if (handshakeEnd !== -1) {
          const handshakeData = buffer.slice(0, handshakeEnd + 4);
          const remainingData = buffer.slice(handshakeEnd + 4);

          const handshake = WebSocketFrame.parseHandshake(handshakeData);

          if (handshake.isWebSocket && handshake.key) {
            remoteSocket = this.connectToRemote(connId, clientSocket, handshakeData, remainingData);
            handshakeComplete = true;
          } else {
            this.logger.warn(`Invalid WebSocket handshake from local client ${connId}`);
            cleanup();
            return;
          }
        }
      } else if (remoteSocket) {
        remoteSocket.write(data);
      }
    });

    clientSocket.on('error', (error) => {
      this.logger.debug(`Local client ${connId} error: ${error.message}`);
      cleanup();
    });

    clientSocket.on('close', () => {
      this.logger.debug(`Local client ${connId} disconnected`);
      cleanup();
    });

    this.connections.set(connId, { clientSocket, remoteSocket, cleanup });
  }

  connectToRemote(connId, clientSocket, handshakeData, remainingData) {
    const newRemoteSocket = net.createConnection(this.config.serverPort, this.config.serverHost);

    newRemoteSocket.setTimeout(10000);

    newRemoteSocket.on('connect', () => {
      this.logger.debug(`Connected to remote proxy server for client ${connId}`);

      newRemoteSocket.write(handshakeData);

      if (remainingData.length > 0) {
        newRemoteSocket.write(remainingData);
      }
    });

    newRemoteSocket.on('data', (data) => {
      this.logger.trace(`Remote proxy sent ${data.length} bytes to local client ${connId}`);
      clientSocket.write(data);
    });

    newRemoteSocket.on('timeout', () => {
      this.logger.warn(`Connection timeout to remote proxy server for client ${connId}`);
      const connection = this.connections.get(connId);
      if (connection) {
        connection.cleanup();
      }
    });

    newRemoteSocket.on('error', (error) => {
      if (error.code === 'ECONNREFUSED') {
        this.logger.error(`Cannot connect to proxy server at ${this.config.serverHost}:${this.config.serverPort}`);
      } else if (error.code === 'ENOTFOUND') {
        this.logger.error(`Proxy server host not found: ${this.config.serverHost}`);
      } else {
        this.logger.debug(`Remote connection ${connId} error: ${error.message}`);
      }
      const connection = this.connections.get(connId);
      if (connection) {
        connection.cleanup();
      }
    });

    newRemoteSocket.on('close', () => {
      this.logger.debug(`Remote connection ${connId} closed`);
      const connection = this.connections.get(connId);
      if (connection) {
        connection.cleanup();
      }
    });

    const connection = this.connections.get(connId);
    if (connection) {
      connection.remoteSocket = newRemoteSocket;
    }

    return newRemoteSocket;
  }

  stop() {
    return new Promise((resolve) => {
      this.logger.info('Stopping local proxy server...');

      for (const connection of this.connections.values()) {
        connection.cleanup();
      }
      this.connections.clear();

      if (this.localServer) {
        this.localServer.close(() => {
          this.logger.info('Local proxy server stopped');
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

module.exports = ProxyClient;
