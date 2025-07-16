#!/usr/bin/env node

const { main } = require('../index.js');

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
