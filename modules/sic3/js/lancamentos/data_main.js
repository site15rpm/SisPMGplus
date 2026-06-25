window.formularioMaterial = null;
var itensParaSalvarNaPrimaria = [];
var valoresOriginais = {
  principal: [],
  abastecimento: [],
  manutencao: [],
  obsgeral: { texto: "" }
};

function agregarDadosGrupo(rows) {
    const totalQuantidade = rows.reduce((sum, row) => sum + formatarNumero($(row).find(".quantidade-item").text(), "numero"), 0);
    const totalSubtotal = rows.reduce((sum, row) => sum + formatarNumero($(row).find(".subtotal-item").text(), "numero"), 0);
    const dataMaisRecente = obterDataMaisRecente(rows.map(row => $(row).find(".data-item").text()));
    
    const notasFiscais = rows.map(row => {
        return $(row).find('.notaFiscal-item').text().trim();
    }).filter(nf => nf);

    const notasUnicas = [...new Set(notasFiscais)];

    const observacoes = notasUnicas.length > 0 
        ? `NFnº.: ${notasUnicas.join('; ')}` 
        : "";

    return { totalQuantidade, totalSubtotal, dataMaisRecente, observacoes };
}

async function criarOuAtualizarLinhaPrincipal(chave, dados) {
    let linhaExistente = $(`.principal-table tbody tr`).filter(function() {
        return $(this).find('.descricao-item').text().trim() === chave.trim();
    });

    if (linhaExistente.length > 0) {
        linhaExistente.find(".quantidade-item").text(formatarNumero(dados.quantidade, 'decimal'));
        linhaExistente.find(".valorUnitario-item").text(formatarNumero(dados.valorUnitario, 'moeda'));
        linhaExistente.find(".subtotal-item").text(formatarNumero(dados.subtotal, 'moeda'));
        linhaExistente.find(".observacao-item").text(dados.observacao || "");
    } else {
        inserirLinhaTabela(dados);
    }
    
    if (typeof salvarBackupLocal === 'function') salvarBackupLocal();
}

function encontrarDadosPrincipaisPorDescricao(descricao, returnJqueryObject) {
    const returnAsJquery = returnJqueryObject === true;

    let dados = null;
    let $linhaEncontrada = $();
    $('.principal-table tbody tr').each(function() {
        const $row = $(this);
        if ($row.find('.descricao-item').text().trim() === descricao) {
            $linhaEncontrada = $row;
            dados = {
                linhaId: this.id,
                codigoItem: $row.find('.codigo-item').text(),
                descricao: $row.find('.descricao-item').text(),
                despesa: $row.find('.despesa-item').text(),
                unidade: $row.find('.unidade-item').text(),
                data: $row.find('.data-item').text(),
                quantidade: $row.find('.quantidade-item').text(),
                valorUnitario: $row.find('.valorUnitario-item').text(),
                observacao: $row.find('.observacao-item').text()
            };
            return false;
        }
    });
    return returnAsJquery ? $linhaEncontrada : dados;
}

async function buscarDadosRelatorio() {
  try {
    const resultado = {
      principal: [],
      abastecimento: [],
      manutencao: [],
      obsgeral: { texto: "" }
    };
    const sheetId = idbase;

    const idBDItem99 = window.idBDItem99 || sessionStorage.getItem("sic3_idBDItem99");
    let queryItem99 = Promise.resolve([]);
    
    if (idBDItem99) {
      queryItem99 = carregarDadosPlanilha({
        sheetId: idBDItem99,
        sheet: "item99",
        query: `SELECT F,G,H,I,J,K,L WHERE B='${municipio}' AND C='${convenio}' AND D='${ano}' AND E='${mes}'`
      }).catch(err => {
        console.warn("[SIC3] Não foi possível carregar os metadados dos itens 99:", err);
        return [];
      });
    }

    const queries = [
      carregarDadosPlanilha({
        sheetId: sheetId,
        sheet: "principal",
        query: `SELECT G,H,I,J,K,L,M,N,O WHERE B='${municipio}' AND C='${convenio}' AND D='${ano}' AND E='${mes}'`
      }),
      carregarDadosPlanilha({
        sheetId: sheetId,
        sheet: "abastecimento",
        query: `SELECT G,H,I,J,K,L,M,N,O,P,Q WHERE B='${municipio}' AND C='${convenio}' AND D='${ano}' AND E='${mes}'`
      }),
      carregarDadosPlanilha({
        sheetId: sheetId,
        sheet: "manutencao",
        query: `SELECT G,H,I,J,K,L,M,N,O,P WHERE B='${municipio}' AND C='${convenio}' AND D='${ano}' AND E='${mes}'`
      }),
      carregarDadosPlanilha({
        sheetId: sheetId,
        sheet: "obsgeral",
        query: `SELECT G WHERE B='${municipio}' AND C='${convenio}' AND D='${ano}' AND E='${mes}'`
      }),
      queryItem99
    ];

    const [principalData, abastecimentoData, manutencaoData, obsgeralData, item99Data] = await Promise.all(queries);
    
    // Mapeia os itens 99 encontrados pelo código do item99
    const item99Map = new Map();
    if (Array.isArray(item99Data)) {
      item99Data.forEach(row => {
        const code = String(row[0] || "").trim();
        if (code) {
          item99Map.set(code, {
            codigo: code,
            descricao: row[1] || "",
            unidade: row[2] || "",
            elementoDespesa: row[3] || "",
            searchTerms: row[4] || "",
            status: row[5] || "",
            linkNotaFiscal: row[6] || ""
          });
        }
      });
    }

    resultado.principal = principalData.map((row) => {
        const codigoMat = row[0] || "";
        const isItem99 = String(codigoMat).startsWith("99");
        let item99Info = null;
        if (isItem99 && item99Map.has(String(codigoMat).trim())) {
          item99Info = item99Map.get(String(codigoMat).trim());
        }

        return {
            codigo: codigoMat,
            descricao: row[1] || "",
            despesa: row[2] || "",
            unidade: row[3] || "",
            data: row[4] || "",
            quantidade: row[5] || "",
            valorUnitario: row[6] || "",
            subtotal: row[7] || 0,
            observacao: row[8] || "",
            item99Info: item99Info
        };
    });

    resultado.abastecimento = abastecimentoData.map((row) => ({
      data: row[0] || "",
      hora: row[1] || "",
      placa: row[2] || "",
      prefixo: row[3] || "",
      odometro: row[4] || "",
      motorista: row[5] || "",
      tipo: row[6] || "",
      quantidade: row[7] || "",
      valorUnitario: row[8] || "",
      subtotal: row[9] || "",
      notaFiscal: row[10] || ""
    }));

    resultado.manutencao = manutencaoData.map((row) => ({
      tipo: "",
      data: row[0] || "",
      placa: row[1] || "",
      prefixo: row[2] || "",
      odometro: row[3] || "",
      responsavel: row[4] || "",
      descricao: row[5] || "",
      quantidade: row[6] || "",
      valorUnitario: row[7] || "",
      subtotal: row[8] || "",
      notaFiscal: row[9] || ""
    }));

    resultado.obsgeral = { texto: (obsgeralData[0] && obsgeralData[0][0]) || "" };

    return resultado;
  } catch (error) {
    console.error("Erro ao buscar dados:", error);
    manipularErro(error, "buscarDadosRelatorio");
    throw error;
  }
}

function preencherTabelaPrincipal(dados) {
  if (!Array.isArray(dados)) return;
  $(".principal-table tbody").empty();
  dados.forEach((linha) => { inserirLinhaTabela(linha); });
  ocultarCarregamento();
}

function atualizarNumeracaoLinhas() {
  $(".principal-table tbody tr.linha-principal").each(function(index) {
    $(this).find(".numero-item").text(index + 1);
  });
}

function ordenarLinhas() {
  const $tbody = $(".principal-table tbody");
  
  const getSortKey = (code, despesa) => {
    if (code.startsWith("O")) return 1;
    if (despesa.includes("3026")) return 4;
    if (despesa.includes("3023") || despesa.includes("3918")) return 3;
    return 2;
  };

  const rowsToSort = $tbody.find("tr.linha-principal").map(function() {
    const $row = $(this);
    const code = $row.find(".codigo-item").text();
    const despesa = $row.find(".despesa-item").text();
    const descricao = $row.find(".descricao-item").text();
    
    return {
      row: this,
      sortKey: getSortKey(code, despesa),
      despesa: despesa,
      descricao: descricao
    };
  }).get();

  rowsToSort.sort((a, b) => {
    if (a.sortKey !== b.sortKey) {
      return a.sortKey - b.sortKey;
    }
    if (a.despesa !== b.despesa) {
      return a.despesa.localeCompare(b.despesa, undefined, { numeric: true });
    }
    return a.descricao.localeCompare(b.descricao, undefined, { numeric: true });
  });

  const sortedRows = rowsToSort.map(item => item.row);
  $tbody.append(sortedRows);
}


function calcularTotalTabela() {
  const total = $(".principal-table tbody tr.linha-principal .subtotal-item")
    .toArray()
    .reduce((acc, el) => acc + formatarNumero($(el).text(), "numero"), 0);
  $(".principal-table tfoot .total-valor").text(formatarNumero(total, "moeda"));
}

function inserirLinhaTabela(linha) {
  if (!linha || typeof linha.codigo === 'undefined') {
      console.error("Tentativa de inserir linha inválida na tabela principal:", linha);
      return;
  }
  
  const despesa = linha.despesa || "";
  const isSummary = despesa.includes("3023") || despesa.includes("3026") || despesa.includes("3918");
  const newRowId = "linha-principal-" + Math.random().toString(36).substr(2, 9); 

  const novaLinhaHtml = `
    <tr class="linha-principal" id="${newRowId}">
      <td class="numero-item"></td>
      <td class="codigo-item">${linha.codigo || ""}</td>
      <td class="descricao-item">${linha.descricao || ""}</td>
      <td class="despesa-item">${linha.despesa || ""}</td>
      <td class="unidade-item">${linha.unidade || ""}</td>
      <td class="data-item">${linha.data || ""}</td>
      <td class="quantidade-item">${formatarNumero(linha.quantidade, "decimal")}</td>
      <td class="valorUnitario-item">${formatarNumero(linha.valorUnitario, "moeda")}</td>
      <td class="subtotal-item">${formatarNumero(linha.subtotal, "moeda")}</td>
      <td class="observacao-item">${linha.observacao || ""}</td>
      <td class="acao-item" style="display: ${!isSummary ? 'table-cell' : 'none'};">
        ${!isSummary ? `
          <button type="button" class="btn-editar btn-warning" title="Editar"><i class="fas fa-edit"></i></button>
          <button type="button" class="btn-excluir btn-danger" title="Excluir"><i class="fas fa-trash"></i></button>
        ` : ""}
      </td>
    </tr>`;
  $(".principal-table tbody").append(novaLinhaHtml);
  
  if (linha.fileData) {
      $("#" + newRowId).attr('data-file-info', JSON.stringify(linha.fileData));
  }
  
  if (linha.item99Info) {
      $("#" + newRowId).attr('data-item99-info', JSON.stringify(linha.item99Info));
  }


  ordenarLinhas();
  atualizarNumeracaoLinhas();
  calcularTotalTabela();
  atualizarVisibilidadeContainers();
  
  return newRowId; 
}


async function editarRelatorio() {
  console.log("[SIC3 Backup] editarRelatorio acionado.");
  if (!window.formularioMaterial || !$.fn.DataTable.isDataTable('#dataTable')) {
    window.formularioMaterial = { tipo: "material" };
    await carregarPesquisaMaterial();
  }

  const chave = obterChaveBackup();
  console.log(`[SIC3 Backup] Verificando backup local sob a chave: ${chave}`);
  const backupRaw = await storageGet(chave);
  console.log(`[SIC3 Backup] Conteúdo bruto retornado do storage para a chave ${chave}:`, backupRaw);
  
  let temBackup = false;
  if (backupRaw) {
    try {
      const backupObj = typeof backupRaw === 'string' ? JSON.parse(backupRaw) : backupRaw;
      temBackup = backupObj && (
        (backupObj.principal && backupObj.principal.length > 0) ||
        (backupObj.abastecimento && backupObj.abastecimento.length > 0) ||
        (backupObj.manutencao && backupObj.manutencao.length > 0)
      );
      console.log(`[SIC3 Backup] Análise do objeto de backup concluída. Possui dados principais: ${backupObj.principal?.length || 0}, abastecimento: ${backupObj.abastecimento?.length || 0}, manutenção: ${backupObj.manutencao?.length || 0}. Resultado temBackup: ${temBackup}`);
    } catch (e) {
      console.error("[SIC3 Backup] Falha ao analisar o JSON do backup:", e);
      temBackup = false;
    }
  } else {
    console.log("[SIC3 Backup] Nenhum backup prévio foi encontrado para este relatório.");
  }
  
  let backupRecuperado = false;
  let desejaRecuperar = false;

  if (temBackup) {
    desejaRecuperar = await confirmarAcao("Recuperar Dados", "Foi detectada uma edição anterior que não foi salva. Deseja recuperar os dados não salvos da última edição?");
    if (desejaRecuperar) {
      backupRecuperado = await recuperarBackupLocal();
      console.log(`[SIC3 Backup] Recuperação de backup executada. Status: ${backupRecuperado}`);
    }
  }

  const showSelectors = [".principal-table th.acao-item, .btn-inserirAbastecimento", ".btn-inserirManutencao", ".btn-salvarDados", ".btn-cancelarEdicao", ".outrosDropdown-toggle", ".pesquisa-container"];
  const hideSelectors = [".btn-infoConvenio", ".btn-editarDados", ".btn-gerarAnexoD", ".btn-gerarAnexoUnico"];

  showSelectors.forEach(selector => $(selector).show());
  hideSelectors.forEach(selector => $(selector).hide());

  $(".principal-table tbody tr.linha-principal").each(function() {
    const $row = $(this);
    const codigo = $row.find(".codigo-item").text();
    const despesa = $row.find(".despesa-item").text();
    const isSummary = codigo.includes("000025593") || despesa.includes("3023") || despesa.includes("3026");
    if (!isSummary) {
      $row.find(".acao-item").css("display", "table-cell");
    }
  });
  
  $(".abastecimento-table .acao-item, .manutencao-table .acao-item").css("display", "table-cell");

  document.querySelector(".obsgeral")?.classList.add("editavel");

  window.backupAtivo = true;
  console.log("[SIC3 Backup] window.backupAtivo ativado (definido como true). Gravações locais serão acionadas.");
}


async function cancelarEdicao() {
  const confirmResult = await confirmarAcao("Confirmar Cancelamento", "Todos os dados editados e não salvos serão perdidos. Deseja continuar?");
  if (!confirmResult) return;

  window.backupAtivo = false;

  try {
    const isInitialLaunchMode = (!valoresOriginais.principal || valoresOriginais.principal.length === 0) &&
                                (!valoresOriginais.abastecimento || valoresOriginais.abastecimento.length === 0) &&
                                (!valoresOriginais.manutencao || valoresOriginais.manutencao.length === 0);

    if (isInitialLaunchMode) {
      $(".principal-table tbody, .abastecimento-table tbody, .manutencao-table tbody").empty();
      $(".obsgeral").text("SEM OBSERVACOES").addClass("editavel");

      await atualizarTotaisInfoAbastecimento();
      await atualizarTotaisInfoManutencao();
      calcularTotalTabela();
      atualizarNumeracaoLinhas();
      $(".acao-item, .btn-inserirAbastecimento, .btn-inserirManutencao, .btn-salvarDados, .btn-cancelarEdicao, .outrosDropdown-toggle, .pesquisa-container").css("display", function() { return this.tagName === "TD" ? "table-cell" : "block"; });
      $(".btn-infoConvenio, .btn-editarDados, .btn-gerarAnexoD, .btn-gerarAnexoUnico").hide();
      if (window.formularioMaterial?.table) {
        window.formularioMaterial.table.destroy();
        delete window.formularioMaterial.table;
      }
      if ($.fn.DataTable.isDataTable('#dataTable')) {
          $('#dataTable').DataTable().search('').columns().search('').draw();
      }
      window.formularioOutrosItens = {};
      window.backupAtivo = true;

    } else {
      $(".btn-gerarAnexoD, .btn-gerarAnexoUnico").show();
      await preencherTabelaPrincipal(valoresOriginais.principal);
      await preencherTabelaAbastecimento(valoresOriginais.abastecimento);
      await preencherTabelaManutencao(valoresOriginais.manutencao);
      $(".obsgeral").text(valoresOriginais.obsgeral.texto || "SEM OBSERVACOES").removeClass("editavel");

      await atualizarTotaisInfoAbastecimento();
      await atualizarTotaisInfoManutencao();

      const hideSelectors = [".acao-item", ".btn-inserirAbastecimento", ".btn-inserirManutencao", ".btn-salvarDados", ".btn-cancelarEdicao", ".outrosDropdown-toggle", ".pesquisa-container"];
      const showSelectors = [".btn-infoConvenio", ".btn-editarDados"];

      showSelectors.forEach(selector => $(selector).show());
      hideSelectors.forEach(selector => $(selector).hide());
      
      if (window.formularioMaterial?.table) {
        window.formularioMaterial.table.destroy();
        delete window.formularioMaterial.table;
      }
       if ($.fn.DataTable.isDataTable('#dataTable')) {
          $('#dataTable').DataTable().search('').columns().search('').draw();
      }
      window.formularioOutrosItens = {};
    }
    atualizarVisibilidadeContainers();
  } catch (error) {
    manipularErro(error, "cancelarEdicao");
  }
}

async function salvarDados() {
  const confirmResult = await confirmarAcao("Confirmar Salvamento", "Deseja salvar os dados?");
  if (!confirmResult) return;

  mostrarCarregamento("Aguarde, salvando relatório...");

  try {
    const authToken = sessionStorage.getItem('authToken') || '';

    const dadosCompletos = {
      principal: formatarDadosPrincipais(),
      abastecimento: formatarDadosAbastecimento(),
      manutencao: formatarDadosManutencao(),
      obsgeral: formatarObservacoes(),
      valorTotal: $(".principal-table tfoot .total-valor").text()
    };

    // Dispara o salvamento dos itens primários em segundo plano (fire-and-forget)
    if (itensParaSalvarNaPrimaria.length > 0) {
        google.script.run.salvarItensPrimariosEmLote(itensParaSalvarNaPrimaria);
    }

    // Aguarda apenas o salvamento do relatório principal
    const resultFinal = await new Promise((resolve, reject) => {
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .salvarDadosNaPlanilha(authToken, municipio, convenio, ano, mes, dadosCompletos);
    });

    if (resultFinal && resultFinal.success) {
      // Limpa a fila local após o sucesso do salvamento principal
      itensParaSalvarNaPrimaria = [];
      window.backupAtivo = false;
      await apagarBackupLocal();

      const mapeamento = resultFinal.mapeamento;
      if (mapeamento && Object.keys(mapeamento).length > 0) {
        Object.keys(mapeamento).forEach(placeholderId => {
          const rowToUpdate = document.getElementById(placeholderId);
          if (rowToUpdate) {
            $(rowToUpdate).find('.codigo-item').text(mapeamento[placeholderId]);
            const itemInfoAttr = $(rowToUpdate).attr('data-item99-info');
            if (itemInfoAttr) {
              const itemInfo = JSON.parse(itemInfoAttr);
              itemInfo.isNew = false;
              $(rowToUpdate).attr('data-item99-info', JSON.stringify(itemInfo));
            }
            $(rowToUpdate).removeAttr('data-item99-placeholder-id');
          } else {
            console.warn(`[LOG-CLIENTE] AVISO: Linha com placeholderId ${placeholderId} não encontrada no DOM para atualização.`);
          }
        });
      }

      const isReportEmpty = (!dadosCompletos.principal || dadosCompletos.principal.length === 0) &&
                           (!dadosCompletos.abastecimento || dadosCompletos.abastecimento.length === 0) &&
                           (!dadosCompletos.manutencao || dadosCompletos.manutencao.length === 0);
      
      const dadosDaTabelaParaCache = formatarDadosPrincipais(true).map(rowWrapper => {
          const rowArray = rowWrapper[0];
          return {
              codigo: rowArray[1] || "",
              descricao: rowArray[2] || "",
              despesa: rowArray[3] || "",
              unidade: rowArray[4] || "",
              data: rowArray[5] || "",
              quantidade: rowArray[6] || "",
              valorUnitario: rowArray[7] || "",
              subtotal: rowArray[8] || "",
              observacao: rowArray[9] || ""
          };
      });

      valoresOriginais = {
          principal: copiarDados(dadosDaTabelaParaCache),
          abastecimento: copiarDados(dadosCompletos.abastecimento.map(d => ({...d}))),
          manutencao: copiarDados(dadosCompletos.manutencao.map(d => ({...d}))),
          obsgeral: copiarDados(dadosCompletos.obsgeral)
      };
      
      if (acao == "lancar") acao = "editar";

      if (isReportEmpty) {
        $(".principal-table tbody, .abastecimento-table tbody, .manutencao-table tbody").empty();
        $(".obsgeral").text("SEM OBSERVACOES").addClass("editavel");
        await atualizarTotaisInfoAbastecimento();
        await atualizarTotaisInfoManutencao();
        calcularTotalTabela();
        atualizarNumeracaoLinhas();
        atualizarVisibilidadeContainers();
        mostrarDialogo("Sucesso", "Dados salvos com sucesso! O relatório está vazio.");
      } else {
        const hideSelectors = [".acao-item", ".btn-inserirAbastecimento", ".btn-inserirManutencao", ".btn-salvarDados", ".btn-cancelarEdicao", ".outrosDropdown-toggle", ".pesquisa-container"];
        const showSelectors = [".btn-infoConvenio", ".btn-editarDados", ".btn-gerarAnexoD", ".btn-gerarAnexoUnico"];
        showSelectors.forEach(selector => $(selector).show());
        hideSelectors.forEach(selector => $(selector).hide());
        $(".editavel").removeClass("editavel");
        mostrarDialogo("Sucesso", "Dados salvos com sucesso!");
      }
      return true;
    } else {
      throw new Error(resultFinal.message || "Falha ao salvar o relatório completo.");
    }
  } catch (error) {
    manipularErro(error, "salvarDados");
    await cancelarEdicao(); 
    return false;
  } finally {
    ocultarCarregamento();
  }
}


function copiarDados(dados) {
  return JSON.parse(JSON.stringify(dados));
}

function formatarDadosPrincipais(getFromDOM = false) {
  return $(".principal-table tbody tr.linha-principal").map(function() {
    const $row = $(this);
    const rowDataArray = formatarLinhaPrincipalParaArray($row);

    if (getFromDOM) {
        return [rowDataArray.slice(0, 10)];
    }

    const item99InfoAttr = $row.attr('data-item99-info');
    const item99Info = item99InfoAttr ? JSON.parse(item99InfoAttr) : null;
    
    console.log('[formatarDadosPrincipais] Processando linha:', $row.attr('id'), 'item99Info:', item99Info);
    
    const item99PlaceholderId = $row.attr('data-item99-placeholder-id') || this.id;
    
    const fileInfoAttr = $row.attr('data-file-info');
    const fileInfo = fileInfoAttr ? JSON.parse(fileInfoAttr) : null;
    
    rowDataArray[10] = item99Info ? JSON.stringify(item99Info) : null;
    rowDataArray[11] = item99PlaceholderId || null;
    if (fileInfo) {
        rowDataArray[12] = fileInfo.base64Data;
        rowDataArray[13] = fileInfo.mimeType;
    } else {
        rowDataArray[12] = null;
        rowDataArray[13] = null;
    }
    
    return [rowDataArray];
  }).get();
}

function formatarLinhaPrincipalParaArray($row) {
    return [
      $row.find(".numero-item").text(), 
      $row.find(".codigo-item").text(),
      $row.find(".descricao-item").text(), 
      $row.find(".despesa-item").text(),
      $row.find(".unidade-item").text(), 
      $row.find(".data-item").text(),
      $row.find(".quantidade-item").text(), 
      $row.find(".valorUnitario-item").text(),
      $row.find(".subtotal-item").text(), 
      $row.find(".observacao-item").text(),
      null,
      null,
      null,
      null
    ];
}


function formatarDadosAbastecimento() {
  return $(".abastecimento-table tbody tr").map(function() {
    const $row = $(this);
    return [[
      $row.find(".numero-item").text(), $row.find(".data-item").text(),
      $row.find(".hora-item").text(),
      $row.find(".placa-item").text(), $row.find(".prefixo-item").text(),
      $row.find(".odometro-item").text(), $row.find(".motorista-item").text(),
      $row.find(".tipo-item").text(), $row.find(".quantidade-item").text(),
      $row.find(".valorUnitario-item").text(), $row.find(".subtotal-item").text(),
      $row.find(".notaFiscal-item").text()
    ]];
  }).get();
}

function formatarDadosManutencao() {
  return $(".manutencao-table tbody tr").map(function() {
    const $row = $(this);
    return [[
      $row.find(".numero-item").text(), $row.find(".data-item").text(),
      $row.find(".placa-item").text(), $row.find(".prefixo-item").text(),
      $row.find(".odometro-item").text(), $row.find(".responsavel-item").text(),
      $row.find(".descricao-item").text(), $row.find(".quantidade-item").text(),
      $row.find(".valorUnitario-item").text(), $row.find(".subtotal-item").text(),
      $row.find(".notaFiscal-item").text()
    ]];
  }).get();
}

function formatarObservacoes() {
  return { dados: [$(".obsgeral").text()] };
}

async function configurarEventosDados() {
  $(document).on("click", ".obsgeral.editavel", function() {
    const currentText = $(this).text().trim() == "SEM OBSERVACOES" ? "" : $(this).text().trim();
    const dialogHtml = `<div class="dialog-form"><textarea id="dialog-observacao">${currentText}</textarea></div>`;
    $("#dialog-message").empty().html(dialogHtml).dialog({
      title: "Editar Observação Geral", modal: true, width: "auto",
      buttons: {
        SALVAR: function() {
          $(".obsgeral").text($("#dialog-observacao").val().trim() || "SEM OBSERVACOES");
          $(this).dialog("close");
          if (typeof salvarBackupLocal === 'function') salvarBackupLocal();
        },
        CANCELAR: function() { $(this).dialog("close"); }
      },
      close: function() { $(this).dialog('destroy'); $(this).empty();}
    }).dialog("open");
  });
  
  $(document).on("click", ".observacao-item, .descricao-item, .despesa-item, .unidade-item", function() {
    mostrarDialogo("Visualização completa", $(this).text());
  });

  $(document).on("click", ".obsgeral:not(.editavel)", function() {
    mostrarDialogo("Observação Geral", $(this).text());
  });

  $(document).on("input", ".abastecimento-container .filtro-tabela", function() {
    const termo = $(this).val().toLowerCase().trim();
    $(".abastecimento-table tbody tr").each(function() {
      const $row = $(this);
      const placa = $row.find(".placa-item").text().toLowerCase();
      const prefixo = $row.find(".prefixo-item").text().toLowerCase();
      const tipo = $row.find(".tipo-item").text().toLowerCase();
      const matches = placa.includes(termo) || prefixo.includes(termo) || tipo.includes(termo);
      $row.toggle(matches);
    });
  });

  $(document).on("input", ".manutencao-container .filtro-tabela", function() {
    const termo = $(this).val().toLowerCase().trim();
    $(".manutencao-table tbody tr").each(function() {
      const $row = $(this);
      const placa = $row.find(".placa-item").text().toLowerCase();
      const prefixo = $row.find(".prefixo-item").text().toLowerCase();
      const descricao = $row.find(".descricao-item").text().toLowerCase();
      const matches = placa.includes(termo) || prefixo.includes(termo) || descricao.includes(termo);
      $row.toggle(matches);
    });
  });
}

function atualizarVisibilidadeContainers() {
  $(".principal-container").toggle($(".principal-table tbody tr").length > 0);
  $(".abastecimento-container").toggle($(".abastecimento-table tbody tr").length > 0);
  $(".manutencao-container").toggle($(".manutencao-table tbody tr").length > 0);
}

// ==========================================
// SISTEMA DE BACKUP LOCAL (Lançamento/Edição)
// ==========================================

// ==========================================
// AUXILIARES DE ARMAZENAMENTO ASSÍNCRONO RESILIENTES
// ==========================================

function obterStorageLocal() {
  try {
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      return browser.storage.local;
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return chrome.storage.local;
    }
  } catch (e) {
    console.warn("[SIC3 Storage] Erro ao obter API de storage do browser:", e);
  }
  return null;
}

function storageGet(chave) {
  console.log(`[SIC3 Storage] Solicitando leitura para chave: ${chave}`);
  return new Promise((resolve) => {
    try {
      const storage = obterStorageLocal();
      if (storage) {
        storage.get([chave], (result) => {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
            console.error("[SIC3 Storage] Erro no storageGet (chrome.runtime.lastError):", chrome.runtime.lastError);
            fallbackGet(chave, resolve);
          } else {
            const data = result && result[chave] ? result[chave] : null;
            console.log(`[SIC3 Storage] Leitura bem-sucedida do chrome.storage.local. Registro encontrado:`, data !== null);
            resolve(data);
          }
        });
      } else {
        fallbackGet(chave, resolve);
      }
    } catch (err) {
      console.warn("[SIC3 Storage] Falha ao usar chrome.storage para leitura, caindo para localStorage:", err);
      fallbackGet(chave, resolve);
    }
  });
}

function fallbackGet(chave, resolve) {
  try {
    const val = localStorage.getItem(chave);
    if (val) {
      console.log(`[SIC3 Storage] Leitura do localStorage encontrou registro.`);
      try {
        resolve(JSON.parse(val));
      } catch (e) {
        resolve(val);
      }
    } else {
      console.log(`[SIC3 Storage] Leitura do localStorage: Nenhuma chave encontrada.`);
      resolve(null);
    }
  } catch (e) {
    console.error("[SIC3 Storage] Erro no fallbackGet:", e);
    resolve(null);
  }
}

function storageSet(chave, valor) {
  console.log(`[SIC3 Storage] Solicitando gravação para chave: ${chave}`, valor);
  return new Promise((resolve) => {
    try {
      const storage = obterStorageLocal();
      if (storage) {
        storage.set({ [chave]: valor }, () => {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
            console.error("[SIC3 Storage] Erro no storageSet (chrome.runtime.lastError):", chrome.runtime.lastError);
            fallbackSet(chave, valor, resolve);
          } else {
            console.log(`[SIC3 Storage] Gravação bem-sucedida no chrome.storage.local.`);
            resolve();
          }
        });
      } else {
        fallbackSet(chave, valor, resolve);
      }
    } catch (err) {
      console.warn("[SIC3 Storage] Falha ao usar chrome.storage para gravação, caindo para localStorage:", err);
      fallbackSet(chave, valor, resolve);
    }
  });
}

function fallbackSet(chave, valor, resolve) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
    console.log(`[SIC3 Storage] Gravação bem-sucedida no localStorage.`);
  } catch (e) {
    console.error("[SIC3 Storage] Erro no fallbackSet de localStorage:", e);
  }
  resolve();
}

function storageRemove(chave) {
  console.log(`[SIC3 Storage] Solicitando remoção para chave: ${chave}`);
  return new Promise((resolve) => {
    try {
      const storage = obterStorageLocal();
      if (storage) {
        storage.remove([chave], () => {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
            console.error("[SIC3 Storage] Erro no storageRemove (chrome.runtime.lastError):", chrome.runtime.lastError);
            fallbackRemove(chave, resolve);
          } else {
            console.log(`[SIC3 Storage] Remoção bem-sucedida no chrome.storage.local.`);
            resolve();
          }
        });
      } else {
        fallbackRemove(chave, resolve);
      }
    } catch (err) {
      console.warn("[SIC3 Storage] Falha ao usar chrome.storage para remoção, caindo para localStorage:", err);
      fallbackRemove(chave, resolve);
    }
  });
}

function fallbackRemove(chave, resolve) {
  try {
    localStorage.removeItem(chave);
    console.log(`[SIC3 Storage] Remoção bem-sucedida no localStorage.`);
  } catch (e) {
    console.error("[SIC3 Storage] Erro no fallbackRemove de localStorage:", e);
  }
  resolve();
}

function obterChaveBackup() {
  const muniStr = typeof window.municipio !== 'undefined' ? window.municipio : (typeof municipio !== 'undefined' ? municipio : '');
  const convStr = typeof window.convenio !== 'undefined' ? window.convenio : (typeof convenio !== 'undefined' ? convenio : '');
  const anoStr = typeof window.ano !== 'undefined' ? window.ano : (typeof ano !== 'undefined' ? ano : '');
  const mesStr = typeof window.mes !== 'undefined' ? window.mes : (typeof mes !== 'undefined' ? mes : '');
  const chave = `sic3_backup_${muniStr}_${convStr}_${anoStr}_${mesStr}`;
  console.log(`[SIC3 Backup] obterChaveBackup gerou a chave: ${chave}`);
  return chave;
}

async function salvarBackupLocal() {
  console.log(`[SIC3 Backup] salvarBackupLocal acionado. backupAtivo: ${window.backupAtivo}`);
  if (!window.backupAtivo) return;
  try {
    const chave = obterChaveBackup();
    
    const principal = $(".principal-table tbody tr.linha-principal").toArray().map(tr => {
      const $row = $(tr);
      const item99InfoAttr = $row.attr('data-item99-info');
      const fileInfoAttr = $row.attr('data-file-info');
      
      let item99Info = null;
      if (item99InfoAttr) {
        try {
          item99Info = JSON.parse(item99InfoAttr);
        } catch (err) {
          console.warn("[SIC3 Backup] Falha ao analisar JSON de data-item99-info:", err, item99InfoAttr);
        }
      }
      
      let fileData = null;
      if (fileInfoAttr) {
        try {
          fileData = JSON.parse(fileInfoAttr);
        } catch (err) {
          console.warn("[SIC3 Backup] Falha ao analisar JSON de data-file-info:", err, fileInfoAttr);
        }
      }

      return {
        codigo: $row.find(".codigo-item").text(),
        descricao: $row.find(".descricao-item").text(),
        despesa: $row.find(".despesa-item").text(),
        unidade: $row.find(".unidade-item").text(),
        data: $row.find(".data-item").text(),
        quantidade: $row.find(".quantidade-item").text(),
        valorUnitario: $row.find(".valorUnitario-item").text(),
        subtotal: $row.find(".subtotal-item").text(),
        observacao: $row.find(".observacao-item").text(),
        item99Info: item99Info,
        fileData: fileData
      };
    });

    const abastecimento = $(".abastecimento-table tbody tr").toArray().map(tr => {
      const $row = $(tr);
      return {
        data: $row.find(".data-item").text(),
        hora: $row.find(".hora-item").text(),
        placa: $row.find(".placa-item").text(),
        prefixo: $row.find(".prefixo-item").text(),
        odometro: $row.find(".odometro-item").text(),
        motorista: $row.find(".motorista-item").text(),
        tipo: $row.find(".tipo-item").text(),
        quantidade: $row.find(".quantidade-item").text(),
        valorUnitario: $row.find(".valorUnitario-item").text(),
        subtotal: $row.find(".subtotal-item").text(),
        notaFiscal: $row.find(".notaFiscal-item").text()
      };
    });

    const manutencao = $(".manutencao-table tbody tr").toArray().map(tr => {
      const $row = $(tr);
      return {
        data: $row.find(".data-item").text(),
        placa: $row.find(".placa-item").text(),
        prefixo: $row.find(".prefixo-item").text(),
        odometro: $row.find(".odometro-item").text(),
        responsavel: $row.find(".responsavel-item").text(),
        descricao: $row.find(".descricao-item").text(),
        quantidade: $row.find(".quantidade-item").text(),
        valorUnitario: $row.find(".valorUnitario-item").text(),
        subtotal: $row.find(".subtotal-item").text(),
        notaFiscal: $row.find(".notaFiscal-item").text()
      };
    });

    const obsgeralText = $(".obsgeral").text().trim();

    const dadosBackup = {
      principal,
      abastecimento,
      manutencao,
      obsgeral: { texto: obsgeralText }
    };

    console.log(`[SIC3 Backup] Dados preparados para salvar no backup:`, dadosBackup);
    await storageSet(chave, dadosBackup);
    console.log("[SIC3 Backup] Backup salvo localmente com sucesso.");
  } catch (e) {
    console.error("[SIC3 Backup] Erro grave ao salvar backup local:", e);
  }
}

window.backupAtivo = false;

async function apagarBackupLocal() {
  try {
    const chave = obterChaveBackup();
    await storageRemove(chave);
    console.log("[SIC3 Backup] Backup local removido.");
  } catch (e) {
    console.error("[SIC3 Backup] Erro ao remover backup local:", e);
  }
}

async function recuperarBackupLocal() {
  try {
    const chave = obterChaveBackup();
    const backupRaw = await storageGet(chave);
    if (!backupRaw) return false;

    const backup = typeof backupRaw === 'string' ? JSON.parse(backupRaw) : backupRaw;
    console.log("[SIC3 Backup] Iniciando recuperação do backup:", backup);
    
    mostrarCarregamento("Recuperando dados da última edição...");

    // Limpar tabelas
    $(".principal-table tbody, .abastecimento-table tbody, .manutencao-table tbody").empty();

    // Preencher principal
    if (backup.principal && backup.principal.length) {
      backup.principal.forEach(linha => {
        inserirLinhaTabela(linha);
      });
    }

    // Preencher abastecimento
    if (backup.abastecimento && backup.abastecimento.length && typeof preencherTabelaAbastecimento === 'function') {
      await preencherTabelaAbastecimento(backup.abastecimento);
    }

    // Preencher manutenção
    if (backup.manutencao && backup.manutencao.length && typeof preencherTabelaManutencao === 'function') {
      await preencherTabelaManutencao(backup.manutencao);
    }

    // Preencher observações
    if (backup.obsgeral) {
      $(".obsgeral").text(backup.obsgeral.texto || "SEM OBSERVACOES");
    }

    await atualizarTotaisInfoAbastecimento();
    await atualizarTotaisInfoManutencao();
    calcularTotalTabela();
    atualizarNumeracaoLinhas();
    atualizarVisibilidadeContainers();

    ocultarCarregamento();
    return true;
  } catch (e) {
    console.error("[SIC3 Backup] Erro ao recuperar backup local:", e);
    ocultarCarregamento();
    return false;
  }
}

// Exportações explícitas
window.obterChaveBackup = obterChaveBackup;
window.salvarBackupLocal = salvarBackupLocal;
window.apagarBackupLocal = apagarBackupLocal;
window.recuperarBackupLocal = recuperarBackupLocal;

// ==========================================
// ORDENAÇÃO DE COMBUSTÍVEIS E MANUTENÇÕES
// ==========================================

function ordenarTabelaAbastecimentoDOM() {
  const $tbody = $(".abastecimento-table tbody");
  const rows = $tbody.find("tr").toArray();

  rows.sort((a, b) => {
    const $a = $(a);
    const $b = $(b);

    const dataA = $a.find(".data-item").text().trim();
    const dataB = $b.find(".data-item").text().trim();
    if (dataA !== dataB) {
      return dataA.localeCompare(dataB);
    }

    const horaA = $a.find(".hora-item").text().trim() || "00:00";
    const horaB = $b.find(".hora-item").text().trim() || "00:00";
    if (horaA !== horaB) {
      return horaA.localeCompare(horaB);
    }

    const prefixoA = $a.find(".prefixo-item").text().trim();
    const prefixoB = $b.find(".prefixo-item").text().trim();
    if (prefixoA !== prefixoB) {
      return prefixoA.localeCompare(prefixoB);
    }

    const odometroA = parseInt($a.find(".odometro-item").text().replace(/\D/g, '')) || 0;
    const odometroB = parseInt($b.find(".odometro-item").text().replace(/\D/g, '')) || 0;
    return odometroA - odometroB;
  });

  $tbody.empty().append(rows);
  
  $tbody.find("tr").each((index, tr) => {
    $(tr).find(".numero-item").text(index + 1);
  });
}

function ordenarTabelaManutencaoDOM() {
  const $tbody = $(".manutencao-table tbody");
  const rows = $tbody.find("tr").toArray();

  rows.sort((a, b) => {
    const $a = $(a);
    const $b = $(b);

    const dataA = $a.find(".data-item").text().trim();
    const dataB = $b.find(".data-item").text().trim();
    if (dataA !== dataB) {
      return dataA.localeCompare(dataB);
    }

    const prefixoA = $a.find(".prefixo-item").text().trim();
    const prefixoB = $b.find(".prefixo-item").text().trim();
    if (prefixoA !== prefixoB) {
      return prefixoA.localeCompare(prefixoB);
    }

    const odometroA = parseInt($a.find(".odometro-item").text().replace(/\D/g, '')) || 0;
    const odometroB = parseInt($b.find(".odometro-item").text().replace(/\D/g, '')) || 0;
    return odometroA - odometroB;
  });

  $tbody.empty().append(rows);
  
  $tbody.find("tr").each((index, tr) => {
    $(tr).find(".numero-item").text(index + 1);
  });
}

window.ordenarTabelaAbastecimentoDOM = ordenarTabelaAbastecimentoDOM;
window.ordenarTabelaManutencaoDOM = ordenarTabelaManutencaoDOM;
