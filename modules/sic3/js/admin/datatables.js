// =================== PESQUISA DE MATERIAL ===================
  async function carregarPesquisaMaterialAdmin() {
    try {
      mostrarCarregamento();
      if ($.fn.DataTable.isDataTable("#dataTable")) { $("#dataTable").DataTable().destroy(); $("#dataTable tbody").empty(); }
      $(".principal-container").hide(); $(".datatable-container").show();
      if ($("#filtro-unidade").length) { $("#filtro-unidade").remove(); $("#tabela-lancamentos thead th:first-child").html("MUNICÍPIO"); }

      const initialData = await carregarDadosPlanilha({ sheetId: idbase, sheet: "tb-primaria", query: "SELECT A,B,C,D" });
      $("#dataTable").DataTable({
        data: initialData.slice(1), processing: true, serverSide: false, sort: false, searching: true, searchHighlight: true, pageLength: 50,
        lengthMenu: [[5, 25, 50, 100], [5, 25, 50, 100]], language: { url: "https://cdn.datatables.net/plug-ins/2.0.8/i18n/pt-BR.json" },
        orderCellsTop: true, info: true, dom: '<"top"il>rt<"bottom"ip>', autoWidth: false,
        columns: [  { title: "CÓDIGO", data: 0 },
                    { title: "DESCRIÇÃO COMPLETA", data: 1 },
                   { title: "ELEMENTO DESPESA", data: 2, render: data => data ? data.split("|").join("<br>") : "" },
                   { title: "UNIDADE", data: 3, render: data => data ? `<select class="form-control">${data.split("|").map(opt => `<option value="${opt.trim()}">${opt.trim()}</option>`).join("")}</select>` : "" } ],
        columnDefs: [ { width: "90px", targets: 0, className: "dt-col-codigo dt-center", type: "string" },
                      { width: "auto", targets: 1, className: "dt-col-descricao" },
                      { width: "20%", targets: 2, className: "dt-col-despesa" },
                      { width: "200px", targets: 3, className: "dt-col-unidade" } ],
        createdRow: function (row, data, dataIndex) {
          if (data.isPortal) {
            $(row).find('td').css('background-color', '#ffcccb'); // Vermelho claro
          } else if (data.isSecondary) {
            $(row).find('td').css('background-color', '#fffacd'); // Amarelo claro
          }
        },
        initComplete: (settings) => { setupDataTableSearchAdmin(settings); ocultarCarregamento(); },
        error: (xhr, error, thrown) => { manipularErro(error, "DataTableInit"); ocultarCarregamento(); }
      });
    } catch (error) { manipularErro(error, "carregarPesquisaMaterialAdmin"); ocultarCarregamento(); }
  }

  let ultimoTermoBuscaAdmin = "";
  let contadorEnterAdmin = 0;

  function setupDataTableSearchAdmin(settings) {
    const table = settings.oInstance.api();
    table.columns([0, 1, 2, 3]).every(function(colIndex) {
      let column = this; let title = $(column.header()).text() || `Coluna ${colIndex + 1}`;
      const input = $(`<input type="text" placeholder="${title}" class="dt-search-input form-control form-control-sm" data-column-index="${colIndex}">`)
        .appendTo($(column.header()).empty())
        .on("keyup change", function() {
          if (column.search() !== this.value) {
            column.search(this.value).draw();
            if (table.rows({ filter: "applied" }).data().length === 0) {
              const mensagemSemResultado = `Nenhum resultado encontrado. Altere os termos da busca por SINÔNIMOS e tecle ENTER para fazer nova pesquisa na base secundária<br>ou mantenha os mesmos termos da busca e tecle ENTER para procurar no Portal de Compras MG.<br><br>Dica: Use apenas palavras chaves e/ou partes de palavras. Evite o uso de caracteres especiais como vírgula, hífem, etc.`;
              $(".dt-empty, .dataTables_empty").css({ color: "red", "font-size": "120%" }).html(mensagemSemResultado);
            }
          }
        }).on("keydown", function(e) {
          if (e.key === "Enter") {
            e.preventDefault();
            const termoBuscaAtual = $(this).val().toLowerCase().trim();

            if (termoBuscaAtual.length < 3) {
              mostrarDialogo("Busca Inválida", "Por favor, digite no mínimo 3 caracteres para realizar a busca.");
              return;
            }

            if (termoBuscaAtual === ultimoTermoBuscaAdmin) {
              contadorEnterAdmin++;
            } else {
              ultimoTermoBuscaAdmin = termoBuscaAtual;
              contadorEnterAdmin = 1;
            }

            if (contadorEnterAdmin === 1) {
              buscarNaBaseSecundariaAdmin(termoBuscaAtual, colIndex, table);
            } else {
              buscarNoPortalEBaseSecundariaAdmin(termoBuscaAtual, colIndex, table);
            }
          }
        });
    });
  }

  async function buscarNaBaseSecundariaAdmin(searchTerm, colIndex, table) {
    mostrarCarregamento("Aguarde, pesquisando na base secundária...");
    const searchColumnMap = { 0: 'A', 1: 'B' };
    const searchColumn = searchColumnMap[colIndex];
    if (!searchColumn) {
      manipularErro(new Error("Índice de coluna inválido para busca secundária: " + colIndex), "buscarNaBaseSecundariaAdmin");
      ocultarCarregamento();
      return;
    }
    const conditions = searchTerm.split(" ").filter(w => w.length > 0).map(word => `${searchColumn} CONTAINS UPPER('${word}')`).join(" AND ");
    const query = `SELECT A,B,C,D WHERE ${conditions}`;

    try {
      const serverData = await carregarDadosPlanilha({ sheetId: "1JSea5w5dmuxO2svSVqVpNft4NUsKDCeWv5i3Rv_wRUM", sheet: "tb-secundaria", query: query });
      const processedServerData = (serverData && serverData.length > 0 && serverData[0][0] === 'CÓDIGO')
        ? serverData.slice(1).map(row => { row.isSecondary = true; return row; })
        : (serverData || []).map(row => { row.isSecondary = true; return row; });

      const combinedData = mergeAndRemoveDuplicatesAdmin(table.data().toArray(), processedServerData);

      table.clear().rows.add(combinedData).draw();

      if (table.rows({ page: 'current' }).data().length === 0) {
        const mensagemSemResultado = `Nenhum resultado encontrado. Altere os termos da busca por SINÔNIMOS e tecle ENTER para fazer nova pesquisa na base secundária<br>ou mantenha os mesmos termos da busca e tecle ENTER para procurar no Portal de Compras MG.<br><br>Dica: Use apenas palavras chaves e/ou partes de palavras. Evite o uso de caracteres especiais como vírgula, hífem, etc.`;
        $(".dt-empty, .dataTables_empty").css({ color: "red", "font-size": "120%" }).html(mensagemSemResultado);
      }

    } catch (error) {
      manipularErro(error, "buscarNaBaseSecundariaAdmin_Planilha");
    } finally {
      ocultarCarregamento();
    }
  }

  function exibirPrePromptComprasAdmin() {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.id = 'sispmg-permission-modal-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(13, 17, 23, 0.75);
        backdrop-filter: blur(4px);
        z-index: 25000;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
      `;

      const modal = document.createElement('div');
      modal.style.cssText = `
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 12px;
        width: 90%;
        max-width: 440px;
        padding: 24px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
        color: #f1f5f9;
        text-align: center;
        animation: sispmgFadeIn 0.3s ease;
      `;

      const styleEl = document.createElement('style');
      styleEl.textContent = `
        @keyframes sispmgFadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `;
      document.head.appendChild(styleEl);

      modal.innerHTML = `
        <div style="font-size: 42px; margin-bottom: 12px;">🔍</div>
        <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 10px 0; color: #b3a368; letter-spacing: 0.5px;">Pesquisa no Catálogo de Materiais</h3>
        <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1; margin: 0 0 20px 0; text-align: left;">
          Para buscar materiais diretamente no Portal de Compras do Estado (compras.mg.gov.br), o SisPMG+ precisa realizar uma consulta externa segura.<br><br>
          Clique em <strong>Autorizar Acesso</strong> e confirme a permissão na próxima janela de segurança que o navegador abrirá.
        </p>
        <button id="sispmg-modal-grant-btn" style="
          background: linear-gradient(135deg, #574e2d 0%, #b3a368 100%);
          color: #0f172a;
          border: none;
          padding: 12px 24px;
          font-size: 14.5px;
          font-weight: 700;
          border-radius: 8px;
          cursor: pointer;
          width: 100%;
          box-shadow: 0 4px 12px rgba(179, 163, 104, 0.2);
          transition: all 0.2s ease;
          letter-spacing: 0.3px;
        " onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 6px 16px rgba(179, 163, 104, 0.35)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(179, 163, 104, 0.2)'">Autorizar Acesso</button>
      `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      document.getElementById('sispmg-modal-grant-btn').addEventListener('click', () => {
        overlay.remove();
        styleEl.remove();
        resolve();
      });
    });
  }

  async function buscarNoPortalEBaseSecundariaAdmin(searchTerm, colIndex, table) {
    const api = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);
    if (api && api.permissions) {
      const origins = ["https://*.compras.mg.gov.br/*", "https://compras.mg.gov.br/*"];
      const temPermissao = await new Promise(resolve => api.permissions.contains({ origins }, resolve));
      
      if (!temPermissao) {
        await exibirPrePromptComprasAdmin();
        const concedido = await new Promise(resolve => api.permissions.request({ origins }, resolve));
        if (!concedido) {
          console.warn("[SIC3 Materiais Admin] Permissão compras.mg.gov.br não concedida. Abortando busca.");
          alert("SisPMG+: A permissão de acesso ao portal 'compras.mg.gov.br' é necessária para pesquisar materiais externos.");
          return;
        }
      }
    }

    mostrarCarregamento("Aguarde, pesquisando no Portal de Compras MG...");

    try {
      const dadosPortal = await buscarNoPortalComprasLocalAdmin(searchTerm);

      const dadosPortalFormatados = (dadosPortal || []).map(item => {
        return {
          0: item.codigo,
          1: item.descricao,
          2: '',
          3: '',
          isPortal: true,
          portalId: item.id
        };
      });

      const dadosAtuais = table.data().toArray();
      const dadosCombinados = mergeAndRemoveDuplicatesAdmin(dadosAtuais, dadosPortalFormatados);

      table.clear().rows.add(dadosCombinados).draw();

      if (table.rows({ page: 'current' }).data().length === 0) {
        const mensagemSemResultado = `Nenhum item encontrado. Altere os termos da busca por SINÔNIMOS e pesquise novamente.<br><br>Dica: Use apenas palavras chaves e/ou partes de palavras. Evite o uso de caracteres especiais como vírgula, hífem, etc.`;
        $(".dt-empty, .dataTables_empty").css({ color: "red", "font-size": "120%" }).html(mensagemSemResultado);
      }

    } catch (error) {
      manipularErro(error, "buscarNoPortalEBaseSecundariaAdmin");
    } finally {
      ocultarCarregamento();
    }
  }

  async function buscarNoPortalComprasLocalAdmin(searchTerm) {
    try {
      const url = "https://www1.compras.mg.gov.br/servico/catalogo/itemmaterialservico/Consulta/pesquisar";
      const payload = {
        reqId: 1,
        ordenacoes: [],
        sizePerPage: 9999999,
        page: 1,
        filtros: {
          tiposGrupo: "MATERIAL",
          tipoPesquisa: "CONSIDERAR_TUDO_COM_SINONIMO",
          especificacaoItem: searchTerm
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Erro na resposta do portal de compras: HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data && data.resultado && Array.isArray(data.resultado.dados)) {
        return data.resultado.dados.map(item => ({
          id: item.id,
          codigo: item.codigo,
          descricao: item.especificacaoCompleta || item.nome
        })).filter(item => item.id && item.codigo && item.descricao);
      }
      return [];
    } catch (error) {
      console.error("Erro ao buscar no portal de compras:", error);
      throw error;
    }
  }

  function mergeAndRemoveDuplicatesAdmin(localData, serverData) {
    const combined = [...localData, ...serverData];
    const unique = new Map();
    combined.forEach(row => {
      const code = Array.isArray(row) ? row[0] : (row && row['0'] ? row['0'] : null);
      if (code && !unique.has(String(code).trim())) {
        unique.set(String(code).trim(), row);
      }
    });
    return Array.from(unique.values());
  }
