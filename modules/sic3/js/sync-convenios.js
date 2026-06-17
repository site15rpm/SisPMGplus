// Arquivo: modules/sic3/js/sync-convenios.js
// Funcionalidade: Extração e sincronização em lote de convênios e concedentes para o SIC3

import { obterConveniosAtivosJSON, getMunicipioClean } from '../../../common/busca-convenios.js';
import { obterUnidades } from '../../../common/busca-unidades.js';
import { executarApi } from '../api.js';

function normalizarSemAcento(str) {
    if (!str) return "";
    return str.normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toUpperCase()
              .trim();
}

/**
 * Executa a extração dos convênios do Portal PM e a gravação/atualização no banco do GAS.
 */
export async function executarSincronizacaoConvenios() {
    window.mostrarCarregamentoGlobal("Iniciando sincronização de convênios...");
    
    try {
        // 1. Obter a RPM do usuário do contexto do SIC3
        let rpm = sessionStorage.getItem("sic3_rpm") || window.rpm || "";
        if (!rpm) {
            const storageResult = await browser.storage.local.get('sic3_user_info');
            const info = storageResult.sic3_user_info;
            if (info && info.codigoRegiao) {
                rpm = String(info.codigoRegiao);
            }
        }
        
        if (!rpm) {
            throw new Error("Não foi possível identificar a RPM do usuário para extração de unidades.");
        }
        
        const rpmLimpa = String(rpm).match(/\d+/)?.[0] || rpm;
        
        // 2. Buscar unidades da RPM pelo motor de busca-unidades
        window.mostrarCarregamentoGlobal("Buscando lista de unidades da RPM...");
        const unidades = await obterUnidades(rpmLimpa);
        console.log(`[SIC3 Sync] ${unidades.length} unidades carregadas para a RPM ${rpmLimpa}`);
        
        // 3. Buscar convênios ativos no Portal PM
        window.mostrarCarregamentoGlobal("Buscando convênios ativos no Portal PM...");
        const conveniosAtivos = await obterConveniosAtivosJSON();
        console.log(`[SIC3 Sync] ${conveniosAtivos.length} convênios ativos localizados.`);
        
        if (conveniosAtivos.length === 0) {
            window.mostrarCarregamentoGlobal("Nenhum convênio ativo encontrado.");
            await new Promise(r => setTimeout(r, 1000));
            return;
        }
        
        // 4. Buscar detalhes adicionais e CNPJs dos concedentes
        const resultadoFinal = [];
        const concedentesCache = new Map(); // Evita requisições redundantes de concedentes
        
        let processados = 0;
        const total = conveniosAtivos.length;
        
        for (const conv of conveniosAtivos) {
            processados++;
            window.mostrarCarregamentoGlobal(`Processando convênios (${processados}/${total}): ID ${conv.ID}...`);
            
            try {
                // 4.1 Buscar detalhes específicos do convênio
                const detalhesUrl = `https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/convenio/get-convenio-detalhes?id=${conv.ID}`;
                const resDet = await fetch(detalhesUrl, { credentials: 'include' });
                let detalhes = {};
                if (resDet.ok) {
                    const jsonDet = await resDet.json();
                    detalhes = jsonDet.convenio || jsonDet.data || jsonDet || {};
                }
                
                // 4.2 Buscar CNPJ e Razão Social do concedente
                const concedenteId = conv.CONCEDENTE_ID || detalhes.CONCEDENTE_ID || detalhes.concedente_id;
                let cnpj = "";
                let concedenteNome = conv.CONCEDENTE || detalhes.CONCEDENTE || detalhes.concedente || "";
                
                if (concedenteId) {
                    const cacheKey = String(concedenteId);
                    if (concedentesCache.has(cacheKey)) {
                        const cached = concedentesCache.get(cacheKey);
                        cnpj = cached.cnpj;
                        if (cached.nome) concedenteNome = cached.nome;
                    } else {
                        const concedenteUrl = `https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/concedente/view?id=${concedenteId}`;
                        const resConc = await fetch(concedenteUrl, { credentials: 'include' });
                        if (resConc.ok) {
                            const htmlText = await resConc.text();
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(htmlText, 'text/html');
                            
                            // Extração do CNPJ do título principal ou do corpo da página
                            const nReal = doc.querySelector('.barra.item h2')?.innerText.trim() || concedenteNome;
                            let razaoSocial = nReal.replace(/^CONCEDENTE\s*:\s*/i, '');
                            if (razaoSocial.includes('CNPJ')) {
                                const parts = razaoSocial.split(/-\s*CNPJ\s*:\s*|CNPJ\s*:\s*/i);
                                razaoSocial = parts[0].trim();
                                if (parts[1]) {
                                    cnpj = parts[1].trim();
                                }
                            }
                            
                            const infoConvenio = doc.querySelector('.barra.item.info-convenio');
                            if (infoConvenio) {
                                const colunas = infoConvenio.querySelectorAll('.flex-coluna');
                                colunas.forEach(col => {
                                    const labelEl = col.querySelector('.tc');
                                    const label = labelEl ? labelEl.textContent.trim().toUpperCase() : '';
                                    const valorText = col.textContent.replace(labelEl ? labelEl.textContent : '', '').trim();
                                    
                                    if (label === 'CNPJ') {
                                        cnpj = valorText;
                                    } else if (label === 'RAZÃO SOCIAL' || label === 'RAZAO SOCIAL') {
                                        razaoSocial = valorText;
                                    }
                                });
                            }
                            
                            if (!cnpj) {
                                const labels = Array.from(doc.querySelectorAll('.tc.menor, td, th, label, div, span'));
                                const cnpjEl = labels.find(el => {
                                    const text = el.textContent.trim().toUpperCase();
                                    return text === 'CPF/CNPJ' || text === 'CPF / CNPJ' || text === 'CNPJ';
                                });
                                if (cnpjEl) {
                                    const flexColuna = cnpjEl.closest('.flex-coluna');
                                    if (flexColuna) {
                                        cnpj = flexColuna.textContent.replace(cnpjEl.textContent, '').trim();
                                    } else {
                                        const tr = cnpjEl.closest('tr');
                                        if (tr) {
                                            const tds = tr.querySelectorAll('td');
                                            if (tds.length > 0) {
                                                cnpj = tds[tds.length - 1].textContent.trim();
                                            }
                                        }
                                        if (!cnpj && cnpjEl.nextElementSibling) {
                                            cnpj = cnpjEl.nextElementSibling.textContent.trim();
                                        }
                                    }
                                }
                            }
                            
                            concedenteNome = razaoSocial || concedenteNome;
                            concedentesCache.set(cacheKey, { cnpj, nome: concedenteNome });
                        }
                    }
                }
                
                // 4.3 Tratamento de município e vínculo com a unidade da hierarquia
                const municipioLimpo = getMunicipioClean(concedenteNome);
                const municipioNormalizado = normalizarSemAcento(municipioLimpo);
                
                let unidadeEncontrada = null;
                if (unidades && unidades.length > 0) {
                    unidadeEncontrada = unidades.find(u => normalizarSemAcento(u.municipio) === municipioNormalizado);
                }
                
                const nomeMunicipioComAcento = unidadeEncontrada ? unidadeEncontrada.municipio : municipioLimpo;
                const nomeSecao = unidadeEncontrada ? unidadeEncontrada.secao : "";
                
                // 4.4 Consolidação dos dados
                const prepostoId = detalhes.PREPOSTO_ID || detalhes.preposto_id || conv.PREPOSTO_ID || "";
                const prepostoPostoGrad = detalhes.PREPOSTO_POSTOGRAD || detalhes.preposto_postograd || conv.PES_POSTOGRAD || "";
                const prepostoNome = detalhes.PREPOSTO_NOME || detalhes.preposto_nome || conv.PREPOSTO_NOME || "";
                const dtInicialOriginal = detalhes.DTINICIAL_ORIGINAL || detalhes.dtinicial_original || conv.DTINICIAL || "";
                const dtFinal = detalhes.DTFINAL || detalhes.dtfinal || conv.DTFINAL || "";
                const numeroFace = detalhes.NUMERO_FACE || detalhes.numero_face || conv.NUMERO_FACE || "";
                const uniNomePrincipal = detalhes.UNI_NOME_PRINCIPAL || detalhes.uni_nome_principal || conv.UNI_NOME_PRINCIPAL || "";
                const aditivo = detalhes.ADITIVO || detalhes.aditivo || conv.ADITIVO || "N";
                const ativo = detalhes.ATIVO || detalhes.ativo || conv.ATIVO || "S";
                const statusTexto = detalhes.SITUACAO_CONV || detalhes.situacao_conv || conv.STATUS_TEXTO || conv.SITUACAO_CONV || "";
                const unidadeResponsavel = detalhes.UNIDADE_RESPONSAVEL || detalhes.unidade_responsavel || conv.UNIDADE_RESPONSAVEL || "";
                
                resultadoFinal.push({
                    MUNICIPIO: nomeMunicipioComAcento,
                    ID: String(conv.ID),
                    PREPOSTO_ID: String(prepostoId),
                    PREPOSTO_POSTOGRAD: String(prepostoPostoGrad),
                    PREPOSTO_NOME: String(prepostoNome),
                    NOME_SECAO: String(nomeSecao),
                    DTINICIAL_ORIGINAL: String(dtInicialOriginal),
                    DTFINAL: String(dtFinal),
                    NUMERO_FACE: String(numeroFace),
                    UNI_NOME_PRINCIPAL: String(uniNomePrincipal),
                    ADITIVO: String(aditivo),
                    ATIVO: String(ativo),
                    status_texto: String(statusTexto),
                    CONCEDENTE: String(concedenteNome),
                    CONCEDENTE_ID: String(concedenteId || ""),
                    CNPJ: String(cnpj),
                    UNIDADE_RESPONSAVEL: String(unidadeResponsavel)
                });
                
            } catch (errConv) {
                console.error(`[SIC3 Sync] Falha ao processar convênio ${conv.ID}:`, errConv);
            }
            
            // Intervalo mínimo para evitar gargalos de rede
            await new Promise(r => setTimeout(r, 50));
        }
        
        // 5. Envio dos dados para a API do Google Sheets (GAS)
        window.mostrarCarregamentoGlobal("Gravando convênios no banco de dados...");
        const resSync = await executarApi("sincronizarConveniosLote", ["bypass", resultadoFinal]);
        
        if (!resSync || !resSync.success) {
            throw new Error(resSync?.error || "Falha na gravação remota.");
        }
        
        window.mostrarCarregamentoGlobal("Sincronização concluída!");
        await new Promise(r => setTimeout(r, 1000));
        
    } catch (errSync) {
        console.error("[SIC3 Sync] Erro geral na sincronização:", errSync);
        throw errSync;
    } finally {
        window.ocultarCarregamentoGlobal();
    }
}
