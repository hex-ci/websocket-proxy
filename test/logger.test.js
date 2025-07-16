const Logger = require('../lib/logger');

describe('Logger', () => {
  let originalConsoleLog;
  let originalConsoleError;
  let originalConsoleWarn;
  let logOutput;
  let errorOutput;
  let warnOutput;
  let mockDate;

  beforeEach(() => {
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    originalConsoleWarn = console.warn;
    
    logOutput = [];
    errorOutput = [];
    warnOutput = [];
    
    console.log = (...args) => logOutput.push(args.join(' '));
    console.error = (...args) => errorOutput.push(args.join(' '));
    console.warn = (...args) => warnOutput.push(args.join(' '));

    // Mock Date.toISOString to have predictable timestamps in tests
    mockDate = '2023-01-01T12:00:00.000Z';
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockDate);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with default level 0', () => {
      const logger = new Logger();
      expect(logger.level).toBe(0);
    });

    test('should initialize with custom level', () => {
      const logger = new Logger(2);
      expect(logger.level).toBe(2);
    });
  });

  describe('setLevel', () => {
    test('should update logger level', () => {
      const logger = new Logger(0);
      logger.setLevel(3);
      expect(logger.level).toBe(3);
    });

    test('should allow setting level to 0', () => {
      const logger = new Logger(2);
      logger.setLevel(0);
      expect(logger.level).toBe(0);
    });
  });

  describe('log', () => {
    test('should log message when level is sufficient', () => {
      const logger = new Logger(1);
      logger.log('Test message', 1);

      expect(logOutput).toHaveLength(1);
      expect(logOutput[0]).toBe(`[${mockDate}] Test message`);
    });

    test('should not log message when level is insufficient', () => {
      const logger = new Logger(0);
      logger.log('Test message', 1);

      expect(logOutput).toHaveLength(0);
    });

    test('should log message when level exceeds required', () => {
      const logger = new Logger(3);
      logger.log('Test message', 2);

      expect(logOutput).toHaveLength(1);
      expect(logOutput[0]).toBe(`[${mockDate}] Test message`);
    });

    test('should use default minLevel of 1', () => {
      const logger = new Logger(1);
      logger.log('Test message'); // No minLevel specified

      expect(logOutput).toHaveLength(1);
      expect(logOutput[0]).toBe(`[${mockDate}] Test message`);
    });

    test('should not log when level is 0 and default minLevel is used', () => {
      const logger = new Logger(0);
      logger.log('Test message'); // minLevel defaults to 1

      expect(logOutput).toHaveLength(0);
    });

    test('should handle minLevel of 0', () => {
      const logger = new Logger(0);
      logger.log('Test message', 0);

      expect(logOutput).toHaveLength(1);
      expect(logOutput[0]).toBe(`[${mockDate}] Test message`);
    });
  });

  describe('info', () => {
    test('should log info message at level 1', () => {
      const logger = new Logger(1);
      logger.info('Info message');

      expect(logOutput).toHaveLength(1);
      expect(logOutput[0]).toBe(`[${mockDate}] INFO: Info message`);
    });

    test('should not log info message at level 0', () => {
      const logger = new Logger(0);
      logger.info('Info message');

      expect(logOutput).toHaveLength(0);
    });

    test('should log info message at higher levels', () => {
      const logger = new Logger(3);
      logger.info('Info message');

      expect(logOutput).toHaveLength(1);
      expect(logOutput[0]).toBe(`[${mockDate}] INFO: Info message`);
    });
  });

  describe('debug', () => {
    test('should log debug message at level 2', () => {
      const logger = new Logger(2);
      logger.debug('Debug message');

      expect(logOutput).toHaveLength(1);
      expect(logOutput[0]).toBe(`[${mockDate}] DEBUG: Debug message`);
    });

    test('should not log debug message at level 1', () => {
      const logger = new Logger(1);
      logger.debug('Debug message');

      expect(logOutput).toHaveLength(0);
    });

    test('should log debug message at level 3', () => {
      const logger = new Logger(3);
      logger.debug('Debug message');

      expect(logOutput).toHaveLength(1);
      expect(logOutput[0]).toBe(`[${mockDate}] DEBUG: Debug message`);
    });
  });

  describe('trace', () => {
    test('should log trace message at level 3', () => {
      const logger = new Logger(3);
      logger.trace('Trace message');

      expect(logOutput).toHaveLength(1);
      expect(logOutput[0]).toBe(`[${mockDate}] TRACE: Trace message`);
    });

    test('should not log trace message at level 2', () => {
      const logger = new Logger(2);
      logger.trace('Trace message');

      expect(logOutput).toHaveLength(0);
    });

    test('should not log trace message at level 0', () => {
      const logger = new Logger(0);
      logger.trace('Trace message');

      expect(logOutput).toHaveLength(0);
    });
  });

  describe('error', () => {
    test('should always log error messages regardless of level', () => {
      const logger = new Logger(0);
      logger.error('Error message');

      expect(errorOutput).toHaveLength(1);
      expect(errorOutput[0]).toBe(`[${mockDate}] ERROR: Error message`);
    });

    test('should log error messages at any level', () => {
      [0, 1, 2, 3].forEach(level => {
        errorOutput = []; // Reset for each test
        const logger = new Logger(level);
        logger.error('Error message');

        expect(errorOutput).toHaveLength(1);
        expect(errorOutput[0]).toBe(`[${mockDate}] ERROR: Error message`);
      });
    });

    test('should use console.error for error messages', () => {
      const logger = new Logger(0);
      logger.error('Error message');

      expect(logOutput).toHaveLength(0); // Should not go to console.log
      expect(errorOutput).toHaveLength(1);
    });
  });

  describe('warn', () => {
    test('should always log warning messages regardless of level', () => {
      const logger = new Logger(0);
      logger.warn('Warning message');

      expect(warnOutput).toHaveLength(1);
      expect(warnOutput[0]).toBe(`[${mockDate}] WARN: Warning message`);
    });

    test('should log warning messages at any level', () => {
      [0, 1, 2, 3].forEach(level => {
        warnOutput = []; // Reset for each test
        const logger = new Logger(level);
        logger.warn('Warning message');

        expect(warnOutput).toHaveLength(1);
        expect(warnOutput[0]).toBe(`[${mockDate}] WARN: Warning message`);
      });
    });

    test('should use console.warn for warning messages', () => {
      const logger = new Logger(0);
      logger.warn('Warning message');

      expect(logOutput).toHaveLength(0); // Should not go to console.log
      expect(warnOutput).toHaveLength(1);
    });
  });

  describe('Timestamp formatting', () => {
    test('should include timestamp in all messages', () => {
      const logger = new Logger(3);
      
      logger.info('Info');
      logger.debug('Debug');
      logger.trace('Trace');
      logger.error('Error');
      logger.warn('Warn');

      expect(logOutput[0]).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
      expect(logOutput[1]).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
      expect(logOutput[2]).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
      expect(errorOutput[0]).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
      expect(warnOutput[0]).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
    });
  });

  describe('Level behavior combinations', () => {
    test('should respect level hierarchy (level 1)', () => {
      const logger = new Logger(1);
      
      logger.info('Info');    // Should log (level 1)
      logger.debug('Debug');  // Should not log (level 2)
      logger.trace('Trace');  // Should not log (level 3)
      logger.error('Error');  // Should always log
      logger.warn('Warn');    // Should always log

      expect(logOutput).toHaveLength(1);
      expect(errorOutput).toHaveLength(1);
      expect(warnOutput).toHaveLength(1);
    });

    test('should respect level hierarchy (level 2)', () => {
      const logger = new Logger(2);
      
      logger.info('Info');    // Should log (level 1)
      logger.debug('Debug');  // Should log (level 2)
      logger.trace('Trace');  // Should not log (level 3)
      logger.error('Error');  // Should always log
      logger.warn('Warn');    // Should always log

      expect(logOutput).toHaveLength(2);
      expect(errorOutput).toHaveLength(1);
      expect(warnOutput).toHaveLength(1);
    });

    test('should respect level hierarchy (level 3)', () => {
      const logger = new Logger(3);
      
      logger.info('Info');    // Should log (level 1)
      logger.debug('Debug');  // Should log (level 2)
      logger.trace('Trace');  // Should log (level 3)
      logger.error('Error');  // Should always log
      logger.warn('Warn');    // Should always log

      expect(logOutput).toHaveLength(3);
      expect(errorOutput).toHaveLength(1);
      expect(warnOutput).toHaveLength(1);
    });
  });

  describe('Message content', () => {
    test('should handle empty messages', () => {
      const logger = new Logger(1);
      logger.info('');

      expect(logOutput).toHaveLength(1);
      expect(logOutput[0]).toBe(`[${mockDate}] INFO: `);
    });

    test('should handle messages with special characters', () => {
      const logger = new Logger(1);
      const specialMessage = 'Message with "quotes" and \\backslashes\\ and newlines\n';
      logger.info(specialMessage);

      expect(logOutput).toHaveLength(1);
      expect(logOutput[0]).toBe(`[${mockDate}] INFO: ${specialMessage}`);
    });

    test('should handle numeric and object messages', () => {
      const logger = new Logger(1);
      logger.info(123);
      logger.info({ key: 'value' });

      expect(logOutput).toHaveLength(2);
      expect(logOutput[0]).toBe(`[${mockDate}] INFO: 123`);
      expect(logOutput[1]).toBe(`[${mockDate}] INFO: [object Object]`);
    });
  });

  describe('Performance and edge cases', () => {
    test('should not call Date constructor for filtered messages', () => {
      const logger = new Logger(0);
      const dateConstructorSpy = jest.spyOn(Date.prototype, 'toISOString');
      
      logger.info('This should not log');
      logger.debug('This should not log');
      logger.trace('This should not log');

      expect(dateConstructorSpy).not.toHaveBeenCalled();
    });

    test('should handle rapid successive calls', () => {
      const logger = new Logger(3);
      
      for (let i = 0; i < 100; i++) {
        logger.info(`Message ${i}`);
      }

      expect(logOutput).toHaveLength(100);
    });

    test('should handle level changes during operation', () => {
      const logger = new Logger(0);
      
      logger.info('Level 0 - should not log');
      logger.setLevel(1);
      logger.info('Level 1 - should log');
      logger.setLevel(0);
      logger.info('Back to level 0 - should not log');

      expect(logOutput).toHaveLength(1);
      expect(logOutput[0]).toContain('Level 1 - should log');
    });
  });
});