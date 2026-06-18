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
    console.log("[SIC3 Sync] [Log] Iniciando o processo de sincronização de convênios semanal...");
    
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
        console.log(`[SIC3 Sync] [Log] RPM identificada para o usuário: "${rpmLimpa}"`);
        
        // 2. Buscar unidades da RPM pelo motor de busca-unidades
        console.log("[SIC3 Sync] [Log] Chamando obterUnidades para a RPM: " + rpmLimpa);
        window.mostrarCarregamentoGlobal("Buscando lista de unidades da RPM...");
        const unidades = await obterUnidades(rpmLimpa);
        console.log(`[SIC3 Sync] [Log] ${unidades.length} unidades carregadas com sucesso para a RPM ${rpmLimpa}`);
        
        // 3. PASSO 1: Buscar convênios ativos no Portal PM para extrair os IDs dos concedentes
        console.log("[SIC3 Sync] [Log] [Passo 1] Buscando id dos concedentes a partir de meus-convenios...");
        window.mostrarCarregamentoGlobal("Buscando convênios ativos no Portal PM...");
        const conveniosUsuario = await obterConveniosAtivosJSON();
        console.log(`[SIC3 Sync] [Log] [Passo 1] Retornados ${conveniosUsuario.length} convênios associados ao usuário.`);
        
        if (conveniosUsuario.length === 0) {
            console.log("[SIC3 Sync] [Log] Nenhum convênio ativo encontrado para o usuário corrente.");
            window.mostrarCarregamentoGlobal("Nenhum convênio ativo encontrado.");
            await new Promise(r => setTimeout(r, 1000));
            return;
        }
        
        // Extrai IDs únicos dos concedentes associados aos convênios do usuário
        const concedenteIds = [...new Set(conveniosUsuario.map(conv => conv.CONCEDENTE_ID || conv.concedente_id).filter(Boolean))];
        console.log(`[SIC3 Sync] [Log] [Passo 1] Identificados ${concedenteIds.length} IDs de concedentes únicos:`, concedenteIds);
        
        // 4. PASSO 2: Acessar a página de cada concedente e coletar convênios listados
        const convsColetadosHTML = [];
        let indexConc = 0;
        
        for (const concedenteId of concedenteIds) {
            indexConc++;
            console.log(`[SIC3 Sync] [Log] [Passo 2] (${indexConc}/${concedenteIds.length}) Acessando página do concedente ID ${concedenteId}...`);
            window.mostrarCarregamentoGlobal(`Acessando concedente (${indexConc}/${concedenteIds.length})...`);
            
            try {
                const concedenteUrl = `https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/concedente/view?id=${concedenteId}`;
                const resConc = await fetch(concedenteUrl, { credentials: 'include' });
                
                if (!resConc.ok) {
                    console.warn(`[SIC3 Sync] [Log] Falha ao acessar URL do concedente ${concedenteId}. Status HTTP: ${resConc.status}`);
                    continue;
                }
                
                const htmlText = await resConc.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlText, 'text/html');
                
                // Extração dos metadados do Concedente (Razão Social, CNPJ, Nome Fantasia)
                const nReal = doc.querySelector('.barra.item h2')?.innerText.trim() || "";
                let razaoSocial = nReal.replace(/^CONCEDENTE\s*:\s*/i, '');
                let cnpj = "";
                
                if (razaoSocial.includes('CNPJ')) {
                    const parts = razaoSocial.split(/-\s*CNPJ\s*:\s*|CNPJ\s*:\s*/i);
                    razaoSocial = parts[0].trim();
                    if (parts[1]) {
                        cnpj = parts[1].trim();
                    }
                }
                razaoSocial = razaoSocial.replace(/\s*-\s*$/, '').trim();
                
                let nomeFantasia = "";
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
                        } else if (label === 'NOME FANTASIA') {
                            nomeFantasia = valorText;
                        }
                    });
                }
                
                // Fallback para CNPJ se não encontrado nas colunas
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
                
                // Fallback para Nome Fantasia se não encontrado nas colunas
                if (!nomeFantasia) {
                    const labels = Array.from(doc.querySelectorAll('.tc.menor, td, th, label, div, span'));
                    const fantEl = labels.find(el => {
                        const text = el.textContent.trim().toUpperCase();
                        return text === 'NOME FANTASIA' || text === 'FANTASIA';
                    });
                    if (fantEl) {
                        const flexColuna = fantEl.closest('.flex-coluna');
                        if (flexColuna) {
                            nomeFantasia = flexColuna.textContent.replace(fantEl.textContent, '').trim();
                        } else if (fantEl.nextElementSibling) {
                            nomeFantasia = fantEl.nextElementSibling.textContent.trim();
                        }
                    }
                }
                
                console.log(`[SIC3 Sync] [Log] Concedente ID ${concedenteId}: CNPJ="${cnpj}", Razão Social="${razaoSocial}", Nome Fantasia="${nomeFantasia}"`);
                
                // Varre os convênios firmados expostos na página HTML do concedente
                const targetH = Array.from(doc.querySelectorAll('h2')).find(h => h.textContent.includes('Convênios firmados'));
                if (targetH?.parentElement) {
                    const items = targetH.parentElement.querySelectorAll('a.item.flex-linha');
                    console.log(`[SIC3 Sync] [Log] Encontrados ${items.length} convênios firmados listados no HTML do concedente ${concedenteId}`);
                    
                    for (const item of items) {
                        const lIdM = item.href.match(/id=(\d+)/);
                        if (!lIdM) continue;
                        
                        const idConvenio = lIdM[1];
                        let uni = '-';
                        let statusTexto = item.querySelector('.flex-coluna.tam-g .ne')?.innerText.trim() || '';
                        
                        item.querySelectorAll('.flex-coluna').forEach(col => {
                            const lblEl = col.querySelector('.tc.menor');
                            const lbl = lblEl?.innerText.trim() || '';
                            const v = col.innerText.replace(lbl, '').trim();
                            if (lbl.includes('Unidade')) {
                                uni = v;
                            }
                        });
                        
                        convsColetadosHTML.push({
                            ID: idConvenio,
                            CONCEDENTE_ID: String(concedenteId),
                            status_texto: statusTexto,
                            UNI_NOME_PRINCIPAL: uni,
                            CNPJ: cnpj,
                            CONCEDENTE: razaoSocial,
                            NOME_FANTASIA: nomeFantasia
                        });
                    }
                }
            } catch (errConc) {
                console.error(`[SIC3 Sync] [Log] Erro ao extrair dados do concedente ${concedenteId}:`, errConc);
            }
            
            // Pequeno intervalo para respeitar o servidor
            await new Promise(r => setTimeout(r, 80));
        }
        
        console.log(`[SIC3 Sync] [Log] Total de convênios coletados via páginas HTML dos concedentes: ${convsColetadosHTML.length}`);
        
        // 5. PASSO 3 & 4: Buscar detalhes adicionais via JSON para cada convênio e aplicar motor de busca-unidades
        const resultadoFinal = [];
        let indexConv = 0;
        const totalConvs = convsColetadosHTML.length;
        
        for (const conv of convsColetadosHTML) {
            indexConv++;
            console.log(`[SIC3 Sync] [Log] [Passo 3 & 4] (${indexConv}/${totalConvs}) Processando convênio ID ${conv.ID}...`);
            window.mostrarCarregamentoGlobal(`Processando detalhes (${indexConv}/${totalConvs})...`);
            
            try {
                // 5.1 Buscar detalhes específicos do convênio via JSON
                const detalhesUrl = `https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/convenio/get-convenio-detalhes?id=${conv.ID}`;
                const resDet = await fetch(detalhesUrl, { credentials: 'include' });
                let detalhes = {};
                if (resDet.ok) {
                    const jsonDet = await resDet.json();
                    detalhes = jsonDet.convenio || jsonDet.data || jsonDet || {};
                    console.log(`[SIC3 Sync] [Log] Detalhes do convênio ${conv.ID} carregados com sucesso.`);
                } else {
                    console.warn(`[SIC3 Sync] [Log] Não foi possível ler detalhes JSON do convênio ${conv.ID}. Status HTTP: ${resDet.status}`);
                }
                
                // Extração dos campos do JSON ou do HTML de fallback
                const prepostoId = detalhes.PREPOSTO_ID || detalhes.preposto_id || "";
                const prepostoPostoGrad = detalhes.PREPOSTO_POSTOGRAD || detalhes.preposto_postograd || "";
                const prepostoNome = detalhes.PREPOSTO_NOME || detalhes.preposto_nome || "";
                const dtInicialOriginal = detalhes.DTINICIAL_ORIGINAL || detalhes.dtinicial_original || detalhes.DTINICIAL || "";
                const dtFinal = detalhes.DTFINAL || detalhes.dtfinal || "";
                const numeroFace = detalhes.NUMERO_FACE || detalhes.numero_face || "";
                const uniNomePrincipal = detalhes.UNI_NOME_PRINCIPAL || detalhes.uni_nome_principal || conv.UNI_NOME_PRINCIPAL || "";
                const aditivo = detalhes.ADITIVO || detalhes.aditivo || "N";
                const ativo = detalhes.ATIVO || detalhes.ativo || "S";
                const statusTexto = detalhes.SITUACAO_CONV || detalhes.situacao_conv || conv.status_texto || "";
                const unidadeResponsavel = detalhes.UNIDADE_RESPONSAVEL || detalhes.unidade_responsavel || "";
                
                // 5.2 PASSO 4: Tratar campos para extrair o município e cruzar com o motor de busca-unidades
                let municipioLimpo = "";
                let unidadeEncontrada = null;
                
                // Candidatos para extração do município: Concedente (Razão Social) e Nome Fantasia
                const candidatos = [conv.CONCEDENTE, conv.NOME_FANTASIA].filter(Boolean);
                for (const cand of candidatos) {
                    const limpo = getMunicipioClean(cand);
                    const normalizado = normalizarSemAcento(limpo);
                    
                    if (normalizado && unidades && unidades.length > 0) {
                        unidadeEncontrada = unidades.find(u => normalizarSemAcento(u.municipio) === normalizado);
                        if (unidadeEncontrada) {
                            municipioLimpo = unidadeEncontrada.municipio;
                            console.log(`[SIC3 Sync] [Log] Município "${normalizado}" localizado com sucesso na busca-unidades. Unidade correspondente: "${unidadeEncontrada.secao}"`);
                            break;
                        }
                    }
                    if (limpo && !municipioLimpo) {
                        municipioLimpo = limpo;
                    }
                }
                
                const nomeMunicipioComAcento = unidadeEncontrada ? unidadeEncontrada.municipio : (municipioLimpo || "-");
                const nomeSecao = unidadeEncontrada ? unidadeEncontrada.secao : "";
                
                if (!unidadeEncontrada) {
                    console.log(`[SIC3 Sync] [Log] Atenção: Não foi localizada unidade específica na busca de unidades para o município candidato: "${municipioLimpo}"`);
                }
                
                // 5.3 PASSO 5: Unificar as informações coletadas por meio do ID do convênio, Concedente ID e Nome do Município
                const registroUnificado = {
                    MUNICIPIO: String(nomeMunicipioComAcento),
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
                    CONCEDENTE: String(conv.CONCEDENTE),
                    CONCEDENTE_ID: String(conv.CONCEDENTE_ID),
                    CNPJ: String(conv.CNPJ),
                    UNIDADE_RESPONSAVEL: String(unidadeResponsavel)
                };
                
                resultadoFinal.push(registroUnificado);
                console.log(`[SIC3 Sync] [Log] Convênio ${conv.ID} unificado e pronto para envio.`, registroUnificado);
                
            } catch (errConv) {
                console.error(`[SIC3 Sync] [Log] Falha ao processar e unificar convênio ${conv.ID}:`, errConv);
            }
            
            await new Promise(r => setTimeout(r, 50));
        }
        
        // 6. PASSO 6: Enviar as informações unificadas para o bdconvenios
        console.log(`[SIC3 Sync] [Log] [Passo 6] Enviando ${resultadoFinal.length} registros consolidados para sincronizarConveniosLote...`);
        window.mostrarCarregamentoGlobal("Gravando convênios no banco de dados...");
        const resSync = await executarApi("sincronizarConveniosLote", ["bypass", resultadoFinal]);
        
        if (!resSync || !resSync.success) {
            throw new Error(resSync?.error || "Falha na gravação remota.");
        }
        
        console.log(`[SIC3 Sync] [Log] Gravação realizada com sucesso! Retorno do GAS: ${resSync.message}`);
        window.mostrarCarregamentoGlobal("Sincronização concluída com sucesso!");
        await new Promise(r => setTimeout(r, 1000));
        
    } catch (errSync) {
        console.error("[SIC3 Sync] [Log] Erro fatal durante a sincronização de convênios:", errSync);
        throw errSync;
    } finally {
        window.ocultarCarregamentoGlobal();
    }
}
