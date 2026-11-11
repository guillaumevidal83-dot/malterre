'use strict';
/* Petit serveur WebSocket sans dépendance (RFC 6455, messages texte). */
const crypto = require('crypto');
const { EventEmitter } = require('events');
const MAX = 64 * 1024;

class Conn extends EventEmitter {
  constructor(socket) {
    super();
    this.s = socket; this.buf = Buffer.alloc(0); this.frag = []; this.open = true; this.alive = true;
    socket.setNoDelay(true);
    socket.on('data', d => this._data(d));
    socket.on('close', () => this._end());
    socket.on('error', () => this._end());
  }
  _end() { if (this.open) { this.open = false; this.emit('close'); } }
  _data(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    while (this.open) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; if (b.readUInt32BE(2) !== 0) return this.close(); len = b.readUInt32BE(6); off = 10; }
      if (!masked || len > MAX) return this.close();
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4); off += 4;
      const p = Buffer.from(b.subarray(off, off + len));
      for (let i = 0; i < len; i++) p[i] ^= mask[i & 3];
      this.buf = b.subarray(off + len);
      if (op === 8) return this.close();
      if (op === 9) { this._frame(10, p); continue; }
      if (op === 10) { this.alive = true; continue; }
      if (op === 1 || op === 0) {
        this.frag.push(p);
        if (this.frag.reduce((n, x) => n + x.length, 0) > MAX) return this.close();
        if (fin) { const msg = Buffer.concat(this.frag).toString('utf8'); this.frag = []; this.emit('message', msg); }
      } else return this.close(); // binaire non géré
    }
  }
  _frame(op, payload) {
    if (!this.open || this.s.destroyed) return;
    const n = payload.length;
    let h;
    if (n < 126) { h = Buffer.alloc(2); h[1] = n; }
    else if (n < 65536) { h = Buffer.alloc(4); h[1] = 126; h.writeUInt16BE(n, 2); }
    else { h = Buffer.alloc(10); h[1] = 127; h.writeUInt32BE(0, 2); h.writeUInt32BE(n, 6); }
    h[0] = 0x80 | op;
    try { this.s.write(h); this.s.write(payload); } catch (e) { this._end(); }
  }
  send(str) { this._frame(1, Buffer.from(str, 'utf8')); }
  ping() { this._frame(9, Buffer.alloc(0)); }
  close() { if (!this.open) return; try { this._frame(8, Buffer.alloc(0)); this.s.end(); } catch (e) { /* déjà fermé */ } this._end(); setTimeout(() => this.s.destroy(), 500).unref(); }
}

function upgrade(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return null; }
  const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  return new Conn(socket);
}
module.exports = { upgrade };
