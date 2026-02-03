// Arquivo: terminal-content-script.js
// Injeta o loader do módulo Terminal e estabelece a comunicação com o background.

console.log('SisPMG+: Injetor do Terminal ativo.');

/**
 * Exibe um modal na página para informar o usuário sobre o contexto invalidado e oferecer a opção de recarregar.
 */
function showContextInvalidatedModal() {
    // Evita a criação de múltiplos modais
    if (document.getElementById('sispmg-context-modal')) return;

    const modalBackdrop = document.createElement('div');
    modalBackdrop.id = 'sispmg-context-modal';
    modalBackdrop.style.cssText = `
        position: fixed !important; 
        top: 0 !important; 
        left: 0 !important; 
        width: 100% !important; 
        height: 100% !important;
        background-color: rgba(0, 0, 0, 0.6) !important; 
        z-index: 2147483647 !important; /* Max z-index */
        display: flex !important;
        align-items: center !important; 
        justify-content: center !important; 
        font-family: sans-serif !important;
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        background-color: #fff !important; 
        padding: 25px !important; 
        border-radius: 8px !important; 
        text-align: center !important;
        box-shadow: 0 5px 15px rgba(0,0,0,0.3) !important; 
        max-width: 400px !important;
        width: 90% !important;
        color: #333 !important;
    `;

    modalContent.innerHTML = `
        <h3 style="margin: 0 0 15px 0 !important; color:#333 !important; font-size: 1.5rem !important; font-weight: bold !important; line-height: 1.2 !important;">SisPMG+ foi atualizado</h3>
        <p style="color:#555 !important; margin-bottom:25px !important; font-size: 1rem !important; line-height: 1.5 !important;">A extensão foi atualizada em segundo plano. Para garantir o funcionamento correto, esta página precisa ser recarregada.</p>
    `;

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        display: flex !important; 
        gap: 10px !important; 
        justify-content: center !important;
        margin-top: 20px !important;
    `;

    const reloadButton = document.createElement('button');
    reloadButton.textContent = 'Atualizar Página';
    reloadButton.style.cssText = `
        padding: 10px 20px !important; 
        border: none !important; 
        border-radius: 5px !important; 
        cursor: pointer !important;
        background-color: #28a745 !important; 
        color: white !important; 
        font-weight: bold !important;
        font-size: 1rem !important;
        display: inline-block !important;
        visibility: visible !important;
        opacity: 1 !important;
    `;
    reloadButton.onclick = () => window.location.reload();

    const closeButton = document.createElement('button');
    closeButton.textContent = 'Fechar';
    closeButton.style.cssText = `
        padding: 10px 20px !important; 
        border: 1px solid #ccc !important; 
        border-radius: 5px !important;
        cursor: pointer !important; 
        background-color: #f0f0f0 !important; 
        color: #333 !important;
        font-size: 1rem !important;
        display: inline-block !important;
        visibility: visible !important;
        opacity: 1 !important;
    `;
    closeButton.onclick = () => modalBackdrop.remove();

    buttonContainer.appendChild(closeButton);
    buttonContainer.appendChild(reloadButton);
    modalContent.appendChild(buttonContainer);
    modalBackdrop.appendChild(modalContent);
    document.body.appendChild(modalBackdrop);
}


// --- PONTE DE COMUNICAÇÃO BIDIRECIONAL ---
window.addEventListener('message', (event) => {
    if (event.source === window && event.data && event.data.type === 'FROM_APP') {
        const { action, payload, messageId } = event.data;
        
        // Verificação preliminar se o runtime ainda está acessível.
        if (!chrome.runtime || !chrome.runtime.sendMessage) {
            showContextInvalidatedModal();
            return;
        }

        try {
            chrome.runtime.sendMessage({ action, payload }, (response) => {
                // chrome.runtime.lastError é a forma principal de detectar o contexto invalidado
                // em callbacks assíncronas.
                if (chrome.runtime.lastError) {
                    console.warn(`SisPMG+ [Terminal Content]: Contexto invalidado detectado no callback. Erro: ${chrome.runtime.lastError.message}`);
                    showContextInvalidatedModal();
                    return;
                }
                document.dispatchEvent(new CustomEvent('SisPMG+:Response', {
                    detail: { response, messageId }
                }));
            });
        } catch (error) {
            // O bloco catch lida com casos onde a chamada sendMessage falha sincronamente.
            console.warn(`SisPMG+ [Terminal Content]: Falha ao enviar mensagem (contexto invalidado). Erro: ${error.message}`);
            showContextInvalidatedModal();
        }
    }
}, false);

// --- LÓGICA DE INJEÇÃO ---
try {
    // 1. Criar o objeto de configuração com as URLs dos recursos da extensão.
    const config = {
        terminalModuleUrl: chrome.runtime.getURL('modules/terminal/terminal.js'),
        cssUrl: chrome.runtime.getURL('modules/terminal/terminal-styles.css'),
        iconUrl: chrome.runtime.getURL('common/icon.js')
    };
    
    // 2. Injetar a configuração em uma tag <script> para que o loader a acesse imediatamente.
    const configScript = document.createElement('script');
    configScript.id = 'sispmg-config-data';
    configScript.type = 'application/json';
    configScript.textContent = JSON.stringify(config);
    (document.head || document.documentElement).appendChild(configScript);

    // 3. Injetar o script do loader.
    const loaderScript = document.createElement('script');
    loaderScript.type = 'module';
    loaderScript.src = chrome.runtime.getURL('terminal-loader.js');
    (document.head || document.documentElement).appendChild(loaderScript);

} catch (e) {
    console.error('SisPMG+: Falha ao injetar o loader do Terminal.', e);
}
