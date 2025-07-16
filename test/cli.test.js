const CLI = require('../lib/cli');

describe('CLI', () => {
  let originalArgv;
  let originalConsoleLog;
  let originalConsoleError;
  let originalProcessExit;
  
  beforeEach(() => {
    originalArgv = process.argv;
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    originalProcessExit = process.exit;
  });

  afterEach(() => {
    process.argv = originalArgv;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.exit = originalProcessExit;
  });

  describe('Constructor', () => {
    test('should initialize with process arguments', () => {
      process.argv = ['node', 'script.js', 'server', '--port', '8080'];
      const cli = new CLI();
      
      expect(cli.args).toEqual(['server', '--port', '8080']);
      expect(cli.logger).toBeDefined();
    });
  });

  describe('parseArgs', () => {
    test('should parse server mode with default values', () => {
      process.argv = ['node', 'script.js', 'server'];
      const cli = new CLI();
      const config = cli.parseArgs();

      expect(config.mode).toBe('server');
      expect(config.localPort).toBe(37989);
      expect(config.proxyPort).toBe(9090);
      expect(config.serverHost).toBe('localhost');
      expect(config.serverPort).toBe(9090);
      expect(config.verbosity).toBe(0);
      expect(config.help).toBe(false);
    });

    test('should parse client mode with default values', () => {
      process.argv = ['node', 'script.js', 'client'];
      const cli = new CLI();
      const config = cli.parseArgs();

      expect(config.mode).toBe('client');
    });

    test('should parse all long form options', () => {
      process.argv = [
        'node', 'script.js', 'server',
        '--local-port', '8080',
        '--proxy-port', '9091',
        '--server-host', 'example.com',
        '--server-port', '9092'
      ];
      
      const cli = new CLI();
      const config = cli.parseArgs();

      expect(config.localPort).toBe(8080);
      expect(config.proxyPort).toBe(9091);
      expect(config.serverHost).toBe('example.com');
      expect(config.serverPort).toBe(9092);
    });

    test('should parse all short form options', () => {
      process.argv = [
        'node', 'script.js', 'client',
        '-l', '8080',
        '-p', '9091',
        '-h', 'example.com',
        '-s', '9092'
      ];
      
      const cli = new CLI();
      const config = cli.parseArgs();

      expect(config.localPort).toBe(8080);
      expect(config.proxyPort).toBe(9091);
      expect(config.serverHost).toBe('example.com');
      expect(config.serverPort).toBe(9092);
    });

    test('should parse verbosity levels', () => {
      const testCases = [
        { args: ['-v'], expected: 1 },
        { args: ['-vv'], expected: 2 },
        { args: ['-vvv'], expected: 3 }
      ];

      testCases.forEach(({ args, expected }) => {
        process.argv = ['node', 'script.js', 'server', ...args];
        const cli = new CLI();
        const config = cli.parseArgs();
        expect(config.verbosity).toBe(expected);
      });
    });

    test('should parse help option', () => {
      process.argv = ['node', 'script.js', '--help'];
      const cli = new CLI();
      const config = cli.parseArgs();

      expect(config.help).toBe(true);
    });

    test('should handle mixed order arguments', () => {
      process.argv = [
        'node', 'script.js',
        '-l', '8080',
        'server',
        '-vv',
        '--proxy-port', '9091'
      ];
      
      const cli = new CLI();
      const config = cli.parseArgs();

      expect(config.mode).toBe('server');
      expect(config.localPort).toBe(8080);
      expect(config.proxyPort).toBe(9091);
      expect(config.verbosity).toBe(2);
    });

    test('should handle unknown options', () => {
      let exitCode = null;
      let errorMessage = '';

      process.exit = (code) => { exitCode = code; };
      console.error = (msg) => { errorMessage = msg; };

      process.argv = ['node', 'script.js', 'server', '--unknown'];
      
      const cli = new CLI();
      cli.parseArgs();

      expect(exitCode).toBe(1);
      expect(errorMessage).toBe('Unknown option: --unknown');
    });

    test('should ignore non-option arguments', () => {
      process.argv = ['node', 'script.js', 'server', 'extra-arg', '--local-port', '8080'];
      
      const cli = new CLI();
      const config = cli.parseArgs();

      expect(config.mode).toBe('server');
      expect(config.localPort).toBe(8080);
    });

    test('should set logger level based on verbosity', () => {
      process.argv = ['node', 'script.js', 'server', '-vv'];
      
      const cli = new CLI();
      const setLevelSpy = jest.spyOn(cli.logger, 'setLevel');
      
      const config = cli.parseArgs();

      expect(setLevelSpy).toHaveBeenCalledWith(2);
      expect(config.verbosity).toBe(2);
    });
  });

  describe('showHelp', () => {
    test('should display help message', () => {
      let helpOutput = '';
      console.log = (msg) => { helpOutput += msg + '\n'; };

      const cli = new CLI();
      cli.showHelp();

      expect(helpOutput).toContain('WebSocket Proxy CLI');
      expect(helpOutput).toContain('Usage:');
      expect(helpOutput).toContain('ws-proxy server [options]');
      expect(helpOutput).toContain('ws-proxy client [options]');
      expect(helpOutput).toContain('Server Mode Options:');
      expect(helpOutput).toContain('Client Mode Options:');
      expect(helpOutput).toContain('Global Options:');
      expect(helpOutput).toContain('Examples:');
    });
  });

  describe('validate', () => {
    test('should validate correct server config', () => {
      const cli = new CLI();
      const config = {
        mode: 'server',
        localPort: 8080,
        proxyPort: 9090,
        serverPort: 9090
      };

      expect(cli.validate(config)).toBe(true);
    });

    test('should validate correct client config', () => {
      const cli = new CLI();
      const config = {
        mode: 'client',
        localPort: 8080,
        proxyPort: 9090,
        serverPort: 9090
      };

      expect(cli.validate(config)).toBe(true);
    });

    test('should reject missing mode', () => {
      let errorMessage = '';
      console.error = (msg) => { errorMessage = msg; };

      const cli = new CLI();
      const config = {
        mode: null,
        localPort: 8080,
        proxyPort: 9090,
        serverPort: 9090
      };

      expect(cli.validate(config)).toBe(false);
      expect(errorMessage).toBe('Mode is required (server or client)');
    });

    test('should reject invalid mode', () => {
      let errorMessage = '';
      console.error = (msg) => { errorMessage = msg; };

      const cli = new CLI();
      const config = {
        mode: 'invalid',
        localPort: 8080,
        proxyPort: 9090,
        serverPort: 9090
      };

      expect(cli.validate(config)).toBe(false);
      expect(errorMessage).toBe('Mode must be either "server" or "client"');
    });

    test('should reject invalid local port ranges', () => {
      const cli = new CLI();
      let errorMessage = '';
      console.error = (msg) => { errorMessage = msg; };

      const invalidPorts = [0, -1, 65536, 100000];
      
      invalidPorts.forEach(port => {
        errorMessage = '';
        const config = {
          mode: 'server',
          localPort: port,
          proxyPort: 9090,
          serverPort: 9090
        };

        expect(cli.validate(config)).toBe(false);
        expect(errorMessage).toBe('Local port must be a valid integer between 1 and 65535');
      });
    });

    test('should reject invalid proxy port ranges', () => {
      const cli = new CLI();
      let errorMessage = '';
      console.error = (msg) => { errorMessage = msg; };

      const invalidPorts = [0, -1, 65536, 100000];
      
      invalidPorts.forEach(port => {
        errorMessage = '';
        const config = {
          mode: 'server',
          localPort: 8080,
          proxyPort: port,
          serverPort: 9090
        };

        expect(cli.validate(config)).toBe(false);
        expect(errorMessage).toBe('Proxy port must be a valid integer between 1 and 65535');
      });
    });

    test('should reject invalid server port ranges', () => {
      const cli = new CLI();
      let errorMessage = '';
      console.error = (msg) => { errorMessage = msg; };

      const invalidPorts = [0, -1, 65536, 100000];
      
      invalidPorts.forEach(port => {
        errorMessage = '';
        const config = {
          mode: 'client',
          localPort: 8080,
          proxyPort: 9090,
          serverPort: port
        };

        expect(cli.validate(config)).toBe(false);
        expect(errorMessage).toBe('Server port must be a valid integer between 1 and 65535');
      });
    });

    test('should accept valid port ranges', () => {
      const cli = new CLI();
      
      const validPorts = [1, 80, 443, 8080, 9090, 65535];
      
      validPorts.forEach(port => {
        const config = {
          mode: 'server',
          localPort: port,
          proxyPort: port,
          serverPort: port
        };

        expect(cli.validate(config)).toBe(true);
      });
    });

    test('should handle string ports in validation', () => {
      const cli = new CLI();
      
      // parseArgs converts strings to numbers, but testing edge case
      const config = {
        mode: 'server',
        localPort: NaN, // This is what parseInt would return for 'not-a-number'
        proxyPort: 9090,
        serverPort: 9090
      };

      expect(cli.validate(config)).toBe(false);
    });
  });

  describe('Error handling', () => {
    test('should handle missing argument values', () => {
      let exitCode = null;
      let errorMessage = '';

      process.exit = (code) => { exitCode = code; };
      console.error = (msg) => { errorMessage = msg; };

      process.argv = ['node', 'script.js', 'server', '--local-port'];
      
      const cli = new CLI();
      const config = cli.parseArgs();

      // Should set localPort to NaN when no value is provided
      expect(isNaN(config.localPort)).toBe(true);
    });

    test('should handle empty arguments array', () => {
      process.argv = ['node', 'script.js'];
      
      const cli = new CLI();
      const config = cli.parseArgs();

      expect(config.mode).toBeNull();
      expect(config.verbosity).toBe(0);
    });
  });

  describe('Integration tests', () => {
    test('should work with typical server command', () => {
      process.argv = ['node', 'ws-proxy', 'server', '-l', '8080', '-p', '9090', '-v'];
      
      const cli = new CLI();
      const config = cli.parseArgs();

      expect(cli.validate(config)).toBe(true);
      expect(config.mode).toBe('server');
      expect(config.localPort).toBe(8080);
      expect(config.proxyPort).toBe(9090);
      expect(config.verbosity).toBe(1);
    });

    test('should work with typical client command', () => {
      process.argv = ['node', 'ws-proxy', 'client', '-h', 'example.com', '-s', '9090', '-l', '8080', '-vv'];
      
      const cli = new CLI();
      const config = cli.parseArgs();

      expect(cli.validate(config)).toBe(true);
      expect(config.mode).toBe('client');
      expect(config.serverHost).toBe('example.com');
      expect(config.serverPort).toBe(9090);
      expect(config.localPort).toBe(8080);
      expect(config.verbosity).toBe(2);
    });
  });
});