// Grupo 2: Manipulação da Interface do Usuário (UI)

  function alternarVisualizacaoTela(novaTela) {
    if (novaTela === "pesquisa") {
      $(".info-convenio").hide();
      $(".principal-container").hide();
      $(".datatable-container").show();

      $("#btnIrParaPesquisa").hide();
      $("#btnVoltarLancamentos").show();

      $("#mainTitle").text("PESQUISA DE MATERIAIS DE CONSUMO");
      ADMIN_CONFIG.estados.telaAtual = "pesquisa";
      if (
        typeof carregarPesquisaMaterialAdmin == "function" &&
        (!$.fn.DataTable.isDataTable("#dataTable") ||
          !$("#dataTable").DataTable().rows().count())
      ) {
        carregarPesquisaMaterialAdmin();
      }
    } else {
      $(".datatable-container").hide();

      $("#btnVoltarLancamentos").hide();
      $("#btnIrParaPesquisa").show();

      $(".info-convenio").show();
      $(".principal-container").show();
      $("#mainTitle").text("PAINEL ADMINISTRATIVO");
      ADMIN_CONFIG.estados.telaAtual = "lancamentos";
      if (
        ADMIN_CONFIG.lancamentosCarregados === false ||
        $("#tabela-lancamentos tbody").is(":empty")
      ) {
        carregarLancamentos();
      }
    }
  }

  async function preencherSelectsAdmin(data) {
    try {
      if (!data || !data.anos || !data.convenios) {
        $("#ano, #municipio, #convenio").empty();
        atualizarCabecalhoTabela();
        return false;
      }
      const anoSelect = $("#ano").empty();
      data.anos.forEach((ano) =>
        anoSelect.append(`<option value="${ano}">${ano}</option>`)
      );
      if (data.anos.length) anoSelect.val(data.anos[0]);

      $("#mes").val("TODOS").data("previous-value-static", "TODOS");

      const municipioSelect = $("#municipio").empty().prop("disabled", false);
      const userMLog = typeof mLog != "undefined" ? mLog : "";
      if (userMLog === "admin") {
        municipioSelect.append('<option value="TODOS">TODOS</option>');
        const municipios = [
          ...new Set(
            data.convenios
              .map((c) => c.municipio)
              .filter((m) => m && m !== "ADMIN")
          ),
        ].sort((a, b) => a.localeCompare(b));
        municipios.forEach((mun) =>
          municipioSelect.append(`<option value="${mun}">${mun}</option>`)
        );
        municipioSelect.val("TODOS");
      } else {
        if (userMLog) {
          municipioSelect
            .append(`<option value="${userMLog}">${userMLog}</option>`)
            .val(userMLog)
            .prop("disabled", true);
          $("#mes").prop("disabled", true);
        } else {
          municipioSelect.append(
            '<option value="">Erro: Município não definido</option>'
          );
        }
      }
      $("#municipio").data("previous-value-static", $("#municipio").val());
      atualizarCabecalhoTabela();
      return true;
    } catch (error) {
      manipularErro(error, "preencherSelectsAdmin");
      throw error;
    }
  }

  async function atualizarSelectConvenios(municipio) {
    try {
      const selectConvenio = document.getElementById("convenio");
      if (!municipio || !selectConvenio) return [];
      selectConvenio.innerHTML = "";
      $(selectConvenio).prop("disabled", false);

      const anoSelecionado = $("#ano").val();
      const mesSelecionado = $("#mes").val();
      const mesesNomes = [
        "JANEIRO",
        "FEVEREIRO",
        "MARÇO",
        "ABRIL",
        "MAIO",
        "JUNHO",
        "JULHO",
        "AGOSTO",
        "SETEMBRO",
        "OUTUBRO",
        "NOVEMBRO",
        "DEZEMBRO",
      ];

      let baseConveniosParaFiltrar;
      if (municipio === "TODOS") {
        selectConvenio.appendChild(new Option("TODOS", "TODOS"));
        $(selectConvenio).val("TODOS").prop("disabled", true);
        atualizarInfoConvenioPreposto();
        return ADMIN_CONFIG.dados.convenios.filter(
          (item) => item.convenio !== "-"
        );
      } else {
        baseConveniosParaFiltrar = ADMIN_CONFIG.dados.convenios.filter(
          (item) => item.municipio === municipio && item.convenio !== "-"
        );
      }

      let conveniosFiltradosPorVigencia;
      if (mesSelecionado === "TODOS") {
        conveniosFiltradosPorVigencia = baseConveniosParaFiltrar.filter((c) =>
          mesesNomes.some((m) =>
            verificarVigenciaConvenio(c, anoSelecionado, m)
          )
        );
      } else {
        conveniosFiltradosPorVigencia = baseConveniosParaFiltrar.filter(
          (item) =>
            verificarVigenciaConvenio(item, anoSelecionado, mesSelecionado)
        );
      }

      conveniosFiltradosPorVigencia.sort((a, b) => {
        const numA = parseInt(a.convenio);
        const numB = parseInt(b.convenio);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        if (!isNaN(numA)) return -1;
        if (!isNaN(numB)) return 1;
        return String(a.convenio).localeCompare(String(b.convenio));
      });

      if (conveniosFiltradosPorVigencia.length === 0) {
        selectConvenio.appendChild(new Option("-", "-"));
        $(selectConvenio).val("-").prop("disabled", true);
      } else if (conveniosFiltradosPorVigencia.length === 1) {
        const item = conveniosFiltradosPorVigencia[0];
        const option = new Option(item.convenio, item.convenio);
        Object.assign(option.dataset, {
          prepostoN: item.preposto_n || "",
          prepostoPg: item.preposto_pg || "",
          preposto: item.preposto || "",
          unidade: item.unidade || "",
        });
        selectConvenio.appendChild(option);
        $(selectConvenio).val(item.convenio);
      } else {
        selectConvenio.appendChild(new Option("TODOS", "TODOS"));
        conveniosFiltradosPorVigencia.forEach((item) => {
          const option = new Option(item.convenio, item.convenio);
          Object.assign(option.dataset, {
            prepostoN: item.preposto_n || "",
            prepostoPg: item.preposto_pg || "",
            preposto: item.preposto || "",
            unidade: item.unidade || "",
          });
          selectConvenio.appendChild(option);
        });
        $(selectConvenio).val("TODOS");
      }
      atualizarInfoConvenioPreposto();
      return conveniosFiltradosPorVigencia;
    } catch (error) {
      manipularErro(error, "atualizarSelectConvenios");
      const sc = $("#convenio");
      if (sc.length && sc.children().length === 0)
        sc.append(new Option("-", "-")).val("-").prop("disabled", true);
      return [];
    }
  }

  function atualizarInfoConvenioPreposto() {
    const municipio = $("#municipio").val();
    const convenio = $("#convenio").val();

    $("#preposto, #unidade").val("");
    if (
      !municipio ||
      municipio === "TODOS" ||
      !convenio ||
      convenio === "-" ||
      convenio === "TODOS"
    ) {
      return;
    }
    const convEnc = ADMIN_CONFIG.dados.convenios.find(
      (c) =>
        c.municipio.toUpperCase() === municipio.toUpperCase() &&
        c.convenio === convenio
    );
    if (convEnc) {
      $("#preposto").val(
        convEnc.preposto_n
          ? `nº PM ${convEnc.preposto_n} - ${convEnc.preposto_pg} ${convEnc.preposto}`
          : ""
      );
      $("#unidade").val(convEnc.unidade || "");
    }
  }

  function atualizarCabecalhoTabela() {
    try {
      const municipio = $("#municipio").val(),
        thMun = $("#tabela-lancamentos thead th:first-child");
      if (!thMun.length) {
        return;
      }
      if (municipio === "TODOS") {
        if (!$("#filtro-unidade").length) {
          const unidades = [
            "MUNICÍPIO",
            "19 BPM",
            "44 BPM",
            "70 BPM",
            "24 CIA PM IND",
          ];
          thMun.html(
            `<select id="filtro-unidade" class="form-control">${unidades
              .map((u) => `<option value="${u}">${u}</option>`)
              .join("")}</select>`
          );
          $("#filtro-unidade").on("change", filtrarLancamentosPorUnidade);
        }
      } else {
        if ($("#filtro-unidade").length) $("#filtro-unidade").remove();
        thMun.html("MUNICÍPIO");
      }
    } catch (error) {
      manipularErro(error, "atualizarCabecalhoTabela");
    }
  }

  function preencherTabelaLancamentosAdmin(lancamentos) {
    $(".principal-container").show();
    $(".datatable-container").hide();
    const tabela = $("#tabela-lancamentos tbody").empty();
    const isAdmin = typeof mLog != "undefined" && mLog === "admin";
    $(".admin-only").toggle(isAdmin);
    $(".sirconv-col").show(); // Sempre exibe para ambos

    if (lancamentos.length === 0) {
      tabela.append(
        '<tr><td colspan="10" class="text-center">Nenhum lançamento encontrado para os filtros selecionados.</td></tr>'
      );
      return;
    }

    lancamentos.forEach((linha) => {
      const valor = formatarNumero(linha.valorTotal, "moeda");
      let statusHtml,
        acaoHtml,
        sirconvHtml = "-",
        siadHtml = "-";
      const isLancamentoDisponivel =
        linha.valorTotal <= 0 &&
        !linha.edicaoBloqueada &&
        !linha.semConvenio &&
        linha.convenio !== "-";

      let btnAnexoD = `<button class="btn-acao-icon btn-anexo-d" title="Anexo 'D'" data-municipio="${linha.municipio}" data-convenio="${linha.convenio}" data-ano="${linha.ano}" data-mes="${linha.mes}">
                        <strong class="letter-only">D</strong>
                        <span class="btn-text full-text-anexo" style="display: none;">ANEXO 'D'</span>
                      </button>`;
      let btnAnexoU = `<button class="btn-acao-icon btn-anexo-u" title="Anexo 'Único'" data-municipio="${linha.municipio}" data-convenio="${linha.convenio}" data-ano="${linha.ano}" data-mes="${linha.mes}">
                        <strong class="letter-only">U</strong>
                        <span class="btn-text full-text-anexo" style="display: none;">ANEXO 'ÚNICO'</span>
                      </button>`;

      let btnLancar = `<button class="btn-acao-icon btn-lancar" title="Lançar" data-convenio="${linha.convenio}"><i class="fas fa-plus"></i><span class="btn-text">LANÇAR</span></button>`;
      let btnEditar = `<button class="btn-acao-icon btn-editar btn-warning" title="Editar" data-convenio="${linha.convenio}"><i class="fas fa-edit"></i><span class="btn-text">EDITAR</span></button>`;
      let btnVisualizar = `<button class="btn-acao-icon btn-visualizar" title="Visualizar" data-convenio="${linha.convenio}"><i class="fas fa-eye"></i><span class="btn-text">VISUALIZAR</span></button>`;

      if (isLancamentoDisponivel) {
        btnLancar = `<button class="btn-acao-icon btn-lancar expanded" title="Lançar" data-convenio="${linha.convenio}"><i class="fas fa-plus"></i><span class="btn-text">LANÇAR</span></button>`;
        btnAnexoD = "";
        btnAnexoU = "";
      }

      if (linha.semConvenio || linha.convenio === "-") {
        statusHtml = "-";
        acaoHtml = `<div class="action-buttons-container"><div class="action-button-group main-actions"><button class="btn-acao-icon btn-sem-convenio" disabled title="Sem convênio ativo ou dados para este período"><i class="fas fa-ban"></i><span class="btn-text">INDISPONÍVEL</span></button></div></div>`;
        sirconvHtml = "-";
        siadHtml = "-";
      } else if (linha.edicaoBloqueada) {
        statusHtml = `<button class="action-icon btn-bloqueada" title="Edição Bloqueada. Clique para desbloquear."><i class="fas fa-lock"></i></button>`;
        acaoHtml = `<div class="action-buttons-container">
                        <div class="action-button-group main-actions">${btnVisualizar}</div>
                        <div class="action-button-group anexo-actions">${btnAnexoD}${btnAnexoU}</div>
                      </div>`;
        if (linha.valorTotal > 0) {
          const statusRaw = (linha.sirconvStatus || "").trim();
          const isSirconvOk = statusRaw === "OK" || statusRaw.startsWith("OK|");
          const isSirconvPendente = statusRaw.startsWith("PENDENCIA|");

          if (isSirconvOk) {
            sirconvHtml = `<span class="status-icon status-verificado" title="Verificado no SIRCONV" data-municipio="${linha.municipio}" data-convenio="${linha.convenio}" data-ano="${linha.ano}" data-mes="${linha.mes}"><i class="fas fa-check-circle"></i></span>`;
            siadHtml =
              linha.siadStatus === "OK"
                ? `<span class="status-icon status-registrado clicks-siad" title="Ver Detalhes do SIAD" style="cursor: pointer; display: block; text-align: center;" data-municipio="${linha.municipio}" data-convenio="${linha.convenio}" data-ano="${linha.ano}" data-mes="${linha.mes}" data-siad-l="${linha.siadInfo?.colL || ''}" data-siad-m="${linha.siadInfo?.colM || ''}" data-siad-n="${linha.siadInfo?.colN || ''}" data-siad-o="${linha.siadInfo?.colO || ''}" data-siad-p="${linha.siadInfo?.colP || ''}" data-siad-q="${linha.siadInfo?.colQ || ''}" data-siad-r="${linha.siadInfo?.colR || ''}" data-siad-s="${linha.siadInfo?.colS || ''}"><i class="fas fa-check-circle"></i></span>`
                : `<span class="status-icon status-pendente" title="Pendente no SIAD (Rotina Automática)"><i class="fas fa-clock" style="color: #95a5a6;"></i></span>`;
          } else if (isSirconvPendente) {
            sirconvHtml = `<button class="action-icon btn-pendencias-sirconv" title="Ver Pendências no SIRCONV" data-municipio="${linha.municipio}" data-convenio="${linha.convenio}" data-ano="${linha.ano}" data-mes="${linha.mes}" data-status="${statusRaw.replace(/"/g, '&quot;')}"><i class="fas fa-exclamation-circle" style="color: #e74c3c;"></i></button>`;
            siadHtml = '<span class="status-icon aguardando" title="Aguardando verificação no SIRCONV"><i class="fas fa-hourglass-half"></i></span>';
          } else {
            if (isAdmin) {
              sirconvHtml = `<button class="action-icon btn-verificar" title="Marcar como Verificado no SIRCONV" data-municipio="${linha.municipio}" data-convenio="${linha.convenio}" data-ano="${linha.ano}" data-mes="${linha.mes}"><i class="fas fa-check"></i></button>`;
            } else {
              sirconvHtml = `<span class="status-icon aguardando" title="Aguardando verificação no SIRCONV"><i class="fas fa-hourglass-half"></i></span>`;
            }
            siadHtml = '<span class="status-icon aguardando" title="Aguardando verificação no SIRCONV"><i class="fas fa-hourglass-half"></i></span>';
          }
        }
      } else {
        statusHtml = `<button class="action-icon btn-desbloqueada" title="Edição Desbloqueada. Clique para Bloquear."><i class="fas fa-unlock"></i></button>`;
        if (linha.valorTotal > 0) {
          acaoHtml = `<div class="action-buttons-container">
                        <div class="action-button-group main-actions">${btnEditar}</div>
                        <div class="action-button-group anexo-actions">${btnAnexoD}${btnAnexoU}</div>
                      </div>`;
          sirconvHtml =
            '<span class="status-icon aguardando" title="Aguardando Bloqueio da Edição"><i class="fas fa-hourglass-half"></i></span>';
          siadHtml =
            '<span class="status-icon aguardando" title="Aguardando Verificação no SIRCONV"><i class="fas fa-hourglass-half"></i></span>';
        } else {
          statusHtml =
            '<span class="status-icon status-desbloqueada" title="Edição Desbloqueada"><i class="fas fa-unlock" style="color: green;"></i></span>';
          acaoHtml = `<div class="action-buttons-container">
                        <div class="action-button-group main-actions">${btnLancar}</div>
                        ${
                          isLancamentoDisponivel
                            ? ""
                            : `<div class="action-button-group anexo-actions">${btnAnexoD}${btnAnexoU}</div>`
                        }
                      </div>`;
        }
      }

      let nonAdminStatusDisplay;
      if (linha.semConvenio || linha.convenio === "-") {
        nonAdminStatusDisplay = "-";
      } else if (linha.edicaoBloqueada) {
        nonAdminStatusDisplay =
          '<span class="status-icon status-bloqueada" title="Edição Bloqueada"><i class="fas fa-lock"></i></span>';
      } else {
        nonAdminStatusDisplay =
          '<span class="status-icon status-desbloqueada" title="Edição Desbloqueada"><i class="fas fa-unlock"></i></span>';
      }
      let rowHtml = `<tr>
          <td>${linha.municipio}</td><td>${linha.convenio}</td><td>${
        linha.ano
      }</td><td>${linha.mes}</td>
          <td>${valor}</td>
          <td>${linha.timestamp || "-"}</td>
          <td class="cell-actions">${acaoHtml}</td>
          <td>${isAdmin ? statusHtml : nonAdminStatusDisplay}</td>`;
      rowHtml += `<td class="sirconv-col">${sirconvHtml}</td>`;
      if (isAdmin)
        rowHtml += `<td class="admin-only">${siadHtml}</td>`;
      rowHtml += `</tr>`;
      tabela.append(rowHtml);
    });
    $("#tabela-lancamentos tbody tr").css("display", "table-row");
    if (
      $("#filtro-unidade").val() &&
      $("#filtro-unidade").val() !== "MUNICÍPIO"
    )
      filtrarLancamentosPorUnidade();
    configurarEventosBotoesTabelaAdmin();

    // Requisito 3: Se for usuário normal e houver pendências nos lançamentos carregados, abre um modal de alerta
    if (!isAdmin) {
      const lancamentosComPendencias = lancamentos.filter(l => l.sirconvStatus && l.sirconvStatus.startsWith("PENDENCIA|"));
      if (lancamentosComPendencias.length > 0) {
        let listaMsg = "<ul style='margin-top: 10px; padding-left: 20px; font-family: sans-serif; font-size: 14px;'>";
        lancamentosComPendencias.forEach(l => {
          const partes = l.sirconvStatus.split("|");
          const desc = partes[1] || "Sem descrição informada.";
          listaMsg += `<li style='margin-bottom: 8px;'><strong>${l.municipio} - ${l.convenio} (${l.mes}/${l.ano})</strong>: ${desc}</li>`;
        });
        listaMsg += "</ul>";
        
        $("<div id='modal-pendencias-geral-user'></div>")
          .html(`<p style='font-family: sans-serif; font-size: 14.5px;'>Atenção! Os seguintes relatórios possuem pendências no SIRCONV que precisam ser corrigidas:</p>${listaMsg}`)
          .dialog({
            modal: true,
            width: 500,
            title: "Pendências Detectadas no SIRCONV",
            buttons: {
              "Entendido": function() {
                $(this).dialog("close");
              }
            },
            close: function() {
              $(this).dialog('destroy').remove();
            }
          });
      }
    }
  }

  async function configurarEventosBotoesTabelaAdmin() {
    const tabelaBody = $("#tabela-lancamentos tbody");
    tabelaBody.off("mouseenter mouseleave click");

    const authToken = sessionStorage.getItem("authToken");
    const isAdmin = typeof mLog != "undefined" && mLog === "admin";

    tabelaBody
      .on("mouseenter", ".btn-desbloqueada", function () {
        $(this)
          .html('<i class="fas fa-lock"></i>')
          .attr("title", "Bloquear Edição");
      })
      .on("mouseleave", ".btn-desbloqueada", function () {
        $(this)
          .html('<i class="fas fa-unlock"></i>')
          .attr("title", "Edição Desbloqueada. Clique para Bloquear.");
      })
      .on("click", ".btn-desbloqueada", async function () {
        const tr = $(this).closest("tr");
        await alterarStatusEdicao(
          authToken,
          tr.find("td:nth(0)").text(),
          tr.find("td:nth(1)").text(),
          tr.find("td:nth(2)").text(),
          tr.find("td:nth(3)").text(),
          "bloquear"
        );
      });

    tabelaBody
      .on("mouseenter", ".btn-bloqueada", function () {
        $(this)
          .html('<i class="fas fa-unlock"></i>')
          .attr("title", "Desbloquear Edição");
      })
      .on("mouseleave", ".btn-bloqueada", function () {
        $(this)
          .html('<i class="fas fa-lock"></i>')
          .attr("title", "Edição Bloqueada. Clique para Desbloquear.");
      })
      .on("click", ".btn-bloqueada", async function () {
        const tr = $(this).closest("tr");
        await alterarStatusEdicao(
          authToken,
          tr.find("td:nth(0)").text(),
          tr.find("td:nth(1)").text(),
          tr.find("td:nth(2)").text(),
          tr.find("td:nth(3)").text(),
          "desbloquear"
        );
      });

    tabelaBody.on(
      "click",
      ".btn-lancar, .btn-visualizar, .btn-editar",
      function () {
        salvarSelecaoUsuario();
        mostrarCarregamento();
        const tr = $(this).closest("tr");
        const acao = $(this).hasClass("btn-lancar")
          ? "lancar"
          : $(this).hasClass("btn-visualizar")
          ? "visualizar"
          : "editar";
        const convenio = $(this).data("convenio");
        google.script.run
          .withSuccessHandler((res) => includeHtmlBody(res))
          .withFailureHandler((err) =>
            manipularErro(err, `navegarPara ${acao}`)
          )
          .irParaPainelLancamentos(
            authToken,
            tr.find("td:nth(0)").text(),
            convenio,
            tr.find("td:nth(2)").text(),
            tr.find("td:nth(3)").text(),
            acao
          );
      }
    );

    tabelaBody.on("click", ".btn-verificar", function () {
      const btn = $(this);
      const { municipio, convenio, ano, mes } = btn.data();
      
      const content = `
        <div style="font-family: var(--font-family-body); font-size: 13.5px; padding: 10px; text-align: center;">
          <p style="margin-bottom: 10px; font-weight: 500; color: var(--cor-fonte-forte);">
            Selecione o tipo de conferência no SIRCONV para:<br>
            <strong style="font-size: 14.5px; color: var(--cor-primaria);">${municipio} - ${convenio} (${mes}/${ano})</strong>
          </p>
        </div>
      `;

      $("<div id='modal-escolha-sirconv'></div>")
        .html(content)
        .dialog({
          modal: true,
          width: 450,
          title: "Conferência SIRCONV",
          buttons: [
            {
              text: "Conferido Sem Pendências",
              class: "btn-sirconv-sem-pendencias",
              click: async function() {
                $(this).dialog("close");
                const userPM = window.userPM || "";
                const userPosto = window.userPostoGraduacao || "";
                const userNome = window.userNome || "";
                const userSecao = window.userSecao || "";
                const statusValue = `OK|${userPM}|${userPosto}|${userNome}|${userSecao}`;
                
                await handleSirconvSiadUpdate(
                  authToken,
                  municipio,
                  convenio,
                  ano,
                  mes,
                  "SIRCONV",
                  statusValue,
                  `Deseja marcar como Verificado no SIRCONV (Sem Pendências) para ${municipio} - ${convenio} (${mes}/${ano})?`,
                  "Status do SIRCONV alterado com sucesso!"
                );
              }
            },
            {
              text: "Conferido Com Pendências",
              class: "btn-sirconv-com-pendencias",
              click: function() {
                $(this).dialog("close");
                abrirModalRegistrarPendencia(municipio, convenio, ano, mes, "");
              }
            },
            {
              text: "Cancelar",
              class: "btn-sirconv-cancelar",
              click: function() {
                $(this).dialog("close");
              }
            }
          ],
          close: function() {
            $(this).dialog('destroy').remove();
          }
        });
    });

    tabelaBody.on("click", ".btn-pendencias-sirconv", function () {
      const btn = $(this);
      const { municipio, convenio, ano, mes, status } = btn.data();
      
      if (isAdmin) {
        abrirModalRegistrarPendencia(municipio, convenio, ano, mes, status);
      } else {
        let pendenciaTexto = "Sem descrição.";
        let infoCriador = "Administrador";
        
        if (status && status.startsWith("PENDENCIA|")) {
          const partes = status.split("|");
          pendenciaTexto = partes[1] || "Sem descrição.";
          if (partes.length > 2) {
            const pm = partes[2] || "-";
            const posto = partes[3] || "-";
            const nome = partes[4] || "-";
            const secao = partes[5] || "-";
            infoCriador = `${posto} ${nome} (Matrícula PM: ${pm}) - Seção: ${secao}`;
          }
        }
        
        const content = `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 14px; padding: 10px; color: #2c3e50;">
            <div style="margin-bottom: 15px; padding: 10px; background: #fffdf0; border-radius: 6px; border-left: 5px solid #e74c3c; font-size: 13.5px; line-height: 1.5; box-shadow: inset 0 0 5px rgba(0,0,0,0.05);">
              <strong>Pendências registradas:</strong><br>
              <span style="display: block; margin-top: 5px; color: #555; font-style: italic;">"${pendenciaTexto}"</span>
            </div>
            <div style="font-size: 12.5px; color: #7f8c8d; border-top: 1px dashed #ddd; padding-top: 8px;">
              <strong>Registrado por:</strong> ${infoCriador}
            </div>
          </div>
        `;
        
        $("<div id='modal-view-pendencia-sirconv'></div>")
          .html(content)
          .dialog({
            modal: true,
            width: 450,
            title: "Pendências do Relatório no SIRCONV",
            buttons: {
              "Fechar": function() {
                $(this).dialog("close");
              }
            },
            close: function() {
              $(this).dialog('destroy').remove();
            }
          });
      }
    });

    configurarEventosStatusVerificado(
      tabelaBody.find(".status-verificado"),
      authToken,
      isAdmin
    );

    // Evento de clique para exibir detalhes do SIAD no modal
    tabelaBody.off("click", ".clicks-siad").on("click", ".clicks-siad", function (e) {
      e.stopPropagation();
      e.preventDefault();
      const $el = $(this);
      const l = $el.data("siad-l") || "-";
      const m = $el.data("siad-m") || "-";
      const n = $el.data("siad-n") || "-";
      const o = $el.data("siad-o") || "-";
      const p = $el.data("siad-p") || "-";
      const q = $el.data("siad-q") || "-";
      const r = $el.data("siad-r") || "-";
      const s = $el.data("siad-s") || "-";

      const content = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 13.5px; color: #2c3e50; padding: 5px;">
          <h3 style="margin-top: 0; margin-bottom: 15px; border-bottom: 2px solid #34495e; padding-bottom: 8px; color: #2c3e50; font-size: 15px; font-weight: 600;">
            <i class="fas fa-info-circle" style="margin-right: 6px; color: #3498db;"></i>
            Detalhes do Lançamento no SIAD
          </h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tbody>
              <tr style="border-bottom: 1px solid #f1f2f6;"><td style="padding: 7px 0; font-weight: 600; width: 45%; color: #7f8c8d;">Envio Inicial:</td><td style="padding: 7px 0; color: #2c3e50;">${l}</td></tr>
              <tr style="border-bottom: 1px solid #f1f2f6;"><td style="padding: 7px 0; font-weight: 600; color: #7f8c8d;">Documento/Requisição:</td><td style="padding: 7px 0; color: #2c3e50; font-family: monospace; font-weight: bold;">${m}</td></tr>
              <tr style="border-bottom: 1px solid #f1f2f6;"><td style="padding: 7px 0; font-weight: 600; color: #7f8c8d;">Fase de Validação:</td><td style="padding: 7px 0; color: #2c3e50;">${n}</td></tr>
              <tr style="border-bottom: 1px solid #f1f2f6;"><td style="padding: 7px 0; font-weight: 600; color: #7f8c8d;">Número de Controle:</td><td style="padding: 7px 0; color: #2c3e50; font-family: monospace; font-weight: bold;">${o}</td></tr>
              <tr style="border-bottom: 1px solid #f1f2f6;"><td style="padding: 7px 0; font-weight: 600; color: #7f8c8d;">Data de Registro:</td><td style="padding: 7px 0; color: #2c3e50;">${p}</td></tr>
              <tr style="border-bottom: 1px solid #f1f2f6;"><td style="padding: 7px 0; font-weight: 600; color: #7f8c8d;">Status do Registro:</td><td style="padding: 7px 0;"><span style="color: ${q === 'OK' ? '#27ae60' : '#e74c3c'}; font-weight: bold;">${q}</span></td></tr>
              <tr style="border-bottom: 1px solid #f1f2f6;"><td style="padding: 7px 0; font-weight: 600; color: #7f8c8d;">Data de Homologação:</td><td style="padding: 7px 0; color: #2c3e50;">${r}</td></tr>
              <tr style="border-bottom: 1px solid #f1f2f6;"><td style="padding: 7px 0; font-weight: 600; color: #7f8c8d;">Status da Homologação:</td><td style="padding: 7px 0;"><span style="color: ${s === 'OK' ? '#27ae60' : '#e74c3c'}; font-weight: bold;">${s}</span></td></tr>
            </tbody>
          </table>
        </div>
      `;

      $("#dialog-message")
        .empty()
        .html(content)
        .dialog({
          modal: true,
          width: 400,
          title: "Informações SIAD",
          buttons: {
            Fechar: function() {
              $(this).dialog("close");
            }
          },
          close: function() {
            $(this).dialog('destroy');
            $(this).empty();
          }
        })
        .dialog("open");
    });

    tabelaBody
      .on("mouseenter", "td.cell-actions", function () {
        const $td = $(this);
        const $container = $td.find(".action-buttons-container");
        $container.addClass("container-hover");
        
        const $buttons = $container.find(".btn-acao-icon");
        $buttons.addClass("expanded").css("justify-content", "center");
        
        $container.find(".btn-anexo-d, .btn-anexo-u").each(function() {
          const $btn = $(this);
          $btn.find(".letter-only").hide();
          $btn.find(".full-text-anexo").show();
        });
      })
      .on("mouseleave", "td.cell-actions", function () {
        const $td = $(this);
        const $container = $td.find(".action-buttons-container");
        $container.removeClass("container-hover");
        
        const $buttons = $container.find(".btn-acao-icon");
        $buttons.each(function() {
          const $btn = $(this);
          const hasAnexos = $container.find(".btn-anexo-d").length > 0;
          if ($btn.hasClass("btn-lancar") && !hasAnexos) {
            $btn.addClass("expanded");
          } else {
            $btn.removeClass("expanded").css("justify-content", "");
          }
        });

        $container.find(".btn-anexo-d, .btn-anexo-u").each(function() {
          const $btn = $(this);
          $btn.find(".letter-only").show();
          $btn.find(".full-text-anexo").hide();
        });
      });
  }

  async function configurarEventosBotaoRegistrar(botoes, authToken, isAdmin) {
    botoes.off("click").on("click", async function () {
      const btn = $(this);
      const { municipio, convenio, ano, mes } = btn.data();
      await handleSirconvSiadUpdate(
        authToken,
        municipio,
        convenio,
        ano,
        mes,
        "SIAD",
        "OK",
        `Deseja marcar como Registrado no SIAD para ${municipio} - ${convenio} (${mes}/${ano})?`,
        "Status do SIAD alterado com sucesso!"
      );
    });
  }

  async function configurarEventosStatusVerificado(
    elementos,
    authToken,
    isAdmin
  ) {
    elementos.each(function () {
      $(this)
        .off("mouseenter mouseleave click")
        .hover(
          function () {
            const tr = $(this).closest("tr");
            const siadCell = isAdmin ? tr.find("td.admin-only") : $();

            if (
              siadCell.find(".btn-registrar").length ||
              siadCell.find('.action-icon[title*="Registrar"]').length ||
              siadCell.find(".aguardando").length
            ) {
              const { municipio, convenio, ano, mes } = $(this).data();
              $(this)
                .html(
                  `<button class="action-icon btn-desfazer" title="Desmarcar como Verificado no SIRCONV"><i class="fas fa-undo"></i></button>`
                )
                .find(".btn-desfazer")
                .off("click")
                .on("click", async function (e) {
                  e.stopPropagation();
                  e.preventDefault();
                  await handleSirconvSiadUpdate(
                    authToken,
                    municipio,
                    convenio,
                    ano,
                    mes,
                    "SIRCONV",
                    "",
                    `Deseja desmarcar como Verificado no SIRCONV para ${municipio} - ${convenio} (${mes}/${ano})?`,
                    "Status do SIRCONV alterado com sucesso!"
                  );
                });
            }
          },
          function () {
            $(this)
              .html('<i class="fas fa-check-circle"></i>')
              .attr("title", "Verificado no SIRCONV");
          }
        );
    });
  }

  async function configurarEventosStatusRegistrado(
    elementos,
    authToken,
    isAdmin
  ) {
    elementos.each(function () {
      $(this)
        .off("mouseenter mouseleave click")
        .hover(
          function () {
            const { municipio, convenio, ano, mes } = $(this).data();
            $(this)
              .html(
                `<button class="action-icon btn-desfazer" title="Desmarcar como Registrado no SIAD"><i class="fas fa-undo"></i></button>`
              )
              .find(".btn-desfazer")
              .off("click")
              .on("click", async function (e) {
                e.stopPropagation();
                e.preventDefault();
                await handleSirconvSiadUpdate(
                  authToken,
                  municipio,
                  convenio,
                  ano,
                  mes,
                  "SIAD",
                  "",
                  `Deseja desmarcar como Registrado no SIAD para ${municipio} - ${convenio} (${mes}/${ano})?`,
                  "Status do SIAD alterado com sucesso!"
                );
              });
          },
          function () {
            $(this)
              .html('<i class="fas fa-check-circle"></i>')
              .attr("title", "Registrado no SIAD");
          }
        );
    });
  }

  function abrirModalRegistrarPendencia(municipio, convenio, ano, mes, statusAtual) {
    let pendenciaTexto = "";
    let infoCriador = "";
    
    if (statusAtual && statusAtual.startsWith("PENDENCIA|")) {
      const partes = statusAtual.split("|");
      pendenciaTexto = partes[1] || "";
      if (partes.length > 2) {
        const pm = partes[2] || "-";
        const posto = partes[3] || "-";
        const nome = partes[4] || "-";
        const secao = partes[5] || "-";
        infoCriador = `<div style="margin-bottom: 12px; padding: 10px; background: #fffdf0; border-radius: 6px; border-left: 4px solid var(--cor-laranja); font-size: 12.5px; color: var(--cor-fonte);">
          <strong>Registrado por:</strong> ${posto} ${nome} (Matrícula PM: ${pm}) - Seção: ${secao}
        </div>`;
      }
    }

    const modalHtml = `
      <div style="font-family: var(--font-family-body); font-size: 13px; padding: 5px;">
        ${infoCriador}
        <label for="sirconv-desc-pendencia" style="display: block; margin-bottom: 6px; font-weight: 600; color: var(--cor-primaria);">Descrição das Pendências:</label>
        <textarea id="sirconv-desc-pendencia" rows="5" placeholder="Digite aqui as irregularidades encontradas no SIRCONV...">${pendenciaTexto}</textarea>
      </div>
    `;

    const dialogButtons = [
      {
        text: "Salvar Pendência",
        class: "btn-sirconv-salvar",
        click: async function() {
          const desc = $("#sirconv-desc-pendencia").val().trim();
          if (!desc) {
            alert("A descrição das pendências não pode ficar vazia.");
            return;
          }
          $(this).dialog("close");
          
          const userPM = window.userPM || "";
          const userPosto = window.userPostoGraduacao || "";
          const userNome = window.userNome || "";
          const userSecao = window.userSecao || "";
          const statusValue = `PENDENCIA|${desc}|${userPM}|${userPosto}|${userNome}|${userSecao}`;

          mostrarCarregamento();
          google.script.run
            .withSuccessHandler((s) => {
              ocultarCarregamento();
              if (s && s.success) {
                mostrarDialogo("Sucesso", "Pendências registradas com sucesso no SIRCONV!");
                carregarLancamentos();
              } else {
                mostrarDialogo("Erro", (s && s.message) || "Erro ao salvar pendências.");
              }
            })
            .withFailureHandler((err) => {
              ocultarCarregamento();
              manipularErro(err, "salvarPendenciasSirconv");
            })
            .atualizarStatusSirconvSiad(
              sessionStorage.getItem("authToken"),
              municipio,
              convenio,
              ano,
              mes,
              "SIRCONV",
              statusValue
            );
        }
      }
    ];

    if (statusAtual && statusAtual.startsWith("PENDENCIA|")) {
      dialogButtons.push({
        text: "Conferido Sem Pendências",
        class: "btn-sirconv-sem-pendencias",
        click: async function() {
          $(this).dialog("close");
          const userPM = window.userPM || "";
          const userPosto = window.userPostoGraduacao || "";
          const userNome = window.userNome || "";
          const userSecao = window.userSecao || "";
          const statusValue = `OK|${userPM}|${userPosto}|${userNome}|${userSecao}`;
          
          await handleSirconvSiadUpdate(
            sessionStorage.getItem("authToken"),
            municipio,
            convenio,
            ano,
            mes,
            "SIRCONV",
            statusValue,
            `Deseja marcar como Verificado (Sem Pendências) para ${municipio} - ${convenio} (${mes}/${ano})?`,
            "Status do SIRCONV alterado com sucesso!"
          );
        }
      });
    }

    dialogButtons.push({
      text: "Cancelar",
      class: "btn-sirconv-cancelar",
      click: function() {
        $(this).dialog("close");
      }
    });

    $("<div id='modal-registro-pendencia-sirconv'></div>")
      .html(modalHtml)
      .dialog({
        modal: true,
        width: 500,
        title: statusAtual ? "Editar Pendências SIRCONV" : "Registrar Pendências SIRCONV",
        buttons: dialogButtons,
        close: function() {
          $(this).dialog('destroy').remove();
        }
      });
  }
