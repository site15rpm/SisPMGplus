/**
 * Abastecimento PRIME & POC - Background Script Unificado
 */

// --- Nomes para Alarmes e Storage ---
const ALARM_SCHEDULER_CHECK = 'abastecimentos-scheduler-check';
const STORAGE_CONFIG_KEY = 'app-config';
const STORAGE_LOGS_KEY = 'execution-logs';
const STORAGE_SCHEDULE_KEY = 'abastecimentos-schedule';
const MAX_LOG_ENTRIES = 50;
const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';

// --- ESTADO E CONFIGURAÇÕES ---
let extractionData = { prime: null, sgta: null, params: null };
// Variável de controle para evitar execuções simultâneas
let isExtractionRunning = false;

// --- FUNÇÕES DE LOG ---
const addLog = async (message, system = 'GERAL', type = 'info') => {
    const timestamp = new Date().toLocaleString('pt-BR');
    const logEntry = { timestamp, system, message, type };
    const { [STORAGE_LOGS_KEY]: logs = [] } = await browser.storage.local.get(STORAGE_LOGS_KEY);
    logs.unshift(logEntry);
    const trimmedLogs = logs.slice(0, MAX_LOG_ENTRIES);
    await browser.storage.local.set({ [STORAGE_LOGS_KEY]: trimmedLogs });
    browser.runtime.sendMessage({ action: 'logsUpdated', logs: trimmedLogs }).catch(() => {});
};

const clearLogs = async () => {
    await browser.storage.local.remove(STORAGE_LOGS_KEY);
    await addLog('Histórico de execuções foi limpo.', 'SISTEMA', 'info');
};

const sendFinalizationSignal = () => {
     browser.runtime.sendMessage({ action: 'extractionFinished' }).catch(() => {});
     // Libera o controle ao final do processo
     isExtractionRunning = false;
}

// --- FUNÇÕES DE DATA ---
const formatDate = {
    toDDMMYYYY: (dateStr) => { // input: YYYY-MM-DD
        const [year, month, day] = dateStr.split('-');
        return `${day}${month}${year}`;
    },
    toDD_MM_YYYY: (dateStr) => { // input: YYYY-MM-DD
        const date = new Date(dateStr + 'T12:00:00Z');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const year = date.getUTCFullYear();
        return `${day}/${month}/${year}`;
    },
    toYYYYMMDD: (dateStr) => { // input: YYYY-MM-DD
        return dateStr.replace(/-/g, '');
    }
};

function calculateDateRange(period, frequency) {
    if (frequency === 'monthly') {
        const now = new Date();
        const firstDayOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDayOfPreviousMonth = new Date(firstDayOfCurrentMonth.getTime() - 1);
        const firstDayOfPreviousMonth = new Date(lastDayOfPreviousMonth.getFullYear(), lastDayOfPreviousMonth.getMonth(), 1);
        return {
            startDate: firstDayOfPreviousMonth.toISOString().split('T')[0],
            endDate: lastDayOfPreviousMonth.toISOString().split('T')[0]
        };
    } else {
        const periodDays = parseInt(period, 10);
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - periodDays);
        return { startDate: startDate.toISOString().split('T')[0], endDate: endDate.toISOString().split('T')[0] };
    }
}

// --- FUNÇÕES AUXILIARES ---
const normalizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};
const formatNumberToPtBr = (value) => {
    if (value === null || value === undefined) return '';
    let strValue = String(value).trim();
    strValue = strValue.replace('R$ ', '');
    return strValue.replace('.', ',');
};
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) { binary += String.fromCharCode(bytes[i]); }
    return btoa(binary);
}
function arrayToCsv(data, forGoogleScript = false) {
    if (!data || data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const headerRow = headers.join(';');
    const bodyRows = data.map(row =>
        headers.map(header => `"${(row[header] ?? '').toString().replace(/"/g, '""')}"`).join(';')
    );
    const BOM = '\uFEFF';
    return (forGoogleScript ? '' : BOM) + [headerRow, ...bodyRows].join('\n');
}
function downloadAsCsv(content, fileName) {
    const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(content);
    return browser.downloads.download({ url: dataUrl, filename: fileName, saveAs: false });
}
async function downloadAsJson(data, fileName) {
    const jsonString = JSON.stringify(data, null, 2);
    const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonString);
    return browser.downloads.download({ url: dataUrl, filename: fileName, saveAs: false });
}

// --- FUNÇÕES DE PROCESSAMENTO E UNIFICAÇÃO ---
function parsePrimeData(textContent) {
    if (!textContent || typeof textContent !== 'string') return [];
    const lines = textContent.trim().split('\n');
    if (lines.length < 2) return [];

    const headerLine = lines.shift().trim().replace(/^\uFEFF/, '');
    const headers = headerLine.split(',').map(h => h.trim().replace(/"/g, '')).filter(h => h);
    const numHeaders = headers.length;

    return lines.map(line => {
        if (!line.trim()) return null;

        const values = line.split(',');
        const entry = {};
        let valueIndex = 0;

        for (let i = 0; i < numHeaders; i++) {
            if (valueIndex >= values.length) {
                entry[headers[i]] = '';
                continue;
            }
            
            const header = headers[i];
            let value = values[valueIndex];

            // Junta partes de valores numéricos que foram divididos pela vírgula
            if (header === 'Qtde' || header === 'Preco Unitário' || header === 'Valor Bruto' || header === 'Valor c/ Negociação') {
                const nextPart = values[valueIndex + 1];
                if (nextPart && /^\d+$/.test(nextPart.trim())) {
                     // Verifica se a parte atual é um R$ ou um número para justificar a junção
                    if(value.trim().startsWith('R$') || !isNaN(parseFloat(value))){
                        value += ',' + nextPart;
                        valueIndex++;
                    }
                }
            }
            
            entry[header] = (value || '').trim();
            valueIndex++;
        }
        return entry;
    }).filter(Boolean); // Remove linhas nulas
}


function unifyData(primeData, sgtaJson) {
    const unified = [];
    (primeData || []).forEach(item => {
        if (!item['Placa']) return;
        unified.push({
            'COD_VENDA': normalizeString(item['Cód. Venda']),
            'DATA': normalizeString(item['Data']),
            'HORARIO': normalizeString(item['Horario']),
            'MODELO': normalizeString(item['Modelo']),
            'PLACA': normalizeString(item['Placa']),
            'ORGAO': normalizeString(item['Órgão']),
            'UNIDADE': normalizeString(item['Subunidade'] || ''),
            'BASE': normalizeString(item['Base']),
            'COMBUSTIVEL': normalizeString((item['Combustível'] || '').replace('S10', '').trim()),
            'KM_HORIMETRO': formatNumberToPtBr(item['Km/Horímetro']),
            'QTDE': formatNumberToPtBr(item['Qtde']),
            'PRECO_UNITARIO': formatNumberToPtBr(item['Preco Unitário']),
            'VALOR_BRUTO': formatNumberToPtBr(item['Valor c/ Negociação'] || item['Valor Bruto']),
            'LOCAL': 'PRIME'
        });
    });
    (sgtaJson.items || []).forEach(item => {
        const [, horario] = (item.movi_datahora_fim || ' ').split(' ');
        unified.push({
            'COD_VENDA': item.movi_codigo,
            'DATA': item.movi_data,
            'HORARIO': horario ? horario.split('.')[0] : '00:00:00',
            'MODELO': normalizeString(item.vemm_nome),
            'PLACA': normalizeString(item.veic_placa),
            'ORGAO': normalizeString(item.orga_nome),
            'UNIDADE': normalizeString(item.unid_nome),
            'BASE': normalizeString(item.poco_descricao),
            'COMBUSTIVEL': normalizeString((item.prod_display || '').replace('S10', '').trim()),
            'KM_HORIMETRO': formatNumberToPtBr(item.movi_totalizador_veiculo),
            'QTDE': formatNumberToPtBr(item.movi_volume),
            'PRECO_UNITARIO': formatNumberToPtBr(item.movi_preco_unitario),
            'VALOR_BRUTO': formatNumberToPtBr(item.movi_preco_total),
            'LOCAL': 'POC'
        });
    });
    return unified;
}

async function sendDataToGoogleScript(config, csvContent) {
    if (!config['drive-sync-active'] || !config['drive-sync-id']) {
        return;
    }
    if (!config['file-unified-csv']) {
        await addLog('Sincronização com Google Drive ignorada: formato CSV unificado não está ativo.', 'GDRIVE', 'info');
        return;
    }
    if (!csvContent || csvContent.split('\n').length < 2) {
         await addLog('Sincronização com Google Drive ignorada: não há novos dados para enviar.', 'GDRIVE', 'info');
         return;
    }

    await addLog('Iniciando sincronização com o Google Drive...', 'GDRIVE', 'info');
    try {
        const gasUrl = `https://script.google.com/macros/s/${config['drive-sync-id']}/exec`;
        const response = await fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: csvContent,
            mode: 'cors'
        });

        if (!response.ok) {
            throw new Error(`O servidor respondeu com o status: ${response.status} ${response.statusText}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error("Resposta inesperada do servidor (não é JSON). Verifique se o Google Apps Script foi publicado corretamente com a opção 'Quem pode acessar: Qualquer pessoa'.");
        }
        
        const result = await response.json();
        
        if (result.success) {
            await addLog(`Sincronização bem-sucedida. ${result.message || ''}`, 'GDRIVE', 'success');
        } else {
            throw new Error(result.message || 'O script retornou um erro desconhecido.');
        }

    } catch (error) {
        await addLog(`Falha na sincronização com o Google Drive: ${error.message}`, 'GDRIVE', 'error');
    }
}


async function checkAndFinalizeExtraction(config) {
    const { 'prime-active': prime_active, 'poc-active': poc_active } = config;
    
    let unifiedData = [];
    
    try {
        const primeData = (prime_active && extractionData.prime !== 'not_needed' && extractionData.prime !== 'error') ? parsePrimeData(extractionData.prime) : [];
        const sgtaData = (poc_active && extractionData.sgta !== 'not_needed' && extractionData.sgta !== 'error') ? extractionData.sgta : { items: [] };
        
        if (primeData.length === 0 && sgtaData.items.length === 0) {
            await addLog('Nenhum dado novo encontrado em nenhuma das fontes.', 'UNIFICADOR', 'info');
        } else {
            unifiedData = unifyData(primeData, sgtaData);
        }

    } catch (error) {
        await addLog(`Erro durante a unificação: ${error.message}`, 'UNIFICADOR', 'error');
    }

    if (unifiedData.length > 0) {
        await addLog('Gerando arquivos unificados...', 'UNIFICADOR', 'info');
        const downloadFolder = config['download-folder']?.trim() || 'Abastecimentos';
        const dateSuffix = `${formatDate.toYYYYMMDD(extractionData.params.startDate)}_a_${formatDate.toYYYYMMDD(extractionData.params.endDate)}`;
        
        if (config['file-unified-json']) { await downloadAsJson(unifiedData, `${downloadFolder}/abastecimentos_unificados_${dateSuffix}.json`); }
        if (config['file-unified-csv']) {
            const csvContentForDownload = arrayToCsv(unifiedData, false);
            await downloadAsCsv(csvContentForDownload, `${downloadFolder}/abastecimentos_unificados_${dateSuffix}.csv`);
        }
        await addLog('Arquivos unificados gerados com sucesso.', 'UNIFICADOR', 'success');
    }

    if (config['drive-sync-active']) {
        const csvContentForSync = arrayToCsv(unifiedData, true);
        await sendDataToGoogleScript(config, csvContentForSync);
    }

    await addLog('Processo de extração finalizado.', 'GERAL', 'info');
    sendFinalizationSignal();
    extractionData = { prime: null, sgta: null, params: null };
}

// --- LÓGICA DE EXTRAÇÃO E VALIDAÇÃO ---
const PRIME_LOGIN_URL = 'https://primebeneficios.com.br/Intranet/Frota';
const PRIME_BASE_RELATORIO_URL = "https://sistema-customizado.primebeneficios.com.br/Admin/SC_Relatorio_Mensal_Resumido_Novo.aspx?start={startDate}&ende={endDate}&fatura=&nf=&inicioVigencia=&fimVigencia=&Com=0&servico=0&unidade=0&centroCusto=0&base=0&placa=&prefixoVeiculo=&condutor=&posto=0&postoInterno=0&provisorio=&agrupamento=veiculo&venda=todos&regiao=0&codigoVenda=&startCancelamento=&endeCancelamento=&projeto=&matricula=&marca=&modelo=&tipoPosto=2&estado=TODOS&cidade=TODAS&estadoId=0&cidadeId=0&tipoInconsistencia=0&trForaRede=False&rec=0&KmDiasAba=30&KmDiasAbastMinimo=&KmDiasAbastMaximo=&tipoServico=0&nm_usuario=&situacao=0&patrimonio_veiculo=&via_cartao=0&motivo_solicitacao=0&tipoLog=TODOS&exibeCoringas=0&vinculado=&status_veiculo=&agrupVeiculos=&estabelecimentoTrr=&quantidadeLitros=500&agruparPor=&tagInstalada=&vloc_veiculo=&ClassificacaoTipoCombustivel=&cnpj=&filtrosSelecionados=iniciodoliPer%C3%ADodo:%20{startDateUrl}%20at%C3%A9%20{endDateUrl}fimdoli";
const SGTA_AUTH_URL = "http://sgta.netfrota.com.br:9080/sgta-prod-backend/rest/logins";
const SGTA_DATA_URL = "http://sgta.netfrota.com.br:9080/sgta-prod-backend/rest/movimentacoesabastecimentos";
const SGTA_REPORT_URL = "http://sgta.netfrota.com.br:9080/sgta-prod-report/relatorios?relatorio=DownloadArquivo";

async function setupOffscreenDocument() { if (await browser.offscreen.hasDocument?.()) return; await browser.offscreen.createDocument({ url: OFFSCREEN_DOCUMENT_PATH, reasons: ['DOM_PARSER'], justification: 'Parse de tokens HTML.' }); }
async function getDOMValue(html, selector) { 
    await setupOffscreenDocument(); 
    return await browser.runtime.sendMessage({ 
        target: 'offscreen',
        action: 'parseDOM', 
        html, 
        selector 
    }); 
}
async function testarLoginPrime(credentials) {
    try {
        const loginPageHtml = await fetch(PRIME_LOGIN_URL).then(res => res.text());
        const { value: token } = await getDOMValue(loginPageHtml, 'input[name="__RequestVerificationToken"]');
        if (!token) return { success: false, message: 'Não foi possível encontrar o token de segurança.' };
        const loginBody = new URLSearchParams({ '__RequestVerificationToken': token, 'cliente': credentials['prime-cliente'], 'Login': credentials['prime-login'], 'Password': credentials['prime-password'], 'clicouSSO': 'false' });
        const response = await fetch(PRIME_LOGIN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: loginBody.toString() });
        if (response.ok && !response.url.includes("Frota")) return { success: true, message: 'Login bem-sucedido!' };
        return { success: false, message: 'Credenciais inválidas.' };
    } catch (error) { return { success: false, message: 'Falha de conexão com o servidor.' }; }
}
async function testarLoginSgta(credentials) {
    try {
        const response = await fetch(SGTA_AUTH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8' }, body: JSON.stringify({ subdominio: "sgta", usuario: credentials['sgta-login'], senha: credentials['sgta-password'] }) });
        const data = await response.json();
        if (response.ok && data.token) return { success: true, message: 'Login bem-sucedido!' };
        return { success: false, message: 'Credenciais inválidas.' };
    } catch (error) { return { success: false, message: 'Falha de conexão com o servidor.' }; }
}

async function iniciarExtracao(config, dateRange, manualSyncOverride) {
    const finalConfig = { ...config };
    if (manualSyncOverride !== null) {
        finalConfig['drive-sync-active'] = manualSyncOverride;
        if (manualSyncOverride) {
            await addLog('Sincronização manual com Google Drive foi ativada para esta extração.', 'SISTEMA');
        }
    }

    await addLog(`Iniciando extração para o período de ${dateRange.startDate} a ${dateRange.endDate}.`);
    extractionData = { prime: null, sgta: null, params: dateRange };
    
    const extractionPromises = [];
    if (finalConfig['prime-active']) {
        extractionPromises.push(iniciarExtracaoPRIME(finalConfig, dateRange));
    }
    if (finalConfig['poc-active']) {
        extractionPromises.push(iniciarExtracaoSGTA(finalConfig, dateRange));
    }
    
    await Promise.allSettled(extractionPromises);
    await checkAndFinalizeExtraction(finalConfig);
}

async function iniciarExtracaoPRIME(config, dateRange) {
    const MAX_RETRIES = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            if (attempt > 1) {
                await addLog(`Aguardando 2 segundos antes de tentar novamente...`, 'PRIME', 'info');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            await addLog(`Autenticando no PRIME... (Tentativa ${attempt})`, 'PRIME');

            const loginPageHtml = await fetch(PRIME_LOGIN_URL).then(res => res.text());
            const { value: requestVerificationToken } = await getDOMValue(loginPageHtml, 'input[name="__RequestVerificationToken"]');
            if (!requestVerificationToken) throw new Error("Token de verificação não encontrado.");
            
            const loginBody = new URLSearchParams({ '__RequestVerificationToken': requestVerificationToken, 'cliente': config['prime-cliente'], 'Login': config['prime-login'], 'Password': config['prime-password'], 'clicouSSO': 'false' });
            const loginResponse = await fetch(PRIME_LOGIN_URL, { method: 'POST', headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: loginBody.toString() });
            if (!loginResponse.ok || loginResponse.url.includes("Frota")) throw new Error("Falha na autenticação. Verifique suas credenciais.");

            await addLog('Acessando relatório...', 'PRIME');
            const startDateFmt = formatDate.toDDMMYYYY(dateRange.startDate);
            const endDateFmt = formatDate.toDDMMYYYY(dateRange.endDate);
            const startDateUrl = formatDate.toDD_MM_YYYY(dateRange.startDate);
            const endDateUrl = formatDate.toDD_MM_YYYY(dateRange.endDate);
            
            const relatorioUrl = PRIME_BASE_RELATORIO_URL.replace(/{startDate}/g, startDateFmt).replace(/{endDate}/g, endDateFmt).replace('{startDateUrl}', encodeURIComponent(startDateUrl)).replace('{endDateUrl}', encodeURIComponent(endDateUrl));
            const relatorioPageHtml = await fetch(relatorioUrl).then(res => res.text());
            
            const { value: viewState } = await getDOMValue(relatorioPageHtml, '#__VIEWSTATE');
            const { value: viewStateGenerator } = await getDOMValue(relatorioPageHtml, '#__VIEWSTATEGENERATOR');
            if (!viewState) throw new Error("Token de sessão (__VIEWSTATE) não encontrado para gerar relatório.");
            
            if (config['file-native-excel']) {
                await addLog('Baixando arquivo XLSX nativo...', 'PRIME');
                const downloadBodyExcel = new URLSearchParams({'__EVENTTARGET': 'btn_excel','__EVENTARGUMENT': '','__VIEWSTATE': viewState,'__VIEWSTATEGENERATOR': viewStateGenerator });
                const downloadResponseExcel = await fetch(relatorioUrl, { method: 'POST', headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: downloadBodyExcel.toString() });
                if (!downloadResponseExcel.ok) throw new Error(`Erro ao solicitar download do XLSX: ${downloadResponseExcel.status}`);

                const contentType = downloadResponseExcel.headers.get('content-type');
                if (contentType && contentType.includes('text/html')) {
                    throw new Error("Nenhum dado encontrado no PRIME para o período (servidor retornou HTML em vez de arquivo).");
                }

                const buffer = await downloadResponseExcel.arrayBuffer();
                const dataUrl = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + arrayBufferToBase64(buffer);
                const downloadFolder = config['download-folder']?.trim() || 'Abastecimentos';
                const dateSuffix = `${formatDate.toYYYYMMDD(extractionData.params.startDate)}_a_${formatDate.toYYYYMMDD(extractionData.params.endDate)}`;
                await browser.downloads.download({ url: dataUrl, filename: `${downloadFolder}/abastecimentos_prime_${dateSuffix}.xlsx`, saveAs: false });
            }
            
            const anyUnified = config['file-unified-csv'] || config['file-unified-json'] || config['drive-sync-active'];
            if (anyUnified) {
                await addLog('Baixando dados para unificação...', 'PRIME');
                const downloadBodyTxt = new URLSearchParams({'__EVENTTARGET': 'btn_txt','__EVENTARGUMENT': '','__VIEWSTATE': viewState,'__VIEWSTATEGENERATOR': viewStateGenerator});
                const downloadResponse = await fetch(relatorioUrl, { method: 'POST', headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: downloadBodyTxt.toString() });
                const blob = await downloadResponse.blob();

                if (blob.type.includes('text/html')) {
                   throw new Error("Nenhum dado encontrado no PRIME para o período (servidor retornou HTML em vez de arquivo).");
                }

                extractionData.prime = await blob.text();
            } else {
                extractionData.prime = 'not_needed';
            }
            
            await addLog('Extração PRIME concluída.', 'PRIME', 'success');
            return; // Sucesso, sai da função
        } catch (error) { 
            lastError = error;
            await addLog(`Falha na tentativa ${attempt} da extração PRIME: ${error.message}`, 'PRIME', 'error');
        }
    }

    // Se chegou aqui, todas as tentativas falharam
    extractionData.prime = "error";
    await handleExtractionError('PRIME', lastError, config); 
}

async function iniciarExtracaoSGTA(config, dateRange) {
    await addLog('Autenticando...', 'SGTA');
    try {
        const authResponse = await fetch(SGTA_AUTH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json;charset=UTF-8' },
            body: JSON.stringify({ subdominio: "sgta", usuario: config['sgta-login'], senha: config['sgta-password'] })
        });
        const authData = await authResponse.json();
        if (!authResponse.ok || !authData.token) throw new Error("Falha na autenticação. Verifique suas credenciais.");
        const token = authData.token;

        const startDateFmt = formatDate.toDD_MM_YYYY(dateRange.startDate);
        const endDateFmt = formatDate.toDD_MM_YYYY(dateRange.endDate);
        const anyUnified = config['file-unified-csv'] || config['file-unified-json'] || config['drive-sync-active'];

        if (config['file-native-excel'] || anyUnified) {
            await addLog('Buscando dados no servidor SGTA para o período...', 'SGTA');
            const sgtaJsonData = await buscarDadosSGTA(token, startDateFmt, endDateFmt);
            extractionData.sgta = sgtaJsonData; // Sempre armazena para uso posterior
        }

        if (config['file-native-excel']) {
            await addLog('Baixando arquivo XLS nativo...', 'SGTA');
            const reportPayload = {
                formato: "excel", fieldCount: "14", download: "", view: "VW_ABASTECIMENTO",
                where: `where data_cadastro_ini >= '${startDateFmt} 00:00:00' AND data_cadastro_fim <= '${endDateFmt} 23:59:59'`,
                max_reg: "99999", orderBy: "movi_datahora_inicio ASC",
                textoPesquisa: `data_cadastro_ini: ${startDateFmt} 00:00:00 | data_cadastro_fim: ${endDateFmt} 23:59:59`,
                tituloRelatorio: "Abastecimentos", nomeSistema: "Sistema de Gestão Total de Abastecimento - SGTA",
                headerText0:"Data Inicial",alignText0:"left",precisionValue0:"",pesquisa0:"",dataField0:"movi_datahora_inicio",pattern0:"",
                headerText1:"Data Final",alignText1:"left",precisionValue1:"",pesquisa1:"",dataField1:"movi_datahora_fim",pattern1:"",
                headerText2:"Posto",alignText2:"left",precisionValue2:"",pesquisa2:"",dataField2:"poco_descricao",pattern2:"",
                headerText3:"Bico",alignText3:"right",precisionValue3:"",pesquisa3:"",dataField3:"bico_numero",pattern3:"",
                headerText4:"Órgão/Entidade",alignText4:"left",precisionValue4:"",pesquisa4:"",dataField4:"orga_nome",pattern4:"",
                headerText5:"Unidade",alignText5:"left",precisionValue5:"",pesquisa5:"",dataField5:"unid_nome",pattern5:"",
                headerText6:"Veículo",alignText6:"left",precisionValue6:"",pesquisa6:"",dataField6:"veic_placa_apresentacao",pattern6:"",
                headerText7:"Hodômetro",alignText7:"right",precisionValue7:"1",pesquisa7:"",dataField7:"movi_totalizador_veiculo",pattern7:"",
                headerText8:"Produto",alignText8:"right",precisionValue8:"",pesquisa8:"",dataField8:"prod_display",pattern8:"",
                headerText9:"Encer. Início",alignText9:"right",precisionValue9:"1",pesquisa9:"",dataField9:"movi_encerrante_inicial",pattern9:"",
                headerText10:"Encer. Fim",alignText10:"right",precisionValue10:"1",pesquisa10:"",dataField10:"movi_encerrante_final",pattern10:"",
                headerText11:"Volume",alignText11:"right",precisionValue11:"1",pesquisa11:"",dataField11:"movi_volume",pattern11:"",
                headerText12:"Status",alignText12:"right",precisionValue12:"",pesquisa12:"",dataField12:"movi_desc_status",pattern12:"",
                headerText13:"Condutor",alignText13:"left",precisionValue13:"",pesquisa13:"",dataField13:"cond_cpf",pattern13:""
            };
            const reportResponse = await fetch(SGTA_REPORT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8', token }, body: JSON.stringify(reportPayload) });
            if (!reportResponse.ok) throw new Error(`Falha no download do XLS: ${reportResponse.status}`);
            const buffer = await reportResponse.arrayBuffer();
            const dataUrl = 'data:application/vnd.ms-excel;base64,' + arrayBufferToBase64(buffer);
            const downloadFolder = config['download-folder']?.trim() || 'Abastecimentos';
            const dateSuffix = `${formatDate.toYYYYMMDD(extractionData.params.startDate)}_a_${formatDate.toYYYYMMDD(extractionData.params.endDate)}`;
            await browser.downloads.download({ url: dataUrl, filename: `${downloadFolder}/abastecimentos_poc_${dateSuffix}.xls`, saveAs: false });
        }
        
        if (!anyUnified) {
            extractionData.sgta = 'not_needed';
        }
        
        await addLog('Extração concluída.', 'SGTA', 'success');
    } catch (error) { 
        extractionData.sgta = "error";
        await handleExtractionError('SGTA', error, config); 
    }
}
async function buscarDadosSGTA(token, dataInicio, dataFim) {
    const dataUrl = `${SGTA_DATA_URL}?page=1&pagesize=99999&wherefield=data_cadastro_ini&wherefield=data_cadastro_fim&valuewherefield=${encodeURIComponent(dataInicio+' 00:00:00')}&valuewherefield=${encodeURIComponent(dataFim+' 23:59:59')}&typewherefield=MAIOR_IGUAL&typewherefield=MENOR_IGUAL`;
    const response = await fetch(dataUrl, { method: 'GET', headers: { 'token': token, 'accept': 'application/json, text/plain, */*' } });
    if (!response.ok) throw new Error(`Falha ao buscar dados JSON (Erro ${response.status}).`);
    return await response.json();
}

async function handleExtractionError(system, error, config) {
    const isAuthError = error.message.toLowerCase().includes('autenticação');
    const finalMessage = isAuthError ? error.message : 'Site indisponível ou erro inesperado.';
    await addLog(`${finalMessage} (${error.message})`, system, 'error');

    if (isAuthError) {
        browser.notifications.create({ type: 'basic', iconUrl: 'icons/icon128.png', title: `Falha de Login no ${system}`, message: 'As credenciais parecem estar incorretas. A automação foi pausada.' });
        await browser.alarms.clear(ALARM_SCHEDULER_CHECK);
    }
}

async function scheduleNextExtraction(config) {
    const frequency = config['auto-frequency'];
    await browser.alarms.clear(ALARM_SCHEDULER_CHECK);
    
    if (frequency === 'none') {
        await browser.storage.local.remove(STORAGE_SCHEDULE_KEY);
        await addLog('Agendamento automático desativado.', 'SISTEMA');
        return;
    }

    let nextRun = new Date();
    nextRun.setHours(2, 0, 0, 0); 

    if (frequency === 'daily') {
        nextRun.setDate(nextRun.getDate() + 1);
    } else if (frequency === 'weekly') {
        const targetDay = parseInt(config['auto-weekday'], 10);
        const currentDay = nextRun.getDay();
        const daysToAdd = (targetDay - currentDay + 7) % 7;
        nextRun.setDate(nextRun.getDate() + (daysToAdd === 0 ? 7 : daysToAdd));
    } else if (frequency === 'monthly') {
        nextRun.setMonth(nextRun.getMonth() + 1);
        nextRun.setDate(1);
    }
    
    // Se a data calculada já passou, recalcula para o próximo período
    while (nextRun < new Date()) {
        if (frequency === 'daily') {
            nextRun.setDate(nextRun.getDate() + 1);
        } else if (frequency === 'weekly') {
            nextRun.setDate(nextRun.getDate() + 7);
        } else if (frequency === 'monthly') {
            nextRun.setMonth(nextRun.getMonth() + 1);
        }
    }
    
    const schedule = { nextRun: nextRun.toISOString() };
    await browser.storage.local.set({ [STORAGE_SCHEDULE_KEY]: schedule });
    
    browser.alarms.create(ALARM_SCHEDULER_CHECK, { periodInMinutes: 60 });
    await addLog(`Próxima extração agendada para: ${nextRun.toLocaleString('pt-BR')}`, 'SISTEMA');
}

async function runScheduledExtractionIfNeeded() {
    if (isExtractionRunning) {
        console.log("SisPMG+ Abastecimentos: Tentativa de execução agendada ignorada, pois um processo já está em andamento.");
        return;
    }

    const { [STORAGE_CONFIG_KEY]: config, [STORAGE_SCHEDULE_KEY]: schedule } = await browser.storage.local.get([STORAGE_CONFIG_KEY, STORAGE_SCHEDULE_KEY]);

    if (!config || config['auto-frequency'] === 'none' || !schedule?.nextRun) {
        return; 
    }

    const now = new Date();
    const nextRunTime = new Date(schedule.nextRun);

    if (now < nextRunTime) {
        return; 
    }
    
    isExtractionRunning = true;
    try {
        await addLog('Executando extração agendada (ou perdida).', 'SISTEMA');
        const dateRange = calculateDateRange(config['auto-period'], config['auto-frequency']);
        
        await iniciarExtracao(config, dateRange, null);

        // Atualiza a 'baseDate' para o agendamento para evitar execuções repetidas no mesmo dia
        await scheduleNextExtraction(config); 
    } catch (e) {
        await addLog(`Erro crítico no processo de extração agendada: ${e.message}`, 'SISTEMA', 'error');
    } finally {
        isExtractionRunning = false; 
    }
}

// --- LISTENERS DA EXTENSÃO ---
export function initializeAbastecimentosBackground() {
    browser.runtime.onInstalled.addListener(async (details) => {
        if (details.reason === 'install') {
            const defaultConfig = {
                'prime-active': false, 'poc-active': false,
                'file-native-excel': true, 'file-unified-csv': false, 'file-unified-json': false,
                'auto-frequency': 'none', 'auto-period': '1', 'auto-weekday': '1',
                'download-folder': 'Abastecimentos',
                'drive-sync-active': false, 'drive-sync-id': ''
            };
            await browser.storage.local.set({ [STORAGE_CONFIG_KEY]: defaultConfig });
            await addLog('Configurações padrão definidas na instalação.');
        } else if (details.reason === 'update') {
            const { [STORAGE_CONFIG_KEY]: config } = await browser.storage.local.get(STORAGE_CONFIG_KEY);
            if (config) {
                if (typeof config['download-folder'] === 'undefined') { config['download-folder'] = 'Abastecimentos'; }
                if (typeof config['drive-sync-active'] === 'undefined') { config['drive-sync-active'] = false; config['drive-sync-id'] = ''; }
                if (typeof config['auto-weekday'] === 'undefined') { config['auto-weekday'] = '1'; } // Adiciona valor padrão para campo novo
                if (typeof config['drive-sync-url'] !== 'undefined') { // Migração de url para id
                    delete config['drive-sync-url'];
                    config['drive-sync-id'] = '';
                }
                await browser.storage.local.set({ [STORAGE_CONFIG_KEY]: config });
                await addLog('Extensão atualizada. Reagendando extrações, se houver.');
                await scheduleNextExtraction(config);
            }
        }
        await runScheduledExtractionIfNeeded();
    });
    
    browser.runtime.onStartup.addListener(async () => {
        await addLog('Navegador iniciado. Verificando agendamentos...', 'SISTEMA');
        await runScheduledExtractionIfNeeded();
    });

    browser.alarms.onAlarm.addListener(async (alarm) => {
        if (alarm.name === ALARM_SCHEDULER_CHECK) {
            await runScheduledExtractionIfNeeded();
        }
    });
}

export async function handleAbastecimentosMessages(request, sender) {
    const { action, settings } = request;
    
    switch(action) {
        case 'saveAndValidateCredentials':
            try {
                const results = {};
                if (settings['prime-active']) { results.prime = await testarLoginPrime(settings); }
                if (settings['poc-active']) { results.poc = await testarLoginSgta(settings); }
                const allSuccess = (!results.prime || results.prime.success) && (!results.poc || results.poc.success);
                if (allSuccess) {
                    await browser.storage.local.set({ [STORAGE_CONFIG_KEY]: settings });
                    await addLog('Configurações salvas com sucesso.', 'SISTEMA', 'success');
                    await scheduleNextExtraction(settings);
                }
                browser.runtime.sendMessage({ action: 'validationComplete', results }).catch(()=>{});
                return {success: true, validationResults: results};
            } catch (e) {
                return {success: false, error: e.message};
            }

        case 'startManualExtraction':
             if (isExtractionRunning) {
                return {success: false, message: "Uma extração já está em andamento."};
            }
            isExtractionRunning = true; // Bloqueia para extração manual
            try {
                const { [STORAGE_CONFIG_KEY]: config } = await browser.storage.local.get(STORAGE_CONFIG_KEY);
                if (!config) {
                    await addLog('Configurações não salvas.', 'GERAL', 'error');
                    sendFinalizationSignal();
                    return {success: false, message: "Configurações não salvas."};
                };
                const dateRange = { startDate: request.startDate, endDate: request.endDate };
                // Não aguarde a extração completa, apenas inicie. A UI será notificada por outras mensagens.
                iniciarExtracao(config, dateRange, request.manualSync);
                return {success: true, message: "Extração manual iniciada."};
            } catch (e) {
                isExtractionRunning = false; // Libera em caso de erro inicial
                return {success: false, error: e.message};
            }

        case 'clearLogs':
            try {
                await clearLogs();
                return {success: true};
            } catch (e) {
                return {success: false, error: e.message};
            }
    }
}


