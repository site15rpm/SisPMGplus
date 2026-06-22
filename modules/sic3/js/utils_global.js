// Arquivo: modules/sic3/js/utils_global.js
// Utilitários globais migrados para a extensão.

window.contadorCarregamento = window.contadorCarregamento || 0;
window.timerCarregamento = window.timerCarregamento || null;
window.tempoMinimoCarregamento = window.tempoMinimoCarregamento || 500;

window.mostrarCarregamento = function (message = null, color = null) {
  if (window.timerCarregamento) {
    clearTimeout(window.timerCarregamento);
    window.timerCarregamento = null;
  }

  window.contadorCarregamento++;

  const overlay = $(".loading-overlay");
  const messageDiv = overlay.find(".loading-message");

  if (window.contadorCarregamento === 1) {
    messageDiv.text("Aguarde...").css("color", "");
    overlay.css("display", "flex");
  }

  if (message) {
    messageDiv.html(message.replace(/\n/g, '<br>'));
  }

  if (color) {
    messageDiv.css('color', color);
  }
}

window.ocultarCarregamento = function () {
  window.contadorCarregamento--;

  if (window.contadorCarregamento < 0) {
    window.contadorCarregamento = 0;
  }

  if (window.contadorCarregamento === 0) {
    if (window.timerCarregamento) return;

    window.timerCarregamento = setTimeout(() => {
      const overlay = $(".loading-overlay");
      overlay.css("display", "none");
      overlay.find(".loading-message").text("Aguarde...").css("color", "");
      window.timerCarregamento = null;
    }, window.tempoMinimoCarregamento);
  }
}

window.resetarCarregamento = function () {
  window.contadorCarregamento = 0;
  if (window.timerCarregamento) {
    clearTimeout(window.timerCarregamento);
    window.timerCarregamento = null;
  }
  $(".loading-overlay").css("display", "none");
}

window.executarComCarregamento = async function (fn) {
  try {
    window.mostrarCarregamento();
    await fn();
  } finally {
    window.ocultarCarregamento();
  }
}

window.mostrarDialogo = function (title, message, callback) {
  const dialog = $("#dialog-message");
  dialog
    .empty()
    .html("<p>" + String(message).replace(/\n/g, "<br>") + "</p>")
    .dialog({
      modal: true,
      width: 350,
      title: title,
      buttons: {
        Ok: function () {
          $(this).dialog("close");
        }
      },
      close: function () {
        if (typeof callback === 'function') {
          callback();
        }
        $(this).dialog('destroy');
        $(this).empty();
      }
    })
    .dialog("open");
}

window.confirmarAcao = async function (title, message) {
  return new Promise((resolve) => {
    $("#dialog-message")
      .empty()
      .html("<p>" + message + "</p>")
      .dialog({
        modal: true,
        width: 350,
        title: title,
        buttons: {
          Confirmar: function () {
            $(this).data('resolved', true).dialog("close");
            resolve(true);
          },
          Cancelar: function () {
            $(this).data('resolved', true).dialog("close");
            resolve(false);
          }
        },
        close: function () {
          if (!$(this).data('resolved')) {
            resolve(false);
          }
          $(this).dialog('destroy');
          $(this).empty();
        },
        open: function () {
          $(this).data('resolved', false);
        }
      })
      .dialog("open");
  });
}

window.confirmarExclusao = async function (mensagem) {
  return new Promise((resolve) => {
    $("#dialog-message")
      .empty()
      .html(`<p><i class="fas fa-exclamation-triangle" style="color: #dc3545;"></i> ${mensagem}</p>`)
      .dialog({
        modal: true,
        title: "Confirmar Exclusão",
        width: 400,
        buttons: {
          EXCLUIR: function () {
            $(this).data('resolved', true).dialog("close");
            resolve(true);
          },
          CANCELAR: function () {
            $(this).data('resolved', true).dialog("close");
            resolve(false);
          }
        },
        close: function () {
          if (!$(this).data('resolved')) {
            resolve(false);
          }
          $(this).dialog('destroy');
          $(this).empty();
        },
        open: function () {
          $(this).data('resolved', false);
        }
      })
      .dialog("open");
  });
}

window.manipularErro = function (error, context = "", silencioso = false) {
  console.error(`Erro em ${context}:`, error.message, error.stack);
  if (window.errorInProgress && !silencioso) return;

  try {
    let message = "Comunicado do SisPMG+";
    let isCritico = false;

    if (error instanceof TypeError) message = "Erro de tipo - operação inválida";
    else if (error instanceof ReferenceError) message = "Erro de referência - função ou objeto não encontrado";
    else if (error instanceof SyntaxError) { message = "Erro de sintaxe - código inválido"; isCritico = true; }
    else if (error instanceof RangeError) message = "Erro de intervalo - valor fora dos limites permitidos";
    else if (error.message?.toLowerCase().includes('network') || error.message?.toLowerCase().includes('failed to fetch')) message = "Erro de rede - verifique sua conexão com a internet";
    else if (error.message?.toLowerCase().includes('timeout') || error.message?.toLowerCase().includes('tempo esgotado')) message = "Tempo limite excedido - a operação demorou muito para responder";

    if (context) message += ` durante ${context}`;
    if (error.message && !message.includes(error.message)) message += `. Detalhes: ${error.message}`;

    if (silencioso) return;
    window.errorInProgress = true;

    window.mostrarDialogo("Erro", message, () => {
      window.errorInProgress = false;
      if (isCritico) {
        setTimeout(() => { window.location.reload(); }, 1000);
      }
    });
  } catch (e) {
    console.error("Erro ao tratar erro:", e);
    alert(`Erro crítico no sistema. Por favor, recarregue a página.`);
    window.errorInProgress = false;
  }
}

window.converterMes = function (valor, formato = 'texto') {
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

window.mNumerico = function (texto, retorno = 'texto') { return window.converterMes(texto, retorno); }

window.obterNomeMes = function (mes) { return window.converterMes(mes, 'nome'); }

window.converteMesParaNumero = function (mes) { return window.converterMes(mes, 'numero'); }

window.obterDataMaisRecente = function (datas) {
  if (!datas || datas.length === 0) return new Date().toISOString().split("T")[0];
  return datas
    .map(d => new Date(d))
    .filter(d => !isNaN(d.valueOf()))
    .reduce((maxData, dataAtual) => (dataAtual > maxData ? dataAtual : maxData), new Date(0))
    .toISOString()
    .split("T")[0];
}

window.formatarNumero = function (valor, tipo = "decimal", maxDecimais = 4) {
  let numStr = String(valor);
  if (typeof valor === "string") {
    if (tipo === "moeda" && numStr.includes("R$")) {
      numStr = numStr.replace("R$", "").trim();
    }
    numStr = numStr.replace(/[^\d,.]/g, "");
    if (numStr.includes(',')) {
      const parts = numStr.split(',');
      if (parts.length === 2) {
        numStr = parts[0].replace(/\./g, '') + '.' + parts[1];
      } else {
        numStr = numStr.replace(/,/g, '');
      }
    }
  }
  const numero = parseFloat(numStr) || 0;

  switch (tipo) {
    case "moeda":
      return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: maxDecimais }).replace(/\u00A0/g, ' ');
    case "decimal":
      return numero.toLocaleString("pt-BR", { minimumFractionDigits: Math.min(2, maxDecimais), maximumFractionDigits: maxDecimais }).replace(/\u00A0/g, ' ');
    case "numero":
      return numero;
    default:
      return numero.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: maxDecimais }).replace(/\u00A0/g, ' ');
  }
}

window.verificarDigitoVerificador = function (numero) {
  numero = String(numero).replace(/\D/g, "");
  if (numero.length < 2 || /^0+$/.test(numero)) return false;

  const digitoVerificador = parseInt(numero.slice(-1));
  const numeroBase = numero.slice(0, -1);
  let soma = 0;
  for (let i = 0; i < numeroBase.length; i++) {
    let multiplicacao = (i % 2 === 0 ? 1 : 2) * parseInt(numeroBase[i]);
    if (multiplicacao > 9) multiplicacao -= 9;
    soma += multiplicacao;
  }
  const resultado = soma % 10 === 0 ? 0 : 10 - (soma % 10);
  return resultado === digitoVerificador;
}

window.carregarDadosPlanilha = function (config) {
  return new Promise((resolve, reject) => {
    try {
      const baseUrl = "https://docs.google.com/spreadsheets/d/";
      const queryParams = new URLSearchParams({
        tq: config.query || 'SELECT *',
        sheet: config.sheet || '',
        tqx: 'out:json'
      });

      // Proteção de IDs Dinâmicos contra sobrescritas no escopo global
      let targetSheetId = config.sheetId;
      const cachedBDConvenios = sessionStorage.getItem("sic3_idBDConvenios") || window.idBDConvenios;
      const cachedBDEnderecos = sessionStorage.getItem("sic3_idBDEnderecos") || window.idBDEnderecos;
      const cachedTBPrimaria = sessionStorage.getItem("sic3_idTBPrimaria") || window.idTBPrimaria;
      const cachedTBSecundaria = sessionStorage.getItem("sic3_idTBSecundaria") || window.idTBSecundaria;

      if (config.sheet === "enderecos") {
        targetSheetId = cachedBDEnderecos || targetSheetId;
      } else if (config.sheet === "convenios") {
        targetSheetId = cachedBDConvenios || targetSheetId;
      } else if (config.sheet === "tb-primaria" || config.sheet === "dt-primaria") {
        targetSheetId = cachedTBPrimaria || targetSheetId;
      } else if (config.sheet === "tb-secundaria" || config.sheet === "dt-secundaria") {
        targetSheetId = cachedTBSecundaria || targetSheetId;
      }

      // Se ainda estiver nulo ou vazio, usa o idbase (que é a planilha do ano)
      if (!targetSheetId) {
        targetSheetId = window.idbase;
      }

      const url = `${baseUrl}${targetSheetId}/gviz/tq?${queryParams}`;
      console.log(`[SIC3 v3.0 Log] [Planilha Request] Requisitando dados gviz para sheet: "${config.sheet || 'idbase'}".
        - Target Sheet ID: ${targetSheetId}
        - Query: ${config.query || 'SELECT *'}
        - URL gviz: ${url}`);

      const startTime = Date.now();
      const tempoLimite = 30000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, tempoLimite);

      fetch(url, {
        signal: controller.signal,
        credentials: 'include'
      })
        .then(response => {
          clearTimeout(timeoutId);
          if (!response.ok) {
            throw new Error(`Erro HTTP: ${response.status}`);
          }
          return response.text();
        })
        .then(text => {
          const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?/);
          if (!match) {
            throw new Error('Formato de resposta inválido da planilha.');
          }
          const responseJson = JSON.parse(match[1]);
          if (responseJson && responseJson.status === 'error') {
            const errorMsg = responseJson.errors && responseJson.errors[0]
              ? responseJson.errors[0].detailed_message || responseJson.errors[0].message
              : 'Erro desconhecido da API do Google Sheets';
            throw new Error(`Erro do Google Sheets: ${errorMsg}`);
          }
          if (!responseJson || !responseJson.table || !responseJson.table.rows) {
            throw new Error('Dados inválidos recebidos da planilha: ' + (config.sheet || config.sheetId));
          }
          const rows = responseJson.table.rows;
          console.log(`[SIC3 v3.0 Log] [Planilha Response Raw] Recebido em ${Date.now() - startTime}ms para a aba "${config.sheet || 'idbase'}". Quantidade de linhas brutas: ${rows.length}`);

          let processedData = config.processData ? config.processData(rows)
            : rows.map(row => row.c ? row.c.map(cell => (cell ? cell.v : '')) : []);

          console.log(`[SIC3 v3.0 Log] [Planilha Processed] Sucesso para a aba "${config.sheet || 'idbase'}". Linhas processadas: ${processedData.length}`);
          resolve(processedData);
        })
        .catch(async error => {
          clearTimeout(timeoutId);
          console.error(`[SIC3 v3.0 Log] [Planilha Error] Erro ao carregar gviz para a aba "${config.sheet || 'idbase'}":`, error);

          // Se falhar o acesso ao banco de dados (Gviz), invalida o cache permanente e consulta novamente o servidor
          if (typeof window.resolverIdsPlanilhas === 'function' && !config._isRetry) {
            console.warn("[SIC3 v3.0 Log] Tentativa de acesso falhou. Invalidando cache de IDs e consultando servidor...");
            try {
              await window.resolverIdsPlanilhas(true); // Força renovação bypassando o cache
              const retryConfig = { ...config, _isRetry: true };
              const retryData = await window.carregarDadosPlanilha(retryConfig);
              resolve(retryData);
              return;
            } catch (retryErr) {
              console.error("[SIC3 v3.0 Log] Falha na segunda tentativa de carregar planilha após renovar IDs:", retryErr);
            }
          }

          if (error.name === 'AbortError') {
            reject(new Error('Tempo limite excedido ao carregar dados da planilha: ' + (config.sheet || config.sheetId)));
          } else {
            reject(new Error('Erro ao carregar dados da planilha: ' + (config.sheet || config.sheetId) + ' - ' + error.message));
          }
        });
    } catch (error) {
      reject(error);
    }
  });
}

// O includeHtmlBody nativo do roteador SPA cuida da interceptação
window.includeHtmlBody = window.includeHtmlBody || function (html) {
  if (typeof window.includeHtmlBody === 'function') {
    window.includeHtmlBody(html);
  }
}

window.limparRecursosAtivos = function () {
  $(document).off();

  if ($.fn.DataTable && $.fn.DataTable.isDataTable) {
    if ($.fn.DataTable.isDataTable('#dataTable')) $('#dataTable').DataTable().destroy();
    if ($.fn.DataTable.isDataTable('#tabelaItens99')) $('#tabelaItens99').DataTable().destroy();
    if ($.fn.DataTable.isDataTable('#tabelaMateriais')) $('#tabelaMateriais').DataTable().destroy();
  }

  if ($.ui && $('.ui-dialog-content').length) {
    $('.ui-dialog-content').each(function () {
      try {
        $(this).dialog('destroy');
      } catch (e) { }
    });
  }

  if (typeof window.timerCarregamento != 'undefined' && window.timerCarregamento) {
    clearTimeout(window.timerCarregamento);
    window.timerCarregamento = null;
  }
  if (typeof window.timeoutValidacao != 'undefined' && window.timeoutValidacao) {
    Object.keys(window.timeoutValidacao).forEach(key => {
      clearTimeout(window.timeoutValidacao[key]);
      delete window.timeoutValidacao[key];
    });
  }

  window.resetarCarregamento();
}

window.navegarParaLancamentos = async function (municipio, convenio, ano, mes, acao) {
  try {
    window.mostrarCarregamento();
    if (typeof window.salvarSelecaoUsuario === 'function') {
      window.salvarSelecaoUsuario();
    }
    const authToken = sessionStorage.getItem('authToken') || '';

    const response = await Promise.race([
      new Promise(resolve => google.script.run
        .withSuccessHandler(res => { resolve(res); })
        .withFailureHandler(err => { console.error("Erro de navegação:", err); resolve(false); })
        .irParaPainelLancamentos(authToken, municipio, convenio, ano, mes, acao)),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Tempo esgotado ao navegar para lançamentos')), 30000))
    ]);
    if (response) {
      window.includeHtmlBody(response); return true;
    }
    window.mostrarDialogo('Erro', 'Erro ao navegar para lançamentos. Tente novamente.'); return false;
  } catch (error) {
    window.manipularErro(error, "navegarParaLancamentos"); return false;
  } finally {
    window.ocultarCarregamento();
  }
}

window.navegarPara = async function (action) {
  if (action !== "voltar") {
    window.mostrarCarregamento();
  }
  try {
    if (action === "voltar" && typeof window.salvarSelecaoUsuario === 'function') {
      window.salvarSelecaoUsuario();
    }

    if (action === "voltar") {
      if (window.timerCarregamento) {
        clearTimeout(window.timerCarregamento);
        window.timerCarregamento = null;
      }
      if (typeof window.navegarParaSic3 === 'function') {
        // Recupera os convênios da memória se disponíveis, senão passa vazio para que sejam recarregados.
        // Passa também o contexto completo para evitar a limpeza das variáveis essenciais.
        window.navegarParaSic3('admin', {
          convenios: window.dadosConveniosPrepostos || [],
          idbase: window.idbase || "",
          rpm: window.rpm || "",
          ano: window.ano || "",
          authToken: window.authToken || "",
          mLog: window.mLog || "",
          nUser: window.nUser || ""
        });
        return true;
      }
    } else if (action === "sair") {
      window.ocultarCarregamento();
      window.close();
      return true;
    } else {
      window.ocultarCarregamento();
      return false;
    }

    const response = await Promise.race([
      serverFunctionPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Tempo esgotado ao ${action}`)), 30000))
    ]);

    if (response) {
      window.includeHtmlBody(response); return true;
    }
    window.mostrarDialogo("Erro", `Erro ao ${action === 'voltar' ? 'navegar' : 'sair'}. Tente novamente.`); return false;
  } catch (error) {
    window.manipularErro(error, `navegarPara(${action})`); return false;
  } finally {
    window.ocultarCarregamento();
  }
}

window.fecharModal = function () {
  try {
    const modal = $("#modal-base");
    if (!modal.length) return;
    modal.hide().find("form")[0]?.reset();
    if (typeof window.limparValidacoes === 'function') {
      window.limparValidacoes(modal.find("form")[0]);
    }
    modal.find(".modal-body").html("");
    modal.find(".modal-header h2").text("");
    modal.find("button").off("click");
  } catch (error) { window.manipularErro(error, "fecharModal"); }
}
