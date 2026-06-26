// Grupo 4: Lógica de Negócio e Utilitários

  async function handleFilterChange() {
    try {
      const municipio = $("#municipio").val();
      const mes = $("#mes").val();

      if (municipio === "TODOS" && mes === "TODOS") {
        mostrarDialogo(
          "Aviso",
          "Para a opção 'TODOS OS MUNICÍPIOS', por favor, selecione um MÊS específico. Ou, para 'TODOS OS MESES', selecione um MUNICÍPIO específico."
        );
        return;
      }

      await atualizarSelectConvenios(municipio);
      atualizarInfoConvenioPreposto();
      atualizarCabecalhoTabela();
      window.salvarSelecaoUsuario();
      if (ADMIN_CONFIG.estados.telaAtual === "lancamentos") {
        await carregarLancamentos();
      }
    } catch (error) {
      manipularErro(error, "handleFilterChange");
    }
  }

  function verificarVigenciaConvenio(convenio, ano, mes) {
    if (!convenio || (!convenio.dataInicio && !convenio.dataFim)) return true;
    if (mes === "TODOS") {
      return true;
    }

    const mesNum = converteMesParaNumero(mes);
    if (mesNum === null || mesNum === 0) return false;

    const anoNum = parseInt(ano, 10);
    if (isNaN(anoNum)) return false;

    const primeiroDiaMes = new Date(anoNum, mesNum - 1, 1);
    const ultimoDiaMes = new Date(anoNum, mesNum, 0);

    const converterData = (ds) => {
      if (!ds) return null;
      if (ds instanceof Date) return ds;
      if (typeof ds === "string" && ds.includes("/")) {
        const p = ds.split("/");
        if (p.length === 3)
          return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
      }
      if (typeof ds === "string" && ds.includes("-")) {
        const p = ds.split("-");
        if (p.length === 3)
          return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
      }
      try {
        const d = new Date(ds);
        return isNaN(d.getTime()) ? null : d;
      } catch (e) {
        return null;
      }
    };

    const dataInicio = converterData(convenio.dataInicio);
    const dataFim = converterData(convenio.dataFim);

    let vigente = true;
    if (dataInicio && !isNaN(dataInicio.getTime())) {
      dataInicio.setHours(0, 0, 0, 0);
      if (ultimoDiaMes < dataInicio) vigente = false;
    }
    if (vigente && dataFim && !isNaN(dataFim.getTime())) {
      dataFim.setHours(23, 59, 59, 999);
      if (primeiroDiaMes > dataFim) vigente = false;
    }

    return vigente;
  }

  function filtrarLancamentosPorUnidade() {
    try {
      const unidadeSel = $("#filtro-unidade").val();
      if (!unidadeSel) {
        return;
      }
      if (unidadeSel === "MUNICÍPIO") {
        $("#tabela-lancamentos tbody tr").show();
        return;
      }
      if (
        !ADMIN_CONFIG.dados.convenios ||
        ADMIN_CONFIG.dados.convenios.length === 0
      ) {
        return;
      }
      $("#tabela-lancamentos tbody tr").each(function () {
        const munNome = $(this).find("td:first-child").text();
        const convNumero = $(this).find("td:nth-child(2)").text();
        const convInfo = ADMIN_CONFIG.dados.convenios.find(
          (c) => c.municipio === munNome && c.convenio === convNumero
        );
        $(this).toggle(
          !!(
            convInfo &&
            convInfo.unidade_principal &&
            convInfo.unidade_principal.includes(unidadeSel)
          )
        );
      });
    } catch (error) {
      manipularErro(error, "filtrarLancamentosPorUnidade");
      $("#tabela-lancamentos tbody tr").show();
    }
  }

  function handleSirconvSiadUpdate(
    authToken,
    municipio,
    convenio,
    ano,
    mes,
    tipo,
    novoStatus,
    mensagemConfirmacao,
    mensagemSucesso
  ) {
    return new Promise(async (resolve) => {
      const confirmado = await confirmarAcao(
        "Confirmar Ação",
        mensagemConfirmacao
      );
      if (confirmado) {
        mostrarCarregamento();
        google.script.run
          .withSuccessHandler((s) => {
            ocultarCarregamento();
            if (s && s.success) {
              mostrarDialogo("Sucesso", mensagemSucesso);
              carregarLancamentos();
              resolve(true);
            } else {
              mostrarDialogo(
                "Erro",
                (s && s.message) || `Erro ao atualizar ${tipo}`
              );
              resolve(false);
            }
          })
          .withFailureHandler((err) => {
            ocultarCarregamento();
            manipularErro(err, `atualizarStatusSirconvSiad_${tipo}`);
            resolve(false);
          })
          .atualizarStatusSirconvSiad(
            authToken,
            municipio,
            convenio,
            ano,
            mes,
            tipo,
            novoStatus
          );
      } else {
        resolve(false);
      }
    });
  }

  async function alterarStatusEdicao(
    authToken,
    municipio,
    convenio,
    ano,
    mes,
    acao
  ) {
    try {
      const confirmResult = await confirmarAcao(
        "Confirmar",
        `Deseja ${acao.toUpperCase()} a edição de ${mes} para o convênio ${convenio}?`
      );
      if (!confirmResult) return false;
      mostrarCarregamento();
      const novoStatus = acao === "bloquear" ? "SIM" : "NAO";
      google.script.run
        .withSuccessHandler((response) => {
          ocultarCarregamento();
          if (response && response.success) {
            carregarLancamentos();
            mostrarDialogo(
              "Sucesso",
              `Relatório ${acao === "bloquear" ? "bloqueado" : "desbloqueado"}!`
            );
          } else {
            const errorMsg =
              response && response.message
                ? response.message
                : `Erro ao ${acao} relatório.`;
            mostrarDialogo("Erro", errorMsg);
          }
        })
        .withFailureHandler((error) => {
          ocultarCarregamento();
          manipularErro(error, "alterarStatusEdicao");
        })
        .atualizarStatusEdicao(
          authToken,
          municipio,
          convenio,
          ano,
          mes,
          novoStatus
        );
      return true;
    } catch (error) {
      ocultarCarregamento();
      manipularErro(error, "alterarStatusEdicao");
      return false;
    }
  }
