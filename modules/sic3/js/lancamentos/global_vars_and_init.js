async function inicializarComponentesGlobais() {
    if (window.componentesGlobaisInicializados) return;

    try {
      await executarComCarregamento(async () => {
        await inicializarEventosSistema();
        await inicializarValidacoesGlobais();
        await inicializarFormulariosBase();
        window.componentesGlobaisInicializados = true;
      });
    } catch (error) {
      console.error("Erro na inicialização de componentes globais:", error);
      resetarCarregamento();
      mostrarDialogo("Erro de Inicialização", "Ocorreu um erro ao carregar componentes globais do aplicativo. Por favor, recarregue a página.");
    }
  }

    async function inicializarEventosSistema() {
    $(document).off("click.sistemaGlobal");
    $(document).off("keydown.sistemaGlobal");
    $(document).off("input.sistemaGlobal");

    if (window.eventosSistemaInicializados) {
      return;
    }

    if(typeof $ != 'undefined' && typeof $.ui != 'undefined') $("#dialog-message").dialog({ autoOpen: false });
    $(document).on("click.sistemaGlobal", (e) => tratarCliqueGlobal(e));
    $(document).on("keydown.sistemaGlobal", (e) => { if (e.key === "Escape" && typeof fecharModal === 'function') fecharModal(); });

    $(document).on("input.sistemaGlobal", "input:not([type=file]), textarea", function() {
      const texto = $(this).val();
      if (typeof texto === 'string') {
        const textoFormatado = texto.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (texto != textoFormatado) {
          $(this).val(textoFormatado);
        }
      }
    });

    window.onerror = function(message, source, lineno, colno, error) {
      console.error("Erro global:", error);
      mostrarDialogo("Erro", "Ocorreu um erro inesperado. Por favor, tente novamente.");
      return false;
    };
    window.eventosSistemaInicializados = true;
  }

  async function inicializarFormulariosBase() {
    if (window.formulariosBaseInicializados) return;
    try {
      window.formularioAbastecimento = { tipo: "abastecimento" };
      window.formularioManutencao = { tipo: "manutencao" };
      window.formularioMaterial = null;
      window.formularioOutrosItens = {};
      window.formulariosBaseInicializados = true;
      return true;
    } catch (error) {
      throw new Error("Falha na inicialização dos formulários base: " + error.message);
    }
  }

  function inicializarValidacoesGlobais() {
    if (window.validacoesGlobaisInicializadas) return;

    window.regrasValidacao = {
      "valorTotal, valorUnitario, quantidade, consumo, odometro, responsavel, motorista, placa, prefixo, descricao, tipo, codigoItem, despesa, unidade, fornecedor, endereco, notaFiscal": {
        required: true
      },
      observacao: {
        required: false
      },
      data: {
        required: true
      },
      mesRef: {
        required: true
      },
      "medidor-O33903912, medidor-O33903913": {
        required: true
      }
    };
    window.validacoesGlobaisInicializadas = true;
  }
