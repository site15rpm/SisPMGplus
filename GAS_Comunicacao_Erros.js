/**
 * GOOGLE APPS SCRIPT - SisPMG+ (Comunicação e Logs de Erros)
 * 
 * Instruções de instalação:
 * 1. Abra a sua planilha (ID: 1UPHe_LHpFR6yyE5_o-3Vb22WT4eDA9YGmxujReDQqxg)
 * 2. No menu superior, clique em "Extensões" > "Apps Script"
 * 3. Apague todo o código existente no editor e cole este script abaixo.
 * 4. Salve o projeto (ícone de disquete).
 * 5. Clique em "Implantar" (canto superior direito) > "Nova implantação"
 * 6. Selecione o tipo de implantação: "App da Web" (engrenagem > App da Web)
 * 7. Configure:
 *    - Descrição: "API SisPMG+ Comunicação e Erros"
 *    - Executar como: "Você (seu e-mail)"
 *    - Quem tem acesso: "Qualquer pessoa" (Importante para que a extensão consiga enviar requisições)
 * 8. Clique em "Implantar" e conceda as permissões necessárias.
 * 9. Copie o URL do App da Web gerado e salve-o no painel de controle (popup) da extensão SisPMG+.
 */

const PLANILHA_ID = "1UPHe_LHpFR6yyE5_o-3Vb22WT4eDA9YGmxujReDQqxg";

function normalizarTexto(str) {
  if (!str) return "";
  return String(str)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);
    const action = request.action;

    const ss = SpreadsheetApp.openById(PLANILHA_ID);

    if (action === 'confirmarMensagem') {
      const sheet = ss.getSheetByName("mensagens");
      if (!sheet) {
        return criarRespostaJson({ success: false, error: "Aba 'mensagens' não encontrada." });
      }

      const row = request.rowIndex;
      const userPM = String(request.userPM).trim();
      const abrangenciaRequest = String(request.abrangencia).trim();
      const mensagemRequest = String(request.mensagem).trim();

      let linhaParaAtualizar = -1;

      // Validação rápida na linha física direta
      if (row && row <= sheet.getLastRow()) {
        const valAbrangencia = String(sheet.getRange(row, 1).getValue());
        const valMensagem = String(sheet.getRange(row, 3).getValue());
        if (normalizarTexto(valAbrangencia) === normalizarTexto(abrangenciaRequest) && 
            normalizarTexto(valMensagem) === normalizarTexto(mensagemRequest)) {
          linhaParaAtualizar = row;
        }
      }

      // Se falhar a validação direta, busca em toda a planilha
      if (linhaParaAtualizar === -1) {
        const data = sheet.getDataRange().getValues();
        for (let r = 1; r < data.length; r++) { // Pula a primeira linha (cabeçalho)
          const valAbrangencia = String(data[r][0]);
          const valMensagem = String(data[r][2]);
          if (normalizarTexto(valAbrangencia) === normalizarTexto(abrangenciaRequest) && 
              normalizarTexto(valMensagem) === normalizarTexto(mensagemRequest)) {
            linhaParaAtualizar = r + 1;
            break;
          }
        }
      }

      if (linhaParaAtualizar !== -1) {
        const cell = sheet.getRange(linhaParaAtualizar, 4);
        const currentVal = String(cell.getValue()).trim();

        let newVal = "";
        if (currentVal) {
          const parts = currentVal.split("|").map(p => p.trim()).filter(p => p);
          if (parts.indexOf(userPM) === -1) {
            parts.push(userPM);
            newVal = parts.join("|");
          } else {
            newVal = currentVal;
          }
        } else {
          newVal = userPM;
        }

        cell.setValue(newVal);
        return criarRespostaJson({ success: true });
      }

      return criarRespostaJson({ success: false, error: "Mensagem correspondente não encontrada para confirmação." });
    }

    if (action === 'registrarErro') {
      const sheet = ss.getSheetByName("erros");
      if (!sheet) {
        return criarRespostaJson({ success: false, error: "Aba 'erros' não encontrada." });
      }

      // Insere os logs de erro
      // Colunas: Erro (A), URL (B), Timestamp (C), Navegador (D), Informações do Usuário (E), Versão da Extensão (F), Informações de Depuração (G)
      sheet.appendRow([
        request.timestamp || new Date().toISOString(),
        request.versao || "",
        request.navegador || "",
        request.url || "",
        request.erro || "",
        request.infoDepuracao || "",
        request.infoUsuario || ""
      ]);

      return criarRespostaJson({ success: true });
    }

    return criarRespostaJson({ success: false, error: `Ação desconhecida: ${action}` });

  } catch (error) {
    return criarRespostaJson({ success: false, error: error.toString() });
  }
}

function criarRespostaJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
