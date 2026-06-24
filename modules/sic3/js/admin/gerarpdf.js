/**
   * ESTILOS PADRONIZADOS PARA GERAÇÃO DE PDF
   * Centraliza todas as definições de cores, fontes e estilos para os anexos.
   */
  var PDF_STYLES = {
    headerFillColor: '#d9d9d9',
    textColor: [0, 0, 0], // Cor do texto preta
    headerTextColor: [0, 0, 0],
    borderColor: '#646464',
    font: 'helvetica',
    baseFontSize: 8,
    // Estilos base para todas as tabelas
    baseTableConfig: {
      theme: "grid",
      styles: {
        font: 'helvetica',
        fontSize: 8,
        textColor: [0, 0, 0],
        lineColor: '#646464',
        lineWidth: 0.1,
        cellPadding: 1,
        minCellHeight: 3.5,
      },
      headStyles: {
        fillColor: '#d9d9d9',
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
      },
      footStyles: { 
        fillColor: '#d9d9d9',
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center',
        lineWidth: 0.1,
        lineColor: '#646464',
        cellPadding: 1, // Altura mínima para a linha de total
        minCellHeight: 3.5,
      }
    }
  };

  // ======================== GERAÇÃO DE ANEXOS 'D' E 'ÚNICO' ========================
  $(document).off('click.prestacaoAnual').on('click.prestacaoAnual', '#btnPrestacaoContasAnual', async function() {
    const municipio = $("#municipio").val();
    const convenio = $("#convenio").val();
    const ano = $("#ano").val();

    if (!municipio || municipio === "TODOS" || !convenio || convenio === "-" || convenio === "TODOS" || !ano || ano === "TODOS") {
      mostrarDialogo("Aviso", "Por favor, selecione um Município, um Convênio e um Ano específico no painel administrativo para gerar a prestação de contas anual.");
      return;
    }

    await gerarPrestacaoContasAnual(municipio, convenio, ano);
  });

  $(document).off('click.anexoPDF').on('click.anexoPDF', '.btn-anexo-d, .btn-anexo-u', async function() {
    const $button = $(this);
    const municipio = $button.data('municipio');
    const convenio = $button.data('convenio');
    const ano = $button.data('ano');
    const mes = $button.data('mes');

    if (convenio === "-" || convenio === "TODOS") {
      mostrarDialogo("Aviso", "Não é possível gerar anexo para município sem convênio ou com convênio 'TODOS'.");
      return;
    }

    try {
      mostrarCarregamento();
      
      const convenioInfo = await obterInformacoesConvenio(municipio, convenio);
      if (!convenioInfo) throw new Error('Não foi possível obter informações do convênio.');

      const dadosAnexo = await obterDadosAnexo(municipio, convenio, ano, mes);
      if (!dadosAnexo || (!dadosAnexo.principal?.length && !dadosAnexo.abastecimento?.length && !dadosAnexo.manutencao?.length)) {
        mostrarDialogo('Aviso', 'Não há dados para gerar o anexo.');
        ocultarCarregamento();
        return;
      }

      const isAnexoD = $button.hasClass('btn-anexo-d');
      if (isAnexoD) {
        await gerarAnexoDAdmin(municipio, convenio, ano, mes, convenioInfo, dadosAnexo);
      } else {
        await gerarAnexoUnicoAdmin(municipio, convenio, ano, mes, convenioInfo, dadosAnexo);
      }
    } catch (error) {
      manipularErro(error, 'gerarAnexoPDF');
    } finally {
      ocultarCarregamento();
    }
  });

  // ======================== FUNÇÕES AUXILIARES DE FORMATAÇÃO ========================
  function getNomeMesComum(mesNumero) {
    const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    return meses[parseInt(mesNumero, 10) - 1];
  }

  function formatarDataPDF(data) {
    const dia = String(data.getDate()).padStart(2, "0");
    const mes = String(data.getMonth() + 1).padStart(2, "0");
    const ano = data.getFullYear();
    return `${dia} de ${obterNomeMes(mes)} de ${ano}`;
  }

  function formatarMunicipioPDF(municipio) {
    return municipio.split(" ").map((word) => {
        if (["DE", "DA", "DO"].includes(word.toUpperCase())) { return word.toLowerCase(); }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }).join(" ");
  }

  // ======================== OBTENÇÃO DE DADOS ========================
  async function obterInformacoesConvenio(municipio, convenio) {
    try {
      const convenioLocal = ADMIN_CONFIG.dados.convenios.find(c => c.municipio === municipio && c.convenio === convenio);
      if (convenioLocal) return { ...convenioLocal };
      
      const conveniosData = await carregarDadosPlanilha({ sheetId: idbase, sheet: 'convenios', query: `SELECT A,B,C,D,E,F,G,H,M,N,Y WHERE A='${municipio}' AND B='${convenio}'` });
      if (conveniosData && conveniosData.length > 0) {
        const [m, c, pn, ppg, p, u, di, df, st, ve, ed] = conveniosData[0];
        return { municipio: m, convenio: c, preposto_n: pn || "", preposto_pg: ppg || "", preposto: p || "", unidade: u || "", dataInicio: di || "", dataFim: df || "", status_texto: st || "", valor_estimado: ve || "", elementos_despesa: ed || "" };
      }
      return null;
    } catch (error) {
      manipularErro(error, 'obterInformacoesConvenio');
      return null;
    }
  }

  async function obterDadosAnexo(municipio, convenio, ano, mes) {
    try {
      const [principalData, abastecimentoData, manutencaoData, obsgeralRaw] = await Promise.all([
        carregarDadosPlanilha({ sheetId: idbase, sheet: 'principal', query: `SELECT G,H,I,J,K,L,M,N,O WHERE B='${municipio}' AND C='${convenio}' AND D='${ano}' AND E='${mes}'` }),
        carregarDadosPlanilha({ sheetId: idbase, sheet: 'abastecimento', query: `SELECT G,H,I,J,K,L,M,N,O,P,Q WHERE B='${municipio}' AND C='${convenio}' AND D='${ano}' AND E='${mes}'` }),
        carregarDadosPlanilha({ sheetId: idbase, sheet: 'manutencao', query: `SELECT G,H,I,J,K,L,M,N,O,P WHERE B='${municipio}' AND C='${convenio}' AND D='${ano}' AND E='${mes}'` }),
        carregarDadosPlanilha({ sheetId: idbase, sheet: 'obsgeral', query: `SELECT A,G WHERE B='${municipio}' AND C='${convenio}' AND D='${ano}' AND E='${mes}'` })
      ]);
      const principal = principalData.map(row => ({ codigo: row[0] || "", descricao: row[1] || "", despesa: row[2] || "", unidade: row[3] || "", data: row[4] || "", quantidade: row[5] || "", valorUnitario: row[6] || "", subtotal: row[7] || 0, observacao: row[8] || "" }));
      const abastecimento = abastecimentoData.map(row => ({ data: row[0] || "", hora: row[1] || "", placa: row[2] || "", prefixo: row[3] || "", odometro: row[4] || "", motorista: row[5] || "", tipo: row[6] || "", quantidade: row[7] || "", valorUnitario: row[8] || "", subtotal: row[9] || "", notaFiscal: row[10] || "" }));
      const manutencao = manutencaoData.map(row => {
        const descricaoCompleta = row[5] || ""; let tipo = "", descricao = "";
        if (descricaoCompleta.includes(" - ")) { const parts = descricaoCompleta.split(" - "); tipo = parts[0].trim(); descricao = parts.slice(1).join(" - ").trim(); }
        else { tipo = "MANUTENÇÃO"; descricao = descricaoCompleta; }
        return { data: row[0] || "", placa: row[1] || "", prefixo: row[2] || "", odometro: row[3] || "", responsavel: row[4] || "", tipo: tipo, descricao: descricao, quantidade: row[6] || "", valorUnitario: row[7] || "", subtotal: row[8] || "", notaFiscal: row[9] || "" };
      });
      const obsgeralTimestamp = obsgeralRaw.length > 0 && obsgeralRaw[0][0] ? obsgeralRaw[0][0] : "";
      const obsgeralTexto = obsgeralRaw.length > 0 && obsgeralRaw[0][1] ? obsgeralRaw[0][1] : "SEM OBSERVACOES";
      return { principal, abastecimento, manutencao, obsgeral: { texto: obsgeralTexto, timestamp: obsgeralTimestamp } };
    } catch (error) {
      manipularErro(error, 'obterDadosAnexo');
      return null;
    }
  }

  // ======================== GERADOR ANEXO D ========================
  async function gerarAnexoDAdmin(municipio, convenio, ano, mes, convenioInfo, dadosAnexo) {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: "l", unit: "mm", format: "a4", compress: true });
      const startY = 20, pageWidth = doc.internal.pageSize.getWidth(), pageCenter = pageWidth / 2;

      doc.setFontSize(12);
      doc.text('ANEXO "D" (Demonstrativo de material recebido em convênio) à Instrução Conjunta Nº 06/DAL-DF', pageCenter, startY, { align: "center" });
      doc.setFont(PDF_STYLES.font, "bold");
      doc.text("POLÍCIA MILITAR DO ESTADO DE MINAS GERAIS", pageCenter, 30, { align: "center" });
      doc.text(`${convenioInfo.unidade}`, pageCenter, 35, { align: "center" });
      doc.setFont(PDF_STYLES.font, "normal");
      doc.text(`Demonstrativo do material recebido da Prefeitura Municipal de ${formatarMunicipioPDF(municipio)}`, pageCenter, 45, { align: "center" });
      doc.text(`no mês ${mes} de ${ano}, conforme convênio nº ${convenio}`, pageCenter, 50, { align: "center" });
      
      const tableData = dadosAnexo.principal.map((item, index) => {
        let obs = item.observacao || '';
        if (item.despesa && (item.despesa.startsWith("3914") || item.despesa.startsWith("4004"))) {
            const telMatch = obs.match(/Tel\.:\s*\S+/);
            if (telMatch) {
                const telLine = telMatch[0];
                const otherLines = obs.replace(telLine, '').split('\n').filter(line => line.trim() !== '').join('\n');
                obs = `${telLine}\n${otherLines}`.trim();
            }
        }
        return [(index + 1).toString(), item.data, item.quantidade, item.quantidade, `CD: ${item.codigo} | ED: ${item.despesa.substring(0, 4)} | UD: ${item.unidade.substring(0, 5)}\n${item.descricao}`, item.subtotal, obs];
      });
      
      autoTable(doc, { 
        ...PDF_STYLES.baseTableConfig,
        startY: 60, 
        head: [["Nº DE\nORDEM", "DATA\nRECEB", "QTD RECEB MÊS", "QTD GASTA MÊS", "DESCRIÇÃO DO MATERIAL OU SERVIÇO RECEBIDO", "VALOR\nEM R$", "OBSERVAÇÃO"]], 
        body: tableData, 
        columnStyles: { 0: { cellWidth: 15 }, 1: { cellWidth: 20 }, 2: { cellWidth: 15, halign: "right" }, 3: { cellWidth: 15, halign: "right" }, 4: { cellWidth: "auto", halign: "left" }, 5: { minCellWidth: 20, halign: "right" }, 6: { minCellWidth: 50, halign: "left" } }, 
      });
      
      // Função auxiliar para identificar óleo lubrificante
      const isOleoLubrificante = (item) => {
        const desc = String(item.descricao || "").toUpperCase();
        return desc.includes("OLEO LUBRIFICANTE") || desc.includes("ÓLEO LUBRIFICANTE");
      };

      // Lógica de cálculo ajustada para evitar somatório duplicado
      const totalAbastecimentos = dadosAnexo.principal
        .filter(item => {
          const despesa = String(item.despesa).trim();
          // Pertence ao total de abastecimentos se for 3026 E NÃO for óleo lubrificante
          return despesa.startsWith("3026") && !isOleoLubrificante(item);
        })
        .reduce((acc, item) => acc + (parseFloat(String(item.subtotal).replace(/[^\d,-]/g, "").replace(",", ".")) || 0), 0);
      
      const totalConsumo = dadosAnexo.principal
        .filter(item => {
          const despesa = String(item.despesa).trim();
          // Pertence ao total de materiais se for do grupo 30 (exceto 3026) OU se for explicitamente Óleo Lubrificante
          const isConsumoGeral = despesa.startsWith("30") && !item.descricao.includes("ABASTECIMENTO");
          return isConsumoGeral || isOleoLubrificante(item);
        })
        .reduce((acc, item) => acc + (parseFloat(String(item.subtotal).replace(/[^\d,-]/g, "").replace(",", ".")) || 0), 0);
      
      const totalServicos = dadosAnexo.principal
        .filter(item => {
          const despesa = String(item.despesa).trim();
          // Pertence ao total de serviços se NÃO for do grupo 30 E NÃO for óleo lubrificante
          return !despesa.startsWith("30") && !isOleoLubrificante(item);
        })
        .reduce((acc, item) => acc + (parseFloat(String(item.subtotal).replace(/[^\d,-]/g, "").replace(",", ".")) || 0), 0);
      
      // Cálculo do Total Geral independente dos filtros dos subtotais, somando item por item
      const totalGeral = dadosAnexo.principal.reduce((acc, item) => {
        return acc + (parseFloat(String(item.subtotal).replace(/[^\d,-]/g, "").replace(",", ".")) || 0);
      }, 0);
      
      const totalConsumoFormatado = formatarNumero(totalConsumo, "moeda");
      const totalAbastecimentosFormatado = formatarNumero(totalAbastecimentos, "moeda");
      const totalServicosFormatado = formatarNumero(totalServicos, "moeda");
      const totalGeralFormatado = formatarNumero(totalGeral, "moeda");
      
      const summaryStyles = { ...PDF_STYLES.baseTableConfig.footStyles, halign: 'right' };
      const obsStyles = { ...summaryStyles, halign: 'justify', valign: 'top', fontStyle: 'normal' };

      const summaryBody = [
        [{ content: `OBS.: ${dadosAnexo.obsgeral.texto || 'SEM OBSERVAÇÕES'}`, rowSpan: 4, styles: obsStyles },
         { content: "TOTAL DE MATERIAIS", styles: summaryStyles },
         { content: totalConsumoFormatado, styles: summaryStyles }],
        [{ content: "TOTAL DE ABASTECIMENTOS", styles: summaryStyles }, { content: totalAbastecimentosFormatado, styles: summaryStyles }],
        [{ content: "TOTAL DE SERVIÇOS", styles: summaryStyles }, { content: totalServicosFormatado, styles: summaryStyles }],
        [{ content: "TOTAL GERAL", styles: summaryStyles }, { content: totalGeralFormatado, styles: summaryStyles }]
      ];

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY, body: summaryBody, theme: 'grid', tableWidth: doc.lastAutoTable.width, showHead: "never",
        columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 50 }, 2: { cellWidth: 30 } },
        styles: { lineWidth: 0.1, lineColor: PDF_STYLES.borderColor }
      });

      const dataFormatada = formatarDataPDF(new Date());
      const assinaturaBody = [
          [{ content: `Quartel em ${formatarMunicipioPDF(municipio)}, ${dataFormatada}.` }],
          [{ content: `nº ${convenioInfo.preposto_n} - ${convenioInfo.preposto_pg} PM ${convenioInfo.preposto}` }],
          [{ content: `PREPOSTO DO CONVÊNIO` }]
      ];
      
      autoTable(doc, {
          startY: doc.lastAutoTable.finalY, body: assinaturaBody, theme: 'plain', tableWidth: doc.lastAutoTable.width, showHead: 'never',
          styles: { halign: 'center', fontSize: 10, textColor: PDF_STYLES.textColor },
          didParseCell: (data) => {
              if(data.row.index === 0) { data.cell.styles.halign = 'right'; data.cell.styles.cellPadding = { top: 5, right: 0, bottom: 10, left: 0 }; } 
              else { data.cell.styles.fontStyle = 'bold'; data.cell.styles.cellPadding = 0; }
          }
      });

      const pageCount = doc.internal.getNumberOfPages();
      await adicionarRodapePDF(doc, pageCount, dadosAnexo.obsgeral);
      doc.save(`ANEXO_D_${ano}-${mNumerico(mes, "texto")}_${municipio}.pdf`);
      mostrarDialogo("Sucesso", "Anexo D gerado!");
    } catch (error) {
      manipularErro(error, "gerarAnexoDAdmin");
    }
  }

  // ======================== GERADOR ANEXO ÚNICO ========================
  async function gerarAnexoUnicoAdmin(municipio, convenio, ano, mes, convenioInfo, dadosAnexo) {
    try {
      const { jsPDF } = window.jspdf;
      const margemPadrao = 15;
      const doc = new jsPDF({ orientation: "l", unit: "mm", format: "a4", compress: true });
      const tableConfig = { 
          ...PDF_STYLES.baseTableConfig,
          margin: { left: margemPadrao, right: margemPadrao } 
      };

      const pageWidth = doc.internal.pageSize.width, pageCenter = pageWidth / 2;
      doc.setFontSize(12);
      doc.text("ANEXO ÚNICO à Nota de Auditoria nº 998380 – Plano de Trabalho E-AUD nº 998368", pageCenter, 20, { align: "center" });
      doc.setFont(PDF_STYLES.font, "bold");
      doc.text("POLÍCIA MILITAR DO ESTADO DE MINAS GERAIS", pageCenter, 30, { align: "center" });
      doc.text(`${convenioInfo.unidade}`, pageCenter, 35, { align: "center" });
      doc.setFont(PDF_STYLES.font, "normal");
      doc.text(`Demonstrativo do material recebido da Prefeitura Municipal de ${formatarMunicipioPDF(municipio)}`, pageCenter, 45, { align: "center" });
      doc.text(`no mês ${mes} de ${ano}, conforme convênio nº ${convenio}`, pageCenter, 50, { align: "center" });
      let yPos = 60;
      let algumaTabelaRenderizada = false;

      if (dadosAnexo.abastecimento.length > 0) {
        const abastecimentoData = dadosAnexo.abastecimento.map(item => [item.data, item.hora, item.placa, item.prefixo, item.odometro, item.motorista, item.tipo, item.quantidade, item.valorUnitario, item.subtotal, item.notaFiscal]).sort((a, b) => new Date(a[0]) - new Date(b[0]));
        const totalAbastecimento = abastecimentoData.reduce((sum, row) => sum + formatarNumero(row[9], "numero"), 0);
        const totalAbastecimentoFormatado = formatarNumero(totalAbastecimento,"moeda");
        
        autoTable(doc, { 
            ...tableConfig, 
            startY: yPos, 
            head: [[{ content: "PLANILHA DEMONSTRATIVA DE COMBUSTÍVEIS E LUBRIFICANTES", colSpan: 11, styles: { halign: "center" } }], ["DATA", "HORA", "PLACA", "PRE-\nFIXO", "ODÔ-\nMETRO", "MOTO-\nRISTA", "DESCRIÇÃO", "QTD\n(LTS)", "VALOR\n(LT)", "VALOR\nTOTAL", "Nº DA\nNOTA"]], 
            body: abastecimentoData,
            foot: [[{ content: "TOTAL", colSpan: 6, styles: { halign: 'center' } }, { content: totalAbastecimentoFormatado, colSpan: 5, styles: { halign: 'center' } }]],
            showFoot: 'lastPage',
            columnStyles: { 0:{cellWidth:17},1:{cellWidth:12},2:{cellWidth:17},3:{cellWidth:12},4:{cellWidth:14,halign:"right"},5:{cellWidth:15},6:{cellWidth:"auto",halign:"left"},7:{minCellWidth:12,halign:"right"},8:{minCellWidth:18,halign:"right"},9:{minCellWidth:18,halign:"right"},10:{minCellWidth:18,halign:"right"} } 
        });
        yPos = doc.lastAutoTable.finalY + 10;
        algumaTabelaRenderizada = true;
      }
      
      if (dadosAnexo.manutencao.length > 0) {
        const manutencaoData = dadosAnexo.manutencao.map(item=>[item.data,item.placa,item.prefixo,item.odometro,item.responsavel,item.tipo+" - "+item.descricao,item.quantidade,item.valorUnitario,item.subtotal,item.notaFiscal]).sort((a,b)=>new Date(a[0])-new Date(b[0]));
        const totalManutencao = manutencaoData.reduce((sum, row) => sum + formatarNumero(row[8], "numero"), 0);
        const totalManutencaoFormatado = formatarNumero(totalManutencao,"moeda");
        
        autoTable(doc, {
            ...tableConfig,
            startY:yPos,
            head:[[{content:"PLANILHA DEMONSTRATIVA DE MANUTENÇÃO DE VIATURA",colSpan:10,styles:{halign:"center"}}],["DATA","PLACA","PRE-\nFIXO","ODÔ-\nMETRO","Nº PM\nRESP.","DESCRIÇÃO","QTD\n(SVÇ)","VALOR\nUNIT.","VALOR\nTOTAL","Nº DA\nNOTA"]],
            body:manutencaoData,
            foot: [[{ content: "TOTAL", colSpan: 5, styles: { halign: 'center' } }, { content: totalManutencaoFormatado, colSpan: 5, styles: { halign: 'center' } }]],
            showFoot: 'lastPage',
            columnStyles:{0:{cellWidth:17},1:{cellWidth:17},2:{cellWidth:12},3:{cellWidth:14,halign:"right"},4:{cellWidth:15},5:{cellWidth:"auto",halign:"left"},6:{minCellWidth:12},7:{minCellWidth:18,halign:"right"},8:{minCellWidth:18,halign:"right"},9:{minCellWidth:18,halign:"right"}}
        });
        algumaTabelaRenderizada = true;
      }

      if (algumaTabelaRenderizada) {
          const df=formatarDataPDF(new Date());
          const assinaturaBody = [
              [{content:`Quartel em ${formatarMunicipioPDF(municipio)}, ${df}.`}],
              [{content:`nº ${convenioInfo.preposto_n} - ${convenioInfo.preposto_pg} PM ${convenioInfo.preposto}`}],
              [{content:`PREPOSTO DO CONVÊNIO`}]
          ];
          autoTable(doc, { 
              startY: doc.lastAutoTable.finalY + 5, 
              body: assinaturaBody, 
              theme: 'plain', 
              tableWidth: doc.lastAutoTable.width,
              showHead: "never",
              styles: { halign: 'center', fontSize: 10, textColor: PDF_STYLES.textColor },
              didParseCell: (data) => {
                  if(data.row.index === 0) { data.cell.styles.halign = 'right'; data.cell.styles.cellPadding = { top: 5, right: 0, bottom: 10, left: 0 }; } 
                  else { data.cell.styles.fontStyle = 'bold'; data.cell.styles.cellPadding = 0; }
              }
          });
      }

      const grupos = agruparDadosPorElementoAdmin(dadosAnexo.principal);
      if (Object.keys(grupos).length > 0) {
        doc.addPage("a4", "p");
        const gruposArray = Object.values(grupos).sort((a,b)=>a.elementoCodigo.localeCompare(b.elementoCodigo));
        await renderizarTabelasResumidasAdmin(doc, gruposArray, margemPadrao, convenioInfo, municipio);
      }
      
      const pageCount = doc.internal.getNumberOfPages();
      await adicionarRodapePDF(doc, pageCount, dadosAnexo.obsgeral);
      doc.save(`ANEXO_UNICO_${ano}-${mNumerico(mes,"texto")}_${municipio}.pdf`);
      mostrarDialogo("Sucesso", "Anexo Único gerado!");
    } catch (error) {
      manipularErro(error, "gerarAnexoUnicoAdmin");
    }
  }

  async function adicionarRodapePDF(doc, pageCount, obsgeralObj) {
    try {
      const timestamp = obsgeralObj.timestamp;
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i); 
        doc.setFontSize(PDF_STYLES.baseFontSize - 2);
        doc.setTextColor(0, 0, 0); 
        const ps = doc.internal.pageSize, ph = ps.height ? ps.height : ps.getHeight(), pw = ps.width ? ps.width : ps.getWidth();
        doc.text(`Página ${i} de ${pageCount}`, pw - 20, ph - 10, { align: "right" });
        doc.text("Gerado por SiC3-15RPM v3.0", pw / 2, ph - 10, { align: "center" });
        if (timestamp) {
            doc.text("Última alteração: " + timestamp, 20, ph - 10);
        }
      }
    } catch (error) { 
      manipularErro(error, "adicionarRodapePDF", true); 
    }
  }

  function agruparDadosPorElementoAdmin(itens) {
    const grupos = {}; 
    const despesasExcluidas = ["3023", "3026", "3918"];
    
    itens.forEach(item => {
      const codigo = item.codigo.trim();
      const despesa = item.despesa.trim();
      const descricao = item.descricao.trim();
      let elementoCodigo = "", elementoNome = "";
      if (despesa.includes(" - ")) { 
        const partes = despesa.split(" - "); 
        elementoCodigo = partes[0].trim(); 
        elementoNome = partes.slice(1).join(" - ").trim(); 
      } else { 
        elementoCodigo = despesa; 
      }
      if (despesasExcluidas.includes(elementoCodigo)) return;
      
      // Se for 4004, não aglutinar
      if (elementoCodigo === "4004") {
        const chaveUnica = `${elementoCodigo}|${Math.random()}`; 
        grupos[chaveUnica] = { elementoCodigo, elementoNome, endereco: "", tipo: "servico", items: [item] };
        return; 
      }
      
      let endereco = ""; 
      if (codigo.startsWith("O")) { 
        const linhas = descricao.split("\n"); 
        for (const linha of linhas) { 
          if (linha.startsWith("End.:")) { 
            endereco = linha.replace("End.:", "").trim(); 
            break; 
          } 
        } 
      }
      
      const chave = endereco ? `${elementoCodigo}|${endereco}` : `${elementoCodigo}`;
      
      // Ajuste de tipo para Óleo Lubrificante
      const isOleo = descricao.toUpperCase().includes("OLEO LUBRIFICANTE") || descricao.toUpperCase().includes("ÓLEO LUBRIFICANTE");
      const tipo = (codigo.startsWith("O") && !isOleo) ? "servico" : "material";
      
      if (!grupos[chave]) {
        grupos[chave] = { elementoCodigo, elementoNome, endereco, tipo, items: [] };
      }
      grupos[chave].items.push({...item});
    });
    return grupos;
  }

  async function renderizarTabelasResumidasAdmin(doc, grupos, margin, convenioInfo, municipio) {
    const pageWidth = doc.internal.pageSize.width, maxWidth = pageWidth - (2 * margin), colSpacing = 8, tableWidth = (maxWidth - colSpacing) / 2;
    let currentY = margin + 15; const rowSpacing = 8;
    for (let i = 0; i < grupos.length; i += 2) {
      const grupo1 = grupos[i], grupo2 = i + 1 < grupos.length ? grupos[i + 1] : null;
      const altura1 = estimarAlturaTabelaResumida(grupo1), altura2 = grupo2 ? estimarAlturaTabelaResumida(grupo2) : 0, alturaMax = Math.max(altura1, altura2);
      if (currentY + alturaMax > doc.internal.pageSize.height - margin - 40) { doc.addPage(); currentY = margin + 15; }
      renderizarTabelaResumidaAdmin(doc, grupo1, margin, tableWidth, currentY);
      if (grupo2) renderizarTabelaResumidaAdmin(doc, grupo2, margin + tableWidth + colSpacing, tableWidth, currentY);
      currentY += alturaMax + rowSpacing;
    }
    currentY += 10;
    const assinaturaHeight = 30; if (currentY + assinaturaHeight > doc.internal.pageSize.height - margin) { doc.addPage(); currentY = margin + 15; }
    const dataFormatada = formatarDataPDF(new Date());
    autoTable(doc, { startY: currentY, body: [[{ content: `Quartel em ${formatarMunicipioPDF(municipio)}, ${dataFormatada}.`, colSpan: 2, styles: { halign: "right", fontSize: 10, cellPadding: { top: 5, right: 0, bottom: 10, left: 0 }, lineWidth: 0, fillColor: false, textColor: PDF_STYLES.textColor } }], [{ content: `nº ${convenioInfo.preposto_n} - ${convenioInfo.preposto_pg} PM ${convenioInfo.preposto}`, colSpan: 2, styles: { halign: "center", fontStyle: "bold", fontSize: 10, cellPadding: 0, lineWidth: 0, fillColor: false, textColor: PDF_STYLES.textColor } }], [{ content: `PREPOSTO DO CONVÊNIO`, colSpan: 2, styles: { halign: "center", fontStyle: "bold", fontSize: 10, cellPadding: 0, lineWidth: 0, fillColor: false, textColor: PDF_STYLES.textColor } }]], margin: { left: margin, right: margin }, styles: { cellPadding: 1, lineWidth: 0 }, theme: 'plain', pageBreak: 'avoid' });
    return doc;
  }

  function renderizarTabelaResumidaAdmin(doc, grupo, x, width, y) {
    if (!grupo?.items?.length) return;
    const observacao = grupo.items[0].observacao || "", obs = {};
    observacao.split("\n").forEach(l => { if (l.includes(":")) { const [k, v] = l.split(":"); if (k&&v) obs[k.trim()] = v.trim(); }});
    const isEnergia = grupo.elementoCodigo === "3912", isAgua = grupo.elementoCodigo === "3913", isInternet = grupo.elementoCodigo === "4004";
    const dados = [[{ content: `${grupo.elementoCodigo} - ${grupo.elementoNome}`, colSpan: 2, styles: { halign: "center", fillColor: PDF_STYLES.headerFillColor, fontSize: PDF_STYLES.baseFontSize, fontStyle: 'bold', textColor: PDF_STYLES.headerTextColor } }]];
    const valorTotalFormatado = (grupo.items.reduce((sum, item) => sum + (parseFloat(String(item.subtotal).replace(/[^\d,-]/g, "").replace(",", ".")) || 0), 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const quantidadeTotalFormatado = (grupo.items.reduce((sum, item) => sum + (parseFloat(String(item.quantidade).replace(/[^\d,-]/g, "").replace(",", ".")) || 0), 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

    if (grupo.tipo === "servico") {
        if (isEnergia) { dados.push([{ content: "Consumo:", styles:{fontStyle:'bold'}},{content:grupo.items[0].quantidade}],[{content:"Unidade de medida:",styles:{fontStyle:'bold'}},{content:"QUILOWATT-HORA"}]); }
        else if (isAgua) { dados.push([{content:"Consumo:",styles:{fontStyle:'bold'}},{content:grupo.items[0].quantidade}],[{content:"Unidade de medida:",styles:{fontStyle:'bold'}},{content:"METRO CÚBICO"}]); }
        else if (grupo.elementoCodigo === "4004") {
            const isInet = grupo.items[0].descricao.toUpperCase().includes("INTERNET");
            dados.push([{ content: "Quantidade:", styles: { fontStyle: 'bold' } }, { content: grupo.items[0].quantidade }]);
            dados.push([{ content: "Unidade de medida:", styles: { fontStyle: 'bold' } }, { content: isInet ? "MEGABITS" : "1,00 SERVICO" }]);
        }
        else { let u="1,00 UNIDADE"; const pI=grupo.items[0]; if(pI&&pI.unidade){const uT=pI.unidade.split('-')[1]; if(uT)u=uT.trim();} dados.push([{content:"Quantidade:",styles:{fontStyle:'bold'}},{content:grupo.items[0].quantidade}],[{content:"Unidade de medida:",styles:{fontStyle:'bold'}},{content:u}]); }
      dados.push([{content:"Valor da conta:",styles:{fontStyle:'bold'}},{content:valorTotalFormatado}]);
      const dI=grupo.items[0]?.data||""; let mR=""; if(dI){const[anoItem,mesItem]=dI.split("-");mR=`${mesItem}/${anoItem}`;} dados.push([{content:"Mês de referência:",styles:{fontStyle:'bold'}},{content:mR}]);
      dados.push([{content:"Resp. conferência:",styles:{fontStyle:'bold'}},{content:obs["Resp."]}]);
      if(grupo.endereco)dados.push([{content:"Endereço da instalação:",styles:{fontStyle:'bold'}},{content:grupo.endereco}]);
      if(obs["Forn."])dados.push([{content:"Fornecedor:",styles:{fontStyle:'bold'}},{content:obs["Forn."]}]);
      if(obs["Tel."]) dados.push([{content:"Nº do Telefone:",styles:{fontStyle:'bold'}},{content:obs["Tel."]}]);
      if((isEnergia||isAgua)&&obs["Med."])dados.push([{content:"Nº do Medidor:",styles:{fontStyle:'bold'}},{content:obs["Med."]}]);
    } else if (grupo.tipo === "material") {
      dados.push([{content:"Quantidade:",styles:{fontStyle:'bold'}},{content:quantidadeTotalFormatado}]);
      let uM="1,00 UNIDADE"; const pI=grupo.items[0]; if(pI&&pI.unidade){const uT=pI.unidade.split('-')[1];if(uT)uM=uT.trim();} dados.push([{content:"Unidade de medida:",styles:{fontStyle:'bold'}},{content:uM}]);
      dados.push([{content:"Valor total:",styles:{fontStyle:'bold'}},{content:valorTotalFormatado}]);
      const dI=grupo.items[0]?.data||"";let mR="";if(dI){const[anoItem,mesItem]=dI.split("-");mR=`${mesItem}/${anoItem}`;} dados.push([{content:"Mês de referência:",styles:{fontStyle:'bold'}},{content:mR}]);
      const rI=grupo.items[0]?.observacao?.match(/Resp\.: (\d+)/);const r=rI?rI[1]:""; dados.push([{content:"Resp. conferência:",styles:{fontStyle:'bold'}},{content:r}]);
    }
    autoTable(doc, {startY:y,margin:{left:x},tableWidth:width,body:dados,theme:'grid',styles:{fontSize:PDF_STYLES.baseFontSize,cellPadding:1,lineWidth:0.1,lineColor:PDF_STYLES.borderColor,minCellHeight:2, textColor: PDF_STYLES.textColor},columnStyles:{0:{cellWidth:width*0.45},1:{cellWidth:width*0.55}}});
  }

  function estimarAlturaTabelaResumida(grupo) {
    if (!grupo?.items?.length) return 0;
    const baseHeight = 20, lineHeight = 3; let rowCount = 2;
    const isEnergia = grupo.elementoCodigo === "3912", isAgua = grupo.elementoCodigo === "3913";
    if (grupo.tipo === "servico") { 
        rowCount += 6;
        if (grupo.endereco) rowCount++; 
        if ((isEnergia || isAgua) && grupo.items[0]?.observacao?.includes("Med.:")) rowCount++;
        if (grupo.items[0]?.observacao?.includes("Tel.:")) rowCount++;
    }
    else if (grupo.tipo === "material") { 
        rowCount += 5;
    }
    return baseHeight + rowCount * lineHeight;
  }

  // ======================== PRESTAÇÃO DE CONTAS ANUAL ========================
  async function gerarPrestacaoContasAnual(municipio, convenio, ano) {
    try {
      mostrarCarregamento("Buscando dados anuais do convênio...");
      
      const convenioInfo = await obterInformacoesConvenio(municipio, convenio);
      if (!convenioInfo) throw new Error('Não foi possível obter informações do convênio.');

      // Busca os dados da planilha 'principal' de todo o ano (sem filtro de mês)
      const query = `SELECT E, G, H, I, N WHERE B='${municipio}' AND C='${convenio}' AND D='${ano}'`;
      const principalRaw = await carregarDadosPlanilha({
        sheetId: idbase,
        sheet: 'principal',
        query: query
      });

      const principal = (principalRaw || []).map(row => ({
        mes: row[0] || "",
        codigo: row[1] || "",
        descricao: row[2] || "",
        despesa: row[3] || "",
        subtotal: row[4] || 0
      }));

      // Mapeamento local dos elementos de despesa cadastrados no convênio
      const codigosED = convenioInfo.elementos_despesa 
        ? convenioInfo.elementos_despesa.split('|').map(s => s.trim()).filter(Boolean)
        : [];
        
      const DICIONARIO_ELEMENTOS = {
        "3026": "COMBUSTÍVEIS E LUBRIFICANTES PARA VEÍCULOS AUTOMOTORES",
        "3025": "MATERIAL PARA MANUTENÇÃO DE VEÍCULOS AUTOMOTORES",
        "3919": "REPARO, MANUTENÇÃO E SERVIÇOS P/ VEÍCULOS AUTOMOTORES",
        "3922": "INSTALAÇÃO, REPARAÇÃO, ADAPTAÇÃO E CONSERVAÇÃO DE EQUIPAMENTOS",
        "3016": "MATERIAIS GRÁFICOS E IMPRESSOS",
        "3024": "MATERIAL PARA ESCRITÓRIO",
        "3028": "MATERIAL DE INFORMÁTICA",
        "3022": "ARTIGOS PARA LIMPEZA E HIGIENE",
        "3913": "TARIFA DE ÁGUA E ESGOTO",
        "3912": "TARIFA DE ENERGIA ELÉTRICA",
        "4004": "SERVIÇO DE TELECOMUNICAÇÃO E INTERNET",
        "3911": "SERVIÇOS DE CONSERVAÇÃO E LIMPEZA"
      };

      const tabelaGastos = {};
      codigosED.forEach(codigo => {
        const desc = DICIONARIO_ELEMENTOS[codigo] || "OUTROS GASTOS DE CONVÊNIO";
        tabelaGastos[codigo] = {
          codigo: codigo,
          descricao: desc,
          valores: Array(12).fill(0.0)
        };
      });

      // Processa os lançamentos da planilha principal
      principal.forEach(item => {
        const despesaRaw = String(item.despesa).trim();
        if (!despesaRaw) return;

        const codigoMatch = despesaRaw.match(/^\d{4}/);
        if (!codigoMatch) return;
        const codigo = codigoMatch[0];
        const descLancamento = despesaRaw.replace(/^\d{4}\s*-\s*/, "").trim();

        if (!tabelaGastos[codigo]) {
          tabelaGastos[codigo] = {
            codigo: codigo,
            descricao: descLancamento || DICIONARIO_ELEMENTOS[codigo] || "OUTROS GASTOS",
            valores: Array(12).fill(0.0)
          };
        } else if (descLancamento && (tabelaGastos[codigo].descricao === "OUTROS GASTOS DE CONVÊNIO" || tabelaGastos[codigo].descricao === "OUTROS GASTOS")) {
          tabelaGastos[codigo].descricao = descLancamento;
        }

        const mesNum = window.mNumerico(item.mes, "numero");
        if (mesNum >= 1 && mesNum <= 12) {
          const mesIndice = mesNum - 1;
          const subtotal = window.formatarNumero(item.subtotal, "numero");
          tabelaGastos[codigo].valores[mesIndice] += subtotal;
        }
      });

      // Converte o objeto de gastos para um array ordenado pelo código do elemento de despesa
      const linhasTabela = Object.values(tabelaGastos).sort((a, b) => a.codigo.localeCompare(b.codigo));

      // Calcula os totais mensais
      const totaisMensais = Array(12).fill(0.0);
      linhasTabela.forEach(linha => {
        for (let i = 0; i < 12; i++) {
          totaisMensais[i] += linha.valores[i];
        }
      });

      const totalGeral = totaisMensais.reduce((a, b) => a + b, 0);

      // Prepara o documento PDF
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: "l", unit: "mm", format: "a4", compress: true });
      const pageWidth = doc.internal.pageSize.getWidth(), pageCenter = pageWidth / 2;

      // Cabeçalho institucional fora da tabela (Centralizado no padrão dos anexos D e Único)
      doc.setFont(PDF_STYLES.font, "bold");
      doc.setFontSize(10);
      doc.text("POLÍCIA MILITAR DO ESTADO DE MINAS GERAIS", pageCenter, 15, { align: "center" });
      doc.text(`${convenioInfo.unidade}`.toUpperCase(), pageCenter, 20, { align: "center" });

      // Função auxiliar local para garantir formatação de datas (ISO -> BR)
      const formatarDataBR = (dataVal) => {
        if (!dataVal) return "";
        if (dataVal instanceof Date) {
          const dia = String(dataVal.getDate()).padStart(2, "0");
          const mes = String(dataVal.getMonth() + 1).padStart(2, "0");
          const anoStr = dataVal.getFullYear();
          return `${dia}/${mes}/${anoStr}`;
        }
        const dataStr = String(dataVal).trim();
        if (dataStr.includes("/")) return dataStr;
        const partes = dataStr.split("-");
        if (partes.length === 3) {
          if (partes[0].length === 4) {
            return `${partes[2]}/${partes[1]}/${partes[0]}`;
          }
          return `${partes[0]}/${partes[1]}/${partes[2]}`;
        }
        return dataStr;
      };

      // Determinação das datas limites do período anual
      let dataInicioPeriodo = `01/01/${ano}`;
      if (convenioInfo.dataInicio) {
        const dataInicioConvBR = formatarDataBR(convenioInfo.dataInicio);
        const partesInicio = dataInicioConvBR.split("/");
        if (partesInicio.length === 3) {
          const anoInicioConv = parseInt(partesInicio[2], 10);
          const anoSel = parseInt(ano, 10);
          if (anoInicioConv === anoSel) {
            dataInicioPeriodo = dataInicioConvBR;
          } else if (anoInicioConv > anoSel) {
            dataInicioPeriodo = dataInicioConvBR;
          }
        }
      }

      // Encontra o último mês lançado com valores > 0
      let maxMesLancado = 0;
      linhasTabela.forEach(linha => {
        for (let i = 0; i < 12; i++) {
          if (linha.valores[i] > 0) {
            const mesNum = i + 1;
            if (mesNum > maxMesLancado) {
              maxMesLancado = mesNum;
            }
          }
        }
      });

      let dataFimPeriodo = "";
      const hoje = new Date();
      const anoCorrente = hoje.getFullYear();
      const mesCorrente = hoje.getMonth() + 1;

      if (maxMesLancado > 0) {
        const anoSelNum = parseInt(ano, 10);
        if (anoSelNum === anoCorrente && maxMesLancado === mesCorrente) {
          dataFimPeriodo = formatarDataBR(hoje);
        } else {
          const ultimoDia = new Date(anoSelNum, maxMesLancado, 0).getDate();
          dataFimPeriodo = `${String(ultimoDia).padStart(2, "0")}/${String(maxMesLancado).padStart(2, "0")}/${anoSelNum}`;
        }
      } else {
        if (convenioInfo.dataFim) {
          const dataFimConvBR = formatarDataBR(convenioInfo.dataFim);
          const partesFim = dataFimConvBR.split("/");
          if (partesFim.length === 3 && parseInt(partesFim[2], 10) === parseInt(ano, 10)) {
            dataFimPeriodo = dataFimConvBR;
          } else {
            dataFimPeriodo = `31/12/${ano}`;
          }
        } else {
          dataFimPeriodo = `31/12/${ano}`;
        }
      }

      // Monta as linhas do corpo da tabela para o autoTable
      const tableBody = [];

      linhasTabela.forEach(linha => {
        const totalLinha = inlineSomarValores(linha.valores);
        const row = [
          `${linha.codigo} - ${linha.descricao.toUpperCase()}`,
          ...linha.valores.map(v => window.formatarNumero(v, "decimal")),
          window.formatarNumero(totalLinha, "decimal")
        ];
        tableBody.push(row);
      });

      function inlineSomarValores(arr) {
        return arr.reduce((a, b) => a + b, 0);
      }

      // Linha de totais mensais
      const totalMensalRow = [
        "TOTAL MENSAL",
        ...totaisMensais.map(v => window.formatarNumero(v, "decimal")),
        window.formatarNumero(totalGeral, "decimal")
      ];

      // Definição dos dados da tabela principal, incluindo cabeçalho embutido
      const autoTableData = [
        // Título do Relatório
        [{ content: `PRESTAÇÃO DE CONTAS ALUSIVA AO CONVÊNIO Nº ${convenio}`, colSpan: 14, styles: { halign: 'center', fontStyle: 'bold', fontSize: 10, cellPadding: { top: 3, bottom: 1 }, border: [true, true, false, true] } }],
        // Período e Valor do Convênio
        [{ content: `PERÍODO DE ${dataInicioPeriodo} A ${dataFimPeriodo}\nVALOR DO CONVÊNIO: ${convenioInfo.valor_estimado ? window.formatarNumero(parseFloat(convenioInfo.valor_estimado) || 0, 'moeda') : 'R$ -'}`, colSpan: 14, styles: { halign: 'left', fontStyle: 'bold', fontSize: 8, cellPadding: { top: 1, bottom: 3 }, border: [false, true, true, true] } }],
        // Cabeçalhos de Colunas
        [
          { content: "DISCRIMINAÇÃO\nMATERIAL", rowSpan: 2, styles: { halign: 'center', valign: 'middle', fontStyle: 'bold', fillColor: '#d9d9d9' } },
          { content: "JAN", styles: { halign: 'center', fillColor: '#d9d9d9', fontStyle: 'bold' } },
          { content: "FEV", styles: { halign: 'center', fillColor: '#d9d9d9', fontStyle: 'bold' } },
          { content: "MAR", styles: { halign: 'center', fillColor: '#d9d9d9', fontStyle: 'bold' } },
          { content: "ABR", styles: { halign: 'center', fillColor: '#d9d9d9', fontStyle: 'bold' } },
          { content: "MAI", styles: { halign: 'center', fillColor: '#d9d9d9', fontStyle: 'bold' } },
          { content: "JUN", styles: { halign: 'center', fillColor: '#d9d9d9', fontStyle: 'bold' } },
          { content: "JUL", styles: { halign: 'center', fillColor: '#d9d9d9', fontStyle: 'bold' } },
          { content: "AGO", styles: { halign: 'center', fillColor: '#d9d9d9', fontStyle: 'bold' } },
          { content: "SET", styles: { halign: 'center', fillColor: '#d9d9d9', fontStyle: 'bold' } },
          { content: "OUT", styles: { halign: 'center', fillColor: '#d9d9d9', fontStyle: 'bold' } },
          { content: "NOV", styles: { halign: 'center', fillColor: '#d9d9d9', fontStyle: 'bold' } },
          { content: "DEZ", styles: { halign: 'center', fillColor: '#d9d9d9', fontStyle: 'bold' } },
          { content: "TOTAL", rowSpan: 2, styles: { halign: 'center', valign: 'middle', fontStyle: 'bold', fillColor: '#d9d9d9' } }
        ],
        // Linha secundária "R$"
        [
          { content: "R$", styles: { halign: 'center', fillColor: '#d9d9d9', fontStyle: 'bold' } },
          { content: "R$", styles: { halign: 'center', fillColor: '#d9d9d9', fontStyle: 'bold' } },
          { content: "R$", styles: { halign: 'center', fillColor: '#d9d9d9', fontStyle: 'bold' } },
          { content: "R$", styles: { halign: 'center', fillColor: '#d9d9d9', fontStyle: 'bold' } },
          { content: "R$", styles: { halign: 'center', fillColor: '#d9d9d9', fontStyle: 'bold' } },
          { content: "R$", styles: { halign: 'center', fillColor: '#d9d9d9', fontStyle: 'bold' } },
          { content: "R$", styles: { halign: 'center', fillColor: '#d9d9d9', fontStyle: 'bold' } },
          { content: "R$", styles: { halign: 'center', fillColor: '#d9d9d9', fontStyle: 'bold' } },
          { content: "R$", styles: { halign: 'center', fillColor: '#d9d9d9', fontStyle: 'bold' } },
          { content: "R$", styles: { halign: 'center', fillColor: '#d9d9d9', fontStyle: 'bold' } },
          { content: "R$", styles: { halign: 'center', fillColor: '#d9d9d9', fontStyle: 'bold' } },
          { content: "R$", styles: { halign: 'center', fillColor: '#d9d9d9', fontStyle: 'bold' } }
        ],
        
        // Dados de Elementos de Despesa
        ...tableBody,
        
        // Linha de Total Mensal
        totalMensalRow.map((content, idx) => ({
          content: content,
          styles: { fontStyle: 'bold', fillColor: '#d9d9d9', halign: idx === 0 ? 'center' : 'right' }
        })),

        // Linha de Total Geral finalizada
        [{ content: `TOTAL GERAL: ${window.formatarNumero(totalGeral, 'moeda')}`, colSpan: 14, styles: { halign: 'center', fontStyle: 'bold', fontSize: 9, cellPadding: 2.5, fillColor: '#d9d9d9' } }]
      ];

      autoTable(doc, {
        startY: 28,
        margin: { left: 15, right: 15 },
        body: autoTableData,
        theme: 'grid',
        styles: {
          font: 'helvetica',
          fontSize: 6.5,
          textColor: [0, 0, 0],
          lineColor: '#646464',
          lineWidth: 0.1,
          cellPadding: 1
        },
        columnStyles: {
          0: { cellWidth: 80, fontSize: 6.5 },
          1: { cellWidth: 14, halign: 'right' },
          2: { cellWidth: 14, halign: 'right' },
          3: { cellWidth: 14, halign: 'right' },
          4: { cellWidth: 14, halign: 'right' },
          5: { cellWidth: 14, halign: 'right' },
          6: { cellWidth: 14, halign: 'right' },
          7: { cellWidth: 14, halign: 'right' },
          8: { cellWidth: 14, halign: 'right' },
          9: { cellWidth: 14, halign: 'right' },
          10: { cellWidth: 14, halign: 'right' },
          11: { cellWidth: 14, halign: 'right' },
          12: { cellWidth: 14, halign: 'right' },
          13: { cellWidth: 18, halign: 'right', fontStyle: 'bold' }
        },
        didParseCell: (data) => {
          if (data.row.index === 0 || data.row.index === 1) {
            data.cell.styles.lineWidth = 0.1;
            data.cell.styles.lineColor = '#646464';
          }
        }
      });

      // Data de emissão e Assinatura do Preposto (Centralizado/Alinhado em conformidade com Anexo D e Único)
      const dataFormatada = formatarDataPDF(new Date());
      const assinaturaBody = [
          [{ content: `Quartel em ${formatarMunicipioPDF(municipio)}, ${dataFormatada}.` }],
          [{ content: `nº ${convenioInfo.preposto_n || "-"} - ${convenioInfo.preposto_pg || ""} PM ${convenioInfo.preposto || ""}` }],
          [{ content: `PREPOSTO DO CONVÊNIO` }]
      ];

      autoTable(doc, {
          startY: doc.lastAutoTable.finalY + 5,
          body: assinaturaBody,
          theme: 'plain',
          margin: { left: 15, right: 15 },
          tableWidth: doc.lastAutoTable.width,
          showHead: 'never',
          styles: { halign: 'center', fontSize: 8, textColor: PDF_STYLES.textColor },
          didParseCell: (data) => {
              if (data.row.index === 0) {
                  data.cell.styles.halign = 'right';
                  data.cell.styles.cellPadding = { top: 5, right: 0, bottom: 8, left: 0 };
              } else {
                  data.cell.styles.fontStyle = 'bold';
                  data.cell.styles.cellPadding = 0;
              }
          }
      });

      const pageCount = doc.internal.getNumberOfPages();
      await adicionarRodapePDF(doc, pageCount, { timestamp: new Date().toLocaleString("pt-BR") });
      doc.save(`PRESTACAO_CONTAS_ANUAL_${ano}_${municipio}.pdf`);
      mostrarDialogo("Sucesso", "Prestação de Contas Anual gerada com sucesso!");
    } catch (error) {
      manipularErro(error, "gerarPrestacaoContasAnual");
    } finally {
      ocultarCarregamento();
    }
  }
