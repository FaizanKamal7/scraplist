'use strict';

const net = require('net');

const CONNECT_TIMEOUT_MS  = parseInt(process.env.SMTP_CONNECT_TIMEOUT_MS,  10) || 8000;
const RESPONSE_TIMEOUT_MS = parseInt(process.env.SMTP_RESPONSE_TIMEOUT_MS, 10) || 10000;
const HELO_DOMAIN         = process.env.SMTP_HELO_DOMAIN   || 'example.com';
const FROM_ADDRESS        = process.env.SMTP_FROM_ADDRESS  || 'verify@example.com';

/**
 * Probe an email address via SMTP RCPT TO — never sends actual mail (no DATA).
 *
 * Protocol:
 *   TCP connect :25 → wait banner → EHLO → MAIL FROM → RCPT TO → read code → QUIT
 *
 * @param {string} mxHost       MX hostname, e.g. "aspmx.l.google.com"
 * @param {string} emailAddress Target email to probe
 * @returns {Promise<{
 *   accepted:  boolean,
 *   code:      number|null,
 *   message:   string,
 *   timedOut:  boolean,
 *   error:     string|null
 * }>}
 */
function smtpVerifyEmail(mxHost, emailAddress) {
  return new Promise(resolve => {
    let settled  = false;
    let buffer   = '';
    let phase    = 'connect'; // connect → banner → ehlo → mail → rcpt → quit

    function done(result) {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      clearTimeout(responseTimer);
      try { socket.destroy(); } catch (_) {}
      resolve(result);
    }

    const socket = new net.Socket();
    socket.setEncoding('utf8');

    // ── Timers ────────────────────────────────────────────────────────────────

    const connectTimer = setTimeout(() => {
      done({ accepted: false, code: null, message: 'Connection timed out', timedOut: true, error: 'CONNECT_TIMEOUT' });
    }, CONNECT_TIMEOUT_MS);

    let responseTimer = null;

    function resetResponseTimer() {
      clearTimeout(responseTimer);
      responseTimer = setTimeout(() => {
        done({ accepted: false, code: null, message: 'Response timed out', timedOut: true, error: 'RESPONSE_TIMEOUT' });
      }, RESPONSE_TIMEOUT_MS);
    }

    // ── Send a command ────────────────────────────────────────────────────────

    function send(cmd) {
      resetResponseTimer();
      socket.write(cmd + '\r\n');
    }

    // ── Parse incoming data ───────────────────────────────────────────────────

    socket.on('data', chunk => {
      buffer += chunk;
      // SMTP responses can be multi-line; wait for a line without a dash after code
      const lines = buffer.split('\r\n');
      buffer = lines.pop(); // keep any incomplete trailing line

      for (const line of lines) {
        if (!line) continue;
        const code = parseInt(line.slice(0, 3), 10);
        const cont = line[3] === '-'; // multi-line continuation
        if (cont) continue;           // wait for the final line of this response

        handleResponse(code, line.slice(4));
        break;
      }
    });

    function handleResponse(code, message) {
      clearTimeout(responseTimer);

      if (phase === 'banner') {
        if (code >= 200 && code < 300) {
          phase = 'ehlo';
          send(`EHLO ${HELO_DOMAIN}`);
        } else {
          done({ accepted: false, code, message: `Banner rejected: ${message}`, timedOut: false, error: null });
        }
        return;
      }

      if (phase === 'ehlo') {
        if (code >= 200 && code < 300) {
          phase = 'mail';
          send(`MAIL FROM:<${FROM_ADDRESS}>`);
        } else {
          done({ accepted: false, code, message: `EHLO rejected: ${message}`, timedOut: false, error: null });
        }
        return;
      }

      if (phase === 'mail') {
        if (code >= 200 && code < 300) {
          phase = 'rcpt';
          send(`RCPT TO:<${emailAddress}>`);
        } else {
          done({ accepted: false, code, message: `MAIL FROM rejected: ${message}`, timedOut: false, error: null });
        }
        return;
      }

      if (phase === 'rcpt') {
        phase = 'quit';
        send('QUIT');
        // 250, 251 = accepted; 550, 551, 553 = user unknown; 421, 450, 451 = temporary
        const accepted = code >= 200 && code < 300;
        done({ accepted, code, message, timedOut: false, error: null });
        return;
      }

      if (phase === 'quit') {
        // We've already resolved; socket close is handled by done()
      }
    }

    socket.on('error', err => {
      done({ accepted: false, code: null, message: err.message, timedOut: false, error: err.code || err.message });
    });

    socket.on('close', () => {
      if (!settled) done({ accepted: false, code: null, message: 'Connection closed unexpectedly', timedOut: false, error: 'CLOSED' });
    });

    // ── Connect ───────────────────────────────────────────────────────────────

    socket.connect(25, mxHost, () => {
      clearTimeout(connectTimer);
      phase = 'banner';
      resetResponseTimer();
    });
  });
}

module.exports = { smtpVerifyEmail };
