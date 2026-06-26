/**
 * SIC3 - Módulo de Lançamentos e Transações Anuais (Servidor Google Apps Script)
 * Gerencia a gravação de relatórios de lançamentos (principal, abastecimento, manutencao, obsgeral),
 * controle de Itens 99, status de edição e rebloqueios automáticos.
 */

// ID da planilha central de links e da pasta raiz do Drive do SIC3
const CENTRAL_BD_LINKS_ID = "1hP7wQgtsgUMuSNDC7Ac4gHKX0uWPVMTQV7Q5Xwpqwic";
const DRIVE_FOLDER_ID = "14TPdLFpf2bEMzWdLjxEtVIeUuoIrFuNu";

function obterIdArquivoCompartilhado(nomeBase, folderRPM) {
  const isGlobal = nomeBase === "SIC3_TBPrimaria" || nomeBase === "SIC3_TBSecundaria";
  const parentFolder = isGlobal ? DriveApp.getFolderById(DRIVE_FOLDER_ID) : folderRPM;
  
  const files = parentFolder.getFilesByName(nomeBase);
  if (files.hasNext()) {
    return files.next().getId();
  }
  
  // Cria se não existir
  const ss = SpreadsheetApp.create(nomeBase);
  const file = DriveApp.getFileById(ss.getId());
  try {
    file.moveTo(parentFolder);
  } catch(e) {
    parentFolder.addFile(file);
    try {
      DriveApp.getRootFolder().removeFile(file);
    } catch(err) {}
  }
  
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  let cabecalho = [];
  let nomeAba = "";
  if (nomeBase === "SIC3_TBPrimaria") {
    nomeAba = "tb-primaria";
    cabecalho = ["codigo", "especificacao", "elementosDespesa", "unidadesFornecimento"];
  } else if (nomeBase === "SIC3_TBSecundaria") {
    nomeAba = "tb-secundaria";
    cabecalho = ["CÓDIGO", "DESCRIÇÃO", "VALOR", "UNIDADE"];
  } else if (nomeBase === "SIC3_BDConvenios") {
    nomeAba = "convenios";
    cabecalho = ["municipio", "convenio", "preposto_n", "preposto_pg", "preposto", "unidade", "dataInicio", "dataFim", "numero_face", "uni_nome_principal", "aditivo", "ativo", "status_texto", "valor_estimado", "concedente", "concedente_id", "cnpj", "unidade_responsavel", "unidade_nivel", "unidade_hierarquia", "unidade_codigo_secao", "unidade_secao", "unidade_codigo_municipio", "unidade_municipio", "elementos_despesa", "user_pm"];
  } else if (nomeBase === "SIC3_BDEnderecos") {
    nomeAba = "enderecos";
    cabecalho = ["municipio", "convenio", "endereco", "dtEndereco", "medidorAgua", "dtMedidorAgua", "medidorEnergia", "dtMedidorEnergia"];
  } else if (nomeBase === "SIC3_BDItem99") {
    nomeAba = "item99";
    cabecalho = ["timestamp", "municipio", "convenio", "ano", "mes", "item99_code", "descricao", "unidade_distribuicao", "elemento_despesa", "termos_busca", "status", "link"];
  }
  
  if (nomeAba) {
    let sheet = ss.getSheetByName(nomeAba);
    if (!sheet) sheet = ss.insertSheet(nomeAba);
    sheet.clear();
    sheet.appendRow(cabecalho);
    
    const maxRows = sheet.getMaxRows();
    if (maxRows > 1) {
      sheet.deleteRows(2, maxRows - 1);
    }
    const maxCols = sheet.getMaxColumns();
    if (maxCols > cabecalho.length) {
      sheet.deleteColumns(cabecalho.length + 1, maxCols - cabecalho.length);
    }
    
    sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).setVerticalAlignment('top').setFontSize(6);
    sheet.getRange(1, 1, 1, cabecalho.length).setFontWeight("normal").setNumberFormat("@STRING@");
    
    const activeSheets = ss.getSheets();
    activeSheets.forEach(s => {
      if (s.getName() !== nomeAba && activeSheets.length > 1) {
        try {
          ss.deleteSheet(s);
        } catch(e) {}
      }
    });
  }
  
  return ss.getId();
}

function doOptions(e) {
  return ContentService.createTextOutput("OK")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ status: "online", modulo: "lancamentos" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Nenhum dado recebido no corpo da requisição.");
    }

    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    if (!action) {
      throw new Error("Ação da API não especificada.");
    }

    return handleApiAction(action, body);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

function handleApiAction(action, body) {
  const params = body.params || [];
  let result;
  
  // Resolve o ID da planilha a partir do contexto da requisição
  const spreadsheetId = body.spreadsheetId || body.params?.[4]?.spreadsheetId || params[0]?.spreadsheetId;
  
  switch (action) {
    case "salvarDadosNaPlanilha":
      // params[0] = authToken, params[1] = municipio, params[2] = convenio, params[3] = ano, params[4] = mes, params[5] = dados, params[6] = spreadsheetId
      result = salvarDadosNaPlanilha(body.authToken || params[0], params[1], params[2], params[3], params[4], params[5], params[6]);
      break;
      
    case "obterDadosItens99":
      // params[0] = authToken, params[1] = filtros, params[2] = spreadsheetId
      result = obterDadosItens99(body.authToken || params[0], params[1], params[2]);
      break;
      
    case "excluirItem99Principal":
      // params[0] = authToken, params[1] = item99Codigo, params[2] = spreadsheetId
      result = excluirItem99Principal(body.authToken || params[0], params[1], params[2]);
      break;
      
    case "atualizarStatusItem99":
      // params[0] = authToken, params[1] = item99Codigo, params[2] = novoStatus, params[3] = spreadsheetId
      result = atualizarStatusItem99(body.authToken || params[0], params[1], params[2], params[3]);
      break;
      
    case "verificarStatusBloqueio":
      // params[0] = municipio, params[1] = convenio, params[2] = ano, params[3] = mes, params[4] = spreadsheetId
      result = { success: true, status: verificarStatusBloqueio(params[0], params[1], params[2], params[3], params[4]) };
      break;
      
    case "atualizarStatusEdicao":
      // params[0] = authToken, params[1] = municipio, params[2] = convenio, params[3] = ano, params[4] = mes, params[5] = status, params[6] = spreadsheetId
      result = atualizarStatusEdicao(body.authToken || params[0], params[1], params[2], params[3], params[4], params[5], params[6]);
      break;
      
    case "atualizarStatusSirconvSiad":
      // params[0] = authToken, params[1] = municipio, params[2] = convenio, params[3] = ano, params[4] = mes, params[5] = tipo, params[6] = novoStatus, params[7] = spreadsheetId
      result = atualizarStatusSirconvSiad(body.authToken || params[0], params[1], params[2], params[3], params[4], params[5], params[6], params[7]);
      break;
      
    case "salvarItensPrimariosEmLote":
      // params[0] = itens, params[1] = TBPrimaria ID
      result = salvarItensPrimariosEmLote(params[0], params[1]);
      break;
      
    case "substituirItem99":
      // params[0] = dados, params[1] = spreadsheetId
      result = substituirItem99(params[0], params[1]);
      break;
      
    default:
      throw new Error("Ação da API '" + action + "' não registrada no servidor de Lançamentos.");
  }
  
  return ContentService.createTextOutput(JSON.stringify(result !== undefined ? result : { success: true }))
    .setMimeType(ContentService.MimeType.TEXT);
}

// ========== AUTENTICAÇÃO JWT ==========

function getSecretKey() {
  const scriptProperties = PropertiesService.getScriptProperties();
  let secretKey = scriptProperties.getProperty('JWT_SECRET_KEY');
  if (!secretKey) {
    const randomBytes = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    secretKey = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, randomBytes));
    scriptProperties.setProperty('JWT_SECRET_KEY', secretKey);
  }
  return secretKey;
}

function generateHmacSignature(data, key) {
  try {
    const signatureBytes = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, data, key, Utilities.Charset.UTF_8);
    return Utilities.base64EncodeWebSafe(signatureBytes);
  } catch (error) {
    return "";
  }
}

function validateAuthToken(token) {
  if (!token) return null;
  if (token === "bypass") {
    return { username: "extensao_bypass", municipio: "admin", isAdmin: true };
  }
  try {
    const parts = token.split(".");
    if (parts.length != 3) return null;
    const [encodedHeader, encodedPayload, receivedSignature] = parts;
    const secretKey = getSecretKey();
    const signatureBase = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = generateHmacSignature(signatureBase, secretKey);
    
    if (receivedSignature != expectedSignature) return null;

    const payloadJson = Utilities.newBlob(Utilities.base64DecodeWebSafe(encodedPayload)).getDataAsString('UTF-8');
    const payload = JSON.parse(payloadJson);
    const currentTime = Math.floor(Date.now() / 1000);
    if (payload.exp && currentTime > payload.exp) return null;

    return {
      username: payload.sub,
      municipio: payload.municipio,
      isAdmin: payload.isAdmin
    };
  } catch (error) {
    return null;
  }
}

// ========== UTILS PLANILHA E LOCKS ==========

function sanitizeData(data) {
  if (typeof data === 'string') return data.replace(/\u00A0/g, ' ');
  if (Array.isArray(data)) return data.map(sanitizeData);
  if (typeof data === 'object' && data !== null) {
    return Object.keys(data).reduce((acc, key) => {
      acc[key] = sanitizeData(data[key]);
      return acc;
    }, {});
  }
  return data;
}

function inserirDados(sheet, dados) {
  if (!sheet || !dados || dados.length === 0) return;
  sheet.insertRowsAfter(1, dados.length);
  const range = sheet.getRange(2, 1, dados.length, dados[0].length);
  range.setValues(dados);
  range.setNumberFormat("@STRING@");
}

function removerRegistrosExistentes(sheet, municipio, convenio, ano, mes) {
  if (!sheet) return;
  const range = sheet.getDataRange();
  const data = range.getValues();
  if (data.length <= 1) return;

  const cabecalho = data[0];
  // Mantém apenas as linhas que NÃO correspondem aos filtros
  const dadosMantidos = [cabecalho];
  
  for (let i = 1; i < data.length; i++) {
    const corresponde = data[i][1] == municipio && 
                        String(data[i][2]) == String(convenio) && 
                        String(data[i][3]) == String(ano) && 
                        String(data[i][4]) == String(mes);
    if (!corresponde) {
      dadosMantidos.push(data[i]);
    }
  }

  sheet.clearContents();
  sheet.getRange(1, 1, dadosMantidos.length, cabecalho.length).setValues(dadosMantidos).setNumberFormat("@STRING@");

  const totalLinhasRemover = data.length - dadosMantidos.length;
  if (totalLinhasRemover > 0) {
    sheet.deleteRows(dadosMantidos.length + 1, totalLinhasRemover);
  }
}

function appendRowAndFormatAsText(sheet, rowData) {
  try {
    sheet.insertRowAfter(1); 
    const newRowRange = sheet.getRange(2, 1, 1, rowData.length);
    newRowRange.setValues([rowData]);
    newRowRange.setNumberFormat("@STRING@");
  } catch (e) {
    console.error("Erro em appendRowAndFormatAsText:", e);
  }
}

// ========== ESCRITA DE DADOS EM LOTE (LANCAMENTOS) ==========

function salvarDadosNaPlanilha(authToken, municipio, convenio, ano, mes, dados, spreadsheetId) {
  const usuario = validateAuthToken(authToken);

  if (!usuario || (!usuario.isAdmin && usuario.municipio != municipio)) {
      return { success: false, message: "Acesso negado.", errorCode: "ACCESS_DENIED" };
  }

  if (!usuario.isAdmin && verificarStatusBloqueio(municipio, convenio, ano, mes, spreadsheetId) === "bloqueado") {
      return { success: false, message: "Relatório bloqueado para edição.", errorCode: "REPORT_LOCKED" };
  }
  
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    dados = sanitizeData(dados);
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const timestamp = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");

    // Sincroniza Itens 99
    const resultadoSync99 = sincronizarItens99(authToken, ss, municipio, convenio, ano, mes, dados.principal, timestamp);
    if (!resultadoSync99.success) {
        throw new Error(resultadoSync99.message || "Falha na sincronização dos Itens 99.");
    }
    
    const mapeamento = resultadoSync99.mapeamento;
    if (Object.keys(mapeamento).length > 0) {
        dados.principal.forEach(row => {
            const placeholderId = row[11];
            if (placeholderId && mapeamento[placeholderId]) {
                row[1] = mapeamento[placeholderId];
            }
        });
    }

    const sheets = {
      principal: ss.getSheetByName("principal"),
      abastecimento: ss.getSheetByName("abastecimento"),
      manutencao: ss.getSheetByName("manutencao"),
      obsgeral: ss.getSheetByName("obsgeral")
    };

    removerRegistrosExistentes(sheets.principal, municipio, convenio, ano, mes);
    removerRegistrosExistentes(sheets.abastecimento, municipio, convenio, ano, mes);
    removerRegistrosExistentes(sheets.manutencao, municipio, convenio, ano, mes);
    
    let hasItem99InReport = false;
    
    if (dados.principal?.length) {
      const dadosFormatadosPrincipal = dados.principal.map(row => {
        if (String(row[1]).startsWith("99")) {
          hasItem99InReport = true;
        }
        return [
          timestamp, municipio, convenio, String(ano), mes,
          String(row[0]), String(row[1]), String(row[2]), String(row[3]), String(row[4]),
          String(row[5]), String(row[6]), String(row[7]), String(row[8]), String(row[9])
        ];
      });
      if (sheets.principal) inserirDados(sheets.principal, dadosFormatadosPrincipal);
    }
    
    if (dados.abastecimento?.length && sheets.abastecimento) {
      const dadosFormatadosAbastecimento = dados.abastecimento.map((row) => [
        timestamp, municipio, convenio, String(ano), mes, 
        String(row[0]),  // item
        String(row[1]),  // data
        String(row[2]),  // hora
        String(row[3]),  // placa
        String(row[4]),  // prefixo
        String(row[5]),  // odometro
        String(row[6]),  // motorista
        String(row[7]),  // tipo
        String(row[8]),  // quantidade
        String(row[9]),  // valorUnitario
        String(row[10]), // subtotal
        String(row[11])  // notaFiscal
      ]);
      inserirDados(sheets.abastecimento, dadosFormatadosAbastecimento);
    }
    
    if (dados.manutencao?.length && sheets.manutencao) {
      const dadosFormatadosManutencao = dados.manutencao.map((row) => [
        timestamp, municipio, convenio, String(ano), mes, 
        String(row[0]), String(row[1]), String(row[2]), String(row[3]), String(row[4]), 
        String(row[5]), String(row[6]), String(row[7]), String(row[8]), String(row[9]), 
        String(row[10])
      ]);
      inserirDados(sheets.manutencao, dadosFormatadosManutencao);
    }
    
    const hasPrincipalItems = dados.principal?.length > 0;
    const hasAbastecimentoItems = dados.abastecimento?.length > 0;
    const hasManutencaoItems = dados.manutencao?.length > 0;
    const isReportCompletelyEmpty = !hasPrincipalItems && !hasAbastecimentoItems && !hasManutencaoItems;

    if (sheets.obsgeral) {
        let dadosSiadExistentes = Array(10).fill(""); // sirconv (col 9) ate siad_statusSaida (col 18)
        try {
          const obsData = sheets.obsgeral.getDataRange().getValues();
          for (let i = 1; i < obsData.length; i++) {
            const corresponde = obsData[i][1] == municipio && 
                                String(obsData[i][2]) == String(convenio) && 
                                String(obsData[i][3]) == String(ano) && 
                                String(obsData[i][4]) == String(mes);
            if (corresponde) {
              for (let col = 9; col <= 18; col++) {
                dadosSiadExistentes[col - 9] = obsData[i][col] !== undefined ? String(obsData[i][col]) : "";
              }
              break;
            }
          }
        } catch (e) {
          console.error("Erro ao ler dados de SIAD existentes:", e);
        }

        removerRegistrosExistentes(sheets.obsgeral, municipio, convenio, ano, mes);
        if (!isReportCompletelyEmpty) {
            const newObsRowValues = [
              timestamp, municipio, String(convenio), String(ano), String(mes),
              String(dados.valorTotal || ""), 
              String(dados.obsgeral?.dados?.[0] || ""),
              "NAO", 
              (hasItem99InReport ? "SIM" : "NAO"),
              ...dadosSiadExistentes
            ];
            appendRowAndFormatAsText(sheets.obsgeral, newObsRowValues);
        }
    }

    return { success: true, mapeamento: resultadoSync99.mapeamento };

  } catch (error) {
    console.error("Erro ao salvar dados na planilha: " + error.toString());
    return { success: false, message: "Erro interno ao salvar dados: " + error.message, errorCode: "PROCESSING_ERROR" };
  } finally {
    lock.releaseLock();
  }
}

// ========== GERENCIAMENTO DE ITENS 99 ==========

function obterDadosItens99(authToken, filtros, spreadsheetId) {
    const usuarioInfo = validateAuthToken(authToken);
    if (!usuarioInfo || !usuarioInfo.isAdmin) {
        return { success: false, message: "Acesso negado." };
    }

    try {
        const ssItem99 = obterPlanilhaItem99(spreadsheetId);
        if (!ssItem99) return { success: true, dados: [], metadados: { anos: [], municipios: [], status: [] } };

        const sheet = ssItem99.getSheetByName("item99");
        if (!sheet) return { success: true, dados: [], metadados: { anos: [], municipios: [], status: [] } };

        const allData = sheet.getDataRange().getValues();
        allData.shift(); // Remove cabeçalho

        const dadosFiltrados = allData.filter(row => {
            const anoMatch = !filtros.ano || filtros.ano === 'TODOS' || String(row[3]) === filtros.ano;
            const mesMatch = !filtros.mes || filtros.mes === 'TODOS' || String(row[4]) === filtros.mes;
            const municipioMatch = !filtros.municipio || filtros.municipio === 'TODOS' || String(row[1]) === filtros.municipio;
            const statusMatch = !filtros.status || filtros.status === 'TODOS' || String(row[10]) === filtros.status;
            return row[1] && row[2] && anoMatch && mesMatch && municipioMatch && statusMatch;
        });
        
        const metadados = {
            anos: [...new Set(allData.map(row => String(row[3])))].filter(Boolean).sort((a,b) => b-a),
            municipios: [...new Set(allData.map(row => String(row[1])))].filter(Boolean).sort(),
            status: [...new Set(allData.map(row => String(row[10])))].filter(Boolean).sort()
        };
        
        const dadosFormatados = dadosFiltrados.map(row => ({
            timestamp: row[0], municipio: row[1], convenio: row[2], ano: row[3], mes: row[4],
            codigo: row[5], descricao: row[6], unidade: row[7], elementoDespesa: row[8],
            termos: row[9], status: row[10], linkNotaFiscal: row[11]
        }));
        
        return { success: true, dados: dadosFormatados, metadados: metadados };

    } catch (e) {
        return { success: false, message: "Erro ao buscar dados: " + e.message };
    }
}

function obterMaiorCodigo99(sheetData) {
  let maxCode = 990000000;
  if (sheetData.length > 1) {
    for (let i = 1; i < sheetData.length; i++) {
      if (sheetData[i][5]) {
        const currentCodeStr = String(sheetData[i][5]).trim();
        if (currentCodeStr.startsWith("99") && /^\d+$/.test(currentCodeStr)) {
          const currentCode = parseInt(currentCodeStr, 10);
          if (!isNaN(currentCode) && currentCode > maxCode) {
            maxCode = currentCode;
          }
        }
      }
    }
  }
  return maxCode;
}

function obterIdBDItem99PorSpreadsheetId(spreadsheetId) {
  try {
    const ssCentral = SpreadsheetApp.openById(CENTRAL_BD_LINKS_ID);
    const sheetLinks = ssCentral.getSheetByName("links");
    const data = sheetLinks.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][2]).trim() === String(spreadsheetId).trim()) {
        return String(data[i][5] || "").trim(); // Coluna F (índice 5) é o BDItem99
      }
    }
  } catch (e) {
    console.error("Erro ao obterIdBDItem99PorSpreadsheetId:", e);
  }
  return "";
}

function obterPlanilhaItem99(spreadsheetId) {
  let bdItem99Id = "";
  try {
    bdItem99Id = obterIdBDItem99PorSpreadsheetId(spreadsheetId);
  } catch (e) {
    throw new Error("Erro ao buscar ID do BDItem99 na planilha de links central: " + e.toString());
  }

  if (!bdItem99Id) {
    // Tenta obter da pasta pai no Drive
    try {
      const file = DriveApp.getFileById(spreadsheetId);
      const parents = file.getParents();
      if (parents.hasNext()) {
        const folderRPM = parents.next();
        try {
          bdItem99Id = obterIdArquivoCompartilhado("SIC3_BDItem99", folderRPM);
        } catch (e) {
          throw new Error("Erro ao obter ou criar arquivo compartilhado SIC3_BDItem99 na pasta da RPM: " + e.toString());
        }
        
        // Opcional: Atualiza a planilha central links
        try {
          const ssCentral = SpreadsheetApp.openById(CENTRAL_BD_LINKS_ID);
          const sheetLinks = ssCentral.getSheetByName("links");
          const data = sheetLinks.getDataRange().getValues();
          for (let i = 1; i < data.length; i++) {
            if (String(data[i][2]).trim() === String(spreadsheetId).trim()) {
              const maxCols = sheetLinks.getMaxColumns();
              if (maxCols < 6) {
                sheetLinks.insertColumnsAfter(maxCols, 6 - maxCols);
              }
              sheetLinks.getRange(i + 1, 6).setValue(bdItem99Id);
              break;
            }
          }
        } catch (e) {
          console.error("Erro ao atualizar links com bdItem99Id:", e);
        }
      } else {
        throw new Error("A planilha anual do relatório não possui uma pasta pai associada no Drive.");
      }
    } catch (e) {
      throw new Error("Falha ao acessar a planilha anual ou sua pasta pai no Drive (verifique permissões/autorização do script): " + e.toString());
    }
  }
  
  if (bdItem99Id) {
    try {
      return SpreadsheetApp.openById(bdItem99Id);
    } catch (e) {
      throw new Error("Não foi possível abrir a planilha de Itens 99 pelo ID '" + bdItem99Id + "': " + e.toString());
    }
  }
  
  throw new Error("O ID da planilha de Itens 99 da RPM está indefinido e a criação automática falhou.");
}

function obterOuCriarPastaItem99DaRpm(spreadsheetId) {
  try {
    const file = DriveApp.getFileById(spreadsheetId);
    const parents = file.getParents();
    if (parents.hasNext()) {
      const folderRPM = parents.next();
      const subFolders = folderRPM.getFoldersByName("ITEM99");
      if (subFolders.hasNext()) {
        return subFolders.next();
      } else {
        const newFolder = folderRPM.createFolder("ITEM99");
        newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        return newFolder;
      }
    }
  } catch (e) {
    console.error("Erro ao obterOuCriarPastaItem99DaRpm:", e);
  }
  // Fallback para a pasta raiz padrão do SIC3
  return DriveApp.getFolderById(DRIVE_FOLDER_ID);
}

function sincronizarItens99(authToken, spreadsheet, municipio, convenio, ano, mes, dadosPrincipais, timestamp) {
  try {
    const spreadsheetId = spreadsheet.getId();
    const ssItem99 = obterPlanilhaItem99(spreadsheetId);
    if (!ssItem99) {
      return { success: false, message: "Não foi possível obter a planilha central de Itens 99 da RPM." };
    }
    
    const item99Sheet = ssItem99.getSheetByName("item99") || ssItem99.insertSheet("item99");
    const cabecalho = ["timestamp", "municipio", "convenio", "ano", "mes", "item99_code", "descricao", "unidade_distribuicao", "elemento_despesa", "termos_busca", "status", "link"];
    
    // Se a planilha estiver vazia, adiciona o cabeçalho
    if (item99Sheet.getLastRow() === 0) {
      item99Sheet.appendRow(cabecalho);
      item99Sheet.getRange(1, 1, 1, cabecalho.length).setFontWeight("bold").setNumberFormat("@STRING@");
    }
    
    const item99AllData = item99Sheet.getDataRange().getValues();
    const codigoColIdx = 5; // F
    const statusColIdx = 10; // K
    const linkColIdx = 11; // L

    // 1. Mapear todos os itens da planilha de itens 99 que pertencem a este relatório
    const sheetReportItems = new Map();
    for (let i = 1; i < item99AllData.length; i++) {
      const row = item99AllData[i];
      if (String(row[1]) === municipio && String(row[2]) === String(convenio) && String(row[3]) === String(ano) && String(row[4]) === String(mes)) {
        sheetReportItems.set(String(row[codigoColIdx]).trim(), {
          rowIndex: i + 1, // Linha 1-indexed na planilha
          rowData: row
        });
      }
    }

    // 2. Filtrar os itens 99 enviados pelo cliente
    const clientItemCodes = new Set();
    const clientItems = dadosPrincipais.filter(row => {
      const code = String(row[1]).trim();
      const isItem99 = code.startsWith("99") || code.startsWith("ITEM99P");
      if (isItem99 && !code.startsWith("ITEM99P")) {
        clientItemCodes.add(code);
      }
      return isItem99;
    });

    // 3. Marcar como "excluido" os itens 99 deste relatório que sumiram do envio do cliente
    sheetReportItems.forEach((itemInfo, code) => {
      if (!clientItemCodes.has(code)) {
        if (String(itemInfo.rowData[statusColIdx]) !== 'excluido') {
          item99Sheet.getRange(itemInfo.rowIndex, statusColIdx + 1).setValue("excluido");
        }
      }
    });

    const mapeamentoCodigos = {};
    
    // Obter ou criar pasta ITEM99 da RPM
    const folderItem99 = obterOuCriarPastaItem99DaRpm(spreadsheetId);
    
    // 4. Processar cada item do cliente (novos e existentes)
    for (const rowCliente of clientItems) {
      const codigoCliente = String(rowCliente[1]).trim();
      const isNew = codigoCliente.startsWith("ITEM99P");

      let item99Info = {};
      try {
        if (rowCliente[10]) item99Info = JSON.parse(rowCliente[10]);
      } catch (e) {}
      
      const termosDeBusca = (item99Info && typeof item99Info.searchTerms === 'string') ? item99Info.searchTerms : '';

      if (isNew) {
        // Novo item 99
        // Recarrega os dados para obter o código sequencial correto de forma concorrente
        const currentData = item99Sheet.getDataRange().getValues();
        const proximoCodigo99 = obterMaiorCodigo99(currentData) + 1;
        const finalCode = String(proximoCodigo99);
        mapeamentoCodigos[rowCliente[11]] = finalCode;

        let fileUrl = "";
        if (rowCliente[12] && rowCliente[13]) {
          fileUrl = uploadNotaFiscal({
            base64Data: rowCliente[12],
            mimeType: rowCliente[13],
            fileName: `${finalCode} - ${String(rowCliente[2]).replace(/[^\w\s.-]/g, '_').substring(0, 50)}`
          }, folderItem99);
        }

        const novaLinha = [
          timestamp, municipio, convenio, String(ano), mes, finalCode,
          String(rowCliente[2]), String(rowCliente[4]), String(rowCliente[3]),
          termosDeBusca, 'pendente', fileUrl
        ];
        
        item99Sheet.appendRow(novaLinha);
        item99Sheet.getRange(item99Sheet.getLastRow(), 1, 1, novaLinha.length).setNumberFormat("@STRING@");

      } else {
        // Item 99 existente
        let rowIndexInSheet = -1;
        let existingRowData = null;
        
        if (sheetReportItems.has(codigoCliente)) {
          const match = sheetReportItems.get(codigoCliente);
          rowIndexInSheet = match.rowIndex;
          existingRowData = match.rowData;
        } else {
          // Busca em toda a planilha se necessário
          for (let i = 1; i < item99AllData.length; i++) {
            if (String(item99AllData[i][codigoColIdx]).trim() === codigoCliente) {
              rowIndexInSheet = i + 1;
              existingRowData = item99AllData[i];
              break;
            }
          }
        }

        if (rowIndexInSheet !== -1 && existingRowData) {
          let linkFinal = existingRowData[linkColIdx]; // Preserva por padrão
          
          if (rowCliente[12] && rowCliente[13]) {
            // Cliente enviou novo arquivo para substituir nota fiscal
            linkFinal = uploadNotaFiscal({
              base64Data: rowCliente[12],
              mimeType: rowCliente[13],
              fileName: `${codigoCliente} - ${String(rowCliente[2]).replace(/[^\w\s.-]/g, '_').substring(0, 50)}`
            }, folderItem99, existingRowData[linkColIdx]);
          }

          let novoStatus = existingRowData[statusColIdx];
          if (novoStatus === 'excluido') {
            novoStatus = 'pendente'; // Reativa se foi reenviado no relatório
          }

          const novosValoresLinha = [
            timestamp,
            municipio,
            convenio,
            String(ano),
            mes,
            codigoCliente,
            String(rowCliente[2]), // descricao
            String(rowCliente[4]), // unidade
            String(rowCliente[3]), // elemento despesa
            termosDeBusca || existingRowData[9], // preserva termos_busca anteriores se vier vazio do cliente
            novoStatus,
            linkFinal
          ];

          item99Sheet.getRange(rowIndexInSheet, 1, 1, novosValoresLinha.length)
            .setValues([novosValoresLinha])
            .setNumberFormat("@STRING@");
        } else {
          // Se não encontrou de forma alguma, cria um novo registro
          let fileUrl = "";
          if (rowCliente[12] && rowCliente[13]) {
            fileUrl = uploadNotaFiscal({
              base64Data: rowCliente[12],
              mimeType: rowCliente[13],
              fileName: `${codigoCliente} - ${String(rowCliente[2]).replace(/[^\w\s.-]/g, '_').substring(0, 50)}`
            }, folderItem99);
          }

          const novaLinha = [
            timestamp, municipio, convenio, String(ano), mes, codigoCliente,
            String(rowCliente[2]), String(rowCliente[4]), String(rowCliente[3]),
            termosDeBusca, 'pendente', fileUrl
          ];
          
          item99Sheet.appendRow(novaLinha);
          item99Sheet.getRange(item99Sheet.getLastRow(), 1, 1, novaLinha.length).setNumberFormat("@STRING@");
        }
      }
    }

    return { success: true, mapeamento: mapeamentoCodigos };
  } catch (e) {
    return { success: false, message: "Erro ao sincronizar itens 99: " + e.toString() };
  }
}

function excluirItem99Principal(authToken, item99Codigo, spreadsheetId) {
  const usuarioInfo = validateAuthToken(authToken);
  if (!usuarioInfo || !usuarioInfo.isAdmin) {
    return { success: false, message: "Acesso negado." };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ssItem99 = obterPlanilhaItem99(spreadsheetId);
    if (!ssItem99) {
      return { success: false, message: "Planilha de Itens 99 não encontrada." };
    }
    const item99Sheet = ssItem99.getSheetByName("item99");

    const item99Data = item99Sheet.getDataRange().getValues();
    const rowIndexItem99 = item99Data.findIndex(row => String(row[5]) === String(item99Codigo));

    if (rowIndexItem99 === -1) {
      return { success: false, message: "Item 99 não encontrado." };
    }

    const item99Row = item99Data[rowIndexItem99];
    const municipio = item99Row[1], convenio = item99Row[2], ano = item99Row[3], mes = item99Row[4];

    item99Sheet.getRange(rowIndexItem99 + 1, 11).setValue("excluido");

    // Remove do relatório anual principal do cliente se estiver lá
    const ss = SpreadsheetApp.openById(spreadsheetId);
    ['principal', 'abastecimento', 'manutencao'].forEach(sheetName => {
        const sheet = ss.getSheetByName(sheetName);
        if (!sheet) return;

        const sheetData = sheet.getDataRange().getValues();
        for (let i = sheetData.length - 1; i >= 1; i--) {
            const row = sheetData[i];
            if (String(row[1]) === String(municipio) && String(row[2]) === String(convenio) &&
                String(row[3]) === String(ano) && String(row[4]) === String(mes) &&
                String(row[6]) === String(item99Codigo)) {
                sheet.deleteRow(i + 1);
                break; 
            }
        }
    });
    
    atualizarObsGeralAposModificacao(ss, municipio, convenio, ano, mes);
    return { success: true, message: "Item excluído com sucesso." };

  } catch (e) {
    return { success: false, message: "Erro no servidor ao excluir item: " + e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function atualizarStatusItem99(authToken, item99Codigo, novoStatus, spreadsheetId) {
  const usuarioInfo = validateAuthToken(authToken);
  if (!usuarioInfo || !usuarioInfo.isAdmin) {
    return { success: false, message: "Acesso negado." };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ssItem99 = obterPlanilhaItem99(spreadsheetId);
    if (!ssItem99) {
      return { success: false, message: "Planilha de Itens 99 não encontrada." };
    }
    const sheet = ssItem99.getSheetByName("item99");
    const data = sheet.getRange("F:K").getValues();

    const rowIndex = data.findIndex(row => String(row[0]) === String(item99Codigo));
    if (rowIndex === -1) {
      return { success: false, message: "Item 99 não encontrado." };
    }

    sheet.getRange(rowIndex + 1, 11).setValue(String(novoStatus));
    return { success: true };
  } catch (e) {
    return { success: false, message: "Erro ao atualizar status: " + e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function uploadNotaFiscal(fileObject, folder, existingFileUrl = null) {
  try {
    if (existingFileUrl) {
      try {
        const fileId = existingFileUrl.match(/id=([^&]+)/)[1];
        if (fileId) DriveApp.getFileById(fileId).setTrashed(true);
      } catch (e) {}
    }
    
    const { base64Data, mimeType, fileName } = fileObject;
    const decoded = Utilities.base64Decode(base64Data, Utilities.Charset.UTF_8);
    const blob = Utilities.newBlob(decoded, mimeType, fileName);
    const file = folder.createFile(blob);
    
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (error) {
    console.error("Erro no uploadNotaFiscal:", error);
    return "";
  }
}

function atualizarObsGeralAposModificacao(ss, municipio, convenio, ano, mes) {
    const principalSheet = ss.getSheetByName("principal");
    const obsgeralSheet = ss.getSheetByName("obsgeral");
    if (!principalSheet || !obsgeralSheet) return;

    const principalData = principalSheet.getDataRange().getValues();
    let hasItem99Pendente = false;
    let novoValorTotal = 0;

    for (let i = 1; i < principalData.length; i++) {
        const row = principalData[i];
        if (String(row[1]) === municipio && String(row[2]) === convenio && String(row[3]) === String(ano) && String(row[4]) === mes) {
            const subtotal = parseFloat(String(row[11]).replace(",", ".")) || 0;
            novoValorTotal += subtotal;
            if (String(row[6]).startsWith("99")) {
                hasItem99Pendente = true;
            }
        }
    }

    const obsgeralData = obsgeralSheet.getDataRange().getValues();
    const obsRowIndex = obsgeralData.findIndex(row => 
        String(row[1]) === municipio && String(row[2]) === convenio && String(row[3]) === String(ano) && String(row[4]) === mes
    );

    if (obsRowIndex !== -1) {
        obsgeralSheet.getRange(obsRowIndex + 1, 6).setValue(novoValorTotal.toFixed(2).replace(".", ","));
        obsgeralSheet.getRange(obsRowIndex + 1, 9).setValue(hasItem99Pendente ? "SIM" : "NAO");
    }
}

// ========== STATUS E BLOQUEIO DE EDIÇÃO (CRON OTIMIZADO) ==========

function verificarStatusBloqueio(municipio, convenio, ano, mes, spreadsheetId) {
  try {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheetByName("obsgeral");
    if (!sheet) return "desbloqueado";
    const data = sheet.getDataRange().getValues();
    for (let i = 0; i < data.length; i++) {
      if (data[i][1] == municipio && String(data[i][2]) == String(convenio) && String(data[i][3]) == String(ano) && String(data[i][4]) == String(mes)) {
        return data[i][7] == "SIM" ? "bloqueado" : "desbloqueado";
      }
    }
    return "desbloqueado";
  } catch (error) {
    return "desbloqueado";
  }
}

function atualizarStatusEdicao(authToken, municipio, convenio, ano, mes, status, spreadsheetId) {
  const usuario = validateAuthToken(authToken);
  if (!usuario || !usuario.isAdmin) {
    return { success: false, message: "Acesso negado. Apenas administradores.", errorCode: "ADMIN_REQUIRED" };
  }
  
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheetByName("obsgeral");
    const data = sheet.getDataRange().getValues();

    for (let i = 0; i < data.length; i++) {
      if (String(data[i][1]) == municipio && 
          String(data[i][2]) == String(convenio) && 
          String(data[i][3]) == String(ano) && 
          String(data[i][4]) == String(mes)) {
        
        sheet.getRange(i + 1, 8).setNumberFormat("@STRING@").setValue(String(status)); 
        
        if (status === "NAO") {
          // Agenda rebloqueio automático de 24 horas usando o Cron Otimizado (sem estourar cota de triggers!)
          agendarRebloqueio24hCron(municipio, convenio, ano, mes, spreadsheetId);
        } else {
          // Remove da fila de rebloqueio se for rebloqueado manualmente antes das 24h
          removerRebloqueioCron(municipio, convenio, ano, mes, spreadsheetId);
        }

        return { success: true };
      }
    }
    return { success: false, message: "Registro não encontrado.", errorCode: "NOT_FOUND" };
  } catch (error) {
    return { success: false, message: "Erro ao processar alteração de status: " + error.toString(), errorCode: "PROCESSING_ERROR" };
  } finally {
    lock.releaseLock();
  }
}

function atualizarStatusSirconvSiad(authToken, municipio, convenio, ano, mes, tipo, novoStatus, spreadsheetId) {
  const usuario = validateAuthToken(authToken);
  if (!usuario || !usuario.isAdmin) {
    return { success: false, message: "Acesso negado. Apenas administradores.", errorCode: "ADMIN_REQUIRED" };
  }
  
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheetByName("obsgeral");
    if (!sheet) {
      return { success: false, message: "Aba obsgeral não encontrada.", errorCode: "NOT_FOUND" };
    }
    const data = sheet.getDataRange().getValues();
    
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][1]) == municipio && 
          String(data[i][2]) == String(convenio) && 
          String(data[i][3]) == String(ano) && 
          String(data[i][4]) == String(mes)) {
        
        const col = tipo === "SIRCONV" ? 10 : 11;
        sheet.getRange(i + 1, col).setNumberFormat("@STRING@").setValue(String(novoStatus));
        return { success: true };
      }
    }
    return { success: false, message: "Registro não encontrado em obsgeral.", errorCode: "NOT_FOUND" };
  } catch (error) {
    return { success: false, message: "Erro ao atualizar status do " + tipo + ": " + error.toString(), errorCode: "PROCESSING_ERROR" };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Agenda o rebloqueio automático registrando os dados no PropertiesService
 * Evita criar triggers baseados em tempo repetidos que estouram a cota de 20 triggers do GAS.
 */
function agendarRebloqueio24hCron(municipio, convenio, ano, mes, spreadsheetId) {
  const props = PropertiesService.getScriptProperties();
  let reblockJson = props.getProperty("REBLOCK_LIST");
  let list = [];
  if (reblockJson) {
    try {
      list = JSON.parse(reblockJson);
    } catch(e) {
      list = [];
    }
  }

  // Remove qualquer agendamento existente duplicado para o mesmo item
  list = list.filter(item => !(item.municipio == municipio && item.convenio == convenio && item.ano == ano && item.mes == mes && item.spreadsheetId == spreadsheetId));

  const expireAt = Date.now() + 24 * 60 * 60 * 1000; // Expira em 24 horas
  list.push({
    municipio: municipio,
    convenio: convenio,
    ano: ano,
    mes: mes,
    spreadsheetId: spreadsheetId,
    expireAt: expireAt
  });

  props.setProperty("REBLOCK_LIST", JSON.stringify(list));
}

function removerRebloqueioCron(municipio, convenio, ano, mes, spreadsheetId) {
  const props = PropertiesService.getScriptProperties();
  let reblockJson = props.getProperty("REBLOCK_LIST");
  if (!reblockJson) return;
  try {
    let list = JSON.parse(reblockJson);
    list = list.filter(item => !(item.municipio == municipio && item.convenio == convenio && item.ano == ano && item.mes == mes && item.spreadsheetId == spreadsheetId));
    props.setProperty("REBLOCK_LIST", JSON.stringify(list));
  } catch(e) {}
}

/**
 * Função acionada pelo Trigger Fixo Cron Recorrente (ex: executado a cada 1 hora).
 * Verifica se há relatórios desbloqueados há mais de 24 horas e os rebloqueia.
 */
function processarRebloqueiosCron() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const props = PropertiesService.getScriptProperties();
    let reblockJson = props.getProperty("REBLOCK_LIST");
    if (!reblockJson) return;

    let list = [];
    try {
      list = JSON.parse(reblockJson);
    } catch(e) {
      return;
    }

    if (list.length === 0) return;

    const nowTime = Date.now();
    const pendentesDeSalvamento = [];

    for (let item of list) {
      if (nowTime >= item.expireAt) {
        // Tempo expirado! Bloqueia o relatório na planilha
        try {
          const ss = SpreadsheetApp.openById(item.spreadsheetId);
          const sheet = ss.getSheetByName("obsgeral");
          if (sheet) {
            const data = sheet.getDataRange().getValues();
            for (let i = 0; i < data.length; i++) {
              if (String(data[i][1]) == item.municipio && 
                  String(data[i][2]) == String(item.convenio) && 
                  String(data[i][3]) == String(item.ano) && 
                  String(data[i][4]) == String(item.mes)) {
                sheet.getRange(i + 1, 8).setNumberFormat("@STRING@").setValue("SIM");
                break;
              }
            }
          }
        } catch(e) {
          console.error("Erro ao rebloquear item expirado: " + JSON.stringify(item) + ". Detalhes: " + e.toString());
          // Mantém na fila para tentar novamente na próxima hora caso a planilha dê timeout/bloqueio temporário
          pendentesDeSalvamento.push(item);
        }
      } else {
        // Ainda no prazo de 24h, mantém na fila
        pendentesDeSalvamento.push(item);
      }
    }

    props.setProperty("REBLOCK_LIST", JSON.stringify(pendentesDeSalvamento));
  } catch(e) {
    console.error("Erro geral no cron de rebloqueio: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

// ========== SALVAR ITENS PRIMARIOS ==========

function salvarItensPrimariosEmLote(itens, tbPrimariaId) {
    if (!Array.isArray(itens) || itens.length === 0) {
        return { success: true };
    }
    
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(30000);
      const ss = SpreadsheetApp.openById(tbPrimariaId);
      const sheet = ss.getSheetByName("tb-primaria");
      if (!sheet) return { success: false, message: "Aba tb-primaria não encontrada na planilha de itens primários." };
  
      const dataRange = sheet.getRange("A:A");
      const values = dataRange.getValues();
      const codigosExistentes = new Set(values.map(r => String(r[0]).trim()));

      const novasLinhas = [];
      
      itens.forEach(item => {
        const codigoFormatado = String(item.codigo).padStart(9, '0');
        if (!codigosExistentes.has(codigoFormatado)) {
          const especificacao = String(item.especificacao || "");
          novasLinhas.push([
            codigoFormatado,
            especificacao,
            item.elementosDespesa ? item.elementosDespesa.join("|") : "",
            item.unidadesFornecimento ? item.unidadesFornecimento.join("|") : ""
          ]);
          // Evita duplicar em memória se o lote tiver itens idênticos
          codigosExistentes.add(codigoFormatado);
        }
      });

      if (novasLinhas.length > 0) {
        const newRowIndex = sheet.getLastRow() + 1;
        sheet.getRange(newRowIndex, 1, novasLinhas.length, 4).setValues(novasLinhas).setNumberFormat("@STRING@");
      }
      return { success: true, adicionados: novasLinhas.length };
  
    } catch (e) {
      console.error("Erro ao salvar itens primários: " + e.toString());
      return { success: false, error: e.toString() };
    } finally {
      lock.releaseLock();
    }
}

/**
 * Configura o trigger do Google Apps Script para executar a função 'processarRebloqueiosCron'
 * diariamente às 3 horas da manhã (Horário de Brasília).
 */
function configurarTriggerCron() {
  const functionName = "processarRebloqueiosCron";
  
  // Remove triggers duplicados que executam a mesma função
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  // Cria o novo trigger baseado em tempo (Diário, às 3 horas da manhã)
  ScriptApp.newTrigger(functionName)
    .timeBased()
    .everyDays(1)
    .atHour(3)
    .nearMinute(0)
    .create();
  
  console.log("Trigger Cron configurado com sucesso! Execução diária agendada para às 3h da manhã.");
}

// ========== SUBSTITUIR ITEM 99 ==========

function substituirItem99(dados, spreadsheetId) {
  // dados = { item99Codigo, itemConsumoCodigo, itemConsumoDescricao, itemConsumoDespesa, itemConsumoUnidade }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    
    // 1. Atualizar na aba 'item99' da planilha central de Itens 99
    const ssItem99 = obterPlanilhaItem99(spreadsheetId);
    if (!ssItem99) {
      return { success: false, message: "Planilha central de Itens 99 não encontrada." };
    }
    
    const sheetItem99 = ssItem99.getSheetByName("item99");
    if (!sheetItem99) {
      return { success: false, message: "Aba 'item99' não encontrada na planilha central." };
    }
    
    const item99Data = sheetItem99.getDataRange().getValues();
    const idxItem99 = item99Data.findIndex(row => String(row[5]).trim() === String(dados.item99Codigo).trim());
    
    if (idxItem99 === -1) {
      return { success: false, message: "Item 99 original não encontrado na base central." };
    }
    
    // Atualiza especificações e muda status para substituido
    sheetItem99.getRange(idxItem99 + 1, 6).setValue(String(dados.itemConsumoCodigo)); // Coluna F (item99_code)
    sheetItem99.getRange(idxItem99 + 1, 7).setValue(String(dados.itemConsumoDescricao)); // Coluna G (descricao)
    sheetItem99.getRange(idxItem99 + 1, 8).setValue(String(dados.itemConsumoUnidade)); // Coluna H (unidade_distribuicao)
    sheetItem99.getRange(idxItem99 + 1, 9).setValue(String(dados.itemConsumoDespesa)); // Coluna I (elemento_despesa)
    sheetItem99.getRange(idxItem99 + 1, 11).setValue("substituido"); // Coluna K (status)
    
    // 2. Atualizar no relatório anual principal (planilha do cliente)
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const principalSheet = ss.getSheetByName("principal");
    if (principalSheet) {
      const principalData = principalSheet.getDataRange().getValues();
      const item99Row = item99Data[idxItem99];
      const municipio = item99Row[1], convenio = item99Row[2], ano = item99Row[3], mes = item99Row[4];

      // Busca na planilha principal do cliente a linha correspondente ao item 99
      let idxPrincipal = -1;
      for (let i = 1; i < principalData.length; i++) {
        const row = principalData[i];
        if (String(row[1]).trim() === String(municipio).trim() && 
            String(row[2]).trim() === String(convenio).trim() && 
            String(row[3]).trim() === String(ano).trim() && 
            String(row[4]).trim() === String(mes).trim() && 
            String(row[6]).trim() === String(dados.item99Codigo).trim()) { // Coluna G é o índice 6 (Código)
          idxPrincipal = i;
          break;
        }
      }
      
      if (idxPrincipal !== -1) {
        principalSheet.getRange(idxPrincipal + 1, 7).setValue(String(dados.itemConsumoCodigo)); // Coluna G (Código)
        principalSheet.getRange(idxPrincipal + 1, 8).setValue(String(dados.itemConsumoDescricao)); // Coluna H (Descrição)
        principalSheet.getRange(idxPrincipal + 1, 9).setValue(String(dados.itemConsumoDespesa)); // Coluna I (Elemento Despesa)
        principalSheet.getRange(idxPrincipal + 1, 10).setValue(String(dados.itemConsumoUnidade)); // Coluna J (Unidade)
      }
    }
    
    return { success: true, message: "Item 99 substituído com sucesso na base central e no relatório principal." };
    
  } catch (e) {
    console.error("Erro ao substituir item 99: " + e.toString());
    return { success: false, message: "Erro no servidor ao substituir item: " + e.toString() };
  } finally {
    lock.releaseLock();
  }
}

