// --- CONTROLLERS/PANELCONTROLLER.JS (ATUALIZADO: KDS STATUS + ALERTAS SONOROS) ---
import { 
    getTablesCollectionRef, 
    getTableDocRef, 
    db, 
    getSectorsCollectionRef,
    getKdsCollectionRef // <--- NOVO IMPORT
} from "/services/firebaseService.js";

import { 
    query, 
    where, 
    orderBy, 
    onSnapshot, 
    getDoc, 
    setDoc, 
    updateDoc, 
    serverTimestamp, 
    writeBatch, 
    arrayUnion, 
    deleteDoc, 
    getDocs 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { formatCurrency, formatElapsedTime } from "/utils.js";

import { 
    goToScreen, 
    currentTableId, 
    selectedItems, 
    unsubscribeTable, 
    currentOrderSnapshot, 
    setCurrentTable, 
    userRole, 
    selectTableAndStartListener,
    playNotificationSound // <--- NOVO IMPORT
} from "/app.js";


// --- ESTADO DO MÓDULO ---
let SECTORS = ['Todos']; 
let currentSectorFilter = 'Todos';
let unsubscribeTables = null;
let panelInitialized = false;
let currentTablesSnapshot = []; 

// --- CARREGAMENTO DE SETORES DINÂMICO ---
const fetchServiceSectors = async () => {
    try {
        const q = query(getSectorsCollectionRef(), where('type', '==', 'service'), orderBy('name'));
        const snapshot = await getDocs(q);
        
        const dynamicSectors = snapshot.docs.map(doc => doc.data().name);
        
        if (dynamicSectors.length > 0) {
            SECTORS = ['Todos', ...dynamicSectors];
        } else {
            SECTORS = ['Todos', 'Salão 1', 'Bar', 'Mezanino', 'Calçada']; 
        }
        
        renderTableFilters();
        populateSectorDropdown();

    } catch (e) {
        console.error("Erro ao carregar setores dinâmicos:", e);
        renderTableFilters();
        populateSectorDropdown();
    }
};

const populateSectorDropdown = () => {
    const select = document.getElementById('sectorInput');
    const transferSelect = document.getElementById('newTableSector');
    
    const optionsHtml = '<option value="" disabled selected>Setor</option>' + 
        SECTORS.slice(1).map(s => `<option value="${s}">${s}</option>`).join('');

    if (select) select.innerHTML = optionsHtml;
    if (transferSelect) transferSelect.innerHTML = optionsHtml;
};


// --- RENDERIZAÇÃO DE SETORES (FILTROS) ---
export const renderTableFilters = () => {
    const sectorFiltersContainer = document.getElementById('sectorFilters');
    if (!sectorFiltersContainer) return;

    sectorFiltersContainer.innerHTML = SECTORS.map(sector => {
        const isActive = sector === currentSectorFilter;
        const activeClasses = 'bg-pumpkin text-white border-pumpkin';
        const inactiveClasses = 'bg-dark-input text-dark-text border-gray-600';
        
        return `
            <button class="sector-btn px-4 py-3 rounded-full text-base font-semibold whitespace-nowrap ${isActive ? activeClasses : inactiveClasses}" 
                    data-sector="${sector}">
                ${sector}
            </button>
        `;
    }).join('');

     sectorFiltersContainer.querySelectorAll('.sector-btn').forEach(btn => {
        const isActive = btn.dataset.sector === currentSectorFilter;
        btn.className = `sector-btn px-4 py-3 rounded-full text-base font-semibold whitespace-nowrap ${isActive ? 'bg-pumpkin text-white border-pumpkin' : 'bg-dark-input text-dark-text border-gray-600'}`;
    });
};


// --- RENDERIZAÇÃO E CARREGAMENTO DE MESAS ---
const renderTables = (docs) => {
    const openTablesList = document.getElementById('openTablesList');
    const openTablesCount = document.getElementById('openTablesCount');
    if (!openTablesList || !openTablesCount) return;

    openTablesList.innerHTML = '';
    let count = 0;
    currentTablesSnapshot = docs; 

    docs.forEach(doc => {
        const table = doc.data();
        const tableId = doc.id;

        if (table.status?.toLowerCase() === 'open' || table.status?.toLowerCase() === 'merged') {
            count++;
            const total = table.total || 0;
            
            const isBillRequested = table.billRequested === true;
            const isClientPending = table.clientOrderPending === true;
            const isMerged = table.status?.toLowerCase() === 'merged';

            let cardColorClasses = 'bg-dark-card border-gray-700 text-dark-text hover:bg-gray-700';
            let attentionIconHtml = '';

            if (isMerged) {
                 cardColorClasses = 'bg-yellow-900 border-yellow-700 text-yellow-200 hover:bg-yellow-800';
                 attentionIconHtml = `<i class="fas fa-link attention-icon text-yellow-300" title="Agrupada: Mestra ${table.masterTable}"></i>`;
            } 
            // 1. Prioridade Máxima: Solicitação de Conta (Verde)
            else if (isBillRequested) {
                 cardColorClasses = 'bg-green-900 border-green-700 text-white hover:bg-green-800 ring-2 ring-green-400 animate-pulse';
                 attentionIconHtml = `<button class="attention-icon-btn bill-request-icon" data-table-id="${tableId}" onclick="window.handleBillRequestConfirmation('${tableId}')" title="Cliente solicitou a conta! Clique para imprimir.">
                                        <i class="fas fa-print text-xl text-green-400 animate-pulse"></i>
                                     </button>`;
            }
            // 2. Prioridade Média: Solicitação de Pedido (Azul/Amarelo)
            else if (isClientPending) {
                 cardColorClasses = 'bg-indigo-900 border-yellow-400 text-white hover:bg-indigo-800 ring-2 ring-yellow-400 animate-pulse';
                 attentionIconHtml = `<i class="fas fa-bell attention-icon text-yellow-400 animate-pulse" title="Pedido Cliente Pendente"></i>`;
            }
            else if (total > 0) {
                 cardColorClasses = 'bg-red-900 border-red-700 text-red-200 hover:bg-red-800';
            } else {
                 cardColorClasses = 'bg-green-900 border-green-700 text-green-200 hover:bg-green-800';
            }

            const hasAguardandoItem = (table.selectedItems || []).some(item => item.note?.toLowerCase().includes('espera'));
            if (!isBillRequested && !isClientPending && hasAguardandoItem) {
                 attentionIconHtml = `<i class="fas fa-exclamation-triangle attention-icon" title="Itens em Espera"></i>`;
            }

            let lastSentAt = null;
            if (table.lastKdsSentAt?.toMillis) lastSentAt = table.lastKdsSentAt.toMillis();
            else if (typeof table.lastKdsSentAt === 'number') lastSentAt = table.lastKdsSentAt;

            const elapsedTime = lastSentAt ? formatElapsedTime(lastSentAt) : null;
            const timerHtml = elapsedTime ? `<div class="table-timer"><i class="fas fa-clock"></i> <span>${elapsedTime}</span></div>` : '';
            
            // Botão KDS chama a nova função
            let kdsStatusButtonHtml = '';
            if (lastSentAt) {
                 kdsStatusButtonHtml = `<button class="kds-status-icon-btn" title="Status KDS" onclick="window.openKdsStatusModal('${tableId}')"><i class="fas fa-tasks"></i></button>`;
            }
            
            const mergeIconHtml = isMerged ? '' : `<button class="merge-icon-btn" title="Agrupar Mesas" onclick="window.openManagerAuthModal('openTableMerge', ${tableId})"><i class="fas fa-people-arrows"></i></button>`;
            
            const clientInfo = table.clientName ? `<p class="text-xs font-semibold">${table.clientName}</p>` : '';
            
            const statusText = isMerged ? `Agrupada (Mestra: ${table.masterTable})` : `Pessoas: ${table.diners}`;

            const cardHtml = `
                <div class="table-card-panel ${cardColorClasses} shadow-md transition-colors duration-200 relative" data-table-id="${tableId}">
                    ${mergeIconHtml} ${attentionIconHtml}
                    <h3 class="font-bold text-2xl">Mesa ${table.tableNumber}</h3>
                    <p class="text-xs font-light">Setor: ${table.sector || 'N/A'}</p>
                    ${clientInfo}
                    <span class="font-bold text-lg mt-2">${formatCurrency(total)}</span>
                    <p class="text-xs font-light mt-1">${statusText}</p>
                    <div class="flex items-center justify-center space-x-2 w-full mt-2">
                         ${kdsStatusButtonHtml} ${timerHtml}
                    </div>
                </div>`;
            openTablesList.innerHTML += cardHtml;
        }
    });

    openTablesCount.textContent = count;
    if (count === 0) openTablesList.innerHTML = `<div class="col-span-full text-sm text-dark-placeholder italic p-4 content-card bg-dark-card border border-gray-700">Nenhuma mesa aberta/agrupada no setor "${currentSectorFilter}".</div>`;

    document.querySelectorAll('.table-card-panel').forEach(card => {
        const newCard = card.cloneNode(true);
        card.parentNode.replaceChild(newCard, card);
        
        newCard.addEventListener('click', (e) => {
            if (e.target.closest('.kds-status-icon-btn') || e.target.closest('.attention-icon') || e.target.closest('.merge-icon-btn') || e.target.closest('.bill-request-icon')) return; 

            const tableId = newCard.dataset.tableId;
            if (tableId) {
                selectTableAndStartListener(tableId);
            }
        });
    });
};

export const loadOpenTables = () => {
    if (unsubscribeTables) { unsubscribeTables(); unsubscribeTables = null; }
    const tablesCollection = getTablesCollectionRef();
    let q;
    if (currentSectorFilter === 'Todos') q = query(tablesCollection, where('status', 'in', ['open', 'merged']), orderBy('tableNumber', 'asc'));
    else q = query(tablesCollection, where('status', 'in', ['open', 'merged']), where('sector', '==', currentSectorFilter), orderBy('tableNumber', 'asc'));

    console.log(`[Panel] Configurando listener: ${currentSectorFilter === 'Todos' ? 'Todos' : `Setor ${currentSectorFilter}`}`);
    
    unsubscribeTables = onSnapshot(q, (snapshot) => {
        console.log(`[Panel] Snapshot: ${snapshot.docs.length} mesas.`);
        
        // --- LÓGICA DE SOM (NOTIFICAÇÕES) ---
        snapshot.docChanges().forEach((change) => {
            if (change.type === "modified" || change.type === "added") {
                const data = change.doc.data();
                // Toca som se pediu conta ou fez pedido
                if (data.billRequested === true || data.clientOrderPending === true) {
                    if(change.type === "modified") {
                        console.log(`[Panel] Alerta na Mesa ${data.tableNumber}! Tocando som...`);
                        playNotificationSound();
                    }
                }
            }
        });
        // -------------------------------------

        renderTables(snapshot.docs);
    }, (error) => {
        const openTablesList = document.getElementById('openTablesList');
        const errorMessage = error.message || "Erro desconhecido.";
        if (openTablesList) openTablesList.innerHTML = `<div class="col-span-full text-sm text-red-400 font-bold italic p-4 content-card bg-dark-card border border-red-700">ERRO FIREBASE: ${errorMessage}</div>`;
        console.error("Erro fatal ao carregar mesas:", error);
    });
};

export const handleAbrirMesa = async () => {
    const mesaInput = document.getElementById('mesaInput');
    const pessoasInput = document.getElementById('pessoasInput');
    const sectorInput = document.getElementById('sectorInput');
    const tableNumber = parseInt(mesaInput.value);
    const diners = parseInt(pessoasInput.value);
    const sector = sectorInput.value;

    if (!tableNumber || !diners || tableNumber <= 0 || diners <= 0 || !sector) {
        alert('Preencha número da mesa, pessoas e setor.');
        return;
    }
    const tableRef = getTableDocRef(tableNumber);
    try {
        const docSnap = await getDoc(tableRef);
        if (docSnap.exists() && docSnap.data().status?.toLowerCase() === 'open') {
            alert(`A Mesa ${tableNumber} já está aberta!`);
            return;
        }
        
        const accessPin = Math.floor(1000 + Math.random() * 9000).toString();
        
        console.log(`[Panel] Abrindo Mesa ${tableNumber} / ${sector} / ${diners}p. PIN: ${accessPin}`);
        
        await setDoc(tableRef, {
            tableNumber, diners, sector, status: 'open', createdAt: serverTimestamp(),
            total: 0, sentItems: [], payments: [], serviceTaxApplied: true, selectedItems: [],
            accessPin: accessPin 
        });
        
        mesaInput.value = ''; pessoasInput.value = ''; sectorInput.value = '';
        alert(`Mesa ${tableNumber} aberta com sucesso! PIN de Acesso Digital: ${accessPin}`);
        selectTableAndStartListener(tableNumber.toString()); 
    } catch (e) {
        console.error("Erro ao abrir mesa:", e);
        alert("Erro ao tentar abrir a mesa.");
    }
};

export const handleSearchTable = async () => {
    const searchTableInput = document.getElementById('searchTableInput');
    const tableNumber = searchTableInput?.value.trim();
    if (!tableNumber || parseInt(tableNumber) <= 0) {
        alert("Insira um número de mesa válido.");
        return;
    }
    const tableRef = getTableDocRef(tableNumber);
    const docSnap = await getDoc(tableRef);
    if (docSnap.exists() && docSnap.data().status?.toLowerCase() === 'open') {
        console.log(`[Panel] Mesa ${tableNumber} encontrada via busca.`);
        selectTableAndStartListener(tableNumber); 
        if(searchTableInput) searchTableInput.value = '';
    } else {
        console.log(`[Panel] Mesa ${tableNumber} não encontrada ou fechada.`);
        alert(`A Mesa ${tableNumber} não está aberta.`);
    }
};

// --- AÇÃO DIRETA: CONFIRMAR PEDIDO DE CONTA ---
async function handleBillRequestConfirmation(tableId) {
    if (!tableId) return;

    const tableRef = getTableDocRef(tableId);
    
    try {
        await updateDoc(tableRef, {
            billRequested: false, 
            waiterNotification: null 
        });

        selectTableAndStartListener(tableId);
        goToScreen('paymentScreen');
        
    } catch (e) {
        console.error("Erro ao confirmar recebimento da conta:", e);
        alert("Erro ao processar a solicitação. Tente novamente.");
    }
}
window.handleBillRequestConfirmation = handleBillRequestConfirmation;

// --- AGRUPAMENTO DE MESAS ---
export const openTableMergeModal = () => {
    const managerModal = document.getElementById('managerModal');
    if (!managerModal) return;

    const availableTables = currentTablesSnapshot
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(t => t.status?.toLowerCase() === 'open' && (t.sentItems?.length > 0 || t.selectedItems?.length > 0 || t.total > 0));

    if (availableTables.length < 2) {
        alert("Pelo menos duas mesas abertas e com itens/total são necessárias para agrupar.");
        return;
    }

    const tableOptions = availableTables.map(t => `<option value="${t.tableNumber}">Mesa ${t.tableNumber} (${formatCurrency(t.total || 0)})</option>`).join('');

    managerModal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 p-6 rounded-xl shadow-2xl w-full max-w-lg">
            <h3 class="text-xl font-bold mb-4 text-indigo-400">Agrupar Mesas para Grande Grupo</h3>
            <p class="text-base mb-4 text-dark-text">Selecione a **Mesa Mestra (Destino)** e as **Mesas Secundárias (Origem)**. Os itens serão movidos para a Mestra e as Origens serão fechadas/marcadas como Agrupadas.</p>
            
            <div class="mb-4">
                <label for="masterTableSelect" class="block text-sm font-medium text-white mb-2">MESA MESTRA (DESTINO):</label>
                <select id="masterTableSelect" class="w-full p-3 bg-dark-input border border-gray-600 rounded-lg text-dark-text">
                    <option value="">-- Selecione a Mesa Principal --</option>
                    ${tableOptions}
                </select>
            </div>
            
            <div class="mb-4">
                <label class="block text-sm font-medium text-white mb-2">MESAS SECUNDÁRIAS (ORIGEM):</label>
                <div id="sourceTablesCheckboxes" class="space-y-2 max-h-40 overflow-y-auto p-2 bg-dark-input border border-gray-700 rounded-lg">
                    ${availableTables.map(t => `
                        <div class="flex items-center">
                            <input type="checkbox" id="sourceTable_${t.tableNumber}" value="${t.tableNumber}" class="h-4 w-4 text-indigo-600 bg-gray-700 border-gray-600 rounded focus:ring-indigo-500">
                            <label for="sourceTable_${t.tableNumber}" class="ml-3 text-dark-text">Mesa ${t.tableNumber} (${formatCurrency(t.total || 0)})</label>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div id="mergeErrorMsg" class="text-red-400 text-sm mb-3 hidden"></div>
            
            <div class="flex justify-end space-x-3 mt-6">
                <button class="px-4 py-3 bg-gray-600 text-gray-200 rounded-lg hover:bg-gray-500 transition text-base" onclick="document.getElementById('managerModal').style.display='none'">Cancelar</button>
                <button id="confirmMergeBtn" class="px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-base">Confirmar Agrupamento</button>
            </div>
        </div>
    `;
    managerModal.style.display = 'flex';
    
    const confirmBtn = document.getElementById('confirmMergeBtn');
    if (confirmBtn) {
        confirmBtn.onclick = handleConfirmTableMerge;
    }
};
window.openTableMergeModal = openTableMergeModal; 

export const handleConfirmTableMerge = async () => {
    const masterTableId = document.getElementById('masterTableSelect').value;
    const sourceTableCheckboxes = document.querySelectorAll('#sourceTablesCheckboxes input[type="checkbox"]:checked');
    const errorMsgEl = document.getElementById('mergeErrorMsg');
    
    const sourceTableIds = Array.from(sourceTableCheckboxes).map(cb => cb.value).filter(id => id !== masterTableId);

    if (!masterTableId) {
        errorMsgEl.textContent = 'Selecione a Mesa Mestra.';
        errorMsgEl.style.display = 'block';
        return;
    }
    if (sourceTableIds.length === 0) {
        errorMsgEl.textContent = 'Selecione pelo menos uma Mesa Secundária.';
        errorMsgEl.style.display = 'block';
        return;
    }

    if (!confirm(`Tem certeza que deseja mover todos os itens das Mesas ${sourceTableIds.join(', ')} para a MESA MESTRA ${masterTableId}? As mesas secundárias serão fechadas/agrupadas.`)) {
        return;
    }
    
    const confirmBtn = document.getElementById('confirmMergeBtn');
    const managerModal = document.getElementById('managerModal');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Agrupando...'; }

    try {
        const masterTableRef = getTableDocRef(masterTableId);
        const masterSnap = await getDoc(masterTableRef);
        
        if (!masterSnap.exists() || masterSnap.data().status !== 'open') {
             throw new Error(`A Mesa Mestra ${masterTableId} não está aberta.`);
        }
        
        const dbInstance = db;
        if (!dbInstance) throw new Error("Conexão com banco de dados indisponível.");
        const batch = writeBatch(dbInstance);

        let masterNewTotal = masterSnap.data().total || 0;
        let masterNewDiners = masterSnap.data().diners || 1;
        let allItemsToMerge = []; 
        let allSelectedItemsToMerge = []; 
        let allRequestedOrdersToMerge = []; 
        
        for (const sourceId of sourceTableIds) {
            const sourceRef = getTableDocRef(sourceId);
            const sourceSnap = await getDoc(sourceRef);
            
            if (sourceSnap.exists() && sourceSnap.data().status === 'open') {
                const sourceData = sourceSnap.data();
                
                masterNewTotal += (sourceData.total || 0);
                masterNewDiners += (sourceData.diners || 0);

                if (sourceData.sentItems) allItemsToMerge.push(...sourceData.sentItems);
                if (sourceData.selectedItems) allSelectedItemsToMerge.push(...sourceData.selectedItems);
                if (sourceData.requestedOrders) allRequestedOrdersToMerge.push(...sourceData.requestedOrders);
                
                batch.update(sourceRef, {
                    status: 'merged', 
                    masterTable: masterTableId,
                    sentItems: [], 
                    selectedItems: [],
                    requestedOrders: [],
                    clientOrderPending: false,
                    total: 0,
                    payments: [],
                    diners: 0
                });
            }
        }

        const masterExistingSentItems = masterSnap.data().sentItems || [];
        const masterExistingSelectedItems = masterSnap.data().selectedItems || [];
        const masterExistingRequestedOrders = masterSnap.data().requestedOrders || [];
        const currentMergedTables = masterSnap.data().mergedTables || [];

        batch.update(masterTableRef, {
            total: masterNewTotal,
            diners: masterNewDiners,
            sentItems: arrayUnion(...masterExistingSentItems, ...allItemsToMerge), 
            selectedItems: arrayUnion(...masterExistingSelectedItems, ...allSelectedItemsToMerge), 
            requestedOrders: arrayUnion(...masterExistingRequestedOrders, ...allRequestedOrdersToMerge),
            mergedTables: arrayUnion(...currentMergedTables, ...sourceTableIds),
            clientOrderPending: (masterExistingRequestedOrders.length + allRequestedOrdersToMerge.length) > 0, 
        });

        await batch.commit();
        
        managerModal.style.display = 'none';
        alert(`Agrupamento concluído! Mesas ${sourceTableIds.join(', ')} agrupadas na MESA ${masterTableId}.`);
        loadOpenTables(); 
        
    } catch (e) {
        console.error("Erro no Agrupamento de Mesas:", e);
        errorMsgEl.textContent = `Falha ao agrupar: ${e.message}`;
        errorMsgEl.style.display = 'block';
    } finally {
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirmar Agrupamento'; }
    }
};

// --- NOVA FUNÇÃO DE STATUS KDS (VISUALIZAÇÃO DO MODAL) ---
window.openKdsStatusModal = async (tableId) => {
    const modal = document.getElementById('tableKdsModal');
    const content = document.getElementById('tableKdsContent');
    const title = document.getElementById('tableKdsTitle');
    
    if (!modal || !content) {
        console.error("Modal KDS (tableKdsModal) não encontrado no DOM. Adicione-o ao index.html.");
        return;
    }

    title.textContent = `Cozinha - Mesa ${tableId}`;
    content.innerHTML = `
        <div class="flex flex-col items-center justify-center py-8">
            <i class="fas fa-spinner fa-spin text-pumpkin text-3xl mb-3"></i>
            <p class="text-gray-400">Consultando cozinha...</p>
        </div>`;
    modal.style.display = 'flex';

    try {
        // Busca pedidos ativos dessa mesa no KDS
        const q = query(
            getKdsCollectionRef(), 
            where('tableNumber', '==', parseInt(tableId)),
            orderBy('sentAt', 'desc')
        );
        
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            content.innerHTML = `
                <div class="text-center py-6 opacity-50">
                    <i class="fas fa-check-circle text-4xl text-gray-500 mb-2"></i>
                    <p class="text-gray-400">Nenhum pedido ativo na cozinha.</p>
                </div>`;
            return;
        }

        let html = '';
        
        snapshot.forEach(doc => {
            const data = doc.data();
            
            const statusConfig = {
                'pending': { label: 'Pendente', color: 'text-red-400 border-red-900/50 bg-red-900/20', icon: 'fa-clock' },
                'preparing': { label: 'Preparando', color: 'text-blue-400 border-blue-900/50 bg-blue-900/20', icon: 'fa-fire' },
                'ready': { label: 'Pronto', color: 'text-green-400 border-green-900/50 bg-green-900/20', icon: 'fa-check' },
                'finished': { label: 'Entregue', color: 'text-gray-500 border-gray-700 bg-gray-800', icon: 'fa-history' },
                'cancelled': { label: 'Cancelado', color: 'text-gray-400 border-gray-700 bg-red-900/10 line-through', icon: 'fa-ban' }
            };
            
            const st = statusConfig[data.status] || { label: data.status, color: 'text-gray-400', icon: 'fa-question' };
            const time = data.sentAt?.toDate ? data.sentAt.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--';

            let itemsHtml = '';
            if (data.sectors) {
                Object.entries(data.sectors).forEach(([sectorName, items]) => {
                    if(items && items.length > 0) {
                        itemsHtml += `
                            <div class="mt-2 border-t border-gray-700 pt-1 first:border-0 first:pt-0">
                                <p class="text-[10px] uppercase font-bold text-gray-500 mb-1">${sectorName}</p>
                                ${items.map(item => `
                                    <div class="flex justify-between items-start text-sm mb-1">
                                        <span class="text-gray-200 font-medium">${item.name}</span>
                                        ${item.note ? `<span class="text-xs text-yellow-500 italic ml-2 bg-yellow-900/20 px-1 rounded max-w-[120px] truncate">${item.note}</span>` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        `;
                    }
                });
            }

            const cancelReasonHtml = data.status === 'cancelled' ? `<p class="text-xs text-red-400 mt-2 italic border-t border-gray-700 pt-1">Motivo: ${data.cancellationReason || 'N/A'}</p>` : '';

            html += `
                <div class="bg-dark-input border border-gray-700 rounded-lg p-3 shadow-sm relative overflow-hidden">
                    <div class="flex justify-between items-center mb-2">
                        <div class="flex items-center space-x-2">
                            <span class="text-xs font-mono text-gray-500">#${data.orderId.slice(-4)}</span>
                            <span class="text-xs text-gray-400"><i class="far fa-clock mr-1"></i>${time}</span>
                        </div>
                        <span class="text-xs font-bold px-2 py-1 rounded border flex items-center ${st.color}">
                            <i class="fas ${st.icon} mr-1.5"></i> ${st.label}
                        </span>
                    </div>
                    <div class="pl-1">
                        ${itemsHtml || '<p class="text-xs text-gray-500 italic">Sem itens registrados</p>'}
                        ${cancelReasonHtml}
                    </div>
                </div>
            `;
        });

        content.innerHTML = html;

    } catch (error) {
        console.error("Erro ao buscar status KDS:", error);
        content.innerHTML = `
            <div class="text-center py-4">
                <p class="text-red-400 font-bold mb-1">Erro ao carregar</p>
                <p class="text-xs text-gray-500">${error.message}</p>
            </div>`;
    }
};

export const initPanelController = async () => {
    if (panelInitialized) return;
    console.log("[PanelController] Inicializando...");

    await fetchServiceSectors();

    const abrirMesaBtn = document.getElementById('abrirMesaBtn');
    const searchTableBtn = document.getElementById('searchTableBtn');
    const sectorFiltersContainer = document.getElementById('sectorFilters');
    const mesaInput = document.getElementById('mesaInput');
    const pessoasInput = document.getElementById('pessoasInput');
    const sectorInput = document.getElementById('sectorInput');
    const abrirMesaRealBtn = document.getElementById('abrirMesaBtn'); 

    if (abrirMesaBtn) abrirMesaBtn.addEventListener('click', handleAbrirMesa);
    if (searchTableBtn) searchTableBtn.addEventListener('click', handleSearchTable);

    if (sectorFiltersContainer) {
         sectorFiltersContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.sector-btn');
            if (btn) {
                const sector = btn.dataset.sector;
                currentSectorFilter = sector;
                renderTableFilters();
                loadOpenTables(); 
            }
        });
    }

    const checkInputs = () => {
        const mesaValida = parseInt(mesaInput?.value) > 0;
        const pessoasValida = parseInt(pessoasInput?.value) > 0;
        const sectorValido = sectorInput?.value !== '';
        if (abrirMesaRealBtn) {
            abrirMesaRealBtn.disabled = !(mesaValida && pessoasValida && sectorValido);
        }
    };
    if(mesaInput) mesaInput.addEventListener('input', checkInputs);
    if(pessoasInput) pessoasInput.addEventListener('input', checkInputs);
    if(sectorInput) sectorInput.addEventListener('change', checkInputs);

    panelInitialized = true;
    console.log("[PanelController] Inicializado.");
};