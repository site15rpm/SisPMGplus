/**
 * SisPMG+ Debug Client V2 (Isolado)
 */

(function() {
    const DEBUG_SERVER = 'http://localhost:3001';
    const CLIENT_ID = Math.random().toString(36).substring(2, 8);
    let isPolling = false;
    let serverOnline = true;
    let isCheckingConnection = false;
    let lastCheckTime = 0;
    let pollInterval = 5000;

    async function sendToDebug(data) {
        const now = Date.now();
        
        // Se o servidor está offline, só permitimos tentativas de heartbeat a cada 30 segundos
        // E evitamos tentativas simultâneas (isCheckingConnection)
        if (!serverOnline) {
            if (data.type !== 'heartbeat') return;
            if (isCheckingConnection || (now - lastCheckTime < 30000)) return;
        }

        // Se já existe uma verificação em curso, não iniciamos outra
        if (isCheckingConnection && data.type === 'heartbeat') return;

        try {
            isCheckingConnection = true;
            lastCheckTime = now;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000); // Timeout curto para localhost

            await fetch(DEBUG_SERVER, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    ...data,
                    clientId: CLIENT_ID,
                    url: window.location.href,
                    title: document.title
                })
            });
            
            clearTimeout(timeoutId);
            
            if (!serverOnline) {
                console.info(`[Debug] Conexão restabelecida com o servidor de debug.`);
            }
            serverOnline = true;
        } catch (e) {
            if (serverOnline) {
                console.warn(`[Debug] Servidor de debug offline. As mensagens serão silenciadas até a reconexão. [${DEBUG_SERVER}]`);
            }
            serverOnline = false;
        } finally {
            isCheckingConnection = false;
        }
    }

    async function startPolling() {
        if (isPolling) return;
        isPolling = true;
        
        while (true) {
            if (!serverOnline) {
                // Se offline, esperamos o backoff antes de tentar o polling novamente
                await new Promise(r => setTimeout(r, pollInterval));
            }

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 25000);

                const response = await fetch(`${DEBUG_SERVER}/poll?id=${CLIENT_ID}`, {
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                serverOnline = true;
                pollInterval = 5000; 

                if (response.status === 200) {
                    const cmd = await response.json();
                    handleCommand(cmd);
                }
            } catch (e) {
                serverOnline = false;
                // Backoff progressivo para o polling (max 1 min)
                pollInterval = Math.min(pollInterval * 1.5, 60000);
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
        return true;
    }

    async function getStorage() {
        return new Promise(r => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.get(null, r);
            } else r({});
        });
    }

    // Console Interception
    const levels = ['log', 'warn', 'error', 'info'];
    levels.forEach(level => {
        const original = console[level];
        console[level] = function(...args) {
            original.apply(console, args);
            // Só tentamos enviar se o servidor estiver online para evitar erros de rede no console
            if (serverOnline) {
                sendToDebug({
                    type: 'log',
                    level: level,
                    message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
                });
            }
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
    
    // Listener para mensagens do Popup/Background
    browser.runtime.onMessage.addListener((request) => {
        if (request.action === 'triggerSnapshot') {
            return takeSnapshot(request.payload?.label || 'popup-trigger');
        }
    });

    // Heartbeat & Start
    setInterval(() => sendToDebug({ type: 'heartbeat' }), 10000);
    
    injectBridge();
    startPolling();
    console.log(`SisPMG+ Debug Client V2.6 Ativado [ID: ${CLIENT_ID}]`);
})();
