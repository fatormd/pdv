// --- CONTROLLERS/MANAGER/MODULES/SALESMANAGER.JS ---

import { db, appId, getTablesCollectionRef, getFinancialGoalsDocRef } from "/services/firebaseService.js"; 
import { 
    collection, query, where, getDocs, orderBy, 
    doc, updateDoc, setDoc, serverTimestamp, getDoc, Timestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { formatCurrency, toggleLoading } from "/utils.js";
import { showToast } from "/app.js"; 

// Helpers Locais
const getColRef = (name) => collection(db, 'artifacts', appId, 'public', 'data', name);
let managerModal = null;
let reportDateInput = null;

// ==================================================================
//           1. API PÚBLICA
// ==================================================================

export const init = () => {
    console.log("[SalesModule] Inicializado.");
    managerModal = document.getElementById('managerModal');
    
    // Expõe funções para o HTML injetado
    window.openReportPanel = open; // Alias
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
                    <button class="report-tab-btn px-4 py-2 rounded-lg bg-indigo-600 text-white font-bold transition" onclick="window.switchReportTab('active-shifts')">Abertos (Atual)</button>
                    <button class="report-tab-btn px-4 py-2 rounded-lg bg-dark-input text-gray-300 hover:bg-gray-700 transition" onclick="window.switchReportTab('closed-shifts')">Fechados (Histórico)</button>
                    <button class="report-tab-btn px-4 py-2 rounded-lg bg-dark-input text-gray-300 hover:bg-gray-700 transition" onclick="window.switchReportTab('sales')">Totais do Dia</button>
                </div>
                <div class="flex items-center space-x-2">
                    <label class="text-gray-400 text-sm">Data Base:</label>
                    <input type="date" id="reportDateInput" class="input-pdv py-1 px-3 text-sm bg-dark-input border-gray-600 text-white rounded">
                    <button onclick="window.loadReports()" class="p-2 bg-pumpkin text-white rounded hover:bg-pumpkin-dark"><i class="fas fa-sync-alt"></i></button>
                </div>
            </div>

            <div class="flex-grow overflow-y-auto p-6 custom-scrollbar bg-dark-bg relative">
                <div id="tab-active-shifts" class="report-content block space-y-4"><div id="activeShiftsContainer" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div></div>
                <div id="tab-closed-shifts" class="report-content hidden space-y-4"><div id="closedShiftsContainer" class="space-y-3"></div></div>
                <div id="tab-sales" class="report-content hidden space-y-8">
                    </div>
            </div>
        </div>`;
    
    managerModal.style.display = 'flex';
    managerModal.classList.remove('p-4'); 
    managerModal.classList.add('p-0', 'md:p-4');

    // Configura Data Inicial
    reportDateInput = document.getElementById('reportDateInput');
    if (reportDateInput) {
        reportDateInput.valueAsDate = new Date(); 
        reportDateInput.addEventListener('change', loadReports);
    }

    await loadReports();
}

function switchReportTab(tab) {
    document.querySelectorAll('.report-tab-btn').forEach(btn => {
        if(btn.textContent.toLowerCase().includes(tab.split('-')[0])) { // Lógica simples de match
             btn.classList.remove('bg-dark-input', 'text-gray-300'); 
             btn.classList.add('bg-indigo-600', 'text-white');
        } else {
             btn.classList.add('bg-dark-input', 'text-gray-300'); 
             btn.classList.remove('bg-indigo-600', 'text-white');
        }
    });

    document.querySelectorAll('.report-content').forEach(c => c.classList.add('hidden'));
    const target = document.getElementById(`tab-${tab}`);
    if(target) target.classList.remove('hidden');
    
    if(tab === 'sales') fetchMonthlyPerformance();
}

// ==================================================================
//           3. LÓGICA DE DADOS (DATA FETCHING)
// ==================================================================

async function loadReports() {
    const dateVal = document.getElementById('reportDateInput').value; 
    if(!dateVal) return;
    
    const startOfDay = Timestamp.fromDate(new Date(dateVal + 'T00:00:00')); 
    const endOfDay = Timestamp.fromDate(new Date(dateVal + 'T23:59:59'));
    
    // Atualiza label se existir
    const dateEl = document.getElementById('salesTodayDate'); 
    if (dateEl) dateEl.textContent = new Date(dateVal).toLocaleDateString('pt-BR');

    try { 
        await Promise.all([ 
            fetchActiveShifts(), 
            fetchClosedShifts(startOfDay, endOfDay), 
            fetchDailySales(startOfDay, endOfDay) 
        ]); 
    } catch (e) { 
        console.error("Erro ao carregar relatórios:", e); 
    }
}

async function fetchActiveShifts() {
    const container = document.getElementById('activeShiftsContainer'); if (!container) return;
    try {
        const q = query(getColRef('shifts'), where('status', '==', 'open'));
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
        container.innerHTML = `<p class="text-red-400">Erro: ${e.message}</p>`;
    }
}

async function fetchClosedShifts(start, end) {
    const container = document.getElementById('closedShiftsContainer'); if (!container) return;
    try {
        const q = query(getColRef('shifts'), where('status', '==', 'closed'), where('openedAt', '>=', start), where('openedAt', '<', end), orderBy('openedAt', 'desc'));
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
        container.innerHTML = `<p class="text-red-400">Erro: ${e.message}</p>`;
    }
}

async function fetchDailySales(start, end) {
    const container = document.getElementById('tab-sales');
    if(!container) return;

    // Renderiza estrutura se estiver vazia
    if(container.innerHTML.trim() === '') {
        container.innerHTML = `
            <section>
                <div class="flex justify-between items-end mb-4">
                    <h4 class="text-lg font-bold text-white"><i class="fas fa-calendar-day mr-2 text-green-400"></i>Visão Geral do Dia</h4>
                    <div class="flex items-center space-x-2"><span id="salesTodayDate" class="text-xs text-gray-500 uppercase font-bold mr-2">--/--</span><button onclick="window.exportSalesToCSV()" class="px-3 py-1 bg-green-700 hover:bg-green-600 text-white rounded text-xs font-bold transition flex items-center"><i class="fas fa-file-csv mr-1"></i> Exportar CSV</button></div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div class="p-4 bg-gray-800 rounded-lg border border-green-500/30 group"><p class="text-gray-400 text-xs uppercase font-bold">Faturamento</p><p class="text-3xl font-extrabold text-green-400 mt-1" id="reportTotalSales">R$ 0,00</p></div>
                    <div class="p-4 bg-gray-800 rounded-lg border border-gray-700"><p class="text-gray-400 text-xs uppercase font-bold">Dinheiro</p><p class="text-xl font-bold text-white mt-1" id="reportTotalMoney">R$ 0,00</p></div>
                    <div class="p-4 bg-gray-800 rounded-lg border border-gray-700"><p class="text-gray-400 text-xs uppercase font-bold">Cartão/Pix</p><p class="text-xl font-bold text-white mt-1" id="reportTotalDigital">R$ 0,00</p></div>
                    <div class="p-4 bg-gray-800 rounded-lg border border-gray-700"><p class="text-gray-400 text-xs uppercase font-bold">Ticket Médio</p><p class="text-xl font-bold text-blue-400 mt-1" id="reportTicketMedio">R$ 0,00</p></div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <div class="bg-gray-800 rounded-lg border border-gray-700 p-4"><h5 class="text-sm font-bold text-white uppercase mb-3"><i class="fas fa-trophy text-yellow-400 mr-2"></i>Top 10 Mais Vendidos</h5><div id="topProductsList" class="space-y-2 max-h-40 overflow-y-auto custom-scrollbar"></div></div>
                    <div class="bg-gray-800 rounded-lg border border-gray-700 p-4 text-center"><h5 class="text-sm font-bold text-gray-400 uppercase mb-2"><i class="fas fa-clock text-indigo-400 mr-2"></i>Horário de Pico</h5><p class="text-2xl font-extrabold text-white" id="peakHourDisplay">--:--</p><p class="text-xs text-gray-500 mt-1" id="peakHourVolume">0 vendas</p></div>
                    <div class="bg-gray-800 rounded-lg border border-gray-700 p-4"><h5 class="text-sm font-bold text-white uppercase mb-3"><i class="fas fa-users text-blue-400 mr-2"></i>Desempenho Equipe</h5><div id="teamPerformanceList" class="space-y-2 max-h-40 overflow-y-auto custom-scrollbar"></div></div>
                </div>
            </section>
            <hr class="border-gray-700">
            <section>
                <div class="flex justify-between items-center mb-4"><h4 class="text-lg font-bold text-white"><i class="fas fa-bullseye mr-2 text-red-400"></i>Desempenho Mensal</h4><button onclick="window.setMonthlyGoal()" class="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded transition"><i class="fas fa-edit mr-1"></i> Definir Meta</button></div>
                <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 relative"><div class="flex justify-between text-sm mb-2"><span class="text-gray-400">Vendido: <b class="text-white" id="monthSoldDisplay">R$ 0,00</b></span><span class="text-gray-400">Meta: <b class="text-white" id="monthGoalDisplay">R$ 0,00</b></span></div><div class="w-full bg-gray-700 rounded-full h-6 mb-4 relative overflow-hidden"><div id="monthProgressBar" class="bg-gradient-to-r from-blue-600 to-purple-600 h-6 rounded-full transition-all duration-1000 ease-out flex items-center justify-end pr-2" style="width: 0%"><span class="text-[10px] font-bold text-white drop-shadow-md" id="monthProgressPercent">0%</span></div></div><div class="flex justify-between items-center text-xs text-gray-500"><p>Faltam: <span class="text-red-400 font-bold" id="monthMissing">R$ 0,00</span></p><p>Previsão de Fechamento: <span class="text-indigo-400 font-bold" id="monthProjection">R$ 0,00</span></p></div></div>
            </section>
            <hr class="border-gray-700">
            <section>
                <h4 class="text-lg font-bold text-white mb-4"><i class="fas fa-balance-scale mr-2 text-yellow-400"></i>Comparativo de Datas</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-end mb-4"><div class="bg-gray-800 p-3 rounded border border-gray-600"><label class="block text-xs text-gray-400 mb-1">Data A (Base)</label><input type="date" id="compDateA" class="input-pdv py-1 px-2 text-sm w-full bg-dark-input text-white border-gray-600"></div><div class="bg-gray-800 p-3 rounded border border-gray-600"><label class="block text-xs text-gray-400 mb-1">Data B (Comparação)</label><input type="date" id="compDateB" class="input-pdv py-1 px-2 text-sm w-full bg-dark-input text-white border-gray-600"></div></div>
                <button onclick="window.runDateComparison()" class="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition mb-4">COMPARAR RESULTADOS</button>
                <div id="comparisonResult" class="hidden bg-dark-input border border-gray-600 rounded-lg p-4"><div class="grid grid-cols-3 gap-4 text-center"><div><p class="text-xs text-gray-400 uppercase" id="compLabelA">Data A</p><p class="text-lg font-bold text-white" id="compValueA">R$ 0,00</p></div><div class="flex flex-col justify-center"><p class="text-xs text-gray-500 uppercase">Diferença</p><p class="text-xl font-extrabold" id="compDiffValue">0%</p></div><div><p class="text-xs text-gray-400 uppercase" id="compLabelB">Data B</p><p class="text-lg font-bold text-white" id="compValueB">R$ 0,00</p></div></div></div>
            </section>
        `;
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
        
        // Atualiza UI
        document.getElementById('reportTotalSales').textContent = formatCurrency(totalSales); 
        document.getElementById('reportTotalMoney').textContent = formatCurrency(totalMoney); 
        document.getElementById('reportTotalDigital').textContent = formatCurrency(totalDigital); 
        document.getElementById('reportTicketMedio').textContent = formatCurrency(count > 0 ? totalSales / count : 0);
        
        // Top Products
        const topProducts = Object.values(productStats).sort((a, b) => b.qty - a.qty).slice(0, 10); 
        const topListEl = document.getElementById('topProductsList'); 
        topListEl.innerHTML = topProducts.length ? topProducts.map((p, i) => `<div class="flex justify-between items-center text-sm border-b border-gray-700 pb-1 last:border-0"><span class="text-gray-300"><b class="text-pumpkin mr-2">#${i+1}</b> ${p.name}</span><span class="font-mono text-white font-bold">${p.qty}</span></div>`).join('') : '<p class="text-xs text-gray-500 italic">Sem dados.</p>';
        
        // Peak Hour
        let peakHour = '--:--'; let peakCount = 0; 
        Object.entries(salesByHour).forEach(([hour, count]) => { if(count > peakCount) { peakCount = count; peakHour = hour; } }); 
        document.getElementById('peakHourDisplay').textContent = peakHour; 
        document.getElementById('peakHourVolume').textContent = `${peakCount} vendas`;
        
        // Team
        const teamListEl = document.getElementById('teamPerformanceList'); 
        const sortedTeam = Object.entries(salesByWaiter).sort(([,a], [,b]) => b - a); 
        teamListEl.innerHTML = sortedTeam.length ? sortedTeam.map(([name, total], i) => `<div class="flex justify-between items-center text-sm border-b border-gray-700 pb-1 last:border-0"><span class="text-gray-300 truncate"><b class="text-blue-400 mr-2">${i+1}.</b> ${name}</span><span class="font-mono text-white font-bold text-xs">${formatCurrency(total)}</span></div>`).join('') : '<p class="text-xs text-gray-500 italic">Sem vendas.</p>';

    } catch (e) {
        console.error("Erro ao calcular vendas diárias:", e);
    }
}

// ... Restante das funções auxiliares (Mesma lógica do original) ...
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
        
        const elSold = document.getElementById('monthSoldDisplay'); if(elSold) elSold.textContent = formatCurrency(totalMonth); 
        const elGoal = document.getElementById('monthGoalDisplay'); if(elGoal) elGoal.textContent = formatCurrency(meta); 
        const elMiss = document.getElementById('monthMissing'); if(elMiss) elMiss.textContent = formatCurrency(missing); 
        const elProj = document.getElementById('monthProjection'); if(elProj) elProj.textContent = formatCurrency(projection); 
        const elProg = document.getElementById('monthProgressBar'); if(elProg) elProg.style.width = `${percent}%`; 
    } catch (e) { console.error(e); } 
}

async function handleForceCloseShift(shiftId) {
    if (!confirm("ATENÇÃO: Deseja forçar o fechamento deste caixa?")) return;
    try {
        const shiftRef = doc(getColRef('shifts'), shiftId);
        await updateDoc(shiftRef, { status: 'closed', closedAt: serverTimestamp(), justification: "Fechamento Forçado Gerente", finalCashInDrawer: 0, difference: 0 });
        showToast("Caixa encerrado.", false); 
        loadReports();
    } catch (e) { showToast("Erro: " + e.message, true); }
}

async function handleCloseDay() { 
    if (confirm("Deseja realmente encerrar o turno/dia? Isso registrará o timestamp de fechamento.")) { 
        try { 
            await setDoc(doc(getColRef('daily_reports'), `daily_${new Date().toISOString().split('T')[0]}`), { closedAt: serverTimestamp() }); 
            showToast("Turno Encerrado!", false); 
            loadReports(); 
        } catch (e) { showToast(e.message, true); } 
    } 
}

async function exportSalesToCSV() { 
    const dateVal = document.getElementById('reportDateInput').value; 
    if(!dateVal) { showToast("Selecione data.", true); return; } 
    
    const start = Timestamp.fromDate(new Date(dateVal + 'T00:00:00')); 
    const end = Timestamp.fromDate(new Date(dateVal + 'T23:59:59')); 
    
    const q = query(getTablesCollectionRef(), where('status', '==', 'closed'), where('closedAt', '>=', start), where('closedAt', '<=', end)); 
    const snapshot = await getDocs(q); 
    
    if (snapshot.empty) { showToast("Sem dados.", true); return; } 
    
    let csv = "Data,Mesa,Garcom,Total\r\n"; 
    snapshot.forEach(doc => { 
        const t = doc.data(); 
        csv += `${t.closedAt?.toDate().toLocaleString() || ''},${t.tableNumber},${t.closedBy || 'N/A'},${t.total}\r\n`; 
    }); 
    
    const link = document.createElement("a"); 
    link.setAttribute("href", encodeURI("data:text/csv;charset=utf-8," + csv)); 
    link.setAttribute("download", `vendas_${dateVal}.csv`); 
    document.body.appendChild(link); link.click(); document.body.removeChild(link); 
}

async function setMonthlyGoal() { 
    const newVal = prompt("Defina a Meta de Vendas (R$):"); 
    if (newVal) { 
        const numVal = parseFloat(newVal.replace('.','').replace(',','.')); 
        if (!isNaN(numVal)) { 
            await setDoc(getFinancialGoalsDocRef(), { monthlyGoal: numVal }, { merge: true }); 
            fetchMonthlyPerformance(); 
        } 
    } 
}

async function runDateComparison() { 
    const dateA = document.getElementById('compDateA').value; 
    const dateB = document.getElementById('compDateB').value; 
    if (!dateA || !dateB) { showToast("Selecione datas.", true); return; } 
    
    const getDayTotal = async (dateStr) => { 
        const start = Timestamp.fromDate(new Date(dateStr + 'T00:00:00')); 
        const end = Timestamp.fromDate(new Date(dateStr + 'T23:59:59')); 
        const q = query(getTablesCollectionRef(), where('status', '==', 'closed'), where('closedAt', '>=', start), where('closedAt', '<=', end)); 
        const snapshot = await getDocs(q); 
        let total = 0; 
        snapshot.forEach(d => { (d.data().payments || []).forEach(p => { const v = parseFloat(p.value.toString().replace(/[^\d,.-]/g,'').replace(',','.')); if(!isNaN(v)) total += v; }); }); 
        return total; 
    }; 
    
    const [totalA, totalB] = await Promise.all([getDayTotal(dateA), getDayTotal(dateB)]); 
    
    document.getElementById('compValueA').textContent = formatCurrency(totalA); 
    document.getElementById('compValueB').textContent = formatCurrency(totalB); 
    
    const diff = totalA > 0 ? ((totalB - totalA) / totalA) * 100 : (totalB > 0 ? 100 : 0); 
    const el = document.getElementById('compDiffValue'); 
    el.textContent = `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`; 
    el.className = `text-xl font-extrabold ${diff >= 0 ? 'text-green-400' : 'text-red-400'}`; 
    document.getElementById('comparisonResult').classList.remove('hidden'); 
}

async function openShiftDetails(shiftId) {
    // Reutiliza o modal 'shiftDetailsModal' que já existe no HTML principal
    // ou injeta um se necessário. Para simplificar, assumimos que existe no index.html
    const modal = document.getElementById('shiftDetailsModal'); 
    const tableBody = document.getElementById('shiftSalesTableBody'); 
    const header = document.getElementById('shiftDetailsHeader');
    if (!modal || !tableBody) return; 
    
    modal.style.display = 'flex'; 
    tableBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500 italic">Carregando...</td></tr>';
    
    try { 
        const shiftSnap = await getDoc(doc(getColRef('shifts'), shiftId)); 
        if (!shiftSnap.exists()) throw new Error("Turno não encontrado."); 
        
        const shift = shiftSnap.data(); 
        header.textContent = `${shift.userName} | ${shift.openedAt.toDate().toLocaleString()}`; 
        
        const tablesQ = query(getTablesCollectionRef(), where('status', '==', 'closed'), where('closedAt', '>=', shift.openedAt), where('closedAt', '<=', shift.closedAt), orderBy('closedAt', 'desc')); 
        const snapshot = await getDocs(tablesQ); 
        
        if (snapshot.empty) { tableBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500 italic">Nenhuma venda.</td></tr>'; return; }
        
        tableBody.innerHTML = snapshot.docs.map(docSnap => { 
            const table = docSnap.data(); 
            let tableTotal = 0; 
            (table.payments || []).forEach(p => { const val = parseFloat(p.value.toString().replace(/[^\d,.-]/g,'').replace(',','.')); if (!isNaN(val)) tableTotal += val; }); 
            const originBadge = table.isPickup ? '<span class="text-[10px] bg-blue-900 text-blue-300 px-1.5 rounded ml-2">RETIRADA</span>' : (table.sector ? `<span class="text-[10px] bg-gray-700 text-gray-300 px-1.5 rounded ml-2">${table.sector}</span>` : '');
            return `<tr class="hover:bg-gray-700 transition border-b border-gray-800"><td class="p-3 text-gray-300">${table.closedAt ? table.closedAt.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--'}</td><td class="p-3 font-bold text-white">Mesa ${table.tableNumber}${originBadge}</td><td class="p-3 text-gray-400 text-sm">${table.closedBy || 'Staff'}</td><td class="p-3 text-right text-green-400 font-bold">${formatCurrency(tableTotal)}</td></tr>`; 
        }).join('');
    } catch (e) { 
        tableBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-400">Erro: ${e.message}</td></tr>`; 
    }
}