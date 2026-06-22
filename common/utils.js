// Arquivo: common/utils.js
// Contém funções auxiliares reutilizáveis em vários módulos.

/**
 * Envia uma mensagem para o script de background e aguarda a resposta.
 * @param {string} action - A ação a ser executada pelo background.
 * @param {object} payload - Os dados a serem enviados com a ação.
 * @returns {Promise<any>} A resposta do script de background.
 */
export function sendMessageToBackground(action, payload) {
    return new Promise((resolve, reject) => {
        const messageId = Date.now() + Math.random();
        
        // Timeout de segurança: resolve com null se o background não responder em 30s
        const timeoutId = setTimeout(() => {
            document.removeEventListener('SisPMG+:Response', responseListener);
            console.warn(`SisPMG+ [utils]: Timeout aguardando resposta do background para a ação '${action}'.`);
            resolve(null);
        }, 30000);

        const responseListener = (event) => {
            // event.detail é uma string JSON vinda do content-script,
            // que é a forma segura de passar dados no Firefox.
            if (!event.detail || typeof event.detail !== 'string') return;
            
            try {
                const detail = JSON.parse(event.detail);
                if (detail.messageId === messageId) {
                    clearTimeout(timeoutId);
                    document.removeEventListener('SisPMG+:Response', responseListener);
                    resolve(detail.response);
                }
            } catch (e) {
                // Ignora eventos que não são JSON válido, pois podem não ser para nós.
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


const JWT_CACHE_MAX_SIZE = 10;
const jwtCache = new Map();

/**
 * Decodifica o payload de um token JWT de forma segura, tratando Base64Url e padding.
 * @param {string} token - O token JWT.
 * @returns {object|null} O payload do token decodificado ou null em caso de erro.
 */
export function decodeJwt(token) {
    if (!token || typeof token !== 'string') { 
        return null; 
    }
    if (jwtCache.has(token)) {
        return jwtCache.get(token);
    }
    try { 
        const parts = token.split('.');
        if (parts.length !== 3) {
            return null; 
        }
        
        let payload = parts[1];
        // Trata Base64Url para Base64 padrão
        payload = payload.replace(/-/g, '+').replace(/_/g, '/');
        
        // Adiciona preenchimento (padding) se necessário
        const pad = payload.length % 4;
        if (pad) {
            payload += '='.repeat(4 - pad);
        }
        
        const decoded = JSON.parse(atob(payload)); 
        // Limita o tamanho do cache (LRU simplificado: remove o mais antigo quando cheio)
        if (jwtCache.size >= JWT_CACHE_MAX_SIZE) {
            jwtCache.delete(jwtCache.keys().next().value);
        }
        jwtCache.set(token, decoded);
        return decoded;
    } catch (e) { 
        console.error('SisPMG+ [decodeJwt]: Falha ao decodificar o token JWT.', e);
        return null; 
    }
}

/**
 * Mapeia e traduz de forma organizada as chaves do Tokiuz JWT:
 * g: Número PM
 * t: Posto/Graduação
 * n: Nome do usuário
 * e: Código da RPM (Região)
 * r: Nome da RPM
 * p: Nome da Unidade
 * u: Código da Unidade (Unidade Contábil)
 * c: Código da Seção/Fração/Município (Unidade Administrativa)
 * f: Array de funções no formato Local.Função
 * 
 * @param {object} decoded - O payload JWT decodificado
 * @returns {object|null} Objeto traduzido das chaves do tokiuz
 */
export function parseTokiuzPayload(decoded) {
    if (!decoded) return null;
    
    const funcoes = Array.isArray(decoded.f) ? decoded.f.map(String) : [];
    const locais = [];
    const funcoesLista = [];
    
    funcoes.forEach(func => {
        const parts = func.split('.');
        if (parts.length > 1) {
            locais.push(parts[0]);
            funcoesLista.push(parts.slice(1).join('.'));
        } else {
            locais.push(func);
            funcoesLista.push("");
        }
    });
    
    return {
        numeroPM: String(decoded.g || ''),
        postoGraduacao: String(decoded.t || ''),
        nome: String(decoded.n || ''),
        codigoRegiao: String(decoded.e || ''),
        nomeRegiao: String(decoded.r || ''),
        nomeUnidade: String(decoded.p || ''),
        codigoUnidade: String(decoded.u || ''),
        codigoSecao: String(decoded.c || ''),
        funcoesCompleto: funcoes,
        locais: locais,
        funcoesLista: funcoesLista
    };
}

/**
 * Verifica se o usuário atende aos critérios de abrangência.
 * A lógica é OR: o usuário precisa satisfazer pelo menos UM dos critérios definidos.
 * Dentro de um critério (ex: g:123|456), a lógica é OR (bater com 123 OU 456).
 * Suporta critérios: g (matrícula), t (posto), e (entidade/RPM), p (unidade),
 * r (região), u (unidade contábil), c (seção), f (funções completo),
 * fl (local da função), ff (código da função).
 * Valores especiais: "PMMG" ou "1" concedem acesso universal.
 * @param {string} abrangenciaString - A string de regras (ex: "g:123|456, t:SGT, e:6869").
 * @param {object} userData - O objeto com os dados do usuário do token.
 * @returns {boolean} - True se o usuário tiver acesso, false caso contrário.
 */
export function checkAbrangencia(abrangenciaString, userData) {
    if (!abrangenciaString) return false;
    const upperString = abrangenciaString.toUpperCase();

    // "PMMG" ou "1" concedem acesso universal
    if (upperString === 'PMMG' || upperString === '1') return true;

    const allCriteria = abrangenciaString.split(',');
    if (allCriteria.length === 0) return false;

    // Lógica OR: o usuário precisa corresponder a pelo menos UM critério
    for (const criterion of allCriteria) {
        const parts = criterion.split(':');
        if (parts.length < 2) continue;

        const key = parts[0].trim().toLowerCase();
        const rules = parts.slice(1).join(':').trim();
        const ruleList = rules.split('|').map(r => r.trim()).filter(r => r);

        if (!Object.prototype.hasOwnProperty.call(userData, key) || ruleList.length === 0) continue;

        const userValue = userData[key];
        let criteriaMet = false;

        if ((key === 'f' || key === 'fl' || key === 'ff') && Array.isArray(userValue)) {
            for (const userItem of userValue) {
                for (const rule of ruleList) {
                    try {
                        if (new RegExp('^' + rule + '$', 'i').test(userItem)) { criteriaMet = true; break; }
                    } catch (e) {
                        if (userItem === rule) criteriaMet = true;
                    }
                }
                if (criteriaMet) break;
            }
        } else if (typeof userValue === 'string') {
            for (const rule of ruleList) {
                try {
                    if (new RegExp('^' + rule + '$', 'i').test(userValue)) { criteriaMet = true; break; }
                } catch (e) {
                    if (userValue === rule) criteriaMet = true;
                }
            }
        }

        if (criteriaMet) return true;
    }

    return false;
}
