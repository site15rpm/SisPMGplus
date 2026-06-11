// Arquivo: Codigo.js
// Backend do Google Apps Script (GAS) para o SIC3 v3.0
// Responsável estritamente pela escrita de dados e gerenciamento dinâmico de planilhas por RPM/Ano.

const FOLDER_ID = "14TPdLFpf2bEMzWdLjxEtVIeUuoIrFuNu"; // Pasta no Google Drive para armazenar as planilhas

/**
 * Ponto de entrada central HTTP POST. Recebe chamadas assíncronas do frontend local da extensão.
 */
function doPost(e) {
  try {
    const requestData = JSON.parse(e.postData.contents);
    const action = requestData.action;
    const rpm = requestData.rpm || "15RPM";
    const ano = requestData.ano || new Date().getFullYear().toString();
    const params = requestData.params || [];
    
    // Obtém ou cria a planilha do Google Sheets baseada na RPM e no Ano
    const ss = obterOuCriarPlanilhaRPM(rpm, ano);
    
    // Roteador de Ações
    let result;
    switch (action) {
      case "salvarDadosNaPlanilha":
        result = salvarDadosNaPlanilha(ss, params);
        break;
        
      case "incluirConvenio":
        result = incluirConvenio(ss, params);
        break;
        
      case "alterarConvenio":
        result = alterarConvenio(ss, params);
        break;
        
      case "excluirConvenio":
        result = excluirConvenio(ss, params);
        break;
        
      case "gerenciarEnderecoMedidor":
        result = gerenciarEnderecoMedidor(ss, params);
        break;
        
      case "gerenciarItem99":
        result = gerenciarItem99(ss, params);
        break;
        
      case "excluirItem99Principal":
        result = excluirItem99Principal(ss, params);
        break;
        
      case "atualizarStatusItem99":
        result = atualizarStatusItem99(ss, params);
        break;
        
      case "verificarStatusBloqueio":
        result = { success: true, status: verificarStatusBloqueio(ss, params) };
        break;
        
      case "atualizarStatusEdicao":
        result = atualizarStatusEdicao(ss, params);
        break;
        
      case "carregarConveniosMunicipio":
        result = carregarConveniosMunicipio(ss, params);
        break;
        
      case "obterIdPlanilha":
        result = { success: true, spreadsheetId: ss.getId() };
        break;
        
      default:
        throw new Error("Ação '" + action + "' não reconhecida pelo servidor GAS do SIC3.");
    }
    
    return ContentService.createTextOutput(JSON.stringify(result !== undefined ? result : { success: true }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error("Erro no doPost do GAS:", error);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: "Erro no servidor GAS: " + error.message,
      errorCode: "SERVER_ERROR"
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Localiza a planilha da RPM e Ano correspondente ou cria uma nova, caso não exista.
 */
function obterOuCriarPlanilhaRPM(rpm, ano) {
  const fileName = "SIC3_" + rpm + "_" + ano;
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const files = folder.getFilesByName(fileName);
  
  if (files.hasNext()) {
    const file = files.next();
    return SpreadsheetApp.openById(file.getId());
  }
  
  // Criar nova planilha
  const ss = SpreadsheetApp.create(fileName);
  const file = DriveApp.getFileById(ss.getId());
  
  // Mover para a pasta de destino do SIC3
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file); // Remove do diretório raiz
  
  // Define o compartilhamento como público ("Qualquer um com o link pode visualizar")
  // Isso viabiliza consultas super rápidas de leitura via gviz API pela extensão SisPMGplus
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  // Inicializa as abas e cabeçalhos obrigatórios
  inicializarPlanilhaRPM(ss);
  
  return ss;
}

/**
 * Cria todas as tabelas (abas) necessárias no novo banco de dados.
 */
function inicializarPlanilhaRPM(ss) {
  const abas = {
    "convenios": ["municipio", "convenio", "preposto_n", "preposto_pg", "preposto", "unidade", "dataInicio", "dataFim"],
    "principal": ["timestamp", "municipio", "convenio", "ano", "mes", "item_id", "codigo", "descricao", "unidade", "quantidade", "valor_unitario", "subtotal", "observacao", "responsavel", "despesa"],
    "abastecimento": ["timestamp", "municipio", "convenio", "ano", "mes", "data", "placa", "prefixo", "odometro", "motorista", "tipo", "quantidade", "valor_unitario", "subtotal", "nota_fiscal", "observacao"],
    "manutencao": ["timestamp", "municipio", "convenio", "ano", "mes", "data", "placa", "prefixo", "odometro", "responsavel", "descricao", "quantidade", "valor_unitario", "subtotal", "nota_fiscal", "observacao"],
    "obsgeral": ["timestamp", "municipio", "convenio", "ano", "mes", "valor_total", "obs_geral", "bloqueado", "has_item99"],
    "item99": ["timestamp", "municipio", "convenio", "ano", "mes", "item99_code", "descricao", "unidade_distribuicao", "elemento_despesa", "termos_busca", "status", "link_nota_fiscal"],
    "enderecos": ["municipio", "convenio", "endereco", "dtEndereco", "medidorAgua", "dtMedidorAgua", "medidorEnergia", "dtMedidorEnergia"]
  };
  
  for (const name in abas) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    sheet.clear();
    sheet.appendRow(abas[name]);
    
    // Formatação elegante do cabeçalho
    const headerRange = sheet.getRange(1, 1, 1, abas[name].length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#f5f0eb");
  }
  
  // Remove a aba vazia padrão de criação
  const defaultSheet = ss.getSheetByName("Página 1") || ss.getSheetByName("Sheet1");
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }
}

// ============================================================================
// FUNÇÕES DE GRAVAÇÃO (ESCRITA) DE DADOS
// ============================================================================

/**
 * Salva os dados de um relatório (Lançamentos de despesa, abastecimentos, manutenções e observação geral) no Sheets.
 */
function salvarDadosNaPlanilha(ss, params) {
  // params: [municipio, convenio, ano, mes, dados]
  const municipio = params[0];
  const convenio = params[1];
  const ano = params[2];
  const mes = params[3];
  const dados = params[4] || {};
  
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    
    const timestamp = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");
    
    const sheets = {
      principal: ss.getSheetByName("principal"),
      abastecimento: ss.getSheetByName("abastecimento"),
      manutencao: ss.getSheetByName("manutencao"),
      obsgeral: ss.getSheetByName("obsgeral")
    };
    
    // Remove registros antigos do mês/convênio para evitar duplicidade
    removerRegistrosExistentes(sheets.principal, municipio, convenio, ano, mes);
    removerRegistrosExistentes(sheets.abastecimento, municipio, convenio, ano, mes);
    removerRegistrosExistentes(sheets.manutencao, municipio, convenio, ano, mes);
    removerRegistrosExistentes(sheets.obsgeral, municipio, convenio, ano, mes);
    
    let hasItem99 = false;
    
    // 1. Grava itens principais (Materiais e Serviços)
    if (dados.principal && dados.principal.length > 0) {
      const rows = dados.principal.map(row => {
        if (String(row[1]).startsWith("99")) {
          hasItem99 = true;
        }
        return [
          timestamp, municipio, convenio, String(ano), mes,
          String(row[0] || ""), String(row[1] || ""), String(row[2] || ""), String(row[3] || ""), String(row[4] || ""),
          String(row[5] || ""), String(row[6] || ""), String(row[7] || ""), String(row[8] || ""), String(row[9] || "")
        ];
      });
      inserirDados(sheets.principal, rows);
    }
    
    // 2. Grava abastecimentos
    if (dados.abastecimento && dados.abastecimento.length > 0) {
      const rows = dados.abastecimento.map(row => [
        timestamp, municipio, convenio, String(ano), mes,
        String(row[0] || ""), String(row[1] || ""), String(row[2] || ""), String(row[3] || ""), String(row[4] || ""),
        String(row[5] || ""), String(row[6] || ""), String(row[7] || ""), String(row[8] || ""), String(row[9] || ""),
        String(row[10] || "")
      ]);
      inserirDados(sheets.abastecimento, rows);
    }
    
    // 3. Grava manutenções
    if (dados.manutencao && dados.manutencao.length > 0) {
      const rows = dados.manutencao.map(row => [
        timestamp, municipio, convenio, String(ano), mes,
        String(row[0] || ""), String(row[1] || ""), String(row[2] || ""), String(row[3] || ""), String(row[4] || ""),
        String(row[5] || ""), String(row[6] || ""), String(row[7] || ""), String(row[8] || ""), String(row[9] || ""),
        String(row[10] || "")
      ]);
      inserirDados(sheets.manutencao, rows);
    }
    
    // 4. Grava observações gerais e totais
    const valorTotal = dados.valorTotal || "";
    const obsgeralTexto = dados.obsgeral?.dados?.[0] || "";
    
    const obsRow = [
      timestamp, municipio, String(convenio), String(ano), String(mes),
      String(valorTotal), String(obsgeralTexto), "NAO", hasItem99 ? "SIM" : "NAO"
    ];
    inserirDados(sheets.obsgeral, [obsRow]);
    
    return { success: true };
    
  } catch (error) {
    console.error("Erro ao salvar dados na planilha:", error);
    return { success: false, message: "Erro ao salvar dados: " + error.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Remove em lote todas as linhas que contêm o mesmo convênio, município, ano e mês.
 */
function removerRegistrosExistentes(sheet, municipio, convenio, ano, mes) {
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  
  const range = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
  const values = range.getValues();
  const newValues = [];
  
  for (let i = 0; i < values.length; i++) {
    const rowMuni = String(values[i][1]);
    const rowConv = String(values[i][2]);
    const rowAno = String(values[i][3]);
    const rowMes = String(values[i][4]);
    
    if (rowMuni === String(municipio) && rowConv === String(convenio) && rowAno === String(ano) && rowMes === String(mes)) {
      continue; // Exclui a linha
    }
    newValues.push(values[i]);
  }
  
  sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  if (newValues.length > 0) {
    sheet.getRange(2, 1, newValues.length, sheet.getLastColumn()).setValues(newValues);
  }
}

/**
 * Insere um lote de linhas na planilha de forma otimizada com formato texto.
 */
function inserirDados(sheet, rows) {
  if (!sheet || !rows || rows.length === 0) return;
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rows.length, rows[0].length)
    .setValues(rows)
    .setNumberFormat("@STRING@");
}

// ============================================================================
// GERENCIAMENTO DE CONVÊNIOS
// ============================================================================

function carregarConveniosMunicipio(ss, params) {
  const municipio = params[0];
  const sheet = ss.getSheetByName("convenios");
  if (!sheet) return [];
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  
  const dados = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  const convenios = [];
  
  for (let i = 0; i < dados.length; i++) {
    if (dados[i][0] === municipio || municipio === "admin") {
      convenios.push({
        municipio: dados[i][0],
        convenio: dados[i][1],
        preposto_n: dados[i][2] || "",
        preposto_pg: dados[i][3] || "",
        preposto: dados[i][4] || "",
        unidade: dados[i][5] || "",
        dataInicio: dados[i][6] || "",
        dataFim: dados[i][7] || ""
      });
    }
  }
  return convenios;
}

function incluirConvenio(ss, params) {
  // params: [municipio, convenio, preposto_n, preposto_pg, preposto, unidade, dataInicio, dataFim]
  const sheet = ss.getSheetByName("convenios");
  if (!sheet) return { success: false, message: "Aba convenios não encontrada." };
  
  const novaLinha = [
    String(params[0] || ""),
    String(params[1] || ""),
    String(params[2] || ""),
    String(params[3] || ""),
    String(params[4] || ""),
    String(params[5] || ""),
    String(params[6] || ""),
    String(params[7] || "")
  ];
  
  sheet.appendRow(novaLinha);
  return { success: true };
}

function alterarConvenio(ss, params) {
  // params: [municipio, convenio, preposto_n, preposto_pg, preposto, unidade, dataInicio, dataFim]
  const sheet = ss.getSheetByName("convenios");
  if (!sheet) return { success: false, message: "Aba convenios não encontrada." };
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, message: "Nenhum convênio cadastrado." };
  
  const range = sheet.getRange(2, 1, lastRow - 1, 8);
  const values = range.getValues();
  let alterado = false;
  
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(params[0]) && String(values[i][1]) === String(params[1])) {
      values[i][2] = String(params[2] || "");
      values[i][3] = String(params[3] || "");
      values[i][4] = String(params[4] || "");
      values[i][5] = String(params[5] || "");
      values[i][6] = String(params[6] || "");
      values[i][7] = String(params[7] || "");
      alterado = true;
      break;
    }
  }
  
  if (alterado) {
    range.setValues(values);
    return { success: true };
  }
  return { success: false, message: "Convênio não localizado." };
}

function excluirConvenio(ss, params) {
  // params: [municipio, convenio]
  const sheet = ss.getSheetByName("convenios");
  if (!sheet) return { success: false, message: "Aba convenios não encontrada." };
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, message: "Nenhum convênio cadastrado." };
  
  const range = sheet.getRange(2, 1, lastRow - 1, 8);
  const values = range.getValues();
  const novosValores = [];
  
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(params[0]) && String(values[i][1]) === String(params[1])) {
      continue;
    }
    novosValores.push(values[i]);
  }
  
  sheet.getRange(2, 1, lastRow - 1, 8).clearContent();
  if (novosValores.length > 0) {
    sheet.getRange(2, 1, novosValores.length, 8).setValues(novosValores);
  }
  return { success: true };
}

// ============================================================================
// GERENCIAMENTO DE ENDEREÇOS E MEDIDORES
// ============================================================================

function gerenciarEnderecoMedidor(ss, params) {
  // params: [dados]
  const dados = params[0] || {};
  const sheet = ss.getSheetByName("enderecos");
  if (!sheet) return { success: false, message: "Aba enderecos não encontrada." };
  
  const lastRow = sheet.getLastRow();
  const now = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");
  
  if (lastRow <= 1) {
    sheet.appendRow([
      String(dados.municipio || ""),
      String(dados.convenio || ""),
      String(dados.endereco || ""),
      now,
      String(dados.medidorAgua || ""),
      now,
      String(dados.medidorEnergia || ""),
      now
    ]);
    return { success: true };
  }
  
  const range = sheet.getRange(2, 1, lastRow - 1, 8);
  const values = range.getValues();
  let localizado = false;
  
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(dados.municipio) && String(values[i][1]) === String(dados.convenio)) {
      localizado = true;
      if (String(values[i][2]) !== String(dados.endereco || "")) {
        values[i][2] = String(dados.endereco || "");
        values[i][3] = now;
      }
      if (String(values[i][4]) !== String(dados.medidorAgua || "")) {
        values[i][4] = String(dados.medidorAgua || "");
        values[i][5] = now;
      }
      if (String(values[i][6]) !== String(dados.medidorEnergia || "")) {
        values[i][6] = String(dados.medidorEnergia || "");
        values[i][7] = now;
      }
      break;
    }
  }
  
  if (localizado) {
    range.setValues(values);
  } else {
    sheet.appendRow([
      String(dados.municipio || ""),
      String(dados.convenio || ""),
      String(dados.endereco || ""),
      now,
      String(dados.medidorAgua || ""),
      now,
      String(dados.medidorEnergia || ""),
      now
    ]);
  }
  return { success: true };
}

// ============================================================================
// GERENCIAMENTO DE ITENS 99
// ============================================================================

function gerenciarItem99(ss, params) {
  // params: [operacao, dados]
  const operacao = params[0];
  const dados = params[1] || {};
  const sheet = ss.getSheetByName("item99");
  if (!sheet) return { success: false, message: "Aba item99 não encontrada." };
  
  const now = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");
  
  if (operacao === "inserir") {
    sheet.appendRow([
      now,
      String(dados.municipio || ""),
      String(dados.convenio || ""),
      String(dados.ano || ""),
      String(dados.mes || ""),
      String(dados.item99_code || ""),
      String(dados.descricao || ""),
      String(dados.unidade_distribuicao || ""),
      String(dados.elemento_despesa || ""),
      String(dados.termos_busca || ""),
      String(dados.status || "pendente"),
      String(dados.link_nota_fiscal || "")
    ]);
    return { success: true };
  }
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, message: "Nenhum item99 cadastrado." };
  
  const range = sheet.getRange(2, 1, lastRow - 1, 12);
  const values = range.getValues();
  let alterado = false;
  
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][5]) === String(dados.item99_code)) {
      values[i][6] = String(dados.descricao || values[i][6]);
      values[i][7] = String(dados.unidade_distribuicao || values[i][7]);
      values[i][8] = String(dados.elemento_despesa || values[i][8]);
      values[i][9] = String(dados.termos_busca || values[i][9]);
      values[i][10] = String(dados.status || values[i][10]);
      values[i][11] = String(dados.link_nota_fiscal || values[i][11]);
      alterado = true;
      break;
    }
  }
  
  if (alterado) {
    range.setValues(values);
    return { success: true };
  }
  return { success: false, message: "Item99 não localizado." };
}

function excluirItem99Principal(ss, params) {
  // params: [item99Codigo]
  const item99Codigo = params[0];
  const sheet = ss.getSheetByName("item99");
  if (!sheet) return { success: false, message: "Aba item99 não encontrada." };
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, message: "Nenhum item99 cadastrado." };
  
  const range = sheet.getRange(2, 1, lastRow - 1, 12);
  const values = range.getValues();
  const novosValores = [];
  
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][5]) === String(item99Codigo)) {
      continue;
    }
    novosValores.push(values[i]);
  }
  
  sheet.getRange(2, 1, lastRow - 1, 12).clearContent();
  if (novosValores.length > 0) {
    sheet.getRange(2, 1, novosValores.length, 12).setValues(novosValores);
  }
  return { success: true };
}

function atualizarStatusItem99(ss, params) {
  // params: [item99Codigo, novoStatus]
  const item99Codigo = params[0];
  const novoStatus = params[1];
  const sheet = ss.getSheetByName("item99");
  if (!sheet) return { success: false, message: "Aba item99 não encontrada." };
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, message: "Nenhum item99 cadastrado." };
  
  const range = sheet.getRange(2, 1, lastRow - 1, 12);
  const values = range.getValues();
  let alterado = false;
  
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][5]) === String(item99Codigo)) {
      values[i][10] = String(novoStatus);
      alterado = true;
      break;
    }
  }
  
  if (alterado) {
    range.setValues(values);
    return { success: true };
  }
  return { success: false, message: "Item99 não localizado." };
}

// ============================================================================
// STATUS DE BLOQUEIO DE RELATÓRIO
// ============================================================================

function verificarStatusBloqueio(ss, params) {
  // params: [municipio, convenio, ano, mes]
  const municipio = params[0];
  const convenio = params[1];
  const ano = params[2];
  const mes = params[3];
  
  const sheet = ss.getSheetByName("obsgeral");
  if (!sheet) return "desbloqueado";
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return "desbloqueado";
  
  const values = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][1]) === String(municipio) &&
        String(values[i][2]) === String(convenio) &&
        String(values[i][3]) === String(ano) &&
        String(values[i][4]) === String(mes)) {
      return String(values[i][7] || "").toUpperCase() === "SIM" ? "bloqueado" : "desbloqueado";
    }
  }
  return "desbloqueado";
}

function atualizarStatusEdicao(ss, params) {
  // params: [municipio, convenio, ano, mes, status]
  const municipio = params[0];
  const convenio = params[1];
  const ano = params[2];
  const mes = params[3];
  const status = params[4]; // "SIM" ou "NAO"
  
  const sheet = ss.getSheetByName("obsgeral");
  if (!sheet) return { success: false, message: "Aba obsgeral não encontrada." };
  
  const lastRow = sheet.getLastRow();
  const timestamp = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");
  
  if (lastRow <= 1) {
    sheet.appendRow([
      timestamp, String(municipio), String(convenio), String(ano), String(mes),
      "", "", String(status), "NAO"
    ]);
    return { success: true };
  }
  
  const range = sheet.getRange(2, 1, lastRow - 1, 9);
  const values = range.getValues();
  let localizado = false;
  
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][1]) === String(municipio) &&
        String(values[i][2]) === String(convenio) &&
        String(values[i][3]) === String(ano) &&
        String(values[i][4]) === String(mes)) {
      values[i][7] = String(status);
      values[i][0] = timestamp;
      localizado = true;
      break;
    }
  }
  
  if (localizado) {
    range.setValues(values);
  } else {
    sheet.appendRow([
      timestamp, String(municipio), String(convenio), String(ano), String(mes),
      "", "", String(status), "NAO"
    ]);
  }
  return { success: true };
}
