// Arquivo: common/keep-alive.js
// Fornece um wrapper para fetch que mantém o service worker ativo durante operações longas.

const KEEPALIVE_INTERVAL = 5 * 1000; // 5 segundos

/**
 * Executa uma operação de fetch garantindo que o service worker não seja encerrado
 * por inatividade durante a requisição.
 * @param {RequestInfo|URL} resource O recurso a ser buscado.
 * @param {RequestInit} [options] As opções da requisição fetch.
 * @returns {Promise<Response>} A promessa que resolve para a resposta do fetch.
 */
export async function fetchWithKeepAlive(resource, options) {
    let keepAliveInterval;

    const startKeepAlive = () => {
        keepAliveInterval = setInterval(() => {
            // Operação leve para manter o SW ativo. Ler do storage é uma boa opção.
            browser.storage.local.get('__sispmg_ping__').catch(() => {});
            // console.log("SisPMG+ [KeepAlive]: Ping."); // Descomente para depuração
        }, KEEPALIVE_INTERVAL);
    };

    const stopKeepAlive = () => {
        if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            // console.log("SisPMG+ [KeepAlive]: Stop."); // Descomente para depuração
        }
    };

    try {
        startKeepAlive();
        const response = await fetch(resource, options);
        return response;
    } finally {
        stopKeepAlive();
    }
}
