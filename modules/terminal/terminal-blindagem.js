(function() {
    // 1. Monkey Patching no addEventListener para ignorar beforeunload
    const originalAddEventListener = Window.prototype.addEventListener;
    Window.prototype.addEventListener = function(type, listener, options) {
        if (type === 'beforeunload' || type === 'unload') {
            console.log('SisPMG+: Bloqueada tentativa de registro de:', type);
            return;
        }
        return originalAddEventListener.call(this, type, listener, options);
    };

    // 2. Limpeza contínua de propriedades e atributos inline
    const clean = () => {
        window.onbeforeunload = null;
        window.onunload = null;
        if (document.body) {
            document.body.onbeforeunload = null;
            document.body.onunload = null;
        }
        // Remove atributos inline de todos os elementos
        const all = document.getElementsByTagName("*");
        for (let i = 0; i < all.length; i++) {
            if (all[i].hasAttribute("onbeforeunload")) all[i].removeAttribute("onbeforeunload");
            if (all[i].hasAttribute("onunload")) all[i].removeAttribute("onunload");
        }
    };
    
    // Executa imediatamente e periodicamente
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', clean);
    } else {
        clean();
    }
    setInterval(clean, 1000);
})();