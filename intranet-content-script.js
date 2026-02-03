// Arquivo: intranet-content-script.js
// Injeta o loader dos módulos da Intranet e estabelece a comunicação com o background.

console.log('SisPMG+: Injetor da Intranet ativo.');

/**
 * Exibe um modal na página para informar o usuário sobre o contexto invalidado e oferecer a opção de recarregar.
 * Esta versão usa cssText e !important para garantir a sobreposição de estilos conflitantes da página hospedeira.
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

        if (!chrome.runtime || !chrome.runtime.sendMessage) {
            showContextInvalidatedModal();
            return;
        }

        try {
            chrome.runtime.sendMessage({ action, payload }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn(`SisPMG+ [Intranet Content]: Contexto invalidado detectado no callback. Erro: ${chrome.runtime.lastError.message}`);
                    showContextInvalidatedModal();
                    return;
                }
                document.dispatchEvent(new CustomEvent('SisPMG+:Response', {
                    detail: { response, messageId }
                }));
            });
        } catch (error) {
            console.warn(`SisPMG+ [Intranet Content]: Falha ao enviar mensagem (contexto invalidado). Erro: ${error.message}`);
            showContextInvalidatedModal();
        }
    }
}, false);

// Listener para mensagens vindas do background para a página
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Lógica para atualizar logs do SICOR
    if (request.action === 'sicor-logs-updated') {
        window.postMessage({ type: 'FROM_SISPMG_BACKGROUND', action: request.action, logs: request.logs }, '*');
    }

    // Lógica para acionar o download (integrada aqui)
    if (request.action === 'triggerDownload') {
        const { url, filename } = request;
        console.log(`SisPMG+ [Downloader]: Recebido pedido para baixar '${filename}'`); // Log added
        if (!url || !filename) {
            console.error('SisPMG+ [Downloader]: URL ou nome de arquivo ausentes.');
            sendResponse({ success: false, error: 'URL ou nome de arquivo ausentes.' });
            return true;
        }
        try {
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename; // This attribute handles the filename, including subdirectories.
            document.body.appendChild(a);
            a.click();
            // Cleanup after click initiated download
            window.URL.revokeObjectURL(url); // Revoke Data URL if it was created with createObjectURL
            document.body.removeChild(a);
            console.log(`SisPMG+ [Downloader]: Link de download clicado para '${filename}'.`); // Log added
            sendResponse({ success: true });
        } catch (error) {
            console.error(`SisPMG+ [Downloader]: Falha ao acionar o download para '${filename}'.`, error);
            sendResponse({ success: false, error: error.message });
        }
        return true; // Indicates asynchronous response
    }
    // Return false for messages not handled here
    // return false; // Or remove if no other async operations exist in this listener
});


// --- LÓGICA DE INJEÇÃO ---
try {
    // 1. Criar o objeto de configuração com as URLs dos recursos da extensão.
    const config = {
        padmModuleUrl: chrome.runtime.getURL('modules/intranet/intranet-padm.js'),
        padmCssUrl: chrome.runtime.getURL('modules/intranet/intranet-padm-styles.css'),
        uiModuleUrl: chrome.runtime.getURL('modules/intranet/intranet-ui.js'),
        uiCssUrl: chrome.runtime.getURL('modules/intranet/intranet-ui-styles.css'),
        aniverModuleUrl: chrome.runtime.getURL('modules/intranet/intranet-aniver.js'),
        aniverCssUrl: chrome.runtime.getURL('modules/intranet/intranet-aniver-styles.css'),
        sirconvModuleUrl: chrome.runtime.getURL('modules/intranet/intranet-sirconv.js'),
        sirconvCssUrl: chrome.runtime.getURL('modules/intranet/intranet-sirconv-styles.css'),
        sicorModuleUrl: chrome.runtime.getURL('modules/intranet/intranet-sicor.js'),
        sicorCssUrl: chrome.runtime.getURL('modules/intranet/intranet-sicor-styles.css'),
        sic3Url: chrome.runtime.getURL('modules/sic3.html'),
        cdocUrl: chrome.runtime.getURL('modules/cdoc.html'),
        mcmtsUrl: chrome.runtime.getURL('modules/mcmts.html'),
        iconUrl: chrome.runtime.getURL('common/icon.js'),
        utilsUrl: chrome.runtime.getURL('common/utils.js')
    };

    // 2. Injetar a configuração em uma tag <script> para que o loader a acesse imediatamente.
    const configScript = document.createElement('script');
    configScript.id = 'sispmg-config-data';
    configScript.type = 'application/json';
    configScript.textContent = JSON.stringify(config);
    (document.head || document.documentElement).appendChild(configScript);

    // 3. Injetar o script do loader, que agora pode ler a configuração diretamente do DOM.
    const loaderScript = document.createElement('script');
    loaderScript.type = 'module';
    loaderScript.src = chrome.runtime.getURL('intranet-loader.js');
    (document.head || document.documentElement).appendChild(loaderScript);

} catch (e) {
    console.error('SisPMG+: Falha ao injetar o loader da Intranet.', e);
}
