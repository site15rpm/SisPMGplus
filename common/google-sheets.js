// Arquivo: common/google-sheets.js
// Utilitários para interação com o Google Sheets via API de Visualização (gviz).

/**
 * Converte a resposta do Google Sheets (formato gviz JSON) para um formato de array 2D simples.
 * @param {string} responseText O texto da resposta da API do Google Visualization.
 * @returns {Array<Array<string|number|null>>} Os dados da planilha como um array de linhas.
 */
export function parseGoogleSheetResponse(responseText) {
    const jsonText = responseText.match(/google\.visualization\.Query\.setResponse\((.*)\);/s);
    if (!jsonText || !jsonText[1]) {
        console.error("SisPMG+ [Google Sheets]: Formato de resposta do banco de dados inesperado.");
        throw new Error('Formato de resposta do banco de dados inesperado. Verifique se a planilha é pública.');
    }
    const data = JSON.parse(jsonText[1]);
    if (!data.table || !data.table.rows) return [];

    // Mapeia as linhas e células, tratando valores vazios como null
    const parsedData = data.table.rows.map(row => 
        row.c.map(cell => cell ? (cell.f || cell.v) : null)
    );
    return parsedData;
}
