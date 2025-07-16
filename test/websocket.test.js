const WebSocketFrame = require('../lib/websocket');

describe('WebSocketFrame', () => {
  describe('OPCODES constant', () => {
    test('should have correct opcode values', () => {
      expect(WebSocketFrame.OPCODES.CONTINUATION).toBe(0x0);
      expect(WebSocketFrame.OPCODES.TEXT).toBe(0x1);
      expect(WebSocketFrame.OPCODES.BINARY).toBe(0x2);
      expect(WebSocketFrame.OPCODES.CLOSE).toBe(0x8);
      expect(WebSocketFrame.OPCODES.PING).toBe(0x9);
      expect(WebSocketFrame.OPCODES.PONG).toBe(0xa);
    });
  });

  describe('parseFrame', () => {
    test('should return null for buffer less than 2 bytes', () => {
      const buffer = Buffer.from([0x81]);
      const result = WebSocketFrame.parseFrame(buffer);
      expect(result).toBeNull();
    });

    test('should return null for incomplete frame with 126 payload length', () => {
      const buffer = Buffer.from([0x81, 0x7e]); // Missing length bytes
      const result = WebSocketFrame.parseFrame(buffer);
      expect(result).toBeNull();
    });

    test('should return null for incomplete frame with 127 payload length', () => {
      const buffer = Buffer.from([0x81, 0x7f, 0x00, 0x00]); // Missing some length bytes
      const result = WebSocketFrame.parseFrame(buffer);
      expect(result).toBeNull();
    });

    test('should return null for incomplete masked frame', () => {
      const buffer = Buffer.from([0x81, 0x85, 0x00, 0x00]); // Missing mask key bytes
      const result = WebSocketFrame.parseFrame(buffer);
      expect(result).toBeNull();
    });

    test('should return null for incomplete payload', () => {
      const buffer = Buffer.from([0x81, 0x05, 0x48, 0x65]); // Missing payload bytes
      const result = WebSocketFrame.parseFrame(buffer);
      expect(result).toBeNull();
    });

    test('should parse unmasked frame correctly', () => {
      const payload = Buffer.from('Hello');
      const buffer = Buffer.concat([
        Buffer.from([0x81, 0x05]), // FIN=1, opcode=TEXT, not masked, length=5
        payload
      ]);

      const result = WebSocketFrame.parseFrame(buffer);
      expect(result).toBeTruthy();
      expect(result.fin).toBe(true);
      expect(result.opcode).toBe(WebSocketFrame.OPCODES.TEXT);
      expect(result.masked).toBe(false);
      expect(result.payload.toString()).toBe('Hello');
      expect(result.totalLength).toBe(7);
    });

    test('should parse frame with 16-bit length', () => {
      const payload = Buffer.alloc(300, 'A');
      const buffer = Buffer.concat([
        Buffer.from([0x81, 0x7e]), // FIN=1, opcode=TEXT, not masked, length=126 (extended)
        Buffer.from([0x01, 0x2c]), // Length 300 in big-endian
        payload
      ]);

      const result = WebSocketFrame.parseFrame(buffer);
      expect(result).toBeTruthy();
      expect(result.payload.length).toBe(300);
      expect(result.totalLength).toBe(304);
    });

    test('should parse frame with 64-bit length', () => {
      const payload = Buffer.alloc(70000, 'A');
      const buffer = Buffer.concat([
        Buffer.from([0x81, 0x7f]), // FIN=1, opcode=TEXT, not masked, length=127 (extended)
        Buffer.alloc(8), // 64-bit length (will be set manually)
        payload
      ]);
      
      // Set the 64-bit length
      buffer.writeBigUInt64BE(BigInt(70000), 2);

      const result = WebSocketFrame.parseFrame(buffer);
      expect(result).toBeTruthy();
      expect(result.payload.length).toBe(70000);
      expect(result.totalLength).toBe(70010);
    });

    test('should parse masked frame correctly', () => {
      const originalPayload = Buffer.from('Hello');
      const maskKey = Buffer.from([0x37, 0xfa, 0x21, 0x3d]);
      const maskedPayload = Buffer.alloc(5);
      
      // Apply mask
      for (let i = 0; i < originalPayload.length; i++) {
        maskedPayload[i] = originalPayload[i] ^ maskKey[i % 4];
      }

      const buffer = Buffer.concat([
        Buffer.from([0x81, 0x85]), // FIN=1, opcode=TEXT, masked, length=5
        maskKey,
        maskedPayload
      ]);

      const result = WebSocketFrame.parseFrame(buffer);
      expect(result).toBeTruthy();
      expect(result.fin).toBe(true);
      expect(result.opcode).toBe(WebSocketFrame.OPCODES.TEXT);
      expect(result.masked).toBe(true);
      expect(result.payload.toString()).toBe('Hello');
      expect(result.totalLength).toBe(11);
    });

    test('should parse continuation frame', () => {
      const payload = Buffer.from('continued');
      const buffer = Buffer.concat([
        Buffer.from([0x00, 0x09]), // FIN=0, opcode=CONTINUATION, not masked, length=9
        payload
      ]);

      const result = WebSocketFrame.parseFrame(buffer);
      expect(result).toBeTruthy();
      expect(result.fin).toBe(false);
      expect(result.opcode).toBe(WebSocketFrame.OPCODES.CONTINUATION);
    });

    test('should parse ping frame', () => {
      const payload = Buffer.from('ping');
      const buffer = Buffer.concat([
        Buffer.from([0x89, 0x04]), // FIN=1, opcode=PING, not masked, length=4
        payload
      ]);

      const result = WebSocketFrame.parseFrame(buffer);
      expect(result).toBeTruthy();
      expect(result.opcode).toBe(WebSocketFrame.OPCODES.PING);
    });

    test('should parse pong frame', () => {
      const payload = Buffer.from('pong');
      const buffer = Buffer.concat([
        Buffer.from([0x8a, 0x04]), // FIN=1, opcode=PONG, not masked, length=4
        payload
      ]);

      const result = WebSocketFrame.parseFrame(buffer);
      expect(result).toBeTruthy();
      expect(result.opcode).toBe(WebSocketFrame.OPCODES.PONG);
    });
  });

  describe('createFrame', () => {
    test('should create unmasked text frame', () => {
      const payload = Buffer.from('Hello');
      const frame = WebSocketFrame.createFrame(WebSocketFrame.OPCODES.TEXT, payload, false);

      expect(frame[0]).toBe(0x81); // FIN=1, opcode=TEXT
      expect(frame[1]).toBe(0x05); // Not masked, length=5
      expect(frame.slice(2, 7).toString()).toBe('Hello');
    });

    test('should create masked binary frame', () => {
      const payload = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      const frame = WebSocketFrame.createFrame(WebSocketFrame.OPCODES.BINARY, payload, true);

      expect(frame[0]).toBe(0x82); // FIN=1, opcode=BINARY
      expect(frame[1]).toBe(0x84); // Masked, length=4
      
      // Verify mask key is present
      const maskKey = frame.slice(2, 6);
      expect(maskKey.length).toBe(4);
      
      // Verify payload is masked
      const maskedPayload = frame.slice(6);
      expect(maskedPayload.length).toBe(4);
    });

    test('should create frame with 16-bit length', () => {
      const payload = Buffer.alloc(300, 'A');
      const frame = WebSocketFrame.createFrame(WebSocketFrame.OPCODES.TEXT, payload, false);

      expect(frame[0]).toBe(0x81); // FIN=1, opcode=TEXT
      expect(frame[1]).toBe(0x7e); // Not masked, extended length
      expect(frame.readUInt16BE(2)).toBe(300); // Length in big-endian
    });

    test('should create frame with 64-bit length', () => {
      const payload = Buffer.alloc(70000, 'A');
      const frame = WebSocketFrame.createFrame(WebSocketFrame.OPCODES.BINARY, payload, false);

      expect(frame[0]).toBe(0x82); // FIN=1, opcode=BINARY
      expect(frame[1]).toBe(0x7f); // Not masked, 64-bit length
      expect(frame.readBigUInt64BE(2)).toBe(BigInt(70000));
    });

    test('should create masked frame with 16-bit length', () => {
      const payload = Buffer.alloc(200, 'B');
      const frame = WebSocketFrame.createFrame(WebSocketFrame.OPCODES.TEXT, payload, true);

      expect(frame[0]).toBe(0x81); // FIN=1, opcode=TEXT
      expect(frame[1]).toBe(0xfe); // Masked, extended length
      expect(frame.readUInt16BE(2)).toBe(200);
      
      // Verify mask key is present
      const maskKey = frame.slice(4, 8);
      expect(maskKey.length).toBe(4);
    });

    test('should create masked frame with 64-bit length', () => {
      const payload = Buffer.alloc(70000, 'C');
      const frame = WebSocketFrame.createFrame(WebSocketFrame.OPCODES.BINARY, payload, true);

      expect(frame[0]).toBe(0x82); // FIN=1, opcode=BINARY
      expect(frame[1]).toBe(0xff); // Masked, 64-bit length
      expect(frame.readBigUInt64BE(2)).toBe(BigInt(70000));
    });

    test('should create close frame', () => {
      const payload = Buffer.from([0x03, 0xe8]); // Close code 1000
      const frame = WebSocketFrame.createFrame(WebSocketFrame.OPCODES.CLOSE, payload, false);

      expect(frame[0]).toBe(0x88); // FIN=1, opcode=CLOSE
      expect(frame[1]).toBe(0x02); // Not masked, length=2
    });
  });

  describe('createHandshakeResponse', () => {
    test('should create valid handshake response', () => {
      const key = 'dGhlIHNhbXBsZSBub25jZQ==';
      const response = WebSocketFrame.createHandshakeResponse(key);

      expect(response).toContain('HTTP/1.1 101 Switching Protocols');
      expect(response).toContain('Upgrade: websocket');
      expect(response).toContain('Connection: Upgrade');
      expect(response).toContain('Sec-WebSocket-Accept:');
      expect(response.endsWith('\r\n\r\n')).toBe(true);
      
      // Verify the accept key is correctly calculated
      const crypto = require('crypto');
      const expectedAccept = crypto
        .createHash('sha1')
        .update(key + '258EAFA5-E6B4-826D-9DA7-5269A0EC9C01')
        .digest('base64');
      expect(response).toContain(`Sec-WebSocket-Accept: ${expectedAccept}`);
    });

    test('should create different accept keys for different input keys', () => {
      const key1 = 'key1==';
      const key2 = 'key2==';
      
      const response1 = WebSocketFrame.createHandshakeResponse(key1);
      const response2 = WebSocketFrame.createHandshakeResponse(key2);

      const accept1 = response1.match(/Sec-WebSocket-Accept: (.+)/)[1];
      const accept2 = response2.match(/Sec-WebSocket-Accept: (.+)/)[1];
      
      expect(accept1).not.toBe(accept2);
    });
  });

  describe('parseHandshake', () => {
    test('should parse valid WebSocket handshake', () => {
      const handshake = [
        'GET / HTTP/1.1',
        'Host: example.com',
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Version: 13',
        '',
        ''
      ].join('\r\n');

      const result = WebSocketFrame.parseHandshake(handshake);
      expect(result.isWebSocket).toBe(true);
      expect(result.key).toBe('dGhlIHNhbXBsZSBub25jZQ==');
    });

    test('should reject non-WebSocket handshake', () => {
      const handshake = [
        'GET / HTTP/1.1',
        'Host: example.com',
        'User-Agent: test',
        '',
        ''
      ].join('\r\n');

      const result = WebSocketFrame.parseHandshake(handshake);
      expect(result.isWebSocket).toBe(false);
      expect(result.key).toBeUndefined();
    });

    test('should handle case-insensitive connection header', () => {
      const handshake = [
        'GET / HTTP/1.1',
        'Host: example.com',
        'Upgrade: websocket',
        'Connection: UPGRADE',
        'Sec-WebSocket-Key: testkey==',
        '',
        ''
      ].join('\r\n');

      const result = WebSocketFrame.parseHandshake(handshake);
      expect(result.isWebSocket).toBe(true);
      expect(result.key).toBe('testkey==');
    });

    test('should handle connection header with multiple values', () => {
      const handshake = [
        'GET / HTTP/1.1',
        'Host: example.com',
        'Upgrade: websocket',
        'Connection: keep-alive, Upgrade',
        'Sec-WebSocket-Key: testkey2==',
        '',
        ''
      ].join('\r\n');

      const result = WebSocketFrame.parseHandshake(handshake);
      expect(result.isWebSocket).toBe(true);
      expect(result.key).toBe('testkey2==');
    });

    test('should handle missing upgrade header', () => {
      const handshake = [
        'GET / HTTP/1.1',
        'Host: example.com',
        'Connection: Upgrade',
        'Sec-WebSocket-Key: testkey==',
        '',
        ''
      ].join('\r\n');

      const result = WebSocketFrame.parseHandshake(handshake);
      expect(result.isWebSocket).toBe(false);
    });

    test('should handle missing connection header', () => {
      const handshake = [
        'GET / HTTP/1.1',
        'Host: example.com',
        'Upgrade: websocket',
        'Sec-WebSocket-Key: testkey==',
        '',
        ''
      ].join('\r\n');

      const result = WebSocketFrame.parseHandshake(handshake);
      expect(result.isWebSocket).toBe(false);
      expect(result.key).toBe('testkey==');
    });

    test('should handle malformed headers', () => {
      const handshake = [
        'GET / HTTP/1.1',
        'Host example.com', // Missing colon
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Key: testkey==',
        '',
        ''
      ].join('\r\n');

      const result = WebSocketFrame.parseHandshake(handshake);
      expect(result.isWebSocket).toBe(true); // Should still work with other valid headers
    });

    test('should handle empty lines and headers without values', () => {
      const handshake = [
        'GET / HTTP/1.1',
        'Upgrade: websocket',
        'Connection: Upgrade',
        'EmptyHeader:',
        'Sec-WebSocket-Key: testkey==',
        '',
        ''
      ].join('\r\n');

      const result = WebSocketFrame.parseHandshake(handshake);
      expect(result.isWebSocket).toBe(true);
      expect(result.key).toBe('testkey==');
    });
  });

  describe('Round-trip testing', () => {
    test('should create and parse frames correctly', () => {
      const originalPayload = Buffer.from('Round trip test');
      
      // Test both masked and unmasked
      [true, false].forEach(masked => {
        const frame = WebSocketFrame.createFrame(WebSocketFrame.OPCODES.TEXT, originalPayload, masked);
        const parsed = WebSocketFrame.parseFrame(frame);

        expect(parsed).toBeTruthy();
        expect(parsed.opcode).toBe(WebSocketFrame.OPCODES.TEXT);
        expect(parsed.masked).toBe(masked);
        expect(parsed.payload.toString()).toBe('Round trip test');
        expect(parsed.totalLength).toBe(frame.length);
      });
    });

    test('should handle multiple opcodes in round trip', () => {
      const payload = Buffer.from('test');
      
      Object.values(WebSocketFrame.OPCODES).forEach(opcode => {
        const frame = WebSocketFrame.createFrame(opcode, payload, false);
        const parsed = WebSocketFrame.parseFrame(frame);

        expect(parsed).toBeTruthy();
        expect(parsed.opcode).toBe(opcode);
        expect(parsed.payload.toString()).toBe('test');
      });
    });
  });
});