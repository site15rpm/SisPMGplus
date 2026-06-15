// Arquivo: common/busca-convenios.js
// Funções centralizadas e reutilizáveis para extração e parsing de convênios do SIRCONV.

import { fetchWithKeepAlive } from './keep-alive.js';
import { sendMessageToOffscreen, closeOffscreenDocument } from '../modules/intranet/intranet-agenda-offscreen.js';

/**
 * Converte uma string de data (DD/MM/AAAA ou AAAA-MM-DD) para um objeto Date.
 * @param {string} d - A string de data.
 * @returns {Date|null}
 */
export function parseDate(d) { 
    if (!d || d === '-') return null; 
    const p = d.split(' ')[0].split(/[\/-]/); 
    return p[0].length === 4 ? new Date(p[0], p[1] - 1, p[2]) : new Date(p[2], p[1] - 1, p[0]); 
}

/**
 * Limpa o nome do concedente removendo prefixos de prefeituras e normalizando acentos.
 * @param {string} concedente - O nome bruto do concedente.
 * @returns {string} O nome limpo do município/concedente.
 */
export function getMunicipioClean(concedente) {
    if (!concedente) return "-";
    let nome = concedente;
    const prefixos = [
        /^PREFEITURA\s+MUNICIAP?AL\s+DE\s+/i, 
        /^PREFEITURA\s+MUNICIPAL\s+DE\s+/i, 
        /^PREFEITURA\s+MUNICIPAL\s+/i, 
        /^PREFEITURA\s+DE\s+/i, 
        /^MUNICIPIO\s+DE\s+/i, 
        /^P\.\s*M\.\s*DE\s+/i, 
        /^PM\s+/i
    ];
    for (const pref of prefixos) { 
        if (pref.test(nome)) { 
            nome = nome.replace(pref, ''); 
            break; 
        } 
    }
    nome = nome.replace(/Ã‡/g, 'Ç')
               .replace(/Ã\“/g, 'Ó')
               .replace(/Ã\*/g, 'Ó')
               .replace(/Ã\‰/g, 'É')
               .replace(/Ãƒ/g, 'Ã')
               .replace(/Ã\…/g, 'Ã')
               .replace(/Ã\•/g, 'Õ')
               .replace(/Ã\š/g, 'Ú')
               .replace(/Ã\*/g, 'Ú')
               .replace(/Ã\?/g, 'Í')
               .replace(/Â/g, '')
               .replace(/\s+/g, ' ')
               .trim();
    return nome;
}

/**
 * Retorna o rótulo de status com base nas propriedades do convênio.
 * @param {object} conv - O objeto do convênio.
 * @returns {string} 'Vigente', 'Inativo' ou 'Vencido'.
 */
export function getStatusLabel(conv) { 
    const isVigente = conv.ATIVO === 'S' && conv.VENCIDO === '0'; 
    return isVigente ? 'Vigente' : (conv.ATIVO === 'N' ? 'Inativo' : 'Vencido'); 
}

/**
 * Busca convênios ativos via API JSON (meus-convenios).
 * @param {object} pesquisaParams - Parâmetros de pesquisa opcionais.
 * @returns {Promise<Array>} Lista de convênios.
 */
export async function obterConveniosAtivosJSON(pesquisaParams = null) {
    const pesquisa = pesquisaParams || { preposto: "", numeroConvenio: "", numeroFace: "", status: "" };
    const url = `https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/convenio/meus-convenios?pesquisa=${encodeURIComponent(JSON.stringify(pesquisa))}`;
    
    const response = await fetchWithKeepAlive(url, {
        method: 'GET',
        headers: { 
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include'
    });

    if (!response.ok) {
        throw new Error(`Erro HTTP ao obter convênios ativos: ${response.status}`);
    }
    
    const jsonData = await response.json();
    return jsonData.convenios || [];
}

/**
 * Realiza o parsing do HTML de um concedente e extrai seus convênios firmados.
 * @param {string} concedenteId 
 * @param {string} concedenteNome 
 * @param {string} htmlText - O HTML bruto retornado da página do concedente.
 * @param {boolean} includeCPE - Se deve incluir convênios com "CPE" na unidade.
 * @returns {Array} Array de convênios extraídos.
 */
export function extrairConveniosDoConcedenteHTML(concedenteId, concedenteNome, htmlText, includeCPE = false) {
    let doc;
    if (typeof DOMParser !== 'undefined') {
        doc = new DOMParser().parseFromString(htmlText, 'text/html');
    } else {
        throw new Error("DOMParser não está disponível neste contexto.");
    }
    
    const resultados = [];
    const nReal = doc.querySelector('.barra.item h2')?.innerText.trim() || concedenteNome;
    
    // Extrai Razão Social e CNPJ de nReal de forma robusta
    let cnpj = '';
    let razaoSocial = nReal.replace(/^CONCEDENTE\s*:\s*/i, '');
    if (razaoSocial.includes('CNPJ')) {
        const parts = razaoSocial.split(/-\s*CNPJ\s*:\s*|CNPJ\s*:\s*/i);
        razaoSocial = parts[0].trim();
        if (parts[1]) {
            cnpj = parts[1].trim();
        }
    }
    razaoSocial = razaoSocial.replace(/\s*-\s*$/, '').trim();

    const targetH = Array.from(doc.querySelectorAll('h2')).find(h => h.textContent.includes('Convênios firmados'));
    
    if (targetH?.parentElement) {
        const items = targetH.parentElement.querySelectorAll('a.item.flex-linha');
        for (const item of items) {
            const lIdM = item.href.match(/id=(\d+)/);
            if (!lIdM) continue;
            
            let cod = lIdM[1], face = '', val = '0', uni = '-', vigFim = '-', st = 'S', dtIni = '-', prep = '-';
            const statusTexto = item.querySelector('.flex-coluna.tam-g .ne')?.innerText.trim() || '';
            const isInactive = statusTexto.toLowerCase().includes('cancelado') || statusTexto.toLowerCase().includes('finalizado');
            if (isInactive) st = 'N';
            
            item.querySelectorAll('.flex-coluna').forEach(col => {
                const lblEl = col.querySelector('.tc.menor');
                const lbl = lblEl?.innerText.trim() || '';
                const v = col.innerText.replace(lbl, '').trim();
                
                if (lbl.includes('Código') && !cod) {
                    cod = v;
                } else if (lbl.includes('face')) {
                    face = v;
                } else if (lbl.includes('Preposto')) {
                    prep = v;
                } else if (lbl.includes('Valor')) {
                    val = v;
                } else if (lbl.includes('Unidade')) {
                    uni = v;
                } else if (lbl.includes('Término') || lbl.includes('Vigência') || lbl.includes('Fim')) {
                    if (v.includes(' a ')) {
                        const partes = v.split(' a ');
                        dtIni = partes[0].trim();
                        vigFim = partes[1].trim();
                    } else if (v.match(/\d{2}\/\d{2}\/\d{4}/)) {
                        vigFim = v;
                    }
                } else if (lbl.includes('Início') || lbl.includes('Começo')) {
                    dtIni = v;
                }
            });
            
            if (!includeCPE && uni.toUpperCase().includes('CPE')) continue;
            
            const cleanVal = parseFloat(val.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
            const vencido = (vigFim !== '-' && parseDate(vigFim) < new Date() ? '1' : '0');
            
            resultados.push({
                ID: String(cod),
                NUMERO_FACE: face || '-',
                PREPOSTO: prep || '-',
                CONCEDENTE: razaoSocial,
                CONCEDENTE_ID: String(concedenteId),
                UNI_NOME_PRINCIPAL: uni,
                DTINICIAL: dtIni,
                DTFINAL: vigFim,
                VALOR_ESTIMADO: cleanVal,
                ATIVO: st,
                STATUS_TEXTO: statusTexto,
                VENCIDO: vencido,
                CNPJ: cnpj,
                RAZAO_SOCIAL: razaoSocial
            });
        }
    }
    
    return resultados;
}

/**
 * Busca e extrai convênios de uma lista de concedentes de forma síncrona/iterativa.
 * Funciona de forma transparente no background (via offscreen) e no front-end (DOMParser local).
 * @param {Array} concedentes - Lista de concedentes no formato { id, nome }
 * @param {boolean} includeCPE - Se deve incluir convênios CPE
 * @param {function} onProgress - Callback opcional de progresso: (atual, total, nomeConcedente)
 * @returns {Promise<Array>} Lista acumulada de convênios.
 */
export async function obterConveniosDeConcedentes(concedentes, includeCPE = false, onProgress = null) {
    const resultados = [];
    const total = concedentes.length;
    
    for (let i = 0; i < total; i++) {
        const c = concedentes[i];
        if (onProgress) {
            onProgress(i + 1, total, c.nome);
        }
        
        try {
            const url = `https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/concedente/view?id=${c.id}`;
            const resH = await fetchWithKeepAlive(url);
            
            if (!resH.ok) {
                console.error(`Erro ao obter HTML do concedente ${c.id}: ${resH.status}`);
                continue;
            }
            
            const hTxt = await resH.text();
            let conveniosDoConcedente = [];
            
            if (typeof DOMParser !== 'undefined') {
                // Front-end: parsing direto com DOMParser local
                conveniosDoConcedente = extrairConveniosDoConcedenteHTML(c.id, c.nome, hTxt, includeCPE);
            } else {
                // Background: delega o parsing estruturado para o offscreen document
                const parseRes = await sendMessageToOffscreen('parse-concedente-html', { 
                    html: hTxt, 
                    concedenteId: c.id, 
                    concedenteNome: c.nome, 
                    includeCPE 
                });
                if (parseRes.error) {
                    console.error(`Erro no offscreen ao parsear concedente ${c.id}:`, parseRes.error);
                } else {
                    conveniosDoConcedente = parseRes.data || [];
                }
            }
            
            // Associa os dados da unidade e do concedente ao convênio extraído
            conveniosDoConcedente.forEach(conv => {
                conv.CNPJ = conv.CNPJ || c.cnpj || '';
                conv.RAZAO_SOCIAL = conv.RAZAO_SOCIAL || c.razaoSocial || c.nome;
                
                // Copia as propriedades de unidade vindas da busca de concedentes da RPM
                if (c.unidadeNivel !== undefined) conv.unidadeNivel = c.unidadeNivel;
                if (c.unidadeHierarquia !== undefined) conv.unidadeHierarquia = c.unidadeHierarquia;
                if (c.unidadeCodigoSecao !== undefined) conv.unidadeCodigoSecao = c.unidadeCodigoSecao;
                if (c.unidadeSecao !== undefined) conv.unidadeSecao = c.unidadeSecao;
                if (c.unidadeCodigoMunicipio !== undefined) conv.unidadeCodigoMunicipio = c.unidadeCodigoMunicipio;
                if (c.unidadeMunicipio !== undefined) conv.unidadeMunicipio = c.unidadeMunicipio;
            });
            
            resultados.push(...conveniosDoConcedente);
            
        } catch (e) {
            console.error(`Erro na extração do concedente ${c.id}:`, e);
        }
        
        // Pausa entre requisições
        await new Promise(r => setTimeout(r, 50));
    }
    
    if (typeof DOMParser === 'undefined') {
        await closeOffscreenDocument();
    }
    
    return resultados;
}

/**
 * Obtém a lista de concedentes a partir da página principal do SIRCONV.
 * Se rodar no front-end com links na página, lê do document atual.
 * Se rodar no background (ou sem DOMContext), faz fetch no painel principal e analisa via offscreen.
 * @param {string} municipioFiltro - Filtro de município ('todos' ou o nome limpo do município)
 * @param {Document} docContext - Opcional. Documento DOM contendo a lista.
 * @returns {Promise<Array>} Lista de concedentes { id, nome }.
 */
export async function obterListaConcedentes(municipioFiltro = 'todos', docContext = null) {
    let doc = docContext;
    
    // No frontend, tenta ler do document atual se ele possuir os links de concedente
    if (!doc && typeof document !== 'undefined') {
        const links = document.querySelectorAll('a[href*="concedente/view?id="]');
        if (links.length > 0) {
            doc = document;
        }
    }
    
    // Se não tiver doc (background ou no frontend em uma página que não possui os links)
    if (!doc) {
        const urlPainel = 'https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/';
        const res = await fetchWithKeepAlive(urlPainel);
        if (!res.ok) {
            throw new Error(`Erro ao obter painel do SIRCONV: ${res.status}`);
        }
        const html = await res.text();
        
        if (typeof DOMParser !== 'undefined') {
            // Frontend: parseia localmente usando DOMParser
            doc = new DOMParser().parseFromString(html, 'text/html');
        } else {
            // Background: delega o parsing de links para o offscreen
            const parseRes = await sendMessageToOffscreen('parse-concedentes-links', { html });
            if (parseRes.error) {
                throw new Error(`Erro no offscreen ao parsear concedentes: ${parseRes.error}`);
            }
            
            const concedentesBrutos = parseRes.data || [];
            const cMap = new Map();
            concedentesBrutos.forEach(c => {
                const mc = getMunicipioClean(c.nome);
                if (municipioFiltro === 'todos' || mc === municipioFiltro) {
                    cMap.set(c.id, c.nome);
                }
            });
            return Array.from(cMap).map(([id, nome]) => ({ id, nome }));
        }
    }
    
    // Processamento com DOM (seja front-end com doc do local/fetch ou offscreen local)
    const links = doc.querySelectorAll('a[href*="concedente/view?id="]');
    const cMap = new Map();
    links.forEach(l => {
        const m = l.href.match(/id=(\d+)/);
        if (m) {
            const n = l.innerText.trim();
            const mc = getMunicipioClean(n);
            if (municipioFiltro === 'todos' || mc === municipioFiltro) {
                cMap.set(m[1], n);
            }
        }
    });
    
    return Array.from(cMap).map(([id, nome]) => ({ id, nome }));
}
