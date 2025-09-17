(function () {
    function inject() {
        try {
            var s = document.createElement('script');
            s.src = chrome.runtime.getURL('toolsearch.js');
            s.onload = function () { this.remove(); };
            (document.head || document.documentElement).appendChild(s);
        } catch (e) {
            console.error('Injection error:', e);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject);
    } else {
        inject();
    }
})();

