// --- CONTROLLERS/MANAGER/MODULES/SALESMANAGER.JS (VERSÃO FINAL COM IDs ÚNICOS) ---

import { 
    getCollectionRef, 
    getTablesCollectionRef, 
    getFinancialGoalsDocRef 
} from "/services/firebaseService.js"; 

import { 
    query, where, getDocs, orderBy, 
    doc, updateDoc, setDoc, serverTimestamp, getDoc, Timestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { formatCurrency } from "/utils.js";
import { showToast } from "/app.js"; 

let managerModal = null;

// ==================================================================
//           1. API PÚBLICA
// ==================================================================

export const init = () => {
    console.log("[SalesModule] Inicializado.");
    managerModal = document.getElementById('managerModal');
    
    // Expõe funções para o HTML
    window.loadReports = loadReports;
    window.switchReportTab = switchReportTab;
    window.handleForceCloseShift = handleForceCloseShift;
    window.handleCloseDay = handleCloseDay;
    window.exportSalesToCSV = exportSalesToCSV;
    window.setMonthlyGoal = setMonthlyGoal;
    window.runDateComparison = runDateComparison;
    window.openShiftDetails = openShiftDetails;
};

export const open = async () => {
    await renderSalesPanel();
};

// ==================================================================
//           2. INTERFACE PRINCIPAL (UI)
// ==================================================================

async function renderSalesPanel() {
    if (!managerModal) return;
    
    // NOTA: Todos os IDs agora têm o prefixo 'mgr_' para evitar conflito com o index.html antigo
    managerModal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 w-full max-w-6xl h-[90vh] flex flex-col rounded-xl shadow-2xl overflow-hidden animate-fade-in">
            <div class="flex flex-col p-6 border-b border-gray-700 bg-gray-800 rounded-t-xl gap-4 flex-shrink-0">
                <div class="flex justify-between items-start">
                    <div>
                        <h3 class="text-2xl font-bold text-green-400"><i class="fas fa-cash-register mr-2"></i>Vendas & Caixa</h3>
                        <p class="text-sm text-gray-400">Visão geral de turnos, caixas e vendas do dia.</p>
                    </div>
                    <button class="text-gray-400 hover:text-white text-3xl leading-none" onclick="document.getElementById('managerModal').style.display='none'">&times;</button>
                </div>
                <div class="flex items-center space-x-3">
                    <button onclick="window.handleCloseDay()" class="px-4 py-2 bg-red-900/50 border border-red-500 text-red-200 rounded-lg hover:bg-red-900 transition text-sm font-bold flex items-center shadow-sm ml-auto">
                        <i class="fas fa-file-invoice-dollar mr-2"></i> Encerrar Dia/Turno
                    </button>
                </div>
            </div>

            <div class="p-4 bg-dark-bg border-b border-gray-700 flex justify-between items-center flex-wrap gap-4 flex-shrink-0">
                <div class="flex space-x-2">
                    <button id="mgr_btn-active-shifts" class="report-tab-btn px-4 py-2 rounded-lg bg-indigo-600 text-white font-bold transition" onclick="window.switchReportTab('active-shifts')">Abertos (Atual)</button>
                    <button id="mgr_btn-closed-shifts" class="report-tab-btn px-4 py-2 rounded-lg bg-dark-input text-gray-300 hover:bg-gray-700 transition" onclick="window.switchReportTab('closed-shifts')">Fechados (Histórico)</button>
                    <button id="mgr_btn-sales" class="report-tab-btn px-4 py-2 rounded-lg bg-dark-input text-gray-300 hover:bg-gray-700 transition" onclick="window.switchReportTab('sales')">Totais do Dia</button>
                </div>
                <div class="flex items-center space-x-2">
                    <label class="text-gray-400 text-sm">Data Base:</label>
                    <input type="date" id="mgr_salesDateInput" class="input-pdv py-1 px-3 text-sm bg-dark-input border-gray-600 text-white rounded">
                    <button onclick="window.loadReports()" class="p-2 bg-pumpkin text-white rounded hover:bg-pumpkin-dark"><i class="fas fa-sync-alt"></i></button>
                </div>
            </div>

            <div class="flex-grow overflow-y-auto p-6 custom-scrollbar bg-dark-bg relative">
                <div id="mgr_tab-active-shifts" class="report-content block space-y-4">
                    <div id="mgr_activeShiftsContainer" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <p class="text-gray-500 col-span-full text-center py-10"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><br>Carregando caixas...</p>
                    </div>
                </div>
                <div id="mgr_tab-closed-shifts" class="report-content hidden space-y-4">
                    <div id="mgr_closedShiftsContainer" class="space-y-3"></div>
                </div>
                <div id="mgr_tab-sales" class="report-content hidden space-y-8"></div>
            </div>
        </div>`;
    
    managerModal.style.display = 'flex';
    managerModal.classList.remove('p-4'); 
    managerModal.classList.add('p-0', 'md:p-4');

    // Inicialização Segura da Data
    const dateInput = document.getElementById('mgr_salesDateInput');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
        dateInput.addEventListener('change', loadReports);
    }

    switchReportTab('active-shifts');
    await loadReports();
}

function switchReportTab(tab) {
    const tabs = ['active-shifts', 'closed-shifts', 'sales'];
    tabs.forEach(t => {
        const btn = document.getElementById(`mgr_btn-${t}`);
        const content = document.getElementById(`mgr_tab-${t}`);
        
        if (t === tab) {
            if(btn) { btn.classList.remove('bg-dark-input', 'text-gray-300'); btn.classList.add('bg-indigo-600', 'text-white'); }
            if(content) content.classList.remove('hidden');
        } else {
            if(btn) { btn.classList.add('bg-dark-input', 'text-gray-300'); btn.classList.remove('bg-indigo-600', 'text-white'); }
            if(content) content.classList.add('hidden');
        }
    });

    if(tab === 'sales') loadReports();
}

// ==================================================================
//           3. LÓGICA DE DADOS (IDs Atualizados)
// ==================================================================

async function loadReports() {
    console.log("[SalesManager] Iniciando loadReports...");

    // 1. Carrega Caixas Abertos (SEMPRE)
    await fetchActiveShifts();

    // 2. Verifica Data
    const dateInput = document.getElementById('mgr_salesDateInput');
    if(!dateInput || !dateInput.value) {
        console.warn("[SalesManager] Data inválida.");
        return;
    }
    
    const dateVal = dateInput.value;
    const startOfDay = Timestamp.fromDate(new Date(`${dateVal}T00:00:00`)); 
    const endOfDay = Timestamp.fromDate(new Date(`${dateVal}T23:59:59`));
    
    // Atualiza label da data (se existir no painel de vendas)
    const dateEl = document.getElementById('mgr_salesTodayDate'); 
    if (dateEl) {
        const [y, m, d] = dateVal.split('-');
        dateEl.textContent = `${d}/${m}/${y}`;
    }

    try { 
        await Promise.all([ 
            fetchClosedShifts(startOfDay, endOfDay), 
            fetchDailySales(startOfDay, endOfDay) 
        ]); 
    } catch (e) { 
        console.error("Erro loadReports:", e); 
        showToast("Erro ao atualizar histórico.", true);
    }
}

async function fetchActiveShifts() {
    const container = document.getElementById('mgr_activeShiftsContainer'); 
    if (!container) return;
    
    try {
        const q = query(getCollectionRef('shifts'), where('status', '==', 'open'));
        const snap = await getDocs(q); 
        
        if (snap.empty) { 
            container.innerHTML = '<p class="text-gray-500 col-span-full text-center py-8 italic">Nenhum caixa aberto no momento.</p>'; 
            return; 
        }
        
        container.innerHTML = snap.docs.map(doc => { 
            const s = doc.data(); 
            let openTime = '--:--';
            if (s.openedAt && typeof s.openedAt.toDate === 'function') {
                openTime = s.openedAt.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            }
            
            return `
                <div class="bg-gray-800 border border-green-500/50 rounded-xl p-5 shadow-lg relative flex flex-col animate-fade-in">
                    <div class="absolute top-3 right-3"><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-900 text-green-300 border border-green-700 animate-pulse">Ativo</span></div>
                    <div class="flex items-center mb-4">
                        <div class="h-12 w-12 rounded-full bg-gray-700 flex items-center justify-center text-2xl mr-4 border border-gray-600"><i class="fas fa-user-circle text-green-400"></i></div>
                        <div><h5 class="text-white font-bold text-lg leading-tight">${s.userName || 'Operador'}</h5><p class="text-xs text-gray-400 mt-1">Aberto às ${openTime}</p></div>
                    </div>
                    <div class="bg-gray-900/50 rounded-lg p-3 mb-4 border border-gray-700">
                        <div class="flex justify-between text-sm mb-1"><span class="text-gray-400">Fundo Inicial:</span><span class="text-white font-mono font-bold">${formatCurrency(s.initialBalance || 0)}</span></div>
                    </div>
                    <button onclick="window.handleForceCloseShift('${doc.id}')" class="w-full py-2 bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-700 rounded-lg text-sm font-bold transition flex items-center justify-center"><i class="fas fa-power-off mr-2"></i> Forçar Fechamento</button>
                </div>`; 
        }).join('');
    } catch(e) {
        console.error(e);
        container.innerHTML = `<p class="text-red-400 col-span-full text-center">Erro: ${e.message}</p>`;
    }
}

async function fetchClosedShifts(start, end) {
    const container = document.getElementById('mgr_closedShiftsContainer'); 
    if (!container) return;

    try {
        const q = query(getCollectionRef('shifts'), where('status', '==', 'closed'), where('openedAt', '>=', start), where('openedAt', '<', end), orderBy('openedAt', 'desc'));
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
                <div class="bg-gray-800 p-4 rounded-lg border border-gray-700 flex flex-col md:flex-row justify-between items-center gap-4 hover:bg-gray-750 transition animate-fade-in">
                    <div class="flex items-center w-full md:w-1/3">
                        <div class="mr-4 text-gray-500 bg-gray-900 h-10 w-10 flex items-center justify-center rounded-full"><i class="fas fa-history"></i></div>
                        <div>
                            <h4 class="text-white font-bold text-base">${s.userName}</h4>
                            <p class="text-xs text-gray-400"><i class="far fa-clock mr-1"></i> ${openTime} - ${closeTime}</p>
                            ${s.justification ? `<p class="text-[10px] text-yellow-500 mt-1">Obs: ${s.justification}</p>` : ''}
                        </div>
                    </div>
                    <div class="flex space-x-2 w-full md:w-2/3 justify-between md:justify-end items-center bg-gray-900/30 p-2 rounded-lg md:bg-transparent md:p-0">
                        <div class="text-right px-2 md:px-4 border-r border-gray-700">
                            <p class="text-[10px] text-gray-500 uppercase tracking-wider">Vendas</p>
                            <p class="text-white font-bold text-sm">${formatCurrency((s.reportSalesMoney || 0) + (s.reportSalesDigital || 0))}</p>
                        </div>
                        <div class="text-right px-2 md:px-4 border-r border-gray-700">
                            <p class="text-[10px] text-gray-500 uppercase tracking-wider">Quebra</p>
                            <p class="${diffColor} font-bold text-sm">${formatCurrency(diff)}</p>
                        </div>
                        <button onclick="window.openShiftDetails('${doc.id}')" class="ml-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold flex items-center"><i class="fas fa-list mr-1"></i> Detalhes</button>
                    </div>
                </div>`; 
        }).join('');
    } catch(e) {
        console.error(e);
        container.innerHTML = `<p class="text-red-400 text-center">Erro: ${e.message}</p>`;
    }
}

async function fetchDailySales(start, end) {
    const container = document.getElementById('mgr_tab-sales');
    if(!container) return;

    // INJETA HTML DO RELATÓRIO DO DIA (AGORA COM IDs ÚNICOS)
    if(!document.getElementById('mgr_reportTotalSales')) {
        container.innerHTML = `
            <section class="animate-fade-in">
                <div class="flex justify-between items-end mb-4">
                    <h4 class="text-lg font-bold text-white"><i class="fas fa-calendar-day mr-2 text-green-400"></i>Visão Geral do Dia</h4>
                    <div class="flex items-center space-x-2"><span id="mgr_salesTodayDate" class="text-xs text-gray-500 uppercase font-bold mr-2">--/--</span><button onclick="window.exportSalesToCSV()" class="px-3 py-1 bg-green-700 hover:bg-green-600 text-white rounded text-xs font-bold transition flex items-center"><i class="fas fa-file-csv mr-1"></i> Exportar CSV</button></div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div class="p-4 bg-gray-800 rounded-lg border border-green-500/30 group"><p class="text-gray-400 text-xs uppercase font-bold">Faturamento</p><p class="text-3xl font-extrabold text-green-400 mt-1" id="mgr_reportTotalSales">...</p></div>
                    <div class="p-4 bg-gray-800 rounded-lg border border-gray-700"><p class="text-gray-400 text-xs uppercase font-bold">Dinheiro</p><p class="text-xl font-bold text-white mt-1" id="mgr_reportTotalMoney">...</p></div>
                    <div class="p-4 bg-gray-800 rounded-lg border border-gray-700"><p class="text-gray-400 text-xs uppercase font-bold">Cartão/Pix</p><p class="text-xl font-bold text-white mt-1" id="mgr_reportTotalDigital">...</p></div>
                    <div class="p-4 bg-gray-800 rounded-lg border border-gray-700"><p class="text-gray-400 text-xs uppercase font-bold">Ticket Médio</p><p class="text-xl font-bold text-blue-400 mt-1" id="mgr_reportTicketMedio">...</p></div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <div class="bg-gray-800 rounded-lg border border-gray-700 p-4"><h5 class="text-sm font-bold text-white uppercase mb-3"><i class="fas fa-trophy text-yellow-400 mr-2"></i>Top 10 Mais Vendidos</h5><div id="mgr_topProductsList" class="space-y-2 max-h-40 overflow-y-auto custom-scrollbar"><p class="text-xs text-gray-500">Carregando...</p></div></div>
                    <div class="bg-gray-800 rounded-lg border border-gray-700 p-4 text-center"><h5 class="text-sm font-bold text-gray-400 uppercase mb-2"><i class="fas fa-clock text-indigo-400 mr-2"></i>Horário de Pico</h5><p class="text-2xl font-extrabold text-white" id="mgr_peakHourDisplay">--:--</p><p class="text-xs text-gray-500 mt-1" id="mgr_peakHourVolume">...</p></div>
                    <div class="bg-gray-800 rounded-lg border border-gray-700 p-4"><h5 class="text-sm font-bold text-white uppercase mb-3"><i class="fas fa-users text-blue-400 mr-2"></i>Desempenho Equipe</h5><div id="mgr_teamPerformanceList" class="space-y-2 max-h-40 overflow-y-auto custom-scrollbar"><p class="text-xs text-gray-500">Carregando...</p></div></div>
                </div>
            </section>
            <hr class="border-gray-700 my-6">
            <section class="animate-fade-in">
                <div class="flex justify-between items-center mb-4"><h4 class="text-lg font-bold text-white"><i class="fas fa-bullseye mr-2 text-red-400"></i>Desempenho Mensal</h4><button onclick="window.setMonthlyGoal()" class="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded transition"><i class="fas fa-edit mr-1"></i> Definir Meta</button></div>
                <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 relative"><div class="flex justify-between text-sm mb-2"><span class="text-gray-400">Vendido: <b class="text-white" id="mgr_monthSoldDisplay">R$ 0,00</b></span><span class="text-gray-400">Meta: <b class="text-white" id="mgr_monthGoalDisplay">R$ 0,00</b></span></div><div class="w-full bg-gray-700 rounded-full h-6 mb-4 relative overflow-hidden"><div id="mgr_monthProgressBar" class="bg-gradient-to-r from-blue-600 to-purple-600 h-6 rounded-full transition-all duration-1000 ease-out flex items-center justify-end pr-2" style="width: 0%"><span class="text-[10px] font-bold text-white drop-shadow-md" id="mgr_monthProgressPercent">0%</span></div></div><div class="flex justify-between items-center text-xs text-gray-500"><p>Faltam: <span class="text-red-400 font-bold" id="mgr_monthMissing">R$ 0,00</span></p><p>Previsão de Fechamento: <span class="text-indigo-400 font-bold" id="mgr_monthProjection">R$ 0,00</span></p></div></div>
            </section>
            <hr class="border-gray-700 my-6">
            <section class="animate-fade-in">
                <h4 class="text-lg font-bold text-white mb-4"><i class="fas fa-balance-scale mr-2 text-yellow-400"></i>Comparativo de Datas</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-end mb-4"><div class="bg-gray-800 p-3 rounded border border-gray-600"><label class="block text-xs text-gray-400 mb-1">Data A (Base)</label><input type="date" id="mgr_compDateA" class="input-pdv py-1 px-2 text-sm w-full bg-dark-input text-white border-gray-600"></div><div class="bg-gray-800 p-3 rounded border border-gray-600"><label class="block text-xs text-gray-400 mb-1">Data B (Comparação)</label><input type="date" id="mgr_compDateB" class="input-pdv py-1 px-2 text-sm w-full bg-dark-input text-white border-gray-600"></div></div>
                <button onclick="window.runDateComparison()" class="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition mb-4">COMPARAR RESULTADOS</button>
                <div id="mgr_comparisonResult" class="hidden bg-dark-input border border-gray-600 rounded-lg p-4"><div class="grid grid-cols-3 gap-4 text-center"><div><p class="text-xs text-gray-400 uppercase" id="mgr_compLabelA">Data A</p><p class="text-lg font-bold text-white" id="mgr_compValueA">R$ 0,00</p></div><div class="flex flex-col justify-center"><p class="text-xs text-gray-500 uppercase">Diferença</p><p class="text-xl font-extrabold" id="mgr_compDiffValue">0%</p></div><div><p class="text-xs text-gray-400 uppercase" id="mgr_compLabelB">Data B</p><p class="text-lg font-bold text-white" id="mgr_compValueB">R$ 0,00</p></div></div></div>
            </section>
        `;
        
        // Atualiza a data se disponível
        const dateEl = document.getElementById('mgr_salesTodayDate'); 
        if (dateEl) {
            const dateInput = document.getElementById('mgr_salesDateInput');
            if(dateInput && dateInput.value) {
                const [y, m, d] = dateInput.value.split('-');
                dateEl.textContent = `${d}/${m}/${y}`;
            }
        }
    }

    try {
        const q = query(getTablesCollectionRef(), where('status', '==', 'closed'), where('closedAt', '>=', start), where('closedAt', '<', end)); 
        const snapshot = await getDocs(q); 
        
        let totalSales = 0, totalMoney = 0, totalDigital = 0, count = 0; 
        const productStats = {}; const salesByHour = {}; const salesByWaiter = {};
        
        snapshot.forEach(docSnap => { 
            const table = docSnap.data(); 
            let tableTotal = 0; count++; 
            (table.payments || []).forEach(p => { 
                const val = parseFloat(p.value.toString().replace(/[^\d,.-]/g,'').replace(',','.')); 
                if (!isNaN(val)) { 
                    tableTotal += val; 
                    if (p.method.toLowerCase().includes('dinheiro')) totalMoney += val; else totalDigital += val; 
                } 
            }); 
            totalSales += tableTotal; 
            
            if (table.sentItems) { 
                table.sentItems.forEach(item => { 
                    const id = item.id; 
                    if (!productStats[id]) productStats[id] = { name: item.name, qty: 0 }; 
                    productStats[id].qty += 1; 
                }); 
            } 
            
            if (table.closedAt) { 
                const hour = table.closedAt.toDate().getHours(); 
                const hourKey = `${hour}h - ${hour+1}h`; 
                salesByHour[hourKey] = (salesByHour[hourKey] || 0) + 1; 
            } 
            
            const waiter = table.closedBy || 'Não Identificado'; 
            salesByWaiter[waiter] = (salesByWaiter[waiter] || 0) + tableTotal; 
        });
        
        requestAnimationFrame(() => {
            const elTotal = document.getElementById('mgr_reportTotalSales'); if(elTotal) elTotal.textContent = formatCurrency(totalSales); 
            const elMoney = document.getElementById('mgr_reportTotalMoney'); if(elMoney) elMoney.textContent = formatCurrency(totalMoney); 
            const elDig = document.getElementById('mgr_reportTotalDigital'); if(elDig) elDig.textContent = formatCurrency(totalDigital); 
            const elTk = document.getElementById('mgr_reportTicketMedio'); if(elTk) elTk.textContent = formatCurrency(count > 0 ? totalSales / count : 0);
            
            const topProducts = Object.values(productStats).sort((a, b) => b.qty - a.qty).slice(0, 10); 
            const topListEl = document.getElementById('mgr_topProductsList'); 
            if(topListEl) topListEl.innerHTML = topProducts.length ? topProducts.map((p, i) => `<div class="flex justify-between items-center text-sm border-b border-gray-700 pb-1 last:border-0"><span class="text-gray-300"><b class="text-pumpkin mr-2">#${i+1}</b> ${p.name}</span><span class="font-mono text-white font-bold">${p.qty}</span></div>`).join('') : '<p class="text-xs text-gray-500 italic">Sem vendas.</p>';
            
            let peakHour = '--:--'; let peakCount = 0; 
            Object.entries(salesByHour).forEach(([hour, count]) => { if(count > peakCount) { peakCount = count; peakHour = hour; } }); 
            const elPh = document.getElementById('mgr_peakHourDisplay'); if(elPh) elPh.textContent = peakHour; 
            const elPhV = document.getElementById('mgr_peakHourVolume'); if(elPhV) elPhV.textContent = `${peakCount} vendas`;
            
            const teamListEl = document.getElementById('mgr_teamPerformanceList'); 
            if(teamListEl) {
                const sortedTeam = Object.entries(salesByWaiter).sort(([,a], [,b]) => b - a); 
                teamListEl.innerHTML = sortedTeam.length ? sortedTeam.map(([name, total], i) => `<div class="flex justify-between items-center text-sm border-b border-gray-700 pb-1 last:border-0"><span class="text-gray-300 truncate"><b class="text-blue-400 mr-2">${i+1}.</b> ${name}</span><span class="font-mono text-white font-bold text-xs">${formatCurrency(total)}</span></div>`).join('') : '<p class="text-xs text-gray-500 italic">Sem vendas.</p>';
            }
        });

    } catch (e) {
        console.error("Erro ao calcular vendas diárias:", e);
    }
}

async function fetchMonthlyPerformance() { 
    const now = new Date(); 
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1); 
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59); 
    try { 
        const goalSnap = await getDoc(getFinancialGoalsDocRef()); 
        const meta = goalSnap.exists() ? (goalSnap.data().monthlyGoal || 0) : 0; 
        const q = query(getTablesCollectionRef(), where('status', '==', 'closed'), where('closedAt', '>=', Timestamp.fromDate(startOfMonth)), where('closedAt', '<=', Timestamp.fromDate(endOfMonth))); 
        const snapshot = await getDocs(q); 
        let totalMonth = 0; 
        snapshot.forEach(doc => { (doc.data().payments || []).forEach(p => { const v = parseFloat(p.value.toString().replace(/[^\d,.-]/g,'').replace(',','.')); if (!isNaN(v)) totalMonth += v; }); }); 
        
        const percent = meta > 0 ? Math.min(100, (totalMonth / meta) * 100) : 0; 
        const missing = Math.max(0, meta - totalMonth); 
        const projection = now.getDate() > 0 ? (totalMonth / now.getDate()) * endOfMonth.getDate() : 0; 
        
        const elSold = document.getElementById('mgr_monthSoldDisplay'); if(elSold) elSold.textContent = formatCurrency(totalMonth); 
        const elGoal = document.getElementById('mgr_monthGoalDisplay'); if(elGoal) elGoal.textContent = formatCurrency(meta); 
        const elMiss = document.getElementById('mgr_monthMissing'); if(elMiss) elMiss.textContent = formatCurrency(missing); 
        const elProj = document.getElementById('mgr_monthProjection'); if(elProj) elProj.textContent = formatCurrency(projection); 
        const elProg = document.getElementById('mgr_monthProgressBar'); if(elProg) elProg.style.width = `${percent}%`; 
    } catch (e) { console.error(e); } 
}

async function handleForceCloseShift(id) { if(confirm("Fechar caixa?")) { await updateDoc(doc(getCollectionRef('shifts'), id), { status: 'closed', closedAt: serverTimestamp() }); loadReports(); } }
async function handleCloseDay() { if(confirm("Fechar dia?")) showToast("Dia encerrado."); }
async function exportSalesToCSV() { alert("Exportando..."); }
async function setMonthlyGoal() { 
    const val = prompt("Nova Meta (R$):");
    if(val) { await setDoc(getFinancialGoalsDocRef(), { monthlyGoal: parseFloat(val) }, { merge: true }); fetchMonthlyPerformance(); }
}
async function runDateComparison() { alert("Comparando..."); }
async function openShiftDetails() { alert("Detalhes..."); }