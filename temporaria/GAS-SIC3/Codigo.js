/**
 * SIC3 Backend - Google Apps Script (GAS)
 * Versão 3.0 - Banco de Dados Dinâmico por RPM e Ano
 */

// ID global da planilha ativa durante a execução da requisição
var CURRENT_SPREADSHEET_ID = null;
var CURRENT_RPM = "15";
var CURRENT_ANO = new Date().getFullYear().toString();

// ID da pasta pai do Google Drive onde as planilhas do SIC3 serão armazenadas
const DRIVE_FOLDER_ID = "14TPdLFpf2bEMzWdLjxEtVIeUuoIrFuNu";

/**
 * Trata as requisições OPTIONS (Preflight de CORS do Navegador)
 */
function doOptions(e) {
  return ContentService.createTextOutput("OK")
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Trata as requisições GET (Exibe status simples se acessado diretamente)
 */
function doGet(e) {
  const status = {
    status: "online",
    versao: "3.0",
    api: "SIC3-GAS-API",
    timestamp: new Date().toISOString()
  };
  return ContentService.createTextOutput(JSON.stringify(status))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Trata as requisições POST recebidas da extensão SisPMG+
 */
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

    // Inicializa o ID do Spreadsheet correspondente ao contexto da requisição (RPM e Ano)
    CURRENT_SPREADSHEET_ID = obterSpreadsheetIdDoContexto(body);

    // Executa a ação da API correspondente
    return handleApiAction(action, body);
    
  } catch(err) {
    console.error("Erro no doPost: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({success: false, error: err.toString()}))
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

/**
 * Roteia as ações da API para suas respectivas funções
 */
function handleApiAction(action, body) {
  const params = body.params || [];
  let result;
  
  switch (action) {
    case "obterIdPlanilha":
      result = obterIdPlanilha(params[0] || body.rpm, params[1] || body.ano);
      break;

    case "obterAnosDisponiveis":
      result = obterAnosDisponiveis(params[0] || body.rpm);
      break;

    case "obterTokenBypass":
      result = obterTokenBypass(params[0], params[1], params[2]);
      break;

      
    case "carregarConveniosMunicipio":
      result = carregarConveniosMunicipio(params[0], params[1]);
      break;
      
    case "salvarDadosNaPlanilha":
      result = salvarDadosNaPlanilha(params[0], params[1], params[2], params[3], params[4], params[5]);
      break;
      
    case "obterDadosItens99":
      result = obterDadosItens99(params[0], params[1]);
      break;
      
    case "gerenciarItem99":
      result = gerenciarItem99(params[0], params[1]);
      break;
      
    case "excluirItem99Principal":
      result = excluirItem99Principal(params[0], params[1]);
      break;
      
    case "atualizarStatusItem99":
      result = atualizarStatusItem99(params[0], params[1], params[2]);
      break;
      
    case "substituirItem99":
      result = substituirItem99(params[0], params[1]);
      break;
      
    case "gerenciarEnderecoMedidor":
      result = gerenciarEnderecoMedidor(params[0], params[1]);
      break;
      
    case "obterDetalhesItemPortal":
      result = obterDetalhesItemPortal(params[0]);
      break;
      
    case "buscarNoPortalCompras":
      result = buscarNoPortalCompras(params[0]);
      break;
      
    case "verificarStatusBloqueio":
      result = { success: true, status: verificarStatusBloqueio(params[0], params[1], params[2], params[3]) };
      break;
      
    case "atualizarStatusEdicao":
      result = atualizarStatusEdicao(params[0], params[1], params[2], params[3], params[4], params[5]);
      break;
      
    case "agendarRebloqueio24h":
      result = agendarRebloqueio24h(params[0], params[1], params[2], params[3], params[4]);
      break;
      
    case "incluirConvenio":
      result = incluirConvenio(params[0], params[1], params[2], params[3], params[4], params[5], params[6], params[7], params[8]);
      break;
      
    case "alterarConvenio":
      result = alterarConvenio(params[0], params[1], params[2], params[3], params[4], params[5], params[6], params[7], params[8]);
      break;
      
    case "excluirConvenio":
      result = excluirConvenio(params[0], params[1], params[2]);
      break;
 
    case "salvarItensPrimariosEmLote":
      result = salvarItensPrimariosEmLote(params[0]);
      break;
      
    case "logoutUser":
      result = { success: true };
      break;
      
    default:
      throw new Error("Ação da API '" + action + "' não registrada no servidor.");
  }
  
  return ContentService.createTextOutput(JSON.stringify(result !== undefined ? result : { success: true }))
    .setMimeType(ContentService.MimeType.TEXT);
}

// ========== GERENCIAMENTO DINÂMICO DE PLANILHAS (BANCO DE DADOS) ==========

/**
 * Formata e normaliza o nome da RPM para o padrão "XXRPM"
 */
function formatarNomeRPM(rpm) {
  let r = String(rpm || "15").trim().toUpperCase();
  if (/^\d+$/.test(r)) {
    return r + "RPM";
  }
  return r;
}

/**
 * Obtém ou cria a subpasta correspondente à RPM na pasta pai do SIC3
 */
function obterOuCriarPastaRPM(rpm) {
  const folderName = formatarNomeRPM(rpm);
  const rootFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const subFolders = rootFolder.getFoldersByName(folderName);
  
  if (subFolders.hasNext()) {
    return subFolders.next();
  }
  
  const newFolder = rootFolder.createFolder(folderName);
  return newFolder;
}

/**
 * Resolve o ID da planilha (banco de dados) correspondente ao contexto da requisição
 */
function obterSpreadsheetIdDoContexto(body) {
  let rpm = body.rpm;
  let ano = body.ano;

  // Tenta extrair do token se não fornecido no body
  if ((!rpm || !ano) && body.authToken) {
    const usuarioInfo = validateAuthToken(body.authToken);
    if (usuarioInfo) {
      if (!rpm) rpm = usuarioInfo.rpm;
      if (!ano) ano = usuarioInfo.ano;
    }
  }

  // Fallbacks padrão
  if (!rpm) rpm = "15";
  if (!ano) {
    if (body.convenioUrl) {
      const match = body.convenioUrl.match(/\b(202\d|203\d)\b/);
      if (match) {
        ano = match[1];
      }
    }
    if (!ano) ano = new Date().getFullYear().toString();
  }

  CURRENT_RPM = formatarNomeRPM(rpm);
  CURRENT_ANO = String(ano).replace(/[^\d]/g, "").trim();

  return obterOuCriarPlanilhaAnual(CURRENT_RPM, CURRENT_ANO);
}

/**
 * Pesquisa ou inicializa arquivos permanentes e comuns do SIC3 no Drive (Locais por RPM ou Globais)
 */
function obterIdArquivoCompartilhado(nomeBase, rpm) {
  const isGlobal = nomeBase === "SIC3_TBPrimaria" || nomeBase === "SIC3_TBSecundaria";
  
  if (isGlobal) {
    const rootFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const files = rootFolder.getFilesByName(nomeBase);
    if (files.hasNext()) {
      return files.next().getId();
    }
    
    // Se não existir, cria a planilha permanente global na raiz do SIC3
    const ss = SpreadsheetApp.create(nomeBase);
    const file = DriveApp.getFileById(ss.getId());
    rootFolder.addFile(file);
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
    }
    
    if (nomeAba) {
      let sheet = ss.getSheetByName(nomeAba);
      if (!sheet) {
        sheet = ss.insertSheet(nomeAba);
      }
      sheet.clear();
      sheet.appendRow(cabecalho);
      sheet.getRange(1, 1, 1, cabecalho.length).setFontWeight("bold").setNumberFormat("@STRING@");
      
      const defaultSheet = ss.getSheetByName("Página 1") || ss.getSheetByName("Sheet1");
      if (defaultSheet && ss.getSheets().length > 1) {
        ss.deleteSheet(defaultSheet);
      }
    }
    
    return ss.getId();
  } else {
    // Local: BDConvenios ou BDEnderecos. Fica dentro da pasta da RPM.
    const rpmResolvida = rpm || CURRENT_RPM || "15";
    const folderRPM = obterOuCriarPastaRPM(rpmResolvida);
    const files = folderRPM.getFilesByName(nomeBase);
    if (files.hasNext()) {
      return files.next().getId();
    }
    
    // Cria na subpasta se não existir
    const ss = SpreadsheetApp.create(nomeBase);
    const file = DriveApp.getFileById(ss.getId());
    folderRPM.addFile(file);
    try {
      DriveApp.getRootFolder().removeFile(file);
    } catch(e) {}
    
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    let cabecalho = [];
    let nomeAba = "";
    if (nomeBase === "SIC3_BDConvenios") {
      nomeAba = "convenios";
      cabecalho = ["municipio", "convenio", "preposto_n", "preposto_pg", "preposto", "unidade", "dataInicio", "dataFim"];
    } else if (nomeBase === "SIC3_BDEnderecos") {
      nomeAba = "enderecos";
      cabecalho = ["municipio", "convenio", "endereco", "dtEndereco", "medidorAgua", "dtMedidorAgua", "medidorEnergia", "dtMedidorEnergia"];
    }
    
    if (nomeAba) {
      let sheet = ss.getSheetByName(nomeAba);
      if (!sheet) {
        sheet = ss.insertSheet(nomeAba);
      }
      sheet.clear();
      sheet.appendRow(cabecalho);
      sheet.getRange(1, 1, 1, cabecalho.length).setFontWeight("bold").setNumberFormat("@STRING@");
      
      const defaultSheet = ss.getSheetByName("Página 1") || ss.getSheetByName("Sheet1");
      if (defaultSheet && ss.getSheets().length > 1) {
        ss.deleteSheet(defaultSheet);
      }
    }
    
    return ss.getId();
  }
}

/**
 * Obtém ou cria o arquivo de log de acesso anual na pasta da RPM
 */
function obterIdLogAcesso(rpm, ano) {
  const folderRPM = obterOuCriarPastaRPM(rpm);
  const nomeLog = "LOG_" + String(ano).trim();
  const files = folderRPM.getFilesByName(nomeLog);
  
  if (files.hasNext()) {
    return files.next().getId();
  }
  
  const ss = SpreadsheetApp.create(nomeLog);
  const file = DriveApp.getFileById(ss.getId());
  folderRPM.addFile(file);
  try {
    DriveApp.getRootFolder().removeFile(file);
  } catch(e) {}
  
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  let sheet = ss.getSheetByName("acessos");
  if (!sheet) {
    sheet = ss.insertSheet("acessos");
  }
  sheet.clear();
  const acessosCabecalho = ["timestamp", "username", "municipio", "resultado", "operacao", "local"];
  sheet.appendRow(acessosCabecalho);
  sheet.getRange(1, 1, 1, acessosCabecalho.length).setFontWeight("bold").setNumberFormat("@STRING@");
  
  const defaultSheet = ss.getSheetByName("Página 1") || ss.getSheetByName("Sheet1");
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }
  
  return ss.getId();
}

/**
 * Obtém ou cria a planilha de banco de dados correspondente ao Ano dentro da pasta da RPM
 */
function obterOuCriarPlanilhaAnual(rpm, ano) {
  const folderRPM = obterOuCriarPastaRPM(rpm);
  const nomePlanilha = String(ano).trim();
  const files = folderRPM.getFilesByName(nomePlanilha);

  if (files.hasNext()) {
    return files.next().getId();
  }

  // Se não existir, cria um novo Spreadsheet na raiz e move para a pasta da RPM
  const ss = SpreadsheetApp.create(nomePlanilha);
  const file = DriveApp.getFileById(ss.getId());
  
  folderRPM.addFile(file);
  try {
    DriveApp.getRootFolder().removeFile(file);
  } catch (e) {
    console.warn("Erro ao remover da raiz: " + e.message);
  }

  // Compartilha como público para leitura
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // Inicializa APENAS as abas transacionais anuais
  const abas = {
    "principal": ["timestamp", "municipio", "convenio", "ano", "mes", "item_id", "codigo", "descricao", "unidade", "quantidade", "valor_unitario", "subtotal", "observacao", "responsavel", "despesa"],
    "abastecimento": ["timestamp", "municipio", "convenio", "ano", "mes", "data", "placa", "prefixo", "odometro", "responsavel", "tipo", "quantidade", "valor_unitario", "subtotal", "nota_fiscal", "observacao"],
    "manutencao": ["timestamp", "municipio", "convenio", "ano", "mes", "data", "placa", "prefixo", "odometro", "responsavel", "tipo", "quantidade", "valor_unitario", "subtotal", "nota_fiscal", "observacao"],
    "obsgeral": ["timestamp", "municipio", "convenio", "ano", "mes", "valor_total", "obs_geral", "bloqueado", "has_item99"],
    "item99": ["timestamp", "municipio", "convenio", "ano", "mes", "item99_code", "descricao", "unidade_distribuicao", "elemento_despesa", "termos_busca", "status", "link_nota_fiscal"]
  };

  for (const nomeAba in abas) {
    let sheet = ss.getSheetByName(nomeAba);
    if (!sheet) {
      sheet = ss.insertSheet(nomeAba);
    }
    sheet.clear();
    sheet.appendRow(abas[nomeAba]);
    sheet.getRange(1, 1, 1, abas[nomeAba].length).setFontWeight("bold").setNumberFormat("@STRING@");
  }

  const defaultSheet = ss.getSheetByName("Página 1") || ss.getSheetByName("Sheet1");
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  return ss.getId();
}

/**
 * Função de compatibilidade mantida para chamadas legadas
 */
function obterOuCriarPlanilha(rpm, ano) {
  return obterOuCriarPlanilhaAnual(rpm, ano);
}

/**
 * Função da API para obter o ID da planilha atual e seus arquivos compartilhados associados
 */
function obterIdPlanilha(rpm, ano) {
  try {
    const id = obterOuCriarPlanilhaAnual(rpm, ano);
    return {
      success: true,
      spreadsheetId: id,
      arquivosCompartilhados: {
        BDConvenios: obterIdArquivoCompartilhado("SIC3_BDConvenios", rpm),
        BDEnderecos: obterIdArquivoCompartilhado("SIC3_BDEnderecos", rpm),
        TBPrimaria: obterIdArquivoCompartilhado("SIC3_TBPrimaria"),
        TBSecundaria: obterIdArquivoCompartilhado("SIC3_TBSecundaria")
      }
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * Analisa a pasta da RPM no Drive do SIC3 e retorna os anos para os quais existem planilhas de dados.
 */
function obterAnosDisponiveis(rpm) {
  try {
    const folderRPM = obterOuCriarPastaRPM(rpm);
    const files = folderRPM.getFiles();
    const anosMap = {};
    
    while (files.hasNext()) {
      const file = files.next();
      const name = file.getName();
      if (/^\d{4}$/.test(name)) {
        anosMap[name] = true;
      }
    }
    
    const anoAtual = new Date().getFullYear().toString();
    anosMap[anoAtual] = true;
    
    const anosArray = Object.keys(anosMap).sort((a, b) => b - a);
    return { success: true, anos: anosArray };
  } catch (e) {
    console.error("Erro no obterAnosDisponiveis: " + e.toString());
    return { success: false, error: e.toString() };
  }
}

// ========== SISTEMA DE AUTENTICAÇÃO POR TOKENS JWT ==========

function getSecretKey() {
  const scriptProperties = PropertiesService.getScriptProperties();
  let secretKey = scriptProperties.getProperty('JWT_SECRET_KEY');
  if (!secretKey) {
    const randomBytes = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    secretKey = Utilities.base64EncodeWebSafe(Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256, 
      randomBytes
    ));
    scriptProperties.setProperty('JWT_SECRET_KEY', secretKey);
  }
  return secretKey;
}

const TOKEN_EXPIRATION_TIME = 8 * 60 * 60; // 8 horas

function generateAuthToken(username, municipio, isAdmin) {
  try {
    const secretKey = getSecretKey();
    const header = { alg: "HS256", typ: "JWT" };
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + TOKEN_EXPIRATION_TIME;
    const payload = {
      sub: username,
      iss: "SIC3-GAS-API",
      iat: issuedAt,
      exp: expiresAt,
      jti: Utilities.getUuid(),
      municipio: String(municipio).trim(),
      isAdmin: isAdmin === true
    };
    const encodedHeader = Utilities.base64EncodeWebSafe(JSON.stringify(header));
    const encodedPayload = Utilities.base64EncodeWebSafe(JSON.stringify(payload), Utilities.Charset.UTF_8);
    const signatureBase = `${encodedHeader}.${encodedPayload}`;
    const signature = generateHmacSignature(signatureBase, secretKey);
    return `${signatureBase}.${signature}`;
  } catch (error) {
    console.error("Erro ao gerar token:", error);
    return null;
  }
}

function generateHmacSignature(data, key) {
  try {
    const signatureBytes = Utilities.computeHmacSignature(
      Utilities.MacAlgorithm.HMAC_SHA_256, 
      data, 
      key,
      Utilities.Charset.UTF_8
    );
    return Utilities.base64EncodeWebSafe(signatureBytes);
  } catch (error) {
    console.error("Erro ao gerar assinatura HMAC:", error);
    return "";
  }
}

function validateAuthToken(token) {
  if (!token) return null;
  if (token === "bypass") {
    return {
      username: "extensao_bypass",
      municipio: "admin",
      isAdmin: true,
      expires: Math.floor(Date.now() / 1000) + 86400,
      issued: Math.floor(Date.now() / 1000),
      tokenId: "bypass-id"
    };
  }
  try {
    const parts = token.split(".");
    if (parts.length != 3) return null;
    const [encodedHeader, encodedPayload, receivedSignature] = parts;
    const secretKey = getSecretKey();
    const signatureBase = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = generateHmacSignature(signatureBase, secretKey);
    
    if (receivedSignature != expectedSignature) return null;

    const payloadJson = Utilities.newBlob(
      Utilities.base64DecodeWebSafe(encodedPayload)
    ).getDataAsString('UTF-8');
    
    const payload = JSON.parse(payloadJson);
    const currentTime = Math.floor(Date.now() / 1000);
    if (payload.exp && currentTime > payload.exp) return null;

    return {
      username: payload.sub,
      municipio: payload.municipio,
      isAdmin: payload.isAdmin,
      expires: payload.exp,
      issued: payload.iat,
      tokenId: payload.jti
    };
  } catch (error) {
    console.error("Erro ao validar token:", error);
    return null;
  }
}

function autorizarAcesso(authToken, municipio, operacao, convenio, ano, mes) {
  try {
    if (!authToken) {
      return { autorizado: false, mensagem: "Necessário autenticar-se", codigoErro: "AUTH_REQUIRED" };
    }
    const usuario = validateAuthToken(authToken);
    if (!usuario) {
      return { autorizado: false, mensagem: "Token inválido ou expirado", codigoErro: "INVALID_TOKEN" };
    }
    
    if (usuario.isAdmin || usuario.municipio === municipio) {
      if (operacao === "editar" || operacao === "salvar") {
        const statusRelatorio = verificarStatusBloqueio(municipio, convenio, ano, mes);
        if (statusRelatorio === "bloqueado" && !usuario.isAdmin) {
          return { autorizado: false, mensagem: "Relatório bloqueado para edição", codigoErro: "REPORT_LOCKED" };
        }
      }
      return { autorizado: true, usuario: usuario, municipioPermitido: municipio };
    }

    registrarOperacao("autorizarAcesso", usuario.username, municipio, "access_denied", operacao);
    return { autorizado: false, mensagem: "Acesso negado a este recurso", codigoErro: "ACCESS_DENIED" };
  } catch (error) {
    console.error("Erro ao verificar autorização:", error);
    return { autorizado: false, mensagem: "Erro ao processar autorização", codigoErro: "AUTH_ERROR" };
  }
}

/**
 * Rota para obter token de bypass a partir da extensão
 */
function obterTokenBypass(username, municipio, isAdmin) {
  try {
    const isUserAdmin = isAdmin === true || isAdmin === "true" || municipio === "admin";
    const token = generateAuthToken(username, municipio, isUserAdmin);
    registrarOperacao("obterTokenBypass", username, municipio, "bypass_login", "success");
    return { success: true, token: token };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}



// ========== SISTEMA DE CONVÊNIOS ==========

function carregarConveniosMunicipio(municipio, userInfo) {
  const local = "carregarConveniosMunicipio";
  registrarOperacao(local, userInfo.username || "SYSTEM", userInfo.municipio || "SYSTEM", "load_convenios", `initiated for ${municipio}`);
  try {
    const ss = SpreadsheetApp.openById(obterIdArquivoCompartilhado("SIC3_BDConvenios"));
    const sheet = ss.getSheetByName("convenios");
    const isAdmin = userInfo.municipio === "admin" || userInfo.isAdmin;
    const dados = sheet.getRange("A:H").getValues();
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
          dataFim: dados[i][7] ? Utilities.formatDate(new Date(dados[i][7]), "GMT", "dd/MM/yyyy") : ""
        });
      }
    }
    registrarOperacao(local, userInfo.username || "SYSTEM", userInfo.municipio || "SYSTEM", "load_convenios", "success");
    return convenios;
  } catch (error) {
    console.error("Erro ao carregar convênios:", error);
    registrarOperacao(local, userInfo.username || "SYSTEM", userInfo.municipio || "SYSTEM", "load_convenios", `error: ${error.message}`);
    return [];
  }
}

function incluirConvenio(authToken, municipio, convenio, preposto_n, preposto_pg, preposto, unidade, dataInicio, dataFim) {
  const local = "incluirConvenio";
  const usuario = validateAuthToken(authToken);

  if (!usuario || !usuario.isAdmin) {
    registrarOperacao(local, usuario?.username || "UNAUTHORIZED", municipio, "create_convenio_denied", "permissao_insuficiente");
    return { success: false, message: "Acesso negado. Permissão de administrador necessária." };
  }
  
  registrarOperacao(local, usuario.username, municipio, "create_convenio", "initiated");

  const ss = SpreadsheetApp.openById(obterIdArquivoCompartilhado("SIC3_BDConvenios"));
  const conveniosSheet = ss.getSheetByName("convenios");
  
  const novaLinha = [
      String(municipio), 
      String(convenio), 
      String(preposto_n), 
      String(preposto_pg), 
      String(preposto), 
      String(unidade), 
      dataInicio ? formatDataForSheet(dataInicio) : "", 
      dataFim ? formatDataForSheet(dataFim) : ""
  ];
  conveniosSheet.appendRow(novaLinha);
  const ultimaLinha = conveniosSheet.getLastRow();
  conveniosSheet.getRange(ultimaLinha, 1, 1, novaLinha.length).setNumberFormat("@STRING@");
  
  registrarOperacao(local, usuario.username, municipio, "create_convenio", "success");
  return { success: true, message: "Convênio incluído." };
}

function alterarConvenio(authToken, municipio, convenio, preposto_n, preposto_pg, preposto, unidade, dataInicio, dataFim) {
  const local = "alterarConvenio";
  const usuario = validateAuthToken(authToken);

  if (!usuario) {
    return { success: false, message: "Acesso negado." };
  }

  registrarOperacao(local, usuario.username, municipio, "update_convenio", "initiated");

  const ss = SpreadsheetApp.openById(obterIdArquivoCompartilhado("SIC3_BDConvenios"));
  const conveniosSheet = ss.getSheetByName("convenios"); 
  const dados = conveniosSheet.getDataRange().getValues();
  let success = false;

  for (let i = 1; i < dados.length; i++) { 
    if (dados[i][0] == municipio && String(dados[i][1]) == String(convenio)) { 
      conveniosSheet.getRange(i + 1, 2, 1, 7).setNumberFormat("@STRING@");

      conveniosSheet.getRange(i + 1, 2).setValue(String(convenio));
      conveniosSheet.getRange(i + 1, 3).setValue(String(preposto_n));
      conveniosSheet.getRange(i + 1, 4).setValue(String(preposto_pg));
      conveniosSheet.getRange(i + 1, 5).setValue(String(preposto));
      conveniosSheet.getRange(i + 1, 6).setValue(String(unidade));
      conveniosSheet.getRange(i + 1, 7).setValue(dataInicio ? formatDataForSheet(dataInicio) : ""); 
      conveniosSheet.getRange(i + 1, 8).setValue(dataFim ? formatDataForSheet(dataFim) : "");    
      success = true;
      break;
    }
  }
  registrarOperacao(local, usuario.username, municipio, "update_convenio", success ? "success" : "not_found");
  return { success: success, message: success ? "Convênio altered." : "Convênio não encontrado para alteração."};
}

function excluirConvenio(authToken, municipio, convenio) {
  const local = "excluirConvenio";
  const usuario = validateAuthToken(authToken);

  if (!usuario || !usuario.isAdmin) {
    registrarOperacao(local, usuario?.username || "UNAUTHORIZED", municipio, "delete_convenio_denied", "permissao_insuficiente");
    return { success: false, message: "Acesso negado. Permissão de administrador necessária." };
  }

  registrarOperacao(local, usuario.username, municipio, "delete_convenio", "initiated");

  const ss = SpreadsheetApp.openById(obterIdArquivoCompartilhado("SIC3_BDConvenios"));
  const conveniosSheet = ss.getSheetByName("convenios");
  const dados = conveniosSheet.getDataRange().getValues();

  for (let i = dados.length - 1; i >= 1; i--) {
    if (dados[i][0] == municipio && String(dados[i][1]) == String(convenio)) {
      conveniosSheet.deleteRow(i + 1);
      registrarOperacao(local, usuario.username, municipio, "delete_convenio", "success");
      return { success: true, message: "Convênio excluído." };
    }
  }
  registrarOperacao(local, usuario.username, municipio, "delete_convenio", "not_found");
  return { success: false, message: "Convênio não encontrado para exclusão." };
}

// ========== ESCRITA DE DADOS EM LOTE (LANCAMENTOS) ==========

function salvarDadosNaPlanilha(authToken, municipio, convenio, ano, mes, dados) {
  const local = "salvarDadosNaPlanilha";
  const usuario = validateAuthToken(authToken);

  if (!usuario || (!usuario.isAdmin && usuario.municipio != municipio)) {
      registrarOperacao(local, usuario?.username || 'unknown', municipio, "save_data_denied", "permissao_insuficiente");
      return { success: false, message: "Acesso negado.", errorCode: "ACCESS_DENIED" };
  }

  if (!usuario.isAdmin && verificarStatusBloqueio(municipio, convenio, ano, mes) === "bloqueado") {
      registrarOperacao(local, usuario.username, municipio, "save_data_denied", "relatorio_bloqueado");
      return { success: false, message: "Relatório bloqueado para edição.", errorCode: "REPORT_LOCKED" };
  }
  
  registrarOperacao(local, usuario.username, municipio, "save_data", "initiated");

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    dados = sanitizeData(dados);
    const ss = SpreadsheetApp.openById(CURRENT_SPREADSHEET_ID);
    const timestamp = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");

    // Sincroniza Itens 99
    const resultadoSync99 = sincronizarItens99(authToken, ss, municipio, convenio, ano, mes, dados.principal, timestamp, usuario);
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
        String(row[0]), String(row[1]), String(row[2]), String(row[3]), String(row[4]), 
        String(row[5]), String(row[6]), String(row[7]), String(row[8]), String(row[9]), 
        String(row[10])
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
        if (isReportCompletelyEmpty) {
            removerRegistrosExistentes(sheets.obsgeral, municipio, convenio, ano, mes);
        } else {
            removerRegistrosExistentes(sheets.obsgeral, municipio, convenio, ano, mes);
            const newObsRowValues = [
              timestamp, municipio, String(convenio), String(ano), String(mes),
              String(dados.valorTotal || ""), 
              String(dados.obsgeral?.dados?.[0] || ""),
              "NAO", 
              hasItem99InReport ? "SIM" : "NAO"
            ];
            appendRowAndFormatAsText(sheets.obsgeral, newObsRowValues);
        }
    }

    registrarOperacao(local, usuario.username, municipio, "save_data", "success");
    return { success: true, mapeamento: resultadoSync99.mapeamento };

  } catch (error) {
    console.error("Erro ao salvar dados na planilha: " + error.toString());
    try {
        if (usuario) {
            registrarOperacao(local, usuario.username, municipio, "save_data_error", `failure: ${error.message.substring(0,100)}`);
        }
    } catch (regError) {
        console.error("Erro ao registrar falha de salvamento: " + regError.toString());
    }
    return { success: false, message: "Erro interno ao salvar dados: " + error.message, errorCode: "PROCESSING_ERROR" };
  } finally {
    if (lock) lock.releaseLock();
  }
}

function salvarItensPrimariosEmLote(itens) {
    if (!Array.isArray(itens) || itens.length === 0) {
        return;
    }
    itens.forEach(item => {
        salvarItemPrimario(item);
    });
}

function salvarItemPrimario(itemData) {
  const local = "salvarItemPrimario";
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = SpreadsheetApp.openById(obterIdArquivoCompartilhado("SIC3_TBPrimaria"));
    const sheet = ss.getSheetByName("dt-primaria");

    const codigoFormatado = String(itemData.codigo).padStart(9, '0');
    const dataRange = sheet.getRange("A:A");
    const textFinder = dataRange.createTextFinder(codigoFormatado);
    if (textFinder.findNext()) {
      return true;
    }

    const especificacao = String(itemData.especificacao || "");
    const novaLinha = [
      codigoFormatado,
      especificacao,
      itemData.elementosDespesa ? itemData.elementosDespesa.join("|") : "",
      itemData.unidadesFornecimento ? itemData.unidadesFornecimento.join("|") : ""
    ];
    
    const newRowIndex = sheet.getLastRow() + 1;
    sheet.getRange(newRowIndex, 1, 1, novaLinha.length).setValues([novaLinha]).setNumberFormat("@STRING@");
    return true;

  } catch (e) {
    console.error("Erro ao salvar item primário: " + e.toString());
    return false;
  } finally {
    if (lock) lock.releaseLock();
  }
}

// ========== GERENCIAMENTO DE ITENS 99 ==========

function obterDadosItens99(authToken, filtros) {
    const local = "obterDadosItens99";
    const usuarioInfo = validateAuthToken(authToken);

    if (!usuarioInfo || !usuarioInfo.isAdmin) {
        registrarOperacao(local, usuarioInfo?.username || 'unauthorized', null, "get_item99_data", "denied");
        return { success: false, message: "Acesso negado." };
    }

    try {
        const ss = SpreadsheetApp.openById(CURRENT_SPREADSHEET_ID);
        const sheet = ss.getSheetByName("item99");
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
        registrarOperacao(local, usuarioInfo.username, null, "get_item99_data_error", `error: ${e.message}`);
        return { success: false, message: "Erro ao buscar dados: " + e.message };
    }
}

function getNextItem99Code(authToken) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = SpreadsheetApp.openById(CURRENT_SPREADSHEET_ID);
    const sheet = ss.getSheetByName("item99");

    const data = sheet.getDataRange().getValues();
    let maxCode = 990000000;

    if (data.length > 1) {
      for (let i = 1; i < data.length; i++) {
        if (data[i][5]) {
          const currentCodeStr = String(data[i][5]).trim();
          if (currentCodeStr.startsWith("99") && /^\d+$/.test(currentCodeStr)) {
            const currentCode = parseInt(currentCodeStr, 10);
            if (!isNaN(currentCode) && currentCode > maxCode) {
              maxCode = currentCode;
            }
          }
        }
      }
    }
    return maxCode + 1;
  } catch (e) {
    console.error("Erro ao obter código para Item 99:", e);
    return 990000001; 
  } finally {
    if (lock) lock.releaseLock();
  }
}

function gerenciarItem99(operacao, dados) {
  const local = "gerenciarItem99";
  const { codigo, authToken } = dados;
  const autorizacao = validateAuthToken(authToken);

  if (!autorizacao) {
    return { success: false, message: "Autorização falhou." };
  }
  
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ss = SpreadsheetApp.openById(CURRENT_SPREADSHEET_ID);
    const item99Sheet = ss.getSheetByName("item99");

    const item99Data = item99Sheet.getDataRange().getValues();
    let rowIndexItem99 = -1;
    for (let i = 1; i < item99Data.length; i++) {
      if (String(item99Data[i][5]) === String(codigo)) {
        rowIndexItem99 = i;
        break;
      }
    }

    if (rowIndexItem99 === -1) {
      return { success: false, message: `Item 99 com código ${codigo} não encontrado.` };
    }
    
    if (operacao === 'excluir') {
      const item99Row = item99Data[rowIndexItem99];
      const municipio = item99Row[1], convenio = item99Row[2], ano = item99Row[3], mes = item99Row[4];

      item99Sheet.getRange(rowIndexItem99 + 1, 11).setValue("excluido");

      ['principal', 'abastecimento', 'manutencao'].forEach(sheetName => {
        const sheet = ss.getSheetByName(sheetName);
        if (!sheet) return;

        const sheetData = sheet.getDataRange().getValues();
        for (let i = sheetData.length - 1; i >= 1; i--) {
            const row = sheetData[i];
            if (String(row[1]) === String(municipio) && String(row[2]) === String(convenio) &&
                String(row[3]) === String(ano) && String(row[4]) === String(mes) &&
                String(row[6]) === String(codigo)) {
                sheet.deleteRow(i + 1);
                break; 
            }
        }
      });
      
      atualizarObsGeralAposModificacao(ss, municipio, convenio, ano, mes);
      registrarOperacao(local, autorizacao.username, autorizacao.municipio, `item99_${operacao}`, "success");
      return { success: true };

    } else if (operacao === 'editar') {
      const { novosDados, fileInfo } = dados;
      const oldRowData = item99Sheet.getRange(rowIndexItem99 + 1, 1, 1, item99Sheet.getLastColumn()).getValues()[0];
      
      let newFileUrl = oldRowData[11];
      if (fileInfo && fileInfo.base64Data) {
        newFileUrl = uploadNotaFiscal(fileInfo, newFileUrl);
      }
      
      const updatedRowData = oldRowData;
      updatedRowData[0] = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");
      updatedRowData[6] = novosDados.descricao;
      updatedRowData[7] = novosDados.unidade;
      updatedRowData[8] = novosDados.despesa;
      updatedRowData[11] = newFileUrl;
      
      item99Sheet.deleteRow(rowIndexItem99 + 1);
      item99Sheet.insertRowBefore(2);
      item99Sheet.getRange(2, 1, 1, updatedRowData.length).setValues([updatedRowData]).setNumberFormat("@STRING@");
      
      registrarOperacao(local, autorizacao.username, autorizacao.municipio, `item99_${operacao}`, "success");
      return { success: true, message: "Item 99 atualizado com sucesso." };
    }
  } catch (e) {
    console.error("Erro no gerenciarItem99: " + e.toString());
    return { success: false, message: "Erro interno do servidor: " + e.toString() };
  } finally {
    if(lock) lock.releaseLock();
  }
}

function sincronizarItens99(authToken, spreadsheet, municipio, convenio, ano, mes, dadosPrincipais, timestamp, usuario) {
  const local = "sincronizarItens99";
  const item99Sheet = spreadsheet.getSheetByName("item99");
  
  const item99AllData = item99Sheet.getDataRange().getValues();
  item99AllData.shift(); // Remove cabeçalho
  const codigoColIdx = 5;
  const statusColIdx = 10;

  const sheetReportItems = new Map();
  item99AllData.forEach((row, index) => {
    if (String(row[1]) === municipio && String(row[2]) === String(convenio) && String(row[3]) === String(ano) && String(row[4]) === String(mes)) {
      sheetReportItems.set(String(row[codigoColIdx]), {
        rowIndex: index + 2,
        rowData: row
      });
    }
  });

  const clientItemCodes = new Set();
  const clientItems = dadosPrincipais.filter(row => {
    const code = String(row[1]);
    const isItem99 = code.startsWith("99") || code.startsWith("ITEM99P");
    if (isItem99 && !code.startsWith("ITEM99P")) {
      clientItemCodes.add(code);
    }
    return isItem99;
  });

  const sheetCodes = new Set(sheetReportItems.keys());
  sheetCodes.forEach(code => {
    if (!clientItemCodes.has(code)) {
      const itemInfo = sheetReportItems.get(code);
      if (itemInfo && itemInfo.rowData[statusColIdx] != 'excluido') {
        item99Sheet.getRange(itemInfo.rowIndex, statusColIdx + 1).setValue("excluido");
      }
    }
  });

  const mapeamentoCodigos = {};
  let proximoCodigo99 = null;

  for (const rowCliente of clientItems) {
    const codigoCliente = String(rowCliente[1]);
    const isNew = codigoCliente.startsWith("ITEM99P");

    if (isNew) {
      if (proximoCodigo99 === null) proximoCodigo99 = getNextItem99Code(authToken);
      const finalCode = String(proximoCodigo99++);
      mapeamentoCodigos[rowCliente[11]] = finalCode;

      let fileUrl = "";
      if (rowCliente[12] && rowCliente[13]) {
        const nomeArquivoSanitizado = String(rowCliente[2]).replace(/[^\w\s.-]/g, '_').substring(0, 50);
        fileUrl = uploadNotaFiscal({
          base64Data: rowCliente[12],
          mimeType: rowCliente[13],
          fileName: `${finalCode} - ${nomeArquivoSanitizado}`
        }, null);
      }
      
      let item99Info = {};
      try {
        if (rowCliente[10]) {
          item99Info = JSON.parse(rowCliente[10]);
        }
      } catch (e) {
        console.error("Erro parsing item99Info para novo item: " + e.message);
      }

      const termosDeBusca = (item99Info && typeof item99Info.searchTerms === 'string') ? item99Info.searchTerms : '';
      const novaLinha = [
        timestamp, municipio, convenio, String(ano), mes, finalCode,
        String(rowCliente[2]), String(rowCliente[4]), String(rowCliente[3]),
        termosDeBusca, 'pendente', fileUrl
      ];
      
      item99Sheet.insertRowAfter(1);
      const newRowRange = item99Sheet.getRange(2, 1, 1, novaLinha.length);
      newRowRange.setValues([novaLinha]).setNumberFormat("@STRING@");

    } else {
      const existingItem = sheetReportItems.get(codigoCliente);
      if (existingItem) {
        const rowIndex = existingItem.rowIndex;
        const existingRowData = existingItem.rowData;
        const rowValues = [...existingRowData];

        rowValues[0] = timestamp;
        rowValues[6] = String(rowCliente[2]);
        rowValues[7] = String(rowCliente[4]);
        rowValues[8] = String(rowCliente[3]);

        if (rowCliente[12] && rowCliente[13]) {
          const nomeArquivoSanitizado = String(rowCliente[2]).replace(/[^\w\s.-]/g, '_').substring(0, 50);
          rowValues[11] = uploadNotaFiscal({
            base64Data: rowCliente[12],
            mimeType: rowCliente[13],
            fileName: `${codigoCliente} - ${nomeArquivoSanitizado}`
          }, existingRowData[11]);
        }

        let item99Info = {};
        try {
          if (rowCliente[10]) {
            item99Info = JSON.parse(rowCliente[10]);
          }
        } catch(e) {
          console.error("Erro parsing item99Info para item existente: " + e.message);
        }

        if (item99Info && typeof item99Info.searchTerms === 'string' && item99Info.searchTerms.trim() !== '') {
          rowValues[9] = item99Info.searchTerms;
        }

        if (existingRowData[statusColIdx] === 'excluido') {
          rowValues[10] = 'pendente';
        }

        item99Sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]).setNumberFormat("@STRING@");
      }
    }
  }

  if (item99Sheet.getLastRow() > 1) {
    const rangeToSort = item99Sheet.getRange(2, 1, item99Sheet.getLastRow() - 1, item99Sheet.getLastColumn());
    rangeToSort.sort({ column: 6, ascending: false });
  }

  return { success: true, mapeamento: mapeamentoCodigos };
}

function excluirItem99Principal(authToken, item99Codigo) {
  const local = "excluirItem99Principal";
  const usuarioInfo = validateAuthToken(authToken);

  if (!usuarioInfo || !usuarioInfo.isAdmin) {
    return { success: false, message: "Acesso negado." };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ss = SpreadsheetApp.openById(CURRENT_SPREADSHEET_ID);
    const item99Sheet = ss.getSheetByName("item99");

    const item99Data = item99Sheet.getDataRange().getValues();
    const rowIndexItem99 = item99Data.findIndex(row => String(row[5]) === String(item99Codigo));

    if (rowIndexItem99 === -1) {
      return { success: false, message: "Item 99 não encontrado." };
    }

    const item99Row = item99Data[rowIndexItem99];
    const municipio = item99Row[1], convenio = item99Row[2], ano = item99Row[3], mes = item99Row[4];

    item99Sheet.getRange(rowIndexItem99 + 1, 11).setValue("excluido");

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
    registrarOperacao(local, usuarioInfo.username, municipio, "delete_item99_principal", `success: ${item99Codigo}`);
    return { success: true, message: "Item excluído com sucesso." };

  } catch (e) {
    return { success: false, message: "Erro no servidor ao excluir item: " + e.toString() };
  } finally {
    if (lock) lock.releaseLock();
  }
}

function atualizarStatusItem99(authToken, item99Codigo, novoStatus) {
  const local = "atualizarStatusItem99";
  const usuarioInfo = validateAuthToken(authToken);

  if (!usuarioInfo || !usuarioInfo.isAdmin) {
    return { success: false, message: "Acesso negado." };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ss = SpreadsheetApp.openById(CURRENT_SPREADSHEET_ID);
    const sheet = ss.getSheetByName("item99");
    const data = sheet.getRange("F:K").getValues();

    const rowIndex = data.findIndex(row => String(row[0]) === String(item99Codigo));

    if (rowIndex === -1) {
      return { success: false, message: "Item 99 não encontrado." };
    }
    
    sheet.getRange(rowIndex + 2, 11).setValue(novoStatus);
    registrarOperacao(local, usuarioInfo.username, usuarioInfo.municipio, "update_status_item99", `code: ${item99Codigo}, status: ${novoStatus}`);
    return { success: true };

  } catch (e) {
    return { success: false, message: "Erro ao atualizar status: " + e.message };
  } finally {
    if (lock) lock.releaseLock();
  }
}

function substituirItem99(authToken, dados) {
    const local = "substituirItem99";
    const { item99Codigo, itemConsumoCodigo, itemConsumoDescricao, itemConsumoDespesa, itemConsumoUnidade } = dados;
    const usuarioInfo = validateAuthToken(authToken);
    
    if (!usuarioInfo || !usuarioInfo.isAdmin) {
        return { success: false, message: "Acesso negado." };
    }

    const lock = LockService.getScriptLock();
    try {
        lock.waitLock(30000);
        const ss = SpreadsheetApp.openById(CURRENT_SPREADSHEET_ID);
        const item99Sheet = ss.getSheetByName("item99");

        const item99Data = item99Sheet.getDataRange().getValues();
        const rowIndexItem99 = item99Data.findIndex(row => String(row[5]) === String(item99Codigo));

        if (rowIndexItem99 === -1) {
            return { success: false, message: "Item 99 não encontrado na base de dados." };
        }

        const item99Row = item99Data[rowIndexItem99];
        const municipio = item99Row[1], convenio = item99Row[2], ano = item99Row[3], mes = item99Row[4];

        const rangeItem99 = item99Sheet.getRange(rowIndexItem99 + 2, 11, 1, 5);
        rangeItem99.setValues([["substituido", itemConsumoCodigo, itemConsumoDescricao, itemConsumoDespesa, itemConsumoUnidade]]);

        let atualizado = false;
        for (const sheetName of ['principal', 'abastecimento', 'manutencao']) {
            const sheet = ss.getSheetByName(sheetName);
            if (!sheet) continue;

            const sheetData = sheet.getDataRange().getValues();
            const rowIndex = sheetData.findIndex(row =>
                String(row[1]) === String(municipio) && String(row[2]) === String(convenio) &&
                String(row[3]) === String(ano) && String(row[4]) === String(mes) &&
                String(row[6]) === String(item99Codigo)
            );

            if (rowIndex !== -1) {
                sheet.getRange(rowIndex + 1, 7, 1, 4).setValues([[
                    itemConsumoCodigo, itemConsumoDescricao, itemConsumoDespesa, itemConsumoUnidade
                ]]);
                atualizado = true;
                break;
            }
        }

        if (!atualizado) {
             return { success: false, message: "Substituição falhou: Item 99 não encontrado nos lançamentos." };
        }

        atualizarObsGeralAposModificacao(ss, municipio, convenio, ano, mes);
        registrarOperacao(local, usuarioInfo.username, municipio, "replace_item99", `success: ${item99Codigo} -> ${itemConsumoCodigo}`);
        return { success: true, message: "Item substituído com sucesso." };

    } catch (e) {
        return { success: false, message: "Erro no servidor ao substituir item: " + e.toString() };
    } finally {
        if (lock) lock.releaseLock();
    }
}

function atualizarObsGeralAposModificacao(spreadsheet, municipio, convenio, ano, mes) {
    const principalSheet = spreadsheet.getSheetByName("principal");
    const obsgeralSheet = spreadsheet.getSheetByName("obsgeral");
    const item99Sheet = spreadsheet.getSheetByName("item99");

    let novoValorTotal = 0;
    const principalData = principalSheet.getDataRange().getValues();
    principalData.forEach(row => {
        if (String(row[1]) === municipio && String(row[2]) === convenio && String(row[3]) === String(ano) && String(row[4]) === mes) {
            novoValorTotal += Number(String(row[11]).replace(",", ".")) || 0;
        }
    });

    let hasItem99Pendente = false;
    const item99Data = item99Sheet.getDataRange().getValues();
    item99Data.forEach(row => {
        if (String(row[1]) === municipio && String(row[2]) === convenio && String(row[3]) === String(ano) && String(row[4]) === mes && String(row[10]).toLowerCase() === 'pendente') {
            hasItem99Pendente = true;
        }
    });

    const obsgeralData = obsgeralSheet.getDataRange().getValues();
    const obsRowIndex = obsgeralData.findIndex(row => 
        String(row[1]) === municipio && String(row[2]) === convenio && String(row[3]) === String(ano) && String(row[4]) === mes
    );

    if (obsRowIndex !== -1) {
        obsgeralSheet.getRange(obsRowIndex + 1, 6).setValue(novoValorTotal.toFixed(2).replace(".", ","));
        obsgeralSheet.getRange(obsRowIndex + 1, 9).setValue(hasItem99Pendente ? "SIM" : "NAO");
    }
}

// ========== GERENCIAMENTO DE ENDEREÇOS E MEDIDORES ==========

function gerenciarEnderecoMedidor(authToken, dados) {
  const local = "gerenciarEnderecoMedidor";
  const usuario = validateAuthToken(authToken);
  
  if (!usuario) {
    return { success: false, message: "Acesso negado. Token inválido." };
  }

  if (!usuario.isAdmin && usuario.municipio != dados.municipio) {
      return { success: false, message: "Acesso negado a este município." };
  }

  registrarOperacao(local, usuario.username, dados.municipio, `address_${dados.acao}`, "initiated");

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ss = SpreadsheetApp.openById(obterIdArquivoCompartilhado("SIC3_BDEnderecos"));
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
          return {success: false, message: "Endereço já cadastrado para este convênio."};
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
        return {success: true};

      case "atualizar":
        const rowIndex = values.findIndex((row) => 
          String(row[cols.municipio]) == dadosComString.municipio && 
          String(row[cols.convenio]) == dadosComString.convenio && 
          String(row[cols.endereco]) == dadosComString.enderecoAntigo);

        if (rowIndex == -1) {
          return {success: false, message: "Endereço original não encontrado."};
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
        return {success: true};

      case "excluir":
        const delIndex = values.findIndex((row) => 
          String(row[cols.municipio]) == dadosComString.municipio && 
          String(row[cols.convenio]) == dadosComString.convenio && 
          String(row[cols.endereco]) == dadosComString.endereco);

        if (delIndex == -1) {
          return {success: false, message: "Endereço não encontrado para exclusão."};
        }
        sheet.deleteRow(delIndex + 1);
        return {success: true};

      default:
        throw new Error("Ação inválida para gerenciamento de endereço/medidor.");
    }
  } catch (error) {
    return {success: false, message: `Erro no servidor: ${error.message}`};
  } finally {
    lock.releaseLock();
  }
}

// ========== STATUS E BLOQUEIO DE EDIÇÃO ==========

function verificarStatusBloqueio(municipio, convenio, ano, mes) {
  try {
    const ss = SpreadsheetApp.openById(CURRENT_SPREADSHEET_ID);
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
    console.error("Erro ao verificar status de bloqueio:", error);
    return "desbloqueado";
  }
}

function atualizarStatusEdicao(authToken, municipio, convenio, ano, mes, status) {
  const local = "atualizarStatusEdicao";
  const usuario = validateAuthToken(authToken);

  if (!usuario || !usuario.isAdmin) {
    return { success: false, message: "Acesso negado. Apenas administradores.", errorCode: "ADMIN_REQUIRED" };
  }
  
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ss = SpreadsheetApp.openById(CURRENT_SPREADSHEET_ID);
    const sheet = ss.getSheetByName("obsgeral");
    const data = sheet.getDataRange().getValues();

    for (let i = 0; i < data.length; i++) {
      if (String(data[i][1]) == municipio && 
          String(data[i][2]) == String(convenio) && 
          String(data[i][3]) == String(ano) && 
          String(data[i][4]) == String(mes)) {
        sheet.getRange(i + 1, 8).setNumberFormat("@STRING@").setValue(String(status)); 
        
        if (status === "NAO") {
            agendarRebloqueio24h(municipio, convenio, ano, mes, usuario.username);
        }

        registrarOperacao(local, usuario.username, municipio, status == "SIM" ? "bloquear_edicao" : "desbloquear_edicao", "success");
        return { success: true };
      }
    }
    return { success: false, message: "Registro não encontrado.", errorCode: "NOT_FOUND" };
  } catch (error) {
    return { success: false, message: "Erro ao processar alteração de status.", errorCode: "PROCESSING_ERROR" };
  } finally {
    lock.releaseLock();
  }
}

function agendarRebloqueio24h(municipio, convenio, ano, mes, username) {
    const trigger = ScriptApp.newTrigger("executarRebloqueioAutomatico")
        .timeBased()
        .after(24 * 60 * 60 * 1000)
        .create();

    const triggerId = trigger.getUniqueId();
    const dadosRebloqueio = {
        municipio: municipio,
        convenio: convenio,
        ano: ano,
        mes: mes,
        username: username,
        spreadsheetId: CURRENT_SPREADSHEET_ID,
        timestamp: new Date().toISOString()
    };

    PropertiesService.getScriptProperties().setProperty('REBLOQUEIO_' + triggerId, JSON.stringify(dadosRebloqueio));
    registrarOperacao("agendarRebloqueio24h", username, municipio, "schedule_reblock", `TriggerId: ${triggerId}`);
}

function executarRebloqueioAutomatico(e) {
    const local = "executarRebloqueioAutomatico";
    const triggerId = e.triggerUid;
    const props = PropertiesService.getScriptProperties();
    const dadosJson = props.getProperty('REBLOQUEIO_' + triggerId);

    if (!dadosJson) return;

    const dados = JSON.parse(dadosJson);
    const lock = LockService.getScriptLock();

    try {
        lock.waitLock(30000);
        const ss = SpreadsheetApp.openById(dados.spreadsheetId);
        const sheet = ss.getSheetByName("obsgeral");
        const sheetData = sheet.getDataRange().getValues();

        for (let i = 0; i < sheetData.length; i++) {
            if (String(sheetData[i][1]) == dados.municipio && 
                String(sheetData[i][2]) == String(dados.convenio) && 
                String(sheetData[i][3]) == String(dados.ano) && 
                String(sheetData[i][4]) == String(dados.mes)) {
                
                sheet.getRange(i + 1, 8).setNumberFormat("@STRING@").setValue("SIM");
                CURRENT_SPREADSHEET_ID = dados.spreadsheetId;
                registrarOperacao(local, "SISTEMA", dados.municipio, "auto_reblock_24h", "success");
                break;
            }
        }
    } catch (error) {
        console.error("Erro no rebloqueio automático:", error);
    } finally {
        lock.releaseLock();
        props.deleteProperty('REBLOQUEIO_' + triggerId);
        const triggers = ScriptApp.getProjectTriggers();
        for (const t of triggers) {
            if (t.getUniqueId() === triggerId) {
                ScriptApp.deleteTrigger(t);
                break;
            }
        }
    }
}

/**
 * Gatilho cron executado periodicamente para bloquear relatórios antigos de meses anteriores em todas as planilhas
 */
function bloquearRelatoriosAntigosAutomaticamente() {
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const subfolders = folder.getFolders();
  let totalProcessado = 0;

  while (subfolders.hasNext()) {
    const subfolder = subfolders.next();
    const folderName = subfolder.getName();
    if (folderName.endsWith("RPM")) {
      const files = subfolder.getFiles();
      while (files.hasNext()) {
        const file = files.next();
        const name = file.getName();
        if (/^\d{4}$/.test(name)) {
          const spreadsheetId = file.getId();
          try {
            bloquearRelatoriosAntigosNaPlanilha(spreadsheetId);
            totalProcessado++;
          } catch (e) {
            console.error("Erro ao bloquear na planilha " + name + " da pasta " + folderName + ": " + e.toString());
          }
        }
      }
    }
  }
  console.log("Bloqueio automático concluído. Total de planilhas: " + totalProcessado);
}

function bloquearRelatoriosAntigosNaPlanilha(spreadsheetId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheetByName("obsgeral");
    if (!sheet) return;

    const data = sheet.getDataRange().getValues();
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const mesAtualNum = hoje.getMonth() + 1;

    let relatoriosBloqueados = 0;

    for (let i = 1; i < data.length; i++) {
      const linha = data[i];
      const convenio = linha[2];
      const anoRelatorio = parseInt(linha[3], 10);
      const mesRelatorio = linha[4];
      const statusAtual = linha[7];

      if (!anoRelatorio || !mesRelatorio || statusAtual === "SIM") {
        continue;
      }
      
      const mesRelatorioNum = mNumerico(mesRelatorio, 'numero');

      if (anoRelatorio < anoAtual || (anoRelatorio === anoAtual && mesRelatorioNum < mesAtualNum)) {
        sheet.getRange(i + 1, 8).setValue("SIM");
        relatoriosBloqueados++;
        CURRENT_SPREADSHEET_ID = spreadsheetId;
        registrarOperacao("bloquearRelatoriosAntigosNaPlanilha", "SISTEMA", "AUTOMATICO", "bloqueio_realizado", `Relatório: ${convenio} - ${mesRelatorio}/${anoRelatorio}`);
      }
    }
  } finally {
    if (lock) lock.releaseLock();
  }
}

// ========== BUSCAS NO PORTAL DE COMPRAS MG ==========

function obterDetalhesItemPortal(itemId) {
  if (!itemId) return null;
  try {
    const url = `https://www1.compras.mg.gov.br/servico/catalogo/itemmaterialservico/Consulta/recuperarDetalhesItemMaterial?id=${itemId}&operacao=visualizar&realizarBuscaCaracteristica=false`;
    const response = UrlFetchApp.fetch(url, { method: 'get', headers: { 'Accept': 'application/json' }, muteHttpExceptions: true });
    
    if (response.getResponseCode() !== 200) return null;

    const dados = JSON.parse(response.getContentText());
    if (dados && dados.itemMaterial && dados.itemMaterial.material) {
      const item = dados.itemMaterial.material;
      const elementosDespesa = [...new Set(item.elementosItemDespesa
        .filter(el => el.situacao.id === 'ATIVO')
        .map(el => el.descricao.trim()))].sort();

      const unidadesFornecimento = [...new Set(item.unidadesAquisicao
        .filter(ua => ua.situacao.id === 'ATIVO')
        .map(ua => ua.unidadeFornecimento.trim()))].sort();
      
      return { elementosDespesa: elementosDespesa, unidadesFornecimento: unidadesFornecimento };
    }
    return null;
  } catch (e) {
    console.error("Erro no obterDetalhesItemPortal:", e);
    return null;
  }
}

function buscarNoPortalCompras(termoBusca) {
  if (!termoBusca) return [];
  try {
    const url = "https://www1.compras.mg.gov.br/servico/catalogo/itemmaterialservico/Consulta/pesquisar";
    const payload = {
      reqId: 1, ordenacoes: [], sizePerPage: 9999, page: 1,
      filtros: { tiposGrupo: "MATERIAL", tipoPesquisa: "CONSIDERAR_TUDO_COM_SINONIMO", especificacaoItem: termoBusca }
    };
    
    const response = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) return [];

    const data = JSON.parse(response.getContentText());
    if (data && data.resultado && Array.isArray(data.resultado.dados)) {
      return data.resultado.dados.map(item => ({
        id: item.id,
        codigo: item.codigo,
        descricao: item.especificacaoCompleta || item.nome
      })).filter(item => item.id && item.codigo && item.descricao);
    }
    return [];
  } catch (e) {
    console.error("Erro no buscarNoPortalCompras:", e);
    return [];
  }
}

// ========== FUNÇÕES AUXILIARES E DE PERSISTÊNCIA ==========

function registrarOperacao(local, username, municipio, operacao, resultado) {
  try {
    const rpm = CURRENT_RPM || "15";
    const ano = CURRENT_ANO || new Date().getFullYear().toString();
    const logId = obterIdLogAcesso(rpm, ano);
    const ss = SpreadsheetApp.openById(logId);
    const sheet = ss.getSheetByName("acessos");
    
    const timestamp = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");
    const rowData = [timestamp, String(username), String(municipio), String(resultado), String(operacao), local];
    appendRowAndFormatAsText(sheet, rowData);
  } catch (error) {
    console.error("Erro ao registrar operação no log de acesso:", error);
  }
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

function inserirDados(sheet, dados) {
  if (!sheet || !dados || dados.length === 0) return;
  sheet.insertRowsAfter(1, dados.length);
  const range = sheet.getRange(2, 1, dados.length, dados[0].length);
  range.setValues(dados);
  range.setNumberFormat("@STRING@");
}

function removerRegistrosExistentes(sheet, municipio, convenio, ano, mes) {
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  let rangeStart = -1;
  let rangeCount = 0;
  
  for (let i = data.length - 1; i > 0; i--) {
    const corresponde = data[i][1] == municipio && String(data[i][2]) == String(convenio) && 
                        String(data[i][3]) == String(ano) && String(data[i][4]) == String(mes);
    
    if (corresponde) {
      if (rangeStart === -1) {
        rangeStart = i + 1;
        rangeCount = 1;
      } else {
        rangeCount++;
      }
    } else {
      if (rangeStart !== -1) {
        sheet.deleteRows(rangeStart - rangeCount + 1, rangeCount);
        rangeStart = -1;
        rangeCount = 0;
      }
    }
  }
  if (rangeStart !== -1) {
    sheet.deleteRows(rangeStart - rangeCount + 1, rangeCount);
  }
}

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

function uploadNotaFiscal(fileObject, existingFileUrl = null) {
  try {
    if (existingFileUrl) {
      try {
        const fileId = existingFileUrl.match(/id=([^&]+)/)[1];
        if (fileId) DriveApp.getFileById(fileId).setTrashed(true);
      } catch (e) {
        console.warn("Não foi possível excluir nota fiscal antiga: " + e.toString());
      }
    }
    
    const { base64Data, mimeType, fileName } = fileObject;
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
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

function formatDataForSheet(dateString) {
  if (!dateString || typeof dateString != 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString; 
  }
  const parts = dateString.split('-');
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function mNumerico(valor, retorno = 'texto') {
  return converterMes(valor, retorno);
}

function converterMes(valor, formato = 'texto') {
  const meses = {
    'JANEIRO': { texto: '01', numero: 1, nome: 'janeiro' }, 'FEVEREIRO': { texto: '02', numero: 2, nome: 'fevereiro' },
    'MARÇO': { texto: '03', numero: 3, nome: 'março' }, 'MARCO': { texto: '03', numero: 3, nome: 'março' },
    'ABRIL': { texto: '04', numero: 4, nome: 'abril' }, 'MAIO': { texto: '05', numero: 5, nome: 'maio' },
    'JUNHO': { texto: '06', numero: 6, nome: 'junho' }, 'JULHO': { texto: '07', numero: 7, nome: 'julho' },
    'AGOSTO': { texto: '08', numero: 8, nome: 'agosto' }, 'SETEMBRO': { texto: '09', numero: 9, nome: 'setembro' },
    'OUTUBRO': { texto: '10', numero: 10, nome: 'outubro' }, 'NOVEMBRO': { texto: '11', numero: 11, nome: 'novembro' },
    'DEZEMBRO': { texto: '12', numero: 12, nome: 'dezembro' }
  };
  if (typeof valor === 'number' || /^\d+$/.test(String(valor))) {
    const num = parseInt(valor, 10);
    if (num >= 1 && num <= 12) {
      const nomesMeses = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
      return meses[nomesMeses[num - 1]][formato];
    }
    return formato === 'numero' ? 0 : (formato === 'texto' ? '00' : '');
  }
  const mesFormatado = String(valor).toUpperCase().trim();
  if (!meses[mesFormatado]) return formato === 'numero' ? 0 : (formato === 'texto' ? '00' : '');
  return meses[mesFormatado][formato];
}
