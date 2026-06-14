// Arquivo: modules/sic3/api.js
// Cliente de comunicação HTTP REST com a API do Google Apps Script (GAS) para o SIC3.

// URL padrão de fallback (o usuário pode alterar nas configurações da extensão se necessário)
const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbwL6OjarZR0B41c0Ii0eQu5tz4u7_fU8jGzVpnzVDSGKt8FS_TvWd3FoFOgO7SMQdZV6g/exec"; 

/**
 * Obtém a URL configurada do Web App do GAS a partir do armazenamento da extensão.
 * @returns {Promise<string>} A URL do Web App do GAS.
 */
export async function getGasApiUrl() {
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        const result = await browser.storage.local.get('sic3GasApiUrl');
        return result.sic3GasApiUrl || DEFAULT_GAS_URL;
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
            chrome.storage.local.get('sic3GasApiUrl', (result) => {
                resolve(result.sic3GasApiUrl || DEFAULT_GAS_URL);
            });
        });
    }
    return DEFAULT_GAS_URL;
}

/**
 * Salva a URL do Web App do GAS no armazenamento da extensão.
 * @param {string} url - A URL do Web App.
 */
export async function saveGasApiUrl(url) {
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        await browser.storage.local.set({ 'sic3GasApiUrl': url });
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ 'sic3GasApiUrl': url }, () => {
                resolve();
            });
        });
    }
}

/**
 * Executa uma requisição HTTP POST contra a API do Google Apps Script.
 * @param {string} action - O nome da ação/rota a ser chamada no servidor.
 * @param {object} params - Os parâmetros de entrada da função.
 * @returns {Promise<object>} O resultado da requisição retornado pelo GAS.
 */
export async function executarApi(action, params = {}) {
    const apiUrl = await getGasApiUrl();
    if (!apiUrl) {
        throw new Error("A URL da API do GAS não está configurada na extensão. Configure-a para utilizar o SIC3.");
    }

    const token = sessionStorage.getItem('authToken') || '';
    
    // Resolve o ano com prioridade máxima para sessionStorage para evitar colisões com DOM
    let ano = sessionStorage.getItem('sic3_ano');
    if (!ano) {
        if (window.ano && typeof window.ano === 'string') {
            ano = window.ano;
        } else if (window.ano && typeof window.ano === 'object' && window.ano.value) {
            ano = window.ano.value;
        } else {
            ano = new Date().getFullYear().toString();
        }
    }

    // Resolve a RPM com prioridade máxima para sessionStorage
    let rpm = sessionStorage.getItem('sic3_rpm');
    if (!rpm) {
        if (window.rpm && typeof window.rpm === 'string') {
            rpm = window.rpm;
        } else if (window.rpm && typeof window.rpm === 'object' && window.rpm.value) {
            rpm = window.rpm.value;
        } else {
            rpm = "";
        }
    }
    
    console.log(`[SIC3 v3.0 Log] [API Request] executando action: "${action}" para RPM: ${rpm}, Ano: ${ano} na URL: ${apiUrl}. Params:`, params);
    const startTime = Date.now();

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8' // GAS lida melhor com text/plain para evitar redirecionamentos complexos de CORS preflight
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
        console.log(`[SIC3 v3.0 Log] [API Response Raw] Recebido em ${Date.now() - startTime}ms para action "${action}":`, responseText.substring(0, 500) + (responseText.length > 500 ? "..." : ""));
        
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            console.error("[SIC3 v3.0 Log] Erro ao fazer parse da resposta do GAS. Resposta bruta:", responseText);
            throw new Error("Resposta inválida do servidor. Verifique se o Web App do GAS está implantado corretamente.");
        }

        console.log(`[SIC3 v3.0 Log] [API Response Object] Parsed com sucesso para action "${action}":`, data);

        // Se a resposta indicar erro de autorização expirada
        if (data && data.errorCode === "UNAUTHORIZED") {
            console.warn(`[SIC3 v3.0 Log] [API Warning] Acesso não autorizado (UNAUTHORIZED) retornado pela action "${action}". Expulsando usuário para a tela admin.`);
            sessionStorage.removeItem('authToken');
            // Redireciona para a tela de login local caso o token seja inválido
            document.dispatchEvent(new CustomEvent('sic3:unauthorized'));
        }

        return data;
    } catch (error) {
        console.error(`[SIC3 v3.0 Log] [API Error] Falha ao chamar a API para action "${action}" após ${Date.now() - startTime}ms:`, error);
        throw error;
    }
}
