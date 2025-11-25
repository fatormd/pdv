// --- CONTROLLERS/PANELCONTROLLER.JS (VERSÃO FINAL - CORREÇÃO DE ID) ---
import { 
    getTablesCollectionRef, 
    getTableDocRef, 
    db, 
    getSectorsCollectionRef, 
    getKdsCollectionRef 
} from "/services/firebaseService.js";

import { 
    query, where, orderBy, onSnapshot, getDoc, setDoc, updateDoc, 
    serverTimestamp, writeBatch, arrayUnion, getDocs, doc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { formatCurrency, formatElapsedTime, toggleLoading } from "/utils.js";
import { goToScreen, selectTableAndStartListener, playNotificationSound, showToast, userId } from "/app.js";

// --- ESTADO ---
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
        SECTORS = dynamicSectors.length > 0 ? ['Todos', ...dynamicSectors] : ['Todos', 'Salão 1', 'Bar', 'Mezanino', 'Calçada'];
        renderTableFilters();
        populateSectorDropdown();
    } catch (e) {
        console.error("Erro setores:", e);
        renderTableFilters();
        populateSectorDropdown();
    }
};

const populateSectorDropdown = () => {
    const select = document.getElementById('sectorInput');
    const transferSelect = document.getElementById('newTableSector');
    const optionsHtml = '<option value="" disabled selected>Setor</option>' + SECTORS.slice(1).map(s => `<option value="${s}">${s}</option>`).join('');
    if (select) select.innerHTML = optionsHtml;
    if (transferSelect) transferSelect.innerHTML = optionsHtml;
};

export const renderTableFilters = () => {
    const container = document.getElementById('sectorFilters');
    if (!container) return;
    container.innerHTML = SECTORS.map(sector => {
        const isActive = sector === currentSectorFilter;
        return `<button class="sector-btn px-4 py-3 rounded-full text-base font-semibold whitespace-nowrap ${isActive ? 'bg-pumpkin text-white border-pumpkin' : 'bg-dark-input text-dark-text border-gray-600'}" data-sector="${sector}">${sector}</button>`;
    }).join('');
    
    container.querySelectorAll('.sector-btn').forEach(btn => {
        btn.onclick = () => {
            currentSectorFilter = btn.dataset.sector;
            renderTableFilters();
            loadOpenTables();
        };
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
            const isMerged = t.status === 'merged';
            let cardClass = 'bg-dark-card border-gray-700 text-dark-text hover:bg-gray-700';
            let icon = '';

            if (isMerged) {
                 cardClass = 'bg-yellow-900 border-yellow-700 text-yellow-200 hover:bg-yellow-800';
                 icon = `<i class="fas fa-link attention-icon text-yellow-300" title="Agrupada na Mesa ${t.masterTable}"></i>`;
            } else if (t.billRequested) {
                 cardClass = 'bg-green-900 border-green-700 text-white hover:bg-green-800 ring-2 ring-green-400 animate-pulse';
                 icon = `<button class="attention-icon-btn bill-request-icon" data-id="${tId}"><i class="fas fa-print text-xl text-green-400 animate-pulse"></i></button>`;
            } else if (t.clientOrderPending) {
                 cardClass = 'bg-indigo-900 border-yellow-400 text-white hover:bg-indigo-800 ring-2 ring-yellow-400 animate-pulse';
                 icon = `<i class="fas fa-bell attention-icon text-yellow-400 animate-pulse"></i>`;
            } else if (t.total > 0) {
                 cardClass = 'bg-red-900 border-red-700 text-red-200 hover:bg-red-800';
            } else {
                 cardClass = 'bg-green-900 border-green-700 text-green-200 hover:bg-green-800';
            }

            const time = t.lastKdsSentAt ? formatElapsedTime(t.lastKdsSentAt.toMillis ? t.lastKdsSentAt.toMillis() : t.lastKdsSentAt) : null;
            const kdsBtn = t.lastKdsSentAt ? `<button class="kds-status-icon-btn" onclick="window.openKdsStatusModal('${tId}')"><i class="fas fa-tasks"></i></button>` : '';
            const mergeBtn = isMerged ? '' : `<button class="merge-icon-btn" onclick="window.openTableMergeModal()"><i class="fas fa-people-arrows"></i></button>`;

            const html = `
                <div class="table-card-panel ${cardClass} shadow-md transition-colors duration-200 relative" data-id="${tId}">
                    ${mergeBtn} ${icon}
                    <h3 class="font-bold text-2xl">Mesa ${t.tableNumber}</h3>
                    <p class="text-xs font-light">Setor: ${t.sector || 'N/A'}</p>
                    ${t.clientName ? `<p class="text-xs font-semibold">${t.clientName}</p>` : ''}
                    <span class="font-bold text-lg mt-2">${formatCurrency(t.total || 0)}</span>
                    <p class="text-xs font-light mt-1">${isMerged ? `Mestra: ${t.masterTable}` : `Pessoas: ${t.diners}`}</p>
                    <div class="flex items-center justify-center space-x-2 w-full mt-2">${kdsBtn} ${time ? `<div class="table-timer"><i class="fas fa-clock"></i> <span>${time}</span></div>` : ''}</div>
                </div>`;
            list.innerHTML += html;
        }
    });

    countEl.textContent = count;
    if (count === 0) list.innerHTML = `<div class="col-span-full text-sm text-dark-placeholder italic p-4 content-card bg-dark-card border border-gray-700">Nenhuma mesa no setor "${currentSectorFilter}".</div>`;

    list.querySelectorAll('.table-card-panel').forEach(card => {
        card.onclick = (e) => {
            if (!e.target.closest('button') && !e.target.closest('.attention-icon')) selectTableAndStartListener(card.dataset.id);
        };
    });
    list.querySelectorAll('.bill-request-icon').forEach(btn => btn.onclick = (e) => { e.stopPropagation(); window.handleBillRequestConfirmation(btn.dataset.id); });
};

export const loadOpenTables = () => {
    if (unsubscribeTables) { unsubscribeTables(); unsubscribeTables = null; }
    let q = query(getTablesCollectionRef(), where('status', 'in', ['open', 'merged']), orderBy('tableNumber', 'asc'));
    if (currentSectorFilter !== 'Todos') q = query(getTablesCollectionRef(), where('status', 'in', ['open', 'merged']), where('sector', '==', currentSectorFilter), orderBy('tableNumber', 'asc'));

    unsubscribeTables = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "modified" && (change.doc.data().billRequested || change.doc.data().clientOrderPending)) playNotificationSound();
        });
        renderTables(snapshot.docs);
    }, (e) => console.error("Erro tables:", e));
};

// --- KDS STATUS ---
window.openKdsStatusModal = async (tableId) => {
    const modal = document.getElementById('tableKdsModal');
    const content = document.getElementById('tableKdsContent');
    document.getElementById('tableKdsTitle').textContent = `Cozinha - Mesa ${tableId}`;
    content.innerHTML = `<div class="flex justify-center py-8"><i class="fas fa-spinner fa-spin text-pumpkin text-3xl"></i></div>`;
    modal.style.display = 'flex';

    try {
        const q = query(getKdsCollectionRef(), where('tableNumber', '==', parseInt(tableId)), where('status', 'in', ['pending', 'preparing', 'finished']), orderBy('sentAt', 'desc'));
        const snap = await getDocs(q);
        if (snap.empty) { content.innerHTML = `<div class="text-center py-6 opacity-50">Nenhum pedido ativo.</div>`; return; }

        const html = snap.docs.map(d => {
            const data = d.data();
            const isDone = data.status === 'finished';
            let items = '';
            if (data.sectors) Object.values(data.sectors).forEach(sItems => sItems.forEach(i => items += `<div class="text-sm">${i.name} ${i.note ? `<span class="text-xs text-yellow-500">(${i.note})</span>` : ''}</div>`));
            return `<div class="bg-dark-input border ${isDone ? 'border-green-500/50' : 'border-gray-700'} rounded p-3 mb-2"><div class="flex justify-between text-xs font-bold mb-1 text-gray-500"><span>#${data.orderId.slice(-4)}</span><span>${isDone ? 'PRONTO' : 'PREPARANDO'}</span></div>${items}</div>`;
        }).join('');
        content.innerHTML = html;
        await updateDoc(getTableDocRef(tableId), { waiterNotification: null });
    } catch (e) { content.innerHTML = `<p class="text-red-400 text-center">Erro ao carregar.</p>`; }
};

// --- AÇÕES DE MESA ---
export const handleAbrirMesa = async () => {
    const btn = document.getElementById('abrirMesaBtn');
    const num = parseInt(document.getElementById('mesaInput').value);
    const diners = parseInt(document.getElementById('pessoasInput').value);
    const sector = document.getElementById('sectorInput').value;

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
        
        document.getElementById('mesaInput').value = ''; document.getElementById('pessoasInput').value = '';
        showToast(`Mesa ${num} aberta!`, false);
        selectTableAndStartListener(num.toString());
    } catch (e) { showToast("Erro ao abrir.", true); console.error(e); } 
    finally { toggleLoading(btn, false); }
};

export const handleSearchTable = async () => {
    const num = document.getElementById('searchTableInput').value;
    if (!num) return;
    const snap = await getDoc(getTableDocRef(num));
    if (snap.exists() && snap.data().status === 'open') { selectTableAndStartListener(num); document.getElementById('searchTableInput').value = ''; }
    else showToast("Mesa não encontrada ou fechada.", true);
};

// --- AGRUPAMENTO DE MESAS (CORRIGIDO) ---
export const openTableMergeModal = () => {
    const modal = document.getElementById('managerModal');
    if (!modal) return;

    // FIX: Mapeia com ID do Documento
    const tables = currentTablesSnapshot
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(t => t.status === 'open' && (t.total > 0 || (t.sentItems && t.sentItems.length > 0)))
        .sort((a, b) => a.tableNumber - b.tableNumber);

    if (tables.length < 2) { showToast("Precisa de pelo menos 2 mesas ativas.", true); return; }

    // FIX: Value é o ID do documento (t.id)
    const options = tables.map(t => `<option value="${t.id}">Mesa ${t.tableNumber} (${formatCurrency(t.total)})</option>`).join('');
    const checks = tables.map(t => `
        <div class="flex items-center bg-dark-input p-2 rounded border border-gray-700">
            <input type="checkbox" class="merge-checkbox h-5 w-5 text-indigo-600" value="${t.id}" id="cb_merge_${t.id}">
            <label for="cb_merge_${t.id}" class="ml-3 text-white font-bold">Mesa ${t.tableNumber} <span class="text-xs font-normal text-gray-400">(${formatCurrency(t.total)})</span></label>
        </div>`).join('');

    modal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 p-6 rounded-xl shadow-2xl w-full max-w-lg">
            <h3 class="text-xl font-bold mb-4 text-indigo-400">Agrupar Mesas</h3>
            <div class="mb-4">
                <label class="block text-sm font-bold text-white mb-2">MESA MESTRA (DESTINO)</label>
                <select id="masterTableSelect" class="w-full p-3 bg-dark-input border border-gray-600 rounded-lg text-white">${options}</select>
            </div>
            <div class="mb-4">
                <label class="block text-sm font-bold text-white mb-2">MESAS PARA JUNTAR (ORIGEM)</label>
                <div id="sourceTablesContainer" class="space-y-2 max-h-60 overflow-y-auto">${checks}</div>
            </div>
            <p id="mergeError" class="text-red-400 text-sm font-bold hidden mb-3"></p>
            <div class="flex justify-end space-x-3">
                <button class="px-4 py-3 bg-gray-600 text-white rounded-lg" onclick="document.getElementById('managerModal').style.display='none'">Cancelar</button>
                <button id="confirmMergeBtn" class="px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold">Confirmar</button>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
    
    document.getElementById('confirmMergeBtn').onclick = handleConfirmTableMerge;
};

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
        
        // Busca direta pelo ID do Documento (infalível)
        const masterRef = doc(tablesCol, masterId); 
        const masterSnap = await getDoc(masterRef);
        
        if (!masterSnap.exists()) throw new Error(`Mesa Mestra (ID: ${masterId}) não encontrada.`);
        
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
                    masterTable: masterSnap.data().tableNumber, // Exibe o número da mesa para o usuário
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
        loadOpenTables();
        showToast("Mesas agrupadas!", false);

    } catch (e) {
        console.error(e);
        errorEl.textContent = "Erro: " + e.message;
        errorEl.style.display = 'block';
    } finally {
        toggleLoading(btn, false);
    }
};

// --- INIT ---
export const initPanelController = async () => {
    if (panelInitialized) return;
    console.log("[PanelController] Inicializando...");
    await fetchServiceSectors();
    
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