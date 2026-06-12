var termosDeBuscaGlobal = new Set();
  var termosJaBuscadosGlobal = new Map();
  var ultimoTermoBusca = '';
  var contadorEnter = 0;

  async function carregarPesquisaMaterial() {
    try {
      mostrarCarregamento();
      if ($.fn.DataTable.isDataTable("#dataTable")) {
        $("#dataTable").DataTable().destroy();
        $("#dataTable tbody").empty();
        $("#dataTable thead th").each(function() {
          const $th = $(this);
          if ($th.find('input.dt-search-input').length > 0) {
            const originalTitle = $th.data('original-title') || $th.text();
            $th.empty().text(originalTitle);
          }
        });
      }
      $("#dataTable thead th").each(function() {
        $(this).data('original-title', $(this.innerHTML));
      });

      const initialData = await carregarDadosPlanilha({
        sheetId: idbase,
        sheet: "dt-primaria",
        query: "SELECT A,B,C,D",
      });

      $("#dataTable").DataTable({
        data: initialData.slice(1),
        processing: true,
        serverSide: false,
        sort: false,
        searching: true,
        searchHighlight: true,
        pageLength: 15,
        lengthMenu: [
          [5, 15, 25, 50, 100],
          [5, 15, 25, 50, 100]
        ],
        language: {
          url: "https://cdn.datatables.net/plug-ins/2.0.8/i18n/pt-BR.json"
        },
        orderCellsTop: true,
        info: true,
        dom: '<"top"il>rt<"bottom"ip>',
        autoWidth: false,
        columns: [{
          title: "CÓDIGO",
          data: 0
        }, {
          title: "DESCRIÇÃO COMPLETA",
          data: 1
        }, {
          title: "AÇÕES",
          data: null,
          render: (data, type, row) => {
            const isPortal = row.isPortal || false;
            const portalIdAttr = isPortal ? `data-portal-id="${row.portalId}"` : '';
            const portalClass = isPortal ? 'portal-item-btn' : '';
            return `<button type="button" class="btn-adicionar btn btn-success btn-sm ${portalClass}" title="Adicionar" data-codigo="${row[0]}" ${portalIdAttr}>
                      <i class="fas fa-plus"></i>
                    </button>`;
          },
          orderable: false,
          searchable: false
        }],
        columnDefs: [{
          width: "100px",
          targets: 0,
          className: "dt-col-codigo dt-center",
          type: "string"
        }, {
          width: "auto",
          targets: 1,
          className: "dt-col-descricao"
        }, {
          width: "50px",
          targets: 2,
          className: "dt-col-acoes dt-center"
        }],
        createdRow: function(row, data, dataIndex) {
            if (data.isPortal) {
                $(row).css('background-color', '#ffcccb'); // Vermelho claro
            } else if (data.isSecondary) {
                $(row).css('background-color', '#fffacd'); // Amarelo claro
            }
        },

        drawCallback: function(settings) {
          var api = this.api();
          var body = $(api.table().body());

          body.unhighlight();

          var searchTerms = [];
          var globalSearch = api.search();
          if (globalSearch) {
              searchTerms.push(globalSearch);
          }
          api.columns().every(function () {
              var colSearch = this.search();
              if (colSearch) {
                  searchTerms.push(colSearch);
              }
          });

          if (searchTerms.length > 0) {
              body.highlight(searchTerms);
          }
        },
        initComplete: (settings) => {
          setupDataTableSearch(settings);
          ocultarCarregamento();
        },
        error: (xhr, error, thrown) => {
          manipularErro(error, "DataTableInit");
          ocultarCarregamento();
        }
      });
    } catch (error) {
      manipularErro(error, "carregarPesquisaMaterial");
      ocultarCarregamento();
    }
  }

  function setupDataTableSearch(settings) {
  const table = settings.oInstance.api();
  table.columns([0, 1]).every(function(colIndex) {
    let column = this;
    let title = $(column.header()).text() || `Coluna ${colIndex + 1}`;
    const input = $(`<input type="text" placeholder="${title}" class="dt-search-input form-control form-control-sm" data-column-index="${colIndex}">`)
      .appendTo($(column.header()).empty())
      .on("keyup change", function() {
        if (column.search() !== this.value) {
          column.search(this.value).draw();
          if (table.rows({ filter: "applied" }).data().length === 0) {
            $(".dt-empty, .dataTables_empty").css({
              color: "red",
              "font-size": "120%"
            }).html("Nenhum resultado encontrado na base primária. Altere os termos da busca por SINÔNIMOS ou<br>tecle ENTER para procurar na base secundária.<br><br>Dica: Use apenas palavras chaves e/ou partes de palavras. Evite o uso de caracteres especiais como vírgula, hífem, etc.");
          }
        }
      }).on("keydown", function(e) {
        if (e.key === "Enter") {
          e.preventDefault();
          const termoBuscaAtual = this.value.trim().toLowerCase();

          if (termoBuscaAtual.length < 3) {
            mostrarDialogo("Busca Inválida", "Por favor, digite no mínimo 3 caracteres para realizar a busca.");
            return;
          }

          if (termoBuscaAtual) {
            termosDeBuscaGlobal.add(termoBuscaAtual);
            console.log('[setupDataTableSearch] Termo de busca adicionado:', termoBuscaAtual);
          }

          if (termoBuscaAtual === ultimoTermoBusca) {
            contadorEnter++;
          } else {
            ultimoTermoBusca = termoBuscaAtual;
            contadorEnter = 1;
          }

          if (contadorEnter === 1) {
            buscarNaBaseSecundaria(termoBuscaAtual, colIndex, table);
          } else {
            buscarNoPortalEBaseSecundaria(termoBuscaAtual, colIndex, table);
          }
        }
      });
  });

  $("#dataTable tbody").off('click.btncrud').on("click.btncrud", ".btn-adicionar", async function() {
    const tr = $(this).closest("tr");
    const table = $('#dataTable').DataTable();
    const row = table.row(tr);
    const rowData = row.data();
    const isPortal = $(this).hasClass('portal-item-btn');
    const portalId = $(this).data('portal-id');

    if (rowData) {
      mostrarCarregamento();
      try {
        let dadosParaForm;
        if (isPortal) {
          const detalhes = await new Promise((resolve, reject) => {
            google.script.run
              .withSuccessHandler(result => {
                resolve(result);
              })
              .withFailureHandler(error => {
                manipularErro(error, 'obterDetalhesItemPortal');
                reject(error);
              })
              .obterDetalhesItemPortal(portalId);
          });

          if (!detalhes) {
            mostrarDialogo("Erro", "Não foi possível obter os detalhes do item do portal.");
            ocultarCarregamento();
            return;
          }
          dadosParaForm = {
            codigoItem: rowData[0],
            descricao: rowData[1],
            opcoesDespesa: detalhes.elementosDespesa.map(d => ({ value: d, label: d })),
            opcoesUnidade: detalhes.unidadesFornecimento.map(u => ({ value: u, label: u })),
            isItem99: false,
            isEditing: false,
            isPortal: true,
          };
        } else {
          dadosParaForm = {
            codigoItem: rowData[0],
            descricao: rowData[1],
            opcoesDespesa: criarOpcoesCombobox(rowData[2]).map(d => ({ value: d, label: d })),
            opcoesUnidade: criarOpcoesCombobox(rowData[3]).map(u => ({ value: u, label: u })),
            isItem99: false,
            isEditing: false,
            isPortal: false
          };
        }
        await abrirFormularioMaterial(dadosParaForm, false);
      } catch (error) {
        console.error(`[CLIENT] Erro no handler do botão adicionar:`, error);
        manipularErro(error, "btnAdicionarMaterialClick");
      } finally {
        ocultarCarregamento();
      }
    }
  });

  $(document).off("click.item99").on("click.item99", "#btnAdicionarItem99", async function() {
    console.log('[btnAdicionarItem99] Termos de busca globais no momento do clique:', Array.from(termosDeBuscaGlobal));
    const mensagem = "A inserção de um item 99 bloqueará a geração dos PDF do Anexo \"D\" e do Anexo \"Único\" até a verificação e aprovação do Almoxarifado. Os termos buscados ficarão salvos, portanto, tenha certeza de ter efetuado todas as buscas com os termos possíveis e ter percorrido todas as páginas da tabela de itens.";
    const confirmado = await confirmarAcao("Confirmação de Inserção - Item 99", mensagem);
    if (!confirmado) return;
    mostrarCarregamento();
    try {
      await abrirFormularioMaterial(null, true);
    } catch (error) {
      manipularErro(error, "btnAdicionarItem99GlobalClick");
    } finally {
      ocultarCarregamento();
    }
  });
}
  
  async function buscarNaBaseSecundaria(searchTerm, colIndex, table) {
      mostrarCarregamento("Aguarde, pesquisando na base secundária...");
      const searchColumnMap = { 0: 'A', 1: 'B' };
      const searchColumn = searchColumnMap[colIndex];
      if (!searchColumn) {
          manipularErro(new Error("Índice de coluna inválido para busca secundária: " + colIndex), "buscarNaBaseSecundaria");
          ocultarCarregamento();
          return;
      }
      const conditions = searchTerm.split(" ").filter(w => w.length > 0).map(word => `${searchColumn} CONTAINS UPPER('${word}')`).join(" AND ");
      const query = `SELECT A,B,C,D WHERE ${conditions}`;
      
      try {
          const serverData = await carregarDadosPlanilha({ sheetId: "1JSea5w5dmuxO2svSVqVpNft4NUsKDCeWv5i3Rv_wRUM", sheet: "dt-secundaria", query: query });
          const processedServerData = (serverData && serverData.length > 0 && serverData[0][0] === 'CÓDIGO') 
            ? serverData.slice(1).map(row => { row.isSecondary = true; return row; }) 
            : (serverData || []).map(row => { row.isSecondary = true; return row; });
          
          const combinedData = mergeAndRemoveDuplicates(table.data().toArray(), processedServerData);
          
          table.clear().rows.add(combinedData).draw();

          if (table.rows({ page: 'current' }).data().length === 0) {
              const mensagemSemResultado = `Nenhum resultado encontrado. Altere os termos da busca por SINÔNIMOS e tecle ENTER para fazer nova pesquisa na base secundária<br>ou mantenha os mesmos termos da busca e tecle ENTER para procurar no Portal de Compras MG.<br><br>Dica: Use apenas palavras chaves e/ou partes de palavras. Evite o uso de caracteres especiais como vírgula, hífem, etc.`;
              $(".dt-empty, .dataTables_empty").css({ color: "red", "font-size": "120%" }).html(mensagemSemResultado);
          }

      } catch (error) {
          manipularErro(error, "buscarNaBaseSecundaria_Planilha");
      } finally {
          ocultarCarregamento();
      }
  }

  async function buscarNoPortalEBaseSecundaria(searchTerm, colIndex, table) {
      mostrarCarregamento("Aguarde, pesquisando no Portal de Compras MG...");
      
      try {
          const dadosPortal = await new Promise((resolve, reject) => {
              google.script.run
                  .withSuccessHandler(result => {
                      resolve(result || []);
                  })
                  .withFailureHandler(error => { 
                      manipularErro(error, 'buscarNoPortalCompras'); 
                      reject(error);
                  })
                  .buscarNoPortalCompras(searchTerm);
          });

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
          const dadosCombinados = mergeAndRemoveDuplicates(dadosAtuais, dadosPortalFormatados);
          
          table.clear().rows.add(dadosCombinados).draw();
          
          if (table.rows({ page: 'current' }).data().length === 0) {
              const mensagemSemResultado = `Nenhum item encontrado. Altere os termos da busca por SINÔNIMOS e pesquise novamente<br>ou, em último caso, na inexistência do material no catálogo, adicione um "Item 99".<br><button id="btnAdicionarItem99" class="btn btn-info" style="margin-top: 10px;"><i class="fas fa-plus-circle"></i> Adicionar Item 99</button><br><br>Dica: Use apenas palavras chaves e/ou partes de palavras. Evite o uso de caracteres especiais como vírgula, hífem, etc.`;
              $(".dt-empty, .dataTables_empty").css({ color: "red", "font-size": "120%" }).html(mensagemSemResultado);
          }

      } catch (error) {
          manipularErro(error, "buscarNoPortalEBaseSecundaria");
      } finally {
          ocultarCarregamento();
      }
  }

  function mergeAndRemoveDuplicates(data1, data2) {
    const combined = [...data1, ...data2];
    const unique = new Map();
    combined.forEach(row => {
        const code = Array.isArray(row) ? row[0] : row['0'];
        if (code && !unique.has(String(code).trim())) {
            unique.set(String(code).trim(), row);
        }
    });
    return Array.from(unique.values());
  }

  function criarOpcoesCombobox(valueString) {
    if (!valueString || typeof valueString != 'string') return [];
    return valueString.split("|").map(option => option.trim()).filter(option => option !== "");
  }
