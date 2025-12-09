// --- CONTROLLERS/PANELCONTROLLER.JS (UX AJUSTADO: CARD COM RODAPÉ EM DUAS LINHAS) ---
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
        const q = query(getSectorsCollectionRef(), where('type', 'in', ['atendimento', 'service']), orderBy('name'));
        const snapshot = await getDocs(q);
        
        const dynamicSectors = snapshot.docs.map(doc => doc.data().name);
        
        const fixedSectors = ['Todos', ...dynamicSectors];
        if (!fixedSectors.includes('Cliente')) fixedSectors.push('Cliente');
        if (!fixedSectors.includes('Retirada')) fixedSectors.push('Retirada');

        SECTORS = fixedSectors;
        
        renderTableFilters();
        populateSectorDropdown();

    } catch (e) {
        console.error("Erro ao carregar setores dinâmicos:", e);
        SECTORS = ['Todos', 'Salão 1', 'Cliente', 'Retirada']; 
        renderTableFilters();
        populateSectorDropdown();
    }
};

const populateSectorDropdown = () => {
    const select = document.getElementById('sectorInput');
    const transferSelect = document.getElementById('newTableSector');
    
    const optionsHtml = '<option value="" disabled selected>Setor</option>' + 
        SECTORS.filter(s => s !== 'Todos').map(s => `<option value="${s}">${s}</option>`).join('');

    if (select) select.innerHTML = optionsHtml;
    if (transferSelect) transferSelect.innerHTML = optionsHtml;
};


// --- RENDERIZAÇÃO DE SETORES (FILTROS) ---
export const renderTableFilters = () => {
    const sectorFiltersContainer = document.getElementById('sectorFilters');
    if (!sectorFiltersContainer) return;

    sectorFiltersContainer.innerHTML = SECTORS.map(sector => {
        const isActive = sector === currentSectorFilter;
        let activeColor = 'bg-pumpkin border-pumpkin';
        if (sector === 'Cliente') activeColor = 'bg-indigo-600 border-indigo-600';
        if (sector === 'Retirada') activeColor = 'bg-green-600 border-green-600';

        const activeClasses = `${activeColor} text-white shadow-md`;
        const inactiveClasses = 'bg-dark-input text-dark-text border-gray-600 hover:bg-gray-700';
        
        return `
            <button class="sector-btn px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap border transition ${isActive ? activeClasses : inactiveClasses}" 
                    data-sector="${sector}">
                ${sector === 'Cliente' ? '<i class="fas fa-mobile-alt mr-1"></i>' : ''}
                ${sector === 'Retirada' ? '<i class="fas fa-bag-shopping mr-1"></i>' : ''}
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


// --- RENDERIZAÇÃO DE MESAS (UX ATUALIZADO) ---
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
            const isPickup = t.isPickup === true || t.sector === 'Retirada';

            // --- DEFINIÇÃO DE CORES E ALERTAS ---
            let cardColorClasses = 'bg-dark-card border-gray-700 text-dark-text hover:border-gray-500';
            let attentionIconHtml = '';

            // Lógica de Prioridade de Alertas (Do mais crítico para o menos)
            if (isBillRequested) {
                 cardColorClasses = 'bg-green-900/40 border-green-600 text-white hover:border-green-400 ring-1 ring-green-500/50 animate-pulse';
                 attentionIconHtml = `<button class="attention-icon-btn ml-2 bg-green-700 hover:bg-green-600 p-1.5 rounded text-white shadow flex items-center" data-action="confirm-bill" data-id="${tId}" title="Imprimir Conta">
                                        <i class="fas fa-print text-xs mr-1"></i> <span class="text-[10px] font-bold">CONTA</span>
                                     </button>`;
            }
            else if (isClientPending) {
                 cardColorClasses = 'bg-indigo-900/40 border-indigo-500 text-white hover:border-indigo-400 ring-1 ring-indigo-500/50 animate-pulse';
                 attentionIconHtml = `<div class="ml-2 px-2 py-0.5 bg-indigo-600 rounded text-white text-[10px] font-bold shadow animate-bounce"><i class="fas fa-bell mr-1"></i>CHAMADO</div>`;
            }
            else if (t.waiterNotification) {
                 attentionIconHtml = `<div class="ml-2 px-2 py-0.5 bg-orange-600 rounded text-white text-[10px] font-bold shadow animate-bounce" title="${t.waiterNotification}"><i class="fas fa-utensils mr-1"></i>PEDIDO</div>`;
            }
            else if (isMerged) {
                 cardColorClasses = 'bg-yellow-900/40 border-yellow-700 text-yellow-100 hover:border-yellow-500';
            } 
            else if (total > 0) {
                 cardColorClasses = 'bg-red-900/20 border-red-800/50 text-red-200 hover:border-red-600 hover:bg-red-900/30';
            } else {
                 cardColorClasses = 'bg-green-900/20 border-green-800/50 text-green-200 hover:border-green-600 hover:bg-green-900/30';
            }

            if (isPickup) cardColorClasses += ' border-l-4 border-l-green-400';
            else if (t.sector === 'Cliente') cardColorClasses += ' border-l-4 border-l-indigo-400';

            // --- TIMER E KDS ---
            let lastSentAt = null;
            if (t.lastKdsSentAt?.toMillis) lastSentAt = t.lastKdsSentAt.toMillis();
            else if (typeof t.lastKdsSentAt === 'number') lastSentAt = t.lastKdsSentAt;

            const elapsedTime = lastSentAt ? formatElapsedTime(lastSentAt) : null;
            
            // Timer agora é um badge mais discreto
            const timerHtml = elapsedTime ? 
                `<div class="text-[10px] font-mono text-gray-300 bg-black/40 px-2 py-1 rounded flex items-center" title="Tempo desde último pedido">
                    <i class="fas fa-clock mr-1.5 opacity-70"></i><span>${elapsedTime}</span>
                 </div>` : '<span></span>';
            
            let kdsStatusButtonHtml = '';
            if (lastSentAt) {
                 let kdsIconClass = "text-gray-400 hover:text-white bg-gray-700/50 border-gray-600";
                 let kdsIcon = "fa-fire"; 
                 let kdsTitle = "Na Cozinha";

                 if (t.kdsAlert === 'ready') {
                     kdsIconClass = "text-white bg-green-600 hover:bg-green-500 animate-pulse font-bold border-green-400 shadow-lg shadow-green-900/50";
                     kdsIcon = "fa-check"; 
                     kdsTitle = "PEDIDO PRONTO!";
                 }

                 kdsStatusButtonHtml = `<button class="kds-status-icon-btn ${kdsIconClass} border w-8 h-7 rounded flex items-center justify-center transition ml-2" title="${kdsTitle}" data-action="open-kds" data-id="${tId}">
                                            <i class="fas ${kdsIcon} text-xs"></i>
                                        </button>`;
            }
            
            const mergeIconHtml = isMerged ? 
                `<span class="text-xs opacity-75 ml-auto"><i class="fas fa-link mr-1"></i>${t.masterTable}</span>` : 
                `<button class="merge-icon-btn text-gray-500 hover:text-white ml-auto" title="Agrupar Mesas" data-action="open-merge"><i class="fas fa-people-arrows"></i></button>`;
            
            const clientInfo = t.clientName ? `<p class="text-xs font-semibold truncate w-full opacity-80"><i class="fas fa-user-circle mr-1"></i>${t.clientName}</p>` : '';
            const dinersInfo = `<span class="text-xs opacity-60 font-medium flex items-center"><i class="fas fa-user mr-1"></i>${t.diners || 1}</span>`;

            // Nome da Mesa
            let displayTableName = `Mesa ${t.tableNumber}`;
            if (isPickup) displayTableName = `Retirada #${t.tableNumber}`;

            // --- MONTAGEM DO HTML ---
            const cardHtml = `
                <div class="table-card-panel ${cardColorClasses} shadow-sm hover:shadow-md transition-all duration-200 relative rounded-lg p-3 flex flex-col justify-between h-[9.5rem] border cursor-pointer group" data-table-id="${tId}">
                    
                    <div class="flex justify-between items-start mb-1">
                        <div>
                            <h3 class="font-bold text-lg leading-none truncate w-32" title="${displayTableName}">${displayTableName}</h3>
                            <p class="text-[10px] uppercase font-bold opacity-50 tracking-wider mt-0.5">${t.sector || 'N/A'}</p>
                        </div>
                        ${mergeIconHtml} 
                    </div>
                    
                    <div class="flex-grow flex flex-col justify-center py-1 text-indigo-200">
                        ${clientInfo}
                    </div>

                    <div class="border-t border-white/10 pt-2 mt-1">
                        
                        <div class="flex justify-between items-center mb-2">
                            <span class="font-mono font-bold text-2xl text-white tracking-tight leading-none">${formatCurrency(total)}</span>
                            ${dinersInfo}
                        </div>

                        <div class="flex items-center justify-between h-7">
                             <div class="flex-shrink-0">
                                ${timerHtml}
                             </div>

                             <div class="flex items-center justify-end">
                                ${attentionIconHtml}
                                ${kdsStatusButtonHtml}
                             </div>
                        </div>
                    </div>

                </div>`;
            openTablesList.innerHTML += cardHtml;
        }
    });

    openTablesCount.textContent = count;
    if (count === 0) openTablesList.innerHTML = `<div class="col-span-full flex flex-col items-center justify-center p-8 border border-dashed border-gray-700 rounded-xl text-gray-500"><i class="fas fa-chair text-3xl mb-2 opacity-50"></i><p>Nenhuma mesa neste setor.</p></div>`;
};

// --- FUNÇÃO CENTRAL DE EVENTOS ---
const setupPanelEventListeners = () => {
    const list = document.getElementById('openTablesList');
    
    list.addEventListener('click', (e) => {
        const actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
            e.stopPropagation(); 
            const action = actionBtn.dataset.action;
            const id = actionBtn.dataset.id;

            if (action === 'open-kds') openKdsStatusModal(id);
            else if (action === 'open-merge') openTableMergeModal();
            else if (action === 'confirm-bill') handleBillRequestConfirmation(id);
            return;
        }

        const card = e.target.closest('.table-card-panel');
        if (card) {
            const tableId = card.dataset.tableId;
            if (tableId) selectTableAndStartListener(tableId);
        }
    });
};

export const loadOpenTables = () => {
    if (unsubscribeTables) { unsubscribeTables(); unsubscribeTables = null; }
    
    let qBase = getTablesCollectionRef();
    let constraints = [where('status', 'in', ['open', 'merged']), orderBy('tableNumber', 'asc')];

    if (currentSectorFilter !== 'Todos') {
        constraints.splice(1, 0, where('sector', '==', currentSectorFilter));
    }
    
    let q = query(qBase, ...constraints);

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
        if (openTablesList) openTablesList.innerHTML = `<div class="col-span-full text-center p-4 text-red-400 bg-red-900/20 rounded border border-red-800"><p class="text-sm">Erro de conexão: ${error.message}</p></div>`;
        console.error("Erro fatal ao carregar mesas:", error);
    });
};

// ... (KDS, Abrir Mesa, etc - Inalterados)
const openKdsStatusModal = async (tableId) => {
    const modal = document.getElementById('tableKdsModal');
    const content = document.getElementById('tableKdsContent');
    document.getElementById('tableKdsTitle').textContent = `Cozinha - Mesa ${tableId}`;
    content.innerHTML = `<div class="flex justify-center py-8"><i class="fas fa-spinner fa-spin text-pumpkin text-3xl"></i></div>`;
    modal.style.display = 'flex';

    try {
        const q = query(getKdsCollectionRef(), where('tableNumber', '==', parseInt(tableId)), where('status', 'in', ['pending', 'preparing', 'finished']), orderBy('sentAt', 'desc'));
        const snapshot = await getDocs(q);

        if (snapshot.empty) { content.innerHTML = `<div class="text-center py-6 opacity-50"><i class="fas fa-check-circle text-4xl text-gray-500 mb-2"></i><p class="text-gray-400">Nenhum pedido ativo.</p></div>`; return; }

        let htmlProducing = '', htmlReady = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const isDone = data.status === 'finished';
            const time = data.sentAt?.toDate ? data.sentAt.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--';
            let itemsHtml = '';
            if (data.sectors) { Object.entries(data.sectors).forEach(([sectorName, items]) => { itemsHtml += `<div class="mt-1"><p class="text-[10px] uppercase font-bold text-gray-500">${sectorName}</p>${items.map(item => `<div class="flex justify-between text-sm"><span class="text-gray-200 font-medium">${item.name}</span>${item.note ? `<span class="text-xs text-yellow-500 ml-2">(${item.note})</span>` : ''}</div>`).join('')}</div>`; }); }
            const card = `<div class="bg-dark-input border ${isDone ? 'border-green-500/50 bg-green-900/10' : 'border-gray-700'} rounded-lg p-3 shadow-sm mb-2 relative overflow-hidden"><div class="flex justify-between items-center mb-1 border-b border-gray-700/50 pb-1"><span class="text-xs font-mono text-gray-500">#${data.orderId.slice(-4)} - ${time}</span><span class="text-xs font-bold uppercase ${isDone ? 'text-green-400' : 'text-blue-400'}">${isDone ? 'PRONTO' : 'PREPARANDO'}</span></div>${itemsHtml}</div>`;
            if (isDone) htmlReady += card; else htmlProducing += card;
        });

        content.innerHTML = '';
        if (htmlReady) content.innerHTML += `<div class="mb-4"><h4 class="text-green-400 font-bold text-sm uppercase mb-2 border-b border-green-900 pb-1"><i class="fas fa-bell mr-2"></i>PRONTO PARA LEVAR</h4>${htmlReady}</div>`;
        if (htmlProducing) content.innerHTML += `<div><h4 class="text-blue-400 font-bold text-sm uppercase mb-2 border-b border-blue-900 pb-1"><i class="fas fa-fire mr-2"></i>NA COZINHA</h4>${htmlProducing}</div>`;

        content.innerHTML += `<div class="mt-4 pt-3 border-t border-gray-700"><button id="btnConfirmDelivery" class="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-md transition flex items-center justify-center"><i class="fas fa-check-double mr-2"></i> Confirmar Entrega</button></div>`;
        const deliverBtn = document.getElementById('btnConfirmDelivery');
        deliverBtn.onclick = async () => { toggleLoading(deliverBtn, true, 'Confirmando...'); try { await updateDoc(getTableDocRef(tableId), { waiterNotification: null, kdsAlert: null }); modal.style.display = 'none'; showToast("Entrega confirmada!", false); } catch (e) { console.error(e); showToast("Erro ao confirmar.", true); toggleLoading(deliverBtn, false); } };
    } catch (error) { console.error("Erro status KDS:", error); content.innerHTML = `<div class="text-center py-4"><p class="text-red-400 font-bold mb-1">Erro</p><p class="text-xs text-gray-500">${error.message}</p></div>`; }
};

export const handleAbrirMesa = async () => {
    const btn = document.getElementById('abrirMesaBtn'); const num = parseInt(document.getElementById('mesaInput').value); const diners = parseInt(document.getElementById('pessoasInput').value); const sector = document.getElementById('sectorInput').value;
    if (!num || !diners || !sector) { showToast('Preencha todos os campos.', true); return; }
    toggleLoading(btn, true, 'Abrindo...');
    try {
        if (userId) { const activeSnap = await getDocs(query(getTablesCollectionRef(), where('status', '==', 'open'), where('openedBy', '==', userId))); if (!activeSnap.empty) { showToast(`Mesa ${activeSnap.docs[0].data().tableNumber} já aberta.`, true); toggleLoading(btn, false); return; } }
        const tableRef = getTableDocRef(num); const snap = await getDoc(tableRef);
        if (snap.exists() && snap.data().status === 'open') { showToast(`Mesa ${num} já aberta!`, true); toggleLoading(btn, false); return; }
        await setDoc(tableRef, { tableNumber: num, diners, sector, status: 'open', createdAt: serverTimestamp(), total: 0, sentItems: [], payments: [], serviceTaxApplied: true, selectedItems: [], accessPin: Math.floor(1000 + Math.random() * 9000).toString(), openedBy: userId || 'anonymous' });
        document.getElementById('mesaInput').value = ''; document.getElementById('pessoasInput').value = ''; showToast(`Mesa ${num} aberta!`, false); selectTableAndStartListener(num.toString());
    } catch (e) { showToast("Erro ao abrir.", true); console.error(e); } finally { toggleLoading(btn, false); }
};

export const handleSearchTable = async () => { const input = document.getElementById('searchTableInput'); const num = input.value; if (!num) return; const snap = await getDoc(getTableDocRef(num)); if (snap.exists() && snap.data().status === 'open') { selectTableAndStartListener(num); input.value = ''; } else { showToast("Mesa não encontrada.", true); } };
async function handleBillRequestConfirmation(tableId) { if (!tableId) return; const tableRef = getTableDocRef(tableId); try { await updateDoc(tableRef, { billRequested: false, waiterNotification: null }); selectTableAndStartListener(tableId); goToScreen('paymentScreen'); } catch (e) { console.error(e); showToast("Erro.", true); } }
export const openTableMergeModal = () => { /* ... */ }; 
export const handleConfirmTableMerge = async () => { /* ... */ }; 
const handleConfirmUngroup = async (m, ma) => { /* ... */ }; 
export const initPanelController = async () => { if (panelInitialized) return; console.log("[PanelController] Inicializando..."); await fetchServiceSectors(); setupPanelEventListeners(); const abrirBtn = document.getElementById('abrirMesaBtn'); if (abrirBtn) abrirBtn.addEventListener('click', handleAbrirMesa); const searchBtn = document.getElementById('searchTableBtn'); if (searchBtn) searchBtn.addEventListener('click', handleSearchTable); const check = () => { if (abrirBtn) { const m = document.getElementById('mesaInput').value; const p = document.getElementById('pessoasInput').value; const s = document.getElementById('sectorInput').value; abrirBtn.disabled = !(m && p && s); } }; ['mesaInput', 'pessoasInput', 'sectorInput'].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener(id === 'sectorInput' ? 'change' : 'input', check); }); panelInitialized = true; console.log("[PanelController] Inicializado."); };