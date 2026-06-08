const http = require('http');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const PORT = 3001;
const DEBUG_DIR = path.join(__dirname, 'debug');

if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR);

const bus = new EventEmitter();
const clients = new Map();

const server = http.createServer((req, res) => {
    console.log(`[Request] ${req.method} ${req.url}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204); res.end(); return;
    }

    // Recebe dados da extensão (Logs, Heartbeats, Snapshots)
    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                processIncomingData(data);
                res.writeHead(200); res.end(JSON.stringify({ status: 'ok' }));
            } catch (e) {
                res.writeHead(400); res.end('Invalid JSON');
            }
        });
    } 
    // Long Polling para comandos (Extensão esperando ordens do Gemini)
    else if (req.method === 'GET' && req.url.startsWith('/poll')) {
        const urlParams = new URL(req.url, `http://${req.headers.host}`);
        const clientId = urlParams.searchParams.get('id');
        
        const onCommand = (cmd) => {
            if (!res.writableEnded) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(cmd));
            }
        };

        bus.once(`command:${clientId}`, onCommand);
        setTimeout(() => {
            if (!res.writableEnded) {
                bus.removeListener(`command:${clientId}`, onCommand);
                res.writeHead(204); res.end();
            }
        }, 25000);
    }
    // Interface para o Gemini enviar comandos
    else if (req.method === 'GET' && req.url.startsWith('/command')) {
        const urlParams = new URL(req.url, `http://${req.headers.host}`);
        const target = urlParams.searchParams.get('target') || 'all';
        
        // Converte todos os parâmetros para um objeto de comando
        const cmd = {};
        urlParams.searchParams.forEach((value, key) => {
            if (key !== 'target') cmd[key] = value;
        });

        if (target === 'all') {
            clients.forEach((_, id) => bus.emit(`command:${id}`, cmd));
        } else {
            bus.emit(`command:${target}`, cmd);
        }
        res.writeHead(200); res.end(`Comando enviado para ${target}: ${JSON.stringify(cmd)}`);
    }
    // Lista abas ativas
    else if (req.method === 'GET' && req.url === '/clients') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(Array.from(clients.entries())));
    }
    else {
        res.writeHead(404); res.end();
    }
});

function processIncomingData(data) {
    const timestamp = new Date().toISOString();
    const clientId = data.clientId || 'unknown';

    if (data.type === 'heartbeat') {
        clients.set(clientId, { url: data.url, title: data.title, lastSeen: timestamp });
    } else if (data.type === 'log') {
        const logLine = `[${timestamp}] [${clientId}] [${data.level}] ${data.message}\n`;
        fs.appendFileSync(path.join(DEBUG_DIR, 'browser.log'), logLine);
    } else if (data.type === 'snapshot') {
        const snapshotFile = path.join(DEBUG_DIR, `snapshot_${clientId}.json`);
        fs.writeFileSync(snapshotFile, JSON.stringify(data, null, 2));
        fs.writeFileSync(path.join(DEBUG_DIR, 'current_state.json'), JSON.stringify(data, null, 2));
        if (data.html) fs.writeFileSync(path.join(DEBUG_DIR, 'view.html'), data.html);
        console.log(`[DebugServer] Snapshot recebido de ${clientId}`);
    }
}

server.listen(PORT, () => {
    console.log(`Servidor de Debug V2 operacional na porta ${PORT}`);
});

// Encerramento limpo para evitar porta ocupada (EADDRINUSE)
const cleanup = () => {
    console.log('\n[DebugServer] Encerrando servidor...');
    server.close(() => {
        console.log('[DebugServer] Porta liberada. Até logo!');
        process.exit(0);
    });
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', (err) => {
    console.error('[DebugServer] Erro não tratado:', err);
    cleanup();
});
