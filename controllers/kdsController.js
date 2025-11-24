import { db, appId, getKdsCollectionRef, getSystemStatusDocRef } from "/services/firebaseService.js";
import { onSnapshot, query, where, orderBy, updateDoc, doc, serverTimestamp, getDocs, deleteDoc, Timestamp, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { formatElapsedTime } from "/utils.js";
import { showToast, playNotificationSound } from "/app.js";

let kdsInitialized = false;
let unsubscribeKds = null;
let kdsOrdersContainer;
let sectorFilterSelect;
let currentOrdersData = []; 

export const initKdsController = () => {
    if (kdsInitialized) return;
    console.log("[KDS] Inicializando...");

    kdsOrdersContainer = document.getElementById('kdsOrdersContainer');
    sectorFilterSelect = document.getElementById('kdsSectorFilter');
    
    const savedFilter = localStorage.getItem('kds_sector_filter');
    if (savedFilter && sectorFilterSelect) {
        sectorFilterSelect.value = savedFilter;
    }

    if (sectorFilterSelect) {
        sectorFilterSelect.addEventListener('change', (e) => {
            localStorage.setItem('kds_sector_filter', e.target.value);
            renderKdsScreen(currentOrdersData); 
        });
    }
    
    document.getElementById('refreshKdsBtn')?.addEventListener('click', startKdsListener);
    document.getElementById('historyKdsBtn')?.addEventListener('click', toggleKdsHistory);

    startKdsListener();
    setInterval(updateKdsTimers, 60000);

    kdsInitialized = true;
};

const startKdsListener = () => {
    if (unsubscribeKds) unsubscribeKds();

    const q = query(
        getKdsCollectionRef(),
        where('status', 'in', ['pending', 'preparing']),
        orderBy('sentAt', 'asc')
    );

    unsubscribeKds = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added" && change.doc.data().status === 'pending') {
                console.log("[KDS] Novo pedido! Tocando som...");
                playNotificationSound();
            }
        });

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

    const filteredOrdersHtml = orders.map(order => {
        let hasItemsForView = false;
        let itemsHtml = '';

        if (order.sectors) {
            Object.entries(order.sectors).forEach(([sectorName, items]) => {
                const sectorNameLower = sectorName.toLowerCase();
                if (currentFilter !== 'all' && sectorNameLower !== currentFilter) { return; }

                if (items.length > 0) {
                    hasItemsForView = true;
                    itemsHtml += `<div class="mb-2 border-b border-gray-700 pb-1 last:border-0">
                        <p class="text-[10px] md:text-xs uppercase font-bold text-pumpkin mb-1">${sectorName}</p>
                        ${items.map(item => `
                            <div class="flex justify-between items-start py-1">
                                <div>
                                    <span class="text-base md:text-lg font-bold text-gray-100 leading-tight">${item.name}</span>
                                    ${item.note ? `<p class="text-xs md:text-sm text-yellow-400 bg-yellow-900/30 p-1 rounded mt-1"><i class="fas fa-exclamation-circle"></i> ${item.note}</p>` : ''}
                                </div>
                                <span class="text-gray-400 text-xs md:text-sm ml-2 whitespace-nowrap">1x</span>
                            </div>
                        `).join('')}
                    </div>`;
                }
            });
        }

        if (!hasItemsForView) return '';

        const sentAt = order.sentAt?.toDate ? order.sentAt.toDate() : new Date();
        const elapsedTime = formatElapsedTime(sentAt.getTime());
        
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

        let actionBtns;
        if (order.status === 'pending') {
            actionBtns = `
                <div class="flex space-x-2">
                    <button onclick="window.rejectKdsOrder('${order.id}')" 
                        class="w-1/3 py-2 md:py-3 bg-red-900/80 hover:bg-red-800 text-white rounded-lg font-bold text-base md:text-lg transition border border-red-700 flex items-center justify-center" title="Rejeitar">
                        <i class="fas fa-times"></i>
                    </button>
                    <button onclick="window.advanceKdsStatus('${order.id}', 'preparing')" 
                        class="w-2/3 py-2 md:py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-base md:text-lg transition flex items-center justify-center">
                        <i class="fas fa-fire mr-2"></i> <span class="hidden md:inline">Preparar</span><span class="md:hidden">Prep.</span>
                    </button>
                </div>`;
        } else {
            actionBtns = `
                <div class="flex space-x-2">
                    <button onclick="window.printKdsOrder('${order.id}')" 
                        class="w-1/3 py-2 md:py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold text-base md:text-lg transition border border-gray-600 flex items-center justify-center" title="Imprimir">
                        <i class="fas fa-print"></i>
                    </button>
                    <button onclick="window.advanceKdsStatus('${order.id}', 'finished')" 
                        class="w-2/3 py-2 md:py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-base md:text-lg transition flex items-center justify-center">
                        <i class="fas fa-check mr-2"></i> Pronto
                    </button>
                </div>`;
        }

        return `
            <div class="kds-card bg-dark-card border-l-4 ${borderClass} rounded-r-xl shadow-lg flex flex-col h-auto min-h-[220px] md:min-h-[300px]">
                <div class="p-3 md:p-4 bg-gray-800 rounded-tr-xl flex justify-between items-start">
                    <div>
                        <h3 class="text-lg md:text-2xl font-extrabold text-white">Mesa ${order.tableNumber}</h3>
                        <p class="text-[10px] md:text-xs text-gray-400 font-mono">#${order.orderId.slice(-4)}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-base md:text-xl ${timerColor} kds-timer" data-time="${sentAt.getTime()}">${elapsedTime}</p>
                        <p class="text-[10px] md:text-xs text-gray-500">${sentAt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                    </div>
                </div>

                <div class="p-3 md:p-4 flex-grow overflow-y-auto custom-scrollbar space-y-2">
                    ${itemsHtml}
                </div>

                <div class="p-3 md:p-4 bg-gray-800/50 mt-auto">
                    ${actionBtns}
                </div>
            </div>
        `;
    }).join('');

    if (filteredOrdersHtml.trim() === '') {
         kdsOrdersContainer.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center h-64 text-gray-500 opacity-50">
                <i class="fas fa-check-circle text-5xl md:text-6xl mb-4"></i>
                <p class="text-lg md:text-xl">Nenhum pedido pendente.</p>
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

// --- FUNÇÕES DE AÇÃO E HISTÓRICO ---

const toggleKdsHistory = async () => {
    const modal = document.getElementById('kdsHistoryModal');
    const list = document.getElementById('kdsHistoryList');
    if (!modal || !list) return;

    modal.style.display = 'flex';
    list.innerHTML = '<p class="text-center col-span-full text-gray-500 py-10"><i class="fas fa-spinner fa-spin"></i> Carregando histórico do turno...</p>';

    try {
        // LÓGICA DE INÍCIO DO TURNO (Controlado pelo Gerente)
        let startTimestamp;
        
        try {
            const statusSnap = await getDoc(getSystemStatusDocRef());
            if (statusSnap.exists() && statusSnap.data().startAt) {
                startTimestamp = statusSnap.data().startAt;
                console.log("[KDS] Usando horário de abertura do gerente:", startTimestamp.toDate());
            }
        } catch (err) {
            console.warn("Erro ao buscar status de abertura, usando fallback.", err);
        }

        // Fallback: Se não tiver abertura registrada, usa as últimas 24h
        if (!startTimestamp) {
            const fallbackDate = new Date();
            fallbackDate.setHours(fallbackDate.getHours() - 24);
            startTimestamp = Timestamp.fromDate(fallbackDate);
            console.log("[KDS] Fallback 24h ativado.");
        }

        const q = query(
            getKdsCollectionRef(),
            where('status', 'in', ['finished', 'cancelled']),
            where('sentAt', '>=', startTimestamp), 
            orderBy('sentAt', 'desc')
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            list.innerHTML = '<p class="text-center col-span-full text-gray-500 py-10">Nenhum pedido finalizado neste turno.</p>';
            return;
        }

        const html = snapshot.docs.map(doc => {
            const d = doc.data();
            const isCancelled = d.status === 'cancelled';
            const statusColor = isCancelled ? 'text-red-400 border-red-900' : 'text-green-400 border-green-900';
            const statusIcon = isCancelled ? 'fa-ban' : 'fa-check-circle';
            const time = d.sentAt?.toDate ? d.sentAt.toDate().toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--';
            const reason = d.cancellationReason ? `<p class="text-xs text-red-300 mt-2 italic">Motivo: ${d.cancellationReason}</p>` : '';

            let itemsSummary = '';
            if (d.sectors) {
                Object.values(d.sectors).forEach(items => {
                    items.forEach(item => {
                        itemsSummary += `<div class="text-sm text-gray-300 truncate">• ${item.name}</div>`;
                    });
                });
            }

            return `
                <div class="bg-gray-800 border border-gray-700 p-3 rounded-lg opacity-75 hover:opacity-100 transition">
                    <div class="flex justify-between items-start mb-2 border-b border-gray-700 pb-2">
                        <div>
                            <h4 class="font-bold text-white text-base">Mesa ${d.tableNumber}</h4>
                            <p class="text-xs text-gray-500">#${d.orderId ? d.orderId.slice(-4) : '???'} - ${time}</p>
                        </div>
                        <span class="px-2 py-1 rounded border text-[10px] uppercase font-bold flex items-center ${statusColor}">
                            <i class="fas ${statusIcon} mr-1"></i> ${d.status === 'finished' ? 'Pronto' : 'Cancelado'}
                        </span>
                    </div>
                    <div class="mb-3 pl-1 max-h-24 overflow-y-auto custom-scrollbar">
                        ${itemsSummary}
                        ${reason}
                    </div>
                    ${!isCancelled ? `
                    <button onclick="window.advanceKdsStatus('${doc.id}', 'preparing')" class="w-full py-2 bg-gray-700 hover:bg-indigo-600 text-gray-300 hover:text-white rounded transition text-xs font-bold uppercase">
                        <i class="fas fa-undo mr-2"></i> Retornar
                    </button>` : ''}
                </div>
            `;
        }).join('');

        list.innerHTML = html;

    } catch (e) {
        console.error("Erro histórico:", e);
        if (e.code === 'failed-precondition') {
            list.innerHTML = `<p class="text-center col-span-full text-yellow-400 py-10">
                O sistema está criando um novo índice para esta busca.<br>
                Tente novamente em alguns minutos.
            </p>`;
        } else {
            list.innerHTML = `<p class="text-center col-span-full text-red-400 py-10">Erro ao carregar: ${e.message}</p>`;
        }
    }
};

window.printKdsOrder = (orderId) => {
    const order = currentOrdersData.find(o => o.id === orderId);
    if (!order) return;

    let itemsHtml = '';
    if (order.sectors) {
        Object.entries(order.sectors).forEach(([sector, items]) => {
            itemsHtml += `<div style="margin-top: 15px; border-bottom: 1px solid #000; font-weight: bold; font-size: 1.1em;">${sector.toUpperCase()}</div>`;
            items.forEach(item => {
                itemsHtml += `
                    <div style="margin-top: 8px;">
                        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 1.2em;">
                            <span>1x ${item.name}</span>
                        </div>
                        ${item.note ? `<div style="font-size: 0.9em; font-style: italic; margin-top: 2px;">** OBS: ${item.note} **</div>` : ''}
                    </div>
                `;
            });
        });
    }

    const printWindow = window.open('', '', 'width=400,height=600');
    if (printWindow) {
        printWindow.document.write(`
            <html>
            <head>
                <title>Cupom Cozinha - Mesa ${order.tableNumber}</title>
                <style>
                    body { font-family: 'Courier New', Courier, monospace; padding: 10px; margin: 0; color: #000; max-width: 300px; }
                    h1, h2, p { text-align: center; margin: 5px 0; }
                    .header { border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
                    .footer { margin-top: 20px; border-top: 2px dashed #000; padding-top: 10px; text-align: center; font-size: 0.8em; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>MESA ${order.tableNumber}</h1>
                    <p>Pedido #${order.orderId.slice(-4)}</p>
                    <p>${new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</p>
                </div>
                <div class="items">${itemsHtml}</div>
                <div class="footer">Fator PDV - Staff</div>
                <script>
                    window.onload = function() { 
                        window.print(); 
                        setTimeout(function() { window.close(); }, 500); 
                    }
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    } else {
        alert("Habilite os pop-ups para imprimir.");
    }
};

window.rejectKdsOrder = async (orderId) => {
    const reason = prompt("Motivo da rejeição:");
    if (reason === null) return; 

    try {
        const orderRef = doc(db, 'artifacts', appId, 'public', 'data', 'kds_orders', orderId);
        await updateDoc(orderRef, { 
            status: 'cancelled',
            cancellationReason: reason || 'Sem motivo',
            cancelledAt: serverTimestamp()
        });
        showToast("Pedido rejeitado.", true);
    } catch (e) {
        console.error("Erro ao rejeitar:", e);
        showToast("Erro ao rejeitar.", true);
    }
};

window.advanceKdsStatus = async (orderId, newStatus) => {
    try {
        const orderRef = doc(db, 'artifacts', appId, 'public', 'data', 'kds_orders', orderId);
        // ALTERAÇÃO: Não deleta mais, apenas muda status para permitir histórico
        await updateDoc(orderRef, { 
            status: newStatus,
            completedAt: serverTimestamp()
        });
        
        if (newStatus === 'finished') showToast("Pedido pronto!", false);
        
    } catch (e) {
        console.error("Erro ao atualizar:", e);
        showToast("Erro ao atualizar.", true);
    }
};