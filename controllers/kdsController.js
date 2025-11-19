import { db, appId, getKdsCollectionRef } from "/services/firebaseService.js";
import { onSnapshot, query, where, orderBy, updateDoc, doc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { formatElapsedTime } from "/utils.js";
import { showToast } from "/app.js";

let kdsInitialized = false;
let unsubscribeKds = null;
let kdsOrdersContainer;
let sectorFilterSelect;
let currentOrdersData = []; // Armazena os dados brutos para filtragem local

export const initKdsController = () => {
    if (kdsInitialized) return;
    console.log("[KDS] Inicializando...");

    kdsOrdersContainer = document.getElementById('kdsOrdersContainer');
    sectorFilterSelect = document.getElementById('kdsSectorFilter');
    
    // Recupera filtro salvo no navegador (para persistir após refresh)
    const savedFilter = localStorage.getItem('kds_sector_filter');
    if (savedFilter && sectorFilterSelect) {
        sectorFilterSelect.value = savedFilter;
    }

    // Listener para mudança de filtro
    if (sectorFilterSelect) {
        sectorFilterSelect.addEventListener('change', (e) => {
            localStorage.setItem('kds_sector_filter', e.target.value);
            renderKdsScreen(currentOrdersData); // Re-renderiza com os dados atuais
        });
    }
    
    document.getElementById('refreshKdsBtn')?.addEventListener('click', startKdsListener);

    startKdsListener();
    setInterval(updateKdsTimers, 60000);

    kdsInitialized = true;
};

const startKdsListener = () => {
    if (unsubscribeKds) unsubscribeKds();

    // O índice composto (status + sentAt) já foi criado no console
    const q = query(
        getKdsCollectionRef(),
        where('status', 'in', ['pending', 'preparing']),
        orderBy('sentAt', 'asc')
    );

    unsubscribeKds = onSnapshot(q, (snapshot) => {
        currentOrdersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderKdsScreen(currentOrdersData);
    }, (error) => {
        console.error("[KDS] Erro no listener:", error);
        if (kdsOrdersContainer) kdsOrdersContainer.innerHTML = `<p class="text-red-400 p-4">Erro de conexão: ${error.message}</p>`;
    });
};

const renderKdsScreen = (orders) => {
    if (!kdsOrdersContainer) return;

    const currentFilter = sectorFilterSelect ? sectorFilterSelect.value.toLowerCase() : 'all';

    // Filtra os pedidos para exibição
    const filteredOrdersHtml = orders.map(order => {
        // 1. Verificar itens dentro dos setores
        let hasItemsForView = false;
        let itemsHtml = '';

        if (order.sectors) {
            Object.entries(order.sectors).forEach(([sectorName, items]) => {
                // Lógica de Filtro:
                // Se filtro for 'all', mostra tudo.
                // Se filtro for específico (ex: 'bar'), só mostra se o nome do setor bater.
                // Nota: Normalizamos para minúsculas para evitar erros (Bar vs bar)
                const sectorNameLower = sectorName.toLowerCase();
                const filterLower = currentFilter.toLowerCase();

                if (currentFilter === 'all' || sectorNameLower === filterLower || 
                   (filterLower === 'cozinha' && sectorNameLower !== 'bar' && sectorNameLower !== 'pizzaria' && sectorNameLower !== 'churrasqueira')) {
                    // Exemplo acima: Se selecionar 'Cozinha', pode-se agrupar tudo que não é bebida, ou ser estrito.
                    // Aqui faremos correspondência exata ou 'all' para simplificar.
                }
                
                // Lógica Simplificada: Correspondência Exata ou 'all'
                if (currentFilter !== 'all' && sectorName.toLowerCase() !== currentFilter) {
                    return; // Pula este setor se não for o selecionado
                }

                if (items.length > 0) {
                    hasItemsForView = true;
                    itemsHtml += `<div class="mb-2 border-b border-gray-700 pb-1 last:border-0">
                        <p class="text-xs uppercase font-bold text-pumpkin mb-1">${sectorName}</p>
                        ${items.map(item => `
                            <div class="flex justify-between items-start py-1">
                                <div>
                                    <span class="text-lg font-bold text-gray-100">${item.name}</span>
                                    ${item.note ? `<p class="text-sm text-yellow-400 bg-yellow-900/30 p-1 rounded mt-1"><i class="fas fa-exclamation-circle"></i> ${item.note}</p>` : ''}
                                </div>
                                <span class="text-gray-400 text-sm">1x</span>
                            </div>
                        `).join('')}
                    </div>`;
                }
            });
        }

        // Se não houver itens para mostrar neste setor, não renderiza o card
        if (!hasItemsForView) return '';

        const sentAt = order.sentAt?.toDate ? order.sentAt.toDate() : new Date();
        const elapsedTime = formatElapsedTime(sentAt.getTime());
        
        // Cores do Timer
        const diffMinutes = Math.floor((Date.now() - sentAt.getTime()) / 60000);
        let timerColor = "text-gray-400";
        let borderClass = "border-gray-700";
        
        if (diffMinutes >= 20) {
            timerColor = "text-red-500 font-bold animate-pulse";
            borderClass = "border-red-500";
        } else if (diffMinutes >= 10) {
            timerColor = "text-yellow-400";
            borderClass = "border-yellow-500";
        } else if (order.status === 'preparing') {
            borderClass = "border-blue-500";
        }

        // Botão de Ação
        let actionBtn;
        if (order.status === 'pending') {
            actionBtn = `
                <button onclick="window.advanceKdsStatus('${order.id}', 'preparing')" 
                    class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-lg transition">
                    <i class="fas fa-fire mr-2"></i> Preparar
                </button>`;
        } else {
            actionBtn = `
                <button onclick="window.advanceKdsStatus('${order.id}', 'ready')" 
                    class="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-lg transition">
                    <i class="fas fa-check mr-2"></i> Pronto
                </button>`;
        }

        return `
            <div class="kds-card bg-dark-card border-l-4 ${borderClass} rounded-r-xl shadow-lg flex flex-col h-auto min-h-[300px]">
                <div class="p-4 bg-gray-800 rounded-tr-xl flex justify-between items-start">
                    <div>
                        <h3 class="text-2xl font-extrabold text-white">Mesa ${order.tableNumber}</h3>
                        <p class="text-xs text-gray-400">#${order.orderId.slice(-4)}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-xl ${timerColor} kds-timer" data-time="${sentAt.getTime()}">${elapsedTime}</p>
                        <p class="text-xs text-gray-500">${sentAt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                    </div>
                </div>

                <div class="p-4 flex-grow overflow-y-auto custom-scrollbar space-y-2">
                    ${itemsHtml}
                </div>

                <div class="p-4 bg-gray-800/50 mt-auto">
                    ${actionBtn}
                </div>
            </div>
        `;
    }).join('');

    if (filteredOrdersHtml.trim() === '') {
         kdsOrdersContainer.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center h-64 text-gray-500 opacity-50">
                <i class="fas fa-check-circle text-6xl mb-4"></i>
                <p class="text-xl">Nenhum pedido pendente para: <span class="font-bold text-pumpkin">${currentFilter === 'all' ? 'Todos' : currentFilter}</span></p>
            </div>`;
    } else {
        kdsOrdersContainer.innerHTML = filteredOrdersHtml;
    }
};

const updateKdsTimers = () => {
    document.querySelectorAll('.kds-timer').forEach(el => {
        const time = parseInt(el.dataset.time);
        if (time) el.textContent = formatElapsedTime(time);
    });
};

window.advanceKdsStatus = async (orderId, newStatus) => {
    try {
        const orderRef = doc(db, 'artifacts', appId, 'public', 'data', 'kds_orders', orderId);
        if (newStatus === 'ready') {
            await deleteDoc(orderRef); // Remove da tela
            showToast("Pedido pronto!", false);
        } else {
            await updateDoc(orderRef, { status: newStatus });
        }
    } catch (e) {
        console.error("Erro ao atualizar KDS:", e);
        showToast("Erro ao atualizar status.", true);
    }
};