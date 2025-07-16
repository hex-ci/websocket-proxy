const { ProxyServer, ProxyClient, CLI, createProxy, startProxy, main } = require('../index');

describe('Index Module', () => {
  describe('Main exports', () => {
    test('should export ProxyServer class', () => {
      expect(ProxyServer).toBeDefined();
      expect(typeof ProxyServer).toBe('function');
    });

    test('should export ProxyClient class', () => {
      expect(ProxyClient).toBeDefined();
      expect(typeof ProxyClient).toBe('function');
    });

    test('should export CLI class', () => {
      expect(CLI).toBeDefined();
      expect(typeof CLI).toBe('function');
    });

    test('should export createProxy function', () => {
      expect(createProxy).toBeDefined();
      expect(typeof createProxy).toBe('function');
    });

    test('should export startProxy function', () => {
      expect(startProxy).toBeDefined();
      expect(typeof startProxy).toBe('function');
    });

    test('should export main function', () => {
      expect(main).toBeDefined();
      expect(typeof main).toBe('function');
    });
  });

  describe('createProxy', () => {
    test('should create ProxyServer instance for server mode', () => {
      const config = {
        mode: 'server',
        localPort: 8080,
        proxyPort: 9090,
        verbosity: 0
      };
      const proxy = createProxy(config);
      expect(proxy).toBeInstanceOf(ProxyServer);
    });

    test('should create ProxyClient instance for client mode', () => {
      const config = {
        mode: 'client',
        serverHost: 'localhost',
        serverPort: 9090,
        localPort: 8080,
        verbosity: 0
      };
      const proxy = createProxy(config);
      expect(proxy).toBeInstanceOf(ProxyClient);
    });

    test('should throw error for invalid mode', () => {
      const config = {
        mode: 'invalid',
        localPort: 8080,
        proxyPort: 9090,
        verbosity: 0
      };
      expect(() => createProxy(config)).toThrow('Invalid mode: invalid');
    });
  });

  describe('startProxy', () => {
    test('should handle server mode with mocked console', async () => {
      const mockConsole = {
        log: jest.fn(),
        error: jest.fn()
      };

      const config = {
        mode: 'server',
        localPort: 38000,
        proxyPort: 9200,
        verbosity: 0
      };

      const options = {
        skipSignalHandlers: true,
        skipStatsInterval: true,
        console: mockConsole
      };

      let result;
      try {
        result = await startProxy(config, options);
        expect(mockConsole.log).toHaveBeenCalledWith('Starting WebSocket proxy server...');
        expect(result.proxy).toBeInstanceOf(ProxyServer);
        expect(typeof result.cleanup).toBe('function');
      } finally {
        if (result && result.cleanup) {
          await result.cleanup();
        }
      }
    });

    test('should handle client mode with mocked console', async () => {
      const mockConsole = {
        log: jest.fn(),
        error: jest.fn()
      };

      const config = {
        mode: 'client',
        serverHost: 'localhost',
        serverPort: 9090,
        localPort: 38001,
        verbosity: 0
      };

      const options = {
        skipSignalHandlers: true,
        skipStatsInterval: true,
        console: mockConsole
      };

      let result;
      try {
        result = await startProxy(config, options);
        expect(mockConsole.log).toHaveBeenCalledWith('Starting WebSocket proxy client...');
        expect(result.proxy).toBeInstanceOf(ProxyClient);
        expect(typeof result.cleanup).toBe('function');
      } finally {
        if (result && result.cleanup) {
          await result.cleanup();
        }
      }
    });

    test('should handle stats interval when verbosity >= 2', async () => {
      const mockConsole = {
        log: jest.fn(),
        error: jest.fn()
      };

      const config = {
        mode: 'server',
        localPort: 38002,
        proxyPort: 9202,
        verbosity: 2
      };

      const options = {
        skipSignalHandlers: true,
        console: mockConsole
      };

      let result;
      try {
        result = await startProxy(config, options);
        expect(result.proxy).toBeInstanceOf(ProxyServer);
        expect(typeof result.cleanup).toBe('function');

        // The stats interval should be set up
        expect(result.cleanup).toBeDefined();
      } finally {
        if (result && result.cleanup) {
          await result.cleanup();
        }
      }
    });

    test('should handle startup errors gracefully', async () => {
      const config = {
        mode: 'server',
        localPort: 38003,
        proxyPort: 99999, // Invalid port - out of range
        verbosity: 0
      };

      const options = {
        skipSignalHandlers: true,
        skipStatsInterval: true
      };

      await expect(startProxy(config, options)).rejects.toThrow();
    });
  });

  describe('Legacy instantiation tests', () => {
    test('should create ProxyServer instance with valid config', () => {
      const server = new ProxyServer({
        localPort: 8080,
        proxyPort: 9090,
        verbosity: 0
      });
      expect(server).toBeInstanceOf(ProxyServer);
    });

    test('should create ProxyClient instance with valid config', () => {
      const client = new ProxyClient({
        serverHost: 'localhost',
        serverPort: 9090,
        localPort: 8080,
        verbosity: 0
      });
      expect(client).toBeInstanceOf(ProxyClient);
    });

    test('should create CLI instance', () => {
      const cli = new CLI();
      expect(cli).toBeInstanceOf(CLI);
    });
  });
});