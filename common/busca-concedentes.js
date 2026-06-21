// Arquivo: common/busca-concedentes.js
// Funções centralizadas e reutilizáveis para listagem e busca de concedentes do SIRCONV de forma independente.

import { fetchWithKeepAlive } from './keep-alive.js';
import { sendMessageToOffscreen, closeOffscreenDocument } from '../modules/intranet/intranet-offscreen.js';
import { getCookie, decodeJwt } from './utils.js';
import { obterUnidades } from './busca-unidades.js';
import { getMunicipioClean } from './busca-convenios.js';

/**
 * Normaliza uma string de município/concedente para comparação insensível a acentuação, cedilha e caixa alta.
 * @param {string} str - A string a ser normalizada.
 * @returns {string} A string normalizada.
 */
function normalizarComp(str) {
    if (!str) return "";
    return str.trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/Ç/g, "C")
        .toUpperCase();
}

/**
 * Obtém a lista de concedentes a partir da listagem geral do SIRCONV.
 * Faz a consulta geral de todos os concedentes do estado e realiza a filtragem local na memória.
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
        // SEMPRE faz a consulta geral de todos os concedentes do estado (sem parâmetros de busca)
        const urlPainel = 'https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/concedente';
            
        const res = await fetchWithKeepAlive(urlPainel);
        if (!res.ok) {
            throw new Error(`Erro ao obter concedentes do SIRCONV: ${res.status}`);
        }
        const html = await res.text();
        
        if (typeof DOMParser !== 'undefined') {
            doc = new DOMParser().parseFromString(html, 'text/html');
        } else {
            // Background: delega o parsing de links para o offscreen
            const parseRes = await sendMessageToOffscreen('parse-concedentes-links', { html });
            if (parseRes.error) {
                throw new Error(`Erro no offscreen ao parsear concedentes: ${parseRes.error}`);
            }
            
            // Background fallback: filtra por getMunicipioClean no background
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
    
    // Processamento com DOM (seja no front-end ou offscreen local no frontend)
    const items = doc.querySelectorAll('.item.flex-linha');
    const cMap = new Map();
    
    if (items.length > 0) {
        // Extrai todos os concedentes da tabela HTML estruturada
        const concedentesTabela = [];
        items.forEach(item => {
            const link = item.querySelector('a[href*="concedente/view?id="]');
            if (!link) return;
            const m = link.href.match(/id=(\d+)/);
            if (!m) return;
            
            const id = m[1];
            const razaoSocial = link.innerText.trim();
            
            let nomeFantasia = "";
            let municipio = "";
            
            const colunas = item.querySelectorAll('.flex-coluna');
            colunas.forEach(col => {
                const labelEl = col.querySelector('.tc.menor');
                const label = labelEl ? labelEl.innerText.trim() : "";
                const valorText = col.innerText.replace(label, '').trim();
                
                if (label.includes('Nome Fantasia')) {
                    nomeFantasia = valorText;
                } else if (label.includes('Município')) {
                    municipio = valorText.split('/')[0].trim();
                }
            });
            
            concedentesTabela.push({
                id: String(id),
                razaoSocial: razaoSocial,
                nomeFantasia: nomeFantasia || razaoSocial,
                municipio: municipio
            });
        });
        
        if (municipioFiltro === 'todos') {
            concedentesTabela.forEach(c => cMap.set(c.id, c.razaoSocial));
        } else {
            // Gera o padrão de expressão regular para o município buscado removendo conectivos e aplicando curinga
            const conectivos = ["DE", "DA", "DO", "DOS", "DAS", "E"];
            const palavrasFiltradas = normalizarComp(municipioFiltro)
                .split(/\s+/)
                .filter(p => !conectivos.includes(p) && p !== "");
                
            const pattern = palavrasFiltradas.join(".*");
            
            // Regex para busca primária (cobre início e fim da coluna município)
            const regexPrimaria = new RegExp("^" + pattern + "$", "i");
            
            // Regex para busca secundária (substring flexível para nome fantasia e razão social)
            const regexSecundaria = new RegExp(pattern, "i");
            
            // 1. Busca primária: coluna municipio
            let matches = concedentesTabela.filter(c => {
                const muniNorm = normalizarComp(c.municipio);
                return regexPrimaria.test(muniNorm);
            });
            
            // 2. Busca secundária (caso não encontre por município): nome fantasia e razão social
            if (matches.length === 0) {
                matches = concedentesTabela.filter(c => {
                    const fantasiaNorm = normalizarComp(c.nomeFantasia);
                    const razaoNorm = normalizarComp(c.razaoSocial);
                    return regexSecundaria.test(fantasiaNorm) || regexSecundaria.test(razaoNorm);
                });
            }
            
            matches.forEach(c => cMap.set(c.id, c.razaoSocial));
        }
    } else {
        // Fallback simples caso a estrutura da tabela div.item.flex-linha não esteja presente
        const links = doc.querySelectorAll('a[href*="concedente/view?id="]');
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
    }
    
    return Array.from(cMap).map(([id, nome]) => ({ id, nome }));
}

/**
 * Busca concedentes filtrados por nome fantasia ou traz a lista completa de concedentes (busca-concedente).
 * @param {string} nomeFantasia - Nome fantasia ou município do concedente.
 * @returns {Promise<Array>} Lista de concedentes cadastrados no formato { id, nome }.
 */
export async function buscarConcedentes(nomeFantasia = '') {
    return obterListaConcedentes(nomeFantasia || 'todos');
}

/**
 * Teste: Identifica a RPM do usuário logado pelo token tokiuz,
 * busca as unidades principais dessa RPM e depois busca cada uma das unidades
 * na busca de concedentes, extraindo e retornando todos os concedentes encontrados.
 * Realiza uma única busca geral de todos os concedentes e filtra localmente em memória.
 * @returns {Promise<Array>} Lista de concedentes únicos.
 */
export async function rodarTesteConcedentesRPM() {
    console.log("%c[Teste RPM] Iniciando rotina de teste de concedentes da RPM...", "color: #b3a368; font-weight: bold;");
    
    // Tentamos usar o loader visual se a UI global estiver disponível no window
    const ui = window.uiModuleInstance || (window.sirconvDashboard && window.sirconvDashboard.ui);
    if (ui) ui.showLoader('Identificando sua RPM e unidades...');
    
    try {
        // 1. Identificar a RPM do usuário logado pelo token tokiuz
        const token = getCookie('tokiuz');
        if (!token) {
            throw new Error("Token 'tokiuz' não encontrado. Faça login na Intranet novamente.");
        }
        
        const decoded = decodeJwt(token);
        if (!decoded) {
            throw new Error("Não foi possível decodificar o token tokiuz.");
        }
        
        const userRegionCode = String(decoded.e || ''); // Código cUEOp (RPM)
        if (!userRegionCode) {
            throw new Error("Código de região (RPM) do usuário não encontrado no token tokiuz.");
        }
        
        console.log(`[Teste RPM] RPM identificada pelo token: ${userRegionCode}`);
        if (ui) ui.updateLoaderMessage(`RPM identificada: ${userRegionCode}. Buscando unidades...`);
        
        // 2. Fazer a busca de todas as unidades da RPM (apenasPrincipal = false)
        const unidades = await obterUnidades(userRegionCode, true, false);
        if (unidades.length === 0) {
            throw new Error(`Nenhuma unidade encontrada para a RPM ${userRegionCode}`);
        }
        
        console.log(`[Teste RPM] ${unidades.length} unidades encontradas:`, unidades.map(u => u.secao));
        
        // Extrai os termos de busca de municípios (com e sem acento/cedilha)
        const termosBusca = new Set();
        unidades.forEach(u => {
            if (u.municipio) {
                const muniOriginal = u.municipio.trim().toUpperCase();
                if (muniOriginal) {
                    termosBusca.add(muniOriginal);
                    
                    // Gera o nome normalizado sem acentos e sem Ç
                    const semAcentos = muniOriginal
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "")
                        .replace(/Ç/g, "C");
                    termosBusca.add(semAcentos);
                }
            }
        });
        
        const termosLista = Array.from(termosBusca);
        console.log(`[Teste RPM] ${termosLista.length} termos de busca de municípios identificados (com e sem acento/ç):`, termosLista);
        
        if (ui) ui.updateLoaderMessage("Buscando lista geral de concedentes do estado...");
        console.log("[Teste RPM] Fazendo requisição única da listagem geral de concedentes do estado...");
        
        // 3. Fazer uma única requisição geral
        const urlGeral = 'https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/concedente';
        const resGeral = await fetchWithKeepAlive(urlGeral);
        if (!resGeral.ok) {
            throw new Error(`Erro ao obter a lista geral de concedentes: ${resGeral.status}`);
        }
        
        const htmlGeral = await resGeral.text();
        const docGeral = new DOMParser().parseFromString(htmlGeral, 'text/html');
        
        console.log("[Teste RPM] Lista geral obtida. Buscando concedentes para cada município localmente...");
        
        // 4. Buscar concedentes para cada município de forma local na memória (sem requisições adicionais)
        const concedentesMap = new Map();
        const totalTermos = termosLista.length;
        
        for (let i = 0; i < totalTermos; i++) {
            const termo = termosLista[i];
            if (ui) ui.updateLoaderMessage(`Processando concedentes de ${termo} (${i + 1}/${totalTermos})...`);
            
            // Encontra a unidade correspondente a este termo de busca para vincular seus dados
            const conectivos = ["DE", "DA", "DO", "DOS", "DAS", "E"];
            const palavrasTermo = normalizarComp(termo)
                .split(/\s+/)
                .filter(p => !conectivos.includes(p) && p !== "");
            const patternTermo = palavrasTermo.join(".*");
            const regexTermo = new RegExp("^" + patternTermo + "$", "i");
            
            // Filtra as unidades que batem com o município (ordena por menor nível para priorizar a principal)
            const unidadesCorrespondentes = unidades.filter(u => {
                const muniNorm = normalizarComp(u.municipio);
                return regexTermo.test(muniNorm);
            });
            unidadesCorrespondentes.sort((a, b) => a.nivel - b.nivel);
            const unidadeOrigem = unidadesCorrespondentes[0] || null;
            
            try {
                // Passamos o docGeral já parseado para filtrar na memória localmente
                const list = await obterListaConcedentes(termo, docGeral);
                console.log(`[Teste RPM] Termo ${termo} retornou ${list.length} concedentes.`);
                list.forEach(c => {
                    const concedenteId = String(c.id);
                    
                    // Cria o objeto do concedente mesclado com todas as informações da unidade correspondente
                    const dadosVinculados = {
                        id: concedenteId,
                        nome: c.nome,
                        // Informações detalhadas da Unidade de origem da busca:
                        unidadeNivel: unidadeOrigem ? unidadeOrigem.nivel : null,
                        unidadeHierarquia: unidadeOrigem ? unidadeOrigem.hierarquia : null,
                        unidadeCodigoSecao: unidadeOrigem ? unidadeOrigem.codigoSecao : null,
                        unidadeSecao: unidadeOrigem ? unidadeOrigem.secao : null,
                        unidadeCodigoMunicipio: unidadeOrigem ? unidadeOrigem.codigoMunicipio : null,
                        unidadeMunicipio: unidadeOrigem ? unidadeOrigem.municipio : null
                    };
                    
                    concedentesMap.set(concedenteId, dadosVinculados);
                });
            } catch (err) {
                console.error(`[Teste RPM] Erro ao processar concedentes para o termo ${termo}:`, err);
            }
        }
        
        const totalConcedentes = Array.from(concedentesMap.values());
        
        console.log("%c[Teste RPM] Busca finalizada!", "color: green; font-weight: bold;");
        console.log(`[Teste RPM] Total de concedentes únicos encontrados: ${totalConcedentes.length}`);
        console.table(totalConcedentes);
        
        if (ui) {
            ui.hideLoader();
            if (typeof ui.showToast === 'function') {
                ui.showToast(`Teste finalizado! ${totalConcedentes.length} concedentes encontrados na RPM. Veja o console.`, 'success');
            }
        }
        
        return totalConcedentes;
        
    } catch (error) {
        console.error("[Teste RPM] Erro na rotina de teste:", error);
        if (ui) {
            ui.hideLoader();
            if (typeof ui.showToast === 'function') {
                ui.showToast(`Erro no teste: ${error.message}`, 'error');
            }
        }
        throw error;
    }
}

/**
 * Obtém a lista única e ordenada de municípios da RPM do usuário logado.
 * Identifica a RPM a partir do token tokiuz e busca as unidades principais.
 * @returns {Promise<Array>} Lista de nomes de municípios.
 */
export async function obterMunicipiosDaRPM() {
    const token = getCookie('tokiuz');
    if (!token) {
        throw new Error("Token 'tokiuz' não encontrado. Faça login na Intranet novamente.");
    }
    
    const decoded = decodeJwt(token);
    if (!decoded) {
        throw new Error("Não foi possível decodificar o token tokiuz.");
    }
    
    const userRegionCode = String(decoded.e || '');
    if (!userRegionCode) {
        throw new Error("Código de região (RPM) do usuário não encontrado no token tokiuz.");
    }
    
    const unidades = await obterUnidades(userRegionCode, true, false);
    const municipiosSet = new Set();
    
    unidades.forEach(u => {
        if (u.municipio) {
            const muni = u.municipio.trim().toUpperCase();
            if (muni) {
                municipiosSet.add(muni);
            }
        }
    });
    
    return Array.from(municipiosSet).sort();
}

// Expõe globalmente se rodando no ambiente de navegador com window
if (typeof window !== 'undefined') {
    window.rodarTesteConcedentesRPM = rodarTesteConcedentesRPM;
    window.obterMunicipiosDaRPM = obterMunicipiosDaRPM;
}
