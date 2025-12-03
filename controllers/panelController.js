// --- CONTROLLERS/PANELCONTROLLER.JS (OTIMIZADO: EVENT DELEGATION) ---
import { 
    getTablesCollectionRef, 
    getTableDocRef, 
    db, 
    getSectorsCollectionRef, 
    getKdsCollectionRef 
} from "/services/firebaseService.js";

import { 
    query, where, orderBy, onSnapshot, getDoc, setDoc, updateDoc, 
    serverTimestamp, writeBatch, arrayUnion, arrayRemove, getDocs, doc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { formatCurrency, formatElapsedTime, toggleLoading } from "/utils.js";

import { 
    goToScreen, 
    selectTableAndStartListener,
    playNotificationSound,
    showToast,
    userId
} from "/app.js";


// --- ESTADO DO MÓDULO ---
let SECTORS = ['Todos']; 
let currentSectorFilter = 'Todos';
let unsubscribeTables = null;
let panelInitialized = false;
let currentTablesSnapshot = []; 

// --- AUXILIARES ---
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
        btn.addEventListener('click', () => {
            currentSectorFilter = btn.dataset.sector;
            renderTableFilters();
            loadOpenTables();
        });
    });
};


// --- RENDERIZAÇÃO DE MESAS ---
const renderTables = (docs) => {
    const list = document.getElementById('openTablesList');
    const countEl = document.getElementById('openTablesCount');
    if (!list || !countEl) return;

    list.innerHTML = '';
    let count = 0;
    currentTablesSnapshot = docs; 

    docs.forEach(doc => {
        const t = doc.data();
        const tId = doc.id;

        if (t.status?.toLowerCase() === 'open' || t.status?.toLowerCase() === 'merged') {
            count++;
            const total = t.total || 0;
            
            const isBillRequested = t.billRequested === true;
            const isClientPending = t.clientOrderPending === true;
            const isMerged = t.status?.toLowerCase() === 'merged';

            let cardColorClasses = 'bg-dark-card border-gray-700 text-dark-text hover:bg-gray-700';
            let attentionIconHtml = '';

            if (isMerged) {
                 cardColorClasses = 'bg-yellow-900 border-yellow-700 text-yellow-200 hover:bg-yellow-800';
                 attentionIconHtml = `<i class="fas fa-link attention-icon text-yellow-300" title="Agrupada: Mestra ${t.masterTable}"></i>`;
            } 
            else if (isBillRequested) {
                 cardColorClasses = 'bg-green-900 border-green-700 text-white hover:bg-green-800 ring-2 ring-green-400 animate-pulse';
                 // AQUI: Substituído onclick por data-action
                 attentionIconHtml = `<button class="attention-icon-btn bill-request-icon" data-action="confirm-bill" data-id="${tId}" title="Imprimir Conta">
                                        <i class="fas fa-print text-xl text-green-400 animate-pulse"></i>
                                     </button>`;
            }
            else if (isClientPending) {
                 cardColorClasses = 'bg-indigo-900 border-yellow-400 text-white hover:bg-indigo-800 ring-2 ring-yellow-400 animate-pulse';
                 attentionIconHtml = `<i class="fas fa-bell attention-icon text-yellow-400 animate-pulse" title="Pedido Cliente Pendente"></i>`;
            }
            else if (t.waiterNotification) {
                 attentionIconHtml = `<i class="fas fa-utensils attention-icon text-orange-400 animate-bounce" title="${t.waiterNotification}"></i>`;
            }
            else if (total > 0) {
                 cardColorClasses = 'bg-red-900 border-red-700 text-red-200 hover:bg-red-800';
            } else {
                 cardColorClasses = 'bg-green-900 border-green-700 text-green-200 hover:bg-green-800';
            }

            let lastSentAt = null;
            if (t.lastKdsSentAt?.toMillis) lastSentAt = t.lastKdsSentAt.toMillis();
            else if (typeof t.lastKdsSentAt === 'number') lastSentAt = t.lastKdsSentAt;

            const elapsedTime = lastSentAt ? formatElapsedTime(lastSentAt) : null;
            const timerHtml = elapsedTime ? `<div class="table-timer"><i class="fas fa-clock"></i> <span>${elapsedTime}</span></div>` : '';
            
            // --- ÍCONE KDS COM ALERTA ---
            let kdsStatusButtonHtml = '';
            if (lastSentAt) {
                 let kdsIconClass = "text-gray-400 hover:text-white";
                 let kdsIcon = "fa-tasks";
                 let kdsTitle = "Status Cozinha";

                 if (t.kdsAlert === 'ready') {
                     kdsIconClass = "text-green-400 animate-bounce font-bold drop-shadow-md";
                     kdsIcon = "fa-concierge-bell"; 
                     kdsTitle = "PEDIDO PRONTO!";
                 }

                 // AQUI: Substituído onclick por data-action
                 kdsStatusButtonHtml = `<button class="kds-status-icon-btn ${kdsIconClass}" title="${kdsTitle}" data-action="open-kds" data-id="${tId}">
                                            <i class="fas ${kdsIcon}"></i>
                                        </button>`;
            }
            
            // AQUI: Substituído onclick por data-action
            const mergeIconHtml = isMerged ? '' : `<button class="merge-icon-btn" title="Agrupar Mesas" data-action="open-merge"><i class="fas fa-people-arrows"></i></button>`;
            
            const clientInfo = t.clientName ? `<p class="text-xs font-semibold">${t.clientName}</p>` : '';
            const statusText = isMerged ? `Agrupada (Mestra: ${t.masterTable})` : `Pessoas: ${t.diners}`;

            const cardHtml = `
                <div class="table-card-panel ${cardColorClasses} shadow-md transition-colors duration-200 relative" data-table-id="${tId}">
                    ${mergeIconHtml} ${attentionIconHtml}
                    <h3 class="font-bold text-2xl">Mesa ${t.tableNumber}</h3>
                    <p class="text-xs font-light">Setor: ${t.sector || 'N/A'}</p>
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
};

// --- FUNÇÃO CENTRAL DE EVENTOS (DELEGAÇÃO) ---
const setupPanelEventListeners = () => {
    const list = document.getElementById('openTablesList');
    
    // Remove listeners antigos se houver (para evitar duplicidade em hot reload, se aplicável)
    const newClone = list.cloneNode(false);
    // Mas no caso de SPA simples, apenas garantimos que rodamos uma vez no init.
    
    list.addEventListener('click', (e) => {
        // 1. Verifica se clicou em um botão de ação (KDS, Merge, Conta)
        const actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
            e.stopPropagation(); // Impede abrir a mesa
            const action = actionBtn.dataset.action;
            const id = actionBtn.dataset.id;

            if (action === 'open-kds') openKdsStatusModal(id);
            else if (action === 'open-merge') openTableMergeModal();
            else if (action === 'confirm-bill') handleBillRequestConfirmation(id);
            return;
        }

        // 2. Verifica se clicou no Card da Mesa (para abrir pedido)
        const card = e.target.closest('.table-card-panel');
        if (card) {
            // Ignora se clicou em ícones de atenção que não são botões
            if (e.target.closest('.attention-icon')) return;
            
            const tableId = card.dataset.tableId;
            if (tableId) selectTableAndStartListener(tableId);
        }
    });
};

export const loadOpenTables = () => {
    if (unsubscribeTables) { unsubscribeTables(); unsubscribeTables = null; }
    let q = query(getTablesCollectionRef(), where('status', 'in', ['open', 'merged']), orderBy('tableNumber', 'asc'));
    if (currentSectorFilter !== 'Todos') q = query(getTablesCollectionRef(), where('status', 'in', ['open', 'merged']), where('sector', '==', currentSectorFilter), orderBy('tableNumber', 'asc'));

    unsubscribeTables = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "modified") {
                const data = change.doc.data();
                if (data.billRequested === true || data.clientOrderPending === true || data.kdsAlert === 'ready') {
                    playNotificationSound();
                }
            }
        });

        renderTables(snapshot.docs);
    }, (error) => {
        const openTablesList = document.getElementById('openTablesList');
        if (openTablesList) openTablesList.innerHTML = `<div class="col-span-full text-sm text-red-400 font-bold italic p-4 content-card bg-dark-card border border-red-700">ERRO FIREBASE: ${error.message}</div>`;
        console.error("Erro fatal ao carregar mesas:", error);
    });
};

// --- STATUS KDS ---
const openKdsStatusModal = async (tableId) => {
    const modal = document.getElementById('tableKdsModal');
    const content = document.getElementById('tableKdsContent');
    document.getElementById('tableKdsTitle').textContent = `Cozinha - Mesa ${tableId}`;
    content.innerHTML = `<div class="flex justify-center py-8"><i class="fas fa-spinner fa-spin text-pumpkin text-3xl"></i></div>`;
    modal.style.display = 'flex';

    try {
        const q = query(
            getKdsCollectionRef(), 
            where('tableNumber', '==', parseInt(tableId)),
            where('status', 'in', ['pending', 'preparing', 'finished']), 
            orderBy('sentAt', 'desc')
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            content.innerHTML = `<div class="text-center py-6 opacity-50"><i class="fas fa-check-circle text-4xl text-gray-500 mb-2"></i><p class="text-gray-400">Nenhum pedido ativo.</p></div>`;
            return;
        }

        let htmlProducing = '', htmlReady = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const isDone = data.status === 'finished';
            const time = data.sentAt?.toDate ? data.sentAt.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--';
            
            let itemsHtml = '';
            if (data.sectors) {
                Object.entries(data.sectors).forEach(([sectorName, items]) => {
                    itemsHtml += `<div class="mt-1"><p class="text-[10px] uppercase font-bold text-gray-500">${sectorName}</p>${items.map(item => `<div class="flex justify-between text-sm"><span class="text-gray-200 font-medium">${item.name}</span>${item.note ? `<span class="text-xs text-yellow-500 ml-2">(${item.note})</span>` : ''}</div>`).join('')}</div>`;
                });
            }

            const card = `
                <div class="bg-dark-input border ${isDone ? 'border-green-500/50 bg-green-900/10' : 'border-gray-700'} rounded-lg p-3 shadow-sm mb-2 relative overflow-hidden">
                    <div class="flex justify-between items-center mb-1 border-b border-gray-700/50 pb-1">
                        <span class="text-xs font-mono text-gray-500">#${data.orderId.slice(-4)} - ${time}</span>
                        <span class="text-xs font-bold uppercase ${isDone ? 'text-green-400' : 'text-blue-400'}">${isDone ? 'PRONTO' : 'PREPARANDO'}</span>
                    </div>
                    ${itemsHtml}
                </div>`;
            
            if (isDone) htmlReady += card; else htmlProducing += card;
        });

        content.innerHTML = '';
        if (htmlReady) content.innerHTML += `<div class="mb-4"><h4 class="text-green-400 font-bold text-sm uppercase mb-2 border-b border-green-900 pb-1"><i class="fas fa-bell mr-2"></i>PRONTO PARA LEVAR</h4>${htmlReady}</div>`;
        if (htmlProducing) content.innerHTML += `<div><h4 class="text-blue-400 font-bold text-sm uppercase mb-2 border-b border-blue-900 pb-1"><i class="fas fa-fire mr-2"></i>NA COZINHA</h4>${htmlProducing}</div>`;

        content.innerHTML += `
            <div class="mt-4 pt-3 border-t border-gray-700">
                <button id="btnConfirmDelivery" class="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-md transition flex items-center justify-center">
                    <i class="fas fa-check-double mr-2"></i> Confirmar Entrega
                </button>
            </div>
        `;

        const deliverBtn = document.getElementById('btnConfirmDelivery');
        deliverBtn.onclick = async () => {
            toggleLoading(deliverBtn, true, 'Confirmando...');
            try {
                await updateDoc(getTableDocRef(tableId), { waiterNotification: null, kdsAlert: null });
                modal.style.display = 'none';
                showToast("Entrega confirmada!", false);
            } catch (e) {
                console.error(e);
                showToast("Erro ao confirmar.", true);
                toggleLoading(deliverBtn, false);
            }
        };

    } catch (error) {
        console.error("Erro status KDS:", error);
        content.innerHTML = `<div class="text-center py-4"><p class="text-red-400 font-bold mb-1">Erro</p><p class="text-xs text-gray-500">${error.message}</p></div>`;
    }
};

// --- AÇÕES DE MESA ---
export const handleAbrirMesa = async () => {
    const btn = document.getElementById('abrirMesaBtn');
    const mesaInput = document.getElementById('mesaInput');
    const pessoasInput = document.getElementById('pessoasInput');
    const sectorInput = document.getElementById('sectorInput');

    const num = parseInt(mesaInput.value);
    const diners = parseInt(pessoasInput.value);
    const sector = sectorInput.value;

    if (!num || !diners || !sector) { showToast('Preencha todos os campos.', true); return; }
    toggleLoading(btn, true, 'Abrindo...');

    try {
        if (userId) {
            const activeSnap = await getDocs(query(getTablesCollectionRef(), where('status', '==', 'open'), where('openedBy', '==', userId)));
            if (!activeSnap.empty) { 
                showToast(`Você já tem a Mesa ${activeSnap.docs[0].data().tableNumber} aberta. Finalize-a antes.`, true); 
                toggleLoading(btn, false); return; 
            }
        }
        const tableRef = getTableDocRef(num);
        const snap = await getDoc(tableRef);
        if (snap.exists() && snap.data().status === 'open') { 
            showToast(`Mesa ${num} já aberta!`, true); 
            toggleLoading(btn, false); return; 
        }

        await setDoc(tableRef, {
            tableNumber: num, diners, sector, status: 'open', createdAt: serverTimestamp(),
            total: 0, sentItems: [], payments: [], serviceTaxApplied: true, selectedItems: [],
            accessPin: Math.floor(1000 + Math.random() * 9000).toString(), openedBy: userId || 'anonymous'
        });
        
        mesaInput.value = ''; pessoasInput.value = '';
        showToast(`Mesa ${num} aberta!`, false);
        selectTableAndStartListener(num.toString());
    } catch (e) { showToast("Erro ao abrir.", true); console.error(e); } 
    finally { toggleLoading(btn, false); }
};

export const handleSearchTable = async () => {
    const input = document.getElementById('searchTableInput');
    const num = input.value;
    if (!num) return;
    const snap = await getDoc(getTableDocRef(num));
    if (snap.exists() && snap.data().status === 'open') { 
        selectTableAndStartListener(num); 
        input.value = ''; 
    } else { 
        showToast("Mesa não encontrada ou fechada.", true); 
    }
};

async function handleBillRequestConfirmation(tableId) {
    if (!tableId) return;
    const tableRef = getTableDocRef(tableId);
    try {
        await updateDoc(tableRef, { billRequested: false, waiterNotification: null });
        selectTableAndStartListener(tableId);
        goToScreen('paymentScreen');
    } catch (e) { console.error(e); showToast("Erro ao processar.", true); }
}

// --- AGRUPAMENTO E DESAGRUPAMENTO DE MESAS (ATUALIZADO) ---
export const openTableMergeModal = () => {
    const modal = document.getElementById('managerModal');
    if (!modal) return;

    // Tabelas Abertas (para agrupar)
    const openTables = currentTablesSnapshot
        .map(d => ({ id: d.id, ...d.data() })) 
        .filter(t => t.status === 'open')
        .sort((a, b) => a.tableNumber - b.tableNumber);

    // Tabelas Agrupadas (para desagrupar)
    const mergedTables = currentTablesSnapshot
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(t => t.status === 'merged')
        .sort((a, b) => a.tableNumber - b.tableNumber);

    // HTML para a aba "Juntar"
    const options = openTables.map(t => `<option value="${t.id}">Mesa ${t.tableNumber} (${formatCurrency(t.total)})</option>`).join('');
    const checks = openTables.map(t => `
        <div class="flex items-center bg-dark-input p-2 rounded border border-gray-700">
            <input type="checkbox" class="merge-checkbox h-5 w-5 text-indigo-600" value="${t.id}" id="cb_merge_${t.id}">
            <label for="cb_merge_${t.id}" class="ml-3 text-white font-bold">Mesa ${t.tableNumber} <span class="text-xs font-normal text-gray-400">(${formatCurrency(t.total)})</span></label>
        </div>`).join('');

    // HTML para a aba "Separar" - AQUI TAMBÉM USAMOS DATA-ACTION
    const ungroupList = mergedTables.length > 0 
        ? mergedTables.map(t => `
            <div class="flex justify-between items-center bg-dark-input p-3 rounded border border-gray-700 mb-2">
                <div>
                    <span class="text-yellow-400 font-bold">Mesa ${t.tableNumber}</span>
                    <span class="text-xs text-gray-400 block">Mestra: Mesa ${t.masterTable}</span>
                </div>
                <button class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold" 
                        data-action="ungroup" data-id="${t.id}" data-master="${t.masterTable}">
                    Separar
                </button>
            </div>`).join('')
        : '<p class="text-gray-500 italic text-center p-4">Nenhuma mesa agrupada no momento.</p>';

    modal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 p-6 rounded-xl shadow-2xl w-full max-w-lg">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-indigo-400">Gerenciar Mesas</h3>
                <div class="flex space-x-2 bg-gray-800 rounded p-1">
                    <button id="tabMerge" class="px-3 py-1 bg-indigo-600 text-white rounded text-xs font-bold transition">Juntar</button>
                    <button id="tabUngroup" class="px-3 py-1 bg-transparent text-gray-400 hover:text-white rounded text-xs font-bold transition">Separar</button>
                </div>
            </div>

            <div id="mergeTabContent">
                <div class="mb-4">
                    <label class="block text-sm font-bold text-white mb-2">MESA MESTRA (DESTINO)</label>
                    <select id="masterTableSelect" class="w-full p-3 bg-dark-input border border-gray-600 rounded-lg text-white">${options}</select>
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-bold text-white mb-2">MESAS PARA JUNTAR (ORIGEM)</label>
                    <div id="sourceTablesContainer" class="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">${checks}</div>
                </div>
                <p id="mergeError" class="text-red-400 text-sm font-bold hidden mb-3"></p>
                <div class="flex justify-end space-x-3 pt-2 border-t border-gray-700">
                    <button class="px-4 py-2 bg-gray-600 text-white rounded-lg" onclick="document.getElementById('managerModal').style.display='none'">Cancelar</button>
                    <button id="confirmMergeBtn" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold">Confirmar</button>
                </div>
            </div>

            <div id="ungroupTabContent" class="hidden">
                <div class="max-h-80 overflow-y-auto custom-scrollbar" id="ungroupListContainer">
                    ${ungroupList}
                </div>
                <div class="flex justify-end mt-4 pt-2 border-t border-gray-700">
                    <button class="px-4 py-2 bg-gray-600 text-white rounded-lg" onclick="document.getElementById('managerModal').style.display='none'">Fechar</button>
                </div>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
    
    // Configura listeners do Modal (Abas e Desagrupar)
    document.getElementById('tabMerge').onclick = () => {
        document.getElementById('mergeTabContent').style.display = 'block';
        document.getElementById('ungroupTabContent').style.display = 'none';
        document.getElementById('tabMerge').classList.add('bg-indigo-600', 'text-white');
        document.getElementById('tabMerge').classList.remove('bg-transparent', 'text-gray-400');
        document.getElementById('tabUngroup').classList.remove('bg-indigo-600', 'text-white');
        document.getElementById('tabUngroup').classList.add('bg-transparent', 'text-gray-400');
    };
    
    document.getElementById('tabUngroup').onclick = () => {
        document.getElementById('mergeTabContent').style.display = 'none';
        document.getElementById('ungroupTabContent').style.display = 'block';
        document.getElementById('tabUngroup').classList.add('bg-indigo-600', 'text-white');
        document.getElementById('tabUngroup').classList.remove('bg-transparent', 'text-gray-400');
        document.getElementById('tabMerge').classList.remove('bg-indigo-600', 'text-white');
        document.getElementById('tabMerge').classList.add('bg-transparent', 'text-gray-400');
    };

    document.getElementById('confirmMergeBtn').onclick = handleConfirmTableMerge;
    
    // Listener de Delegação para Desagrupar (Dentro do Modal)
    document.getElementById('ungroupListContainer').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="ungroup"]');
        if (btn) {
            handleConfirmUngroup(btn.dataset.id, btn.dataset.master);
        }
    });
};

// Lógica de Agrupar
export const handleConfirmTableMerge = async () => {
    const masterId = document.getElementById('masterTableSelect').value.trim();
    const container = document.getElementById('sourceTablesContainer');
    const checkedBoxes = container.querySelectorAll('.merge-checkbox:checked');
    const errorEl = document.getElementById('mergeError');
    const btn = document.getElementById('confirmMergeBtn');

    const sourceIds = Array.from(checkedBoxes).map(cb => cb.value.trim()).filter(id => id !== masterId);

    if (!masterId || sourceIds.length === 0) {
        errorEl.textContent = "Selecione a Mesa Mestra e pelo menos uma origem.";
        errorEl.style.display = 'block';
        return;
    }

    if (!confirm(`Juntar ${sourceIds.length} mesas na MESA (ID Doc: ${masterId})?`)) return;
    toggleLoading(btn, true, 'Agrupando...');

    try {
        const batch = writeBatch(db);
        const tablesCol = getTablesCollectionRef();
        const masterRef = doc(tablesCol, masterId); 
        const masterSnap = await getDoc(masterRef);
        
        if (!masterSnap.exists()) throw new Error(`Mesa Mestra inválida.`);
        
        let newTotal = masterSnap.data().total || 0;
        let newDiners = masterSnap.data().diners || 1;
        let items = masterSnap.data().sentItems || [];
        let reqs = masterSnap.data().requestedOrders || [];

        for (const id of sourceIds) {
            const sourceRef = doc(tablesCol, id); 
            const snap = await getDoc(sourceRef);

            if (snap.exists()) {
                const d = snap.data();
                newTotal += (d.total || 0);
                newDiners += (d.diners || 0);
                if (d.sentItems) items = items.concat(d.sentItems);
                if (d.requestedOrders) reqs = reqs.concat(d.requestedOrders);
                
                batch.update(sourceRef, {
                    status: 'merged', 
                    masterTable: masterSnap.data().tableNumber,
                    sentItems: [], requestedOrders: [],
                    total: 0, selectedItems: [], clientOrderPending: false
                });
            }
        }

        batch.update(masterRef, {
            total: newTotal, diners: newDiners, sentItems: items, requestedOrders: reqs,
            mergedTables: arrayUnion(...sourceIds),
            clientOrderPending: reqs.length > 0
        });

        await batch.commit();
        document.getElementById('managerModal').style.display = 'none';
        showToast("Mesas agrupadas!", false);

    } catch (e) {
        console.error(e);
        errorEl.textContent = "Erro: " + e.message;
        errorEl.style.display = 'block';
    } finally {
        toggleLoading(btn, false);
    }
};

// Lógica de Desagrupar
const handleConfirmUngroup = async (mergedTableId, masterTableNum) => {
    if (!confirm(`Deseja separar a Mesa ${mergedTableId}? Ela ficará LIVRE (fechada).`)) return;

    try {
        const batch = writeBatch(db);
        const tablesCol = getTablesCollectionRef();
        const mergedRef = doc(tablesCol, mergedTableId);
        const masterRef = doc(tablesCol, masterTableNum.toString());

        batch.update(masterRef, { mergedTables: arrayRemove(mergedTableId) });
        batch.update(mergedRef, { status: 'closed', masterTable: null, total: 0, diners: 0, mergedTables: [] });

        await batch.commit();
        
        openTableMergeModal(); 
        setTimeout(() => document.getElementById('tabUngroup').click(), 100);
        showToast(`Mesa ${mergedTableId} separada com sucesso!`, false);

    } catch (e) {
        console.error(e);
        showToast("Erro ao separar mesa: " + e.message, true);
    }
};

// --- INIT ---
export const initPanelController = async () => {
    if (panelInitialized) return;
    console.log("[PanelController] Inicializando...");
    await fetchServiceSectors();
    
    // Novo: Listener centralizado para ações na lista de mesas
    setupPanelEventListeners();

    const abrirBtn = document.getElementById('abrirMesaBtn');
    if (abrirBtn) abrirBtn.addEventListener('click', handleAbrirMesa);
    const searchBtn = document.getElementById('searchTableBtn');
    if (searchBtn) searchBtn.addEventListener('click', handleSearchTable);

    const check = () => {
        if (abrirBtn) {
            const m = document.getElementById('mesaInput').value;
            const p = document.getElementById('pessoasInput').value;
            const s = document.getElementById('sectorInput').value;
            abrirBtn.disabled = !(m && p && s);
        }
    };
    ['mesaInput', 'pessoasInput', 'sectorInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(id === 'sectorInput' ? 'change' : 'input', check);
    });

    panelInitialized = true;
    console.log("[PanelController] Inicializado.");
};