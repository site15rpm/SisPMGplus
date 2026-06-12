// Arquivo: modules/sic3_v3/api.js
// Cliente de comunicação HTTP REST com a API do Google Apps Script (GAS) para o SIC3 v3.0.

const DEFAULT_GAS_URL_V3 = "https://script.google.com/macros/s/AKfycbwL6OjarZR0B41c0Ii0eQu5tz4u7_fU8jGzVpnzVDSGKt8FS_TvWd3FoFOgO7SMQdZV6g/exec"; 

/**
 * Obtém a URL configurada do Web App do GAS v3 a partir do armazenamento da extensão.
 * @returns {Promise<string>} A URL do Web App do GAS.
 */
export async function getGasApiUrl() {
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        const result = await browser.storage.local.get('sic3GasApiUrlV3');
        return result.sic3GasApiUrlV3 || DEFAULT_GAS_URL_V3;
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
            chrome.storage.local.get('sic3GasApiUrlV3', (result) => {
                resolve(result.sic3GasApiUrlV3 || DEFAULT_GAS_URL_V3);
            });
        });
    }
    return DEFAULT_GAS_URL_V3;
}

/**
 * Salva a URL do Web App do GAS v3 no armazenamento da extensão.
 * @param {string} url - A URL do Web App.
 */
export async function saveGasApiUrl(url) {
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        await browser.storage.local.set({ 'sic3GasApiUrlV3': url });
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ 'sic3GasApiUrlV3': url }, () => {
                resolve();
            });
        });
    }
}

/**
 * Executa uma requisição HTTP POST contra a API do Google Apps Script v3.
 * @param {string} action - O nome da ação/rota a ser chamada no servidor.
 * @param {object} params - Os parâmetros de entrada da função (enviados em array se for compatível com a API GAS).
 * @returns {Promise<object>} O resultado da requisição retornado pelo GAS.
 */
export async function executarApi(action, params = []) {
    const apiUrl = await getGasApiUrl();
    if (!apiUrl) {
        throw new Error("A URL da API do GAS v3 não está configurada na extensão. Configure-a no rodapé para utilizar o SIC3 v3.0.");
    }

    // O token de autenticação local (sessionStorage) ou bypass
    const token = sessionStorage.getItem('authTokenV3') || 'bypass'; 
    const rpm = window.rpm || "15";
    const ano = window.ano || new Date().getFullYear().toString();
    
    // Insere logs úteis durante a construção do sic3 v3.0
    console.log(`[SIC3 v3.0 Log] Executando chamada de API [${action}] para RPM ${rpm}, Ano ${ano}. Parâmetros:`, params);
    
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8' 
            },
            body: JSON.stringify({
                action: action,
                authToken: token,
                rpm: rpm,
                ano: ano,
                params: params
            })
        });

        if (!response.ok) {
            throw new Error(`Erro na requisição: Código HTTP ${response.status}`);
        }

        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            console.error("[SIC3 v3.0 Log] Erro no parse da resposta JSON. Resposta bruta:", responseText);
            throw new Error("Resposta inválida do servidor GAS. Verifique a implantação do script.");
        }

        // Logs de depuração
        console.log(`[SIC3 v3.0 Log] Resposta da API [${action}] recebida:`, data);

        if (data && data.success === false && data.errorCode === "UNAUTHORIZED") {
            sessionStorage.removeItem('authTokenV3');
            document.dispatchEvent(new CustomEvent('sic3_v3:unauthorized'));
        }

        return data;
    } catch (error) {
        console.error(`[SIC3 v3.0 Log] Erro ao chamar a API [${action}]:`, error);
        throw error;
    }
}
