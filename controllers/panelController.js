// --- CONTROLLERS/PANELCONTROLLER.JS ---
import { getTablesCollectionRef, getTableDocRef, auth } from "../services/firebaseService.js";
import { query, where, orderBy, onSnapshot, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { formatCurrency, formatElapsedTime } from "../utils.js";
import { goToScreen, currentTableId, selectedItems, unsubscribeTable } from "../app.js"; 
import { fetchWooCommerceProducts } from "../services/wooCommerceService.js"; 
import { renderMenu } from "./orderController.js";


// --- ESTADO DO MÓDULO ---
const SECTORS = ['Todos', 'Salão 1', 'Bar', 'Mezanino', 'Calçada'];
let currentSectorFilter = 'Todos';
let unsubscribeTables = null; // CRITICAL FIX: Declaração no escopo do módulo


// --- RENDERIZAÇÃO DE SETORES ---

export const renderTableFilters = () => {
    const sectorFiltersContainer = document.getElementById('sectorFilters');
    const sectorInput = document.getElementById('sectorInput');
    if (!sectorFiltersContainer || !sectorInput) return;

    // 1. Renderiza os botões de filtro
    sectorFiltersContainer.innerHTML = '';
    SECTORS.forEach(sector => {
        const isActive = sector === currentSectorFilter ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 border border-gray-300';
        sectorFiltersContainer.innerHTML += `
            <button class="sector-btn px-4 py-3 rounded-full text-base font-semibold whitespace-nowrap ${isActive}" data-sector="${sector}">
                ${sector}
            </button>
        `;
    });
    
    // 2. Renderiza as opções do seletor (para Abrir Nova Mesa)
    sectorInput.innerHTML = '<option value="" disabled selected>Setor</option>' + 
                            SECTORS.filter(s => s !== 'Todos')
                                   .map(s => `<option value="${s}">${s}</option>`).join('');

    // Adiciona listener para a seleção de filtro
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


// --- RENDERIZAÇÃO E CARREGAMENTO DE MESAS (Item 4) ---

const renderTables = (docs) => {
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
            
            // 4c. Ícone de Atenção ("Em Espera")
            const hasAguardandoItem = (table.selectedItems || []).some(item => 
                item.note && item.note.toLowerCase().includes('espera')
            );
            const attentionIconHtml = hasAguardandoItem 
                ? `<i class="fas fa-exclamation-triangle attention-icon" title="Itens em Espera"></i>` 
                : '';

            // 4a. Timer de Último Pedido
            const lastSentAt = table.lastKdsSentAt?.toMillis() || null;
            const elapsedTime = lastSentAt ? formatElapsedTime(lastSentAt) : null;
            
            const timerHtml = elapsedTime ? `
                <div class="table-timer">
                    <i class="fas fa-clock"></i> 
                    <span>${elapsedTime}</span>
                </div>
            ` : '';

            // 4b. Botão KDS Status
            const statusIconHtml = lastSentAt ? `
                <button class="kds-status-icon-btn" 
                        title="Status do Último Pedido"
                        onclick="window.openKdsStatusModal(${tableId})">
                    <i class="fas fa-tasks"></i>
                </button>
            ` : '';
            
            // 4d. Nome do Cliente
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
    if (unsubscribeTables) unsubscribeTables(); // Agora deve funcionar
    
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

        // Cria o documento da mesa
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
        
        openTableForOrder(tableNumber.toString()); // Carrega a mesa recém-criada
        
    } catch (e) {
        console.error("Erro ao abrir mesa:", e);
        alert("Erro ao tentar abrir a mesa.");
    }
};

// Item 3: Busca de Mesa
export const handleSearchTable = async () => {
    const searchTableInput = document.getElementById('searchTableInput');
    const tableNumber = searchTableInput.value.trim();

    if (!tableNumber || parseInt(tableNumber) <= 0) {
        alert("Insira um número de mesa válido para buscar.");
        return;
    }

    const tableRef = getTableDocRef(tableNumber);
    const docSnap = await getDoc(tableRef);

    if (docSnap.exists() && docSnap.data().status === 'open') {
        openTableForOrder(tableNumber); // Abre a mesa existente
        searchTableInput.value = '';
    } else {
        alert(`A Mesa ${tableNumber} não está aberta.`);
    }
};

// CRITICAL FIX: Exportando a função para o app.js (Item 2)
export const openTableForOrder = async (tableId) => {
    // Garante que o Menu esteja carregado (dependência para o Painel 2)
    await fetchWooCommerceProducts(renderMenu); 
    
    // Navegação e Carregamento (Item 2)
    loadTableOrder(tableId); // Inicia o listener e atualiza o estado
    goToScreen('orderScreen'); 
};

// CRITICAL FIX: Exportando a função que estava faltando no app.js (Item 2)
export const loadTableOrder = (tableId) => {
    // Implementação da lógica de listener da mesa (para o Painel 2)
    // Este código será movido para o orderController na próxima fase
    const tableRef = getTableDocRef(tableId);
    
    // Simplesmente renderiza o Painel 2
    console.log(`Iniciando listener para Mesa ${tableId}...`);
};
