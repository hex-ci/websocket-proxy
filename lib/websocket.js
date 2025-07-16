const crypto = require('crypto');

class WebSocketFrame {
  static OPCODES = {
    CONTINUATION: 0x0,
    TEXT: 0x1,
    BINARY: 0x2,
    CLOSE: 0x8,
    PING: 0x9,
    PONG: 0xa
  };

  static parseFrame(buffer) {
    if (buffer.length < 2) {
      return null;
    }

    const firstByte = buffer[0];
    const secondByte = buffer[1];

    const fin = !!(firstByte & 0x80);
    const opcode = firstByte & 0x0f;
    const masked = !!(secondByte & 0x80);
    let payloadLength = secondByte & 0x7f;

    let offset = 2;

    if (payloadLength === 126) {
      if (buffer.length < offset + 2) {
        return null;
      }
      payloadLength = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLength === 127) {
      if (buffer.length < offset + 8) {
        return null;
      }
      payloadLength = buffer.readBigUInt64BE(offset);
      offset += 8;
    }

    let maskKey = null;
    if (masked) {
      if (buffer.length < offset + 4) {
        return null;
      }
      maskKey = buffer.slice(offset, offset + 4);
      offset += 4;
    }

    if (buffer.length < offset + Number(payloadLength)) {
      return null;
    }

    const payload = buffer.slice(offset, offset + Number(payloadLength));

    if (masked && maskKey) {
      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= maskKey[i % 4];
      }
    }

    return {
      fin,
      opcode,
      masked,
      payload,
      totalLength: offset + Number(payloadLength)
    };
  }

  static createFrame(opcode, payload, masked = false) {
    const payloadLength = payload.length;
    let headerLength = 2;

    if (payloadLength > 65535) {
      headerLength += 8;
    } else if (payloadLength > 125) {
      headerLength += 2;
    }

    if (masked) {
      headerLength += 4;
    }

    const frame = Buffer.allocUnsafe(headerLength + payloadLength);
    let offset = 0;

    frame[offset++] = 0x80 | opcode;

    if (payloadLength > 65535) {
      frame[offset++] = masked ? 0xff : 0x7f;
      frame.writeBigUInt64BE(BigInt(payloadLength), offset);
      offset += 8;
    } else if (payloadLength > 125) {
      frame[offset++] = masked ? 0xfe : 0x7e;
      frame.writeUInt16BE(payloadLength, offset);
      offset += 2;
    } else {
      frame[offset++] = (masked ? 0x80 : 0x00) | payloadLength;
    }

    let maskKey = null;
    if (masked) {
      maskKey = crypto.randomBytes(4);
      maskKey.copy(frame, offset);
      offset += 4;
    }

    if (masked && maskKey) {
      for (let i = 0; i < payloadLength; i++) {
        frame[offset + i] = payload[i] ^ maskKey[i % 4];
      }
    } else {
      payload.copy(frame, offset);
    }

    return frame;
  }

  static createHandshakeResponse(key) {
    const acceptKey = crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E6B4-826D-9DA7-5269A0EC9C01')
      .digest('base64');

    return [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '',
      ''
    ].join('\r\n');
  }

  static parseHandshake(data) {
    const lines = data.toString().split('\r\n');
    const headers = {};

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) {
        break;
      }

      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).toLowerCase();
        const value = line.substring(colonIndex + 1).trim();
        // Add all headers, even with empty values
        headers[key] = value;
      }
    }

    // More robust WebSocket validation
    const isValidWebSocket = Boolean(
      headers.upgrade === 'websocket' &&
      headers.connection &&
      typeof headers.connection === 'string' &&
      headers.connection.toLowerCase().includes('upgrade')
    );

    return {
      isWebSocket: isValidWebSocket,
      key: headers['sec-websocket-key']
    };
  }
}

module.exports = WebSocketFrame;
