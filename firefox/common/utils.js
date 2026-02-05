// Arquivo: common/utils.js
// Contém funções auxiliares reutilizáveis em vários módulos.

/**
 * Envia uma mensagem para o script de background e aguarda a resposta.
 * @param {string} action - A ação a ser executada pelo background.
 * @param {object} payload - Os dados a serem enviados com a ação.
 * @returns {Promise<any>} A resposta do script de background.
 */
export function sendMessageToBackground(action, payload) {
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

/**
 * Obtém o valor de um cookie pelo nome, com fallback para o token do PrimeFaces.
 * @param {string} name - O nome do cookie.
 * @returns {string|undefined} O valor do cookie ou undefined se não for encontrado.
 */
export function getCookie(name) {
    // 1. Tenta o método padrão de leitura de cookie.
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
        return parts.pop().split(';').shift();
    }

    // 2. Fallback específico para 'tokiuz' em páginas onde ele é HttpOnly (como o SICOR).
    if (name === 'tokiuz') {
        try {
            if (typeof PrimeFaces !== 'undefined' && PrimeFaces.settings && PrimeFaces.settings.Authorization) {
                const authHeader = PrimeFaces.settings.Authorization;
                // Retorna o token, removendo o prefixo "Bearer " se existir.
                return authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
            }
        } catch (e) {
            console.warn('SisPMG+ [getCookie]: Falha ao tentar ler o token do PrimeFaces.', e);
        }
    }

    return undefined;
}


/**
 * Decodifica o payload de um token JWT de forma segura.
 * @param {string} token - O token JWT.
 * @returns {object|null} O payload do token decodificado ou null em caso de erro.
 */
export function decodeJwt(token) {
    // Garante que o token não é nulo, indefinido ou inválido.
    if (!token || typeof token !== 'string') { 
        return null; 
    }
    try { 
        const payload = token.split('.')[1];
        if (!payload) {
            return null; // Formato de token inválido
        }
        return JSON.parse(atob(payload)); 
    } catch (e) { 
        console.error('SisPMG+ [decodeJwt]: Falha ao decodificar o token JWT.', e);
        return null; 
    }
}

