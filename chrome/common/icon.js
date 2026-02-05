// Arquivo: common/icon.js
// Armazena e exporta o SVG do ícone da aplicação para ser reutilizado.

export const iconSVG = `
    <svg width="36" height="36" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" style="font-family: 'Inter', sans-serif; display: block; border-radius: 5px;">
        <defs>
            <linearGradient id="gradBg-128" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#574e2d;"/><stop offset="100%" style="stop-color:#b3a368;"/></linearGradient>
            <linearGradient id="gradItem0-128" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#b3a368;"/><stop offset="100%" style="stop-color:#efe6dd;"/></linearGradient>
            <filter id="shadowItem0-128" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="3" dy="0" stdDeviation="1" flood-color="#000000" flood-opacity="0.45"/></filter>
            <linearGradient id="gradItem1-128" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#000000;"/><stop offset="100%" style="stop-color:#efe6dd;"/></linearGradient>
            <filter id="shadowItem1-128" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="1" dy="1" stdDeviation="0" flood-color="#000000" flood-opacity="1"/></filter>
            <linearGradient id="gradItem2-128" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#51ff51;"/><stop offset="100%" style="stop-color:#00d200;"/></linearGradient>
            <filter id="shadowItem2-128" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="1" dy="1" stdDeviation="0" flood-color="#000000" flood-opacity="1"/></filter>
            <linearGradient id="gradItem3-128" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#333333;"/><stop offset="100%" style="stop-color:#efe6dd;"/></linearGradient>
            <filter id="shadowItem3-128" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="1" dy="1" stdDeviation="0" flood-color="#000000" flood-opacity="1"/></filter>
        </defs>
        <rect width="128" height="128" rx="28" fill="url(#gradBg-128)" opacity="1"/>
        <g transform="scale(1.28)">
            <text x="39" y="85" font-family="'Inter', sans-serif" font-size="105" font-weight="800" fill="url(#gradItem0-128)" text-anchor="middle" style="filter: url(#shadowItem0-128);" opacity="1" stroke="#1e293b" stroke-width="1">S</text>
            <text x="25" y="94" font-family="'Inter', sans-serif" font-size="27" font-weight="800" fill="url(#gradItem1-128)" text-anchor="middle" style="filter: url(#shadowItem1-128);" opacity="1" stroke="#000000" stroke-width="0">P</text>
            <text x="75" y="94" font-family="'Inter', sans-serif" font-size="27" font-weight="800" fill="url(#gradItem1-128)" text-anchor="middle" style="filter: url(#shadowItem1-128);" opacity="1" stroke="#000000" stroke-width="0">G</text>
            <text x="79" y="72" font-family="'Inter', sans-serif" font-size="62" font-weight="900" fill="url(#gradItem2-128)" text-anchor="middle" style="filter: url(#shadowItem2-128);" opacity="1" stroke="#000000" stroke-width="0">+</text>
            <text x="48" y="94" font-family="'Inter', sans-serif" font-size="30" font-weight="800" fill="url(#gradItem3-128)" text-anchor="middle" style="filter: url(#shadowItem3-128);" opacity="1" stroke="#000000" stroke-width="0">M</text>
        </g>
    </svg>
`.replace(/\s\s+/g, ' ').trim();

// Versão de 28x28px usada na Intranet
export const iconSVG_28 = iconSVG.replace('width="36"', 'width="28"').replace('height="36"', 'height="28"');
