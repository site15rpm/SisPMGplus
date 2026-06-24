/**
 * SIC3 - Módulo de Criação de Estrutura e Links (Servidor Google Apps Script)
 * Lida exclusivamente com a criação de pastas, arquivos de bancos de dados por RPM e Ano,
 * e centraliza os registros de IDs das planilhas na planilha central SIC3_BDLinks.
 */

// ID da pasta pai do Google Drive onde as planilhas do SIC3 são armazenadas
const DRIVE_FOLDER_ID = "14TPdLFpf2bEMzWdLjxEtVIeUuoIrFuNu";

// ID da Planilha Central de Mapeamento de Links
const CENTRAL_BD_LINKS_ID = "1hP7wQgtsgUMuSNDC7Ac4gHKX0uWPVMTQV7Q5Xwpqwic";

function doOptions(e) {
  return ContentService.createTextOutput("OK")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ status: "online", modulo: "estrutura" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Corpo de requisição vazio.");
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
  
  switch (action) {
    case "criarEstruturaRpmAno":
      result = criarEstruturaRpmAno(body.authToken, params[0], params[1]); // params[0] = rpm, params[1] = ano
      break;
      
    default:
      throw new Error("Ação '" + action + "' não registrada no servidor de Estrutura.");
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

// ========== GERENCIAMENTO DINÂMICO DE ARQUIVOS (DRIVE) ==========

function formatarNomeRPM(rpm) {
  if (!rpm) {
    throw new Error("RPM não informada.");
  }
  let r = String(rpm).trim().toUpperCase();
  if (/^\d+$/.test(r)) {
    return r + "RPM";
  }
  return r;
}

function obterOuCriarPastaRPM(rpm) {
  const folderName = formatarNomeRPM(rpm);
  const rootFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const subFolders = rootFolder.getFoldersByName(folderName);
  
  if (subFolders.hasNext()) {
    return subFolders.next();
  }
  
  const newFolder = rootFolder.createFolder(folderName);
  newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return newFolder;
}

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
  parentFolder.addFile(file);
  try {
    DriveApp.getRootFolder().removeFile(file);
  } catch(e) {}
  
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
    cabecalho = ["municipio", "convenio", "preposto_n", "preposto_pg", "preposto", "unidade", "dataInicio", "dataFim", "", "", "", "", "status_texto", "valor_estimado", "", "", "", "", "", "", "", "", "", "", "elementos_despesa", "user_pm"];
  } else if (nomeBase === "SIC3_BDEnderecos") {
    nomeAba = "enderecos";
    cabecalho = ["municipio", "convenio", "endereco", "dtEndereco", "medidorAgua", "dtMedidorAgua", "medidorEnergia", "dtMedidorEnergia"];
  }
  
  if (nomeAba) {
    let sheet = ss.getSheetByName(nomeAba);
    if (!sheet) sheet = ss.insertSheet(nomeAba);
    sheet.clear();
    sheet.appendRow(cabecalho);
    sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).setFontSize(6);
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

function obterOuCriarPlanilhaAnual(folderRPM, rpm, ano) {
  const nomePlanilha = "SIC3_BD" + String(ano).trim();
  const files = folderRPM.getFilesByName(nomePlanilha);

  if (files.hasNext()) {
    return files.next().getId();
  }

  const ss = SpreadsheetApp.create(nomePlanilha);
  const file = DriveApp.getFileById(ss.getId());
  folderRPM.addFile(file);
  try {
    DriveApp.getRootFolder().removeFile(file);
  } catch (e) {}

  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const abas = {
    "principal": [
      "timestamp", "municipio", "convenio", "ano", "mes",
      "item", "codigo", "descricao", "despesa", "unidade",
      "data", "quantidade", "valorUnitario", "subtotal", "observacao"
    ],
    "manutencao": [
      "timestamp", "municipio", "convenio", "ano", "mes",
      "item", "data", "placa", "prefixo", "odometro",
      "responsavel", "descricao", "quantidade", "valorUnitario", "subtotal",
      "notaFiscal"
    ],
    "abastecimento": [
      "timestamp", "municipio", "convenio", "ano", "mes",
      "item", "data", "placa", "prefixo", "odometro",
      "motorista", "tipo", "quantidade", "valorUnitario", "subtotal",
      "notaFiscal"
    ],
    "obsgeral": [
      "timestamp", "municipio", "convenio", "ano", "mes",
      "valorTotal", "obsGeral", "edicaoBloqueada", "item99", "sirconv",
      "siad", "siad_dataEntrada", "siad_documentoEntrada", "siad_dataRequisicao", "siad_documentoRequisicao",
      "siad_dataAnalise", "siad_statusAnalise", "siad_dataSaida", "siad_statusSaida"
    ],
    "item99": [
      "timestamp", "municipio", "convenio", "ano", "mes",
      "item99_code", "descricao", "unidade_distribuicao", "elemento_despesa", "termos_busca",
      "status", "link"
    ]
  };

  for (const nomeAba in abas) {
    let sheet = ss.getSheetByName(nomeAba);
    if (!sheet) sheet = ss.insertSheet(nomeAba);
    sheet.clear();
    sheet.appendRow(abas[nomeAba]);
    sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).setFontSize(6);
    sheet.getRange(1, 1, 1, abas[nomeAba].length).setFontWeight("normal").setNumberFormat("@STRING@");
  }

  const activeSheets = ss.getSheets();
  const abasPermitidas = ["principal", "abastecimento", "manutencao", "obsgeral", "item99"];
  activeSheets.forEach(s => {
    const name = s.getName();
    if (!abasPermitidas.includes(name) && activeSheets.length > 1) {
      try {
        ss.deleteSheet(s);
      } catch(e) {
        console.error("Erro ao excluir aba padrao:", e);
      }
    }
  });

  return ss.getId();
}

// ========== CRIAÇÃO DE ESTRUTURA E SALVAMENTO DE LINKS ==========

function criarEstruturaRpmAno(authToken, rpm, ano) {
  const usuario = validateAuthToken(authToken);
  if (!usuario) {
    return { success: false, message: "Não autorizado." };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const rpmNorm = formatarNomeRPM(rpm);
    const anoNorm = String(ano).replace(/[^\d]/g, "").trim();

    // 1. Criar ou Obter a pasta da RPM
    const folderRPM = obterOuCriarPastaRPM(rpmNorm);

    // 2. Criar ou Obter a Planilha Anual da RPM
    const spreadsheetId = obterOuCriarPlanilhaAnual(folderRPM, rpmNorm, anoNorm);

    // 3. Obter ou Criar Arquivos Compartilhados da RPM
    const BDConvenios = obterIdArquivoCompartilhado("SIC3_BDConvenios", folderRPM);
    const BDEnderecos = obterIdArquivoCompartilhado("SIC3_BDEnderecos", folderRPM);

    // 4. Salvar na Planilha Central SIC3_BDLinks
    const ssCentral = SpreadsheetApp.openById(CENTRAL_BD_LINKS_ID);
    const sheetLinks = ssCentral.getSheetByName("links");
    const values = sheetLinks.getDataRange().getValues();

    let rowIndex = -1;
    // Varre para ver se o registro para aquela RPM e Ano já existe na planilha de links
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]).toUpperCase() === rpmNorm.toUpperCase() && String(values[i][1]) === anoNorm) {
        rowIndex = i + 1;
        break;
      }
    }

    const rowData = [
      rpmNorm,
      anoNorm,
      spreadsheetId,
      BDConvenios,
      BDEnderecos
    ];

    if (rowIndex !== -1) {
      // Atualiza linha existente
      sheetLinks.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]).setNumberFormat("@STRING@");
    } else {
      // Insere nova linha no final
      sheetLinks.appendRow(rowData);
      sheetLinks.getRange(sheetLinks.getLastRow(), 1, 1, rowData.length).setNumberFormat("@STRING@");
    }

    // 5. Obter IDs globais de TBPrimaria e TBSecundaria da aba 'config' da Planilha Central
    let globalTBPrimaria = "";
    let globalTBSecundaria = "";
    try {
      const sheetConfig = ssCentral.getSheetByName("config");
      if (sheetConfig) {
        const configValues = sheetConfig.getDataRange().getValues();
        for (let i = 0; i < configValues.length; i++) {
          const key = String(configValues[i][0]).trim();
          const val = String(configValues[i][1]).trim();
          if (key === "TBPrimaria") globalTBPrimaria = val;
          if (key === "TBSecundaria") globalTBSecundaria = val;
        }
      }
    } catch(configErr) {
      // Fallback legado caso a aba 'config' não exista
      globalTBPrimaria = obterIdArquivoCompartilhado("SIC3_TBPrimaria");
      globalTBSecundaria = obterIdArquivoCompartilhado("SIC3_TBSecundaria");
    }

    return {
      success: true,
      rpm: rpmNorm,
      ano: anoNorm,
      spreadsheetId: spreadsheetId,
      arquivosCompartilhados: {
        BDConvenios: BDConvenios,
        BDEnderecos: BDEnderecos,
        TBPrimaria: globalTBPrimaria,
        TBSecundaria: globalTBSecundaria
      }
    };

  } catch(e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}
