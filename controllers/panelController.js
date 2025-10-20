// --- CONTROLLERS/PANELCONTROLLER.JS ---
import { getTablesCollectionRef, getTableDocRef } from "../services/firebaseService.js";
import { query, where, orderBy, onSnapshot, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { formatCurrency } from "../utils.js";
import { goToScreen, currentTableId, selectedItems } from "../app.js"; // Importa o estado do app
import { fetchWooCommerceProducts } from "../services/wooCommerceService.js"; // Para garantir o carregamento do menu
import { renderOrderScreen, renderMenu } from "./orderController.js"; // Importa a função de renderização do Painel 2


// --- ESTADO DO MÓDULO ---
const SECTORS = ['Todos', 'Salão 1', 'Bar', 'Mezanino', 'Calçada'];
let currentSectorFilter = 'Todos';
let unsubscribeTables = null; // Listener para mesas


// --- RENDERIZAÇÃO DE SETORES (Item 0.2) ---

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
        
        if (table.status === 'open') {
            count++;
            const total = table.total || 0;
            const cardColor = total > 0 ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200';
            
            // Adicione aqui a lógica dos ícones (Atenção, Timer, Status KDS) no futuro

            const cardHtml = `
                <div class="table-card-panel ${cardColor} shadow-md transition-colors duration-200" data-table-id="${tableId}">
                    <h3 class="font-bold text-2xl">Mesa ${table.tableNumber}</h3>
                    <p class="text-xs font-light">Setor: ${table.sector || 'N/A'}</p>
                    <span class="font-bold text-lg mt-2">${formatCurrency(total)}</span>
                </div>
            `;
            openTablesList.innerHTML += cardHtml;
        }
    });

    openTablesCount.textContent = count;
    
    // Listener para abrir a mesa ao clicar no card
    document.querySelectorAll('.table-card-panel').forEach(card => {
        card.addEventListener('click', (e) => {
            const tableId = card.dataset.tableId;
            if (tableId) {
                openTableForOrder(tableId);
            }
        });
    });
};

export const loadOpenTables = () => {
    if (unsubscribeTables) unsubscribeTables(); // Cancela o listener anterior
    
    const tablesCollection = getTablesCollectionRef();
    let q;
    
    if (currentSectorFilter === 'Todos') {
        q = query(tablesCollection, where('status', '==', 'open'), orderBy('tableNumber', 'asc'));
    } else {
        // Consulta filtrada por Setor (Requer índice composto: status + sector)
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
        // Em um sistema real, aqui você mostraria uma mensagem de erro na UI.
    });
};

export const openTableForOrder = async (tableId) => {
    // Implementação temporária: ir para a tela de pedido e iniciar o listener
    currentTableId = tableId; // ATUALIZA O ESTADO GLOBAL no App Core
    
    // Garante que o menu está carregado antes de navegar
    await fetchWooCommerceProducts(); 
    renderMenu();

    loadTableOrder(tableId);
    goToScreen('orderScreen'); 
};

export const loadTableOrder = (tableId) => {
    // Implementação da lógica de listener da mesa (para o Painel 2)
    // Este código deve ser movido para o orderController na próxima fase
    const tableRef = getTableDocRef(tableId);
    
    // Simplesmente renderiza o Painel 2
    renderOrderScreen(null); 
};


// --- LÓGICA DE ABERTURA DE MESA ---

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
        
        alert(`Mesa ${tableNumber} aberta com sucesso no setor ${sector}!`);
        
        mesaInput.value = '';
        pessoasInput.value = '';
        sectorInput.value = '';
        
        openTableForOrder(tableNumber.toString()); // Carrega a mesa recém-criada
        
    } catch (e) {
        console.error("Erro ao abrir mesa:", e);
        alert("Erro ao tentar abrir a mesa.");
    }
};
