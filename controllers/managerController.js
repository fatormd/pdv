// --- CONTROLLERS/MANAGERCONTROLLER.JS ---
// VERSÃO FINAL COMPLETA E UNIFICADA

import { 
    db, appId, 
    getVouchersCollectionRef, 
    getQuickObsCollectionRef, 
    getTablesCollectionRef, 
    getCustomersCollectionRef, 
    getSectorsCollectionRef, 
    getSystemStatusDocRef, 
    getFinancialGoalsDocRef 
} from "/services/firebaseService.js";

import { 
    collection, query, where, getDocs, orderBy, Timestamp, 
    doc, setDoc, deleteDoc, updateDoc, serverTimestamp, getDoc, limit
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { formatCurrency } from "/utils.js";
import { openUserManagementModal } from "/controllers/userManagementController.js";
import { 
    syncWithWooCommerce, getProducts, getCategories, 
    createWooProduct, updateWooProduct, deleteWooProduct, fetchWooCommerceProducts 
} from "/services/wooCommerceService.js";

// --- VARIÁVEIS DE ESTADO ---
let managerModal; 
let managerAuthCallback;
let voucherManagementModal, voucherListContainer, voucherForm;
let reportDateInput;
let managerControllerInitialized = false;

// --- INICIALIZAÇÃO ---
export const initManagerController = () => {
    if (managerControllerInitialized) return;
    console.log("[ManagerController] Inicializando...");
    
    managerModal = document.getElementById('managerModal');
    if (managerModal) {
        managerModal.addEventListener('click', (e) => {
             if (e.target === managerModal) managerModal.style.display = 'none';
        });
    }

    // Configuração de Vouchers
    voucherManagementModal = document.getElementById('voucherManagementModal'); 
    voucherListContainer = document.getElementById('voucherListContainer');     
    voucherForm = document.getElementById('voucherForm');                       
    document.getElementById('showVoucherFormBtn')?.addEventListener('click', () => { 
        if(voucherForm) { voucherForm.style.display = 'block'; voucherForm.reset(); }
    });
    if (voucherForm) voucherForm.addEventListener('submit', handleSaveVoucher);

    // Configuração de Relatórios
    reportDateInput = document.getElementById('reportDateInput');
    if (reportDateInput) {
        reportDateInput.valueAsDate = new Date(); 
        reportDateInput.addEventListener('change', loadReports);
    }
    document.getElementById('refreshReportBtn')?.addEventListener('click', loadReports);

    // Listeners das Abas de Relatório
    const tabBtns = document.querySelectorAll('.report-tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => { 
                b.classList.remove('bg-indigo-600', 'text-white'); 
                b.classList.add('bg-dark-input', 'text-gray-300'); 
            });
            btn.classList.remove('bg-dark-input', 'text-gray-300'); 
            btn.classList.add('bg-indigo-600', 'text-white');
            
            document.querySelectorAll('.report-content').forEach(c => c.classList.add('hidden'));
            const targetContent = document.getElementById(`tab-${btn.dataset.tab}`);
            if(targetContent) targetContent.classList.remove('hidden');
            
            // Recarrega dados específicos se for a aba de vendas
            if (btn.dataset.tab === 'sales') {
                fetchMonthlyPerformance(); 
            }
            loadReports();
        });
    });

    managerControllerInitialized = true;
};

// --- ROTEADOR DE AÇÕES GERENCIAIS ---
export const handleGerencialAction = (action, payload) => {
    console.log(`[Manager] Ação: ${action}`);
    if (managerModal) managerModal.style.display = 'none';

    switch (action) {
        case 'openWaiterReg': openUserManagementModal(); break;
        
        case 'openQuickObsManagement': renderQuickObsManagementModal(); break;
        case 'openVoucherManagement': openVoucherManagementModal(); break;
        case 'openSectorManagement': renderSectorManagementModal(); break;
        
        case 'openWooSync': syncWithWooCommerce(); break;
        case 'openProductManagement': renderProductManagementModal(); break;
        
        case 'openCashManagementReport': openReportPanel('active-shifts'); break;
        case 'openHouse': handleOpenHouse(); break;
        case 'closeDay': handleCloseDay(); break;

        case 'openCustomerCRM': renderCustomerCrmModal(); break;

        case 'openInventoryManagement': alert("Módulo de Estoque em desenvolvimento."); break;
        case 'openRecipesManagement': alert("Módulo de Ficha Técnica em desenvolvimento."); break;

        default: console.warn(`Ação não mapeada: ${action}`);
    }
};

// =================================================================
//              1. GESTÃO DE CAIXA E RELATÓRIOS
// =================================================================

const openReportPanel = (tabName = 'active-shifts') => {
    const modal = document.getElementById('reportsModal');
    if(modal) {
        modal.style.display = 'flex';
        const btn = document.querySelector(`.report-tab-btn[data-tab="${tabName}"]`);
        if(btn) btn.click();
        else loadReports(); 
    }
};

const loadReports = async () => {
    if (!reportDateInput) return;
    
    const dateVal = reportDateInput.value;
    if(!dateVal) return;

    const startOfDay = Timestamp.fromDate(new Date(dateVal + 'T00:00:00'));
    const endOfDay = Timestamp.fromDate(new Date(dateVal + 'T23:59:59'));

    const dateEl = document.getElementById('salesTodayDate');
    if (dateEl) dateEl.textContent = new Date(dateVal).toLocaleDateString('pt-BR');

    try {
        await Promise.all([
            fetchActiveShifts(),
            fetchClosedShifts(startOfDay, endOfDay),
            fetchDailySales(startOfDay, endOfDay) 
        ]);
    } catch (e) { 
        console.error("Erro ao carregar dados do painel de caixa:", e); 
    }
};

// --- ABA 1: Turnos Abertos ---
const fetchActiveShifts = async () => {
    const container = document.getElementById('activeShiftsContainer');
    if (!container) return;
    
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), where('status', '==', 'open'));
    
    try {
        const snap = await getDocs(q);
        if (snap.empty) {
            container.innerHTML = '<p class="text-gray-500 col-span-full text-center py-8 italic">Nenhum caixa aberto no momento.</p>';
            return;
        }
        container.innerHTML = snap.docs.map(doc => {
            const s = doc.data();
            const openTime = s.openedAt?.toDate ? s.openedAt.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--';
            return `
                <div class="bg-gray-800 border border-green-500/50 rounded-xl p-5 shadow-lg relative flex flex-col">
                    <div class="absolute top-3 right-3">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-900 text-green-300 border border-green-700 animate-pulse"><span class="w-2 h-2 bg-green-400 rounded-full mr-1.5"></span> Ativo</span>
                    </div>
                    <div class="flex items-center mb-4">
                        <div class="h-12 w-12 rounded-full bg-gray-700 flex items-center justify-center text-2xl mr-4 border border-gray-600"><i class="fas fa-user-circle text-green-400"></i></div>
                        <div><h5 class="text-white font-bold text-lg leading-tight">${s.userName || 'Operador'}</h5><p class="text-xs text-gray-400 mt-1">Aberto às ${openTime}</p></div>
                    </div>
                    <div class="bg-gray-900/50 rounded-lg p-3 mb-4 border border-gray-700">
                        <div class="flex justify-between text-sm mb-1"><span class="text-gray-400">Fundo Inicial:</span><span class="text-white font-mono font-bold">${formatCurrency(s.initialBalance || 0)}</span></div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) { console.error(e); container.innerHTML = '<p class="text-red-400 col-span-full text-center">Erro ao carregar caixas.</p>'; }
};

// --- ABA 2: Turnos Fechados (Histórico) ---
const fetchClosedShifts = async (start, end) => {
    const container = document.getElementById('closedShiftsContainer');
    if (!container) return;

    const q = query(
        collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), 
        where('status', '==', 'closed'),
        where('openedAt', '>=', start), 
        where('openedAt', '<', end), 
        orderBy('openedAt', 'desc')
    );
    
    try {
        const snap = await getDocs(q);
        if (snap.empty) {
            container.innerHTML = '<p class="text-gray-500 text-center py-8 italic">Nenhum caixa fechado nesta data.</p>';
            return;
        }

        container.innerHTML = snap.docs.map(doc => {
            const s = doc.data();
            const diff = s.difference || 0;
            const diffColor = diff < -0.5 ? 'text-red-400' : (diff > 0.5 ? 'text-blue-400' : 'text-green-500');
            const openTime = s.openedAt?.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            const closeTime = s.closedAt?.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});

            return `
                <div class="bg-gray-800 p-4 rounded-lg border border-gray-700 flex flex-col md:flex-row justify-between items-center gap-4 hover:bg-gray-750 transition">
                    <div class="flex items-center w-full md:w-1/3">
                        <div class="mr-4 text-gray-500 bg-gray-900 h-10 w-10 flex items-center justify-center rounded-full"><i class="fas fa-history"></i></div>
                        <div>
                            <h4 class="text-white font-bold text-base">${s.userName}</h4>
                            <p class="text-xs text-gray-400"><i class="far fa-clock mr-1"></i> ${openTime} - ${closeTime}</p>
                        </div>
                    </div>
                    <div class="flex space-x-2 w-full md:w-2/3 justify-between md:justify-end items-center bg-gray-900/30 p-2 rounded-lg md:bg-transparent md:p-0">
                        <div class="text-right px-2 md:px-4 border-r border-gray-700">
                            <p class="text-[10px] text-gray-500 uppercase tracking-wider">Vendas</p>
                            <p class="text-white font-bold text-sm">${formatCurrency(s.reportSalesMoney + s.reportSalesDigital)}</p>
                        </div>
                        <div class="text-right px-2 md:px-4 border-r border-gray-700">
                            <p class="text-[10px] text-gray-500 uppercase tracking-wider">Quebra</p>
                            <p class="${diffColor} font-bold text-sm">${formatCurrency(diff)}</p>
                        </div>
                        <button onclick="window.openShiftDetails('${doc.id}')" class="ml-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold flex items-center">
                            <i class="fas fa-list mr-1"></i> Ver Vendas
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) { console.error(e); container.innerHTML = '<p class="text-red-400 text-center">Erro ao carregar histórico.</p>'; }
};

// --- MODAL: Detalhes do Turno (Auditoria) ---
window.openShiftDetails = async (shiftId) => {
    const modal = document.getElementById('shiftDetailsModal');
    const tableBody = document.getElementById('shiftSalesTableBody');
    const header = document.getElementById('shiftDetailsHeader');
    
    if (!modal || !tableBody) return;
    
    modal.style.display = 'flex';
    tableBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500 italic">Carregando vendas do turno...</td></tr>';
    header.textContent = "Carregando...";

    try {
        const shiftRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), shiftId);
        const shiftSnap = await getDoc(shiftRef);
        
        if (!shiftSnap.exists()) throw new Error("Turno não encontrado.");
        const shift = shiftSnap.data();
        
        header.textContent = `${shift.userName} | ${shift.openedAt.toDate().toLocaleString()} - ${shift.closedAt.toDate().toLocaleTimeString()}`;

        const tablesQ = query(
            getTablesCollectionRef(), 
            where('status', '==', 'closed'), 
            where('closedAt', '>=', shift.openedAt), 
            where('closedAt', '<=', shift.closedAt), 
            orderBy('closedAt', 'desc')
        );
        
        const snapshot = await getDocs(tablesQ);
        
        if (snapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500 italic">Nenhuma venda registrada neste período.</td></tr>';
            return;
        }

        tableBody.innerHTML = snapshot.docs.map(docSnap => {
            const table = docSnap.data(); 
            let tableTotal = 0;
            (table.payments || []).forEach(p => {
                const val = parseFloat(p.value.toString().replace(/[^\d,.-]/g,'').replace(',','.'));
                if (!isNaN(val)) tableTotal += val; 
            });
            
            return `
                <tr class="hover:bg-gray-700 transition border-b border-gray-800 cursor-pointer" onclick="window.showOrderDetails('${docSnap.id}')">
                    <td class="p-3 text-gray-300">${table.closedAt ? table.closedAt.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--'}</td>
                    <td class="p-3 font-bold text-white">Mesa ${table.tableNumber}</td>
                    <td class="p-3 text-gray-400 text-sm">${table.waiterId || table.closedBy || 'Staff'}</td>
                    <td class="p-3 text-right text-green-400 font-bold">${formatCurrency(tableTotal)}</td>
                </tr>`;
        }).join('');

    } catch (e) {
        console.error(e);
        tableBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-400">Erro: ${e.message}</td></tr>`;
    }
};

// --- DETALHES DO PEDIDO ---
window.showOrderDetails = async (docId) => {
    let modal = document.getElementById('orderDetailsModal');
    if (!modal) {
        const modalHtml = `
            <div id="orderDetailsModal" class="fixed inset-0 bg-gray-900 bg-opacity-95 flex items-center justify-center z-[60] hidden p-4 print-hide">
                <div class="bg-dark-card border border-dark-border p-6 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                    <div class="flex justify-between items-center mb-4 border-b border-gray-700 pb-4">
                        <h3 class="text-2xl font-bold text-green-400">Detalhes do Pedido</h3>
                        <button onclick="document.getElementById('orderDetailsModal').style.display='none'" class="text-gray-400 hover:text-white text-2xl">&times;</button>
                    </div>
                    <div id="orderDetailsContent" class="flex-grow overflow-y-auto custom-scrollbar space-y-4">
                        <p class="text-center text-gray-500 italic">Carregando...</p>
                    </div>
                    <div class="pt-4 border-t border-gray-700 flex justify-end">
                        <button onclick="document.getElementById('orderDetailsModal').style.display='none'" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg">Fechar</button>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('orderDetailsModal');
    }

    modal.style.display = 'flex';
    const contentDiv = document.getElementById('orderDetailsContent');
    contentDiv.innerHTML = '<div class="flex justify-center p-10"><i class="fas fa-spinner fa-spin text-3xl text-pumpkin"></i></div>';

    try {
        const docRef = doc(getTablesCollectionRef(), docId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            contentDiv.innerHTML = '<p class="text-red-400 text-center">Pedido não encontrado.</p>';
            return;
        }

        const order = docSnap.data();
        const items = order.sentItems || [];
        const payments = order.payments || [];
        const openTime = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString('pt-BR') : 'N/A';
        const closeTime = order.closedAt?.toDate ? order.closedAt.toDate().toLocaleString('pt-BR') : 'N/A';

        const groupedItems = items.reduce((acc, item) => {
            const key = item.id + (item.note || '');
            if (!acc[key]) acc[key] = { ...item, qty: 0, total: 0 };
            acc[key].qty++;
            acc[key].total += (item.price || 0);
            return acc;
        }, {});

        const itemsHtml = Object.values(groupedItems).map(item => `
            <div class="flex justify-between items-start border-b border-gray-700 pb-2 last:border-0">
                <div>
                    <span class="text-white font-semibold">${item.qty}x ${item.name}</span>
                    ${item.note ? `<p class="text-xs text-yellow-400 italic">${item.note}</p>` : ''}
                </div>
                <span class="text-gray-300">${formatCurrency(item.total)}</span>
            </div>
        `).join('');

        const paymentsHtml = payments.map(p => `
            <div class="flex justify-between text-sm">
                <span class="text-gray-400">${p.method}</span>
                <span class="text-green-400 font-mono">${p.value}</span>
            </div>
        `).join('');

        contentDiv.innerHTML = `
            <div class="grid grid-cols-2 gap-4 text-sm text-gray-400 mb-4">
                <div>
                    <p><span class="font-bold text-gray-300">Mesa:</span> ${order.tableNumber}</p>
                    <p><span class="font-bold text-gray-300">Operador:</span> ${order.waiterId || order.closedBy || 'N/A'}</p>
                </div>
                <div class="text-right">
                    <p><span class="font-bold text-gray-300">Abertura:</span> ${openTime}</p>
                    <p><span class="font-bold text-gray-300">Fechamento:</span> ${closeTime}</p>
                </div>
            </div>

            <div class="bg-dark-input p-4 rounded-lg">
                <h4 class="text-pumpkin font-bold mb-2 border-b border-gray-600 pb-1">Itens Consumidos</h4>
                <div class="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                    ${items.length ? itemsHtml : '<p class="italic text-gray-500">Sem itens registrados.</p>'}
                </div>
            </div>

            <div class="bg-dark-input p-4 rounded-lg">
                <h4 class="text-green-400 font-bold mb-2 border-b border-gray-600 pb-1">Pagamentos</h4>
                <div class="space-y-1">
                    ${payments.length ? paymentsHtml : '<p class="italic text-gray-500">Sem pagamentos.</p>'}
                </div>
                <div class="flex justify-between items-center mt-3 pt-2 border-t border-gray-600">
                    <span class="text-white font-bold text-lg">Total Final</span>
                    <span class="text-green-400 font-bold text-xl">${formatCurrency(order.finalTotal || order.total || 0)}</span>
                </div>
            </div>
        `;

    } catch (e) {
        console.error("Erro ao carregar detalhes:", e);
        contentDiv.innerHTML = `<p class="text-red-400 text-center">Erro ao carregar dados: ${e.message}</p>`;
    }
};

// --- ABA 3: Dashboard de Vendas do Dia (Top 10, Pico, Equipe) ---
const fetchDailySales = async (start, end) => {
    const q = query(
        collection(db, 'artifacts', appId, 'public', 'data', 'tables'), 
        where('status', '==', 'closed'), 
        where('closedAt', '>=', start), 
        where('closedAt', '<', end)
    );
    
    const snapshot = await getDocs(q);
    
    let totalSales = 0, totalMoney = 0, totalDigital = 0, count = 0;
    const productStats = {};
    const salesByHour = {};
    const salesByWaiter = {};

    snapshot.forEach(docSnap => {
        const table = docSnap.data(); 
        let tableTotal = 0;
        count++;
        
        (table.payments || []).forEach(p => {
            const val = parseFloat(p.value.toString().replace(/[^\d,.-]/g,'').replace(',','.'));
            if (!isNaN(val)) { 
                tableTotal += val; 
                if (p.method.toLowerCase().includes('dinheiro')) totalMoney += val; 
                else totalDigital += val; 
            }
        });
        totalSales += tableTotal; 

        // Top 10 (Agrupa por ID para precisão)
        if (table.sentItems) {
            table.sentItems.forEach(item => {
                const id = item.id;
                if (!productStats[id]) {
                    productStats[id] = { name: item.name, qty: 0 };
                }
                productStats[id].qty += 1;
            });
        }

        // Horário de Pico
        if (table.closedAt) {
            const hour = table.closedAt.toDate().getHours();
            const hourKey = `${hour}h - ${hour+1}h`;
            salesByHour[hourKey] = (salesByHour[hourKey] || 0) + 1; 
        }

        // Desempenho Equipe
        const waiter = table.waiterId || table.closedBy || 'Não Identificado';
        salesByWaiter[waiter] = (salesByWaiter[waiter] || 0) + tableTotal;
    });

    const ticketMedio = count > 0 ? totalSales / count : 0;

    document.getElementById('reportTotalSales').textContent = formatCurrency(totalSales);
    document.getElementById('reportTotalMoney').textContent = formatCurrency(totalMoney);
    document.getElementById('reportTotalDigital').textContent = formatCurrency(totalDigital);
    document.getElementById('reportTicketMedio').textContent = formatCurrency(ticketMedio);

    // Render Top 10 & Save to Storage
    const topProducts = Object.values(productStats)
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 10);
    
    // Salva lista de IDs do Top 10 para usar no Cardápio
    const top10Ids = Object.keys(productStats)
        .sort((a, b) => productStats[b].qty - productStats[a].qty)
        .slice(0, 10);
    localStorage.setItem('top10_products', JSON.stringify(top10Ids));

    const topListEl = document.getElementById('topProductsList');
    if(topListEl) {
        if(topProducts.length === 0) topListEl.innerHTML = '<p class="text-xs text-gray-500 italic">Sem dados.</p>';
        else {
            topListEl.innerHTML = topProducts.map((p, index) => `
                <div class="flex justify-between items-center text-sm border-b border-gray-700 pb-1 last:border-0">
                    <span class="text-gray-300"><b class="text-pumpkin mr-2">#${index+1}</b> ${p.name}</span>
                    <span class="font-mono text-white font-bold">${p.qty}</span>
                </div>
            `).join('');
        }
    }

    // Render Horário de Pico
    let peakHour = '--:--';
    let peakCount = 0;
    Object.entries(salesByHour).forEach(([hour, count]) => {
        if(count > peakCount) {
            peakCount = count;
            peakHour = hour;
        }
    });
    const peakHourEl = document.getElementById('peakHourDisplay');
    const peakVolEl = document.getElementById('peakHourVolume');
    if(peakHourEl) peakHourEl.textContent = peakHour;
    if(peakVolEl) peakVolEl.textContent = `${peakCount} pedidos`;

    // Render Desempenho Equipe
    const teamListEl = document.getElementById('teamPerformanceList');
    if (teamListEl) {
        const sortedTeam = Object.entries(salesByWaiter).sort(([,a], [,b]) => b - a);
        if (sortedTeam.length === 0) teamListEl.innerHTML = '<p class="text-xs text-gray-500 italic">Sem vendas.</p>';
        else {
            teamListEl.innerHTML = sortedTeam.map(([name, total], index) => `
                <div class="flex justify-between items-center text-sm border-b border-gray-700 pb-1 last:border-0">
                    <span class="text-gray-300 truncate"><b class="text-blue-400 mr-2">${index+1}.</b> ${name}</span>
                    <span class="font-mono text-white font-bold text-xs">${formatCurrency(total)}</span>
                </div>
            `).join('');
        }
    }
};

// --- Desempenho Mensal ---
const fetchMonthlyPerformance = async () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    
    try {
        const goalSnap = await getDoc(getFinancialGoalsDocRef());
        const meta = goalSnap.exists() ? (goalSnap.data().monthlyGoal || 0) : 0;

        const q = query(
            collection(db, 'artifacts', appId, 'public', 'data', 'tables'), 
            where('status', '==', 'closed'), 
            where('closedAt', '>=', Timestamp.fromDate(startOfMonth)), 
            where('closedAt', '<=', Timestamp.fromDate(endOfMonth))
        );
        
        const snapshot = await getDocs(q);
        let totalMonth = 0;
        snapshot.forEach(doc => {
            (doc.data().payments || []).forEach(p => {
                const v = parseFloat(p.value.toString().replace(/[^\d,.-]/g,'').replace(',','.'));
                if (!isNaN(v)) totalMonth += v;
            });
        });

        const percent = meta > 0 ? Math.min(100, (totalMonth / meta) * 100) : 0;
        const missing = Math.max(0, meta - totalMonth);
        const dayOfMonth = now.getDate();
        const daysInMonth = endOfMonth.getDate();
        const projection = dayOfMonth > 0 ? (totalMonth / dayOfMonth) * daysInMonth : 0;

        document.getElementById('monthSoldDisplay').textContent = formatCurrency(totalMonth);
        document.getElementById('monthGoalDisplay').textContent = formatCurrency(meta);
        document.getElementById('monthMissing').textContent = formatCurrency(missing);
        document.getElementById('monthProjection').textContent = formatCurrency(projection);
        
        const progressBar = document.getElementById('monthProgressBar');
        const progressText = document.getElementById('monthProgressPercent');
        
        progressBar.style.width = `${percent}%`;
        progressText.textContent = `${percent.toFixed(1)}%`;
        
        progressBar.className = `h-6 rounded-full transition-all duration-1000 ease-out flex items-center justify-end pr-2 ${
            percent < 30 ? 'bg-red-600' : (percent < 70 ? 'bg-yellow-500' : 'bg-gradient-to-r from-blue-600 to-green-500')
        }`;

    } catch (e) {
        console.error("Erro ao carregar mensal:", e);
    }
};

window.setMonthlyGoal = async () => {
    const currentVal = document.getElementById('monthGoalDisplay').textContent.replace(/[^\d,]/g,'');
    const newVal = prompt("Defina a Meta de Vendas para este mês (R$):", currentVal);
    
    if (newVal) {
        const numVal = parseFloat(newVal.replace('.','').replace(',','.'));
        if (!isNaN(numVal)) {
            try {
                await setDoc(getFinancialGoalsDocRef(), { monthlyGoal: numVal }, { merge: true });
                fetchMonthlyPerformance(); 
            } catch(e) { alert("Erro ao salvar meta."); }
        }
    }
};

// --- Comparativo de Datas ---
window.runDateComparison = async () => {
    const dateA = document.getElementById('compDateA').value;
    const dateB = document.getElementById('compDateB').value;
    
    if (!dateA || !dateB) { alert("Selecione as duas datas."); return; }

    const resultContainer = document.getElementById('comparisonResult');
    const valAEl = document.getElementById('compValueA');
    const valBEl = document.getElementById('compValueB');
    const diffEl = document.getElementById('compDiffValue');
    const labelA = document.getElementById('compLabelA');
    const labelB = document.getElementById('compLabelB');

    try {
        const getDayTotal = async (dateStr) => {
            const start = Timestamp.fromDate(new Date(dateStr + 'T00:00:00'));
            const end = Timestamp.fromDate(new Date(dateStr + 'T23:59:59'));
            const q = query(
                collection(db, 'artifacts', appId, 'public', 'data', 'tables'), 
                where('status', '==', 'closed'), 
                where('closedAt', '>=', start), 
                where('closedAt', '<=', end)
            );
            const snap = await getDocs(q);
            let total = 0;
            snap.forEach(d => {
                 (d.data().payments || []).forEach(p => {
                    const v = parseFloat(p.value.toString().replace(/[^\d,.-]/g,'').replace(',','.'));
                    if(!isNaN(v)) total += v;
                 });
            });
            return total;
        };

        const [totalA, totalB] = await Promise.all([getDayTotal(dateA), getDayTotal(dateB)]);

        valAEl.textContent = formatCurrency(totalA);
        valBEl.textContent = formatCurrency(totalB);
        labelA.textContent = new Date(dateA).toLocaleDateString('pt-BR');
        labelB.textContent = new Date(dateB).toLocaleDateString('pt-BR');

        let diffPercent = 0;
        if (totalA > 0) {
            diffPercent = ((totalB - totalA) / totalA) * 100;
        } else if (totalB > 0) {
            diffPercent = 100; 
        }

        const sign = diffPercent > 0 ? '+' : '';
        const colorClass = diffPercent >= 0 ? 'text-green-400' : 'text-red-400';
        
        diffEl.textContent = `${sign}${diffPercent.toFixed(1)}%`;
        diffEl.className = `text-xl font-extrabold ${colorClass}`;

        resultContainer.classList.remove('hidden');

    } catch (e) {
        console.error("Erro comparativo:", e);
        alert("Erro ao comparar datas.");
    }
};

// =================================================================
//              2. ABERTURA/FECHAMENTO DE TURNO
// =================================================================
const handleOpenHouse = async () => {
    if (!confirm("CONFIRMAR ABERTURA DE TURNO?\n\nIsso definirá o início do novo ciclo de produção (KDS).")) return;
    try {
        const statusRef = getSystemStatusDocRef();
        await setDoc(statusRef, {
            startAt: serverTimestamp(),
            openedAt: new Date().toISOString(),
            status: 'open'
        }, { merge: true });
        alert("Turno Aberto! A produção foi iniciada.");
        loadReports();
    } catch (e) {
        console.error("Erro ao abrir casa:", e);
        alert("Erro ao registrar abertura: " + e.message);
    }
};

const handleCloseDay = async () => {
    if (!confirm("ATENÇÃO: Tem certeza que deseja ENCERRAR O TURNO?")) return;
    try {
        const todayStr = new Date().toISOString().split('T')[0]; 
        const reportId = `daily_${todayStr}`;
        const reportRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'daily_reports'), reportId);
        
        await setDoc(reportRef, { 
            date: todayStr, 
            closedAt: serverTimestamp() 
        });
        
        alert(`Turno encerrado com sucesso!`);
        loadReports(); 
    } catch (e) { 
        console.error(e); 
        alert("Erro crítico ao encerrar: " + e.message); 
    }
};

// =================================================================
//              3. GESTÃO DE SETORES
// =================================================================
const renderSectorManagementModal = async () => {
    if (!managerModal) return;
    managerModal.innerHTML = `<div class="bg-dark-card border border-dark-border p-6 rounded-xl shadow-2xl w-full max-w-lg h-[80vh] flex flex-col"><div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold text-pumpkin">Gerenciar Setores</h3><button onclick="document.getElementById('managerModal').style.display='none'" class="text-gray-400 hover:text-white text-2xl">&times;</button></div><div class="flex space-x-2 mb-4 border-b border-gray-700 pb-2"><button class="sector-tab-btn flex-1 py-2 rounded-t-lg font-bold text-sm bg-indigo-600 text-white" data-type="service">Atendimento</button><button class="sector-tab-btn flex-1 py-2 rounded-t-lg font-bold text-sm bg-gray-700 text-gray-400 hover:text-white" data-type="production">Produção</button></div><form id="addSectorForm" class="flex space-x-2 mb-4"><input type="text" id="newSectorName" placeholder="Nome do Setor" class="input-pdv w-full" required><button type="submit" class="bg-green-600 hover:bg-green-700 text-white px-4 rounded-lg font-bold"><i class="fas fa-plus"></i></button></form><div id="sectorListContainer" class="flex-grow overflow-y-auto custom-scrollbar space-y-2"><p class="text-center text-gray-500 italic mt-4">Carregando...</p></div></div>`;
    managerModal.style.display = 'flex';
    
    let currentType = 'service';
    const loadSectors = async () => {
        const container = document.getElementById('sectorListContainer');
        try {
            const q = query(getSectorsCollectionRef(), where('type', '==', currentType), orderBy('name'));
            const snap = await getDocs(q);
            if (snap.empty) { container.innerHTML = '<p class="text-center text-gray-500 italic">Nenhum setor cadastrado.</p>'; return; }
            container.innerHTML = snap.docs.map(doc => `<div class="flex justify-between items-center bg-dark-input p-3 rounded border border-gray-700"><span class="text-white font-medium">${doc.data().name}</span><button onclick="window.deleteSector('${doc.id}')" class="text-red-400 hover:text-red-300 transition p-1"><i class="fas fa-trash"></i></button></div>`).join('');
        } catch (e) { container.innerHTML = '<p class="text-red-400 text-center">Erro.</p>'; }
    };
    document.querySelectorAll('.sector-tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.sector-tab-btn').forEach(b => { b.classList.remove('bg-indigo-600', 'text-white'); b.classList.add('bg-gray-700', 'text-gray-400'); });
            btn.classList.remove('bg-gray-700', 'text-gray-400'); btn.classList.add('bg-indigo-600', 'text-white');
            currentType = btn.dataset.type; loadSectors();
        };
    });
    document.getElementById('addSectorForm').onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('newSectorName').value.trim();
        if (!name) return;
        try { await setDoc(doc(getSectorsCollectionRef(), `${currentType}_${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`), { name, type: currentType, createdAt: serverTimestamp() }); document.getElementById('newSectorName').value = ''; loadSectors(); } catch (e) { alert(e.message); }
    };
    window.deleteSector = async (id) => { if(confirm("Remover?")) { await deleteDoc(doc(getSectorsCollectionRef(), id)); loadSectors(); } };
    loadSectors();
};

// =================================================================
//              4. GESTÃO DE PRODUTOS (WOOCOMMERCE)
// =================================================================
const renderProductManagementModal = async () => {
    const modalId = 'productManagementModal';
    let modal = document.getElementById(modalId);
    if (!modal) { /* create if missing */ } 
    
    modal.innerHTML = `<div class="bg-dark-card border border-dark-border p-6 rounded-xl shadow-2xl w-full max-w-3xl h-[85vh] flex flex-col"><div class="flex justify-between items-center mb-4 flex-shrink-0"><h3 class="text-xl font-bold text-indigo-400">Gestão de Produtos (WooCommerce)</h3><button onclick="document.getElementById('${modalId}').style.display='none'" class="text-gray-400 hover:text-white text-2xl">&times;</button></div><div id="prodListContainer" class="flex-grow overflow-y-auto custom-scrollbar mb-4"><div class="text-center text-gray-500 py-10"><i class="fas fa-spinner fa-spin"></i> Carregando...</div></div><div class="pt-2 border-t border-gray-700 flex-shrink-0"><button id="btnNewProduct" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition"><i class="fas fa-plus"></i> Novo Produto</button></div></div>`;
    
    modal.style.display = 'flex';
    await refreshProductList();
    document.getElementById('btnNewProduct').onclick = () => renderProductForm();
};

const refreshProductList = async () => {
    const container = document.getElementById('prodListContainer');
    if (!container) return;
    let products = getProducts();
    if (!products || products.length === 0) products = await fetchWooCommerceProducts();
    if (!products || products.length === 0) { container.innerHTML = '<p class="text-center text-gray-500 py-10">Nenhum produto.</p>'; return; }
    container.innerHTML = products.map(p => `
        <div class="flex justify-between items-center bg-dark-input p-3 rounded-lg mb-2 border border-gray-700">
            <div class="flex items-center space-x-3">
                <img src="${p.image || 'https://placehold.co/50'}" class="w-10 h-10 rounded object-cover bg-gray-800">
                <div><h4 class="font-bold text-dark-text">${p.name}</h4><p class="text-xs text-indigo-400">${formatCurrency(p.price)} <span class="text-gray-500 ml-2">(${p.status})</span></p></div>
            </div>
            <div class="flex space-x-2"><button class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm btn-edit-prod" data-id="${p.id}"><i class="fas fa-edit"></i></button><button class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm btn-del-prod" data-id="${p.id}"><i class="fas fa-trash"></i></button></div>
        </div>`).join('');
    document.querySelectorAll('.btn-edit-prod').forEach(btn => btn.onclick = () => { renderProductForm(products.find(p => p.id == btn.dataset.id)); });
    document.querySelectorAll('.btn-del-prod').forEach(btn => btn.onclick = () => handleDeleteProduct(btn.dataset.id));
};

const renderProductForm = (product = null) => {
    const container = document.getElementById('prodListContainer');
    const isEdit = !!product;
    const categories = getCategories().filter(c => c.id !== 'all');
    container.innerHTML = `
        <form id="productForm" class="space-y-4 p-2"><h4 class="text-lg font-bold text-white mb-4">${isEdit ? 'Editar' : 'Novo'}</h4>
            <div><label class="block text-sm text-gray-400 mb-1">Nome</label><input type="text" id="prodName" class="input-pdv w-full" value="${product?.name || ''}" required></div>
            <div class="grid grid-cols-2 gap-4"><div><label class="block text-sm text-gray-400 mb-1">Preço</label><input type="number" id="prodPrice" class="input-pdv w-full" step="0.01" value="${product?.price || ''}" required></div><div><label class="block text-sm text-gray-400 mb-1">Regular</label><input type="number" id="prodRegPrice" class="input-pdv w-full" step="0.01" value="${product?.regular_price || ''}"></div></div>
            <div><label class="block text-sm text-gray-400 mb-1">Categoria</label><select id="prodCat" class="input-pdv w-full">${categories.map(c => `<option value="${c.id}" ${product?.categoryId == c.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select></div>
            <div><label class="block text-sm text-gray-400 mb-1">Status</label><select id="prodStatus" class="input-pdv w-full"><option value="publish" ${product?.status === 'publish' ? 'selected' : ''}>Publicado</option><option value="draft" ${product?.status === 'draft' ? 'selected' : ''}>Rascunho</option></select></div>
            <div><label class="block text-sm text-gray-400 mb-1">Imagem URL</label><input type="text" id="prodImg" class="input-pdv w-full" value="${product?.image || ''}"></div>
            <div class="flex space-x-3 pt-4"><button type="button" class="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-3 rounded-lg" onclick="refreshProductList()">Cancelar</button><button type="submit" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-bold">Salvar</button></div>
        </form>`;
    document.getElementById('btnNewProduct').style.display = 'none';
    document.getElementById('productForm').onsubmit = async (e) => {
        e.preventDefault();
        const data = { name: document.getElementById('prodName').value, regular_price: document.getElementById('prodRegPrice').value, price: document.getElementById('prodPrice').value, categories: [{ id: parseInt(document.getElementById('prodCat').value) }], status: document.getElementById('prodStatus').value, images: [{ src: document.getElementById('prodImg').value }] };
        try { if(isEdit) await updateWooProduct(product.id, data); else await createWooProduct(data); alert("Salvo!"); document.getElementById('btnNewProduct').style.display = 'block'; refreshProductList(); } catch(e) { alert(e.message); }
    };
};

const handleDeleteProduct = async (id) => { if(confirm("Excluir?")) { try { await deleteWooProduct(id); refreshProductList(); } catch(e) { alert(e.message); } } };

// =================================================================
//              5. CRM & OBSERVAÇÕES
// =================================================================
const renderCustomerCrmModal = async () => {
    const modalId = 'crmModal';
    let modal = document.getElementById(modalId);
    if (!modal) { /* create */ }
    modal.innerHTML = `<div class="bg-dark-card border border-dark-border p-6 rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col"><div class="flex justify-between items-center mb-6 border-b border-gray-700 pb-4"><div><h3 class="text-2xl font-bold text-indigo-400">CRM</h3><p class="text-sm text-gray-400">Fidelidade</p></div><button onclick="document.getElementById('${modalId}').style.display='none'" class="text-gray-400 hover:text-white text-3xl">&times;</button></div><div class="mb-4 flex space-x-2"><input type="text" id="crmSearchInput" placeholder="Buscar..." class="input-pdv w-full"><button id="crmSearchBtn" class="bg-indigo-600 text-white px-4 rounded-lg"><i class="fas fa-search"></i></button></div><div class="flex-grow overflow-y-auto custom-scrollbar bg-dark-bg rounded-lg border border-gray-700"><table class="w-full text-left text-sm text-gray-400"><tbody id="crmListBody" class="divide-y divide-gray-700"><tr><td colspan="5" class="p-8 text-center">Carregando...</td></tr></tbody></table></div></div>`;
    modal.style.display = 'flex';
    const fetchAndRender = async (term='') => {
        const container = document.getElementById('crmListBody');
        const q = query(getCustomersCollectionRef(), orderBy('name'), limit(50));
        const snap = await getDocs(q);
        if(snap.empty) { container.innerHTML = '<tr><td class="p-8 text-center">Vazio.</td></tr>'; return; }
        const list = snap.docs.map(d=>({id:d.id, ...d.data()})).filter(c=> !term || c.name.toLowerCase().includes(term.toLowerCase()));
        container.innerHTML = list.map(c => `<tr class="hover:bg-gray-800"><td class="p-4 font-bold text-white">${c.name}<br><span class="text-gray-500 text-xs">${c.cpf}</span></td><td class="p-4 text-center"><span class="bg-indigo-900 text-indigo-200 py-1 px-3 rounded text-xs">${c.points||0} pts</span></td></tr>`).join('');
    };
    document.getElementById('crmSearchBtn').onclick = () => fetchAndRender(document.getElementById('crmSearchInput').value);
    fetchAndRender();
};

const renderQuickObsManagementModal = async () => { 
    if (!managerModal) return;
    managerModal.innerHTML = `<div class="bg-dark-card border border-dark-border p-6 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"><div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold text-indigo-400">Observações Rápidas</h3><button id="closeQuickObs" class="px-3 py-1 bg-gray-700 text-white rounded">&times;</button></div><form id="addQuickObsForm" class="flex space-x-2 mb-4"><input type="text" id="newQuickObsInput" class="input-pdv w-full" required><button type="submit" class="bg-green-600 text-white px-4 rounded"><i class="fas fa-plus"></i></button></form><div id="quickObsList" class="overflow-y-auto flex-grow space-y-2 pr-2 custom-scrollbar"></div></div>`;
    managerModal.style.display = 'flex'; 
    document.getElementById('closeQuickObs').onclick = () => managerModal.style.display = 'none';
    const loadObs = async () => {
        const container = document.getElementById('quickObsList');
        const snap = await getDocs(query(getQuickObsCollectionRef(), orderBy('text')));
        container.innerHTML = snap.docs.map(d => `<div class="flex justify-between items-center bg-dark-input p-3 rounded border border-gray-700"><span class="text-white">${d.data().text}</span><button onclick="window.deleteQuickObs('${d.id}')" class="text-red-400 hover:text-red-300"><i class="fas fa-trash"></i></button></div>`).join('');
    };
    document.getElementById('addQuickObsForm').onsubmit = async (e) => { e.preventDefault(); const val = document.getElementById('newQuickObsInput').value; if(val) { await setDoc(doc(getQuickObsCollectionRef(), val.toLowerCase().replace(/[^a-z0-9]/g, '')), { text: val }); loadObs(); } };
    window.deleteQuickObs = async (id) => { if(confirm("Excluir?")) { await deleteDoc(doc(getQuickObsCollectionRef(), id)); loadObs(); } };
    loadObs();
};

// VOUCHER HELPERS
const openVoucherManagementModal = async () => {
    if (!voucherManagementModal) return; 
    managerModal.style.display = 'none'; 
    voucherManagementModal.style.display = 'flex'; 
    await fetchVouchers();
};

const fetchVouchers = async () => { 
    if (!voucherListContainer) return; 
    voucherListContainer.innerHTML = '<p class="text-sm text-yellow-400 italic text-center py-4">Buscando vouchers...</p>';
    try {
        const q = query(getVouchersCollectionRef(), orderBy('points', 'asc'));
        const querySnapshot = await getDocs(q);
        const vouchers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (vouchers.length === 0) { voucherListContainer.innerHTML = '<p class="text-sm text-dark-placeholder italic text-center py-4">Nenhum voucher cadastrado.</p>'; } 
        else { voucherListContainer.innerHTML = vouchers.map(v => `<div class="flex justify-between items-center bg-dark-input p-3 rounded-lg mb-2 border border-gray-700"><div><h4 class="font-bold text-dark-text">${v.name}</h4><p class="text-sm text-indigo-400 font-mono">${v.points} pts = ${formatCurrency(v.value)}</p></div><button class="text-red-400 hover:text-red-500 p-2 rounded hover:bg-gray-700 transition" onclick="window.handleDeleteVoucher('${v.id}')"><i class="fas fa-trash"></i></button></div>`).join(''); }
    } catch (error) { console.error(error); voucherListContainer.innerHTML = '<p class="text-red-400 text-center">Erro ao carregar.</p>'; }
};

const handleSaveVoucher = async (e) => { 
    e.preventDefault(); 
    const id = document.getElementById('voucherIdInput').value || doc(getVouchersCollectionRef()).id;
    const name = document.getElementById('voucherNameInput').value; 
    const points = parseInt(document.getElementById('voucherPointsInput').value); 
    const value = parseFloat(document.getElementById('voucherValueInput').value); 
    const saveBtn = document.getElementById('saveVoucherBtn');
    saveBtn.disabled = true; 
    try { 
        await setDoc(doc(getVouchersCollectionRef(), id), { id, name, points, value, createdAt: serverTimestamp() }, { merge: true }); 
        voucherForm.style.display = 'none'; 
        await fetchVouchers(); 
    } catch (e) { alert("Erro: " + e.message); } 
    finally { saveBtn.disabled = false; }
};

window.handleDeleteVoucher = async (id) => { 
    if(confirm("Excluir voucher permanentemente?")) { 
        await deleteDoc(doc(getVouchersCollectionRef(), id)); 
        fetchVouchers(); 
    }
};