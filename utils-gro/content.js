(function () {

  let lastRun = 0;
  let mutationObserver = null;
  let intersectionObserver = null;
  let isEnabled = false;

  // Debounce function pour limiter les appels
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Add/update CSS rules for pulse-card badges (no ::after)
  function addPulseCardStyles() {
    const styleId = 'pulse-card-custom-styles';
    const desiredCss = `
      .dev-pulse-card-suffix {
        display: block;
        font-size: 11px;
        color: #0073ea;
        font-style: italic;
        margin-top: 4px;
        order: -1;
      }
    `;
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = desiredCss;
  }

  // Styles for item id badges under name cells
  function addItemIdStyles() {
    const styleId = 'dev-itemid-custom-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .dev-itemid-suffix {
          font-size: 11px;
          color: #0073ea;
          font-style: italic;
          position: absolute;
          bottom: -10px;
          left: 5px;
          pointer-events: none;
        }
      `;
      document.head.appendChild(style);
    }
  }

  function addSuffixElementToColIdentifiers() {
    const now = Date.now();
    if (now - lastRun < 100) return; // Réduire à 100ms
    lastRun = now;

    try {
      const topbar = document.querySelector('#mf-topbar');
      if (!topbar) return;

      const checkbox = topbar.querySelector('input.dev-column-toggle');
      if (!checkbox?.checked) {
        // Nettoyer tous les suffixes existants
        document.querySelectorAll('.dev-column-suffix').forEach(el => el.remove());
        // Nettoyer les attributs de marquage
        document.querySelectorAll('[data-suffix-added]').forEach(el => {
          el.removeAttribute('data-suffix-added');
        });
        return;
      }

      // Cibler plus précisément pour éviter le retraitement
      const elements = document.querySelectorAll('[class*="col-identifier-"].column-header:not([data-suffix-added])');

      elements.forEach(el => {
        const identifierClass = Array.from(el.classList).find(c => c.startsWith("col-identifier-"));
        if (!identifierClass) return;

        const titleWrapper = el.querySelector('.title-wrapper');
        if (!titleWrapper) return;

        // Marquer l'élément pour éviter le retraitement
        el.setAttribute('data-suffix-added', 'true');

        const suffix = identifierClass.replace("col-identifier-", "");
        const p = document.createElement("p");
        p.textContent = suffix;
        p.className = "dev-column-suffix";

        // Utiliser cssText pour une meilleure performance
        p.style.cssText = `
          margin: 4px 0px 0px;
          font-size: 11px;
          color: #8d6b00;
          font-style: italic;
          position: absolute;
          bottom: -2px;
          left: 5px;
          pointer-events: none;
        `;

        // Optimiser la vérification de position
        if (getComputedStyle(titleWrapper).position === "static") {
          titleWrapper.style.position = "relative";
        }

        titleWrapper.appendChild(p);
      });
    } catch (error) {
      console.error('Erreur dans addSuffixElementToColIdentifiers:', error);
    }
  }

  // Version debounced de la fonction principale
  const debouncedUpdate = debounce(addSuffixElementToColIdentifiers, 150);

  // Fonction séparée pour les pulse-card
  function updatePulseCards() {
    try {
      addPulseCardStyles();

      document.querySelectorAll('.pulse-card-row').forEach(row => {
        const columnId = row.getAttribute('data-column-id');
        const titleText = row.querySelector('.title-text');
        if (!titleText || !columnId) return;
        if (titleText.querySelector('.dev-pulse-card-suffix')) return;
        const badge = document.createElement('span');
        badge.className = 'dev-pulse-card-suffix';
        badge.textContent = columnId;
        titleText.appendChild(badge);
      });
    } catch (error) {
      console.error('Erreur dans updatePulseCards:', error);
    }
  }

  const debouncedPulseUpdate = debounce(updatePulseCards, 150);

  // Ajouter l'ID d'item sous le nom, si absent
  function updateItemIds() {
    try {
      addItemIdStyles();
      const wrappers = document.querySelectorAll('div[data-testid^="item-"]');
      wrappers.forEach(wrapper => {
        if (wrapper.hasAttribute('data-itemid-added')) return;
        const testid = wrapper.getAttribute('data-testid') || '';
        const match = /^item-(\d+)/.exec(testid);
        if (!match) return;
        const itemId = match[1];

        const nameCell = wrapper.querySelector('.name-cell-text');
        if (!nameCell) return;
        if (nameCell.querySelector('.dev-itemid-suffix')) {
          wrapper.setAttribute('data-itemid-added', 'true');
          return;
        }
        if (getComputedStyle(nameCell).position === 'static') {
          nameCell.style.position = 'relative';
        }
        const badge = document.createElement('span');
        badge.className = 'dev-itemid-suffix';
        badge.textContent = `#${itemId}`;
        nameCell.appendChild(badge);
        wrapper.setAttribute('data-itemid-added', 'true');
      });
    } catch (error) {
      console.error('Erreur dans updateItemIds:', error);
    }
  }

  const debouncedItemIdsUpdate = debounce(updateItemIds, 150);

  function createMutationObserver() {
    if (mutationObserver) {
      mutationObserver.disconnect();
    }

    mutationObserver = new MutationObserver((mutations) => {
      if (!isEnabled) return;

      let shouldUpdate = false;

      mutations.forEach(mutation => {
        // Vérifier seulement les mutations pertinentes
        if (mutation.type === 'childList') {
          const hasRelevantNodes = Array.from(mutation.addedNodes).some(node =>
            node.nodeType === 1 && (
              node.classList?.contains('column-header') ||
              node.querySelector?.('.column-header') ||
              node.classList?.contains('pulse-card-row') ||
              node.querySelector?.('.pulse-card-row') ||
              node.matches?.('div[data-testid^="item-"]') ||
              node.querySelector?.('div[data-testid^="item-"]')
            )
          );
          if (hasRelevantNodes) shouldUpdate = true;
        } else if (mutation.type === 'attributes' &&
          mutation.attributeName === 'class' &&
          (mutation.target.classList?.contains('column-header') ||
            mutation.target.classList?.contains('pulse-card-row'))) {
          shouldUpdate = true;
        }
      });

      if (shouldUpdate) {
        debouncedUpdate();
        debouncedPulseUpdate();
        debouncedItemIdsUpdate();
      }
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });

    console.log("▶️ MutationObserver démarré");
  }

  function createIntersectionObserver() {
    if (!('IntersectionObserver' in window)) {
      // Fallback pour les navigateurs plus anciens
      window.addEventListener('scroll', debouncedUpdate, { passive: true });
      return;
    }

    if (intersectionObserver) {
      intersectionObserver.disconnect();
    }

    intersectionObserver = new IntersectionObserver((entries) => {
      if (!isEnabled) return;

      const hasVisibleColumns = entries.some(entry => entry.isIntersecting);
      if (hasVisibleColumns) {
        debouncedUpdate();
      }
    }, {
      rootMargin: '50px' // Déclencher un peu avant que l'élément soit visible
    });

    // Observer les colonnes existantes
    const observeColumns = () => {
      document.querySelectorAll('.column-header').forEach(el => {
        intersectionObserver.observe(el);
      });
    };

    observeColumns();

    // Re-observer quand de nouvelles colonnes apparaissent
    const columnObserver = new MutationObserver(() => {
      observeColumns();
    });

    columnObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function startObservers() {
    if (!isEnabled) {
      isEnabled = true;
      createMutationObserver();
      createIntersectionObserver();
      debouncedUpdate();
      debouncedItemIdsUpdate();
    }
  }

  function stopObservers() {
    if (isEnabled) {
      isEnabled = false;

      if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
      }

      if (intersectionObserver) {
        intersectionObserver.disconnect();
        intersectionObserver = null;
      }

      // Nettoyer les suffixes existants
      document.querySelectorAll('.dev-column-suffix').forEach(el => el.remove());
      document.querySelectorAll('.dev-itemid-suffix').forEach(el => el.remove());
      document.querySelectorAll('[data-suffix-added]').forEach(el => {
        el.removeAttribute('data-suffix-added');
      });
      document.querySelectorAll('[data-itemid-added]').forEach(el => {
        el.removeAttribute('data-itemid-added');
      });

      console.log("⏹️ Observers arrêtés");
    }
  }

  function cleanup() {
    stopObservers();
    window.removeEventListener('scroll', debouncedUpdate);
    window.removeEventListener('beforeunload', cleanup);
  }

  function setup() {
    // Utiliser requestIdleCallback si disponible pour ne pas bloquer le thread principal
    const runWhenIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 0));

    runWhenIdle(() => {
      try {
        const topbar = document.querySelector('#mf-topbar');
        if (!topbar) {
          console.log("Topbar non trouvé");
          return;
        }

        let checkbox = topbar.querySelector('input.dev-column-toggle');
        if (!checkbox) {
          const label = document.createElement("label");
          label.style.cssText = `
            display: flex;
            align-items: center;
            gap: 4px;
            margin-left: 10px;
            font-size: 12px;
            color: #333;
            cursor: pointer;
          `;

          checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.classList.add("dev-column-toggle");

          label.appendChild(checkbox);
          label.appendChild(document.createTextNode("Voir les ID des colonnes"));
          topbar.appendChild(label);
        }

        // Restaurer l'état sauvegardé
        const savedState = localStorage.getItem('devColumnToggleChecked');
        checkbox.checked = savedState === null ? true : savedState === 'true';

        checkbox.addEventListener("change", () => {
          try {
            localStorage.setItem('devColumnToggleChecked', checkbox.checked);
            if (checkbox.checked) {
              startObservers();
            } else {
              stopObservers();
            }
          } catch (error) {
            console.error('Erreur lors du changement d\'état:', error);
          }
        });

        // Initialiser selon l'état
        if (checkbox.checked) {
          startObservers();
        } else {
          stopObservers();
        }

        // Toujours exécuter updatePulseCards
        updatePulseCards();

        // Ajouter le nettoyage lors du déchargement
        window.addEventListener('beforeunload', cleanup);

        console.log("✅ Extension initialisée");

      } catch (error) {
        console.error('Erreur lors de l\'initialisation:', error);
      }
    });
  }

  // Attendre que la page soit complètement chargée
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(setup, 3000);
    });
  } else {
    setTimeout(setup, 3000);
  }

})();