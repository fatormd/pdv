// --- CONTROLLERS/KDSCONTROLLER.JS (VERSÃO FINAL - COM RECUSA DE PEDIDO) ---
import { getKdsCollectionRef, getTableDocRef, db } from "/services/firebaseService.js"; 
import { query, where, orderBy, limit, onSnapshot, updateDoc, doc, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { formatElapsedTime, toggleLoading } from "/utils.js"; 
import { playNotificationSound, showToast } from "/app.js"; 

// Estado Local
let unsubscribeKds = null;
let kdsInitialized = false;
let currentSectorFilter = 'all'; 

export const initKdsController = () => {
    if (kdsInitialized) return;
    console.log("[KDS] Inicializando...");
    
    // Elementos de UI
    const filterSelect = document.getElementById('kdsSectorFilter');
    const refreshBtn = document.getElementById('refreshKdsBtn');
    const historyBtn = document.getElementById('historyKdsBtn');

    // Listener do Filtro de Setor
    if (filterSelect) {
        filterSelect.addEventListener('change', (e) => {
            currentSectorFilter = e.target.value;
            loadKdsOrders(); 
        });
    }
    
    // Botão de Atualização
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadKdsOrders();
            showToast("Lista KDS atualizada.", false);
        });
    }

    // Botão de Histórico
    if (historyBtn) {
        historyBtn.addEventListener('click', () => {
            const modal = document.getElementById('kdsHistoryModal');
            if (modal) {
                modal.style.display = 'flex';
                loadKdsHistory(); 
            }
        });
    }

    loadKdsOrders();
    kdsInitialized = true;
};

// --- MONITORAMENTO EM TEMPO REAL ---
const loadKdsOrders = () => {
    if (unsubscribeKds) {
        unsubscribeKds();
    }

    const q = query(
        getKdsCollectionRef(), 
        where('status', 'in', ['pending', 'preparing']), 
        orderBy('sentAt', 'asc')
    );

    unsubscribeKds = onSnapshot(q, (snapshot) => {
        const container = document.getElementById('kdsOrdersContainer');
        if (!container) return;

        container.innerHTML = '';
        
        // Filtra visualmente
        const filteredDocs = snapshot.docs.filter(doc => {
            const data = doc.data();
            if (currentSectorFilter === 'all') return true;
            return data.sectors && data.sectors[currentSectorFilter] && data.sectors[currentSectorFilter].length > 0;
        });
        
        if (filteredDocs.length === 0) {
            container.innerHTML = `<p class="col-span-full text-center text-gray-500 mt-10 text-lg">Sem pedidos na fila ${currentSectorFilter !== 'all' ? `do setor ${currentSectorFilter}` : ''}.</p>`;
            return;
        }

        // Som
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                const data = change.doc.data();
                const hasSector = currentSectorFilter === 'all' || (data.sectors && data.sectors[currentSectorFilter]);
                if (hasSector) {
                    playNotificationSound();
                }
            }
        });

        filteredDocs.forEach(docSnap => {
            renderKdsCard(container, docSnap.id, docSnap.data());
        });

    }, (error) => {
        console.error("Erro KDS:", error);
        const container = document.getElementById('kdsOrdersContainer');
        if (container) container.innerHTML = `<p class="text-red-400 text-center mt-10">Erro de conexão: ${error.message}</p>`;
    });
};

const renderKdsCard = (container, docId, data) => {
    const card = document.createElement('div');
    
    const isPreparing = data.status === 'preparing';
    const borderClass = isPreparing ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-700 hover:border-gray-500';
    const bgClass = isPreparing ? 'bg-gray-800' : 'bg-dark-card';

    card.className = `${bgClass} border ${borderClass} rounded-lg p-4 shadow-lg flex flex-col justify-between h-full animate-fade-in transition-all duration-300`;
    
    const time = data.sentAt ? formatElapsedTime(data.sentAt.toMillis ? data.sentAt.toMillis() : data.sentAt) : '--';
    const tableDisplay = data.subTable ? `Mesa ${data.tableNumber} <span class="text-xs font-normal text-yellow-500">(Sub: ${data.subTable})</span>` : `Mesa ${data.tableNumber}`;
    
    let itemsHtml = '';
    if (data.sectors) {
        Object.entries(data.sectors).forEach(([sec, items]) => {
            if (currentSectorFilter !== 'all' && currentSectorFilter !== sec) return;

            itemsHtml += `
                <div class="border-b border-gray-700/50 pb-2 mb-2 last:border-0 last:mb-0 last:pb-0">
                    <p class="text-[10px] font-bold text-pumpkin uppercase mb-1 tracking-wider">${sec}</p>
                    ${items.map(i => `
                        <div class="flex justify-between items-start text-sm text-gray-200 mb-1">
                            <span class="font-medium">${i.name}</span>
                            ${i.note ? `<span class="text-xs text-yellow-400 font-bold ml-2 text-right bg-yellow-900/20 px-1 rounded max-w-[50%]">(${i.note})</span>` : ''}
                        </div>
                        ${i.origin ? `<p class="text-[10px] text-gray-500 italic text-right mt-[-2px]">Origem: ${i.origin}</p>` : ''}
                    `).join('')}
                </div>
            `;
        });
    }

    const btnText = isPreparing ? 'Pronto / Servir' : 'Iniciar Preparo';
    const btnColor = isPreparing ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700';
    const btnIcon = isPreparing ? '<i class="fas fa-check mr-2"></i>' : '<i class="fas fa-fire mr-2"></i>';

    // HTML do Botão "Recusar"
    const rejectBtnHtml = !isPreparing ? `
        <button class="py-3 px-4 bg-red-900/50 hover:bg-red-800 text-red-300 rounded-lg transition shadow-sm btn-reject-order mr-2" title="Recusar Pedido">
            <i class="fas fa-times"></i>
        </button>
    ` : '';

    card.innerHTML = `
        <div class="flex justify-between items-start mb-3 border-b border-gray-700 pb-2">
            <div>
                <h3 class="text-xl font-bold text-white leading-tight">${tableDisplay}</h3>
                <p class="text-xs text-gray-500 mt-1">Pedido #${data.orderId.slice(-4)}</p>
                ${data.addedBy ? `<p class="text-[10px] text-indigo-400 mt-0.5"><i class="fas fa-user-tag mr-1"></i>${data.addedBy}</p>` : ''}
            </div>
            <div class="text-right flex flex-col items-end">
                <div class="flex items-center text-gray-300 text-sm mb-1 font-mono bg-gray-900 px-2 py-1 rounded">
                    <i class="fas fa-clock mr-1.5 text-gray-500"></i> <span>${time}</span>
                </div>
                ${isPreparing 
                    ? '<span class="text-[10px] font-bold bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded border border-blue-800">EM PREPARO</span>' 
                    : '<span class="text-[10px] font-bold bg-gray-700 text-gray-400 px-2 py-0.5 rounded">PENDENTE</span>'}
            </div>
        </div>
        
        <div class="space-y-1 mb-4 flex-grow overflow-y-auto max-h-[60vh] custom-scrollbar pr-1">
            ${itemsHtml}
        </div>

        <div class="flex items-center">
            ${rejectBtnHtml}
            <button class="flex-grow py-3 ${btnColor} text-white font-bold rounded-lg transition shadow-md btn-advance-status flex items-center justify-center uppercase tracking-wide text-sm">
                ${btnIcon} ${btnText}
            </button>
        </div>
    `;

    container.appendChild(card);

    // Listener do Botão Avançar
    const btn = card.querySelector('.btn-advance-status');
    btn.addEventListener('click', async () => {
        const newStatus = data.status === 'pending' ? 'preparing' : 'finished';
        const actionName = data.status === 'pending' ? 'Iniciando...' : 'Finalizando...';
        
        toggleLoading(btn, true, actionName);

        try {
            await updateDoc(doc(getKdsCollectionRef(), docId), { status: newStatus });
            
            if (newStatus === 'finished') {
                const tableRef = getTableDocRef(data.tableNumber);
                await updateDoc(tableRef, { 
                    kdsAlert: 'ready' 
                });
            }

        } catch (err) {
            console.error("Erro status KDS:", err);
            showToast("Erro ao atualizar status.", true);
            toggleLoading(btn, false);
        }
    });

    // Listener do Botão Recusar
    const rejectBtn = card.querySelector('.btn-reject-order');
    if (rejectBtn) {
        rejectBtn.addEventListener('click', async () => {
            const reason = prompt(`Motivo da recusa para Mesa ${data.tableNumber}:`);
            if (reason !== null) { // Permite string vazia, mas cancela se for null (Esc)
                try {
                    await updateDoc(doc(getKdsCollectionRef(), docId), { 
                        status: 'cancelled',
                        cancelReason: reason || 'Sem motivo'
                    });
                    showToast("Pedido recusado.", true);
                } catch (err) {
                    console.error("Erro ao recusar KDS:", err);
                    showToast("Erro ao recusar.", true);
                }
            }
        });
    }
};

// --- HISTÓRICO (MANTIDO) ---
const loadKdsHistory = async () => {
    const list = document.getElementById('kdsHistoryList');
    if (!list) return;

    list.innerHTML = '<div class="col-span-full text-center py-10"><i class="fas fa-spinner fa-spin text-pumpkin text-3xl"></i></div>';

    try {
        const q = query(
            getKdsCollectionRef(),
            where('status', 'in', ['finished', 'cancelled']),
            orderBy('sentAt', 'desc'),
            limit(50)
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            list.innerHTML = '<p class="col-span-full text-center text-gray-500 italic">Nenhum histórico recente.</p>';
            return;
        }

        list.innerHTML = snapshot.docs.map(docSnap => {
            const data = docSnap.data();
            const time = data.sentAt ? new Date(data.sentAt.toMillis()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--';
            
            let itemsList = '';
            if (data.sectors) {
                Object.values(data.sectors).forEach(items => {
                    items.forEach(i => {
                        itemsList += `<span class="block text-xs text-gray-400">• ${i.name} ${i.note ? `(${i.note})` : ''}</span>`;
                    });
                });
            }

            return `
                <div class="bg-dark-input p-3 rounded border border-gray-700 opacity-75 hover:opacity-100 transition">
                    <div class="flex justify-between items-center mb-2 border-b border-gray-700 pb-1">
                        <span class="font-bold text-gray-300">Mesa ${data.tableNumber}</span>
                        <span class="text-xs font-mono text-gray-500">${time}</span>
                    </div>
                    <div class="mb-2">${itemsList}</div>
                    ${data.cancelReason ? `<p class="text-xs text-red-400 mb-2">Motivo: ${data.cancelReason}</p>` : ''}
                    <div class="text-right">
                        <span class="text-[10px] uppercase font-bold px-2 py-1 rounded ${data.status === 'finished' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}">
                            ${data.status === 'finished' ? 'ENTREGUE' : 'CANCELADO'}
                        </span>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error("Erro histórico KDS:", error);
        list.innerHTML = '<p class="col-span-full text-center text-red-400">Erro ao carregar histórico. Verifique índices.</p>';
    }
};