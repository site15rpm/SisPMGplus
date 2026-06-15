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
                const statusValue = "OK";
                
                const sucesso = await handleSirconvSiadUpdate(
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

                if (sucesso) {
                  mostrarCarregamento("Concluindo tarefas correspondentes na Agenda PM...");
                  try {
                    await concluirTarefaPendenciaSirconv(municipio, convenio, ano, mes);
                  } catch (err) {
                    console.error("Erro ao concluir tarefas da agenda:", err);
                  }
                  ocultarCarregamento();
                }
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

  // Função utilitária para normalizar strings para busca robusta de municípios (remove acentos, pontuação e caixa alta)
  function normalizarString(str) {
    if (!str) return "";
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Função utilitária para obter dados do storage local da extensão
  function obterDadosStorage(key) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(key, (result) => {
          resolve(result[key] || null);
        });
      } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        browser.storage.local.get(key).then(result => {
          resolve(result[key] || null);
        }).catch(() => resolve(null));
      } else {
        resolve(null);
      }
    });
  }

  // Função utilitária para gravar dados no storage local da extensão
  function gravarDadosStorage(key, value) {
    return new Promise((resolve) => {
      const data = { [key]: value };
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set(data, () => {
          resolve();
        });
      } else if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        browser.storage.local.set(data).then(resolve).catch(() => resolve());
      } else {
        resolve();
      }
    });
  }

  // Função utilitária para enviar mensagens ao background
  function enviarMensagemBackground(action, payload) {
    return new Promise((resolve, reject) => {
      const message = { action, payload };
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      } else if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) {
        browser.runtime.sendMessage(message).then(resolve).catch(reject);
      } else {
        reject(new Error("Extensão runtime de comunicação não disponível."));
      }
    });
  }

  async function agendarTarefaPendenciaSirconv(municipio, convenio, ano, mes, desc) {
    try {
      // 1. Obtém a RPM ativa
      let rpmAtiva = sessionStorage.getItem('sic3_rpm') || window.rpm || "";
      if (typeof rpmAtiva === 'object' && rpmAtiva.value) {
        rpmAtiva = rpmAtiva.value;
      }
      
      console.log(`[SIRCONV Pendências] RPM ativa obtida: "${rpmAtiva}"`);
      
      const extraido = rpmAtiva.match(/(\d+)/);
      const numeroRPM = extraido ? extraido[1] : "";
      
      if (!numeroRPM) {
        console.warn("[SIRCONV Pendências] Não foi possível extrair o número da RPM ativa. Ignorando agendamento automático de tarefa.");
        return;
      }

      // 2. Mapeia a RPM para o cUEOp da intranet
      const MAPA_RPM_CUEOP = {
        "1": "1100",
        "2": "1200",
        "3": "1300",
        "4": "1400",
        "5": "1500",
        "6": "1600",
        "7": "1700",
        "8": "1800",
        "9": "1900",
        "10": "2000",
        "11": "2100",
        "12": "2200",
        "13": "2300",
        "14": "2400",
        "15": "6869",
        "16": "2600",
        "17": "2700",
        "18": "2800",
        "19": "2900"
      };

      let cUEOp = MAPA_RPM_CUEOP[numeroRPM];
      if (!cUEOp && /^\d+$/.test(numeroRPM)) {
        cUEOp = String(parseInt(numeroRPM) * 100 + 1000);
      }

      if (!cUEOp) {
        console.warn(`[SIRCONV Pendências] Código cUEOp correspondente à RPM "${numeroRPM}" não mapeado.`);
        return;
      }

      // 3. Tenta obter a lista de unidades do cache do storage local primeiro
      let unidadesRaw = await obterDadosStorage('sic3_unidades_rpm');
      let unidades = [];

      if (unidadesRaw && Array.isArray(unidadesRaw) && unidadesRaw.length > 0) {
        console.log(`[SIRCONV Pendências] Recuperando ${unidadesRaw.length} unidades diretamente do cache local ('sic3_unidades_rpm').`);
        unidades = unidadesRaw;
      } else {
        console.log(`[SIRCONV Pendências] Cache 'sic3_unidades_rpm' vazio ou inválido. Consultando subunidades via rede (cUEOp: ${cUEOp})...`);
        const response = await enviarMensagemBackground('agenda-fetch-unidades', { userRegionCode: cUEOp });
        if (!response || !response.success || !response.data || response.data.length === 0) {
          console.error("[SIRCONV Pendências] Falha ao obter a árvore de unidades da Intranet PM:", response ? response.error : "Sem resposta");
          return;
        }
        unidades = response.data;
        // Grava no storage local para evitar consultas de rede nas próximas pendências
        await gravarDadosStorage('sic3_unidades_rpm', unidades);
      }

      // Normalização robusta do formato para lidar com dados do cache no formato cru {code, unitName} ou formatado {value, label}
      const unidadesMapeadas = unidades.map(u => ({
        value: u.value || u.code || "",
        label: u.label || `${u.code} - ${u.unitName}` || "",
        hierarchyPath: u.hierarchyPath || "",
        municipio: u.municipio || "",
        codigoMunicipio: u.codigoMunicipio || ""
      }));

      const municipioAlvoNormalizado = normalizarString(municipio);
      
      // 4. Identifica a unidade correspondente ao município
      const candidatas = unidadesMapeadas.filter(u => normalizarString(u.municipio) === municipioAlvoNormalizado);
      
      if (candidatas.length === 0) {
        console.warn(`[SIRCONV Pendências] Nenhuma unidade na intranet foi mapeada para o município "${municipio}" (${municipioAlvoNormalizado}).`);
        return;
      }

      // Ordena por profundidade da hierarquia (menor número de barras "/" = nível mais alto)
      candidatas.sort((a, b) => (a.hierarchyPath || "").split('/').length - (b.hierarchyPath || "").split('/').length);
      const unidadeSelecionada = candidatas[0];
      
      console.log(`[SIRCONV Pendências] Unidade identificada para abrangência: ${unidadeSelecionada.label} (Código: ${unidadeSelecionada.value})`);

      // 5. Constrói e envia os dados da nova tarefa (eventData)
      const agora = new Date();
      const format2Digitos = (n) => String(n).padStart(2, '0');
      const dataHoraString = `${agora.getFullYear()}-${format2Digitos(agora.getMonth() + 1)}-${format2Digitos(agora.getDate())}T${format2Digitos(agora.getHours())}:${format2Digitos(agora.getMinutes())}:${format2Digitos(agora.getSeconds())}`;
      
      const userPM = window.userPM || "";
      const userSecao = window.userSecao || "";
      const gasUrl = 'https://script.google.com/macros/s/AKfycbyriniVNqgHE206Vzx3_rplOVwSxV2f6HjyAr1zEhmyXoMH_l8AkGLyin1PK4jI0tHe/exec';
      
      const assunto = `Pendências no Relatório SIRCONV/SIC3 - ${municipio} (${mes}/${ano})`;
      const descricao = `Há pendências no relatório do SIRCONV/SIC3 referente ao município de ${municipio}, convênio ${convenio}, período ${mes}/${ano} que precisam ser verificadas.\n\n` +
                        `Detalhamento das pendências/irregularidades registradas:\n"${desc}"\n\n` +
                        `Tarefa gerada automaticamente pelo SisPMG+ a partir do registro de pendência.\n` +
                        `Responsável pelo registro: ${window.userPostoGraduacao || ""} ${window.userNome || ""} (Matrícula: ${userPM}) - Seção: ${userSecao}.`;

      const eventData = {
        id: `evt_${Date.now()}`,
        'data/hora': dataHoraString,
        assunto: assunto,
        autor: userPM,
        abrangencia: `c:${unidadeSelecionada.value}`,
        status: 'ACTIVE',
        autoConfirmarDias: 5,
        descricao: descricao,
        editorNumero: userPM
      };

      console.log("[SIRCONV Pendências] Enviando requisição de criação de evento para o background da agenda:", eventData);
      
      const result = await enviarMensagemBackground('agenda-add-event', {
        gasUrl: gasUrl,
        eventData: eventData
      });

      if (result && result.success) {
        console.log("[SIRCONV Pendências] Nova tarefa de pendência criada e agendada com sucesso!");
      } else {
        console.error("[SIRCONV Pendências] Falha ao criar a tarefa de agendamento na planilha da Agenda:", result ? result.error : "Sem retorno");
      }

    } catch (error) {
      console.error("[SIRCONV Pendências] Erro no fluxo de criação de tarefa da agenda:", error);
    }
  }

  async function concluirTarefaPendenciaSirconv(municipio, convenio, ano, mes) {
    try {
      console.log(`[SIRCONV Pendências] Buscando tarefas ativas da agenda para o relatório de ${municipio} (${mes}/${ano}) para conclusão...`);
      
      const assuntoAlvo = `Pendências no Relatório SIRCONV/SIC3 - ${municipio} (${mes}/${ano})`;
      const sheetId = '1wtk0NWpyXPm791PPB2ICoto1YnKyYJ4UCs5JxJIRM_U';
      
      const response = await enviarMensagemBackground('agenda-fetch-data', {
        sheetId: sheetId,
        sheet: 'tarefas',
        query: `SELECT A, B, C, D, E, F, G, H, I, J, K WHERE G = 'ACTIVE'`
      });

      if (response && response.success && Array.isArray(response.data)) {
        // Encontra as tarefas correspondentes pelo assunto
        const tarefasAlvo = response.data.filter(row => {
          const assunto = row[3] || "";
          return assunto.trim() === assuntoAlvo.trim();
        });

        if (tarefasAlvo.length === 0) {
          console.log("[SIRCONV Pendências] Nenhuma tarefa ativa correspondente encontrada na agenda.");
          return;
        }

        console.log(`[SIRCONV Pendências] Encontrada(s) ${tarefasAlvo.length} tarefa(s) ativa(s) na agenda. Marcando-as como concluídas...`);
        
        const userPM = window.userPM || "";
        const gasUrl = 'https://script.google.com/macros/s/AKfycbyriniVNqgHE206Vzx3_rplOVwSxV2f6HjyAr1zEhmyXoMH_l8AkGLyin1PK4jI0tHe/exec';
        
        for (const tarefa of tarefasAlvo) {
          const taskId = tarefa[0];
          console.log(`[SIRCONV Pendências] Concluindo tarefa de ID: ${taskId}`);
          
          await enviarMensagemBackground('agenda-add-event', {
            gasUrl: gasUrl,
            eventData: {
              id: taskId,
              autoConfirmarDias: 0, // 0 = concluída
              editorNumero: userPM
            }
          });
        }
        
        console.log("[SIRCONV Pendências] Todas as tarefas correspondentes na agenda foram concluídas!");
      } else {
        console.warn("[SIRCONV Pendências] Falha ao carregar tarefas da agenda para exclusão:", response ? response.error : "Sem resposta");
      }
    } catch (error) {
      console.error("[SIRCONV Pendências] Erro ao concluir tarefa da agenda:", error);
    }
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
            .withSuccessHandler(async (s) => {
              if (s && s.success) {
                mostrarCarregamento("Criando tarefa de pendências na Agenda da Intranet PM...");
                try {
                  await agendarTarefaPendenciaSirconv(municipio, convenio, ano, mes, desc);
                } catch (agendaErr) {
                  console.error("Erro ao agendar tarefa de pendência:", agendaErr);
                }
                ocultarCarregamento();
                mostrarDialogo("Sucesso", "Pendências registradas com sucesso no SIRCONV e tarefa criada na Agenda de Pendências!");
                carregarLancamentos();
              } else {
                ocultarCarregamento();
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
          const statusValue = "OK";
          
          const sucesso = await handleSirconvSiadUpdate(
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

          if (sucesso) {
            mostrarCarregamento("Concluindo tarefas correspondentes na Agenda PM...");
            try {
              await concluirTarefaPendenciaSirconv(municipio, convenio, ano, mes);
            } catch (err) {
              console.error("Erro ao concluir tarefas da agenda:", err);
            }
            ocultarCarregamento();
          }
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
