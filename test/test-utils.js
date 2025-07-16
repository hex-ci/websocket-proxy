const net = require('net');

class PortManager {
  constructor() {
    this.usedPorts = new Set();
    this.basePort = 50000; // Start from a higher port range for tests
  }

  async getAvailablePort() {
    for (let port = this.basePort; port < 65535; port++) {
      if (!this.usedPorts.has(port) && await this.isPortAvailable(port)) {
        this.usedPorts.add(port);
        return port;
      }
    }
    throw new Error('No available ports found');
  }

  releasePort(port) {
    this.usedPorts.delete(port);
  }

  isPortAvailable(port) {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.listen(port, '127.0.0.1', () => {
        server.close(() => {
          resolve(true);
        });
      });

      server.on('error', () => {
        resolve(false);
      });
    });
  }

  async getPortPair() {
    const port1 = await this.getAvailablePort();
    const port2 = await this.getAvailablePort();
    return { port1, port2 };
  }

  async getPortTriple() {
    const port1 = await this.getAvailablePort();
    const port2 = await this.getAvailablePort();
    const port3 = await this.getAvailablePort();
    return { port1, port2, port3 };
  }
}

// Global port manager instance for tests
const portManager = new PortManager();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

module.exports = {
  PortManager,
  portManager,
  sleep,
  waitForConnection
};