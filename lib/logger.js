class Logger {
  constructor(level = 0) {
    this.level = level;
  }

  setLevel(level) {
    this.level = level;
  }

  log(message, minLevel = 1) {
    if (this.level >= minLevel) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ${message}`);
    }
  }

  info(message) {
    this.log(`INFO: ${message}`, 1);
  }

  debug(message) {
    this.log(`DEBUG: ${message}`, 2);
  }

  trace(message) {
    this.log(`TRACE: ${message}`, 3);
  }

  error(message) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ERROR: ${message}`);
  }

  warn(message) {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] WARN: ${message}`);
  }
}

module.exports = Logger;
