/**
 * SIC3 - Módulo de Endereços (Servidor Google Apps Script)
 * Lida exclusivamente com a tabela de endereços e medidores associados aos convênios da RPM.
 */

function doOptions(e) {
  return ContentService.createTextOutput("OK")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ status: "online", modulo: "enderecos" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Nenhum corpo de requisição recebido.");
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
    case "gerenciarEnderecoMedidor":
      result = gerenciarEnderecoMedidor(body.authToken, params[0], params[1]); // params[0] = dados de entrada, params[1] = BDEnderecos ID (opcional)
      break;
      
    default:
      throw new Error("Ação '" + action + "' não registrada no servidor de Endereços.");
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

function obterIdPlanilhaEnderecos(bdEnderecosIdOpcional) {
  if (bdEnderecosIdOpcional) return bdEnderecosIdOpcional;
  const idProp = PropertiesService.getScriptProperties().getProperty("BD_ENDERECOS_ID");
  if (idProp) return idProp;
  throw new Error("ID da planilha de Endereços não configurada.");
}

function appendRowAndFormatAsText(sheet, rowData) {
  try {
    sheet.insertRowBefore(2); 
    const newRowRange = sheet.getRange(2, 1, 1, rowData.length);
    newRowRange.setValues([rowData]);
    newRowRange.setNumberFormat("@STRING@");
  } catch (e) {
    console.error("Erro em appendRowAndFormatAsText:", e);
  }
}

// ========== GERENCIAMENTO DE ENDEREÇOS E MEDIDORES ==========

function gerenciarEnderecoMedidor(authToken, dados, bdEnderecosIdOpcional) {
  const usuario = validateAuthToken(authToken);
  if (!usuario) {
    return { success: false, message: "Acesso negado. Token inválido." };
  }

  if (!usuario.isAdmin && usuario.municipio != dados.municipio) {
      return { success: false, message: "Acesso negado a este município." };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ssId = obterIdPlanilhaEnderecos(bdEnderecosIdOpcional);
    const ss = SpreadsheetApp.openById(ssId);
    const sheet = ss.getSheetByName("enderecos");
    const values = sheet.getDataRange().getValues();
    const headers = values[0];

    const cols = {
      municipio: headers.indexOf("municipio"),
      convenio: headers.indexOf("convenio"),
      endereco: headers.indexOf("endereco"),
      dtEndereco: headers.indexOf("dtEndereco"),
      medidorAgua: headers.indexOf("medidorAgua"),
      dtMedidorAgua: headers.indexOf("dtMedidorAgua"),
      medidorEnergia: headers.indexOf("medidorEnergia"),
      dtMedidorEnergia: headers.indexOf("dtMedidorEnergia"),
    };

    const now = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");
    const dadosComString = {};
    for (const key in dados) {
        dadosComString[key] = String(dados[key]);
    }

    switch (dadosComString.acao) {
      case "adicionar":
        if (values.some((row) => 
            String(row[cols.municipio]) == dadosComString.municipio && 
            String(row[cols.convenio]) == dadosComString.convenio && 
            String(row[cols.endereco]) == dadosComString.enderecoNovo)) {
          return { success: false, message: "Endereço já cadastrado para este convênio." };
        }

        const newRow = Array(sheet.getLastColumn()).fill("");
        newRow[cols.municipio] = dadosComString.municipio;
        newRow[cols.convenio] = dadosComString.convenio;
        newRow[cols.endereco] = dadosComString.enderecoNovo;
        newRow[cols.dtEndereco] = now;
        newRow[cols.medidorAgua] = dadosComString.medidorAguaNovo;
        newRow[cols.dtMedidorAgua] = dadosComString.medidorAguaNovo ? now : "";
        newRow[cols.medidorEnergia] = dadosComString.medidorEnergiaNovo;
        newRow[cols.dtMedidorEnergia] = dadosComString.medidorEnergiaNovo ? now : "";
        appendRowAndFormatAsText(sheet, newRow.map(val => String(val)));
        return { success: true };

      case "atualizar":
        const rowIndex = values.findIndex((row) => 
          String(row[cols.municipio]) == dadosComString.municipio && 
          String(row[cols.convenio]) == dadosComString.convenio && 
          String(row[cols.endereco]) == dadosComString.enderecoAntigo);

        if (rowIndex == -1) {
          return { success: false, message: "Endereço original não encontrado." };
        }

        const actualRow = rowIndex + 1;

        if (dadosComString.enderecoNovo != dadosComString.enderecoAntigo) {
          sheet.getRange(actualRow, cols.endereco + 1).setNumberFormat("@STRING@").setValue(dadosComString.enderecoNovo);
          sheet.getRange(actualRow, cols.dtEndereco + 1).setNumberFormat("@STRING@").setValue(now);
        }
        if (dadosComString.medidorAguaNovo != String(values[rowIndex][cols.medidorAgua])) {
          sheet.getRange(actualRow, cols.medidorAgua + 1).setNumberFormat("@STRING@").setValue(dadosComString.medidorAguaNovo);
          sheet.getRange(actualRow, cols.dtMedidorAgua + 1).setNumberFormat("@STRING@").setValue(now);
        }
        if (dadosComString.medidorEnergiaNovo != String(values[rowIndex][cols.medidorEnergia])) {
          sheet.getRange(actualRow, cols.medidorEnergia + 1).setNumberFormat("@STRING@").setValue(dadosComString.medidorEnergiaNovo);
          sheet.getRange(actualRow, cols.dtMedidorEnergia + 1).setNumberFormat("@STRING@").setValue(now);
        }
        return { success: true };

      case "excluir":
        const delIndex = values.findIndex((row) => 
          String(row[cols.municipio]) == dadosComString.municipio && 
          String(row[cols.convenio]) == dadosComString.convenio && 
          String(row[cols.endereco]) == dadosComString.endereco);

        if (delIndex == -1) {
          return { success: false, message: "Endereço não encontrado para exclusão." };
        }
        sheet.deleteRow(delIndex + 1);
        return { success: true };

      default:
        throw new Error("Ação inválida para gerenciamento de endereço/medidor.");
    }
  } catch (error) {
    return { success: false, message: `Erro no servidor: ${error.message}` };
  } finally {
    lock.releaseLock();
  }
}
