// Arquivo: common/busca-unidades.js
// Funções centrais e reutilizáveis para busca e parse de unidades da intranet.

import { fetchWithKeepAlive } from './keep-alive.js';
import { sendMessageToOffscreen, closeOffscreenDocument } from '../modules/intranet/intranet-agenda-offscreen.js';

/**
 * Busca o HTML bruto de unidades da intranet.
 * @param {string} codigoRegiao - Código da região/unidade raiz (cUEOp).
 * @param {boolean} exibirCodigo - Se deve exibir os códigos das unidades (ExibeCodigo=1).
 * @param {boolean} apenasPrincipal - Se deve filtrar apenas pela unidade principal (UniPrinc=1).
 * @returns {Promise<string>} O HTML da resposta decodificado em ISO-8859-1.
 */
export async function fetchUnidadesHTML(codigoRegiao, exibirCodigo = true, apenasPrincipal = false) {
    const url = "https://intranet.policiamilitar.mg.gov.br/legado/operacoes/unidades/default.asp";
    
    const bodyParams = new URLSearchParams({
        acao: 'Consulta',
        cUEOp: codigoRegiao
    });

    if (exibirCodigo) {
        bodyParams.append('ExibeCodigo', '1');
    }
    if (apenasPrincipal) {
        bodyParams.append('UniPrinc', '1');
    }

    const response = await fetchWithKeepAlive(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        body: bodyParams.toString(),
        credentials: 'include'
    });
    
    if (!response.ok) {
        throw new Error(`Erro na requisição de unidades: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder("iso-8859-1");
    return decoder.decode(buffer);
}

/**
 * Faz o parsing do HTML das unidades usando o DOMParser local (frontend) ou documento offscreen (background).
 * @param {string} htmlText - O HTML bruto a ser analisado.
 * @returns {Promise<Array>} Lista de unidades parseadas.
 */
export async function parseUnidades(htmlText) {
    if (typeof DOMParser !== 'undefined') {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        const container = doc.querySelector('#c');
        if (!container) {
            throw new Error("Container 'div#c' não encontrado no HTML de unidades.");
        }

        const parsedData = [];
        const hierarchyStack = []; 
        const municipioStack = [];
        const codigoMunicipioStack = [];

        const normalizarMunicipio = (str) => {
            if (!str) return "";
            return str.toUpperCase().trim();
        };

        // Tenta extrair as informações de município e código padrão do título H2
        let defaultMunicipio = "";
        let defaultCodigoMunicipio = "";
        const h2Element = container.querySelector('h2');
        if (h2Element) {
            const h2Text = h2Element.textContent;
            const matchMuni = h2Text.match(/\(([^)]+)\)/);
            if (matchMuni) {
                defaultMunicipio = normalizarMunicipio(matchMuni[1]);
            }
            const iElement = h2Element.querySelector('i');
            if (iElement) {
                defaultCodigoMunicipio = iElement.textContent.trim();
            } else {
                const matchCod = h2Text.match(/-\s*(\d+)\s*$/) || h2Text.match(/\s+(\d+)$/);
                if (matchCod) {
                    defaultCodigoMunicipio = matchCod[1];
                }
            }
        }

        if (defaultMunicipio) {
            municipioStack[0] = defaultMunicipio;
            codigoMunicipioStack[0] = defaultCodigoMunicipio;
        }

        const extrairMunicipioUnidade = (unitName) => {
            let municipio = "";
            let codigoMunicipio = "";
            const matchParenteses = unitName.match(/\(([^)]+)\)/);
            if (matchParenteses) {
                const conteudo = matchParenteses[1].trim();
                if (/^\d+$/.test(conteudo)) {
                    codigoMunicipio = conteudo;
                    let antes = unitName.split(matchParenteses[0])[0].trim();
                    if (antes.includes(' - ')) {
                        municipio = antes.split(' - ').slice(-1)[0].trim();
                    } else {
                        municipio = antes;
                    }
                } else {
                    municipio = conteudo;
                    codigoMunicipio = "";
                }
            }
            return { municipio, codigoMunicipio };
        };

        let htmlContent = container.innerHTML;
        const h2Index = htmlContent.indexOf('</h2>');
        if (h2Index !== -1) {
            htmlContent = htmlContent.substring(h2Index + 5);
        }

        const lines = htmlContent.split(/<br\s*\/?>/i);
        lines.forEach((lineHtml) => {
            lineHtml = lineHtml.trim();
            if (!lineHtml || !lineHtml.includes('<i>')) return;

            let level = (lineHtml.match(/<span class=['"]ic rel join-(middle|bottom)['"]/g) || []).length;
            const codeMatch = lineHtml.match(/<i>(\d+)<\/i>/);
            const code = codeMatch ? codeMatch[1] : null;
            if (!code) return;

            if (level === 0) {
                level = 1;
            }

            const tempDiv = doc.createElement('div');
            tempDiv.innerHTML = lineHtml.replace(/<img[^>]+>/g, '');
            let name = tempDiv.textContent.replace(/-\s*\d+\s*$/, '').trim();
            name = name.replace(/\s\s+/g, ' ');

            const extraido = extrairMunicipioUnidade(name);
            name = name.replace(/\s*\([^)]+\)/g, '').trim();
            name = name.replace(/\s\s+/g, ' ');

            if (!name) return;

            const stackIndex = level - 1;
            hierarchyStack.length = stackIndex;
            municipioStack.length = stackIndex;
            codigoMunicipioStack.length = stackIndex;

            hierarchyStack[stackIndex] = name;
            
            if (extraido.municipio) {
                extraido.municipio = normalizarMunicipio(extraido.municipio);
            }
            
            if (extraido.municipio && !extraido.codigoMunicipio) {
                extraido.codigoMunicipio = code;
            }

            if (extraido.municipio) {
                municipioStack[stackIndex] = extraido.municipio;
                codigoMunicipioStack[stackIndex] = extraido.codigoMunicipio;
            } else if (stackIndex > 0 && municipioStack[stackIndex - 1]) {
                municipioStack[stackIndex] = municipioStack[stackIndex - 1];
                codigoMunicipioStack[stackIndex] = codigoMunicipioStack[stackIndex - 1];
            } else {
                if (stackIndex === 0 && defaultMunicipio) {
                    municipioStack[0] = defaultMunicipio;
                    codigoMunicipioStack[0] = defaultCodigoMunicipio;
                } else {
                    municipioStack[stackIndex] = "";
                    codigoMunicipioStack[stackIndex] = "";
                }
            }

            const hierarchyPath = hierarchyStack.join('/').replace(/\s*\/\s*/g, '/');
            const unitName = [...hierarchyStack].reverse().join('/').replace(/\s*\/\s*/g, '/');
            
            parsedData.push({
                nivel: level,
                hierarquia: hierarchyPath,
                codigoSecao: code,
                secao: unitName,
                codigoMunicipio: codigoMunicipioStack[stackIndex] || "",
                municipio: municipioStack[stackIndex] || ""
            });
        });

        return parsedData;
    } else {
        const result = await sendMessageToOffscreen('parse-unidades-html', { html: htmlText });
        if (result.error) {
            throw new Error(result.error);
        }
        return result.data;
    }
}

/**
 * Função utilitária centralizada para buscar e analisar unidades.
 * @param {string} codigoRegiao - Código da UEOp.
 * @param {boolean} exibirCodigo - Se deve incluir o código.
 * @param {boolean} apenasPrincipal - Se deve filtrar apenas a principal.
 * @returns {Promise<Array>} Lista de unidades.
 */
export async function obterUnidades(codigoRegiao, exibirCodigo = true, apenasPrincipal = false) {
    try {
        const html = await fetchUnidadesHTML(codigoRegiao, exibirCodigo, apenasPrincipal);
        const data = await parseUnidades(html);
        return data;
    } finally {
        await closeOffscreenDocument();
    }
}
