// --- CONTROLLERS/PANELCONTROLLER.JS ---
import { getTablesCollectionRef, getTableDocRef } from "/services/firebaseService.js";
import { query, where, orderBy, onSnapshot, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { formatCurrency, formatElapsedTime } from "/utils.js";
import { goToScreen, setCurrentTable, userRole } from "/app.js"; // Importa funções de app.js
import { fetchWooCommerceProducts } from "/services/wooCommerceService.js"; // Para openTableForOrder
import { renderMenu } from "./orderController.js"; // Para openTableForOrder


// --- ESTADO DO MÓDULO ---
const SECTORS = ['Todos', 'Salão 1', 'Bar', 'Mezanino', 'Calçada'];
let currentSectorFilter = 'Todos';
let unsubscribeTables = null;
let panelInitialized = false; // Flag para evitar múltiplas inicializações


// --- FUNÇÃO DE ALERTA CUSTOMIZADO ---
// ... (mantida como antes) ...
const showCustomAlert = (title, message) => { /* ... código ... */ };

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
            const isClientPending = table.clientOrderPending || false; // Embora cliente removido, mantém lógica caso volte

            // Define cor baseada no status e total
            let cardColorClasses = 'bg-dark-card border-gray-700 text-dark-text hover:bg-gray-700'; // Default dark
            if (total > 0) {
                 cardColorClasses = 'bg-red-900 border-red-700 text-red-200 hover:bg-red-800'; // Ocupada Dark
            } else {
                 cardColorClasses = 'bg-green-900 border-green-700 text-green-200 hover:bg-green-800'; // Livre Dark
            }
             if (isClientPending) { // Sobrescreve se houver pedido de cliente
                 cardColorClasses = 'bg-indigo-900 border-yellow-400 text-white hover:bg-indigo-800';
             }


            let attentionIconHtml = '';
            const hasAguardandoItem = (table.selectedItems || []).some(item =>
                item.note && item.note.toLowerCase().includes('espera')
            );

            if (isClientPending) {
                 attentionIconHtml = `<i class="fas fa-bell attention-icon text-yellow-400" title="Pedido Novo de Cliente"></i>`;
            } else if (hasAguardandoItem) {
                 attentionIconHtml = `<i class="fas fa-exclamation-triangle attention-icon" title="Itens em Espera"></i>`;
            }

            let lastSentAt = null;
            if (table.lastKdsSentAt && typeof table.lastKdsSentAt.toMillis === 'function') {
                 lastSentAt = table.lastKdsSentAt.toMillis();
            } else if (typeof table.lastKdsSentAt === 'number') {
                 lastSentAt = table.lastKdsSentAt;
            }
            const elapsedTime = lastSentAt ? formatElapsedTime(lastSentAt) : null;
            const timerHtml = elapsedTime ? `<div class="table-timer"><i class="fas fa-clock"></i> <span>${elapsedTime}</span></div>` : '';
            const statusIconHtml = lastSentAt ? `<button class="kds-status-icon-btn" title="Status KDS" onclick="window.openKdsStatusModal(${tableId})"><i class="fas fa-tasks"></i></button>` : '';
            const clientInfo = table.clientName ? `<p class="text-xs font-semibold">${table.clientName}</p>` : ''; // Texto ajustado para dark

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
        card.addEventListener('click', (e) => {
            // Evita abrir mesa se clicar no ícone KDS
            if (e.target.closest('.kds-status-icon-btn')) return;
            const tableId = card.dataset.tableId;
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

    console.log(`[Panel] Configurando listener para mesas: ${currentSectorFilter === 'Todos' ? 'Todos os setores' : `Setor ${currentSectorFilter}`}`);
    unsubscribeTables = onSnapshot(q, (snapshot) => {
        console.log(`[Panel] Snapshot recebido: ${snapshot.docs.length} mesas encontradas.`);
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
        alert('Preencha o número da mesa, a quantidade de pessoas e o setor corretamente.');
        return;
    }

    const tableRef = getTableDocRef(tableNumber);

    try {
        const docSnap = await getDoc(tableRef);
        if (docSnap.exists() && docSnap.data().status?.toLowerCase() === 'open') {
            alert(`A Mesa ${tableNumber} já está aberta!`);
            return;
        }

        console.log(`[Panel] Abrindo Mesa ${tableNumber} no setor ${sector} para ${diners} pessoas.`);
        await setDoc(tableRef, {
            tableNumber: tableNumber, diners: diners, sector: sector, status: 'open',
            createdAt: serverTimestamp(), total: 0, sentItems: [], payments: [],
            serviceTaxApplied: true, selectedItems: []
        });

        mesaInput.value = ''; pessoasInput.value = ''; sectorInput.value = '';
        openTableForOrder(tableNumber.toString());

    } catch (e) {
        console.error("Erro ao abrir mesa:", e);
        alert("Erro ao tentar abrir a mesa.");
    }
};

export const handleSearchTable = async () => { // Removido isClientFlow
    const searchTableInput = document.getElementById('searchTableInput');
    const tableNumber = searchTableInput.value.trim();

    if (!tableNumber || parseInt(tableNumber) <= 0) {
        alert("Insira um número de mesa válido para buscar.");
        return;
    }

    const tableRef = getTableDocRef(tableNumber);
    const docSnap = await getDoc(tableRef);

    if (docSnap.exists() && docSnap.data().status?.toLowerCase() === 'open') {
        console.log(`[Panel] Mesa ${tableNumber} encontrada. Abrindo...`);
        openTableForOrder(tableNumber); // Abre a mesa para Staff
        searchTableInput.value = '';
    } else {
        console.log(`[Panel] Mesa ${tableNumber} não está aberta.`);
        alert(`A Mesa ${tableNumber} não está aberta.`);
    }
};

export const openTableForOrder = async (tableId) => { // Removido isClientFlow
    console.log(`[Panel] Abrindo pedido para Mesa ${tableId}`);
    // Garante que o Menu esteja carregado antes de ir para a tela de pedido
    await fetchWooCommerceProducts(renderMenu);
    loadTableOrder(tableId); // Inicia o listener e atualiza o estado global
    goToScreen('orderScreen'); // Sempre vai para a tela de pedido do Staff
};

// Função de inicialização do Controller (chamada pelo app.js)
export const initPanelController = () => {
    if (panelInitialized) return;
    console.log("[PanelController] Inicializando...");

    const abrirMesaBtn = document.getElementById('abrirMesaBtn');
    const searchTableBtn = document.getElementById('searchTableBtn');
    const sectorFiltersContainer = document.getElementById('sectorFilters');
    const mesaInput = document.getElementById('mesaInput'); // Necessário para checkInputs
    const pessoasInput = document.getElementById('pessoasInput'); // Necessário para checkInputs
    const abrirMesaRealBtn = document.getElementById('abrirMesaBtn'); // Para checkInputs

    // Listener para o botão de abrir mesa
    if (abrirMesaBtn) {
        abrirMesaBtn.addEventListener('click', handleAbrirMesa);
    } else {
        console.error("[PanelController] Botão 'abrirMesaBtn' não encontrado.");
    }

    // Listener para o botão de buscar mesa
    if (searchTableBtn) {
        searchTableBtn.addEventListener('click', handleSearchTable);
    } else {
        console.error("[PanelController] Botão 'searchTableBtn' não encontrado.");
    }

    // Listener para filtros de setor (já configurado em renderTableFilters, mas garantimos aqui)
    if (sectorFiltersContainer) {
        // A lógica de adicionar listener aos botões já está em renderTableFilters,
        // mas podemos adicionar um listener geral aqui se necessário.
        // sectorFiltersContainer.addEventListener('click', handleSectorFilterClick);
    } else {
         console.error("[PanelController] Container 'sectorFilters' não encontrado.");
    }

    // Listeners para habilitar/desabilitar botão Abrir Mesa
    const checkInputs = () => {
        const mesaValida = parseInt(mesaInput.value) > 0;
        const pessoasValida = parseInt(pessoasInput.value) > 0;
        if (abrirMesaRealBtn) {
            abrirMesaRealBtn.disabled = !(mesaValida && pessoasValida);
        }
    };
    if(mesaInput) mesaInput.addEventListener('input', checkInputs);
    if(pessoasInput) pessoasInput.addEventListener('input', checkInputs);

    // Placeholder para função de KDS Status Modal (se existir)
    window.openKdsStatusModal = (tableId) => {
        alert(`Abrir status KDS para Mesa ${tableId} (Em desenvolvimento)`);
    };

    panelInitialized = true;
    console.log("[PanelController] Inicializado.");
};
