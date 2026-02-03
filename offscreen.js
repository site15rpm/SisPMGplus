/**
 * Script para Documento Offscreen
 * Objetivo: Realizar parsing de HTML de forma genérica.
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Escuta apenas mensagens direcionadas a 'offscreen'
    if (request.target === 'offscreen') {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(request.html, 'text/html');

            if (request.action === 'parseDOM') {
                const element = doc.querySelector(request.selector);
                let value = element ? (element.value ?? element.textContent ?? element.innerHTML) : null;
                sendResponse({ value: value });

            } else if (request.action === 'parseDOMErrorMessages') {
                const errorMsgElement = doc.querySelector('.msg_erro_geral');
                const detailMsgElement = doc.querySelector('.msg_erro_detalhe');
                const infoMsgElement = doc.querySelector('.msg.de.info'); // Corrigido seletor com ponto

                let errorMessage = errorMsgElement?.textContent.trim() ?? null;
                const detailMessage = detailMsgElement?.textContent.trim() ?? null;
                const infoMessage = infoMsgElement?.textContent.trim() ?? null;

                if (errorMessage && detailMessage) errorMessage += ` (${detailMessage})`;
                 // Retorna erro OU info, priorizando erro.
                 sendResponse({ errorMessage: errorMessage || infoMessage || "Erro/Info não encontrado no HTML." });

            } else if (request.action === 'parseDOMForInfoMessage') { // Nova ação para info
                 const infoMsgElement = doc.querySelector('.msg.de.info'); // Corrigido seletor com ponto
                 const infoMessage = infoMsgElement?.textContent.trim() ?? null;
                 sendResponse({ infoMessage: infoMessage });

            } else {
                 sendResponse({ error: `Ação desconhecida: ${request.action}` });
            }

        } catch (error) {
            console.error("Erro ao fazer parse do HTML no offscreen:", error);
            sendResponse({ value: null, errorMessage: null, infoMessage: null, error: error.message });
        }
        return true; // Resposta assíncrona
    }
    return false; // Não lidou com a mensagem
});

