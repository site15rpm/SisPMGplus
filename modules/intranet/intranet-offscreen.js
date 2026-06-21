// Arquivo: modules/intranet/intranet-offscreen.js
// Funções auxiliares centralizadas para interagir com o documento offscreen.
// Utilizado por: intranet-background.js, intranet-sicor-background.js,
//               busca-unidades.js, busca-concedentes.js, busca-convenios.js

const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';

/**
 * Garante que o documento offscreen esteja pronto para uso.
 * @returns {Promise<void>}
 */
async function setupOffscreenDocument() {
    try {
        // 1. Verifica se a API Offscreen existe (Chrome)
        if (typeof browser.offscreen !== 'undefined') {
            let existingContexts = [];
            try {
                if (typeof browser.runtime.getContexts === 'function') {
                    existingContexts = await browser.runtime.getContexts({
                        contextTypes: ['OFFSCREEN_DOCUMENT'],
                        documentUrls: [browser.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
                    });
                }
            } catch (e) { /* ignore */ }

            if (existingContexts.length > 0) return;

            await browser.offscreen.createDocument({
                url: OFFSCREEN_DOCUMENT_PATH,
                reasons: [browser.offscreen.Reason.DOM_PARSER],
                justification: 'Parsear HTML para extração de dados (unidades, concedentes, convênios).',
            });
        } else {
            // 2. Fallback para Firefox (Iframe Oculto no Background Page)
            if (document.getElementById('sispmg-offscreen-iframe')) return;

            const iframe = document.createElement('iframe');
            iframe.id = 'sispmg-offscreen-iframe';
            iframe.src = browser.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
            iframe.style.display = 'none';
            document.body.appendChild(iframe);

            // Aguarda o carregamento do script interno do offscreen
            await new Promise(resolve => {
                iframe.onload = () => setTimeout(resolve, 300);
            });
        }
    } catch (e) {
        // Ignora o erro se o documento já foi criado por outra operação.
        if (e.message && !e.message.includes('Only a single offscreen document may be created.')) {
            console.error("SisPMG+ [Offscreen]: Erro ao configurar documento offscreen.", e);
            throw e;
        }
    }
}

/**
 * Envia uma mensagem para o documento offscreen e aguarda a resposta.
 * Inclui timeout de 10s para evitar travamentos em caso de falha no offscreen.
 * @param {string} action - A ação a ser executada pelo offscreen.
 * @param {object} data - Os dados a serem enviados.
 * @returns {Promise<any>} A resposta do documento offscreen.
 */
export async function sendMessageToOffscreen(action, data) {
    try {
        await setupOffscreenDocument();
        const response = await Promise.race([
            browser.runtime.sendMessage({
                target: 'offscreen',
                action: action,
                ...data
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout esperando resposta do offscreen')), 10000))
        ]);

        if (response && response.error) {
            console.error(`SisPMG+ [Offscreen]: Erro retornado pelo offscreen (${action}): ${response.error}`);
        }
        return response;
    } catch (error) {
        console.error(`SisPMG+ [Offscreen]: Erro ao enviar/receber mensagem para offscreen (${action}):`, error);
        return { error: `Falha na comunicação com offscreen (${action}): ${error.message}` };
    }
}

/**
 * Fecha o documento offscreen se ele estiver aberto.
 * @returns {Promise<void>}
 */
export async function closeOffscreenDocument() {
    try {
        if (typeof browser.offscreen !== 'undefined') {
            const contexts = await browser.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
            if (contexts.length > 0) {
                await browser.offscreen.closeDocument();
            }
        } else {
            // Fallback Firefox
            document.getElementById('sispmg-offscreen-iframe')?.remove();
        }
    } catch (closeError) {
        if (closeError.message && !closeError.message.includes("No current offscreen document")) {
            console.warn("SisPMG+ [Offscreen]: Erro ao fechar o documento offscreen.", closeError);
        }
    }
}
