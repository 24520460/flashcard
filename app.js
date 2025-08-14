document.addEventListener('DOMContentLoaded', () => {
    // === DOM ELEMENTS ===
    const App = {
        views: {
            PROGRESS: document.getElementById('progress-view'),
            FLASHCARD: document.getElementById('flashcard-view'),
            COMPLETION: document.getElementById('deck-completion-message'),
            STATS: document.getElementById('stats-view')
        },
        deckSelector: document.getElementById('deck-selector'),
        cardContainer: document.getElementById('flashcard-container'),
        cardFront: document.getElementById('card-front-content'),
        cardBack: document.getElementById('card-back-content'),
        starCardBtn: document.getElementById('star-card-btn'),
        undoContainer: document.getElementById('undo-container'),
        searchBar: document.getElementById('search-bar'),
        themeToggleBtn: document.getElementById('theme-toggle-btn'),
        shuffleBtn: document.getElementById('shuffle-btn'),
        backgroundThemeSelector: document.getElementById('background-theme-selector'),
        usageTimeSpan: document.getElementById('usage-time'),
        modal: {
            container: document.getElementById('modal-container'),
            title: document.getElementById('modal-title'),
            saveBtn: document.getElementById('modal-save-btn'),
            deckNameSection: document.getElementById('modal-deck-name-section'),
            deckNameInput: document.getElementById('modal-deck-name-input'),
            cardDataSection: document.getElementById('modal-card-data-section'),
            cardDataInput: document.getElementById('modal-card-data-input'),
            excelFileInput: document.getElementById('excel-file-input')
        },
        mergeModal: {
            container: document.getElementById('merge-modal-container'),
            closeBtn: document.getElementById('close-merge-modal-btn'),
            saveBtn: document.getElementById('modal-save-group-btn'),
            groupNameInput: document.getElementById('modal-group-name-input'),
            deckList: document.getElementById('merge-deck-list')
        },
        manageCardsModal: {
            container: document.getElementById('manage-cards-modal'),
            deckName: document.getElementById('manage-cards-deck-name'),
            listContainer: document.getElementById('card-list-container'),
            deleteBtn: document.getElementById('delete-selected-cards-btn'),
        },
        confirmModal: {
            container: document.getElementById('confirm-modal'),
            title: document.getElementById('confirm-modal-title'),
            text: document.getElementById('confirm-modal-text'),
            okBtn: document.getElementById('confirm-modal-ok-btn'),
            cancelBtn: document.getElementById('confirm-modal-cancel-btn'),
        },
        stats: {
            chart: null,
            canvas: document.getElementById('stats-chart').getContext('2d'),
        }
    };

    // === STATE MANAGEMENT ===
    let appData = { decks: {}, deckGroups: {}, shuffledQueues: {}, savedSession: null }; // Thêm savedSession
    let statsHistory = [];
    let usageTracker = { intervalId: null, lastDate: null };
    let currentDeckName = null;
    let sessionQueue = [];
    let learningCardsQueue = [];
    let currentCard = null;
    let isFlipped = false;
    let isShuffleMode = false;
    let actionHistory = [];
    let editContext = { type: null, deckName: null, cardId: null };
    let lastChartData = null;
    let lastDeckSelectorState = null;

    // === CORE FUNCTIONS ===
    const debounce = (func, wait) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    };

    const saveData = debounce(() => {
        // Lưu trạng thái phiên học nếu đang có
        if (currentDeckName && sessionQueue.length > 0) {
            appData.savedSession = {
                deckName: currentDeckName,
                sessionQueueIds: sessionQueue.map(card => ({ id: card.id, originalDeck: card.originalDeck })),
                learningCardsQueueIds: learningCardsQueue.map(card => ({ id: card.id, originalDeck: card.originalDeck })),
                currentCardId: currentCard ? { id: currentCard.id, originalDeck: currentCard.originalDeck } : null,
                isShuffleMode: isShuffleMode
            };
        } else if (appData.savedSession) {
            // Xóa phiên đã lưu nếu không còn phiên nào đang hoạt động
            appData.savedSession = null;
        }

        localStorage.setItem('flashcardAppUltimate', JSON.stringify(appData));
        logDailyStats();
    }, 300);

    const loadData = () => {
        const savedData = localStorage.getItem('flashcardAppUltimate');
        appData = savedData ? JSON.parse(savedData) : { decks: {}, deckGroups: {}, shuffledQueues: {}, savedSession: null };
        if (!appData.deckGroups) appData.deckGroups = {};
        if (!appData.shuffledQueues) appData.shuffledQueues = {};
        if (!appData.savedSession) appData.savedSession = null; // Đảm bảo savedSession tồn tại

        Object.values(appData.decks).forEach(deck => {
            deck.forEach(card => {
                if (card.status === undefined) card.status = 'not-studied';
                if (card.correctStreak === undefined) card.correctStreak = 0;
                if (card.nextReview === undefined) card.nextReview = null;
                if (card.interval === undefined) card.interval = 1;
            });
        });
        const savedTheme = localStorage.getItem('flashcardTheme');
        if (savedTheme === 'dark') document.body.classList.add('dark-mode');
        const savedBackground = localStorage.getItem('flashcardBackground');
        if (savedBackground) {
            document.body.className = `theme-${savedBackground} ${savedTheme === 'dark' ? 'dark-mode' : ''}`;
            App.backgroundThemeSelector.value = savedBackground;
        }
        const savedStats = localStorage.getItem('flashcardStatsHistory');
        statsHistory = savedStats ? JSON.parse(savedStats) : [];
        if (localStorage.getItem('flashcardShuffleMode') === 'true') {
            isShuffleMode = true;
            App.shuffleBtn.classList.add('active');
        }
    };

    const switchView = (viewToShow) => {
        Object.values(App.views).forEach(view => view.classList.add('hidden'));
        document.body.classList.toggle('flashcard-view-active', viewToShow === App.views.FLASHCARD);
        if (viewToShow) viewToShow.classList.remove('hidden');
    };
    
    // Hàm tìm thẻ dựa trên ID và deck gốc
    const findCardById = (cardId, originalDeck) => {
        if (appData.decks[originalDeck]) {
            return appData.decks[originalDeck].find(c => c.id === cardId);
        }
        return null;
    };

    // === DECK & GROUP MANAGEMENT ===
    const populateDeckSelector = () => {
        const currentState = JSON.stringify([Object.keys(appData.decks), Object.keys(appData.deckGroups)]);
        if (lastDeckSelectorState === currentState) return;
        lastDeckSelectorState = currentState;
        // Ưu tiên chọn deck đã lưu trong phiên trước
        const selectedValue = (appData.savedSession && appData.savedSession.deckName) ? appData.savedSession.deckName : App.deckSelector.value || currentDeckName;
        App.deckSelector.innerHTML = '<option value="">-- Chọn Bộ Thẻ / Nhóm Thẻ --</option>';
        const deckNames = Object.keys(appData.decks).sort();
        if (deckNames.length > 0) {
            const regularGroup = document.createElement('optgroup');
            regularGroup.label = 'Bộ Thẻ Đơn';
            deckNames.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                regularGroup.appendChild(option);
            });
            App.deckSelector.appendChild(regularGroup);
        }
        const groupNames = Object.keys(appData.deckGroups).sort();
        if (groupNames.length > 0) {
            const mergedGroup = document.createElement('optgroup');
            mergedGroup.label = 'Nhóm Thẻ Gộp';
            groupNames.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = `[Gộp] ${name}`;
                option.dataset.isGroup = "true";
                mergedGroup.appendChild(option);
            });
            App.deckSelector.appendChild(mergedGroup);
        }
        if (appData.decks[selectedValue] || appData.deckGroups[selectedValue]) {
            App.deckSelector.value = selectedValue;
        } else {
             App.deckSelector.value = "";
        }
    };

    const selectDeck = (deckName) => {
        currentDeckName = deckName;
        App.searchBar.value = '';
        const isGroup = appData.deckGroups && appData.deckGroups[deckName];
        if (isGroup) {
            const validMemberDecks = appData.deckGroups[deckName].filter(deck => appData.decks[deck]);
            if (appData.deckGroups[deckName].length > 0 && validMemberDecks.length === 0) {
                alert("Nhóm này không chứa bộ thẻ hợp lệ nào (có thể các bộ thẻ con đã bị xoá).");
                appData.deckGroups[deckName] = [];
                saveData();
            }
        }
        if (!deckName || (!appData.decks[deckName] && !isGroup)) {
            switchView(null);
            document.getElementById('edit-deck-btn').disabled = true;
            document.getElementById('delete-deck-btn').disabled = true;
            document.getElementById('unmerge-deck-btn').disabled = true;
            return;
        }
        document.getElementById('edit-deck-btn').disabled = isGroup;
        document.getElementById('delete-deck-btn').disabled = isGroup;
        document.getElementById('unmerge-deck-btn').disabled = !isGroup;
        updateProgressView();
        switchView(App.views.PROGRESS);
    };

    const deleteCurrentDeck = () => {
        if (!currentDeckName || appData.deckGroups[currentDeckName]) return;
        showConfirmModal(`Bạn có chắc chắn muốn xóa bộ thẻ "${currentDeckName}" không? Thao tác này không thể hoàn tác.`, () => {
            delete appData.decks[currentDeckName];
            delete appData.shuffledQueues[currentDeckName]; 
            // Xóa phiên đã lưu nếu nó liên quan đến deck này
            if (appData.savedSession && appData.savedSession.deckName === currentDeckName) {
                appData.savedSession = null;
            }
            Object.keys(appData.deckGroups).forEach(groupName => {
                appData.deckGroups[groupName] = appData.deckGroups[groupName].filter(d => d !== currentDeckName);
            });
            saveData();
            lastDeckSelectorState = null;
            populateDeckSelector();
            selectDeck("");
        });
    };

    const resetCurrentDeckStatus = () => {
        if (!currentDeckName) return;
        showConfirmModal(`Bạn có muốn reset lại toàn bộ tiến độ học của "${currentDeckName}" không? Tất cả các thẻ sẽ trở về trạng thái "Chưa học".`, () => {
            const isGroup = appData.deckGroups && appData.deckGroups[currentDeckName];
            const decksToReset = isGroup ? appData.deckGroups[currentDeckName] : [currentDeckName];
            decksToReset.forEach(deckName => {
                if (appData.decks[deckName]) {
                    appData.decks[deckName].forEach(card => {
                        card.status = 'not-studied';
                        card.correctStreak = 0;
                        card.nextReview = null;
                        card.interval = 1;
                    });
                }
                delete appData.shuffledQueues[deckName]; 
            });
            if (isGroup) delete appData.shuffledQueues[currentDeckName]; 
            // Xóa phiên đã lưu nếu nó liên quan đến deck này
            if (appData.savedSession && appData.savedSession.deckName === currentDeckName) {
                appData.savedSession = null;
            }
            
            saveData();
            updateProgressView();
            alert("Đã reset tiến độ thành công!");
        });
    };

    // === PROGRESS & REVIEW SESSION ===
    const updateProgressView = () => {
        if (!currentDeckName) return;
        let stats = { 'not-studied': 0, 'learning': 0, 'mastered': 0, 'starred': 0 };
        const isGroup = appData.deckGroups && appData.deckGroups[currentDeckName];
        let deckDisplayName = currentDeckName;
        let totalCards = 0;
        
        const processCardStats = (card) => {
            stats[card.status] = (stats[card.status] || 0) + 1;
            if (card.starred) stats.starred++;
            totalCards++;
        };

        if (isGroup) {
            deckDisplayName = `[Nhóm] ${currentDeckName}`;
            appData.deckGroups[currentDeckName].forEach(deckName => {
                if (appData.decks[deckName]) {
                    appData.decks[deckName].forEach(processCardStats);
                }
            });
        } else if (appData.decks[currentDeckName]) {
            appData.decks[currentDeckName].forEach(processCardStats);
        }

        document.getElementById('progress-deck-name').textContent = deckDisplayName;
        document.getElementById('not-studied-count').textContent = stats['not-studied'];
        document.getElementById('learning-count').textContent = stats['learning'];
        document.getElementById('mastered-count').textContent = stats['mastered'];

        const startReviewBtn = document.getElementById('start-review-btn');
        // Cập nhật button text nếu có một session đã lưu cho deck hiện tại
        const savedSessionForCurrentDeck = appData.savedSession && appData.savedSession.deckName === currentDeckName;
        if (savedSessionForCurrentDeck && appData.savedSession.sessionQueueIds.length > 0) {
            startReviewBtn.textContent = `Tiếp tục ôn (${appData.savedSession.sessionQueueIds.length} thẻ)`;
        } else {
            startReviewBtn.textContent = `Bắt đầu ôn tập`;
        }
        startReviewBtn.disabled = totalCards === 0;

        const reviewStarredBtn = document.getElementById('review-starred-btn');
        reviewStarredBtn.textContent = `Ôn thẻ quan trọng (${stats.starred} ⭐️)`;
        reviewStarredBtn.disabled = stats.starred === 0;
    };
    
    const startReviewSession = (cardsToReview = null) => {
        actionHistory = []; // Reset lịch sử hành động cho phiên mới

        const isNormalSession = !cardsToReview;

        if (isNormalSession) {
            if (appData.savedSession && appData.savedSession.deckName === currentDeckName) {
                // Tái tạo sessionQueue và learningCardsQueue từ ID đã lưu
                sessionQueue = appData.savedSession.sessionQueueIds
                    .map(idObj => findCardById(idObj.id, idObj.originalDeck))
                    .filter(Boolean)
                    .map(card => ({ ...card, originalDeck: card.originalDeck || currentDeckName }));

                learningCardsQueue = appData.savedSession.learningCardsQueueIds
                    .map(idObj => findCardById(idObj.id, idObj.originalDeck))
                    .filter(Boolean)
                    .map(card => ({ ...card, originalDeck: card.originalDeck || currentDeckName }));

                isShuffleMode = appData.savedSession.isShuffleMode;
                App.shuffleBtn.classList.toggle('active', isShuffleMode);

                currentCard = appData.savedSession.currentCardId 
                    ? ({ ...findCardById(appData.savedSession.currentCardId.id, appData.savedSession.currentCardId.originalDeck), originalDeck: appData.savedSession.currentCardId.originalDeck || currentDeckName })
                    : null;
                
                if (currentCard) {
                    sessionQueue.unshift(currentCard); // Đặt lại thẻ hiện tại vào đầu hàng đợi
                }
                
            } else if (isShuffleMode) {
                // Logic tạo hàng đợi mới khi có shuffle mode và không có phiên lưu
                const decks = (appData.deckGroups && appData.deckGroups[currentDeckName]) ? appData.deckGroups[currentDeckName] : [currentDeckName];
                decks.forEach(deckName => {
                    if (appData.decks[deckName]) {
                        const notStudiedCards = appData.decks[deckName]
                            .filter(card => card.status === 'not-studied')
                            .map(card => ({ ...card, originalDeck: deckName }));
                        sessionQueue.push(...notStudiedCards);
                    }
                });
                if (sessionQueue.length > 0) {
                    sessionQueue.sort(() => Math.random() - 0.5);
                }
            } else {
                // Logic tạo hàng đợi mới cho non-shuffled
                const decks = (appData.deckGroups && appData.deckGroups[currentDeckName]) ? appData.deckGroups[currentDeckName] : [currentDeckName];
                decks.forEach(deckName => {
                    if (appData.decks[deckName]) {
                        sessionQueue.push(...appData.decks[deckName].map(card => ({ ...card, originalDeck: deckName })));
                    }
                });
            }
        } else { // Xử lý cardsToReview (thẻ sao, tìm kiếm)
            sessionQueue = cardsToReview.map(card => {
                if (!card.originalDeck) {
                    for (const deckName in appData.decks) {
                        if (appData.decks[deckName].some(c => c.id === card.id)) return { ...card, originalDeck: deckName };
                    }
                }
                return card;
            });
            if (isShuffleMode) { 
                sessionQueue.sort(() => Math.random() - 0.5);
            }
            // Không lưu sessionQueue cho các phiên đặc biệt (starred, search)
            appData.savedSession = null; 
            saveData();
        }
        
        if (sessionQueue.length > 0) {
            switchView(App.views.FLASHCARD);
            nextCard();
        } else {
            alert("Không có thẻ nào để ôn tập trong lựa chọn này.");
            appData.savedSession = null; // Clear session if nothing to review
            saveData();
        }
    };
    
    // === FLASHCARD LOGIC ===
    const nextCard = () => {
        App.undoContainer.classList.toggle('hidden', actionHistory.length === 0);
        
        if (sessionQueue.length > 0) {
            currentCard = sessionQueue.shift();
        } else if (learningCardsQueue.length > 0) {
            sessionQueue = [...learningCardsQueue];
            learningCardsQueue = [];
            if (isShuffleMode) sessionQueue.sort(() => Math.random() - 0.5);
            nextCard(); // Gọi lại nextCard để hiển thị thẻ tiếp theo từ learningCardsQueue
            return; // Tránh saveData 2 lần liên tiếp
        } else {
            appData.savedSession = null; // Xóa phiên đã lưu khi hoàn thành
            switchView(App.views.COMPLETION);
            updateProgressView();
        }
        saveData(); // Luôn lưu trạng thái sau mỗi thay đổi thẻ
        if (currentCard) {
            displayCard(currentCard);
        }
    };

    const displayCard = (card) => {
        if (isFlipped) {
            App.cardContainer.classList.remove('is-flipped');
            isFlipped = false;
        }
        App.starCardBtn.classList.toggle('starred', !!card.starred);
        setTimeout(() => {
            App.cardFront.textContent = card.front;
            App.cardBack.textContent = card.back;
        }, 150);
    };

    const flipCard = () => {
        if (!currentCard) return;
        isFlipped = !isFlipped;
        App.cardContainer.classList.toggle('is-flipped', isFlipped);
    };

    const processCardReview = (performance) => {
        if (!currentCard) return;
        const originDeckName = currentCard.originalDeck || currentDeckName;
        if (!appData.decks[originDeckName]) return;
        const cardInDeck = appData.decks[originDeckName].find(c => c.id === currentCard.id);
        if (!cardInDeck) return;
        
        actionHistory.unshift({ 
            cardBefore: JSON.parse(JSON.stringify(cardInDeck)), // Sao chép sâu để lưu trạng thái trước khi thay đổi
            deckName: originDeckName
        });
        if (actionHistory.length > 5) actionHistory.pop(); // Giới hạn lịch sử undo

        if (performance === 'forgot') {
            cardInDeck.status = 'learning';
            cardInDeck.correctStreak = 0;
            learningCardsQueue.push(currentCard); // Đưa thẻ vào hàng đợi học lại
        } else { // 'known'
            if (cardInDeck.status === 'not-studied' || cardInDeck.status === 'learning') {
                cardInDeck.status = 'mastered';
            }
        }
        nextCard();
    };
    
    const undoAction = () => {
        if (actionHistory.length === 0) return;
        const lastAction = actionHistory.shift(); 
        const { cardBefore, deckName } = lastAction;
        const deck = appData.decks[deckName];
        if (!deck) return;

        const cardIndex = deck.findIndex(c => c.id === cardBefore.id);
        if (cardIndex > -1) {
            // Khôi phục thẻ về trạng thái trước đó
            deck[cardIndex] = cardBefore;

            // Xử lý currentCard và sessionQueue
            if (currentCard) {
                // Đặt thẻ hiện tại trở lại đầu sessionQueue (nếu có)
                sessionQueue.unshift(currentCard);
            }
            // Đặt thẻ đã undo trở lại đầu sessionQueue
            sessionQueue.unshift({ ...deck[cardIndex], originalDeck: deckName });

            // Loại bỏ thẻ đã undo khỏi learningCardsQueue nếu nó nằm trong đó
            const learningIndex = learningCardsQueue.findIndex(c => c.id === cardBefore.id);
            if(learningIndex > -1) learningCardsQueue.splice(learningIndex, 1);
            
            saveData(); // Lưu lại trạng thái mới
            displayCard(sessionQueue[0]); // Hiển thị thẻ vừa undo
            currentCard = sessionQueue.shift(); // Gán currentCard là thẻ vừa undo
            App.undoContainer.classList.toggle('hidden', actionHistory.length === 0);
        }
    };

    const toggleStarCurrentCard = () => {
        if (!currentCard) return;
        const originDeckName = currentCard.originalDeck || currentDeckName;
        if (!appData.decks[originDeckName]) return;
        const cardInDeck = appData.decks[originDeckName].find(c => c.id === currentCard.id);
        if (cardInDeck) {
            cardInDeck.starred = !cardInDeck.starred;
            currentCard.starred = cardInDeck.starred; // Cập nhật thẻ trong phiên hiện tại
            App.starCardBtn.classList.toggle('starred', cardInDeck.starred);
            saveData();
        }
    };

    const deleteCurrentCard = () => {
        if (!currentCard) return;
        const originDeckName = currentCard.originalDeck || currentDeckName;
        if (!appData.decks[originDeckName]) return;
        const deck = appData.decks[originDeckName];
        const cardIndex = deck.findIndex(c => c.id === currentCard.id);
        if (cardIndex > -1) {
            showConfirmModal(`Xóa thẻ: "${deck[cardIndex].front}" khỏi bộ "${originDeckName}"?`, () => {
                deck.splice(cardIndex, 1);
                // Cần đảm bảo thẻ này cũng bị xóa khỏi savedSession nếu nó tồn tại
                if (appData.savedSession && appData.savedSession.deckName === currentDeckName) {
                    appData.savedSession.sessionQueueIds = appData.savedSession.sessionQueueIds.filter(idObj => idObj.id !== currentCard.id);
                    appData.savedSession.learningCardsQueueIds = appData.savedSession.learningCardsQueueIds.filter(idObj => idObj.id !== currentCard.id);
                    if (appData.savedSession.currentCardId && appData.savedSession.currentCardId.id === currentCard.id) {
                        appData.savedSession.currentCardId = null;
                    }
                }
                saveData();
                nextCard(); // Chuyển đến thẻ tiếp theo
            });
        }
    };
    
    // === MODAL & EDITING LOGIC ===
    const handleExcelFile = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                const cardDataString = rows
                    .map(row => {
                        const front = row[0] ? String(row[0]).trim() : '';
                        const back = row[1] ? String(row[1]).trim() : '';
                        if (front && back) {
                            return `${front} - ${back}`;
                        }
                        return null;
                    })
                    .filter(Boolean)
                    .join('\n');

                if (cardDataString) {
                    App.modal.cardDataInput.value = cardDataString;
                } else {
                    alert('Không tìm thấy dữ liệu hợp lệ trong file Excel. File cần có ít nhất 2 cột (Mặt trước, Mặt sau).');
                    e.target.value = '';
                }
            } catch (error) {
                console.error("Lỗi khi đọc file Excel:", error);
                alert('Đã xảy ra lỗi khi xử lý file Excel của bạn.');
                e.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const openModal = (type, deckName, cardId = null) => {
        editContext = { type, deckName, cardId };
        App.modal.container.classList.remove('hidden');
        App.modal.deckNameInput.value = '';
        App.modal.cardDataInput.value = '';
        App.modal.excelFileInput.value = '';
        const excelLabel = document.querySelector('label[for="excel-file-input"]');
        App.modal.deckNameSection.classList.toggle('hidden', type === 'editCard');
        App.modal.cardDataSection.classList.toggle('hidden', type === 'editDeck');
        if (excelLabel) excelLabel.classList.remove('hidden');
        App.modal.excelFileInput.classList.remove('hidden');

        if (type === 'addDeck') {
            App.modal.title.textContent = 'Tạo Bộ Thẻ Mới';
            App.modal.cardDataInput.placeholder = "Mặt trước - Mặt sau\nHello - Xin chào...";
        } else if (type === 'editDeck') {
            App.modal.title.textContent = 'Đổi Tên Bộ Thẻ';
            App.modal.deckNameInput.value = deckName;
        } else if (type === 'editCard') {
            App.modal.title.textContent = 'Sửa Thẻ';
            const originDeckName = currentCard.originalDeck || deckName;
            const card = appData.decks[originDeckName].find(c => c.id === cardId);
            editContext.deckName = originDeckName;
            if (card) App.modal.cardDataInput.value = `${card.front} - ${card.back}`;
            if (excelLabel) excelLabel.classList.add('hidden');
            App.modal.excelFileInput.classList.add('hidden');
        }
    };

    const closeModal = () => App.modal.container.classList.add('hidden');

    const handleSave = () => {
        const { type, deckName, cardId } = editContext;
        const parseCardLine = (line) => {
            const separators = ['\t', ' - '];
            for (const sep of separators) {
                const index = line.indexOf(sep);
                if (index !== -1) {
                    const front = line.substring(0, index).trim();
                    const back = line.substring(index + sep.length).trim();
                    if (front && back) return { front, back };
                }
            }
            return null;
        };
    
        if (type === 'addDeck' || type === 'editDeck') {
            const newName = App.modal.deckNameInput.value.trim();
            if (!newName) return alert('Vui lòng nhập tên.');
            if ((appData.decks[newName] || appData.deckGroups[newName]) && (type === 'addDeck' || (type === 'editDeck' && newName !== deckName))) {
                return alert('Tên này đã tồn tại.');
            }
    
            if (type === 'addDeck') {
                const data = App.modal.cardDataInput.value.trim();
                if (!data) return alert('Vui lòng nhập dữ liệu thẻ hoặc tải lên file Excel hợp lệ.');
                const newDeck = data.split('\n').map((line, index) => {
                    const parts = parseCardLine(line);
                    if (!parts) return null;
                    return {
                        id: `${Date.now()}-${index}`, front: parts.front, back: parts.back, status: 'not-studied', correctStreak: 0, starred: false, nextReview: null, interval: 1
                    };
                }).filter(Boolean);
                if (newDeck.length === 0) return alert('Không tìm thấy thẻ hợp lệ. Vui lòng dùng định dạng "Mặt trước - Mặt sau" hoặc "Mặt trước <tab> Mặt sau".');
                appData.decks[newName] = newDeck;
                currentDeckName = newName;
            } else { // editDeck
                appData.decks[newName] = appData.decks[deckName];
                delete appData.decks[deckName];
                // Cập nhật savedSession nếu deck được đổi tên là deck hiện tại
                if (appData.savedSession && appData.savedSession.deckName === deckName) {
                    appData.savedSession.deckName = newName;
                }
                delete appData.shuffledQueues[deckName];
                Object.keys(appData.deckGroups).forEach(groupName => {
                    const index = appData.deckGroups[groupName].indexOf(deckName);
                    if (index > -1) appData.deckGroups[groupName][index] = newName;
                });
                currentDeckName = newName;
            }
        } else if (type === 'editCard') {
            const data = App.modal.cardDataInput.value.trim();
            const parts = parseCardLine(data);
            if (!parts) return alert('Dữ liệu thẻ không hợp lệ. Vui lòng dùng định dạng "Mặt trước - Mặt sau".');
            
            const card = appData.decks[deckName].find(c => c.id === cardId);
            if (card) {
                card.front = parts.front;
                card.back = parts.back;
                if (currentCard && currentCard.id === cardId) {
                    currentCard.front = card.front;
                    currentCard.back = card.back;
                }
                // Cập nhật thẻ trong savedSession nếu nó tồn tại
                if (appData.savedSession && appData.savedSession.deckName === currentDeckName) {
                    const sessionCard = appData.savedSession.sessionQueueIds.find(c => c.id === cardId);
                    if (sessionCard) {
                        // Lưu ý: Chúng ta chỉ lưu ID và originalDeck trong sessionQueueIds,
                        // nên không cần cập nhật front/back ở đây. Nó sẽ được cập nhật
                        // khi thẻ được tái tạo từ appData.decks.
                    }
                    const learningCard = appData.savedSession.learningCardsQueueIds.find(c => c.id === cardId);
                    if (learningCard) {
                        // Tương tự như trên
                    }
                }
                if (!App.views.FLASHCARD.classList.contains('hidden')) displayCard(currentCard);
            }
        }
        saveData();
        lastDeckSelectorState = null;
        populateDeckSelector();
        selectDeck(currentDeckName);
        closeModal();
    };

    // === MERGE/UNMERGE GROUP LOGIC ===
    const openMergeModal = () => {
        App.mergeModal.container.classList.remove('hidden');
        App.mergeModal.groupNameInput.value = '';
        App.mergeModal.deckList.innerHTML = '';
        Object.keys(appData.decks).sort().forEach(deckName => {
            const item = document.createElement('div');
            item.className = 'merge-deck-item';
            item.innerHTML = `<input type="checkbox" id="merge-${deckName}" value="${deckName}"><label for="merge-${deckName}">${deckName}</label>`;
            App.mergeModal.deckList.appendChild(item);
        });
    };
    const closeMergeModal = () => App.mergeModal.container.classList.add('hidden');
    const handleSaveGroup = () => {
        const groupName = App.mergeModal.groupNameInput.value.trim();
        if (!groupName || appData.decks[groupName] || appData.deckGroups[groupName]) {
            return alert('Vui lòng nhập tên hợp lệ và chưa tồn tại.');
        }
        const selectedDecks = Array.from(App.mergeModal.deckList.querySelectorAll('input:checked')).map(input => input.value);
        if (selectedDecks.length < 2) return alert('Bạn phải chọn ít nhất 2 bộ thẻ.');
        
        appData.deckGroups[groupName] = selectedDecks;
        saveData();
        lastDeckSelectorState = null;
        populateDeckSelector();
        selectDeck(groupName);
        closeMergeModal();
    };
    const deleteCurrentGroup = () => {
        if (!currentDeckName || !appData.deckGroups[currentDeckName]) return;
        showConfirmModal(`Bạn có chắc muốn xóa nhóm "${currentDeckName}" không? (Các bộ thẻ con sẽ không bị ảnh hưởng)`, () => {
            delete appData.deckGroups[currentDeckName];
            delete appData.shuffledQueues[currentDeckName];
            // Xóa phiên đã lưu nếu nó liên quan đến nhóm này
            if (appData.savedSession && appData.savedSession.deckName === currentDeckName) {
                appData.savedSession = null;
            }
            saveData();
            lastDeckSelectorState = null;
            currentDeckName = null;
            populateDeckSelector();
            selectDeck("");
        });
    };
    
    // === ADVANCED CARD MANAGEMENT ===
    const openManageCardsModal = () => {
        if (!currentDeckName) return;
        App.manageCardsModal.deckName.textContent = currentDeckName;
        App.manageCardsModal.listContainer.innerHTML = '';
        const isGroup = appData.deckGroups[currentDeckName];
        const decksToShow = isGroup ? appData.deckGroups[currentDeckName] : [currentDeckName];
        decksToShow.forEach(deckName => {
            if (!appData.decks[deckName]) return;
            if(isGroup) {
                const groupTitle = document.createElement('h4');
                groupTitle.textContent = deckName;
                App.manageCardsModal.listContainer.appendChild(groupTitle);
            }
            appData.decks[deckName].forEach(card => {
                const item = document.createElement('div');
                item.className = 'manage-card-item';
                item.innerHTML = `
                    <input type="checkbox" id="manage-${card.id}" value="${card.id}" data-deck="${deckName}">
                    <label for="manage-${card.id}">${card.front} - ${card.back}</label>
                `;
                App.manageCardsModal.listContainer.appendChild(item);
            });
        });
        App.manageCardsModal.container.classList.remove('hidden');
    };
    const deleteSelectedCards = () => {
        const selectedCheckboxes = App.manageCardsModal.listContainer.querySelectorAll('input:checked');
        if(selectedCheckboxes.length === 0) return alert('Vui lòng chọn ít nhất một thẻ để xóa.');
        showConfirmModal(`Bạn có chắc chắn muốn xóa ${selectedCheckboxes.length} thẻ đã chọn không?`, () => {
            let decksWithChanges = new Set();
            let deletedCardIds = new Set(); // Theo dõi ID của các thẻ bị xóa
            selectedCheckboxes.forEach(input => {
                const deckName = input.dataset.deck;
                const cardId = input.value;
                decksWithChanges.add(deckName);
                deletedCardIds.add(cardId);
                const deck = appData.decks[deckName];
                if (deck) {
                    const cardIndex = deck.findIndex(c => c.id === cardId);
                    if (cardIndex > -1) deck.splice(cardIndex, 1);
                }
            });
            // Hủy bỏ hàng đợi đã lưu cho bất kỳ deck nào bị sửa đổi
            decksWithChanges.forEach(deckName => delete appData.shuffledQueues[deckName]);
            if (appData.deckGroups[currentDeckName]) delete appData.shuffledQueues[currentDeckName];
            
            // Cập nhật savedSession để loại bỏ các thẻ đã xóa
            if (appData.savedSession && appData.savedSession.deckName === currentDeckName) {
                appData.savedSession.sessionQueueIds = appData.savedSession.sessionQueueIds.filter(idObj => !deletedCardIds.has(idObj.id));
                appData.savedSession.learningCardsQueueIds = appData.savedSession.learningCardsQueueIds.filter(idObj => !deletedCardIds.has(idObj.id));
                if (appData.savedSession.currentCardId && deletedCardIds.has(appData.savedSession.currentCardId.id)) {
                    appData.savedSession.currentCardId = null;
                }
            }

            saveData();
            updateProgressView();
            App.manageCardsModal.container.classList.add('hidden');
        });
    };

    // === CUSTOM CONFIRM MODAL ===
    const showConfirmModal = (message, onConfirm) => {
        App.confirmModal.text.textContent = message;
        App.confirmModal.container.classList.remove('hidden');
        const confirmHandler = () => { onConfirm(); cleanup(); };
        const cancelHandler = () => cleanup();
        const cleanup = () => {
            App.confirmModal.container.classList.add('hidden');
            App.confirmModal.okBtn.removeEventListener('click', confirmHandler);
            App.confirmModal.cancelBtn.removeEventListener('click', cancelHandler);
        };
        App.confirmModal.okBtn.addEventListener('click', confirmHandler);
        App.confirmModal.cancelBtn.addEventListener('click', cancelHandler);
    };

    // === DATA & THEME ===
    const toggleTheme = () => {
        const isDark = document.body.classList.toggle('dark-mode');
        localStorage.setItem('flashcardTheme', isDark ? 'dark' : 'light');
    };
    const changeBackgroundTheme = (themeName) => {
        document.body.className = document.body.className.replace(/theme-[\w-]+/g, '').trim();
        if (themeName !== 'default') document.body.classList.add(`theme-${themeName}`);
        localStorage.setItem('flashcardBackground', themeName);
    };
    const toggleShuffleMode = () => {
        isShuffleMode = !isShuffleMode;
        App.shuffleBtn.classList.toggle('active', isShuffleMode);
        localStorage.setItem('flashcardShuffleMode', isShuffleMode);
        // Nếu tắt chế độ xáo trộn, xóa các phiên đã lưu
        if (!isShuffleMode) {
            showConfirmModal("Bạn đã tắt chế độ xáo trộn. Bạn có muốn xóa tất cả các phiên học xáo trộn đang dang dở không?", () => {
                appData.shuffledQueues = {}; // Xóa tất cả các shuffled queues
                appData.savedSession = null; // Xóa phiên đang hoạt động nếu có
                saveData();
                updateProgressView();
                alert("Đã xóa các phiên học dang dở.");
            });
        }
        updateProgressView();
    };
    const exportData = () => {
        const dataStr = JSON.stringify(appData, null, 2);
        const blob = new Blob([dataStr], {type: "application/json"});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `flashcards_backup_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    };
    const importData = () => {
        const fileInput = document.getElementById('import-file-input');
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            showConfirmModal("Thao tác này sẽ GHI ĐÈ toàn bộ dữ liệu hiện tại. Bạn có chắc chắn?", () => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const importedData = JSON.parse(event.target.result);
                        const isValid = importedData && importedData.decks && Object.values(importedData.decks).every(deck => Array.isArray(deck) && deck.every(card => card.id && typeof card.front === 'string' && typeof card.back === 'string'));
                        if (isValid) {
                            appData = importedData;
                            if (!appData.deckGroups) appData.deckGroups = {};
                            if (!appData.shuffledQueues) appData.shuffledQueues = {};
                            if (!appData.savedSession) appData.savedSession = null; // Đảm bảo savedSession tồn tại
                            saveData();
                            lastDeckSelectorState = null;
                            loadData(); // Tải lại dữ liệu (bao gồm cả savedSession)
                            populateDeckSelector();
                            selectDeck(Object.keys(appData.decks)[0] || Object.keys(appData.deckGroups)[0] || "");
                            alert("Nhập dữ liệu thành công!");
                        } else {
                            alert("File JSON không hợp lệ. Vui lòng kiểm tra định dạng.");
                        }
                    } catch {
                        alert("Lỗi khi đọc file. File có thể bị hỏng hoặc không đúng định dạng JSON.");
                    }
                };
                reader.readAsText(file);
            });
        };
        fileInput.click();
    };

    const handleSearch = (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (!query) {
            selectDeck(currentDeckName);
            document.getElementById('start-review-btn').onclick = () => startReviewSession();
            return;
        }
        const results = [];
        for (const deckName in appData.decks) {
            if (deckName.toLowerCase().includes(query)) {
                results.push(...appData.decks[deckName].map(card => ({...card, originalDeck: deckName})));
            } else {
                appData.decks[deckName].forEach(card => {
                    if (card.front.toLowerCase().includes(query) || card.back.toLowerCase().includes(query) || (query === 'starred' && card.starred) || (query === card.status)) {
                        results.push({...card, originalDeck: deckName});
                    }
                });
            }
        }
        const uniqueResults = Array.from(new Map(results.map(item => [item['id'], item])).values());
        document.getElementById('progress-deck-name').textContent = `Kết quả tìm kiếm: "${query}" (${uniqueResults.length})`;
        document.getElementById('start-review-btn').disabled = uniqueResults.length === 0;
        document.getElementById('review-starred-btn').disabled = true;
        switchView(App.views.PROGRESS);
        if (uniqueResults.length > 0) {
            document.getElementById('start-review-btn').onclick = () => startReviewSession(uniqueResults);
        }
    };
    
    // === STATS & CHART ===
    const logDailyStats = () => {
        const today = new Date().toISOString().slice(0, 10);
        let totalStats = { 'not-studied': 0, 'learning': 0, 'mastered': 0 };
        Object.values(appData.decks).forEach(deck => {
            deck.forEach(card => { totalStats[card.status]++; });
        });
        const todayEntry = statsHistory.find(entry => entry.date === today);
        if (todayEntry) todayEntry.stats = totalStats;
        else statsHistory.push({ date: today, stats: totalStats });
        if (statsHistory.length > 30) statsHistory.shift();
        localStorage.setItem('flashcardStatsHistory', JSON.stringify(statsHistory));
    };

    const showStatsPage = () => {
        logDailyStats();
        switchView(App.views.STATS);
        renderStatsChart();
    };
    
    const renderStatsChart = () => {
        const currentChartData = JSON.stringify(statsHistory);
        if (App.stats.chart && lastChartData === currentChartData) return;
        lastChartData = currentChartData;
        if (App.stats.chart) App.stats.chart.destroy();
        const style = getComputedStyle(document.documentElement);
        App.stats.chart = new Chart(App.stats.canvas, {
            type: 'line',
            data: {
                labels: statsHistory.map(s => s.date.slice(5).replace('-', '/')),
                datasets: [
                    { label: 'Chưa học', data: statsHistory.map(s => s.stats['not-studied']), borderColor: style.getPropertyValue('--text-secondary').trim(), fill: false },
                    { label: 'Đang học', data: statsHistory.map(s => s.stats.learning), borderColor: style.getPropertyValue('--warning-color').trim(), fill: false },
                    { label: 'Thành thạo', data: statsHistory.map(s => s.stats.mastered), borderColor: style.getPropertyValue('--success-color').trim(), fill: false }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
    };

    // === EVENT LISTENERS ===
    const setupEventListeners = () => {
        App.deckSelector.addEventListener('change', (e) => selectDeck(e.target.value));
        document.getElementById('add-deck-btn').addEventListener('click', () => openModal('addDeck'));
        document.getElementById('edit-deck-btn').addEventListener('click', () => currentDeckName && openModal('editDeck', currentDeckName));
        document.getElementById('delete-deck-btn').addEventListener('click', deleteCurrentDeck);
        document.getElementById('merge-decks-btn').addEventListener('click', openMergeModal);
        document.getElementById('unmerge-deck-btn').addEventListener('click', deleteCurrentGroup);
        App.mergeModal.closeBtn.addEventListener('click', closeMergeModal);
        App.mergeModal.saveBtn.addEventListener('click', handleSaveGroup);
        App.themeToggleBtn.addEventListener('click', toggleTheme);
        App.shuffleBtn.addEventListener('click', toggleShuffleMode);
        App.backgroundThemeSelector.addEventListener('change', (e) => changeBackgroundTheme(e.target.value));
        document.getElementById('reset-deck-btn').addEventListener('click', resetCurrentDeckStatus);
        document.getElementById('manage-cards-btn').addEventListener('click', openManageCardsModal);
        App.manageCardsModal.deleteBtn.addEventListener('click', deleteSelectedCards);
        document.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', () => document.getElementById(btn.dataset.closeModal).classList.add('hidden'));
        });
        document.getElementById('review-starred-btn').addEventListener('click', () => {
            let starredCards = [];
            const decksToScan = (appData.deckGroups && appData.deckGroups[currentDeckName]) ? appData.deckGroups[currentDeckName] : [currentDeckName];
            decksToScan.forEach(deckName => {
                if (appData.decks[deckName]) {
                    starredCards.push(...appData.decks[deckName].filter(card => card.starred).map(c => ({...c, originalDeck: deckName})));
                }
            });
            startReviewSession(starredCards);
        });
        document.getElementById('show-stats-btn').addEventListener('click', showStatsPage);
        document.getElementById('back-to-progress-from-stats-btn').addEventListener('click', () => selectDeck(currentDeckName));
        document.getElementById('start-review-btn').addEventListener('click', () => startReviewSession());
        document.getElementById('export-data-btn').addEventListener('click', exportData);
        document.getElementById('import-data-btn').addEventListener('click', importData);
        App.cardContainer.addEventListener('click', (e) => {
            if (e.target.closest('.card-actions-top')) return;
            flipCard();
        });
        document.getElementById('forgot-btn').addEventListener('click', () => processCardReview('forgot'));
        document.getElementById('known-btn').addEventListener('click', () => processCardReview('known'));
        document.getElementById('undo-btn').addEventListener('click', undoAction);
        App.starCardBtn.addEventListener('click', toggleStarCurrentCard);
        document.getElementById('edit-card-btn').addEventListener('click', () => openModal('editCard', currentDeckName, currentCard.id));
        document.getElementById('delete-card-btn').addEventListener('click', deleteCurrentCard);
        document.getElementById('back-to-progress-btn').addEventListener('click', () => selectDeck(currentDeckName));
        document.getElementById('close-modal-btn').addEventListener('click', closeModal);
        App.modal.saveBtn.addEventListener('click', handleSave);
        App.searchBar.addEventListener('input', debounce(handleSearch, 300));
        
        App.modal.excelFileInput.addEventListener('change', handleExcelFile);

        document.addEventListener('keydown', (e) => {
            const isModalOpen = !App.modal.container.classList.contains('hidden') || !App.mergeModal.container.classList.contains('hidden') || !App.manageCardsModal.container.classList.contains('hidden') || !App.confirmModal.container.classList.contains('hidden');
            if (isModalOpen) {
                if(e.key === 'Enter') {
                    if(!App.modal.container.classList.contains('hidden')) App.modal.saveBtn.click();
                    if(!App.mergeModal.container.classList.contains('hidden')) App.mergeModal.saveBtn.click();
                }
                if(e.key === 'Escape') {
                    if(!App.modal.container.classList.contains('hidden')) closeModal();
                    if(!App.mergeModal.container.classList.contains('hidden')) closeMergeModal();
                    if(!App.manageCardsModal.container.classList.contains('hidden')) App.manageCardsModal.container.classList.add('hidden');
                    if(!App.confirmModal.container.classList.contains('hidden')) App.confirmModal.cancelBtn.click();
                }
                return;
            };
            if (!App.views.FLASHCARD.classList.contains('hidden')) {
                if (e.code === 'Space' || e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); flipCard(); }
                if (e.key === 'ArrowLeft') processCardReview('forgot');
                if (e.key === 'ArrowRight') processCardReview('known');
                if (e.key.toLowerCase() === 's') { e.preventDefault(); toggleStarCurrentCard(); }
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undoAction(); }
            }
        });
    };

    // === INITIALIZATION ===
    loadData();
    populateDeckSelector();
    // Khôi phục phiên học nếu có savedSession
    if (appData.savedSession && appData.savedSession.deckName) {
        selectDeck(appData.savedSession.deckName);
        // Bắt đầu phiên học đã lưu tự động nếu đang ở chế độ shuffle
        // và bạn muốn người dùng quay lại ngay phiên trước đó.
        // Nếu không, người dùng sẽ bấm "Tiếp tục ôn".
        // startReviewSession(); 
    } else {
        selectDeck(Object.keys(appData.decks)[0] || Object.keys(appData.deckGroups)[0] || "");
    }
    setupEventListeners();
    logDailyStats();
});