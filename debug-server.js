const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const DEBUG_DIR = path.join(__dirname, 'debug');

if (!fs.existsSync(DEBUG_DIR)) {
    fs.mkdirSync(DEBUG_DIR);
}

const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const timestamp = new Date().toISOString().replace(/:/g, '-');
                
                if (data.type === 'log') {
                    const logLine = `[${data.timestamp}] [${data.level}] ${data.message}\n`;
                    fs.appendFileSync(path.join(DEBUG_DIR, 'browser.log'), logLine);
                } else if (data.type === 'snapshot') {
                    const snapshotPath = path.join(DEBUG_DIR, 'current_state.json');
                    fs.writeFileSync(snapshotPath, JSON.stringify(data, null, 2));
                    
                    // Também salva o HTML separadamente para facilitar a visualização
                    if (data.html) {
                        fs.writeFileSync(path.join(DEBUG_DIR, 'view.html'), data.html);
                    }
                }
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok' }));
            } catch (e) {
                res.writeHead(400);
                res.end('Invalid JSON');
            }
        });
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(PORT, () => {
    console.log(`Servidor de Debug rodando em http://localhost:${PORT}`);
    console.log(`Arquivos de log serão salvos em: ${DEBUG_DIR}`);
});
