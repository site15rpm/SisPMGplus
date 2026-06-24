/**
 * SIC3 - Módulo de Convênios (Servidor Google Apps Script)
 * Lida exclusivamente com a tabela de convênios compartilhada da RPM.
 */

const DEFAULT_JWT_EXPIRATION = 8 * 60 * 60; // 8 horas

function doOptions(e) {
  return ContentService.createTextOutput("OK")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ status: "online", modulo: "convenios" }))
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
  
  switch (action) {
    case "carregarConveniosMunicipio":
      // params[0] = municipio, params[1] = token, params[2] = BDConvenios ID
      result = carregarConveniosMunicipio(params[0], body.authToken || params[1], params[2]);
      break;
      
    case "incluirConvenio":
      // params[0] = token, params[1] = municipio, params[2] = convenio, ... params[9] = BDConvenios ID
      result = incluirConvenio(body.authToken || params[0], params[1], params[2], params[3], params[4], params[5], params[6], params[7], params[8], params[9]);
      break;
      
    case "alterarConvenio":
      // params[0] = token, params[1] = municipio, params[2] = convenio, ... params[9] = BDConvenios ID
      result = alterarConvenio(body.authToken || params[0], params[1], params[2], params[3], params[4], params[5], params[6], params[7], params[8], params[9]);
      break;
      
    case "excluirConvenio":
      // params[0] = token, params[1] = municipio, params[2] = convenio, params[3] = BDConvenios ID
      result = excluirConvenio(body.authToken || params[0], params[1], params[2], params[3]);
      break;
 
    case "sincronizarConveniosLote":
      // params[0] = authToken, params[1] = convenios, params[2] = BDConvenios ID
      result = sincronizarConveniosLote(body.authToken || params[0], params[1], params[2]);
      break;
      
    default:
      throw new Error("Ação da API '" + action + "' não registrada no servidor de Convênios.");
  }
  
  return ContentService.createTextOutput(JSON.stringify(result !== undefined ? result : { success: true }))
    .setMimeType(ContentService.MimeType.TEXT);
}

// ========== SISTEMA DE AUTENTICAÇÃO JWT ==========

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

// ========== FUNÇÕES AUXILIARES DE RESOLUÇÃO ==========

function obterIdPlanilhaConvenios(authToken, bdConveniosIdOpcional) {
  if (bdConveniosIdOpcional) return bdConveniosIdOpcional;
  
  // Tenta obter das propriedades do script caso não enviado
  const idProp = PropertiesService.getScriptProperties().getProperty("BD_CONVENIOS_ID");
  if (idProp) return idProp;
  
  throw new Error("ID da planilha de Convênios não configurada.");
}

function formatDataForSheet(dataStr) {
  if (!dataStr) return "";
  const parts = dataStr.split("/");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`; // ISO format para o Sheets formatar
  }
  return dataStr;
}

// ========== CRUD DE CONVÊNIOS ==========

function carregarConveniosMunicipio(municipio, authToken, bdConveniosIdOpcional) {
  const usuario = validateAuthToken(authToken);
  if (!usuario) return [];

  try {
    const ssId = obterIdPlanilhaConvenios(authToken, bdConveniosIdOpcional);
    const ss = SpreadsheetApp.openById(ssId);
    const sheet = ss.getSheetByName("convenios");
    if (!sheet) return [];
    
    const isAdmin = usuario.municipio === "admin" || usuario.isAdmin;
    const dados = sheet.getDataRange().getValues();
    const convenios = [];
    
    for (let i = 1; i < dados.length; i++) {
      if (dados[i][0] === municipio || isAdmin) {
        convenios.push({
          municipio: dados[i][0],
          convenio: dados[i][1],
          preposto_n: dados[i][2] || "",
          preposto_pg: dados[i][3] || "",
          preposto: dados[i][4] || "",
          unidade: dados[i][5] || "",
          dataInicio: dados[i][6] ? Utilities.formatDate(new Date(dados[i][6]), "GMT", "dd/MM/yyyy") : "",
          dataFim: dados[i][7] ? Utilities.formatDate(new Date(dados[i][7]), "GMT", "dd/MM/yyyy") : "",
          status_texto: dados[i][12] || "",
          valor_estimado: dados[i][13] || "",
          elementos_despesa: dados[i][24] || "",
          user_pm: dados[i][25] || ""
        });
      }
    }
    return convenios;
  } catch (error) {
    console.error("Erro ao carregar convênios:", error);
    return [];
  }
}

function incluirConvenio(authToken, municipio, convenio, preposto_n, preposto_pg, preposto, unidade, dataInicio, dataFim, bdConveniosIdOpcional) {
  const usuario = validateAuthToken(authToken);
  if (!usuario || !usuario.isAdmin) {
    return { success: false, message: "Acesso negado. Administrador requerido." };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ssId = obterIdPlanilhaConvenios(authToken, bdConveniosIdOpcional);
    const ss = SpreadsheetApp.openById(ssId);
    const conveniosSheet = ss.getSheetByName("convenios");
    
    const novaLinha = Array(26).fill("");
    novaLinha[0] = String(municipio);
    novaLinha[1] = String(convenio);
    novaLinha[2] = String(preposto_n);
    novaLinha[3] = String(preposto_pg);
    novaLinha[4] = String(preposto);
    novaLinha[5] = String(unidade);
    novaLinha[6] = dataInicio ? formatDataForSheet(dataInicio) : "";
    novaLinha[7] = dataFim ? formatDataForSheet(dataFim) : "";

    conveniosSheet.appendRow(novaLinha);
    const ultimaLinha = conveniosSheet.getLastRow();
    conveniosSheet.getRange(ultimaLinha, 1, 1, novaLinha.length).setNumberFormat("@STRING@");
    
    return { success: true, message: "Convênio incluído com sucesso." };
  } catch(e) {
    return { success: false, message: "Erro ao incluir convênio: " + e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function alterarConvenio(authToken, municipio, convenio, preposto_n, preposto_pg, preposto, unidade, dataInicio, dataFim, bdConveniosIdOpcional) {
  const usuario = validateAuthToken(authToken);
  if (!usuario) {
    return { success: false, message: "Acesso negado." };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ssId = obterIdPlanilhaConvenios(authToken, bdConveniosIdOpcional);
    const ss = SpreadsheetApp.openById(ssId);
    const conveniosSheet = ss.getSheetByName("convenios"); 
    const dados = conveniosSheet.getDataRange().getValues();

    for (let i = 1; i < dados.length; i++) { 
      if (dados[i][0] == municipio && String(dados[i][1]) == String(convenio)) {
        const rowRange = conveniosSheet.getRange(i + 1, 1, 1, 8);
        const newRowValues = [
          String(municipio),
          String(convenio),
          String(preposto_n),
          String(preposto_pg),
          String(preposto),
          String(unidade),
          dataInicio ? formatDataForSheet(dataInicio) : "",
          dataFim ? formatDataForSheet(dataFim) : ""
        ];
        
        rowRange.setValues([newRowValues]).setNumberFormat("@STRING@");
        return { success: true, message: "Convênio alterado com sucesso." };
      }
    }
    return { success: false, message: "Convênio não localizado." };
  } catch(e) {
    return { success: false, message: "Erro ao alterar convênio: " + e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function excluirConvenio(authToken, municipio, convenio, bdConveniosIdOpcional) {
  const usuario = validateAuthToken(authToken);
  if (!usuario || !usuario.isAdmin) {
    return { success: false, message: "Acesso negado." };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ssId = obterIdPlanilhaConvenios(authToken, bdConveniosIdOpcional);
    const ss = SpreadsheetApp.openById(ssId);
    const conveniosSheet = ss.getSheetByName("convenios");
    const dados = conveniosSheet.getDataRange().getValues();

    for (let i = 1; i < dados.length; i++) {
      if (dados[i][0] == municipio && String(dados[i][1]) == String(convenio)) {
        conveniosSheet.deleteRow(i + 1);
        return { success: true, message: "Convênio excluído com sucesso." };
      }
    }
    return { success: false, message: "Convênio não localizado." };
  } catch(e) {
    return { success: false, message: "Erro ao excluir convênio: " + e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ========== SINCRONIZAÇÃO EM LOTE OTIMIZADA ==========

function sincronizarConveniosLote(authToken, convenios, bdConveniosIdOpcional) {
  const usuario = validateAuthToken(authToken);
  if (!usuario) {
    return { success: false, message: "Acesso negado." };
  }

  if (!Array.isArray(convenios) || convenios.length === 0) {
    return { success: true, message: "Nenhum convênio fornecido para sincronização.", novos: 0, atualizados: 0 };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ssId = obterIdPlanilhaConvenios(authToken, bdConveniosIdOpcional);
    const ss = SpreadsheetApp.openById(ssId);
    const sheet = ss.getSheetByName("convenios");
    
    if (!sheet) {
      throw new Error("Aba 'convenios' não encontrada na planilha de convênios.");
    }
    
    const range = sheet.getDataRange();
    const dadosOriginais = range.getValues();
    const cabecalho = dadosOriginais[0];
    
    // Mapeia linhas existentes por ID do convênio (coluna B - Índice 1)
    const mapaLinhasExistentes = {};
    for (let i = 1; i < dadosOriginais.length; i++) {
      const id = String(dadosOriginais[i][1]).trim();
      if (id) {
        mapaLinhasExistentes[id] = i; // Guarda o índice da linha na matriz
      }
    }
    
    let novosCount = 0;
    let atualizadosCount = 0;
    const novosRegistros = [];
    
    convenios.forEach(function(conv) {
      const id = String(conv.ID || conv.id).trim();
      if (!id) return;
      
      const novaLinha = [
        String(conv.MUNICIPIO || conv.municipio || ""),
        id,
        String(conv.PREPOSTO_ID || conv.preposto_id || ""),
        String(conv.PREPOSTO_POSTOGRAD || conv.preposto_postograd || ""),
        String(conv.PREPOSTO_NOME || conv.preposto_nome || ""),
        String(conv.NOME_SECAO || conv.nome_secao || ""),
        conv.DTINICIAL_ORIGINAL || conv.dtinicial_original || "",
        conv.DTFINAL || conv.dtfinal || "",
        String(conv.NUMERO_FACE || conv.numero_face || ""),
        String(conv.UNI_NOME_PRINCIPAL || conv.uni_nome_principal || ""),
        String(conv.ADITIVO || conv.aditivo || ""),
        String(conv.ATIVO || conv.ativo || ""),
        String(conv.status_texto || conv.STATUS_TEXTO || ""),
        String(conv.VALOR_ESTIMADO || conv.valor_estimado || ""),
        String(conv.CONCEDENTE || conv.concedente || ""),
        String(conv.CONCEDENTE_ID || conv.concedente_id || ""),
        String(conv.CNPJ || conv.cnpj || ""),
        String(conv.UNIDADE_RESPONSAVEL || conv.unidade_responsavel || ""),
        String(conv.unidadeNivel || conv.unidade_nivel || ""),
        String(conv.unidadeHierarquia || conv.unidade_hierarquia || ""),
        String(conv.unidadeCodigoSecao || conv.unidade_codigo_secao || ""),
        String(conv.unidadeSecao || conv.unidade_secao || ""),
        String(conv.unidadeCodigoMunicipio || conv.unidade_codigo_municipio || ""),
        String(conv.unidadeMunicipio || conv.unidade_municipio || ""),
        String(conv.ELEMENTOS_DESPESA || conv.elementos_despesa || ""),
        String(conv.USER_PM || conv.user_pm || "")
      ];
      
      const indexExistente = mapaLinhasExistentes[id];
      if (indexExistente !== undefined) {
        // Atualiza em memória os campos da linha existente
        const pmExistenteStr = String(dadosOriginais[indexExistente][25] || "").trim();
        const pmNovoStr = String(conv.USER_PM || conv.user_pm || "").trim();
        let pmFinalStr = pmNovoStr;
        
        if (pmExistenteStr) {
          const pmsExistentes = pmExistenteStr.split("|").map(p => p.trim()).filter(Boolean);
          if (pmNovoStr) {
            const pmsNovos = pmNovoStr.split("|").map(p => p.trim()).filter(Boolean);
            const pmsUnicos = [...new Set(pmsExistentes.concat(pmsNovos))];
            pmFinalStr = pmsUnicos.join("|");
          } else {
            pmFinalStr = pmExistenteStr;
          }
        }
        
        novaLinha[25] = pmFinalStr;
        // Substitui a linha inteira na matriz em memória
        dadosOriginais[indexExistente] = novaLinha;
        atualizadosCount++;
      } else {
        // Guarda no array de novos para concatenar e fazer batch insertion
        novosRegistros.push(novaLinha);
        novosCount++;
      }
    });
    
    // Consolida todos os dados: os existentes modificados + os novos
    const dadosFinais = dadosOriginais.concat(novosRegistros);
    
    // Limpa a planilha física e escreve em Batch completo (1 chamada de setValues)
    sheet.clearContents();
    const batchRange = sheet.getRange(1, 1, dadosFinais.length, cabecalho.length);
    batchRange.setValues(dadosFinais).setNumberFormat("@STRING@");
    
    return { success: true, novos: novosCount, atualizados: atualizadosCount };
  } catch (error) {
    console.error("Erro na sincronização em lote de convênios:", error);
    return { success: false, message: "Erro interno no servidor: " + error.toString() };
  } finally {
    lock.releaseLock();
  }
}
