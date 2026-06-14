/**
 * SisPMG+ Debug Client V2 (Isolado)
 */

(function() {
    const DEBUG_SERVER = 'http://localhost:3001';
    const CLIENT_ID = Math.random().toString(36).substring(2, 8);
    let isPolling = false;
    let serverOnline = false; // Começa como false para evitar spam no boot
    let isCheckingConnection = false;
    let heartbeatInterval = null;

    async function sendToDebug(data) {
        if (!serverOnline) return;
        if (isCheckingConnection) return;

        try {
            isCheckingConnection = true;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000); // Timeout bem curto para localhost

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
        } catch (e) {
            if (serverOnline) {
                console.debug(`[Debug] Servidor offline. Silenciando logs.`);
                serverOnline = false;
            }
        } finally {
            isCheckingConnection = false;
        }
    }

    async function checkInitialConnection() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000); // Timeout curto para localhost

            await fetch(DEBUG_SERVER, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    type: 'heartbeat',
                    clientId: CLIENT_ID,
                    url: window.location.href,
                    title: document.title
                })
            });
            
            clearTimeout(timeoutId);
            
            serverOnline = true;
            console.info(`[Debug] Conexão estabelecida com o servidor [${DEBUG_SERVER}].`);
            startPolling();
            
            // Inicia o heartbeat periódico a cada 15s se ainda não tiver sido iniciado
            if (!heartbeatInterval) {
                heartbeatInterval = setInterval(() => {
                    if (serverOnline) {
                        sendToDebug({ type: 'heartbeat' });
                    }
                }, 15000);
            }
        } catch (e) {
            // Falha silenciosa de conexão inicial.
            serverOnline = false;
        }
    }

    async function startPolling() {
        if (isPolling || !serverOnline) return;
        isPolling = true;
        
        try {
            while (serverOnline) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 35000);

                    const response = await fetch(`${DEBUG_SERVER}/poll?id=${CLIENT_ID}`, {
                        signal: controller.signal
                    });
                    
                    clearTimeout(timeoutId);
                    
                    if (response.status === 200) {
                        const cmd = await response.json();
                        handleCommand(cmd);
                    } else if (response.status === 204) {
                        // Keep-alive OK
                    } else {
                        break;
                    }
                } catch (e) {
                    break;
                }
            }
        } finally {
            isPolling = false;
            serverOnline = false;
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
                }
            } catch (e) {}
        } else if (cmd.action === 'eval' && cmd.code) {
            try {
                eval(cmd.code);
            } catch (e) {}
        }
    }

    async function takeSnapshot(label = 'manual') {
        if (!serverOnline) {
            // Se a conexão não estiver ativa, tenta conectar agora
            await checkInitialConnection();
        }

        if (serverOnline) {
            const snapshot = {
                type: 'snapshot',
                label: label,
                html: document.documentElement.outerHTML,
                storage: await getStorage()
            };
            await sendToDebug(snapshot);
            return true;
        }
        return false;
    }

    async function getStorage() {
        return new Promise(r => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.get(null, r);
            } else r({});
        });
    }

    // Console Interception com Proteção contra Loop
    const levels = ['log', 'warn', 'error', 'info'];
    levels.forEach(level => {
        const original = console[level];
        console[level] = function(...args) {
            // Chama o original primeiro
            original.apply(console, args);
            
            // Só tenta enviar se o servidor estiver online
            if (serverOnline) {
                try {
                    const message = args.map(a => {
                        if (typeof a === 'object') {
                            try { return JSON.stringify(a); } catch(e) { return "[Complex Object]"; }
                        }
                        return String(a);
                    }).join(' ');

                    // FILTRO CRÍTICO: Não interceptar mensagens do próprio sistema de debug
                    if (message.includes('[Debug]')) return;

                    sendToDebug({
                        type: 'log',
                        level: level,
                        message: message
                    });
                } catch (e) {
                    // Falha silenciosa na interceptação
                }
            }
        };
    });

    // Injeção da Ponte
    function injectBridge() {
        try {
            const s = document.createElement('script');
            s.src = browser.runtime.getURL('common/debug-bridge.js');
            (document.head || document.documentElement).appendChild(s);
            s.onload = () => s.remove();
        } catch(e) {}
    }

    window.addEventListener('SISPMG_TRIGGER_SNAPSHOT', (e) => takeSnapshot(e.detail));
    
    browser.runtime.onMessage.addListener((request) => {
        if (request.action === 'triggerSnapshot') {
            return takeSnapshot(request.payload?.label || 'popup-trigger');
        }
    });

    // Verifica a conexão apenas quando a página é carregada
    checkInitialConnection();
    
    injectBridge();
    console.log(`[Debug] SisPMG+ Debug Client V2.8 (Standby) [ID: ${CLIENT_ID}]`);
})();
