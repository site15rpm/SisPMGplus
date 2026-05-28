// Captura todos os links de concedentes na página atual
const links = document.querySelectorAll('a[href*="concedente/view?id="]');
const concedentesMap = new Map();

links.forEach(link => {
    // Extrai o ID a partir da URL
    const urlMatch = link.href.match(/id=(\d+)/);
    if (urlMatch && urlMatch[1]) {
        const id = urlMatch[1];
        const nome = link.innerText.trim();
        concedentesMap.set(id, nome);
    }
});

const concedentes = Array.from(concedentesMap).map(([id, nome]) => ({ id, nome }));
console.log(`[AUDITORIA] Concedentes únicos identificados: ${concedentes.length}`);
console.log("Iniciando extração profunda de convênios via API. Aguarde...");

async function extrairDadosCompletos() {
    const resultadoGeral = [];

    for (const concedente of concedentes) {
        console.log(`[PROCESSANDO] Concedente ID: ${concedente.id} - ${concedente.nome}`);

        try {
            // 1. Requisita a página HTML do concedente para listar os convênios
            const resHtml = await fetch(`https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/concedente/view?id=${concedente.id}`);
            const htmlText = await resHtml.text();

            // Analisa o HTML de forma segura em memória
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, 'text/html');

            // Isola o contêiner de "Convênios firmados"
            const headers = Array.from(doc.querySelectorAll('h2'));
            const targetHeader = headers.find(h => h.textContent.includes('Convênios firmados'));

            if (targetHeader && targetHeader.parentElement) {
                const items = targetHeader.parentElement.querySelectorAll('a.item.flex-linha');

                for (const item of items) {
                    const colunas = item.querySelectorAll('.flex-coluna');
                    
                    // O Código do Convênio é sempre a segunda coluna no layout padrão
                    const codigoConvenio = colunas[1]?.innerText.replace('Código', '').trim() || '';

                    if (!codigoConvenio) continue;

                    console.log(`  -> Extraindo detalhes via API do Convênio: ${codigoConvenio}`);

                    // 2. Requisita os detalhes consolidados via endpoint JSON do sistema
                    try {
                        const resJson = await fetch(`https://intranet.policiamilitar.mg.gov.br/lite/convenio/web/convenio/get-convenio-detalhes?id=${codigoConvenio}`);
                        const data = await resJson.json();

                        // Se a requisição teve sucesso, mesclamos os dados
                        if (data.success && data.convenio) {
                            resultadoGeral.push({
                                ConcedenteID_Pai: concedente.id,
                                ConcedenteNome_Pai: concedente.nome,
                                ...data.convenio // Desestrutura todas as chaves do objeto convenio
                            });
                        } else {
                            console.warn(`  [ALERTA] Falha lógica ao extrair convênio ${codigoConvenio}:`, data.msg);
                        }
                    } catch (errJson) {
                        console.error(`  [ERRO] Falha de rede na requisição JSON do convênio ${codigoConvenio}:`, errJson);
                    }

                    // Proteção de Integridade: Impede o acionamento de defesas de rede do servidor (500ms delay)
                    await new Promise(r => setTimeout(r, 500));
                }
            }

            // Pausa adicional entre troca de concedentes
            await new Promise(r => setTimeout(r, 500));

        } catch (errHtml) {
            console.error(`[ERRO] Falha ao processar a matriz do concedente ${concedente.id}:`, errHtml);
        }
    }

    // Console Output e Exportação
    console.log("\n=======================================================");
    console.log("[AUDITORIA] Extração finalizada com sucesso. Estrutura final consolidada:");
    
    if(resultadoGeral.length > 0) {
        console.table(resultadoGeral);
        console.log(JSON.stringify(resultadoGeral, null, 2));
    } else {
        console.warn("Nenhum dado válido extraído.");
    }
}

// Inicializa a engine
extrairDadosCompletos();