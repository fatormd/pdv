// --- CONTROLLERS/PANELCONTROLLER.JS ---
import { getTablesCollectionRef, getTableDocRef, auth } from "/services/firebaseService.js";
import { query, where, orderBy, onSnapshot, getDoc, setDoc, updateDoc, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js"; // Import writeBatch if needed here, otherwise remove
import { formatCurrency, formatElapsedTime } from "/utils.js";
import { goToScreen, currentTableId, selectedItems, unsubscribeTable, currentOrderSnapshot, setCurrentTable, userRole } from "/app.js";
import { fetchWooCommerceProducts } from "/services/wooCommerceService.js";
import { renderMenu } from "./orderController.js"; // Presuming renderMenu is needed for openTableForOrder

// --- ESTADO DO MÓDULO ---
const SECTORS = ['Todos', 'Salão 1', 'Bar', 'Mezanino', 'Calçada'];
let currentSectorFilter = 'Todos';
let unsubscribeTables = null;
let panelInitialized = false;


// --- FUNÇÃO DE ALERTA CUSTOMIZADO ---
const showCustomAlert = (title, message) => {
    const modal = document.getElementById('customAlertModal');
    const titleEl = document.getElementById('customAlertTitle');
    const messageEl = document.getElementById('customAlertMessage');
    const okBtn = document.getElementById('customAlertOkBtn');

    if (!modal || !titleEl || !messageEl || !okBtn) {
        alert(`${title}: ${message}`); // Fallback
        return;
    }
    titleEl.textContent = title;
    messageEl.textContent = message;
    okBtn.onclick = () => {
        modal.style.display = 'none';
        const searchInput = document.getElementById('searchTableInput');
        if (searchInput) { searchInput.value = ''; searchInput.focus(); }
    };
    modal.style.display = 'flex';
};


// --- RENDERIZAÇÃO DE SETORES ---
export const renderTableFilters = () => {
    const sectorFiltersContainer = document.getElementById('sectorFilters');
    const sectorInput = document.getElementById('sectorInput'); // Para abrir mesa
    const newTableSectorInput = document.getElementById('newTableSector'); // Para transferência

    if (!sectorFiltersContainer || !sectorInput) {
        console.warn("[Panel] Elementos de filtro de setor não encontrados.");
        return;
    }

    // Renderiza botões de filtro
    sectorFiltersContainer.innerHTML = SECTORS.map(sector => {
        const isActive = sector === currentSectorFilter ? 'bg-pumpkin text-white' : 'bg-dark-input text-dark-text border border-gray-600';
        return `<button class="sector-btn px-4 py-3 rounded-full text-base font-semibold whitespace-nowrap ${isActive}" data-sector="${sector}">${sector}</button>`;
    }).join('');

    // Preenche select de abrir mesa
    sectorInput.innerHTML = '<option value="" disabled selected class="text-dark-placeholder">Setor</option>' +
                            SECTORS.filter(s => s !== 'Todos')
                                   .map(s => `<option value="${s}" class="text-dark-text">${s}</option>`).join('');

    // Preenche select de transferência (se existir)
    if (newTableSectorInput) {
        newTableSectorInput.innerHTML = '<option value="" disabled selected class="text-dark-placeholder">Setor</option>' +
                                SECTORS.filter(s => s !== 'Todos')
                                       .map(s => `<option value="${s}" class="text-dark-text">${s}</option>`).join('');
    }
};


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

        if (table.status && table.status.toLowerCase() === 'open') {
            count++;
            const total = table.total || 0;
            const isClientPending = table.clientOrderPending || false;

            let cardColorClasses = 'bg-dark-card border-gray-700 text-dark-text hover:bg-gray-700'; // Default dark
            if (total > 0) cardColorClasses = 'bg-red-900 border-red-700 text-red-200 hover:bg-red-800';
            else cardColorClasses = 'bg-green-900 border-green-700 text-green-200 hover:bg-green-800';
            if (isClientPending) cardColorClasses = 'bg-indigo-900 border-yellow-400 text-white hover:bg-indigo-800';

            let attentionIconHtml = '';
            const hasAguardandoItem = (table.selectedItems || []).some(item => item.note?.toLowerCase().includes('espera'));

            if (isClientPending) attentionIconHtml = `<i class="fas fa-bell attention-icon text-yellow-400" title="Pedido Novo de Cliente"></i>`;
            else if (hasAguardandoItem) attentionIconHtml = `<i class="fas fa-exclamation-triangle attention-icon" title="Itens em Espera"></i>`;

            let lastSentAt = null;
            if (table.lastKdsSentAt?.toMillis) lastSentAt = table.lastKdsSentAt.toMillis();
            else if (typeof table.lastKdsSentAt === 'number') lastSentAt = table.lastKdsSentAt;

            const elapsedTime = lastSentAt ? formatElapsedTime(lastSentAt) : null;
            const timerHtml = elapsedTime ? `<div class="table-timer"><i class="fas fa-clock"></i> <span>${elapsedTime}</span></div>` : '';
            const statusIconHtml = lastSentAt ? `<button class="kds-status-icon-btn" title="Status KDS" onclick="window.openKdsStatusModal(${tableId})"><i class="fas fa-tasks"></i></button>` : '';
            const clientInfo = table.clientName ? `<p class="text-xs font-semibold">${table.clientName}</p>` : '';

            const cardHtml = `
                <div class="table-card-panel ${cardColorClasses} shadow-md transition-colors duration-200 relative" data-table-id="${tableId}">
                    ${attentionIconHtml}
                    ${statusIconHtml}
                    <h3 class="font-bold text-2xl">Mesa ${table.tableNumber}</h3>
                    <p class="text-xs font-light">Setor: ${table.sector || 'N/A'}</p>
                    ${clientInfo}
                    <span class="font-bold text-lg mt-2">${formatCurrency(total)}</span>
                    ${timerHtml}
                </div>
            `;
            openTablesList.innerHTML += cardHtml;
        }
    });

    openTablesCount.textContent = count;

    if (count === 0) {
        openTablesList.innerHTML = `<div class="col-span-full text-sm text-dark-placeholder italic p-4 content-card bg-dark-card border border-gray-700">Nenhuma mesa aberta no setor "${currentSectorFilter}".</div>`;
    }

    // Reanexa listeners aos cards recém-criados
    document.querySelectorAll('.table-card-panel').forEach(card => {
        const existingCard = card; // Mantém referência ao card original
        const newCard = existingCard.cloneNode(true); // Clona para limpar listeners antigos
        existingCard.parentNode.replaceChild(newCard, existingCard); // Substitui no DOM

        newCard.addEventListener('click', (e) => {
            if (e.target.closest('.kds-status-icon-btn')) return;
            const tableId = newCard.dataset.tableId;
            if (tableId) {
                openTableForOrder(tableId);
            }
        });
    });
};

export const loadOpenTables = () => {
    if (unsubscribeTables) {
        unsubscribeTables();
        unsubscribeTables = null;
    }

    const tablesCollection = getTablesCollectionRef();
    let q;

    if (currentSectorFilter === 'Todos') {
        q = query(tablesCollection, where('status', '==', 'open'), orderBy('tableNumber', 'asc'));
    } else {
        q = query(tablesCollection, where('status', '==', 'open'), where('sector', '==', currentSectorFilter), orderBy('tableNumber', 'asc'));
    }

    console.log(`[Panel] Configurando listener para mesas: ${currentSectorFilter === 'Todos' ? 'Todos' : `Setor ${currentSectorFilter}`}`);
    unsubscribeTables = onSnapshot(q, (snapshot) => {
        console.log(`[Panel] Snapshot: ${snapshot.docs.length} mesas.`);
        renderTables(snapshot.docs);
    }, (error) => {
        const openTablesList = document.getElementById('openTablesList');
        const errorMessage = error.message || "Erro desconhecido.";
        if (openTablesList) {
            openTablesList.innerHTML = `<div class="col-span-full text-sm text-red-400 font-bold italic p-4 content-card bg-dark-card border border-red-700">ERRO FIREBASE: ${errorMessage}</div>`;
        }
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
            alert(`Mesa ${tableNumber} já está aberta!`);
            return;
        }

        console.log(`[Panel] Abrindo Mesa ${tableNumber} / ${sector} / ${diners}p.`);
        await setDoc(tableRef, {
            tableNumber, diners, sector, status: 'open', createdAt: serverTimestamp(),
            total: 0, sentItems: [], payments: [], serviceTaxApplied: true, selectedItems: []
        });

        mesaInput.value = ''; pessoasInput.value = ''; sectorInput.value = '';
        openTableForOrder(tableNumber.toString());

    } catch (e) {
        console.error("Erro ao abrir mesa:", e);
        alert("Erro ao tentar abrir a mesa.");
    }
};

export const handleSearchTable = async () => {
    const searchTableInput = document.getElementById('searchTableInput');
    const tableNumber = searchTableInput.value.trim();

    if (!tableNumber || parseInt(tableNumber) <= 0) {
        alert("Insira um número de mesa válido.");
        return;
    }

    const tableRef = getTableDocRef(tableNumber);
    const docSnap = await getDoc(tableRef);

    if (docSnap.exists() && docSnap.data().status?.toLowerCase() === 'open') {
        console.log(`[Panel] Mesa ${tableNumber} encontrada via busca.`);
        openTableForOrder(tableNumber);
        searchTableInput.value = '';
    } else {
        console.log(`[Panel] Mesa ${tableNumber} não encontrada ou fechada.`);
        alert(`A Mesa ${tableNumber} não está aberta.`);
    }
};

export const openTableForOrder = async (tableId) => {
    console.log(`[Panel] Abrindo pedido para Mesa ${tableId}`);
    try {
        await fetchWooCommerceProducts(renderMenu); // Garante menu antes de ir
        loadTableOrder(tableId); // Inicia listener e atualiza estado global
        goToScreen('orderScreen'); // Vai para tela de pedido Staff
    } catch (error) {
        console.error(`Erro ao carregar produtos ou iniciar listener para mesa ${tableId}:`, error);
        alert("Erro ao abrir a mesa. Verifique a conexão.");
    }
};

// FUNÇÃO DE TRANSFERÊNCIA (EXPORTADA PARA PAYMENT CONTROLLER)
export const handleTableTransferConfirmed = async (originTableId, targetTableId, itemsToTransfer, newDiners = 0, newSector = '') => {
    if (!originTableId || !targetTableId || itemsToTransfer.length === 0) {
        alert("Erro: Dados de transferência incompletos.");
        return;
    }

    const originTableRef = getTableDocRef(originTableId);
    const targetTableRef = getTableDocRef(targetTableId);
    const { getFirestore, writeBatch } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js"); // Importa writeBatch aqui
    const db = getFirestore(); // Pega a instância do DB
    const batch = writeBatch(db);


    try {
        const targetSnap = await getDoc(targetTableRef);
        const targetTableIsOpen = targetSnap.exists() && targetSnap.data().status?.toLowerCase() === 'open';

        // 1. Abertura/Setup da Mesa de Destino
        if (!targetTableIsOpen) {
            if (!newDiners || !newSector) {
                alert("Erro: Mesa destino fechada. Pessoas e setor são obrigatórios.");
                return;
            }
            console.log(`[Panel] Abrindo Mesa ${targetTableId} para transferência.`);
            batch.set(targetTableRef, { // Usa batch.set para criar
                tableNumber: parseInt(targetTableId), diners: newDiners, sector: newSector, status: 'open',
                createdAt: serverTimestamp(), total: 0, sentItems: [], payments: [],
                serviceTaxApplied: true, selectedItems: []
            });
        }

        // 2. Transferência dos Itens
        const transferValue = itemsToTransfer.reduce((sum, item) => sum + (item.price || 0), 0);

        // a) Remove itens e atualiza total da Origem
        const originCurrentTotal = currentOrderSnapshot.total || 0; // Pega do snapshot atual
        const originNewTotal = Math.max(0, originCurrentTotal - transferValue);
        itemsToTransfer.forEach(item => {
            batch.update(originTableRef, { sentItems: arrayRemove(item) }); // Usa batch.update com arrayRemove
        });
        batch.update(originTableRef, { total: originNewTotal }); // Atualiza total da origem no batch

        // b) Adiciona itens e atualiza total do Destino
        const targetData = targetTableIsOpen ? targetSnap.data() : { total: 0 }; // Pega dados existentes ou default
        const targetNewTotal = (targetData.total || 0) + transferValue;
        batch.update(targetTableRef, {
            sentItems: arrayUnion(...itemsToTransfer), // Usa batch.update com arrayUnion
            total: targetNewTotal // Atualiza total do destino no batch
        });

        // Executa o Batch
        await batch.commit();

        alert(`Sucesso! ${itemsToTransfer.length} item(s) transferidos da Mesa ${originTableId} para a Mesa ${targetTableId}.`);
        goToScreen('panelScreen'); // Volta para o painel principal

    } catch (e) {
        console.error("Erro na transferência de mesa:", e);
        alert("Falha na transferência dos itens.");
    }
};
// REMOVIDO: window.handleTableTransferConfirmed = handleTableTransferConfirmed;


// Função de inicialização do Controller (chamada pelo app.js)
export const initPanelController = () => {
    if (panelInitialized) return;
    console.log("[PanelController] Inicializando...");

    const abrirMesaBtn = document.getElementById('abrirMesaBtn');
    const searchTableBtn = document.getElementById('searchTableBtn');
    const sectorFiltersContainer = document.getElementById('sectorFilters');
    const mesaInput = document.getElementById('mesaInput');
    const pessoasInput = document.getElementById('pessoasInput');
    const sectorInput = document.getElementById('sectorInput'); // Adicionado para checkInputs
    const abrirMesaRealBtn = document.getElementById('abrirMesaBtn'); // Para checkInputs

    // Listener para o botão de abrir mesa
    if (abrirMesaBtn) abrirMesaBtn.addEventListener('click', handleAbrirMesa);
    else console.error("[PanelController] Botão 'abrirMesaBtn' não encontrado.");

    // Listener para o botão de buscar mesa
    if (searchTableBtn) searchTableBtn.addEventListener('click', handleSearchTable);
    else console.error("[PanelController] Botão 'searchTableBtn' não encontrado.");

    // Listener para filtros de setor (a lógica de clique já está em renderTableFilters)
    if (!sectorFiltersContainer) console.error("[PanelController] Container 'sectorFilters' não encontrado.");

    // Listeners para habilitar/desabilitar botão Abrir Mesa
    const checkInputs = () => {
        const mesaValida = parseInt(mesaInput?.value) > 0;
        const pessoasValida = parseInt(pessoasInput?.value) > 0;
        const sectorValido = sectorInput?.value !== ''; // Verifica se um setor foi selecionado
        if (abrirMesaRealBtn) {
            abrirMesaRealBtn.disabled = !(mesaValida && pessoasValida && sectorValido);
        }
    };
    if(mesaInput) mesaInput.addEventListener('input', checkInputs);
    if(pessoasInput) pessoasInput.addEventListener('input', checkInputs);
    if(sectorInput) sectorInput.addEventListener('change', checkInputs); // Adiciona listener para o select

    // Placeholder para função de KDS Status Modal (se existir)
    window.openKdsStatusModal = (tableId) => {
        alert(`Abrir status KDS para Mesa ${tableId} (Em desenvolvimento)`);
    };

    panelInitialized = true;
    console.log("[PanelController] Inicializado.");
};
