// --- CONTROLLERS/PANELCONTROLLER.JS ---
import { getTablesCollectionRef, getTableDocRef, auth } from "../services/firebaseService.js";
import { query, where, orderBy, onSnapshot, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { formatCurrency, formatElapsedTime } from "../utils.js";
// CRITICAL FIX: Adicionado setCurrentTable para controle de estado
import { goToScreen, currentTableId, selectedItems, unsubscribeTable, currentOrderSnapshot, setCurrentTable } from "../app.js"; 
import { fetchWooCommerceProducts } from "../services/wooCommerceService.js"; 
import { renderMenu, renderOrderScreen } from "./orderController.js";


// --- ESTADO DO MÓDULO ---
const SECTORS = ['Todos', 'Salão 1', 'Bar', 'Mezanino', 'Calçada'];
let currentSectorFilter = 'Todos';
let unsubscribeTables = null; 


// --- RENDERIZAÇÃO DE SETORES ---

export const renderTableFilters = () => {
//... (mantém a mesma)
    const sectorFiltersContainer = document.getElementById('sectorFilters');
    const sectorInput = document.getElementById('sectorInput');
    if (!sectorFiltersContainer || !sectorInput) return;

    sectorFiltersContainer.innerHTML = '';
    SECTORS.forEach(sector => {
        const isActive = sector === currentSectorFilter ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 border border-gray-300';
        sectorFiltersContainer.innerHTML += `
            <button class="sector-btn px-4 py-3 rounded-full text-base font-semibold whitespace-nowrap ${isActive}" data-sector="${sector}">
                ${sector}
            </button>
        `;
    });
    
    sectorInput.innerHTML = '<option value="" disabled selected>Setor</option>' + 
                            SECTORS.filter(s => s !== 'Todos')
                                   .map(s => `<option value="${s}">${s}</option>`).join('');
    
    // Adiciona as opções de setor ao modal de Transferência (index.html)
    const newTableSectorInput = document.getElementById('newTableSector');
    if (newTableSectorInput) {
        newTableSectorInput.innerHTML = '<option value="" disabled selected>Setor</option>' + 
                                SECTORS.filter(s => s !== 'Todos')
                                       .map(s => `<option value="${s}">${s}</option>`).join('');
    }
    
    sectorFiltersContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.sector-btn');
        if (btn) {
            const sector = btn.dataset.sector;
            currentSectorFilter = sector;
            
            document.querySelectorAll('.sector-btn').forEach(b => {
                b.classList.remove('bg-indigo-600', 'text-white');
                b.classList.add('bg-white', 'text-gray-700', 'border', 'border-gray-300');
            });
            btn.classList.remove('bg-white', 'text-gray-700', 'border', 'border-gray-300');
            btn.classList.add('bg-indigo-600', 'text-white');
            
            loadOpenTables(); 
        }
    });
};


// --- RENDERIZAÇÃO E CARREGAMENTO DE MESAS ---

const renderTables = (docs) => {
//... (mantém a mesma)
    const openTablesList = document.getElementById('openTablesList');
    const openTablesCount = document.getElementById('openTablesCount');
    if (!openTablesList || !openTablesCount) return;

    openTablesList.innerHTML = '';
    let count = 0;

    docs.forEach(doc => {
        const table = doc.data();
        const tableId = doc.id;
        
        if (table.status === 'open') {
            count++;
            const total = table.total || 0;
            const cardColor = total > 0 ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200';
            
            const hasAguardandoItem = (table.selectedItems || []).some(item => 
                item.note && item.note.toLowerCase().includes('espera')
            );
            const attentionIconHtml = hasAguardandoItem 
                ? `<i class="fas fa-exclamation-triangle attention-icon" title="Itens em Espera"></i>` 
                : '';

            const lastSentAt = table.lastKdsSentAt?.toMillis() || null;
            const elapsedTime = lastSentAt ? formatElapsedTime(lastSentAt) : null;
            
            const timerHtml = elapsedTime ? `
                <div class="table-timer">
                    <i class="fas fa-clock"></i> 
                    <span>${elapsedTime}</span>
                </div>
            ` : '';

            const statusIconHtml = lastSentAt ? `
                <button class="kds-status-icon-btn" 
                        title="Status do Último Pedido"
                        onclick="window.openKdsStatusModal(${tableId})">
                    <i class="fas fa-tasks"></i>
                </button>
            ` : '';
            
            const clientInfo = table.clientName ? `<p class="text-xs font-semibold text-gray-800">Cliente: ${table.clientName}</p>` : '';

            const cardHtml = `
                <div class="table-card-panel ${cardColor} shadow-md transition-colors duration-200 relative" data-table-id="${tableId}">
                    ${attentionIconHtml}
                    ${statusIconHtml} 
                    <h3 class="font-bold text-2xl">Mesa ${table.tableNumber}</h3>
                    ${clientInfo}
                    <p class="text-xs font-light">Setor: ${table.sector || 'N/A'}</p>
                    <span class="font-bold text-lg mt-2">${formatCurrency(total)}</span>
                    ${timerHtml}
                </div>
            `;
            openTablesList.innerHTML += cardHtml;
        }
    });

    openTablesCount.textContent = count;
    
    // Listener para abrir a mesa ao clicar no card
    document.querySelectorAll('.table-card-panel').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.kds-status-icon-btn')) return; 
            
            const tableId = card.dataset.tableId;
            if (tableId) {
                openTableForOrder(tableId);
            }
        });
    });
};

export const loadOpenTables = () => {
//... (mantém a mesma)
    if (unsubscribeTables) unsubscribeTables(); 
    
    const tablesCollection = getTablesCollectionRef();
    let q;
    
    if (currentSectorFilter === 'Todos') {
        q = query(tablesCollection, where('status', '==', 'open'), orderBy('tableNumber', 'asc'));
    } else {
        q = query(tablesCollection, 
                  where('status', '==', 'open'), 
                  where('sector', '==', currentSectorFilter),
                  orderBy('tableNumber', 'asc'));
    }

    unsubscribeTables = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs;
        renderTables(docs);
    }, (error) => {
        console.error("Erro ao carregar mesas (onSnapshot):", error);
    });
};

// Item 2: Abrir Mesa
export const handleAbrirMesa = async () => {
//... (mantém a mesma)
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

        if (docSnap.exists() && docSnap.data().status === 'open') {
            alert(`A Mesa ${tableNumber} já está aberta!`);
            return;
        }

        await setDoc(tableRef, {
            tableNumber: tableNumber,
            diners: diners,
            sector: sector, 
            status: 'open',
            createdAt: serverTimestamp(),
            total: 0,
            sentItems: [], 
            payments: [],
            serviceTaxApplied: true, 
            selectedItems: [] 
        });
        
        mesaInput.value = '';
        pessoasInput.value = '';
        sectorInput.value = '';
        
        openTableForOrder(tableNumber.toString()); 
        
    } catch (e) {
        console.error("Erro ao abrir mesa:", e);
        alert("Erro ao tentar abrir a mesa.");
    }
};

// Item 3: Busca de Mesa
export const handleSearchTable = async () => {
//... (mantém a mesma)
    const searchTableInput = document.getElementById('searchTableInput');
    const tableNumber = searchTableInput.value.trim();

    if (!tableNumber || parseInt(tableNumber) <= 0) {
        alert("Insira um número de mesa válido para buscar.");
        return;
    }

    const tableRef = getTableDocRef(tableNumber);
    const docSnap = await getDoc(tableRef);

    if (docSnap.exists() && docSnap.data().status === 'open') {
        openTableForOrder(tableNumber); 
        searchTableInput.value = '';
    } else {
        alert(`A Mesa ${tableNumber} não está aberta.`);
    }
};

export const openTableForOrder = async (tableId) => {
    // Garante que o Menu esteja carregado (dependência para o Painel 2)
    await fetchWooCommerceProducts(renderMenu); 
    
    // Navegação e Carregamento (Item 2)
    loadTableOrder(tableId); // Inicia o listener e atualiza o estado
    goToScreen('orderScreen'); 
};

export const loadTableOrder = (tableId) => {
    // CRITICAL FIX: Chama a função central que define o estado global (currentTableId) e inicia o listener
    setCurrentTable(tableId); 
};


// NOVO: Lógica Central para Transferência de Itens para Outra Mesa
export const handleTableTransferConfirmed = async (originTableId, targetTableId, itemsToTransfer, newDiners = 0, newSector = '') => {
    if (!originTableId || !targetTableId || itemsToTransfer.length === 0) {
        alert("Erro: Dados de transferência incompletos.");
        return;
    }

    const originTableRef = getTableDocRef(originTableId);
    const targetTableRef = getTableDocRef(targetTableId);

    try {
        const targetSnap = await getDoc(targetTableRef);
        const targetTableIsOpen = targetSnap.exists() && targetSnap.data().status === 'open';

        // 1. Abertura da Mesa de Destino (se necessário)
        if (!targetTableIsOpen) {
            if (!newDiners || !newSector) {
                alert("Erro: A mesa de destino está fechada. A quantidade de pessoas e o setor são obrigatórios para abri-la.");
                return;
            }

            await setDoc(targetTableRef, {
                tableNumber: parseInt(targetTableId),
                diners: newDiners,
                sector: newSector,
                status: 'open',
                createdAt: serverTimestamp(),
                total: 0,
                sentItems: [],
                payments: [],
                serviceTaxApplied: true,
                selectedItems: []
            });
        }

        // 2. Transferência dos Itens
        const transferValue = itemsToTransfer.reduce((sum, item) => sum + item.price, 0);

        // a) Remove os itens da mesa de origem
        const originItemsAfterTransfer = currentOrderSnapshot.sentItems.filter(item => {
            const itemKey = item.orderId + item.sentAt;
            const isItemToTransfer = itemsToTransfer.some(tItem => (tItem.orderId + tItem.sentAt) === itemKey);
            return !isItemToTransfer;
        });

        await updateDoc(originTableRef, {
            sentItems: originItemsAfterTransfer,
            total: (currentOrderSnapshot.total || 0) - transferValue,
        });

        // b) Adiciona os itens à mesa de destino
        const targetData = targetTableIsOpen ? targetSnap.data() : { sentItems: [], total: 0 };
        
        await updateDoc(targetTableRef, {
            sentItems: [...(targetData.sentItems || []), ...itemsToTransfer],
            total: targetData.total + transferValue,
        });

        alert(`Sucesso! ${itemsToTransfer.length} item(s) transferidos da Mesa ${originTableId} para a Mesa ${targetTableId}.`);

        // Volta para o painel de mesas após a operação
        goToScreen('panelScreen');

    } catch (e) {
        console.error("Erro na transferência de mesa:", e);
        alert("Falha na transferência dos itens.");
    }
};
window.handleTableTransferConfirmed = handleTableTransferConfirmed;
