// --- CONTROLLERS/PANELCONTROLLER.JS ---
import { getTablesCollectionRef, getTableDocRef } from "../services/firebaseService.js";
import { query, where, orderBy, onSnapshot, doc, setDoc, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { formatCurrency, formatElapsedTime } from "../utils.js";
import { currentTableId, unsubscribeTable, goToScreen, selectedItems } from "../app.js"; // Importa o estado do app

// Variáveis Mock para os Setores
const SECTORS = ['Todos', 'Salão 1', 'Bar', 'Mezanino', 'Calçada'];
let currentSectorFilter = 'Todos';


// --- MÓDULO DE SETORES (Item 0.2) ---

export const renderTableFilters = () => {
    const sectorFiltersContainer = document.getElementById('sectorFilters');
    if (!sectorFiltersContainer) return;

    sectorFiltersContainer.innerHTML = '';

    SECTORS.forEach(sector => {
        const isActive = sector === currentSectorFilter ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 border border-gray-300';
        sectorFiltersContainer.innerHTML += `
            <button class="sector-btn px-4 py-3 rounded-full text-base font-semibold whitespace-nowrap ${isActive}" data-sector="${sector}">
                ${sector}
            </button>
        `;
    });

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
            
            loadOpenTables(); // Recarrega as mesas com o novo filtro
        }
    });
};


// --- FUNÇÕES DE MESA (Painel 1) ---

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
};

export const loadOpenTables = () => {
    const tablesCollection = getTablesCollectionRef();
    let q;
    
    if (currentSectorFilter === 'Todos') {
        // Consulta original: todas as mesas abertas, ordenadas por número da mesa
        q = query(tablesCollection, where('status', '==', 'open'), orderBy('tableNumber', 'asc'));
    } else {
        // NOVO: Consulta filtrada por Setor
        // OBS: Isso pode exigir um novo índice composto no Firebase (status + sector)
        q = query(tablesCollection, 
                  where('status', '==', 'open'), 
                  where('sector', '==', currentSectorFilter),
                  orderBy('tableNumber', 'asc'));
    }


    onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs;
        renderTables(docs);
    }, (error) => {
        console.error("Erro ao carregar mesas (onSnapshot):", error);
        // Exibe erro na UI se houver problema de indexação
    });
};

export const openTableForOrder = async (tableId) => {
    // ... (Lógica para carregar a mesa e ir para o Painel 2)
    // Importa o loadTableOrder de outro lugar ou usa a lógica aqui
    const tableRef = getTableDocRef(tableId);
    const docSnap = await getDoc(tableRef);
    if (docSnap.exists()) {
        // Atualiza estado global e navega
        // currentTableId = tableId; 
        // goToScreen('orderScreen');
        // loadTableOrder(tableId);
    }
};
