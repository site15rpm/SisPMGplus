// Arquivo: terminal-loader.js
// Ponto de entrada para o módulo do Terminal.

let terminalModuleInstance = null;
let checkInterval = null; // Controle do intervalo de verificação
let iconSVG; // Armazenará o SVG do ícone importado

// Função de inicialização auto-executável que lê a configuração do DOM.
(async function() {
    const configElement = document.getElementById('sispmg-config-data');
    if (configElement && configElement.textContent) {
        try {
            const config = JSON.parse(configElement.textContent);
            await loadCodeMirror(); // Carrega o CodeMirror antes de tudo
            main(config);
        } catch (e) {
            console.error('SisPMG+: Falha ao parsear a configuração injetada ou carregar o editor.', e);
        }
    } else {
        console.error('SisPMG+: Elemento de configuração não encontrado. O módulo do Terminal não será carregado.');
    }
})();

/**
 * Carrega dinamicamente os scripts e CSS do CodeMirror.
 */
function loadScript(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function loadCSS(url) {
    return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;
        link.onload = resolve;
        link.onerror = reject;
        document.head.appendChild(link);
    });
}

async function loadCodeMirror() {
    try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/codemirror.min.js');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/javascript/javascript.min.js');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/edit/closebrackets.min.js');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/edit/matchbrackets.min.js');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/comment/comment.min.js');
         // Addons para busca e substituição
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/search/searchcursor.js');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/search/search.js');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/dialog/dialog.js');
        await loadCSS('https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/dialog/dialog.min.css');
    } catch (error) {
        console.error('SisPMG+: Falha ao carregar scripts do CodeMirror.', error);
        // Se o CodeMirror não carregar, a funcionalidade do editor será degradada, mas o resto pode funcionar.
    }
}


/**
 * Função principal que inicia a verificação do DOM para o módulo Terminal.
 * @param {object} config - Objeto de configuração da extensão.
 */
async function main(config) {
    console.log('SisPMG+: Módulo de carregamento do Terminal iniciado.');
    
    try {
        const iconModule = await import(config.iconUrl);
        iconSVG = iconModule.iconSVG;
    } catch (e) {
        console.error("SisPMG+: Falha ao carregar o módulo do ícone.", e);
        iconSVG = '<svg></svg>'; // Fallback
    }

    if (checkInterval) clearInterval(checkInterval);

    checkInterval = setInterval(async () => {
        // Busca a configuração do storage para saber se o módulo está ativo
        const isEnabled = await getConfigFromStorage('terminalModuleEnabled') !== false;
        
        if (isEnabled && window.term && window.term.buffer && !terminalModuleInstance) {
            // Se a instância do terminal xterm.js for encontrada E o módulo estiver ativo, carrega o módulo.
            console.log("SisPMG+: Instância do terminal encontrada. Carregando módulo...");
            loadTerminalModule(config);
        }
    }, 1000); // Verifica a cada segundo
}

/**
 * Carrega e inicializa o módulo principal do Terminal.
 * @param {object} config - Objeto de configuração da extensão.
 */
async function loadTerminalModule(config) {
    try {
        // Injeta a folha de estilos do módulo do terminal
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = config.cssUrl;
        document.head.appendChild(link);
        
        // Importa e instancia o módulo principal do terminal
        const { TerminalModule } = await import(config.terminalModuleUrl);
        terminalModuleInstance = new TerminalModule(window.term, { ...config, iconSVG });
        terminalModuleInstance.init();
        console.log("SisPMG+: Módulo TerminalPMG+ carregado com sucesso.");
    } catch (error) {
        console.error("SisPMG+: Falha ao carregar ou inicializar o módulo do terminal.", error);
    }
}

// --- FUNÇÕES DE COMUNICAÇÃO COM O BACKGROUND (VIA content-script) ---

function sendMessageToBackground(action, payload) {
    return new Promise(resolve => {
        const messageId = Date.now() + Math.random();
        
        const responseListener = (event) => {
            if (event.detail.messageId === messageId) {
                document.removeEventListener('SisPMG+:Response', responseListener);
                resolve(event.detail.response);
            }
        };
        document.addEventListener('SisPMG+:Response', responseListener);

        window.postMessage({ type: 'FROM_APP', action, payload, messageId }, '*');
    });
}

function getConfigFromStorage(key) {
    // A chave 'terminalModuleEnabled' é consultada aqui para decidir se o módulo deve ser carregado.
    return sendMessageToBackground('getStorage', { key: [key] }).then(r => r.success ? r.value[key] : undefined);
}
