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
        initComplete: (settings) => { setupDataTableSearchAdmin(settings); ocultarCarregamento(); },
        error: (xhr, error, thrown) => { manipularErro(error, "DataTableInit"); ocultarCarregamento(); }
      });
    } catch (error) { manipularErro(error, "carregarPesquisaMaterialAdmin"); ocultarCarregamento(); }
  }

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
              $(".dt-empty, .dataTables_empty").css({ color: "red", "font-size": "120%" }).html("Nenhum resultado na base primária.<br>Altere a busca ou tecle ENTER para buscar na base secundária.");
            }
          }
        }).on("keydown", function(e) { if (e.key === "Enter") { e.preventDefault(); handleServerSearchAdmin($(this).val().toLowerCase(), colIndex, table); } });
    });
  }

  async function handleServerSearchAdmin(searchTerm, colIndex, table) {
    try {
      mostrarCarregamento();
      const searchWords = searchTerm.split(" ").filter(w => w.length > 0);
      if (searchWords.length === 0) { mostrarDialogo("Aviso", "Digite termos para buscar na base secundária."); ocultarCarregamento(); return; }
      $("#dataTable > tbody").empty().html('<tr><td colspan="5" style="text-align: center; color: blue; font-size: 120%; z-index: 998">Aguarde, pesquisando na Base de Dados Secundária...</td></tr>');
      const searchColumnMap = { 0: 'A', 1: 'B' };
      const searchColumn = searchColumnMap[colIndex];
      if (!searchColumn) { manipularErro(new Error("Índice de coluna inválido para busca secundária: " + colIndex), "handleServerSearchAdmin"); ocultarCarregamento(); return; }
      const conditions = searchWords.map(word => `${searchColumn} CONTAINS UPPER('${word}')`).join(" AND ");
      const query = `SELECT A,B,C,D WHERE ${conditions}`;
      try {
        const serverData = await carregarDadosPlanilha({ sheetId: "1JSea5w5dmuxO2svSVqVpNft4NUsKDCeWv5i3Rv_wRUM", sheet: "tb-secundaria", query: query });
        const processedServerData = (serverData && serverData.length > 0 && serverData[0][0] === 'CÓDIGO') ? serverData.slice(1) : serverData || [];
        if (!processedServerData || processedServerData.length === 0) {
          $(".dt-empty, .dataTables_empty").css({ color: "red", "font-size": "120%" }).html("Nenhum resultado na Base de Dados Secundária.<br>Altere a busca ou tecle ENTER para nova busca.");
        } else {
          const combinedData = mergeAndRemoveDuplicatesAdmin(table.data().toArray(), processedServerData);
          table.clear().rows.add(combinedData).draw();
          if (combinedData.length > 0) $(".dt-empty, .dataTables_empty").text("");
        }
      } catch (error) { manipularErro(error, "handleServerSearchAdmin_PlanilhaSecundaria"); }
    } catch (error) { manipularErro(error, "handleServerSearchAdmin_Geral"); }
    finally { ocultarCarregamento(); }
  }

  function mergeAndRemoveDuplicatesAdmin(localData, serverData) {
    const allData = [...localData, ...serverData], uniqueData = [], codes = new Set();
    for (const row of allData) { const code = row && row.length > 0 ? row[0] : null; if (code !== null && String(code).trim() !== '' && !codes.has(String(code).trim())) { uniqueData.push(row); codes.add(String(code).trim()); } }
    return uniqueData;
  }
