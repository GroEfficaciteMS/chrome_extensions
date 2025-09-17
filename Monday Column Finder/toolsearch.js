(function () {
    'use strict';

    // Éviter les doublons si le script est relancé
    if (window.MondayColumnFinderInstance) {
        window.MondayColumnFinderInstance.destroy();
    }

    class MondayColumnFinder {
        constructor() {
            this.columnDatabase = new Map();
            this.scanInterval = null;
            this.isScanning = false;
            this.isDragging = false;
            this.dragOffset = { x: 0, y: 0 };
            this.toolElement = null;
            this.currentBoardId = null;
            this.allBoardsData = new Map(); // Stockage de tous les boards

            this.extractBoardId();
            this.loadBoardData();
            this.createUI();
            this.startScanning();
            this.watchUrlChanges();

            console.log(`🔍 Monday Column Finder activé pour le board: ${this.currentBoardId || 'Inconnu'}`);
        }

        extractBoardId() {
            const url = window.location.href;
            const boardMatch = url.match(/\/boards\/(\d+)/);

            if (boardMatch) {
                this.currentBoardId = boardMatch[1];
            } else {
                this.currentBoardId = null;
            }
        }

        watchUrlChanges() {
            // Observer les changements d'URL (navigation SPA)
            let lastUrl = window.location.href;

            const checkUrlChange = () => {
                const currentUrl = window.location.href;
                if (currentUrl !== lastUrl) {
                    lastUrl = currentUrl;
                    this.handleUrlChange();
                }
            };

            // Vérifier toutes les secondes
            setInterval(checkUrlChange, 1000);

            // Observer les changements du DOM pour détecter les navigations
            const observer = new MutationObserver(() => {
                setTimeout(checkUrlChange, 100);
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        handleUrlChange() {
            const oldBoardId = this.currentBoardId;
            this.extractBoardId();

            if (oldBoardId !== this.currentBoardId) {
                console.log(`📍 Navigation détectée: ${oldBoardId} → ${this.currentBoardId}`);

                // Sauvegarder les données du board précédent
                if (oldBoardId && this.columnDatabase.size > 0) {
                    this.saveBoardData(oldBoardId);
                }

                // Charger les données du nouveau board
                this.loadBoardData();
                this.updateStatus(`Board changé: ${this.currentBoardId || 'Inconnu'}`, false);

                // Forcer un rescan du nouveau board
                setTimeout(() => this.forceRescan(), 1000);
            }
        }

        saveBoardData(boardId = null) {
            const targetBoardId = boardId || this.currentBoardId;
            if (!targetBoardId || this.columnDatabase.size === 0) return;

            try {
                // Convertir Map en objet pour la sauvegarde
                const dataToSave = Object.fromEntries(
                    Array.from(this.columnDatabase.entries()).map(([id, info]) => [
                        id,
                        {
                            name: info.name,
                            lastSeen: info.lastSeen,
                            boardId: targetBoardId
                        }
                    ])
                );

                // Sauvegarder dans localStorage
                const storageKey = `mondayColumnFinder_${targetBoardId}`;
                localStorage.setItem(storageKey, JSON.stringify(dataToSave));

                // Mettre à jour le cache en mémoire
                this.allBoardsData.set(targetBoardId, new Map(this.columnDatabase));

                console.log(`💾 Données sauvegardées pour le board ${targetBoardId} (${this.columnDatabase.size} colonnes)`);
            } catch (error) {
                console.error('Erreur lors de la sauvegarde:', error);
            }
        }

        loadBoardData() {
            if (!this.currentBoardId) {
                this.columnDatabase.clear();
                return;
            }

            try {
                // Charger depuis localStorage
                const storageKey = `mondayColumnFinder_${this.currentBoardId}`;
                const savedData = localStorage.getItem(storageKey);

                if (savedData) {
                    const parsedData = JSON.parse(savedData);
                    this.columnDatabase.clear();

                    Object.entries(parsedData).forEach(([id, info]) => {
                        this.columnDatabase.set(id, {
                            name: info.name,
                            lastSeen: info.lastSeen,
                            element: null // Sera récupéré au prochain scan
                        });
                    });

                    console.log(`📂 Données chargées pour le board ${this.currentBoardId} (${this.columnDatabase.size} colonnes)`);
                    this.displayAllColumns();
                } else {
                    this.columnDatabase.clear();
                    console.log(`🆕 Nouveau board détecté: ${this.currentBoardId}`);
                }
            } catch (error) {
                console.error('Erreur lors du chargement:', error);
                this.columnDatabase.clear();
            }
        }

        getAllSavedBoards() {
            const boards = [];

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('mondayColumnFinder_')) {
                    const boardId = key.replace('mondayColumnFinder_', '');
                    try {
                        const data = JSON.parse(localStorage.getItem(key));
                        const columnCount = Object.keys(data).length;
                        boards.push({ boardId, columnCount, data });
                    } catch (e) {
                        console.warn(`Données corrompues pour le board ${boardId}`);
                    }
                }
            }

            return boards.sort((a, b) => a.boardId.localeCompare(b.boardId));
        }

        createUI() {
            // Créer les styles CSS
            const styles = `
                #mondayColumnFinder {
                    position: fixed !important;
                    top: 50px;
                    right: 20px;
                    width: 380px !important;
                    background: white !important;
                    border-radius: 8px !important;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
                    z-index: 999999 !important;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
                    border: 2px solid #0073ea !important;
                }

                #mondayColumnFinder * {
                    box-sizing: border-box !important;
                }

                #mondayFinderDragHandle {
                    background: linear-gradient(135deg, #0073ea, #005bb5) !important;
                    color: white !important;
                    padding: 12px !important;
                    cursor: move !important;
                    border-radius: 6px 6px 0 0 !important;
                    font-weight: 600 !important;
                    text-align: center !important;
                    user-select: none !important;
                    font-size: 14px !important;
                    position: relative !important;
                }

                #mondayFinderMinimizeBtn {
                    position: absolute !important;
                    top: 8px !important;
                    right: 8px !important;
                    width: 24px !important;
                    height: 24px !important;
                    line-height: 24px !important;
                    text-align: center !important;
                    border: none !important;
                    background: transparent !important;
                    color: #fff !important;
                    font-size: 18px !important;
                    cursor: pointer !important;
                    padding: 0 !important;
                }

                #mondayFinderContent {
                    padding: 16px !important;
                }

                #mondayFinderBoardInfo {
                    background: #f0f4ff !important;
                    border: 1px solid #b3d4ff !important;
                    border-radius: 4px !important;
                    padding: 8px !important;
                    margin-bottom: 12px !important;
                    font-size: 12px !important;
                    color: #0056b3 !important;
                }

                #mondayFinderSearch {
                    width: 100% !important;
                    padding: 10px !important;
                    border: 2px solid #e1e5e9 !important;
                    border-radius: 6px !important;
                    font-size: 14px !important;
                    margin-bottom: 12px !important;
                    transition: border-color 0.2s !important;
                    outline: none !important;
                }

                #mondayFinderSearch:focus {
                    border-color: #0073ea !important;
                }

                #mondayFinderStatus {
                    font-size: 12px !important;
                    color: #666 !important;
                    margin-bottom: 12px !important;
                    padding: 8px !important;
                    background: #f8f9fa !important;
                    border-radius: 4px !important;
                }

                #mondayFinderResults {
                    max-height: 300px !important;
                    overflow-y: auto !important;
                    border: 1px solid #e1e5e9 !important;
                    border-radius: 6px !important;
                    background: #fafbfc !important;
                }

                .mondayFinderResultItem {
                    padding: 10px !important;
                    border-bottom: 1px solid #e1e5e9 !important;
                    cursor: pointer !important;
                    transition: background-color 0.2s !important;
                }

                .mondayFinderResultItem:last-child {
                    border-bottom: none !important;
                }

                .mondayFinderResultItem:hover {
                    background-color: #e8f4fd !important;
                }

                .mondayFinderResultName {
                    font-weight: 500 !important;
                    color: #333 !important;
                    margin-bottom: 4px !important;
                    font-size: 14px !important;
                }

                .mondayFinderResultId {
                    font-size: 12px !important;
                    color: #666 !important;
                    font-family: monospace !important;
                    background: #f1f3f4 !important;
                    padding: 2px 6px !important;
                    border-radius: 3px !important;
                    display: inline-block !important;
                }

                .mondayFinderNoResults {
                    padding: 20px !important;
                    text-align: center !important;
                    color: #999 !important;
                    font-style: italic !important;
                }

                #mondayFinderControls {
                    display: flex !important;
                    gap: 6px !important;
                    margin-bottom: 12px !important;
                    flex-wrap: wrap !important;
                }

                .mondayFinderBtn {
                    padding: 6px 10px !important;
                    border: none !important;
                    border-radius: 4px !important;
                    cursor: pointer !important;
                    font-size: 11px !important;
                    transition: background-color 0.2s !important;
                }

                .mondayFinderBtnPrimary {
                    background: #0073ea !important;
                    color: white !important;
                }

                .mondayFinderBtnPrimary:hover {
                    background: #005bb5 !important;
                }

                .mondayFinderBtnSecondary {
                    background: #e1e5e9 !important;
                    color: #333 !important;
                }

                .mondayFinderBtnSecondary:hover {
                    background: #d1d5d9 !important;
                }

                .mondayFinderBtnDanger {
                    background: #dc3545 !important;
                    color: white !important;
                }

                .mondayFinderBtnDanger:hover {
                    background: #c82333 !important;
                }

                .mondayFinderScanning {
                    animation: mondayFinderPulse 1.5s ease-in-out infinite !important;
                }

                @keyframes mondayFinderPulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.7; }
                    100% { opacity: 1; }
                }

                
                #mondayFinderToggler {
                    position: fixed !important;
                    bottom: 20px !important;
                    right: 20px !important;
                    width: 44px !important;
                    height: 44px !important;
                    border-radius: 22px !important;
                    background: #0073ea !important;
                    color: white !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
                    cursor: pointer !important;
                    z-index: 1000000 !important;
                    user-select: none !important;
                    font-size: 18px !important;
                }
                
                #mondayFinderToggler:hover {
                    background: #005bb5 !important;
                }
            `;

            // Injecter les styles
            const styleSheet = document.createElement('style');
            styleSheet.textContent = styles;
            document.head.appendChild(styleSheet);

            // Créer l'interface
            const toolHTML = `
                <div id="mondayColumnFinder">
                    <div id="mondayFinderDragHandle">🔍 Monday Column Finder<button id="mondayFinderMinimizeBtn" title="Réduire">−</button></div>
                    <div id="mondayFinderContent">
                        <div id="mondayFinderBoardInfo">
                            📋 Board: <strong>${this.currentBoardId || 'Aucun'}</strong>
                            ${this.columnDatabase.size > 0 ? `(${this.columnDatabase.size} colonnes)` : ''}
                        </div>
                        <div id="mondayFinderControls">
                            <button id="mondayFinderScanBtn" class="mondayFinderBtn mondayFinderBtnPrimary">Scan</button>
                            <button id="mondayFinderExportBtn" class="mondayFinderBtn mondayFinderBtnSecondary">Export All</button>
                            <button id="mondayFinderClearBtn" class="mondayFinderBtn mondayFinderBtnDanger">Clear</button>
                        </div>
                        <input type="text" id="mondayFinderSearch" placeholder="Rechercher par nom ou ID de colonne..." />
                        <div id="mondayFinderStatus">Initialisation...</div>
                        <div id="mondayFinderResults"></div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', toolHTML);
            this.toolElement = document.getElementById('mondayColumnFinder');

            // Masquer le widget par défaut
            this.toolElement.style.display = 'none';

            this.initializeDragAndDrop();
            this.bindEvents();
            this.updateBoardInfo();
            this.createTogglerButton();
        }

        updateBoardInfo() {
            const boardInfo = document.getElementById('mondayFinderBoardInfo');
            if (boardInfo) {
                boardInfo.innerHTML = `
                    📋 Board: <strong>${this.currentBoardId || 'Aucun'}</strong>
                    ${this.columnDatabase.size > 0 ? `(${this.columnDatabase.size} colonnes)` : ''}
                `;
            }
        }


        createTogglerButton() {
            if (document.getElementById('mondayFinderToggler')) return;
            const toggler = document.createElement('div');
            toggler.id = 'mondayFinderToggler';
            toggler.title = 'Afficher/Masquer Monday Column Finder';
            toggler.textContent = '🔍';
            toggler.addEventListener('click', () => this.toggleTool());
            document.body.appendChild(toggler);
        }

        toggleTool() {
            if (!this.toolElement) return;
            const isHidden = this.toolElement.style.display === 'none';
            this.toolElement.style.display = isHidden ? 'block' : 'none';
        }


        initializeDragAndDrop() {
            const handle = document.getElementById('mondayFinderDragHandle');

            handle.addEventListener('mousedown', (e) => {
                this.isDragging = true;
                const rect = this.toolElement.getBoundingClientRect();
                this.dragOffset.x = e.clientX - rect.left;
                this.dragOffset.y = e.clientY - rect.top;

                const mouseMoveHandler = (e) => this.handleMouseMove(e);
                const mouseUpHandler = () => this.handleMouseUp(mouseMoveHandler, mouseUpHandler);

                document.addEventListener('mousemove', mouseMoveHandler);
                document.addEventListener('mouseup', mouseUpHandler);

                e.preventDefault();
            });
        }

        handleMouseMove(e) {
            if (!this.isDragging) return;

            const newX = e.clientX - this.dragOffset.x;
            const newY = e.clientY - this.dragOffset.y;

            const maxX = window.innerWidth - this.toolElement.offsetWidth;
            const maxY = window.innerHeight - this.toolElement.offsetHeight;

            this.toolElement.style.left = Math.max(0, Math.min(newX, maxX)) + 'px';
            this.toolElement.style.top = Math.max(0, Math.min(newY, maxY)) + 'px';
            this.toolElement.style.right = 'auto';
        }

        handleMouseUp(mouseMoveHandler, mouseUpHandler) {
            this.isDragging = false;
            document.removeEventListener('mousemove', mouseMoveHandler);
            document.removeEventListener('mouseup', mouseUpHandler);
        }

        bindEvents() {
            const searchInput = document.getElementById('mondayFinderSearch');
            searchInput.addEventListener('input', (e) => {
                this.performSearch(e.target.value);
            });

            const minimizeBtn = document.getElementById('mondayFinderMinimizeBtn');
            if (minimizeBtn) {
                minimizeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleTool();
                });
            }

            const scanBtn = document.getElementById('mondayFinderScanBtn');
            if (scanBtn) {
                scanBtn.addEventListener('click', () => this.forceRescan());
            }

            const exportBtn = document.getElementById('mondayFinderExportBtn');
            if (exportBtn) {
                exportBtn.addEventListener('click', () => this.exportAllData());
            }

            const clearBtn = document.getElementById('mondayFinderClearBtn');
            if (clearBtn) {
                clearBtn.addEventListener('click', () => this.clearCurrentBoard());
            }
        }

        startScanning() {
            this.updateStatus('Démarrage du scanner...', true);

            // Scan initial
            this.scanColumns();

            // Scan périodique toutes les 5 secondes
            this.scanInterval = setInterval(() => {
                this.scanColumns();
            }, 5000);
        }

        scanColumns() {
            if (this.isScanning || !this.currentBoardId) return;

            this.isScanning = true;
            this.updateStatus('Scan en cours...', true);

            try {
                // Chercher dans les group-header-component au lieu des rows
                const headerElements = document.querySelectorAll('.group-header-component [class*="col-identifier-"]');
                let foundCount = 0;
                let newCount = 0;

                headerElements.forEach(element => {
                    const classList = Array.from(element.classList);
                    const colIdentifierClass = classList.find(cls => cls.startsWith('col-identifier-'));

                    if (colIdentifierClass) {
                        const columnId = colIdentifierClass.replace('col-identifier-', '');

                        // Chercher le nom de la colonne dans les headers avec les bons sélecteurs
                        const titleSelectors = [
                            'text2[data-testid="text"]',
                            '.column-title-editable text2[data-testid="text"]',
                            '.column-title text2',
                            '[data-testid="text"]',
                            '.typography_2a1e03a281',
                            'text2',
                            '.column-title',
                            '.heading_d9e5e57789'
                        ];

                        let titleElement = null;
                        for (const selector of titleSelectors) {
                            titleElement = element.querySelector(selector);
                            if (titleElement && titleElement.textContent.trim()) break;
                        }

                        if (titleElement) {
                            const columnName = titleElement.textContent.trim();

                            if (columnName && columnName !== columnId && columnName.length > 1) {
                                const isNew = !this.columnDatabase.has(columnId);

                                this.columnDatabase.set(columnId, {
                                    name: columnName,
                                    lastSeen: Date.now(),
                                    element: element
                                });

                                foundCount++;
                                if (isNew) newCount++;
                            }
                        }
                    }
                });

                // Auto-sauvegarde si nouvelles colonnes trouvées
                if (newCount > 0) {
                    this.saveBoardData();
                }

                this.updateStatus(`${this.columnDatabase.size} colonnes (${newCount} nouvelles)`, false);
                this.updateBoardInfo();

                // Mettre à jour l'affichage
                const searchValue = document.getElementById('mondayFinderSearch').value;
                if (searchValue) {
                    this.performSearch(searchValue);
                } else {
                    this.displayAllColumns();
                }

            } catch (error) {
                console.error('Erreur lors du scan:', error);
                this.updateStatus('Erreur lors du scan', false);
            }

            this.isScanning = false;
        }

        updateStatus(message, isScanning) {
            const statusElement = document.getElementById('mondayFinderStatus');
            if (!statusElement) return;

            const timestamp = new Date().toLocaleTimeString();
            statusElement.textContent = `${timestamp}: ${message}`;

            if (isScanning) {
                statusElement.classList.add('mondayFinderScanning');
            } else {
                statusElement.classList.remove('mondayFinderScanning');
            }
        }

        performSearch(query) {
            if (!query.trim()) {
                this.displayAllColumns();
                return;
            }

            const results = [];
            const lowerQuery = query.toLowerCase();

            this.columnDatabase.forEach((data, columnId) => {
                const nameMatch = data.name.toLowerCase().includes(lowerQuery);
                const idMatch = columnId.toLowerCase().includes(lowerQuery);

                if (nameMatch || idMatch) {
                    results.push({ id: columnId, ...data });
                }
            });

            // Trier par pertinence
            results.sort((a, b) => {
                const aExact = a.name.toLowerCase() === lowerQuery || a.id.toLowerCase() === lowerQuery;
                const bExact = b.name.toLowerCase() === lowerQuery || b.id.toLowerCase() === lowerQuery;

                if (aExact && !bExact) return -1;
                if (!aExact && bExact) return 1;
                return a.name.localeCompare(b.name);
            });

            this.displayResults(results);
        }

        displayAllColumns() {
            const results = Array.from(this.columnDatabase.entries()).map(([id, data]) => ({
                id,
                ...data
            })).sort((a, b) => a.name.localeCompare(b.name));

            this.displayResults(results);
        }

        displayResults(results) {
            const resultsContainer = document.getElementById('mondayFinderResults');
            if (!resultsContainer) return;

            if (results.length === 0) {
                resultsContainer.innerHTML = '<div class="mondayFinderNoResults">Aucune colonne trouvée</div>';
                return;
            }

            const html = results.map(result => `
                <div class="mondayFinderResultItem" data-id="${result.id}" title="Cliquer pour copier l'ID">
                    <div class="mondayFinderResultName">${this.escapeHtml(result.name)}</div>
                    <div class="mondayFinderResultId">${result.id}</div>
                </div>
            `).join('');

            resultsContainer.innerHTML = html;

            // Bind click handlers without inline attributes (CSP-friendly)
            resultsContainer.querySelectorAll('.mondayFinderResultItem').forEach((item) => {
                const id = item.getAttribute('data-id');
                item.addEventListener('click', () => this.copyToClipboard(id));
            });
        }

        escapeHtml(unsafe) {
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
                console.log(`✅ ID copié: ${text}`);

                // Feedback visuel
                const notification = document.createElement('div');
                notification.style.cssText = `
                    position: fixed !important;
                    top: 20px !important;
                    left: 50% !important;
                    transform: translateX(-50%) !important;
                    background: #4caf50 !important;
                    color: white !important;
                    padding: 10px 20px !important;
                    border-radius: 6px !important;
                    z-index: 1000000 !important;
                    font-family: Arial, sans-serif !important;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
                `;
                notification.textContent = `ID copié: ${text}`;
                document.body.appendChild(notification);

                setTimeout(() => {
                    document.body.removeChild(notification);
                }, 2000);

            }).catch(err => {
                console.error('Erreur lors de la copie:', err);
                // Fallback pour anciens navigateurs
                const textArea = document.createElement('textarea');
                textArea.value = text;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
            });
        }

        forceRescan() {
            console.log('🔄 Rescan forcé...');
            this.scanColumns();
        }

        clearCurrentBoard() {
            if (this.currentBoardId) {
                // Supprimer du localStorage
                const storageKey = `mondayColumnFinder_${this.currentBoardId}`;
                localStorage.removeItem(storageKey);
            }

            this.columnDatabase.clear();
            document.getElementById('mondayFinderSearch').value = '';
            document.getElementById('mondayFinderResults').innerHTML = '<div class="mondayFinderNoResults">Board effacé</div>';
            this.updateStatus('Board actuel effacé', false);
            this.updateBoardInfo();
            console.log(`🗑️ Board ${this.currentBoardId} effacé`);
        }

        exportAllData() {
            const allData = {};
            const savedBoards = this.getAllSavedBoards();

            savedBoards.forEach(board => {
                allData[board.boardId] = board.data;
            });

            // Ajouter le board actuel s'il n'est pas sauvegardé
            if (this.currentBoardId && this.columnDatabase.size > 0 && !allData[this.currentBoardId]) {
                allData[this.currentBoardId] = Object.fromEntries(
                    Array.from(this.columnDatabase.entries()).map(([id, info]) => [
                        id,
                        { name: info.name, lastSeen: info.lastSeen, boardId: this.currentBoardId }
                    ])
                );
            }

            console.log('📊 Export de tous les boards:', allData);

            const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `monday-all-boards-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        destroy() {
            // Sauvegarder avant de fermer
            if (this.currentBoardId && this.columnDatabase.size > 0) {
                this.saveBoardData();
            }

            if (this.scanInterval) {
                clearInterval(this.scanInterval);
            }

            if (this.toolElement) {
                this.toolElement.remove();
            }
            const toggler = document.getElementById('mondayFinderToggler');
            if (toggler) toggler.remove();

            // Nettoyer les styles
            const styleSheets = document.querySelectorAll('style');
            styleSheets.forEach(sheet => {
                if (sheet.textContent.includes('mondayColumnFinder')) {
                    sheet.remove();
                }
            });

            window.MondayColumnFinderInstance = null;
            console.log('🔍 Monday Column Finder désactivé (données sauvegardées)');
        }
    }

    // Créer l'instance
    window.MondayColumnFinderInstance = new MondayColumnFinder();
})();
