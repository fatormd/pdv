// --- CONTROLLERS/PANELCONTROLLER.JS ---
import { getTablesCollectionRef, getTableDocRef } from "/services/firebaseService.js"; // Removido 'auth' não usado aqui
import { query, where, orderBy, onSnapshot, getDoc, setDoc, updateDoc, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { formatCurrency, formatElapsedTime } from "/utils.js";
// Importa funções necessárias do app.js
import { goToScreen, currentTableId, selectedItems, unsubscribeTable, currentOrderSnapshot, setCurrentTable, userRole, selectTableAndStartListener } from "/app.js"; // Importa selectTableAndStartListener
// Removido: import { fetchWooCommerceProducts } from "/services/wooCommerceService.js";
// Removido: import { renderMenu } from "./orderController.js";

// --- ESTADO DO MÓDULO ---
const SECTORS = ['Todos', 'Salão 1', 'Bar', 'Mezanino', 'Calçada'];
let currentSectorFilter = 'Todos';
let unsubscribeTables = null;
let panelInitialized = false;


// --- FUNÇÃO DE ALERTA CUSTOMIZADO ---
const showCustomAlert = (title, message) => { /* ... (mantida) ... */ };


// --- RENDERIZAÇÃO DE SETORES ---
export const renderTableFilters = () => { /* ... (lógica mantida) ... */ };


// --- RENDERIZAÇÃO E CARREGAMENTO DE MESAS ---
const renderTables = (docs) => {
    const openTablesList = document.getElementById('openTablesList');
    const openTablesCount = document.getElementById('openTablesCount');
    if (!openTablesList || !openTablesCount) return;

    openTablesList.innerHTML = '';
    let count = 0;

    docs.forEach(doc => {
        const table = doc.data();
        const tableId = doc.id;

        if (table.status?.toLowerCase() === 'open') {
            count++;
            const total = table.total || 0;
            const isClientPending = table.clientOrderPending || false;

            let cardColorClasses = 'bg-dark-card border-gray-700 text-dark-text hover:bg-gray-700';
            if (total > 0) cardColorClasses = 'bg-red-900 border-red-700 text-red-200 hover:bg-red-800';
            else cardColorClasses = 'bg-green-900 border-green-700 text-green-200 hover:bg-green-800';
            if (isClientPending) cardColorClasses = 'bg-indigo-900 border-yellow-400 text-white hover:bg-indigo-800';

            let attentionIconHtml = '';
            const hasAguardandoItem = (table.selectedItems || []).some(item => item.note?.toLowerCase().includes('espera'));

            if (isClientPending) attentionIconHtml = `<i class="fas fa-bell attention-icon text-yellow-400" title="Pedido Cliente"></i>`;
            else if (hasAguardandoItem) attentionIconHtml = `<i class="fas fa-exclamation-triangle attention-icon" title="Itens Espera"></i>`;

            let lastSentAt = null;
            if (table.lastKdsSentAt?.toMillis) lastSentAt = table.lastKdsSentAt.toMillis();
            else if (typeof table.lastKdsSentAt === 'number') lastSentAt = table.lastKdsSentAt;

            const elapsedTime = lastSentAt ? formatElapsedTime(lastSentAt) : null;
            const timerHtml = elapsedTime ? `<div class="table-timer"><i class="fas fa-clock"></i> <span>${elapsedTime}</span></div>` : '';
            const statusIconHtml = lastSentAt ? `<button class="kds-status-icon-btn" title="Status KDS" onclick="window.openKdsStatusModal(${tableId})"><i class="fas fa-tasks"></i></button>` : '';
            const clientInfo = table.clientName ? `<p class="text-xs font-semibold">${table.clientName}</p>` : '';

            const cardHtml = `
                <div class="table-card-panel ${cardColorClasses} shadow-md transition-colors duration-200 relative" data-table-id="${tableId}">
                    ${attentionIconHtml} ${statusIconHtml}
                    <h3 class="font-bold text-2xl">Mesa ${table.tableNumber}</h3>
                    <p class="text-xs font-light">Setor: ${table.sector || 'N/A'}</p>
                    ${clientInfo}
                    <span class="font-bold text-lg mt-2">${formatCurrency(total)}</span>
                    ${timerHtml}
                </div>`;
            openTablesList.innerHTML += cardHtml;
        }
    });

    openTablesCount.textContent = count;
    if (count === 0) openTablesList.innerHTML = `<div class="col-span-full text-sm text-dark-placeholder italic p-4 content-card bg-dark-card border border-gray-700">Nenhuma mesa aberta no setor "${currentSectorFilter}".</div>`;

    // Reanexa listeners
    document.querySelectorAll('.table-card-panel').forEach(card => {
        const newCard = card.cloneNode(true);
        card.parentNode.replaceChild(newCard, card);
        newCard.addEventListener('click', (e) => {
            if (e.target.closest('.kds-status-icon-btn')) return;
            const tableId = newCard.dataset.tableId;
            if (tableId) {
                // Chama a função importada do app.js para selecionar a mesa
                selectTableAndStartListener(tableId);
            }
        });
    });
};

export const loadOpenTables = () => {
    if (unsubscribeTables) { unsubscribeTables(); unsubscribeTables = null; }
    const tablesCollection = getTablesCollectionRef();
    let q;
    if (currentSectorFilter === 'Todos') q = query(tablesCollection, where('status', '==', 'open'), orderBy('tableNumber', 'asc'));
    else q = query(tablesCollection, where('status', '==', 'open'), where('sector', '==', currentSectorFilter), orderBy('tableNumber', 'asc'));

    console.log(`[Panel] Configurando listener: ${currentSectorFilter === 'Todos' ? 'Todos' : `Setor ${currentSectorFilter}`}`);
    unsubscribeTables = onSnapshot(q, (snapshot) => {
        console.log(`[Panel] Snapshot: ${snapshot.docs.length} mesas.`);
        renderTables(snapshot.docs);
    }, (error) => {
        const openTablesList = document.getElementById('openTablesList');
        const errorMessage = error.message || "Erro desconhecido.";
        if (openTablesList) openTablesList.innerHTML = `<div class="col-span-full text-sm text-red-400 font-bold italic p-4 content-card bg-dark-card border border-red-700">ERRO FIREBASE: ${errorMessage}</div>`;
        console.error("Erro fatal ao carregar mesas:", error);
    });
};

export const handleAbrirMesa = async () => { /* ... (lógica mantida) ... */ };

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
        // Chama a função importada do app.js
        selectTableAndStartListener(tableNumber);
        if(searchTableInput) searchTableInput.value = '';
    } else {
        console.log(`[Panel] Mesa ${tableNumber} não encontrada ou fechada.`);
        alert(`A Mesa ${tableNumber} não está aberta.`);
    }
};

// REMOVIDO: export const openTableForOrder = async (...) => { ... }; // Lógica movida para app.js/selectTableAndStartListener
// REMOVIDO: export const loadTableOrder = (tableId) => { ... }; // Lógica movida para app.js/setCurrentTable

// FUNÇÃO DE TRANSFERÊNCIA (EXPORTADA)
export const handleTableTransferConfirmed = async (originTableId, targetTableId, itemsToTransfer, newDiners = 0, newSector = '') => {
    if (!originTableId || !targetTableId || itemsToTransfer.length === 0) { alert("Erro: Dados de transferência incompletos."); return; }
    const originTableRef = getTableDocRef(originTableId);
    const targetTableRef = getTableDocRef(targetTableId);
    // Importa writeBatch aqui para garantir que esteja disponível
    const { getFirestore, writeBatch, arrayRemove, arrayUnion } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
    const db = getFirestore();
    const batch = writeBatch(db);

    try {
        const targetSnap = await getDoc(targetTableRef);
        const targetTableIsOpen = targetSnap.exists() && targetSnap.data().status?.toLowerCase() === 'open';

        // 1. Abertura/Setup da Mesa de Destino
        if (!targetTableIsOpen) {
            if (!newDiners || !newSector) { alert("Erro: Mesa destino fechada. Pessoas e setor obrigatórios."); return; }
            console.log(`[Panel] Abrindo Mesa ${targetTableId} para transferência.`);
            batch.set(targetTableRef, {
                tableNumber: parseInt(targetTableId), diners: newDiners, sector: newSector, status: 'open',
                createdAt: serverTimestamp(), total: 0, sentItems: [], payments: [], serviceTaxApplied: true, selectedItems: []
            });
        }

        // 2. Transferência dos Itens
        const transferValue = itemsToTransfer.reduce((sum, item) => sum + (item.price || 0), 0);
        const originCurrentTotal = currentOrderSnapshot?.total || 0; // Usa snapshot global
        const originNewTotal = Math.max(0, originCurrentTotal - transferValue);
        itemsToTransfer.forEach(item => {
            batch.update(originTableRef, { sentItems: arrayRemove(item) });
        });
        batch.update(originTableRef, { total: originNewTotal });

        const targetData = targetTableIsOpen ? targetSnap.data() : { total: 0 };
        const targetNewTotal = (targetData.total || 0) + transferValue;
        batch.update(targetTableRef, {
            sentItems: arrayUnion(...itemsToTransfer),
            total: targetNewTotal
        });

        await batch.commit();
        alert(`Sucesso! ${itemsToTransfer.length} item(s) transferidos da Mesa ${originTableId} para ${targetTableId}.`);
        goToScreen('panelScreen');

    } catch (e) {
        console.error("Erro na transferência de mesa:", e);
        alert("Falha na transferência dos itens.");
    }
};


// Função de inicialização do Controller
export const initPanelController = () => {
    if (panelInitialized) return;
    console.log("[PanelController] Inicializando...");

    const abrirMesaBtn = document.getElementById('abrirMesaBtn');
    const searchTableBtn = document.getElementById('searchTableBtn');
    const sectorFiltersContainer = document.getElementById('sectorFilters');
    const mesaInput = document.getElementById('mesaInput');
    const pessoasInput = document.getElementById('pessoasInput');
    const sectorInput = document.getElementById('sectorInput');

    if (abrirMesaBtn) abrirMesaBtn.addEventListener('click', handleAbrirMesa);
    else console.error("[PanelController] Botão 'abrirMesaBtn' não encontrado.");

    if (searchTableBtn) searchTableBtn.addEventListener('click', handleSearchTable);
    else console.error("[PanelController] Botão 'searchTableBtn' não encontrado.");

    if (sectorFiltersContainer) {
        // Listener para filtros de setor (delegação)
         sectorFiltersContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.sector-btn');
            if (btn) {
                const sector = btn.dataset.sector;
                currentSectorFilter = sector;
                // Atualiza visualmente os botões
                sectorFiltersContainer.querySelectorAll('.sector-btn').forEach(b => {
                    const isActive = b.dataset.sector === currentSectorFilter;
                    b.classList.toggle('bg-pumpkin', isActive);
                    b.classList.toggle('text-white', isActive);
                    b.classList.toggle('bg-dark-input', !isActive);
                    b.classList.toggle('text-dark-text', !isActive);
                    b.classList.toggle('border-gray-600', !isActive);
                    b.classList.toggle('border-pumpkin', isActive);
                });
                loadOpenTables(); // Recarrega mesas com o novo filtro
            }
        });
    } else {
         console.error("[PanelController] Container 'sectorFilters' não encontrado.");
    }


    const checkInputs = () => {
        const mesaValida = parseInt(mesaInput?.value) > 0;
        const pessoasValida = parseInt(pessoasInput?.value) > 0;
        const sectorValido = sectorInput?.value !== '';
        if (abrirMesaBtn) {
            abrirMesaBtn.disabled = !(mesaValida && pessoasValida && sectorValido);
        }
    };
    if(mesaInput) mesaInput.addEventListener('input', checkInputs);
    if(pessoasInput) pessoasInput.addEventListener('input', checkInputs);
    if(sectorInput) sectorInput.addEventListener('change', checkInputs);

    window.openKdsStatusModal = (tableId) => { alert(`Abrir status KDS ${tableId} (DEV)`); };

    panelInitialized = true;
    console.log("[PanelController] Inicializado.");
};
