/**
 * SisPMG+ Debug Client V2 (Isolado)
 */

(function() {
    const DEBUG_SERVER = 'http://localhost:3001';
    const CLIENT_ID = Math.random().toString(36).substring(2, 8);
    let isPolling = false;
    let serverOnline = true;
    let pollInterval = 5000;

    async function sendToDebug(data) {
        if (!serverOnline && data.type !== 'heartbeat') return;
        try {
            await fetch(DEBUG_SERVER, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...data,
                    clientId: CLIENT_ID,
                    url: window.location.href,
                    title: document.title
                })
            });
            serverOnline = true;
        } catch (e) {
            serverOnline = false;
        }
    }

    async function startPolling() {
        if (isPolling) return;
        isPolling = true;
        while (true) {
            try {
                const response = await fetch(`${DEBUG_SERVER}/poll?id=${CLIENT_ID}`);
                serverOnline = true;
                pollInterval = 5000; // Reseta o intervalo ao ter sucesso
                if (response.status === 200) {
                    const cmd = await response.json();
                    handleCommand(cmd);
                }
            } catch (e) {
                serverOnline = false;
                pollInterval = Math.min(pollInterval * 1.5, 60000); // Max 1 minuto
                await new Promise(r => setTimeout(r, pollInterval));
            }
        }
    }

    function handleCommand(cmd) {
        if (cmd.action === 'snapshot') {
            takeSnapshot('gemini-request');
        } else if (cmd.action === 'click' && cmd.selector) {
            try {
                const el = document.querySelector(cmd.selector);
                if (el) {
                    el.click();
                    sendToDebug({ type: 'log', level: 'info', message: `[RemoteClick] Sucesso: ${cmd.selector}` });
                } else {
                    sendToDebug({ type: 'log', level: 'error', message: `[RemoteClick] Elemento não encontrado: ${cmd.selector}` });
                }
            } catch (e) {
                sendToDebug({ type: 'log', level: 'error', message: `[RemoteClick] Erro: ${e.message}` });
            }
        } else if (cmd.action === 'eval' && cmd.code) {
            try {
                const result = eval(cmd.code);
                sendToDebug({ type: 'log', level: 'info', message: `[RemoteEval] Result: ${JSON.stringify(result)}` });
            } catch (e) {
                sendToDebug({ type: 'log', level: 'error', message: `[RemoteEval] Error: ${e.message}` });
            }
        }
    }

    async function takeSnapshot(label = 'manual') {
        const snapshot = {
            type: 'snapshot',
            label: label,
            html: document.documentElement.outerHTML,
            storage: await getStorage()
        };
        await sendToDebug(snapshot);
        
        const btn = document.getElementById('sispmg-debug-btn');
        if (btn) {
            btn.textContent = '📸 OK';
            btn.style.background = '#27ae60';
            setTimeout(() => {
                btn.textContent = '📸 Snapshot';
                btn.style.background = '#2c3e50';
            }, 2000);
        }
    }

    async function getStorage() {
        return new Promise(r => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.get(null, r);
            } else r({});
        });
    }

    function injectUI() {
        if (document.getElementById('sispmg-debug-container')) return;
        const c = document.createElement('div');
        c.id = 'sispmg-debug-container';
        c.innerHTML = `
            <style>
                #sispmg-debug-container { position: fixed; bottom: 10px; right: 10px; z-index: 2147483647; }
                #sispmg-debug-btn { background: #2c3e50; color: white; border: 1px solid #34495e; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-family: sans-serif; font-size: 11px; box-shadow: 0 2px 5px rgba(0,0,0,0.3); }
            </style>
            <button id="sispmg-debug-btn">📸 Snapshot</button>
        `;
        (document.body || document.documentElement).appendChild(c);
        document.getElementById('sispmg-debug-btn').onclick = () => takeSnapshot('ui-button');
    }

    // Console Interception
    const levels = ['log', 'warn', 'error', 'info'];
    levels.forEach(level => {
        const original = console[level];
        console[level] = function(...args) {
            original.apply(console, args);
            sendToDebug({
                type: 'log',
                level: level,
                message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
            });
        };
    });

    // Injeção da Ponte para o Console (Main World)
    function injectBridge() {
        const s = document.createElement('script');
        s.src = browser.runtime.getURL('common/debug-bridge.js');
        (document.head || document.documentElement).appendChild(s);
        s.onload = () => s.remove();
    }

    window.addEventListener('SISPMG_TRIGGER_SNAPSHOT', (e) => takeSnapshot(e.detail));
    
    // Heartbeat & Start
    setInterval(() => sendToDebug({ type: 'heartbeat' }), 10000);
    if (document.readyState === 'complete') injectUI();
    else window.addEventListener('load', injectUI);
    
    injectBridge();
    startPolling();
    console.log(`SisPMG+ Debug Client V2.5 Ativado [ID: ${CLIENT_ID}]`);
})();
