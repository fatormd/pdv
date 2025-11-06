// --- CONTROLLERS/PANELCONTROLLER.JS (Completo e Estável com Agrupamento) ---
import { getTablesCollectionRef, getTableDocRef, db } from "/services/firebaseService.js";
import { query, where, orderBy, onSnapshot, getDoc, setDoc, updateDoc, serverTimestamp, writeBatch, arrayUnion, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { formatCurrency, formatElapsedTime } from "/utils.js";
// CORREÇÃO: Importa a função global do app.js
import { goToScreen, currentTableId, selectedItems, unsubscribeTable, currentOrderSnapshot, setCurrentTable, userRole, selectTableAndStartListener } from "/app.js";


// --- ESTADO DO MÓDULO ---
const SECTORS = ['Todos', 'Salão 1', 'Bar', 'Mezanino', 'Calçada'];
let currentSectorFilter = 'Todos';
let unsubscribeTables = null;
let panelInitialized = false;
let currentTablesSnapshot = []; // NOVO: Armazena o snapshot completo para uso em modais

// --- RENDERIZAÇÃO DE SETORES ---
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

    // Reanexa os estilos ativos após a renderização
     sectorFiltersContainer.querySelectorAll('.sector-btn').forEach(btn => {
        const isActive = btn.dataset.sector === currentSectorFilter;
        btn.classList.toggle('bg-pumpkin', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('bg-dark-input', !isActive);
        btn.classList.toggle('text-dark-text', !isActive);
        btn.classList.toggle('border-gray-600', !isActive);
        btn.classList.toggle('border-pumpkin', isActive);
    });
};


// --- RENDERIZAÇÃO E CARREGAMENTO DE MESAS ---
const renderTables = (docs) => {
    const openTablesList = document.getElementById('openTablesList');
    const openTablesCount = document.getElementById('openTablesCount');
    if (!openTablesList || !openTablesCount) return;

    openTablesList.innerHTML = '';
    let count = 0;
    currentTablesSnapshot = docs; // Atualiza o estado global das mesas

    docs.forEach(doc => {
        const table = doc.data();
        const tableId = doc.id;

        // Filtra status OPEN ou MERGED (Agrupadas são exibidas, mas com status diferente)
        if (table.status?.toLowerCase() === 'open' || table.status?.toLowerCase() === 'merged') {
            count++;
            const total = table.total || 0;
            const isClientPending = table.clientOrderPending || false;
            const isMerged = table.status?.toLowerCase() === 'merged';

            let cardColorClasses = 'bg-dark-card border-gray-700 text-dark-text hover:bg-gray-700';
            let attentionIconHtml = '';

            // Lógica de cores baseada no status/alerta
            if (isMerged) {
                 cardColorClasses = 'bg-yellow-900 border-yellow-700 text-yellow-200 hover:bg-yellow-800';
                 attentionIconHtml = `<i class="fas fa-link attention-icon text-yellow-300" title="Agrupada: Mestra ${table.masterTable}"></i>`;
            } else if (isClientPending) {
                // Alerta de Pedido Cliente Pendente (Prioridade Máxima de alerta visual)
                 cardColorClasses = 'bg-indigo-900 border-yellow-400 text-white hover:bg-indigo-800 ring-2 ring-yellow-400';
                 attentionIconHtml = `<i class="fas fa-bell attention-icon text-yellow-400 animate-pulse" title="Pedido Cliente Pendente"></i>`;
            } else if (total > 0) {
                 cardColorClasses = 'bg-red-900 border-red-700 text-red-200 hover:bg-red-800';
            } else {
                 cardColorClasses = 'bg-green-900 border-green-700 text-green-200 hover:bg-green-800';
            }

            const hasAguardandoItem = (table.selectedItems || []).some(item => item.note?.toLowerCase().includes('espera'));
            if (!isClientPending && hasAguardandoItem) attentionIconHtml = `<i class="fas fa-exclamation-triangle attention-icon" title="Itens em Espera"></i>`;

            let lastSentAt = null;
            if (table.lastKdsSentAt?.toMillis) lastSentAt = table.lastKdsSentAt.toMillis();
            else if (typeof table.lastKdsSentAt === 'number') lastSentAt = table.lastKdsSentAt;

            const elapsedTime = lastSentAt ? formatElapsedTime(lastSentAt) : null;
            const timerHtml = elapsedTime ? `<div class="table-timer"><i class="fas fa-clock"></i> <span>${elapsedTime}</span></div>` : '';
            
            // NOVO: Define o botão de KDS (agora no footer do card)
            let kdsStatusButtonHtml = '';
            if (lastSentAt) {
                 kdsStatusButtonHtml = `<button class="kds-status-icon-btn" title="Status KDS" onclick="window.openKdsStatusModal(${tableId})"><i class="fas fa-tasks"></i></button>`;
            }
            
            // NOVO: Define o botão de Agrupar Mesas (top-left) - Chama o modal de autenticação
            const mergeIconHtml = isMerged ? '' : `<button class="merge-icon-btn" title="Agrupar Mesas" onclick="window.openManagerAuthModal('openTableMerge', ${tableId})"><i class="fas fa-people-arrows"></i></button>`;
            
            const clientInfo = table.clientName ? `<p class="text-xs font-semibold">${table.clientName}</p>` : '';
            
            const statusText = isMerged ? `Agrupada (Mestra: ${table.masterTable})` : `Pessoas: ${table.diners}`;

            const cardHtml = `
                <div class="table-card-panel ${cardColorClasses} shadow-md transition-colors duration-200 relative" data-table-id="${tableId}">
                    ${mergeIconHtml} ${attentionIconHtml}
                    <h3 class="font-bold text-2xl">Mesa ${table.tableNumber}</h3>
                    <p class="text-xs font-light">Setor: ${table.sector || 'N/A'}</p>
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

    // Reanexa listeners
    document.querySelectorAll('.table-card-panel').forEach(card => {
        const newCard = card.cloneNode(true);
        card.parentNode.replaceChild(newCard, card);
        newCard.addEventListener('click', (e) => {
            // AJUSTE: Ignora o clique se for nos novos botões de ícone
            if (e.target.closest('.kds-status-icon-btn') || e.target.closest('.attention-icon') || e.target.closest('.merge-icon-btn')) return;
            const tableId = newCard.dataset.tableId;
            if (tableId) {
                // Chama a função importada do app.js
                selectTableAndStartListener(tableId);
            }
        });
    });
};

export const loadOpenTables = () => {
    if (unsubscribeTables) { unsubscribeTables(); unsubscribeTables = null; }
    const tablesCollection = getTablesCollectionRef();
    let q;
    // Query para pegar mesas 'open' OU 'merged'
    if (currentSectorFilter === 'Todos') q = query(tablesCollection, where('status', 'in', ['open', 'merged']), orderBy('tableNumber', 'asc'));
    else q = query(tablesCollection, where('status', 'in', ['open', 'merged']), where('sector', '==', currentSectorFilter), orderBy('tableNumber', 'asc'));

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
            alert(`A Mesa ${tableNumber} já está aberta!`);
            return;
        }
        
        // NOVO: Gerar PIN de 4 dígitos
        const accessPin = Math.floor(1000 + Math.random() * 9000).toString();
        
        console.log(`[Panel] Abrindo Mesa ${tableNumber} / ${sector} / ${diners}p. PIN: ${accessPin}`);
        
        await setDoc(tableRef, {
            tableNumber, diners, sector, status: 'open', createdAt: serverTimestamp(),
            total: 0, sentItems: [], payments: [], serviceTaxApplied: true, selectedItems: [],
            accessPin: accessPin // Armazena o PIN de acesso para o cliente
        });
        
        mesaInput.value = ''; pessoasInput.value = ''; sectorInput.value = '';
        alert(`Mesa ${tableNumber} aberta com sucesso! PIN de Acesso Digital: ${accessPin}`);
        selectTableAndStartListener(tableNumber.toString()); // Chama a função do app.js
    } catch (e) {
        console.error("Erro ao abrir mesa:", e);
        alert("Erro ao tentar abrir a mesa.");
    }
};

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
        selectTableAndStartListener(tableNumber); // Chama a função do app.js
        if(searchTableInput) searchTableInput.value = '';
    } else {
        console.log(`[Panel] Mesa ${tableNumber} não encontrada ou fechada.`);
        alert(`A Mesa ${tableNumber} não está aberta.`);
    }
};


// ==================================================================
//               LÓGICA DE AGRUPAMENTO DE MESAS (NOVA)
// ==================================================================

/**
 * Exibe o modal para selecionar mesas para agrupar.
 */
export const openTableMergeModal = () => {
    const managerModal = document.getElementById('managerModal');
    if (!managerModal) return;

    // Filtra apenas mesas com status 'open' que têm algum item ou total > 0
    const availableTables = currentTablesSnapshot
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(t => t.status?.toLowerCase() === 'open' && (t.sentItems?.length > 0 || t.selectedItems?.length > 0 || t.total > 0));

    if (availableTables.length < 2) {
        alert("Pelo menos duas mesas abertas e com itens/total são necessárias para agrupar.");
        return;
    }

    const tableOptions = availableTables.map(t => `<option value="${t.tableNumber}">Mesa ${t.tableNumber} (${formatCurrency(t.total || 0)})</option>`).join('');

    managerModal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 p-6 rounded-xl shadow-2xl w-full max-w-lg">
            <h3 class="text-xl font-bold mb-4 text-indigo-400">Agrupar Mesas para Grande Grupo</h3>
            <p class="text-base mb-4 text-dark-text">Selecione a **Mesa Mestra (Destino)** e as **Mesas Secundárias (Origem)**. Os itens serão movidos para a Mestra e as Origens serão fechadas/marcadas como Agrupadas.</p>
            
            <div class="mb-4">
                <label for="masterTableSelect" class="block text-sm font-medium text-white mb-2">MESA MESTRA (DESTINO):</label>
                <select id="masterTableSelect" class="w-full p-3 bg-dark-input border border-gray-600 rounded-lg text-dark-text">
                    <option value="">-- Selecione a Mesa Principal --</option>
                    ${tableOptions}
                </select>
            </div>
            
            <div class="mb-4">
                <label class="block text-sm font-medium text-white mb-2">MESAS SECUNDÁRIAS (ORIGEM):</label>
                <div id="sourceTablesCheckboxes" class="space-y-2 max-h-40 overflow-y-auto p-2 bg-dark-input border border-gray-700 rounded-lg">
                    ${availableTables.map(t => `
                        <div class="flex items-center">
                            <input type="checkbox" id="sourceTable_${t.tableNumber}" value="${t.tableNumber}" class="h-4 w-4 text-indigo-600 bg-gray-700 border-gray-600 rounded focus:ring-indigo-500">
                            <label for="sourceTable_${t.tableNumber}" class="ml-3 text-dark-text">Mesa ${t.tableNumber} (${formatCurrency(t.total || 0)})</label>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div id="mergeErrorMsg" class="text-red-400 text-sm mb-3 hidden"></div>
            
            <div class="flex justify-end space-x-3 mt-6">
                <button class="px-4 py-3 bg-gray-600 text-gray-200 rounded-lg hover:bg-gray-500 transition text-base" onclick="document.getElementById('managerModal').style.display='none'">Cancelar</button>
                <button id="confirmMergeBtn" class="px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-base">Confirmar Agrupamento</button>
            </div>
        </div>
    `;
    managerModal.style.display = 'flex';
    
    const confirmBtn = document.getElementById('confirmMergeBtn');
    if (confirmBtn) {
        confirmBtn.onclick = handleConfirmTableMerge;
    }
};
window.openTableMergeModal = openTableMergeModal; // Expor para o app.js

/**
 * Executa a lógica de agrupamento de mesas via batch do Firestore.
 */
export const handleConfirmTableMerge = async () => {
    const masterTableId = document.getElementById('masterTableSelect').value;
    const sourceTableCheckboxes = document.querySelectorAll('#sourceTablesCheckboxes input[type="checkbox"]:checked');
    const errorMsgEl = document.getElementById('mergeErrorMsg');
    
    // Converte os IDs de string para número e filtra a Mestra, se por acaso estiver marcada
    const sourceTableIds = Array.from(sourceTableCheckboxes).map(cb => cb.value).filter(id => id !== masterTableId);

    if (!masterTableId) {
        errorMsgEl.textContent = 'Selecione a Mesa Mestra.';
        errorMsgEl.style.display = 'block';
        return;
    }
    if (sourceTableIds.length === 0) {
        errorMsgEl.textContent = 'Selecione pelo menos uma Mesa Secundária.';
        errorMsgEl.style.display = 'block';
        return;
    }

    if (!confirm(`Tem certeza que deseja mover todos os itens das Mesas ${sourceTableIds.join(', ')} para a MESA MESTRA ${masterTableId}? As mesas secundárias serão fechadas/agrupadas.`)) {
        return;
    }
    
    const confirmBtn = document.getElementById('confirmMergeBtn');
    const managerModal = document.getElementById('managerModal');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Agrupando...'; }

    try {
        const masterTableRef = getTableDocRef(masterTableId);
        const masterSnap = await getDoc(masterTableRef);
        
        if (!masterSnap.exists() || masterSnap.data().status !== 'open') {
             throw new Error(`A Mesa Mestra ${masterTableId} não está aberta.`);
        }
        
        const dbInstance = db;
        if (!dbInstance) throw new Error("Conexão com banco de dados indisponível.");
        const batch = writeBatch(dbInstance);

        let masterNewTotal = masterSnap.data().total || 0;
        let masterNewDiners = masterSnap.data().diners || 1;
        let allItemsToMerge = []; 
        let allSelectedItemsToMerge = []; 
        let allRequestedOrdersToMerge = []; 
        let allClientInfoToMerge = {};
        
        const originalSourceSnapshots = [];

        // 1. Coleta dados de todas as Mesas Secundárias
        for (const sourceId of sourceTableIds) {
            const sourceRef = getTableDocRef(sourceId);
            const sourceSnap = await getDoc(sourceRef);
            
            if (sourceSnap.exists() && sourceSnap.data().status === 'open') {
                originalSourceSnapshots.push(sourceSnap);
                const sourceData = sourceSnap.data();
                
                masterNewTotal += (sourceData.total || 0);
                masterNewDiners += (sourceData.diners || 0);

                if (sourceData.sentItems) allItemsToMerge.push(...sourceData.sentItems);
                if (sourceData.selectedItems) allSelectedItemsToMerge.push(...sourceData.selectedItems);
                if (sourceData.requestedOrders) allRequestedOrdersToMerge.push(...sourceData.requestedOrders);
                
                // 2. Marca a Mesa Secundária como Agrupada e limpa seus dados transacionais
                batch.update(sourceRef, {
                    status: 'merged', 
                    masterTable: masterTableId,
                    sentItems: [], 
                    selectedItems: [],
                    requestedOrders: [],
                    clientOrderPending: false, // Remove alerta
                    total: 0,
                    payments: [],
                    diners: 0
                });
            }
        }

        // 3. Atualiza a Mesa Mestra
        const masterExistingSentItems = masterSnap.data().sentItems || [];
        const masterExistingSelectedItems = masterSnap.data().selectedItems || [];
        const masterExistingRequestedOrders = masterSnap.data().requestedOrders || [];
        const currentMergedTables = masterSnap.data().mergedTables || [];

        batch.update(masterTableRef, {
            total: masterNewTotal,
            diners: masterNewDiners,
            sentItems: arrayUnion(...masterExistingSentItems, ...allItemsToMerge), 
            selectedItems: arrayUnion(...masterExistingSelectedItems, ...allSelectedItemsToMerge), 
            requestedOrders: arrayUnion(...masterExistingRequestedOrders, ...allRequestedOrdersToMerge),
            mergedTables: arrayUnion(...currentMergedTables, ...sourceTableIds), // Registra as mesas agrupadas
            // Se houver qualquer requestedOrder, a flag de alerta é reativada
            clientOrderPending: (masterExistingRequestedOrders.length + allRequestedOrdersToMerge.length) > 0, 
        });

        // 4. Executa o Batch
        await batch.commit();
        
        // Sucesso
        managerModal.style.display = 'none';
        alert(`Agrupamento concluído! Mesas ${sourceTableIds.join(', ')} agrupadas na MESA ${masterTableId}.`);
        loadOpenTables(); // Recarrega o painel
        
    } catch (e) {
        console.error("Erro no Agrupamento de Mesas:", e);
        errorMsgEl.textContent = `Falha ao agrupar: ${e.message}`;
        errorMsgEl.style.display = 'block';
    } finally {
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirmar Agrupamento'; }
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
    const abrirMesaRealBtn = document.getElementById('abrirMesaBtn'); // Para checkInputs

    if (abrirMesaBtn) abrirMesaBtn.addEventListener('click', handleAbrirMesa);
    else console.error("[PanelController] Botão 'abrirMesaBtn' não encontrado.");

    if (searchTableBtn) searchTableBtn.addEventListener('click', handleSearchTable);
    else console.error("[PanelController] Botão 'searchTableBtn' não encontrado.");

    if (sectorFiltersContainer) {
         sectorFiltersContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.sector-btn');
            if (btn) {
                const sector = btn.dataset.sector;
                currentSectorFilter = sector;
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
        if (abrirMesaRealBtn) {
            abrirMesaRealBtn.disabled = !(mesaValida && pessoasValida && sectorValido);
        }
    };
    if(mesaInput) mesaInput.addEventListener('input', checkInputs);
    if(pessoasInput) pessoasInput.addEventListener('input', checkInputs);
    if(sectorInput) sectorInput.addEventListener('change', checkInputs);


    panelInitialized = true;
    console.log("[PanelController] Inicializando.");
};
