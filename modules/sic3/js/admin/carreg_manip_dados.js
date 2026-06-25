// Grupo 3: Carregamento e Manipulação de Dados

  async function carregarInformacoesAdmin() {
    try {
      const userMLog = typeof mLog != "undefined" ? mLog : "";

      const condicaoWhere =
        userMLog === "admin" ? "A IS NOT NULL" : `A = '${userMLog}'`;

      const [conveniosData, linksData] = await Promise.all([
        carregarDadosPlanilha({
          sheetId: idbase,
          sheet: "convenios",
          query: `SELECT A,B,C,D,E,F,G,H,M,N,Y,Z WHERE ${condicaoWhere}`,
        }),
        carregarDadosPlanilha({
          sheetId: "1hP7wQgtsgUMuSNDC7Ac4gHKX0uWPVMTQV7Q5Xwpqwic", // CENTRAL_BD_LINKS_ID
          sheet: "links",
          query: `SELECT B WHERE A = '${window.rpm || ''}' AND B IS NOT NULL`,
        }),
      ]);

      ADMIN_CONFIG.dados.convenios = [];

      let dadosParaProcessar = [];
      if (conveniosData && conveniosData.length > 0) {
        dadosParaProcessar = (userMLog === "admin") ? conveniosData.slice(1) : conveniosData;
      }
      if (dadosParaProcessar.length > 0) {
        dadosParaProcessar.forEach((row) => {
          const [
            municipio,
            convenio,
            preposto_n,
            preposto_pg,
            preposto,
            unidade,
            dataInicio,
            dataFim,
            status_texto,
            valor_estimado,
            elementos_despesa,
            user_pm
          ] = row;
          if (municipio) {
            ADMIN_CONFIG.dados.convenios.push({
              municipio: String(municipio).trim(),
              convenio: String(convenio).trim(),
              preposto_n: String(preposto_n || "").trim(),
              preposto_pg: String(preposto_pg || "").trim(),
              preposto: String(preposto || "").trim(),
              unidade: String(unidade || "").trim(),
              dataInicio: String(dataInicio || "").trim(),
              dataFim: String(dataFim || "").trim(),
              status_texto: String(status_texto || "").trim(),
              valor_estimado: String(valor_estimado || "").trim(),
              elementos_despesa: String(elementos_despesa || "").trim(),
              user_pm: String(user_pm || "").trim()
            });
          }
        });
      }

      const anoAtual = new Date().getFullYear();
      const anoAnterior = anoAtual - 1;
      const todosAnos =
        linksData && linksData.length > 0
          ? linksData.map((row) => String(row[0]).trim())
          : [];
      todosAnos.push(anoAtual.toString(), anoAnterior.toString());
      ADMIN_CONFIG.dados.anos = [...new Set(todosAnos)]
        .filter((a) => a && /^\d{4}$/.test(a))
        .sort((a, b) => b - a);

      await preencherSelectsAdmin(ADMIN_CONFIG.dados);
      return ADMIN_CONFIG.dados;
    } catch (error) {
      manipularErro(error, "carregarInformacoesAdmin");
      throw new Error(
        "Não foi possível carregar as informações administrativas."
      );
    }
  }

  async function carregarDadosBrutosAdmin(mes, municipio, convenio) {
    try {
      const filters = [];
      if (mes && mes !== "TODOS") {
        filters.push(`E='${mes}'`);
      }
      if (municipio && municipio !== "TODOS") {
        filters.push(`B='${municipio}'`);
      }
      if (convenio && convenio !== "TODOS" && /^\d+$/.test(convenio)) {
        filters.push(`C='${convenio}'`);
      }

      let queryStatus = "SELECT A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S";
      if (filters.length > 0) {
        queryStatus += " WHERE " + filters.join(" AND ");
      }

      const [statusInfoRaw] = await Promise.all([
        carregarDadosPlanilha({
          sheetId: idbase,
          sheet: "obsgeral",
          query: queryStatus,
        }),
      ]);

      const statusInfoFiltrados = statusInfoRaw || [];

      return { status: statusInfoFiltrados };
    } catch (error) {
      // Silencia o erro para evitar travar a tela em caso de aba obsgeral vazia ou incompleta
      manipularErro(error, "carregarDadosBrutosAdmin", true);
      return { principal: [], status: [] };
    }
  }

  async function carregarLancamentos() {
    const municipioFiltro = $("#municipio").val();
    const convenioFiltro = $("#convenio").val();
    const ano = $("#ano").val();
    const mesFiltro = $("#mes").val();

    if (!municipioFiltro || !ano) {
      $("#tabela-lancamentos tbody")
        .empty()
        .append(
          '<tr><td colspan="10" class="text-center">Selecione Município e Ano.</td></tr>'
        );
      return;
    }

    // Garante que os IDs das planilhas correspondam ao ano selecionado no painel administrativo
    if (ano && ano !== sessionStorage.getItem("sic3_ano")) {
      sessionStorage.setItem("sic3_ano", ano);
      window.ano = ano;
      if (typeof window.resolverIdsPlanilhas === 'function') {
        try {
          await window.resolverIdsPlanilhas(false);
        } catch (resolveErr) {
          console.error("[SIC3 v3.0 Log] Erro ao resolver IDs das planilhas para o ano selecionado:", resolveErr);
        }
      }
    }

    if (municipioFiltro === "TODOS" && mesFiltro === "TODOS") {
      mostrarDialogo(
        "Aviso",
        "Para a opção 'TODOS OS MUNICÍPIOS', por favor, selecione um MÊS específico. Ou, para 'TODOS OS MESES', selecione um MUNICÍPIO específico."
      );
      $("#tabela-lancamentos tbody")
        .empty()
        .append(
          '<tr><td colspan="10" class="text-center">Seleção de filtros inválida.</td></tr>'
        );
      ADMIN_CONFIG.lancamentosCarregados = true;
      return;
    }

    if (municipioFiltro !== "TODOS" && convenioFiltro === "-") {
      $("#tabela-lancamentos tbody")
        .empty()
        .append(
          `<tr><td colspan="10" class="text-center">Não há convênios ativos para ${municipioFiltro} no período selecionado ou para os filtros aplicados.</td></tr>`
        );
      atualizarCabecalhoTabela();
      ADMIN_CONFIG.lancamentosCarregados = true;
      return;
    }

    atualizarCabecalhoTabela();
    mostrarCarregamento();

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Tempo esgotado")), 30000)
      );
      const dadosBrutos = await Promise.race([
        carregarDadosBrutosAdmin(mesFiltro, municipioFiltro, convenioFiltro),
        timeoutPromise,
      ]);
      const lancamentosParaTabela = [];
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

      if (municipioFiltro === "TODOS") {
        const municipiosUnicos = [
          ...new Set(
            ADMIN_CONFIG.dados.convenios
              .map((c) => c.municipio)
              .filter((m) => m && m !== "ADMIN")
          ),
        ].sort();

        municipiosUnicos.forEach((mun) => {
          const conveniosDoMunicipioNoMes = ADMIN_CONFIG.dados.convenios.filter(
            (item) =>
              item.municipio === mun &&
              item.convenio !== "-" &&
              verificarVigenciaConvenio(item, ano, mesFiltro) &&
              (convenioFiltro === "TODOS" || item.status_texto === convenioFiltro)
          );
          if (conveniosDoMunicipioNoMes.length > 0) {
            conveniosDoMunicipioNoMes.forEach((conv) => {
              const statusRowConv = dadosBrutos.status.find(
                (s) =>
                  String(s[1]).trim() === conv.municipio &&
                  String(s[2]).trim() === conv.convenio &&
                  String(s[3]).trim() === ano &&
                  String(s[4]).trim() === mesFiltro
              );
              lancamentosParaTabela.push({
                timestamp:
                  statusRowConv && statusRowConv[0]
                    ? String(statusRowConv[0]).trim()
                    : "",
                municipio: conv.municipio,
                convenio: conv.convenio,
                ano,
                mes: mesFiltro,
                valorTotal:
                  statusRowConv && statusRowConv[5]
                    ? formatarNumero(statusRowConv[5], "numero")
                    : "",
                edicaoBloqueada: statusRowConv
                  ? String(statusRowConv[7]).trim() === "SIM"
                  : false,
                sirconvStatus:
                  statusRowConv && statusRowConv[9]
                    ? String(statusRowConv[9]).trim()
                    : "",
                siadStatus:
                  statusRowConv && statusRowConv[10]
                    ? String(statusRowConv[10]).trim()
                    : "",
                siadInfo: statusRowConv ? {
                  colL: statusRowConv[11] ? String(statusRowConv[11]).trim() : "",
                  colM: statusRowConv[12] ? String(statusRowConv[12]).trim() : "",
                  colN: statusRowConv[13] ? String(statusRowConv[13]).trim() : "",
                  colO: statusRowConv[14] ? String(statusRowConv[14]).trim() : "",
                  colP: statusRowConv[15] ? String(statusRowConv[15]).trim() : "",
                  colQ: statusRowConv[16] ? String(statusRowConv[16]).trim() : "",
                  colR: statusRowConv[17] ? String(statusRowConv[17]).trim() : "",
                  colS: statusRowConv[18] ? String(statusRowConv[18]).trim() : "",
                } : null,
                semConvenio: false,
              });
            });
          } else {
            if (convenioFiltro === "TODOS") {
              lancamentosParaTabela.push({
                municipio: mun,
                convenio: "-",
                ano,
                mes: mesFiltro,
                valorTotal: 0,
                edicaoBloqueada: false,
                sirconvStatus: "",
                siadStatus: "",
                timestamp: "",
                semConvenio: true,
              });
            }
          }
        });
      } else {
        const conveniosDoMunicipio = ADMIN_CONFIG.dados.convenios.filter(
          (item) => item.municipio === municipioFiltro && item.convenio !== "-"
        );
        const mesesAIterar = mesFiltro === "TODOS" ? mesesNomes : [mesFiltro];

        mesesAIterar.forEach((nomeMesCorrente) => {
          let linhasAdicionadasParaEsteMes = 0;
          let conveniosParaEsteMes = [];

          if (convenioFiltro === "TODOS") {
            conveniosParaEsteMes = conveniosDoMunicipio.filter((conv) =>
              verificarVigenciaConvenio(conv, ano, nomeMesCorrente)
            );
          } else {
            const convEsp = conveniosDoMunicipio.find(
              (c) => c.convenio === convenioFiltro
            );
            if (
              convEsp &&
              verificarVigenciaConvenio(convEsp, ano, nomeMesCorrente)
            ) {
              conveniosParaEsteMes.push(convEsp);
            }
          }

          if (conveniosParaEsteMes.length > 0) {
            conveniosParaEsteMes.forEach((conv) => {
              const statusRowConv = dadosBrutos.status.find(
                (s) =>
                  String(s[1]).trim() === municipioFiltro &&
                  String(s[2]).trim() === conv.convenio &&
                  String(s[3]).trim() === ano &&
                  String(s[4]).trim() === nomeMesCorrente
              );
              lancamentosParaTabela.push({
                timestamp:
                  statusRowConv && statusRowConv[0]
                    ? String(statusRowConv[0]).trim()
                    : "",
                municipio: municipioFiltro,
                convenio: conv.convenio,
                ano,
                mes: nomeMesCorrente,
                valorTotal:
                  statusRowConv && statusRowConv[5]
                    ? formatarNumero(statusRowConv[5], "numero")
                    : "",
                edicaoBloqueada: statusRowConv
                  ? String(statusRowConv[7]).trim() === "SIM"
                  : false,
                sirconvStatus:
                  statusRowConv && statusRowConv[9]
                    ? String(statusRowConv[9]).trim()
                    : "",
                siadStatus:
                  statusRowConv && statusRowConv[10]
                    ? String(statusRowConv[10]).trim()
                    : "",
                siadInfo: statusRowConv ? {
                  colL: statusRowConv[11] ? String(statusRowConv[11]).trim() : "",
                  colM: statusRowConv[12] ? String(statusRowConv[12]).trim() : "",
                  colN: statusRowConv[13] ? String(statusRowConv[13]).trim() : "",
                  colO: statusRowConv[14] ? String(statusRowConv[14]).trim() : "",
                  colP: statusRowConv[15] ? String(statusRowConv[15]).trim() : "",
                  colQ: statusRowConv[16] ? String(statusRowConv[16]).trim() : "",
                  colR: statusRowConv[17] ? String(statusRowConv[17]).trim() : "",
                  colS: statusRowConv[18] ? String(statusRowConv[18]).trim() : "",
                } : null,
                semConvenio: false,
              });
              linhasAdicionadasParaEsteMes++;
            });
          }

          if (linhasAdicionadasParaEsteMes === 0) {
            let convDisplayParaPlaceholder = "-";
            if (convenioFiltro !== "TODOS") {
              const convEspecificoSelecionado = conveniosDoMunicipio.find(
                (c) => c.convenio === convenioFiltro
              );
              if (
                convEspecificoSelecionado &&
                !verificarVigenciaConvenio(
                  convEspecificoSelecionado,
                  ano,
                  nomeMesCorrente
                )
              ) {
                convDisplayParaPlaceholder = "-";
              } else if (convEspecificoSelecionado) {
                convDisplayParaPlaceholder = convenioFiltro;
              }
            }

            lancamentosParaTabela.push({
              municipio: municipioFiltro,
              convenio: convDisplayParaPlaceholder,
              ano,
              mes: nomeMesCorrente,
              valorTotal: 0,
              edicaoBloqueada: false,
              sirconvStatus: "",
              siadStatus: "",
              timestamp: "",
              semConvenio: true,
            });
          }
        });
      }

      lancamentosParaTabela.sort((a, b) => {
        const municipioCompare = a.municipio.localeCompare(b.municipio);
        if (municipioCompare !== 0) return municipioCompare;

        const mesesOrdem = [
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
        const indexA = mesesOrdem.indexOf(a.mes);
        const indexB = mesesOrdem.indexOf(b.mes);
        if (indexA !== indexB) return indexA - indexB;

        const convA = String(a.convenio).trim();
        const convB = String(b.convenio).trim();
        const numA = parseInt(convA);
        const numB = parseInt(convB);
        const isNumA = !isNaN(numA) && String(numA) === convA;
        const isNumB = !isNaN(numB) && String(numB) === convB;

        if (isNumA && isNumB) return numA - numB;
        if (isNumA) return -1;
        if (isNumB) return 1;
        if (convA === "-") return -1;
        if (convB === "-") return 1;
        return convA.localeCompare(convB);
      });

      preencherTabelaLancamentosAdmin(lancamentosParaTabela);
      ADMIN_CONFIG.lancamentosCarregados = true;
    } catch (error) {
      manipularErro(error, "carregarLancamentos");
      $("#tabela-lancamentos tbody")
        .empty()
        .append(
          '<tr><td colspan="10" class="text-center">Erro ao carregar lançamentos. Tente novamente.</td></tr>'
        );
    } finally {
      ocultarCarregamento();
    }
  }
