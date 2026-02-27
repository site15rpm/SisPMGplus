// Arquivo: modules/intranet/intranet-agenda-offscreen.js
// Funções auxiliares para interagir com o documento offscreen para o módulo de Agenda.

const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';

/**
 * Garante que o documento offscreen esteja pronto para uso.
 * @returns {Promise<void>}
 */
async function setupOffscreenDocument() {
    try {
        const existingContexts = await browser.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
            documentUrls: [browser.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
        });

        if (existingContexts.length > 0) {
            return;
        }

        await browser.offscreen.createDocument({
            url: OFFSCREEN_DOCUMENT_PATH,
            reasons: [browser.offscreen.Reason.DOM_PARSER],
            justification: 'Parsear HTML para extração de dados da agenda e unidades.',
        });
    } catch (e) {
        // Ignora o erro se o documento já foi criado por outra operação.
        if (!e.message.includes('Only a single offscreen document may be created.')) {
            console.error("SisPMG+ [Agenda Offscreen]: Erro ao configurar documento offscreen.", e);
            throw e;
        }
    }
}

/**
 * Envia uma mensagem para o documento offscreen e aguarda a resposta.
 * @param {string} action - A ação a ser executada pelo offscreen.
 * @param {object} data - Os dados a serem enviados.
 * @returns {Promise<any>} A resposta do documento offscreen.
 */
export async function sendMessageToOffscreen(action, data) {
    try {
        await setupOffscreenDocument();
        const response = await browser.runtime.sendMessage({
            target: 'offscreen',
            action: action,
            ...data
        });
        return response;
    } catch (error) {
        console.error(`SisPMG+ [Agenda Offscreen]: Erro ao enviar/receber mensagem para offscreen (${action}):`, error);
        return { error: `Falha na comunicação com offscreen (${action})` };
    }
}

/**
 * Fecha o documento offscreen se ele estiver aberto.
 * @returns {Promise<void>}
 */
export async function closeOffscreenDocument() {
    try {
        const contexts = await browser.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
        if (contexts.length > 0) {
            await browser.offscreen.closeDocument();
        }
    } catch (closeError) {
        // Ignora erros se o documento já foi fechado por outra operação.
    }
}
