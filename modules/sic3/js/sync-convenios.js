// Arquivo: modules/sic3/js/sync-convenios.js
// Funcionalidade: Extração e sincronização em lote de convênios e concedentes para o SIC3

import { obterConveniosAtivosJSON, getMunicipioClean } from '../../../common/busca-convenios.js';
import { obterUnidades } from '../../../common/busca-unidades.js';
import { executarApi } from '../api.js';

function normalizarSemAcento(str) {
    if (!str) return "";
    return str.normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/Ç/g, "C")
              .toUpperCase()
              .replace(/\b(DE|DO|DA|DOS|DAS)\b/g, "")
              .replace(/\s+/g, " ")
              .trim();
}

function normalizarParaCompararRPM(str) {
    if (!str) return "";
    return str.normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/ª/g, "")
              .replace(/º/g, "")
              .toUpperCase()
              .replace(/\s+/g, "")
              .trim();
}

function limparCampoHtml(str) {
    if (!str) return "";
    let s = String(str).trim();
    if (s.toLowerCase().includes("nao definido") || s.toLowerCase().includes("não definido") || s.toLowerCase().includes("not-set") || s.toLowerCase().includes("undefined") || s.toLowerCase().includes("null")) {
        return "";
    }
    return s.replace(/<\/?[^>]+(>|$)/g, "").trim();
}

function extrairMunicipioLimpo(nomeBruto) {
    if (!nomeBruto) return "";
    let nome = getMunicipioClean(nomeBruto);
    // Remove sufixos comuns entre parênteses, hífen MG ou tags específicas
    nome = nome.replace(/\s*\([^)]+\)/g, '')
               .replace(/\s*-\s*MG\s*$/i, '')
               .replace(/\s*\(PARTICULAR\)/i, '')
               .trim();
    // Limpa prefixos de preposições que restarem no início
    nome = nome.replace(/^(DE|DO|DA)\s+/i, '').trim();
    return nome;
}

/**
 * Executa a extração dos convênios do Portal PM e a gravação/atualização no banco do GAS.
 */
export async function executarSincronizacaoConvenios() {
    window.mostrarCarregamentoGlobal("Iniciando sincronização de convênios...");
    console.log("[SIC3 Sync] [Log] Iniciando o processo de sincronização de convênios semanal...");
    
    try {
        // 1. Obter a RPM e matrícula do usuário extraídas diretamente do Tokiuz (browser storage)
        let codigoRpmTokiuz = "";
        let nomeRegiaoTokiuz = "";
        let userPMTokiuz = "";
        const storageResult = await browser.storage.local.get('sic3_user_info');
        const info = storageResult.sic3_user_info;
        if (info) {
            if (info.codigoRegiao) codigoRpmTokiuz = String(info.codigoRegiao).trim();
            if (info.nomeRegiao) nomeRegiaoTokiuz = String(info.nomeRegiao).trim();
            
            // Administradores não devem ter seus números PM inseridos no bdconvenio
            const eAdmin = (info.isAdmin === true || window.isAdmin === true);
            if (info.numeroPM && !eAdmin) {
                userPMTokiuz = String(info.numeroPM).trim();
            }
            console.log(`[SIC3 Sync] [Log] Dados do Tokiuz do usuário extraídos (storage): RPM="${codigoRpmTokiuz}", Região="${nomeRegiaoTokiuz}", PM="${userPMTokiuz}"`);
        }
        
        if (!codigoRpmTokiuz) {
            let rpm = sessionStorage.getItem("sic3_rpm") || window.rpm || "";
            codigoRpmTokiuz = String(rpm).match(/\d+/)?.[0] || rpm;
            console.log(`[SIC3 Sync] [Log] Fallback: Código da RPM extraído de context/session: "${codigoRpmTokiuz}"`);
        }
        
        if (!codigoRpmTokiuz) {
            throw new Error("Não foi possível extrair o código de RPM do Tokiuz do usuário.");
        }

        const rpmDoUsuario = nomeRegiaoTokiuz 
            ? String(nomeRegiaoTokiuz).replace('ª', '').trim() 
            : (codigoRpmTokiuz ? codigoRpmTokiuz + " RPM" : "");
        const rpmUsuarioNorm = normalizarParaCompararRPM(rpmDoUsuario);
        console.log(`[SIC3 Sync] [Log] RPM para comparação: "${rpmDoUsuario}" | Normalizada: "${rpmUsuarioNorm}"`);
        
        // 2. Buscar unidades da RPM pelo motor de busca-unidades
        console.log("[SIC3 Sync] [Log] Chamando obterUnidades para a RPM extraída do Tokiuz: " + codigoRpmTokiuz);
        window.mostrarCarregamentoGlobal("Buscando lista de unidades da RPM...");
        const unidades = await obterUnidades(codigoRpmTokiuz);
        
        console.log(`[SIC3 Sync] [Log] Foram localizadas ${unidades.length} unidades na busca de unidades da RPM ${codigoRpmTokiuz}:`);
        unidades.forEach((u, idx) => {
            console.log(`  [Unidade ${idx+1}] Município: "${u.municipio}" | Seção: "${u.secao}" | Nível: ${u.nivel} | Hierarquia: "${u.hierarquia}" | CódigoSeção: "${u.codigoSecao}"`);
        });
        
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
        
        // 4. PASSO 2: Acessar a página de cada concedente e coletar convênios listados (coletando APENAS o CNPJ na página)
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
                
                // Coleta estritamente e apenas o CNPJ na página do Concedente
                let cnpj = "";
                const nReal = doc.querySelector('.barra.item h2')?.innerText.trim() || "";
                if (nReal.includes('CNPJ')) {
                    const parts = nReal.split(/-\s*CNPJ\s*:\s*|CNPJ\s*:\s*/i);
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
                
                console.log(`[SIC3 Sync] [Log] Concedente ID ${concedenteId}: CNPJ="${cnpj}" (Razão Social e Nome Fantasia da página ignorados)`);
                
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
                        
                        // Filtrar cancelados (Requisito 4)
                        if (statusTexto && statusTexto.toLowerCase().includes('cancelado')) {
                            console.log(`[SIC3 Sync] [Log] Ignorando convênio ID ${idConvenio} pois seu status é Cancelado.`);
                            continue;
                        }

                        // Filtrar por RPM da unidade principal (Requisito 5)
                        const uniNorm = normalizarParaCompararRPM(uni);
                        if (rpmUsuarioNorm && !uniNorm.includes(rpmUsuarioNorm)) {
                            console.log(`[SIC3 Sync] [Log] Ignorando convênio ID ${idConvenio} pois a unidade "${uni}" não pertence à RPM do usuário ("${rpmDoUsuario}").`);
                            continue;
                        }

                        // Recupera a razão social original do JSON inicial de convênios para evitar capturar do HTML
                        const convOriginal = conveniosUsuario.find(c => String(c.ID || c.id) === String(idConvenio));
                        const razaoSocialOriginal = convOriginal ? (convOriginal.CONCEDENTE || convOriginal.concedente || "") : "";
                        
                        convsColetadosHTML.push({
                            ID: idConvenio,
                            CONCEDENTE_ID: String(concedenteId),
                            status_texto: statusTexto,
                            UNI_NOME_PRINCIPAL: uni,
                            CNPJ: cnpj,
                            CONCEDENTE: razaoSocialOriginal
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
                    console.log(`[SIC3 Sync] [Log] Detalhes do convênio ${conv.ID} carregados com sucesso:`, detalhes);
                } else {
                    console.warn(`[SIC3 Sync] [Log] Não foi possível ler detalhes JSON do convênio ${conv.ID}. Status HTTP: ${resDet.status}`);
                }
                
                // Extração dos campos do JSON usando o mapeamento correto retornado por get-convenio-detalhes e limpando HTML/indefinidos
                const prepostoId = limparCampoHtml(detalhes.PREPOSTO_ID || detalhes.preposto_id || "");
                const prepostoPostoGrad = limparCampoHtml(detalhes.PES_POSTOGRAD || detalhes.pes_postograd || detalhes.PREPOSTO_POSTOGRAD || detalhes.preposto_postograd || "");
                const prepostoNome = limparCampoHtml(detalhes.PES_NOME || detalhes.pes_nome || detalhes.PREPOSTO_NOME || detalhes.preposto_nome || "");
                const dtInicialOriginal = limparCampoHtml(detalhes.DT_VIGENCIA_INICIAL || detalhes.dt_vigencia_inicial || detalhes.DTINICIAL_ORIGINAL || detalhes.dtinicial_original || detalhes.DTINICIAL || "");
                const dtFinal = limparCampoHtml(detalhes.DT_VIGENCIA_FINAL || detalhes.dt_vigencia_final || detalhes.DTFINAL || detalhes.dtfinal || "");
                const numeroFace = limparCampoHtml(detalhes.NUMERO_FACE || detalhes.numero_face || conv.NUMERO_FACE || "");
                const uniNomePrincipal = limparCampoHtml(detalhes.UNI_NOME_PRINCIPAL || detalhes.uni_nome_principal || conv.UNI_NOME_PRINCIPAL || "");
                
                // Filtrar por RPM da unidade principal (Requisito 5)
                const uniNomePrincipalNorm = normalizarParaCompararRPM(uniNomePrincipal);
                if (rpmUsuarioNorm && !uniNomePrincipalNorm.includes(rpmUsuarioNorm)) {
                    console.log(`[SIC3 Sync] [Log] Ignorando convênio ID ${conv.ID} nos detalhes pois a unidade principal "${uniNomePrincipal}" não pertence à RPM do usuário.`);
                    continue;
                }

                // Mapeia aditivo de forma segura contra nulos e strings indesejadas
                let aditivo = "N";
                if (detalhes.ADITIVO !== undefined && detalhes.ADITIVO !== null) {
                    aditivo = limparCampoHtml(detalhes.ADITIVO) || "N";
                } else if (detalhes.aditivo !== undefined && detalhes.aditivo !== null) {
                    aditivo = limparCampoHtml(detalhes.aditivo) || "N";
                }
                
                const ativo = limparCampoHtml(detalhes.ATIVO || detalhes.ativo || "S");
                const statusTexto = limparCampoHtml(detalhes.SITUACAO_CONV || detalhes.situacao_conv || conv.status_texto || "");
                const unidadeResponsavel = limparCampoHtml(detalhes.UNIDADE_RESPONSAVEL || detalhes.unidade_responsavel || "");
                
                // Garante que o concedente (Razão Social) esteja sempre preenchido, usando Nome Fantasia como fallback
                const concedenteFinal = conv.CONCEDENTE || detalhes.CONCEDENTE || detalhes.concedente || detalhes.NOME_FANTASIA || detalhes.nome_fantasia || "";
                const concedenteLimpo = limparCampoHtml(concedenteFinal);

                // Buscar plano de trabalho do convênio para obter os elementos de despesa (Requisito 6)
                const planoUrl = `https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/plano/get-plano?convenio=${conv.ID}`;
                const resPlano = await fetch(planoUrl, { credentials: 'include' });
                let elementosDespesa = "";
                if (resPlano.ok) {
                    const jsonPlano = await resPlano.json();
                    if (jsonPlano && jsonPlano.success && Array.isArray(jsonPlano.planos)) {
                        const itens = [...new Set(jsonPlano.planos.map(p => String(p.ITEM || p.item || '').trim()).filter(Boolean))];
                        elementosDespesa = itens.join('|');
                    }
                    console.log(`[SIC3 Sync] [Log] Elementos de despesa obtidos para o convênio ${conv.ID}: "${elementosDespesa}"`);
                } else {
                    console.warn(`[SIC3 Sync] [Log] Falha ao obter plano de trabalho para o convênio ${conv.ID}. Status HTTP: ${resPlano.status}`);
                }
                
                // 5.2 PASSO 4: Tratar campos para extrair o município e cruzar com o motor de busca-unidades
                let municipioLimpo = "";
                let unidadeEncontrada = null;
                const nomeFantasiaDetalhes = detalhes.NOME_FANTASIA || detalhes.nome_fantasia || "";
                
                console.log(`[SIC3 Sync] [Log] Tratando município para convênio ID ${conv.ID}:`);
                console.log(`  - NOME_FANTASIA original de detalhes: "${nomeFantasiaDetalhes}"`);
                
                if (nomeFantasiaDetalhes) {
                    const limpo = extrairMunicipioLimpo(nomeFantasiaDetalhes);
                    const candidatoNormalizado = normalizarSemAcento(limpo);
                    console.log(`  - Município limpo extraído: "${limpo}" | Normalizado (sem acentos e ç): "${candidatoNormalizado}"`);
                    
                    if (candidatoNormalizado && unidades && unidades.length > 0) {
                        // Cruza usando normalização sem acentos, ç, preposições e artigos em ambas as pontas
                        unidadeEncontrada = unidades.find(u => normalizarSemAcento(u.municipio) === candidatoNormalizado);
                        if (unidadeEncontrada) {
                            municipioLimpo = unidadeEncontrada.municipio; // O município com acentos correto da busca-unidades!
                            console.log(`  => Match com unidade: "${unidadeEncontrada.secao}" (Município da busca-unidades: "${unidadeEncontrada.municipio}")`);
                        } else {
                            console.log(`  - Não foi encontrada unidade correspondente na lista para o município normalizado: "${candidatoNormalizado}"`);
                        }
                    }
                    if (!municipioLimpo) {
                        municipioLimpo = limpo;
                    }
                }
                
                // Fallback caso NOME_FANTASIA em detalhes esteja vazio
                if (!municipioLimpo) {
                    console.log(`  - NOME_FANTASIA de detalhes vazio. Aplicando fallback de candidatos do concedente:`);
                    const candidatos = [concedenteLimpo, conv.NOME_FANTASIA].filter(Boolean);
                    for (const cand of candidatos) {
                        const limpo = extrairMunicipioLimpo(cand);
                        const candidatoNormalizado = normalizarSemAcento(limpo);
                        console.log(`    - Candidato original: "${cand}" | Limpo: "${limpo}" | Normalizado: "${candidatoNormalizado}"`);
                        
                        if (candidatoNormalizado && unidades && unidades.length > 0) {
                            unidadeEncontrada = unidades.find(u => normalizarSemAcento(u.municipio) === candidatoNormalizado);
                            if (unidadeEncontrada) {
                                municipioLimpo = unidadeEncontrada.municipio;
                                console.log(`    => Match fallback com unidade: "${unidadeEncontrada.secao}" (Município da busca-unidades: "${unidadeEncontrada.municipio}")`);
                                break;
                            }
                        }
                        if (limpo && !municipioLimpo) {
                            municipioLimpo = limpo;
                        }
                    }
                }
                
                // Município acentuado original da busca-unidades (nomeMunicipioComAcento) para a planilha
                const nomeMunicipioComAcento = unidadeEncontrada ? unidadeEncontrada.municipio : (municipioLimpo || "-");
                const nomeSecao = unidadeEncontrada ? unidadeEncontrada.secao : "";
                
                if (!unidadeEncontrada) {
                    console.log(`  - Atenção: Não foi localizada unidade específica na busca de unidades para o município candidato: "${municipioLimpo}"`);
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
                    CONCEDENTE: String(concedenteLimpo),
                    CONCEDENTE_ID: String(conv.CONCEDENTE_ID),
                    CNPJ: String(conv.CNPJ),
                    UNIDADE_RESPONSAVEL: String(unidadeResponsavel),
                    ELEMENTOS_DESPESA: elementosDespesa,
                    USER_PM: userPMTokiuz,
                    
                    // Anexa todas as informações disponíveis de busca-unidades
                    unidadeNivel: unidadeEncontrada ? unidadeEncontrada.nivel : "",
                    unidadeHierarquia: unidadeEncontrada ? unidadeEncontrada.hierarquia : "",
                    unidadeCodigoSecao: unidadeEncontrada ? unidadeEncontrada.codigoSecao : "",
                    unidadeSecao: unidadeEncontrada ? unidadeEncontrada.secao : "",
                    unidadeCodigoMunicipio: unidadeEncontrada ? unidadeEncontrada.codigoMunicipio : "",
                    unidadeMunicipio: unidadeEncontrada ? unidadeEncontrada.municipio : ""
                };
                
                resultadoFinal.push(registroUnificado);
                console.log(`[SIC3 Sync] [Log] Convênio ${conv.ID} unificado e pronto para envio:`, registroUnificado);
                
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
