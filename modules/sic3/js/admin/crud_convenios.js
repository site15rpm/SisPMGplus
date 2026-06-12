// Grupo 5: CRUD de Convênios (Criação, Leitura, Atualização, Exclusão)

  function abrirModalConvenio(acao, dadosIniciais = null) {
    const modal = $("#modal-base");
    if (!modal.length) {
      console.error("Modal #modal-base não encontrado!");
      return;
    }
    modal
      .find(".modal-header h2")
      .text(acao === "alterar" ? "Alterar Convênio" : "Incluir Novo Convênio");
    let formHtml = `
      <form id="form-convenio" novalidate> <div class="form-grid">
        <div class="form-group"><label for="municipio-conv">Município<span class="info">*</span></label><input type="text" id="municipio-conv" class="form-control" required disabled><div class="invalid-feedback"></div></div>
        <div class="form-group"><label for="convenio-conv">Número do Convênio<span class="info">*</span></label><input type="text" id="convenio-conv" class="form-control" required ${
          acao === "alterar" ? "disabled" : ""
        }><div class="invalid-feedback"></div></div>
        <div class="form-group"><label for="preposto-n">Número do Preposto<span class="info">*</span></label><input type="text" id="preposto-n" class="form-control" required><div class="invalid-feedback"></div></div>
        <div class="form-group"><label for="preposto-pg">Posto/Graduação<span class="info">*</span></label><select id="preposto-pg" class="form-control" required><option value="">Selecione...</option><option value="CEL">CEL</option><option value="TEN CEL">TEN CEL</option><option value="MAJ">MAJ</option><option value="CAP">CAP</option><option value="1 TEN">1 TEN</option><option value="2 TEN">2 TEN</option><option value="SUBTEN">SUBTEN</option><option value="1 SGT">1 SGT</option><option value="2 SGT">2 SGT</option><option value="3 SGT">3 SGT</option><option value="CB">CB</option><option value="SD">SD</option></select><div class="invalid-feedback"></div></div>
        <div class="form-group form-full"><label for="preposto-nome">Nome do Preposto<span class="info">*</span></label><input type="text" id="preposto-nome" class="form-control" required><div class="invalid-feedback"></div></div>
        <div class="form-group form-full"><label for="unidade-conv">Unidade<span class="info">*</span></label><input type="text" id="unidade-conv" class="form-control" required ${
          acao === "incluir" ? "disabled" : ""
        }><div class="invalid-feedback"></div></div>
        <div class="form-group"><label for="dataInicio-conv">Data Início<span class="info">*</span></label><input type="date" id="dataInicio-conv" class="form-control" required><div class="invalid-feedback"></div></div>
        <div class="form-group"><label for="dataFim-conv">Data Fim</label><input type="date" id="dataFim-conv" class="form-control"><div class="invalid-feedback"></div></div>
      </div></form>`;
    modal.find(".modal-body").html(formHtml);

    if (dadosIniciais) {
      $("#municipio-conv").val(dadosIniciais.municipio);
      if (acao === "alterar") {
        $("#convenio-conv").val(dadosIniciais.convenio || "");
        $("#preposto-n").val(dadosIniciais.preposto_n || "");
        $("#preposto-pg").val(dadosIniciais.preposto_pg || "");
        $("#preposto-nome").val(dadosIniciais.preposto || "");
        $("#unidade-conv").val(dadosIniciais.unidade || "");
        const formatarDataParaInput = (dataStr) => {
          if (!dataStr) return "";
          if (typeof dataStr === "string") {
            if (dataStr.includes("/")) {
              const partes = dataStr.split("/");
              if (partes.length === 3)
                return `${partes[2]}-${partes[1]}-${partes[0]}`;
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
              return dataStr;
            }
          }
          try {
            const d = new Date(dataStr);
            if (!isNaN(d.getTime())) {
              return (
                d.getFullYear() +
                "-" +
                ("0" + (d.getMonth() + 1)).slice(-2) +
                "-" +
                ("0" + d.getDate()).slice(-2)
              );
            }
          } catch (e) {}
          return "";
        };
        $("#dataInicio-conv").val(
          formatarDataParaInput(dadosIniciais.dataInicio)
        );
        $("#dataFim-conv").val(formatarDataParaInput(dadosIniciais.dataFim));
      } else if (acao === "incluir") {
        $("#municipio-conv").val(dadosIniciais.municipio);
        $("#unidade-conv").val(dadosIniciais.unidade || "");
      }
    }
    configurarValidacoesFormulario(document.getElementById("form-convenio"));

    configurarBotoesModal(acao);
    modal.css("display", "flex");
  }

  function configurarBotoesModal(acao) {
    const modal = $("#modal-base");
    const submitBtn = modal.find('.modal-footer button[type="submit"]');
    const cancelBtn = modal.find('.modal-footer button[type="button"]');

    submitBtn.text(acao === "alterar" ? "Alterar" : "Incluir");
    submitBtn.off("click");
    cancelBtn.off("click");

    submitBtn.on("click", async function (e) {
      e.preventDefault();
      const formConvenio = document.getElementById("form-convenio");

      if (
        typeof validarFormulario === "function" &&
        !validarFormulario({}, formConvenio)
      )
        return;
      const dadosConvenio = {
        municipio: $("#municipio-conv").val(),
        convenio: $("#convenio-conv").val(),
        preposto_n: $("#preposto-n").val(),
        preposto_pg: $("#preposto-pg").val(),
        preposto: $("#preposto-nome").val(),
        unidade: $("#unidade-conv").val(),
        dataInicio: $("#dataInicio-conv").val(),
        dataFim: $("#dataFim-conv").val(),
      };
      salvarConvenio(acao, dadosConvenio);
    });

    cancelBtn.on("click", function (e) {
      e.preventDefault();
      fecharModal();
    });
  }

  async function salvarConvenio(acao, dadosConvenio) {
    try {
      mostrarCarregamento();
      const authToken = sessionStorage.getItem("authToken");
      let resultado = false;
      const selecaoAtual = {
        ano: $("#ano").val(),
        mes: $("#mes").val(),
        municipio: $("#municipio-conv").val(),
        convenio:
          acao === "incluir" ? dadosConvenio.convenio : $("#convenio").val(),
      };

      if (acao === "alterar") {
        resultado = await new Promise((res, rej) =>
          google.script.run
            .withSuccessHandler(res)
            .withFailureHandler(rej)
            .alterarConvenio(
              authToken,
              dadosConvenio.municipio,
              dadosConvenio.convenio,
              dadosConvenio.preposto_n,
              dadosConvenio.preposto_pg,
              dadosConvenio.preposto,
              dadosConvenio.unidade,
              dadosConvenio.dataInicio,
              dadosConvenio.dataFim
            )
        );
      } else {
        resultado = await new Promise((res, rej) =>
          google.script.run
            .withSuccessHandler(res)
            .withFailureHandler(rej)
            .incluirConvenio(
              authToken,
              dadosConvenio.municipio,
              dadosConvenio.convenio,
              dadosConvenio.preposto_n,
              dadosConvenio.preposto_pg,
              dadosConvenio.preposto,
              dadosConvenio.unidade,
              dadosConvenio.dataInicio,
              dadosConvenio.dataFim
            )
        );
      }

      ocultarCarregamento();

      if (resultado && resultado.success) {
        mostrarDialogo(
          "Sucesso",
          `Convênio ${
            acao === "alterar" ? "alterado" : "incluído"
          } com sucesso!`
        );
        fecharModal();
        mostrarCarregamento();
        await carregarInformacoesAdmin();
        $("#ano").val(selecaoAtual.ano);
        $("#mes")
          .val(selecaoAtual.mes)
          .data("previous-value-static", selecaoAtual.mes);
        const municipioParaRestaurar =
          $("#municipio").val() === "TODOS" && mLog === "admin"
            ? "TODOS"
            : dadosConvenio.municipio;
        $("#municipio")
          .val(municipioParaRestaurar)
          .data("previous-value-static", municipioParaRestaurar);

        await atualizarSelectConvenios(municipioParaRestaurar);
        if (
          $("#convenio option[value='" + dadosConvenio.convenio + "']").length >
          0
        ) {
          $("#convenio").val(dadosConvenio.convenio);
        } else {
          const defaultConvenio = $("#convenio option[value='TODOS']").length
            ? "TODOS"
            : $("#convenio option:first").val() || "-";
          $("#convenio").val(defaultConvenio);
        }

        atualizarInfoConvenioPreposto();
        if (ADMIN_CONFIG.estados.telaAtual === "lancamentos") {
          await carregarLancamentos();
        }
        ocultarCarregamento();
      } else {
        mostrarDialogo(
          "Erro",
          (resultado && resultado.message) || `Erro ao ${acao} convênio.`
        );
      }
    } catch (error) {
      ocultarCarregamento();
      manipularErro(error, `${acao}Convenio`);
    }
  }

  async function alterarConvenio() {
    const municipio = $("#municipio").val(),
      convenioSel = $("#convenio").val();
    if (!municipio || municipio === "TODOS") {
      mostrarDialogo("Aviso", "Selecione um município");
      return;
    }
    if (!convenioSel || convenioSel === "TODOS" || convenioSel === "-") {
      mostrarDialogo("Aviso", "Selecione um convênio válido.");
      return;
    }
    const convenio = ADMIN_CONFIG.dados.convenios.find(
      (c) => c.municipio === municipio && c.convenio === convenioSel
    );
    if (!convenio) {
      mostrarDialogo("Erro", "Convênio não encontrado.");
      return;
    }
    abrirModalConvenio("alterar", convenio);
  }

  async function incluirConvenio() {
    const municipioSelecionado = $("#municipio").val();
    if (!municipioSelecionado || municipioSelecionado === "TODOS") {
      mostrarDialogo(
        "Aviso",
        "Selecione um município específico para incluir um novo convênio."
      );
      return;
    }
    const primeiroConvenioDoMunicipio = ADMIN_CONFIG.dados.convenios.find(
      (c) => c.municipio === municipioSelecionado
    );
    abrirModalConvenio("incluir", {
      municipio: municipioSelecionado,
      unidade: primeiroConvenioDoMunicipio
        ? primeiroConvenioDoMunicipio.unidade
        : "",
    });
  }

  async function excluirConvenio() {
    const municipio = $("#municipio").val(),
      convenioSel = $("#convenio").val();
    if (!municipio || municipio === "TODOS") {
      mostrarDialogo("Aviso", "Selecione um município");
      return;
    }
    if (!convenioSel || convenioSel === "TODOS" || convenioSel === "-") {
      mostrarDialogo("Aviso", "Selecione um convênio válido.");
      return;
    }
    const convenio = ADMIN_CONFIG.dados.convenios.find(
      (c) => c.municipio === municipio && c.convenio === convenioSel
    );
    if (!convenio) {
      mostrarDialogo("Erro", "Convênio não encontrado.");
      return;
    }
    const confirm = await confirmarAcao(
      "Confirmar Exclusão",
      `Deseja realente EXCLUIR o convênio ${convenio.convenio} de ${convenio.municipio}?`
    );
    if (!confirm) return;

    const selecaoAtual = {
      ano: $("#ano").val(),
      mes: $("#mes").val(),
      municipio: $("#municipio").val(),
      convenio: $("#convenio").val(),
    };

    const authToken = sessionStorage.getItem("authToken");
    mostrarCarregamento();
    try {
      const res = await new Promise((resolve, reject) =>
        google.script.run
          .withSuccessHandler(resolve)
          .withFailureHandler(reject)
          .excluirConvenio(authToken, convenio.municipio, convenio.convenio)
      );
      ocultarCarregamento();
      if (res && res.success) {
        mostrarDialogo("Sucesso", "Convênio excluído!");

        mostrarCarregamento();
        await carregarInformacoesAdmin();

        $("#ano").val(selecaoAtual.ano);
        $("#mes")
          .val(selecaoAtual.mes)
          .data("previous-value-static", selecaoAtual.mes);
        $("#municipio")
          .val(selecaoAtual.municipio)
          .data("previous-value-static", selecaoAtual.municipio);

        await atualizarSelectConvenios(selecaoAtual.municipio);
        if (
          $("#convenio option[value='" + selecaoAtual.convenio + "']").length >
            0 &&
          selecaoAtual.convenio !== convenio.convenio
        ) {
          $("#convenio").val(selecaoAtual.convenio);
        } else {
          const defaultConvenio = $("#convenio option:first").val();
          $("#convenio").val(defaultConvenio);
        }

        atualizarInfoConvenioPreposto();
        if (ADMIN_CONFIG.estados.telaAtual === "lancamentos")
          await carregarLancamentos();
        ocultarCarregamento();
      } else {
        mostrarDialogo(
          "Erro",
          (res && res.message) || "Erro ao excluir convênio."
        );
      }
    } catch (error) {
      ocultarCarregamento();
      manipularErro(error, "excluirConvenio");
    }
  }
