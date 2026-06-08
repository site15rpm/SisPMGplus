/**
 * SisPMG+ Debug Client
 * Este script é injetado nas páginas para capturar logs e o estado do DOM,
 * enviando-os para o servidor de debug local.
 */

(function() {
    const DEBUG_SERVER = 'http://localhost:3001';
    let isEnabled = true;

    async function sendToDebugServer(data) {
        if (!isEnabled) return;
        try {
            await fetch(DEBUG_SERVER, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...data,
                    timestamp: new Date().toISOString(),
                    url: window.location.href
                })
            });
        } catch (e) {
            // Desabilita silenciosamente se o servidor não estiver rodando para não inundar o console
            // console.warn('Servidor de debug não encontrado.');
        }
    }

    // Intercepta Console
    const levels = ['log', 'warn', 'error', 'info'];
    levels.forEach(level => {
        const original = console[level];
        console[level] = function(...args) {
            original.apply(console, args);
            sendToDebugServer({
                type: 'log',
                level: level,
                message: args.map(arg => 
                    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
                ).join(' ')
            });
        };
    });

    // Função para tirar Snapshot (pode ser chamada pelo console ou via evento)
    async function takeSnapshot(label = 'manual') {
        console.log(`[Debug] Tirando snapshot: ${label}`);
        const snapshot = {
            type: 'snapshot',
            label: label,
            html: document.documentElement.outerHTML,
            storage: await getLocalStorageData()
        };
        await sendToDebugServer(snapshot);
    }

    // Expõe internamente
    window.sispmgSnapshot = takeSnapshot;

    // Ponte para o Console (Injeta no Main World)
    function injectBridge() {
        const script = document.createElement('script');
        script.textContent = `
            window.sispmgSnapshot = function(label) {
                window.dispatchEvent(new CustomEvent('SISPMG_TRIGGER_SNAPSHOT', { detail: label }));
            };
        `;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
    }

    // Escuta o evento vindo do Main World (console)
    window.addEventListener('SISPMG_TRIGGER_SNAPSHOT', (e) => {
        takeSnapshot(e.detail || 'console');
    });

    injectBridge();

    async function getLocalStorageData() {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.get(null, (data) => resolve(data));
            } else {
                resolve({});
            }
        });
    }

    // Snapshot automático em mudanças significativas ou erros graves
    window.addEventListener('error', (event) => {
        sendToDebugServer({
            type: 'log',
            level: 'error',
            message: `Uncaught Error: ${event.message} at ${event.filename}:${event.lineno}`
        });
        window.sispmgSnapshot('error-auto');
    });

    console.log('SisPMG+ Debug Client Ativado. Use sispmgSnapshot() para enviar o estado atual.');
})();
