const http = require('http');
const net = require('net');
const { execFile } = require('child_process');
const { WebSocketServer, WebSocket } = require('ws');

const listenHost = process.env.LOCALHOST_PROXY_HOST || '127.0.0.1';
const listenPort = Number(process.env.LOCALHOST_PROXY_PORT || 4200);
const frontendPort = Number(process.env.LOCALHOST_PROXY_FRONTEND_PORT || 4200);
const backendPort = Number(process.env.LOCALHOST_PROXY_BACKEND_PORT || 3000);
const refreshMs = Number(process.env.LOCALHOST_PROXY_REFRESH_MS || 30000);

let wslIp = process.env.LOCALHOST_PROXY_WSL_IP || '';
let refreshInFlight = false;
const websocketServer = new WebSocketServer({ noServer: true });

function resolveWslIp() {
  return new Promise((resolve, reject) => {
    if (wslIp) {
      resolve(wslIp);
      return;
    }

    execFile(
      'wsl.exe',
      ['bash', '-lc', "hostname -I | awk '{print $1}'"],
      { timeout: 10000, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }

        const resolved = stdout.trim().split(/\s+/)[0];
        if (!resolved) {
          reject(new Error('Unable to resolve the WSL IP address.'));
          return;
        }

        resolve(resolved);
      }
    );
  });
}

async function refreshWslIp() {
  if (refreshInFlight) {
    return wslIp;
  }

  refreshInFlight = true;
  try {
    const resolved = await resolveWslIp();
    if (resolved && resolved !== wslIp) {
      wslIp = resolved;
      console.log(`[proxy] WSL IP resolved to ${wslIp}`);
    }
    return wslIp;
  } finally {
    refreshInFlight = false;
  }
}

function isApiPath(pathname) {
  return /^\/api(\/|$)/.test(pathname);
}

function getTargetForRequest(requestPath) {
  const pathname = new URL(requestPath, `http://${listenHost}:${listenPort}`).pathname;
  return isApiPath(pathname)
    ? { host: wslIp, port: backendPort, label: 'backend' }
    : { host: wslIp, port: frontendPort, label: 'frontend' };
}

function forwardHttpRequest(req, res, target) {
  const headers = { ...req.headers, host: `${target.host}:${target.port}` };
  const proxyReq = http.request(
    {
      host: target.host,
      port: target.port,
      method: req.method,
      path: req.url,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (error) => {
    console.error(`[proxy] ${target.label} request failed:`, error.message);
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    }
    res.end(`Localhost proxy failed to reach the ${target.label}.`);
  });

  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  if (!wslIp) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Localhost proxy is still resolving the WSL target.');
    return;
  }

  const target = getTargetForRequest(req.url || '/');
  forwardHttpRequest(req, res, target);
});

server.on('upgrade', (req, socket, head) => {
  if (!wslIp) {
    socket.destroy();
    return;
  }

  const target = getTargetForRequest(req.url || '/');
  websocketServer.handleUpgrade(req, socket, head, (clientSocket) => {
    const upstreamUrl = `ws://${target.host}:${target.port}${req.url || '/'}`;
    const upstreamHeaders = {};

    if (req.headers.host) {
      upstreamHeaders.host = req.headers.host;
    }
    if (req.headers.origin) {
      upstreamHeaders.origin = req.headers.origin;
    }

    const upstreamSocket = new WebSocket(upstreamUrl, {
      headers: upstreamHeaders,
    });

    const cleanup = () => {
      if (clientSocket.readyState === WebSocket.OPEN || clientSocket.readyState === WebSocket.CONNECTING) {
        clientSocket.close();
      }
      if (upstreamSocket.readyState === WebSocket.OPEN || upstreamSocket.readyState === WebSocket.CONNECTING) {
        upstreamSocket.close();
      }
    };

    clientSocket.on('message', (data, isBinary) => {
      if (upstreamSocket.readyState === WebSocket.OPEN) {
        upstreamSocket.send(data, { binary: isBinary });
      }
    });

    upstreamSocket.on('message', (data, isBinary) => {
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(data, { binary: isBinary });
      }
    });

    clientSocket.on('close', cleanup);
    upstreamSocket.on('close', cleanup);

    clientSocket.on('error', (error) => {
      console.error(`[proxy] websocket client failed for ${target.label}:`, error.message);
      cleanup();
    });

    upstreamSocket.on('error', (error) => {
      console.error(`[proxy] websocket tunnel failed for ${target.label}:`, error.message);
      cleanup();
    });
  });
});

(async () => {
  await refreshWslIp();
  server.listen(listenPort, listenHost, () => {
    console.log(
      `[proxy] Listening on http://${listenHost}:${listenPort} -> frontend ${wslIp}:${frontendPort}, backend ${wslIp}:${backendPort}`
    );
  });

  setInterval(() => {
    refreshWslIp().catch((error) => {
      console.error('[proxy] Failed to refresh WSL IP:', error.message);
    });
  }, refreshMs).unref();
})().catch((error) => {
  console.error('[proxy] Unable to start local proxy:', error.message);
  process.exit(1);
});
