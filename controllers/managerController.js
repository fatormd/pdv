// --- CONTROLLERS/MANAGERCONTROLLER.JS (VERSÃO FINAL: TODAS AS FUNÇÕES INCLUÍDAS) ---
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
    doc, setDoc, deleteDoc, updateDoc, serverTimestamp, getDoc, limit, addDoc, writeBatch, increment
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { formatCurrency, toggleLoading } from "/utils.js";
import { openUserManagementModal } from "/controllers/userManagementController.js"; 
import { 
    syncWithWooCommerce, getProducts, getCategories, 
    createWooProduct, updateWooProduct, deleteWooProduct, fetchWooCommerceProducts, 
    createWooCategory, updateWooCategory, deleteWooCategory 
} from "/services/wooCommerceService.js"; 
import { showToast } from "/app.js"; 

// =================================================================
//           1. VARIÁVEIS DE ESTADO
// =================================================================
let managerModal; 
let voucherManagementModal, voucherListContainer, voucherForm;
let reportDateInput;
let managerControllerInitialized = false;
let currentFinTab = 'dre';
let currentHubTab = 'products';

// Estado do Hub, Estoque e RH
let hubPage = 1;
let hubSearch = '';
let hubCategory = 'all';
let hubSearchTimeout = null;
let inventoryChecklist = [];
let currentComposition = []; 
let ingredientsCache = [];
let suppliersCache = [];

// =================================================================
//           2. FUNÇÕES AUXILIARES
// =================================================================

const toLocalISO = (date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().split('T')[0];
};

const getCollectionRef = (name) => collection(db, 'artifacts', appId, 'public', 'data', name);

// --- CÁLCULOS TRABALHISTAS (CLT 2024) ---
function calculateINSS(grossSalary) {
    let inss = 0;
    if (grossSalary <= 1412.00) inss = grossSalary * 0.075;
    else if (grossSalary <= 2666.68) inss = (1412.00 * 0.075) + ((grossSalary - 1412.00) * 0.09);
    else if (grossSalary <= 4000.03) inss = (1412.00 * 0.075) + ((2666.68 - 1412.00) * 0.09) + ((grossSalary - 2666.68) * 0.12);
    else if (grossSalary <= 7786.02) inss = (1412.00 * 0.075) + ((2666.68 - 1412.00) * 0.09) + ((4000.03 - 2666.68) * 0.12) + ((grossSalary - 4000.03) * 0.14);
    else inss = (1412.00 * 0.075) + ((2666.68 - 1412.00) * 0.09) + ((4000.03 - 2666.68) * 0.12) + ((7786.02 - 4000.03) * 0.14);
    return inss;
}

function calculateIRRF(baseSalary, dependents) {
    const deductionPerDependent = 189.59;
    const base = baseSalary - (dependents * deductionPerDependent);
    let irrf = 0;
    if (base <= 2259.20) irrf = 0;
    else if (base <= 2826.65) irrf = (base * 0.075) - 169.44;
    else if (base <= 3751.05) irrf = (base * 0.15) - 381.44;
    else if (base <= 4664.68) irrf = (base * 0.225) - 662.77;
    else irrf = (base * 0.275) - 896.00;
    return Math.max(0, irrf);
}

// =================================================================
//           3. AÇÕES DE NEGÓCIO (LÓGICA)
// =================================================================

// --- SYNC ---
async function handleSyncAction() {
    showToast("Iniciando sincronização...", false);
    try {
        await syncWithWooCommerce();
        showToast("Sincronização concluída!", false);
    } catch (e) {
        console.error(e);
        showToast("Erro na sincronização.", true);
    }
}

// --- CADASTROS AUXILIARES (SETORES, TIPOS, CATEGORIAS) --- 
// (ESTA PARTE ESTAVA EM FALTA E FOI RESTAURADA)
async function renderSectorManagementModal() {
    if (!managerModal) return;
    
    managerModal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 w-full max-w-2xl p-6 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-white">Cadastros Auxiliares</h3>
                <button class="text-gray-400 hover:text-white text-2xl leading-none" onclick="document.getElementById('managerModal').style.display='none'">&times;</button>
            </div>
            
            <div class="flex space-x-2 mb-4 border-b border-gray-700 pb-2 overflow-x-auto">
                <button class="aux-tab-btn px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold whitespace-nowrap" onclick="window.switchAuxTab('sectors')">Setores</button>
                <button class="aux-tab-btn px-4 py-2 rounded-lg bg-dark-input text-gray-300 text-sm font-bold hover:bg-gray-700 whitespace-nowrap" onclick="window.switchAuxTab('ingredient_types')">Tipos Insumo</button>
                <button class="aux-tab-btn px-4 py-2 rounded-lg bg-dark-input text-gray-300 text-sm font-bold hover:bg-gray-700 whitespace-nowrap" onclick="window.switchAuxTab('supplier_categories')">Cat. Fornecedor</button>
            </div>

            <div id="auxContent" class="flex-grow overflow-y-auto custom-scrollbar mb-4">
                <div class="text-center text-gray-500 py-4"><i class="fas fa-spinner fa-spin"></i></div>
            </div>

            <form id="auxForm" class="flex gap-2 mt-auto pt-4 border-t border-gray-700">
                <input type="hidden" id="auxType" value="sectors">
                <input type="text" id="auxName" placeholder="Novo item..." class="input-pdv flex-grow p-2 text-sm" required>
                <select id="auxExtra" class="input-pdv p-2 text-sm hidden">
                    <option value="production">Produção (KDS)</option>
                    <option value="service">Serviço (Salão)</option>
                </select>
                <button type="submit" class="bg-green-600 hover:bg-green-700 text-white px-4 rounded-lg font-bold"><i class="fas fa-plus"></i></button>
            </form>
        </div>
    `;
    
    managerModal.style.display = 'flex';
    await switchAuxTab('sectors');

    const form = document.getElementById('auxForm');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const type = document.getElementById('auxType').value;
            const name = document.getElementById('auxName').value;
            const extra = document.getElementById('auxExtra').value;
            
            const data = { name };
            if (type === 'sectors') data.type = extra; 

            await saveAuxiliary(type, data);
            document.getElementById('auxName').value = '';
            switchAuxTab(type);
        };
    }
}

async function switchAuxTab(type) {
    const content = document.getElementById('auxContent');
    const typeInput = document.getElementById('auxType');
    const extraInput = document.getElementById('auxExtra');
    
    if (!content) return;
    typeInput.value = type;
    
    document.querySelectorAll('.aux-tab-btn').forEach(btn => {
        const txt = btn.textContent.toLowerCase();
        const match = (type === 'sectors' && txt.includes('setores')) || 
                      (type === 'ingredient_types' && txt.includes('insumo')) || 
                      (type === 'supplier_categories' && txt.includes('fornecedor'));
        
        if(match) {
            btn.classList.add('bg-indigo-600', 'text-white'); btn.classList.remove('bg-dark-input', 'text-gray-300');
        } else {
            btn.classList.remove('bg-indigo-600', 'text-white'); btn.classList.add('bg-dark-input', 'text-gray-300');
        }
    });

    if (type === 'sectors') extraInput.classList.remove('hidden'); else extraInput.classList.add('hidden');

    try {
        let colRef = type === 'sectors' ? getSectorsCollectionRef() : getCollectionRef(type);
        const snap = await getDocs(query(colRef, orderBy('name')));
        
        if (snap.empty) {
            content.innerHTML = '<p class="text-gray-500 italic text-center p-4">Nenhum item cadastrado.</p>';
            return;
        }

        content.innerHTML = snap.docs.map(d => {
            const item = d.data();
            let extraInfo = '';
            if (type === 'sectors') {
                extraInfo = item.type === 'production' ? '<span class="ml-2 text-[10px] bg-orange-900 text-orange-300 px-1 rounded">Cozinha</span>' : '<span class="ml-2 text-[10px] bg-blue-900 text-blue-300 px-1 rounded">Salão</span>';
            }
            return `
                <div class="flex justify-between items-center bg-dark-bg p-3 rounded border border-gray-700 mb-2">
                    <span class="text-white font-bold flex items-center">${item.name} ${extraInfo}</span>
                    <button onclick="window.deleteAuxiliary('${type}', '${d.id}')" class="text-red-400 hover:text-red-300 p-2"><i class="fas fa-trash"></i></button>
                </div>`;
        }).join('');

    } catch (e) {
        console.error(e);
        content.innerHTML = '<p class="text-red-400 p-4">Erro ao carregar dados.</p>';
    }
}

async function saveAuxiliary(collectionName, data) {
    try {
        let colRef = collectionName === 'sectors' ? getSectorsCollectionRef() : getCollectionRef(collectionName);
        await addDoc(colRef, data);
        showToast("Salvo com sucesso!");
    } catch (e) {
        console.error(e);
        showToast("Erro ao salvar.", true);
    }
}

async function deleteAuxiliary(collectionName, id) {
    if (!confirm("Tem certeza?")) return;
    try {
        let colRef = collectionName === 'sectors' ? getSectorsCollectionRef() : getCollectionRef(collectionName);
        await deleteDoc(doc(colRef, id));
        switchAuxTab(collectionName);
        showToast("Excluído.");
    } catch (e) {
        showToast("Erro ao excluir.", true);
    }
}

// --- VOUCHERS ---
async function handleSaveVoucher(e) {
    if(e) e.preventDefault();
    const idInput = document.getElementById('voucherIdInput');
    const nameInput = document.getElementById('voucherNameInput');
    const ptsInput = document.getElementById('voucherPointsInput');
    const valInput = document.getElementById('voucherValueInput');
    if(!nameInput || !ptsInput || !valInput) return;
    const id = idInput.value || doc(getVouchersCollectionRef()).id;
    try {
        await setDoc(doc(getVouchersCollectionRef(), id), { 
            id, name: nameInput.value, points: parseInt(ptsInput.value), value: parseFloat(valInput.value) 
        });
        if(voucherForm) voucherForm.style.display = 'none'; 
        fetchVouchers(); showToast("Voucher salvo!");
    } catch (error) { console.error(error); showToast("Erro ao salvar voucher.", true); }
}

async function handleDeleteVoucher(id) {
    if(confirm("Excluir voucher?")) { 
        await deleteDoc(doc(getVouchersCollectionRef(), id)); fetchVouchers(); 
    }
}

async function fetchVouchers() {
    if (!voucherListContainer) return;
    const snap = await getDocs(query(getVouchersCollectionRef()));
    voucherListContainer.innerHTML = snap.docs.map(d => 
        `<div class="flex justify-between bg-dark-input p-3 rounded mb-2 text-white"><span>${d.data().name} (${d.data().value} pts)</span><button onclick="window.handleDeleteVoucher('${d.id}')" class="text-red-400"><i class="fas fa-trash"></i></button></div>`
    ).join('');
}

async function openVoucherManagementModal() {
    if (!voucherManagementModal) return;
    if (managerModal) managerModal.style.display = 'none';
    voucherManagementModal.style.display = 'flex';
    await fetchVouchers();
}

// --- FINANCEIRO ---
async function saveExpense() {
    const btn = document.getElementById('btnSaveExpense');
    const desc = document.getElementById('expDesc').value;
    const amount = parseFloat(document.getElementById('expAmount').value);
    const date = document.getElementById('expDate').value;
    const cat = document.getElementById('expCat').value;
    const supplierId = document.getElementById('expSupplier').value;
    const docNum = document.getElementById('expDocNumber').value;
    const barcode = document.getElementById('expBarcode').value;

    if (!desc || isNaN(amount) || !date) { showToast("Preencha campos obrigatórios.", true); return; }
    
    const supplier = suppliersCache.find(s => s.id === supplierId);
    const supplierName = supplier ? supplier.name : '';

    toggleLoading(btn, true, 'Salvando...');
    try {
        await addDoc(getCollectionRef('expenses'), {
            description: desc, amount: amount, date: date, category: cat,
            supplierId: supplierId || null, supplierName: supplierName || null,
            documentNumber: docNum || null, barcode: barcode || null, createdAt: serverTimestamp()
        });
        showToast("Salvo!", false); 
        switchFinTab('expenses');
    } catch (e) { showToast("Erro.", true); } 
    finally { toggleLoading(btn, false, 'Salvar Lançamento'); }
}

async function deleteExpense(id) {
    if(confirm("Excluir este lançamento?")) {
        try { await deleteDoc(doc(getCollectionRef('expenses'), id)); switchFinTab('expenses'); showToast("Excluído."); } 
        catch(e) { showToast("Erro.", true); }
    }
}

function toggleExpenseForm() {
    const form = document.getElementById('expenseForm');
    if(form) form.classList.toggle('hidden');
}

async function switchFinTab(tab) {
    currentFinTab = tab;
    const content = document.getElementById('finContent');
    if(!content) return;
    document.querySelectorAll('.fin-tab-btn').forEach(btn => {
        const isDre = btn.textContent.includes('DRE'); const isExp = btn.textContent.includes('Contas');
        if ((tab === 'dre' && isDre) || (tab === 'expenses' && isExp)) btn.className = "fin-tab-btn px-4 py-2 rounded-lg bg-pink-600 text-white font-bold transition";
        else btn.className = "fin-tab-btn px-4 py-2 rounded-lg bg-dark-input text-gray-300 hover:bg-gray-700 transition";
    });
    content.innerHTML = '<div class="flex justify-center py-10"><i class="fas fa-spinner fa-spin text-pink-500 text-3xl"></i></div>';
    if (tab === 'dre') await renderDRE(content); else await renderExpensesList(content);
}

// --- RELATÓRIOS ---
async function loadReports() {
    if (!reportDateInput) reportDateInput = document.getElementById('reportDateInput');
    if (!reportDateInput) return; 
    const dateVal = reportDateInput.value; 
    if(!dateVal) return;
    const startOfDay = Timestamp.fromDate(new Date(dateVal + 'T00:00:00')); 
    const endOfDay = Timestamp.fromDate(new Date(dateVal + 'T23:59:59'));
    const dateEl = document.getElementById('salesTodayDate'); 
    if (dateEl) dateEl.textContent = new Date(dateVal).toLocaleDateString('pt-BR');
    try { await Promise.all([ fetchActiveShifts(), fetchClosedShifts(startOfDay, endOfDay), fetchDailySales(startOfDay, endOfDay) ]); } catch (e) { console.error(e); }
}

async function fetchActiveShifts() {
    const container = document.getElementById('activeShiftsContainer'); if (!container) return;
    const q = query(getCollectionRef('shifts'), where('status', '==', 'open'));
    const snap = await getDocs(q); 
    if (snap.empty) { container.innerHTML = '<p class="text-gray-500 col-span-full text-center py-8 italic">Nenhum caixa aberto.</p>'; return; }
    container.innerHTML = snap.docs.map(doc => { 
        const s = doc.data(); 
        const openTime = s.openedAt?.toDate ? s.openedAt.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--'; 
        return `<div class="bg-gray-800 border border-green-500/50 rounded-xl p-5 shadow-lg relative flex flex-col"><div class="absolute top-3 right-3"><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-900 text-green-300 border border-green-700 animate-pulse">Ativo</span></div><div class="flex items-center mb-4"><div class="h-12 w-12 rounded-full bg-gray-700 flex items-center justify-center text-2xl mr-4 border border-gray-600"><i class="fas fa-user-circle text-green-400"></i></div><div><h5 class="text-white font-bold text-lg leading-tight">${s.userName || 'Operador'}</h5><p class="text-xs text-gray-400 mt-1">Aberto às ${openTime}</p></div></div><div class="bg-gray-900/50 rounded-lg p-3 mb-4 border border-gray-700"><div class="flex justify-between text-sm mb-1"><span class="text-gray-400">Fundo Inicial:</span><span class="text-white font-mono font-bold">${formatCurrency(s.initialBalance || 0)}</span></div></div><button onclick="window.handleForceCloseShift('${doc.id}', '${s.userId}')" class="w-full py-2 bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-700 rounded-lg text-sm font-bold transition flex items-center justify-center"><i class="fas fa-power-off mr-2"></i> Forçar Fechamento</button></div>`; 
    }).join('');
}

async function fetchClosedShifts(start, end) {
    const container = document.getElementById('closedShiftsContainer'); if (!container) return;
    const q = query(getCollectionRef('shifts'), where('status', '==', 'closed'), where('openedAt', '>=', start), where('openedAt', '<', end), orderBy('openedAt', 'desc'));
    const snap = await getDocs(q); 
    if (snap.empty) { container.innerHTML = '<p class="text-gray-500 text-center py-8 italic">Nenhum caixa fechado.</p>'; return; }
    container.innerHTML = snap.docs.map(doc => { 
        const s = doc.data(); 
        const diff = s.difference || 0; 
        const diffColor = diff < -0.5 ? 'text-red-400' : (diff > 0.5 ? 'text-blue-400' : 'text-green-500'); 
        const openTime = s.openedAt?.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); 
        const closeTime = s.closedAt?.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); 
        return `<div class="bg-gray-800 p-4 rounded-lg border border-gray-700 flex flex-col md:flex-row justify-between items-center gap-4 hover:bg-gray-750 transition"><div class="flex items-center w-full md:w-1/3"><div class="mr-4 text-gray-500 bg-gray-900 h-10 w-10 flex items-center justify-center rounded-full"><i class="fas fa-history"></i></div><div><h4 class="text-white font-bold text-base">${s.userName}</h4><p class="text-xs text-gray-400"><i class="far fa-clock mr-1"></i> ${openTime} - ${closeTime}</p>${s.justification ? `<p class="text-[10px] text-yellow-500 mt-1">Obs: ${s.justification}</p>` : ''}</div></div><div class="flex space-x-2 w-full md:w-2/3 justify-between md:justify-end items-center bg-gray-900/30 p-2 rounded-lg md:bg-transparent md:p-0"><div class="text-right px-2 md:px-4 border-r border-gray-700"><p class="text-[10px] text-gray-500 uppercase tracking-wider">Vendas</p><p class="text-white font-bold text-sm">${formatCurrency((s.reportSalesMoney || 0) + (s.reportSalesDigital || 0))}</p></div><div class="text-right px-2 md:px-4 border-r border-gray-700"><p class="text-[10px] text-gray-500 uppercase tracking-wider">Quebra</p><p class="${diffColor} font-bold text-sm">${formatCurrency(diff)}</p></div><button onclick="window.openShiftDetails('${doc.id}')" class="ml-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold flex items-center"><i class="fas fa-list mr-1"></i> Ver Vendas</button></div></div>`; 
    }).join('');
}

async function openShiftDetails(shiftId) {
    const modal = document.getElementById('shiftDetailsModal'); 
    const tableBody = document.getElementById('shiftSalesTableBody'); 
    const header = document.getElementById('shiftDetailsHeader');
    if (!modal || !tableBody) return; 
    modal.style.display = 'flex'; 
    tableBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500 italic">Carregando...</td></tr>';
    try { 
        const shiftSnap = await getDoc(doc(getCollectionRef('shifts'), shiftId)); 
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
            return `<tr class="hover:bg-gray-700 transition border-b border-gray-800 cursor-pointer" onclick="window.showOrderDetails('${docSnap.id}')"><td class="p-3 text-gray-300">${table.closedAt ? table.closedAt.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--'}</td><td class="p-3 font-bold text-white">Mesa ${table.tableNumber}${originBadge}</td><td class="p-3 text-gray-400 text-sm">${table.closedBy || 'Staff'}</td><td class="p-3 text-right text-green-400 font-bold">${formatCurrency(tableTotal)}</td></tr>`; 
        }).join('');
    } catch (e) { tableBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-400">Erro: ${e.message}</td></tr>`; }
}

async function fetchDailySales(start, end) {
    const q = query(getTablesCollectionRef(), where('status', '==', 'closed'), where('closedAt', '>=', start), where('closedAt', '<', end)); 
    const snapshot = await getDocs(q); 
    let totalSales = 0, totalMoney = 0, totalDigital = 0, count = 0; 
    const productStats = {}; const salesByHour = {}; const salesByWaiter = {}; const salesByOrigin = {};
    
    snapshot.forEach(docSnap => { 
        const table = docSnap.data(); 
        let tableTotal = 0; count++; 
        (table.payments || []).forEach(p => { const val = parseFloat(p.value.toString().replace(/[^\d,.-]/g,'').replace(',','.')); if (!isNaN(val)) { tableTotal += val; if (p.method.toLowerCase().includes('dinheiro')) totalMoney += val; else totalDigital += val; } }); 
        totalSales += tableTotal; 
        const origin = table.isPickup ? 'Retirada' : (table.sector || 'Salão');
        salesByOrigin[origin] = (salesByOrigin[origin] || 0) + tableTotal;
        if (table.sentItems) { table.sentItems.forEach(item => { const id = item.id; if (!productStats[id]) { productStats[id] = { name: item.name, qty: 0 }; } productStats[id].qty += 1; }); } 
        if (table.closedAt) { const hour = table.closedAt.toDate().getHours(); const hourKey = `${hour}h - ${hour+1}h`; salesByHour[hourKey] = (salesByHour[hourKey] || 0) + 1; } 
        const waiter = table.closedBy || 'Não Identificado'; salesByWaiter[waiter] = (salesByWaiter[waiter] || 0) + tableTotal; 
    });
    
    const elTotal = document.getElementById('reportTotalSales'); if(elTotal) elTotal.textContent = formatCurrency(totalSales); 
    const elMoney = document.getElementById('reportTotalMoney'); if(elMoney) elMoney.textContent = formatCurrency(totalMoney); 
    const elDig = document.getElementById('reportTotalDigital'); if(elDig) elDig.textContent = formatCurrency(totalDigital); 
    const elTk = document.getElementById('reportTicketMedio'); if(elTk) elTk.textContent = formatCurrency(count > 0 ? totalSales / count : 0);
    
    const topProducts = Object.values(productStats).sort((a, b) => b.qty - a.qty).slice(0, 10); 
    const topListEl = document.getElementById('topProductsList'); 
    if(topListEl) topListEl.innerHTML = topProducts.length ? topProducts.map((p, i) => `<div class="flex justify-between items-center text-sm border-b border-gray-700 pb-1 last:border-0"><span class="text-gray-300"><b class="text-pumpkin mr-2">#${i+1}</b> ${p.name}</span><span class="font-mono text-white font-bold">${p.qty}</span></div>`).join('') : '<p class="text-xs text-gray-500 italic">Sem dados.</p>';
    
    let peakHour = '--:--'; let peakCount = 0; Object.entries(salesByHour).forEach(([hour, count]) => { if(count > peakCount) { peakCount = count; peakHour = hour; } }); 
    const phEl = document.getElementById('peakHourDisplay'); if(phEl) phEl.textContent = peakHour; 
    const phVEl = document.getElementById('peakHourVolume'); if(phVEl) phVEl.textContent = `${peakCount} vendas`;
    
    const teamListEl = document.getElementById('teamPerformanceList'); 
    if (teamListEl) { const sortedTeam = Object.entries(salesByWaiter).sort(([,a], [,b]) => b - a); teamListEl.innerHTML = sortedTeam.length ? sortedTeam.map(([name, total], i) => `<div class="flex justify-between items-center text-sm border-b border-gray-700 pb-1 last:border-0"><span class="text-gray-300 truncate"><b class="text-blue-400 mr-2">${i+1}.</b> ${name}</span><span class="font-mono text-white font-bold text-xs">${formatCurrency(total)}</span></div>`).join('') : '<p class="text-xs text-gray-500 italic">Sem vendas.</p>'; }
}

async function fetchMonthlyPerformance() { 
    const now = new Date(); const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1); const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59); 
    try { 
        const goalSnap = await getDoc(getFinancialGoalsDocRef()); const meta = goalSnap.exists() ? (goalSnap.data().monthlyGoal || 0) : 0; 
        const q = query(getTablesCollectionRef(), where('status', '==', 'closed'), where('closedAt', '>=', Timestamp.fromDate(startOfMonth)), where('closedAt', '<=', Timestamp.fromDate(endOfMonth))); 
        const snapshot = await getDocs(q); let totalMonth = 0; 
        snapshot.forEach(doc => { (doc.data().payments || []).forEach(p => { const v = parseFloat(p.value.toString().replace(/[^\d,.-]/g,'').replace(',','.')); if (!isNaN(v)) totalMonth += v; }); }); 
        const percent = meta > 0 ? Math.min(100, (totalMonth / meta) * 100) : 0; const missing = Math.max(0, meta - totalMonth); const projection = now.getDate() > 0 ? (totalMonth / now.getDate()) * endOfMonth.getDate() : 0; 
        const elSold = document.getElementById('monthSoldDisplay'); if(elSold) elSold.textContent = formatCurrency(totalMonth); 
        const elGoal = document.getElementById('monthGoalDisplay'); if(elGoal) elGoal.textContent = formatCurrency(meta); 
        const elMiss = document.getElementById('monthMissing'); if(elMiss) elMiss.textContent = formatCurrency(missing); 
        const elProj = document.getElementById('monthProjection'); if(elProj) elProj.textContent = formatCurrency(projection); 
        const elProg = document.getElementById('monthProgressBar'); if(elProg) elProg.style.width = `${percent}%`; 
    } catch (e) { console.error(e); } 
}

async function openReportPanel(tab = 'active-shifts') {
    const modal = document.getElementById('reportsModal');
    if(modal) modal.style.display = 'flex';
    loadReports();
}

async function handleForceCloseShift(shiftId, shiftUserId) {
    if (!confirm("ATENÇÃO: Deseja forçar o fechamento deste caixa?")) return;
    try {
        const shiftRef = doc(getCollectionRef('shifts'), shiftId);
        await updateDoc(shiftRef, { status: 'closed', closedAt: serverTimestamp(), justification: "Fechamento Forçado Gerente", finalCashInDrawer: 0, difference: 0 });
        showToast("Caixa encerrado.", false); loadReports();
    } catch (e) { showToast("Erro: " + e.message, true); }
}

async function handleCloseDay() { 
    if (confirm("Encerrar Turno?")) { 
        try { await setDoc(doc(getCollectionRef('daily_reports'), `daily_${new Date().toISOString().split('T')[0]}`), { closedAt: serverTimestamp() }); showToast("Turno Encerrado!", false); loadReports(); } 
        catch (e) { showToast(e.message, true); } 
    } 
}

async function exportSalesToCSV() { 
    if (!reportDateInput) return; 
    const dateVal = reportDateInput.value; 
    if(!dateVal) { showToast("Selecione data.", true); return; } 
    const start = Timestamp.fromDate(new Date(dateVal + 'T00:00:00')); 
    const end = Timestamp.fromDate(new Date(dateVal + 'T23:59:59')); 
    const q = query(getTablesCollectionRef(), where('status', '==', 'closed'), where('closedAt', '>=', start), where('closedAt', '<=', end)); 
    const snapshot = await getDocs(q); 
    if (snapshot.empty) { showToast("Sem dados.", true); return; } 
    let csv = "Data,Mesa,Garcom,Total\r\n"; 
    snapshot.forEach(doc => { const t = doc.data(); csv += `${t.closedAt?.toDate().toLocaleString() || ''},${t.tableNumber},${t.closedBy || 'N/A'},${t.total}\r\n`; }); 
    const link = document.createElement("a"); 
    link.setAttribute("href", encodeURI("data:text/csv;charset=utf-8," + csv)); 
    link.setAttribute("download", `vendas_${dateVal}.csv`); 
    document.body.appendChild(link); link.click(); document.body.removeChild(link); 
}

async function setMonthlyGoal() { 
    const newVal = prompt("Defina a Meta de Vendas (R$):"); 
    if (newVal) { 
        const numVal = parseFloat(newVal.replace('.','').replace(',','.')); 
        if (!isNaN(numVal)) { await setDoc(getFinancialGoalsDocRef(), { monthlyGoal: numVal }, { merge: true }); fetchMonthlyPerformance(); } 
    } 
}

async function runDateComparison() { 
    const dateA = document.getElementById('compDateA').value; 
    const dateB = document.getElementById('compDateB').value; 
    if (!dateA || !dateB) { showToast("Selecione datas.", true); return; } 
    const getDayTotal = async (dateStr) => { const start = Timestamp.fromDate(new Date(dateStr + 'T00:00:00')); const end = Timestamp.fromDate(new Date(dateStr + 'T23:59:59')); const q = query(getTablesCollectionRef(), where('status', '==', 'closed'), where('closedAt', '>=', start), where('closedAt', '<=', end)); const snapshot = await getDocs(q); let total = 0; snapshot.forEach(d => { (d.data().payments || []).forEach(p => { const v = parseFloat(p.value.toString().replace(/[^\d,.-]/g,'').replace(',','.')); if(!isNaN(v)) total += v; }); }); return total; }; 
    const [totalA, totalB] = await Promise.all([getDayTotal(dateA), getDayTotal(dateB)]); 
    document.getElementById('compValueA').textContent = formatCurrency(totalA); 
    document.getElementById('compValueB').textContent = formatCurrency(totalB); 
    const diff = totalA > 0 ? ((totalB - totalA) / totalA) * 100 : (totalB > 0 ? 100 : 0); 
    const el = document.getElementById('compDiffValue'); 
    el.textContent = `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`; 
    el.className = `text-xl font-extrabold ${diff >= 0 ? 'text-green-400' : 'text-red-400'}`; 
    document.getElementById('comparisonResult').classList.remove('hidden'); 
}

// --- ESTOQUE / XML / MANUAL ---
async function handleImportXML(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(e.target.result, "text/xml");
            const emitente = xmlDoc.getElementsByTagName("xNome")[0]?.textContent || "Fornecedor";
            const nNF = xmlDoc.getElementsByTagName("nNF")[0]?.textContent || "???";
            const dets = xmlDoc.getElementsByTagName("det");
            inventoryChecklist = [];
            const productsCache = getProducts();
            for (let i = 0; i < dets.length; i++) {
                const prod = dets[i].getElementsByTagName("prod")[0];
                const xProd = prod.getElementsByTagName("xProd")[0].textContent;
                const qCom = parseFloat(prod.getElementsByTagName("qCom")[0].textContent);
                const vUnCom = parseFloat(prod.getElementsByTagName("vUnCom")[0].textContent);
                const match = productsCache.find(p => p.name.toLowerCase().includes(xProd.toLowerCase().substring(0, 10))) || { id: null, name: 'NÃO VINCULADO' };
                inventoryChecklist.push({ rawName: xProd, qty: qCom, cost: vUnCom, systemId: match.id, systemName: match.name, checked: true });
            }
            renderChecklistUI(emitente, nNF);
        } catch (err) { console.error(err); showToast("Erro ao ler XML.", true); }
    };
    reader.readAsText(file);
}

function renderChecklistUI(emitente, nNF) {
    const contentDiv = document.getElementById('hubContent');
    const toolbarDiv = document.getElementById('productActionsToolbar');
    if (toolbarDiv) toolbarDiv.innerHTML = `<h4 class="text-white font-bold">Conferência NF ${nNF} - ${emitente}</h4>`;
    contentDiv.innerHTML = `
        <div class="bg-gray-900 p-4 rounded-lg border border-gray-700 mb-4">
            <p class="text-sm text-gray-300 mb-4">Verifique os itens abaixo:</p>
            <div class="space-y-2">
                ${inventoryChecklist.map((item, idx) => `
                    <div class="flex items-center bg-gray-800 p-3 rounded border ${item.systemId ? 'border-gray-600' : 'border-red-500/50'}">
                        <input type="checkbox" class="w-5 h-5 mr-3 text-green-600 rounded bg-gray-700 border-gray-500" checked onchange="window.toggleCheckItem(${idx})">
                        <div class="flex-grow min-w-0"><p class="text-white font-bold truncate">${item.rawName}</p><p class="text-xs ${item.systemId ? 'text-green-400' : 'text-red-400'}">${item.systemId ? `Vinculado: ${item.systemName}` : 'PRODUTO NÃO ENCONTRADO'}</p></div>
                        <div class="text-right min-w-[80px]"><p class="text-xs text-gray-500">Qtd</p><span class="text-white font-mono font-bold text-lg">${item.qty}</span></div>
                    </div>`).join('')}
            </div>
            <div class="mt-6 flex justify-end space-x-3"><button onclick="window.switchHubTab('inventory')" class="px-4 py-3 bg-gray-700 text-white rounded-lg font-bold">Cancelar</button><button id="btnConfirmEntry" onclick="window.confirmStockEntry('${nNF}', '${emitente}')" class="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow-lg">Confirmar Entrada</button></div>
        </div>`;
}

function toggleCheckItem(idx) { inventoryChecklist[idx].checked = !inventoryChecklist[idx].checked; }

async function confirmStockEntry(nNF, emitente) {
    const itemsToProcess = inventoryChecklist.filter(i => i.checked && i.systemId);
    if (itemsToProcess.length === 0) { showToast("Nenhum item válido.", true); return; }
    const btn = document.getElementById('btnConfirmEntry');
    toggleLoading(btn, true, 'Processando...');
    const batch = writeBatch(db);
    let totalCost = 0;
    try {
        itemsToProcess.forEach(item => {
            const stockRef = doc(getCollectionRef('stock'), item.systemId.toString());
            batch.set(stockRef, { quantity: increment(item.qty), lastUpdate: serverTimestamp(), name: item.systemName }, { merge: true });
            totalCost += (item.qty * item.cost);
        });
        const movementRef = doc(getCollectionRef('inventory_movements'));
        batch.set(movementRef, { type: 'in', source: `NF ${nNF} - ${emitente}`, date: serverTimestamp(), items: itemsToProcess, totalCost: totalCost });
        await batch.commit();
        showToast(`Estoque atualizado!`, false);
        switchHubTab('inventory');
    } catch (e) { console.error(e); showToast("Erro ao atualizar estoque.", true); } finally { toggleLoading(btn, false); }
}

async function openManualStockEntry() {
    const contentDiv = document.getElementById('hubContent');
    const products = getProducts(); 
    const productOptions = products.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    contentDiv.innerHTML = `
        <div class="bg-gray-900 p-6 rounded-xl border border-gray-700 max-w-2xl mx-auto mt-4">
            <h4 class="text-xl font-bold text-white mb-6 flex items-center"><i class="fas fa-box-open text-blue-500 mr-3"></i> Entrada Manual de Estoque</h4>
            <div class="space-y-4">
                <div><label class="block text-sm text-gray-400 mb-1">Produto</label><select id="manualStockProduct" class="input-pdv w-full p-3 bg-dark-input border border-gray-600 rounded text-white"><option value="">-- Selecione o Produto --</option>${productOptions}</select></div>
                <div class="grid grid-cols-2 gap-4"><div><label class="block text-sm text-gray-400 mb-1">Quantidade</label><input type="number" id="manualStockQty" class="input-pdv w-full p-3" placeholder="0"></div><div><label class="block text-sm text-gray-400 mb-1">Custo Unitário (R$)</label><input type="number" id="manualStockCost" class="input-pdv w-full p-3" placeholder="0.00" step="0.01"></div></div>
                <div><label class="block text-sm text-gray-400 mb-1">Motivo / Observação</label><input type="text" id="manualStockNote" class="input-pdv w-full p-3" placeholder="Ex: Compra no mercado local, Ajuste..."></div>
            </div>
            <div class="flex justify-end space-x-3 mt-8"><button onclick="window.switchHubTab('inventory')" class="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition">Cancelar</button><button id="btnSaveManualStock" onclick="window.saveManualStockEntry()" class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-lg transition">Confirmar Entrada</button></div>
        </div>`;
}

async function saveManualStockEntry() {
    const prodId = document.getElementById('manualStockProduct').value;
    const qty = parseFloat(document.getElementById('manualStockQty').value);
    const cost = parseFloat(document.getElementById('manualStockCost').value) || 0;
    const note = document.getElementById('manualStockNote').value.trim() || 'Entrada Manual';
    const btn = document.getElementById('btnSaveManualStock');
    if(!prodId || !qty || qty === 0) { showToast("Selecione produto e quantidade.", true); return; }
    const product = getProducts().find(p => p.id == prodId);
    toggleLoading(btn, true, 'Salvando...');
    const batch = writeBatch(db);
    try {
        const stockRef = doc(getCollectionRef('stock'), prodId.toString());
        batch.set(stockRef, { quantity: increment(qty), lastUpdate: serverTimestamp(), name: product.name }, { merge: true });
        const movementRef = doc(getCollectionRef('inventory_movements'));
        batch.set(movementRef, { type: 'manual_in', source: note, date: serverTimestamp(), items: [{ systemId: prodId, systemName: product.name, qty: qty, cost: cost }], totalCost: qty * cost, registeredBy: 'Gerente' });
        await batch.commit();
        showToast("Estoque atualizado!", false);
        switchHubTab('inventory');
    } catch(e) { console.error(e); showToast("Erro ao salvar.", true); } finally { toggleLoading(btn, false); }
}

// --- PRODUTOS (ACTIONS) ---
async function handleDeleteProduct(id, callback) { 
    if(confirm("Excluir produto?")) { 
        try { 
            await deleteWooProduct(id); 
            showToast("Excluído.", false); 
            if(callback) callback(); 
        } catch(e) { showToast(e.message, true); } 
    } 
}

async function deleteSector(id) { 
    if(confirm("Excluir setor?")) { 
        await deleteDoc(doc(getSectorsCollectionRef(), id)); 
        renderSectorManagementModal(); 
    } 
}

const updateCompListUI = () => {
    const list = document.getElementById('compositionList');
    if (!list) return;
    const sourceList = ingredientsCache.length > 0 ? ingredientsCache : [];
    if (sourceList.length === 0) {
        list.innerHTML = '<p class="text-xs text-yellow-500 p-2">Nenhum insumo cadastrado. Vá na aba "Insumos".</p>';
        return;
    }
    list.innerHTML = currentComposition.map((item, idx) => `
        <div class="flex space-x-2 mb-2 items-center bg-dark-input p-2 rounded border border-gray-700">
            <select onchange="window.updateCompItem(${idx}, 'id', this.value)" class="bg-gray-700 text-white text-xs p-2 rounded flex-grow border-0">
                <option value="">Selecione...</option>
                ${sourceList.map(ing => `<option value="${ing.id}" ${ing.id == item.id ? 'selected' : ''}>${ing.name} (${ing.unit})</option>`).join('')}
            </select>
            <input type="number" value="${item.qty}" onchange="window.updateCompItem(${idx}, 'qty', this.value)" class="bg-gray-700 text-white w-20 p-2 rounded text-center text-xs" placeholder="Qtd">
            <button type="button" onclick="window.removeCompItem(${idx})" class="text-red-400 hover:text-red-200 px-2"><i class="fas fa-times"></i></button>
        </div>
    `).join('');
};

function addCompItem() { currentComposition.push({ id: '', qty: 1 }); updateCompListUI(); }
function removeCompItem(idx) { currentComposition.splice(idx, 1); updateCompListUI(); }
function updateCompItem(idx, field, val) { currentComposition[idx][field] = field === 'qty' ? parseFloat(val) : val; }

async function saveIngredient() {
    const id = document.getElementById('ingId').value;
    const name = document.getElementById('ingName').value;
    const unit = document.getElementById('ingUnit').value;
    const cost = parseFloat(document.getElementById('ingCost').value) || 0;
    const stock = parseFloat(document.getElementById('ingStock').value) || 0;
    const minStock = parseFloat(document.getElementById('ingMinStock').value) || 0;
    const type = document.getElementById('ingType').value;

    if (!name) return showToast("Nome obrigatório.", true);

    const data = { name, unit, cost, stock, minStock, type, updatedAt: serverTimestamp() };
    try {
        if (id) await updateDoc(doc(getCollectionRef('ingredients'), id), data);
        else await addDoc(getCollectionRef('ingredients'), data);
        showToast("Insumo salvo!");
        document.getElementById('ingredientFormModal').style.display = 'none';
        switchHubTab('ingredients');
    } catch (e) { console.error(e); showToast("Erro ao salvar insumo.", true); }
}

async function deleteIngredient(id) {
    if (confirm("Excluir insumo?")) {
        try { await deleteDoc(doc(getCollectionRef('ingredients'), id)); showToast("Excluído."); switchHubTab('ingredients'); } 
        catch (e) { showToast("Erro.", true); }
    }
}

async function saveSupplier() {
    const id = document.getElementById('supId').value;
    const name = document.getElementById('supName').value;
    const phone = document.getElementById('supPhone').value;
    const docNum = document.getElementById('supDoc').value;
    const category = document.getElementById('supCategory').value;

    if (!name) return showToast("Nome obrigatório.", true);

    const data = { name, phone, document: docNum, category, updatedAt: serverTimestamp() };
    try {
        if (id) await updateDoc(doc(getCollectionRef('suppliers'), id), data);
        else await addDoc(getCollectionRef('suppliers'), data);
        showToast("Fornecedor salvo!");
        document.getElementById('supplierFormModal').style.display = 'none';
        switchHubTab('suppliers');
    } catch (e) { console.error(e); showToast("Erro ao salvar.", true); }
}

async function deleteSupplier(id) {
    if (confirm("Excluir fornecedor?")) {
        try { await deleteDoc(doc(getCollectionRef('suppliers'), id)); showToast("Excluído."); switchHubTab('suppliers'); } 
        catch (e) { showToast("Erro.", true); }
    }
}

// --- CADASTROS AUXILIARES (SETORES, TIPOS, CATEGORIAS) ---
async function renderSectorManagementModal() {
    if (!managerModal) return;
    
    managerModal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 w-full max-w-2xl p-6 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-white">Cadastros Auxiliares</h3>
                <button class="text-gray-400 hover:text-white text-2xl leading-none" onclick="document.getElementById('managerModal').style.display='none'">&times;</button>
            </div>
            
            <div class="flex space-x-2 mb-4 border-b border-gray-700 pb-2 overflow-x-auto">
                <button class="aux-tab-btn px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold whitespace-nowrap" onclick="window.switchAuxTab('sectors')">Setores (Mesas)</button>
                <button class="aux-tab-btn px-4 py-2 rounded-lg bg-dark-input text-gray-300 text-sm font-bold hover:bg-gray-700 whitespace-nowrap" onclick="window.switchAuxTab('ingredient_types')">Tipos de Insumo</button>
                <button class="aux-tab-btn px-4 py-2 rounded-lg bg-dark-input text-gray-300 text-sm font-bold hover:bg-gray-700 whitespace-nowrap" onclick="window.switchAuxTab('supplier_categories')">Cat. Fornecedor</button>
            </div>

            <div id="auxContent" class="flex-grow overflow-y-auto custom-scrollbar mb-4">
                <div class="text-center text-gray-500 py-4"><i class="fas fa-spinner fa-spin"></i></div>
            </div>

            <form id="auxForm" class="flex gap-2 mt-auto pt-4 border-t border-gray-700">
                <input type="hidden" id="auxType" value="sectors">
                <input type="text" id="auxName" placeholder="Novo item..." class="input-pdv flex-grow p-2 text-sm" required>
                <select id="auxExtra" class="input-pdv p-2 text-sm hidden">
                    <option value="production">Produção (KDS)</option>
                    <option value="service">Serviço (Salão)</option>
                </select>
                <button type="submit" class="bg-green-600 hover:bg-green-700 text-white px-4 rounded-lg font-bold"><i class="fas fa-plus"></i></button>
            </form>
        </div>
    `;
    
    managerModal.style.display = 'flex';
    await switchAuxTab('sectors');

    const form = document.getElementById('auxForm');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const type = document.getElementById('auxType').value;
            const name = document.getElementById('auxName').value;
            const extra = document.getElementById('auxExtra').value;
            
            const data = { name };
            if (type === 'sectors') data.type = extra; 

            await saveAuxiliary(type, data);
            document.getElementById('auxName').value = '';
            switchAuxTab(type);
        };
    }
}

async function switchAuxTab(type) {
    const content = document.getElementById('auxContent');
    const typeInput = document.getElementById('auxType');
    const extraInput = document.getElementById('auxExtra');
    
    if (!content) return;
    typeInput.value = type;
    
    document.querySelectorAll('.aux-tab-btn').forEach(btn => {
        const txt = btn.textContent.toLowerCase();
        const match = (type === 'sectors' && txt.includes('setores')) || 
                      (type === 'ingredient_types' && txt.includes('insumo')) || 
                      (type === 'supplier_categories' && txt.includes('fornecedor'));
        
        if(match) {
            btn.classList.add('bg-indigo-600', 'text-white'); btn.classList.remove('bg-dark-input', 'text-gray-300');
        } else {
            btn.classList.remove('bg-indigo-600', 'text-white'); btn.classList.add('bg-dark-input', 'text-gray-300');
        }
    });

    if (type === 'sectors') extraInput.classList.remove('hidden'); else extraInput.classList.add('hidden');

    try {
        let colRef = type === 'sectors' ? getSectorsCollectionRef() : getCollectionRef(type);
        const snap = await getDocs(query(colRef, orderBy('name')));
        
        if (snap.empty) {
            content.innerHTML = '<p class="text-gray-500 italic text-center p-4">Nenhum item cadastrado.</p>';
            return;
        }

        content.innerHTML = snap.docs.map(d => {
            const item = d.data();
            let extraInfo = '';
            if (type === 'sectors') {
                extraInfo = item.type === 'production' ? '<span class="ml-2 text-[10px] bg-orange-900 text-orange-300 px-1 rounded">Cozinha</span>' : '<span class="ml-2 text-[10px] bg-blue-900 text-blue-300 px-1 rounded">Salão</span>';
            }
            return `
                <div class="flex justify-between items-center bg-dark-bg p-3 rounded border border-gray-700 mb-2">
                    <span class="text-white font-bold flex items-center">${item.name} ${extraInfo}</span>
                    <button onclick="window.deleteAuxiliary('${type}', '${d.id}')" class="text-red-400 hover:text-red-300 p-2"><i class="fas fa-trash"></i></button>
                </div>`;
        }).join('');

    } catch (e) {
        console.error(e);
        content.innerHTML = '<p class="text-red-400 p-4">Erro ao carregar dados.</p>';
    }
}

async function saveAuxiliary(collectionName, data) {
    try {
        let colRef = collectionName === 'sectors' ? getSectorsCollectionRef() : getCollectionRef(collectionName);
        await addDoc(colRef, data);
        showToast("Salvo com sucesso!");
    } catch (e) {
        console.error(e);
        showToast("Erro ao salvar.", true);
    }
}

async function deleteAuxiliary(collectionName, id) {
    if (!confirm("Tem certeza?")) return;
    try {
        let colRef = collectionName === 'sectors' ? getSectorsCollectionRef() : getCollectionRef(collectionName);
        await deleteDoc(doc(colRef, id));
        switchAuxTab(collectionName);
        showToast("Excluído.");
    } catch (e) {
        showToast("Erro ao excluir.", true);
    }
}

// --- RH & FOLHA DE PAGAMENTO ---
async function renderHRPanel(activeTab = 'team') {
    if (!managerModal) return;
    managerModal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 w-full max-w-6xl h-[90vh] flex flex-col rounded-xl shadow-2xl overflow-hidden">
            <div class="flex justify-between items-center p-6 border-b border-gray-700 bg-gray-800">
                <div><h3 class="text-2xl font-bold text-pink-400"><i class="fas fa-users mr-2"></i>Recursos Humanos</h3><p class="text-sm text-gray-400">Gestão Completa de Equipe</p></div>
                <button class="text-gray-400 hover:text-white text-3xl leading-none" onclick="document.getElementById('managerModal').style.display='none'">&times;</button>
            </div>
            <div class="flex p-4 bg-dark-bg border-b border-gray-700 space-x-2 items-center overflow-x-auto">
                <button class="hr-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition" onclick="window.switchHRTab('team')"><i class="fas fa-user-cog mr-2"></i> Equipe</button>
                <button class="hr-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition" onclick="window.switchHRTab('payroll')"><i class="fas fa-file-invoice-dollar mr-2"></i> Folha & Encargos</button>
                <button class="hr-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition bg-orange-700 text-white" onclick="window.renderExternalRecruitmentModal('extra')"><i class="fas fa-bullhorn mr-2"></i> Chamar Extra</button>
            </div>
            <div id="hrContent" class="flex-grow overflow-y-auto p-6 bg-dark-bg custom-scrollbar"><div class="flex justify-center py-10"><i class="fas fa-spinner fa-spin text-pink-500 text-3xl"></i></div></div>
        </div>`;
    managerModal.style.display = 'flex';
    await switchHRTab(activeTab);
}

async function switchHRTab(tab) {
    const content = document.getElementById('hrContent');
    if (!content) return;
    document.querySelectorAll('.hr-tab-btn').forEach(btn => {
        if (!btn.textContent.includes('Chamar Extra')) {
            if (btn.onclick.toString().includes(tab)) btn.className = "hr-tab-btn px-4 py-2 rounded-lg bg-pink-600 text-white font-bold transition";
            else btn.className = "hr-tab-btn px-4 py-2 rounded-lg bg-dark-input text-gray-300 hover:bg-gray-700 transition";
        }
    });

    if (tab === 'team') {
        const usersSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
        let html = `<div class="grid grid-cols-1 md:grid-cols-3 gap-4">`;
        usersSnap.forEach(u => {
            const data = u.data();
            html += `<div class="bg-gray-800 p-4 rounded border border-gray-700 relative group"><div class="flex items-center space-x-3"><div class="w-10 h-10 rounded-full bg-pink-900/50 flex items-center justify-center text-pink-400 font-bold">${data.name.charAt(0)}</div><div><h4 class="font-bold text-white">${data.name}</h4><p class="text-xs text-gray-400 uppercase">${data.role}</p></div></div><div class="mt-3 pt-3 border-t border-gray-700 flex justify-between text-xs text-gray-400"><span>${data.email}</span><span class="${data.isActive ? 'text-green-400' : 'text-red-400'}">${data.isActive ? 'Ativo' : 'Inativo'}</span></div></div>`;
        });
        html += `</div><div class="mt-6 text-center"><button onclick="window.openUserManagementModal()" class="bg-green-600 text-white px-6 py-3 rounded-lg font-bold shadow-lg hover:bg-green-700 transition"><i class="fas fa-user-plus mr-2"></i> Gerenciar Cadastros</button></div>`;
        content.innerHTML = html;
    } else if (tab === 'payroll') {
        await renderPayrollGenerator(content);
    }
}

async function renderPayrollGenerator(container) {
    const usersSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
    const usersOptions = usersSnap.docs.map(d => `<option value="${d.id}" data-name="${d.data().name}">${d.data().name || d.id}</option>`).join('');
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

    container.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
            <div class="bg-gray-800 p-5 rounded-xl border border-gray-700 h-fit overflow-y-auto max-h-full custom-scrollbar">
                <h4 class="text-white font-bold mb-4 border-b border-gray-600 pb-2">Configurar Folha</h4>
                <div class="space-y-3">
                    <div><label class="text-xs text-gray-400 font-bold">Colaborador</label><select id="payUser" class="input-pdv w-full p-2">${usersOptions}</select></div>
                    <div class="grid grid-cols-2 gap-2"><div><label class="text-xs text-gray-400">Início</label><input type="date" id="payStart" class="input-pdv w-full p-2" value="${firstDay}"></div><div><label class="text-xs text-gray-400">Fim</label><input type="date" id="payEnd" class="input-pdv w-full p-2" value="${lastDay}"></div></div>
                    <div class="bg-gray-900/50 p-2 rounded border border-gray-600"><p class="text-xs text-green-400 font-bold mb-2 uppercase">Proventos Básicos</p><div class="grid grid-cols-2 gap-2 mb-2"><div><label class="text-[10px] text-gray-400">Salário Base</label><input type="number" id="payBase" class="input-pdv w-full p-1 text-sm" value="1412.00"></div><div><label class="text-[10px] text-gray-400">Comissão (%)</label><input type="number" id="payCommPct" class="input-pdv w-full p-1 text-sm" value="10"></div></div></div>
                    <div class="bg-gray-900/50 p-2 rounded border border-gray-600"><p class="text-xs text-yellow-400 font-bold mb-2 uppercase">Adicionais & Férias</p><div class="mb-2"><label class="text-[10px] text-gray-400">Horas Noturnas (22h-05h)</label><input type="number" id="payNightHours" class="input-pdv w-full p-1 text-sm" placeholder="Qtd Horas"></div><div class="flex items-center justify-between mb-1"><label class="text-xs text-gray-300"><input type="checkbox" id="pay13th" class="mr-1"> Pagar 13º (Parcela)</label><label class="text-xs text-gray-300"><input type="checkbox" id="payVacation" class="mr-1"> Pagar Férias</label></div></div>
                    <div class="bg-gray-900/50 p-2 rounded border border-gray-600"><p class="text-xs text-red-400 font-bold mb-2 uppercase">Descontos</p><div class="grid grid-cols-2 gap-2 mb-2"><div><label class="text-[10px] text-gray-400">Vales/Adiant.</label><input type="number" id="payAdvance" class="input-pdv w-full p-1 text-sm" value="0.00"></div><div><label class="text-[10px] text-gray-400">Dependentes (IR)</label><input type="number" id="payDependents" class="input-pdv w-full p-1 text-sm" value="0"></div></div><label class="flex items-center text-xs text-gray-300"><input type="checkbox" id="payVT" class="mr-1" checked> Descontar VT (6%)</label></div>
                    <button onclick="window.generatePayslip()" class="w-full bg-pink-600 hover:bg-pink-700 text-white font-bold py-3 rounded-lg mt-2 shadow-lg">Calcular Holerite</button>
                </div>
            </div>
            <div class="lg:col-span-2 bg-white text-black p-8 rounded-xl shadow-2xl overflow-y-auto custom-scrollbar" id="payslipPreview"><div class="text-center text-gray-400 py-20 italic"><i class="fas fa-calculator text-4xl mb-4"></i><br>Configure os dados e clique em Calcular.</div></div>
        </div>`;
}

async function generatePayslip() {
    const userName = document.getElementById('payUser').options[document.getElementById('payUser').selectedIndex].text;
    const userId = document.getElementById('payUser').value;
    const start = document.getElementById('payStart').value;
    const end = document.getElementById('payEnd').value;
    
    const salaryBase = parseFloat(document.getElementById('payBase').value) || 0;
    const commPct = parseFloat(document.getElementById('payCommPct').value) || 0;
    const nightHours = parseFloat(document.getElementById('payNightHours').value) || 0;
    const advances = parseFloat(document.getElementById('payAdvance').value) || 0;
    const dependents = parseInt(document.getElementById('payDependents').value) || 0;
    const pay13th = document.getElementById('pay13th').checked;
    const payVacation = document.getElementById('payVacation').checked;
    const deductVT = document.getElementById('payVT').checked;

    const startDate = Timestamp.fromDate(new Date(start + 'T00:00:00'));
    const endDate = Timestamp.fromDate(new Date(end + 'T23:59:59'));
    const q = query(getTablesCollectionRef(), where('status', '==', 'closed'), where('closedAt', '>=', startDate), where('closedAt', '<=', endDate));
    const snap = await getDocs(q);
    let totalSales = 0;
    snap.forEach(doc => { const t = doc.data(); if ((t.waiterId && t.waiterId === userId) || (t.closedBy && t.closedBy.includes(userName.split(' ')[0]))) totalSales += (t.total || 0); });

    const commissionVal = totalSales * (commPct / 100);
    const hourlyRate = salaryBase / 220;
    const nightShiftVal = (hourlyRate * 0.20) * nightHours;
    const vacationVal = payVacation ? (salaryBase + (salaryBase / 3)) : 0;
    const thirteenthVal = pay13th ? (salaryBase / 12) : 0;
    const grossSalary = salaryBase + commissionVal + nightShiftVal + vacationVal + thirteenthVal;
    const vtVal = deductVT ? Math.min(grossSalary * 0.06, salaryBase * 0.06) : 0; 
    const inssVal = calculateINSS(grossSalary);
    const irrfVal = calculateIRRF(grossSalary - inssVal, dependents);
    const totalDiscounts = vtVal + inssVal + irrfVal + advances;
    const netSalary = grossSalary - totalDiscounts;
    const fgtsVal = grossSalary * 0.08;
    const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const preview = document.getElementById('payslipPreview');
    preview.innerHTML = `
        <div class="border border-gray-800 p-8 max-w-3xl mx-auto bg-white text-black font-mono text-sm shadow-lg relative">
            <div class="absolute top-4 right-4 text-xs text-gray-500">Ref: ${start.split('-')[1]}/${start.split('-')[0]}</div>
            <div class="text-center border-b-2 border-gray-800 pb-4 mb-6"><h2 class="text-2xl font-bold uppercase tracking-widest">Demonstrativo de Pagamento</h2><p class="text-xs mt-1">Fator PDV System • Recibo Mensal</p></div>
            <div class="flex justify-between mb-6 bg-gray-100 p-3 rounded"><div><p><strong>Funcionário:</strong> ${userName}</p><p><strong>CBO/Função:</strong> Operacional</p></div><div class="text-right"><p><strong>Admissão:</strong> --/--/----</p><p><strong>Competência:</strong> ${new Date(start).toLocaleDateString('pt-BR', {month:'long'})}</p></div></div>
            <table class="w-full mb-6 border-collapse"><thead><tr class="border-b-2 border-black text-xs uppercase"><th class="text-left py-2 pl-2">Descrição</th><th class="text-center py-2">Referência</th><th class="text-right py-2">Vencimentos</th><th class="text-right py-2 pr-2">Descontos</th></tr></thead><tbody>
                <tr><td class="pl-2 py-1">Salário Base</td><td class="text-center">30d</td><td class="text-right text-green-800">${fmt(salaryBase)}</td><td class="text-right pr-2">-</td></tr>
                ${commissionVal > 0 ? `<tr><td class="pl-2 py-1">Comissões / Gorjetas</td><td class="text-center">${commPct}%</td><td class="text-right text-green-800">${fmt(commissionVal)}</td><td class="text-right pr-2">-</td></tr>` : ''}
                ${nightShiftVal > 0 ? `<tr><td class="pl-2 py-1">Adicional Noturno</td><td class="text-center">${nightHours}h</td><td class="text-right text-green-800">${fmt(nightShiftVal)}</td><td class="text-right pr-2">-</td></tr>` : ''}
                ${vacationVal > 0 ? `<tr><td class="pl-2 py-1">Férias + 1/3</td><td class="text-center">-</td><td class="text-right text-green-800">${fmt(vacationVal)}</td><td class="text-right pr-2">-</td></tr>` : ''}
                ${thirteenthVal > 0 ? `<tr><td class="pl-2 py-1">13º Salário (Adiant.)</td><td class="text-center">1/12</td><td class="text-right text-green-800">${fmt(thirteenthVal)}</td><td class="text-right pr-2">-</td></tr>` : ''}
                <tr><td class="pl-2 py-1 text-gray-600">INSS</td><td class="text-center text-gray-500">Tab.</td><td class="text-right">-</td><td class="text-right text-red-800 pr-2">${fmt(inssVal)}</td></tr>
                ${irrfVal > 0 ? `<tr><td class="pl-2 py-1 text-gray-600">IRRF</td><td class="text-center text-gray-500">Tab.</td><td class="text-right">-</td><td class="text-right text-red-800 pr-2">${fmt(irrfVal)}</td></tr>` : ''}
                ${vtVal > 0 ? `<tr><td class="pl-2 py-1 text-gray-600">Vale Transporte</td><td class="text-center text-gray-500">6%</td><td class="text-right">-</td><td class="text-right text-red-800 pr-2">${fmt(vtVal)}</td></tr>` : ''}
                ${advances > 0 ? `<tr><td class="pl-2 py-1 text-gray-600">Vales / Adiantamentos</td><td class="text-center text-gray-500">-</td><td class="text-right">-</td><td class="text-right text-red-800 pr-2">${fmt(advances)}</td></tr>` : ''}
            </tbody><tfoot class="border-t-2 border-black font-bold bg-gray-100"><tr><td class="pl-2 py-2">TOTAIS</td><td></td><td class="text-right py-2 text-green-900">${fmt(grossSalary)}</td><td class="text-right py-2 pr-2 text-red-900">${fmt(totalDiscounts)}</td></tr></tfoot></table>
            <div class="flex justify-between items-center mb-6 gap-4"><div class="bg-blue-50 p-3 rounded border border-blue-200 w-1/2 text-xs text-blue-800"><p><strong>FGTS do Mês:</strong> ${fmt(fgtsVal)}</p><p><strong>Base de Cálculo:</strong> ${fmt(grossSalary)}</p></div><div class="bg-gray-800 text-white p-4 rounded w-1/2 flex justify-between items-center"><span class="text-sm uppercase">Líquido a Receber</span><span class="text-xl font-bold">${fmt(netSalary)}</span></div></div>
            <div class="mt-12 border-t border-black pt-2 text-center text-xs text-gray-600"><p class="mb-8">Declaro ter recebido a importância líquida discriminada neste recibo.</p><div class="w-64 mx-auto border-t border-black pt-1 text-black font-bold">Assinatura do Funcionário</div></div>
        </div>
        <div class="mt-6 text-center print:hidden"><button onclick="window.print()" class="bg-gray-700 text-white px-6 py-3 rounded-lg hover:bg-gray-900 font-bold shadow transition"><i class="fas fa-print mr-2"></i> Imprimir</button></div>`;
}

// --- BANCO DE TALENTOS (Recrutamento) ---
async function renderExternalRecruitmentModal(type = 'extra') {
    const modal = document.createElement('div');
    modal.className = "fixed inset-0 bg-gray-900/95 flex items-center justify-center z-[100] p-4";
    modal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 w-full max-w-md p-0 rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            <div class="p-4 bg-gradient-to-r ${type === 'motoboy' ? 'from-orange-600 to-orange-800' : 'from-purple-600 to-purple-800'} text-white flex justify-between items-center">
                <h3 class="text-lg font-bold"><i class="fas ${type === 'motoboy' ? 'fa-motorcycle' : 'fa-user-clock'} mr-2"></i> ${type === 'motoboy' ? 'Chamar Entrega' : 'Chamar Extra/Freelancer'}</h3>
                <button class="text-white/80 hover:text-white text-2xl" onclick="this.closest('.fixed').remove()">&times;</button>
            </div>
            <div class="p-2 bg-gray-800 flex space-x-2 overflow-x-auto"><button class="px-3 py-1 rounded-full bg-white text-black text-xs font-bold border border-transparent">Todos</button><button class="px-3 py-1 rounded-full bg-transparent text-gray-300 text-xs font-bold border border-gray-600">Favoritos</button><button class="px-3 py-1 rounded-full bg-transparent text-gray-300 text-xs font-bold border border-gray-600">Disponíveis Agora</button></div>
            <div id="candidatesList" class="flex-grow overflow-y-auto p-4 space-y-3 bg-dark-bg"><div class="flex justify-center py-4"><i class="fas fa-spinner fa-spin text-gray-500"></i></div></div>
            <div class="p-4 border-t border-gray-700 bg-gray-800 text-center"><button class="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow transition"><i class="fab fa-whatsapp mr-2"></i> Disparar Alerta no Grupo</button></div>
        </div>`;
    document.body.appendChild(modal);

    try {
        const q = query(getCollectionRef('external_candidates'), where('type', '==', type)); 
        const snap = await getDocs(q);
        const list = modal.querySelector('#candidatesList');
        
        const mockData = type === 'motoboy' ? [
            { name: 'Carlos Motoca', rating: 4.8, distance: '1.2km', vehicle: 'Honda CG', status: 'online' },
            { name: 'Flash Entregas', rating: 4.9, distance: '2.0km', vehicle: 'Yamaha Fazer', status: 'busy' },
            { name: 'José Rápido', rating: 4.5, distance: '0.5km', vehicle: 'Honda Bros', status: 'online' }
        ] : [
            { name: 'Ana Freelancer', rating: 5.0, role: 'Garçonete', exp: '3 anos', status: 'online' },
            { name: 'Pedro Cozinha', rating: 4.7, role: 'Aux. Cozinha', exp: '5 anos', status: 'offline' }
        ];

        const dataToRender = snap.empty ? mockData : snap.docs.map(d => d.data());

        list.innerHTML = dataToRender.map(c => `
            <div class="bg-gray-800 p-3 rounded-lg border border-gray-700 flex items-center justify-between hover:border-gray-500 transition cursor-pointer">
                <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 rounded-full ${c.status === 'online' ? 'border-2 border-green-500' : 'border-2 border-gray-500'} bg-gray-700 flex items-center justify-center overflow-hidden"><i class="fas fa-user text-gray-400"></i></div>
                    <div><h4 class="font-bold text-white text-sm">${c.name}</h4><p class="text-xs text-gray-400 flex items-center"><i class="fas fa-star text-yellow-400 mr-1" style="font-size:10px"></i> ${c.rating} <span class="mx-1">•</span> ${type === 'motoboy' ? c.distance : c.role}</p></div>
                </div>
                <button class="bg-green-600 text-white w-8 h-8 rounded-full flex items-center justify-center hover:bg-green-500 shadow"><i class="fas fa-phone-alt text-xs"></i></button>
            </div>`).join('');
    } catch(e) { console.error(e); modal.querySelector('#candidatesList').innerHTML = '<p class="text-red-400 text-center">Erro ao conectar.</p>'; }
}

// =================================================================
//           4. INICIALIZAÇÃO (INIT)
// =================================================================

export const initManagerController = () => {
    if (managerControllerInitialized) return;
    console.log("[ManagerController] Inicializando...");
    
    managerModal = document.getElementById('managerModal');
    if (managerModal) {
        managerModal.addEventListener('click', (e) => { if (e.target === managerModal) managerModal.style.display = 'none'; });
    }

    // Vouchers
    voucherManagementModal = document.getElementById('voucherManagementModal'); 
    voucherListContainer = document.getElementById('voucherListContainer');     
    voucherForm = document.getElementById('voucherForm');                       
    const voucherBtn = document.getElementById('showVoucherFormBtn');
    
    if(voucherBtn) {
        voucherBtn.addEventListener('click', () => { 
            if(voucherForm) { voucherForm.style.display = 'block'; voucherForm.reset(); }
        });
    }
    if (voucherForm) {
        voucherForm.addEventListener('submit', handleSaveVoucher);
    }

    // Relatórios
    reportDateInput = document.getElementById('reportDateInput');
    if (reportDateInput) {
        reportDateInput.valueAsDate = new Date(); 
        reportDateInput.addEventListener('change', () => {
            loadReports();
            if (managerModal && managerModal.style.display === 'flex' && document.getElementById('finContent')) {
                switchFinTab(currentFinTab);
            }
        });
    }
    
    const refreshBtn = document.getElementById('refreshReportBtn');
    if(refreshBtn) refreshBtn.addEventListener('click', loadReports);

    // Abas de Relatório
    const tabBtns = document.querySelectorAll('.report-tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => { b.classList.remove('bg-indigo-600', 'text-white'); b.classList.add('bg-dark-input', 'text-gray-300'); });
            btn.classList.remove('bg-dark-input', 'text-gray-300'); btn.classList.add('bg-indigo-600', 'text-white');
            document.querySelectorAll('.report-content').forEach(c => c.classList.add('hidden'));
            const targetContent = document.getElementById(`tab-${btn.dataset.tab}`);
            if(targetContent) targetContent.classList.remove('hidden');
            if (btn.dataset.tab === 'sales') fetchMonthlyPerformance();
            loadReports();
        });
    });

    // --- ATRIBUIÇÕES GLOBAIS (SEGURANÇA) ---
    window.handleSaveVoucher = handleSaveVoucher;
    window.handleDeleteVoucher = handleDeleteVoucher;
    window.toggleExpenseForm = toggleExpenseForm;
    window.saveExpense = saveExpense;
    window.deleteExpense = deleteExpense;
    window.handleForceCloseShift = handleForceCloseShift;
    window.openShiftDetails = openShiftDetails;
    window.deleteSector = deleteSector;
    window.setMonthlyGoal = setMonthlyGoal;
    window.runDateComparison = runDateComparison;
    window.switchFinTab = switchFinTab;
    window.openReportPanel = openReportPanel;
    
    // Hub / Estoque / Fornecedores
    window.renderProductHub = renderProductHub; 
    window.renderCategoryManagement = renderCategoryManagement; 
    window.renderCategoryForm = renderCategoryForm; 
    window.switchHubTab = switchHubTab;
    window.handleDeleteProduct = handleDeleteProduct;
    window.handleImportXML = handleImportXML;
    window.toggleCheckItem = toggleCheckItem;
    window.confirmStockEntry = confirmStockEntry;
    window.openManualStockEntry = openManualStockEntry;
    window.saveManualStockEntry = saveManualStockEntry;
    
    window.saveSupplier = saveSupplier;
    window.deleteSupplier = deleteSupplier;
    
    window.renderSectorManagementModal = renderSectorManagementModal;
    window.switchAuxTab = switchAuxTab;
    window.saveAuxiliary = saveAuxiliary;
    window.deleteAuxiliary = deleteAuxiliary;
    
    window.addCompItem = addCompItem;
    window.removeCompItem = removeCompItem;
    window.updateCompItem = updateCompItem;
    window.saveIngredient = saveIngredient;
    window.deleteIngredient = deleteIngredient;

    // RH
    window.renderHRPanel = renderHRPanel;
    window.switchHRTab = switchHRTab;
    window.generatePayslip = generatePayslip;
    window.renderExternalRecruitmentModal = renderExternalRecruitmentModal;
    
    // Helpers UI (Injetados)
    window.editIngredient = (id) => {
        const ing = ingredientsCache.find(i => i.id === id);
        if (!ing) return;
        document.getElementById('ingId').value = ing.id;
        document.getElementById('ingName').value = ing.name;
        document.getElementById('ingUnit').value = ing.unit;
        document.getElementById('ingCost').value = ing.cost;
        document.getElementById('ingStock').value = ing.stock;
        document.getElementById('ingMinStock').value = ing.minStock;
        if(document.getElementById('ingType')) document.getElementById('ingType').value = ing.type || '';
        document.getElementById('ingModalTitle').textContent = 'Editar Insumo';
        document.getElementById('ingredientFormModal').style.display = 'flex';
    };

    window.editSupplier = (id) => {
        const sup = suppliersCache.find(s => s.id === id);
        if (!sup) return;
        document.getElementById('supId').value = sup.id;
        document.getElementById('supName').value = sup.name;
        document.getElementById('supPhone').value = sup.phone || '';
        document.getElementById('supDoc').value = sup.document || '';
        document.getElementById('supCategory').value = sup.category || '';
        document.getElementById('supModalTitle').textContent = 'Editar Fornecedor';
        document.getElementById('supplierFormModal').style.display = 'flex';
    };

    managerControllerInitialized = true;
};

// =================================================================
//           5. ROTEADOR DE AÇÕES (EXPORTADO)
// =================================================================

export const handleGerencialAction = (action, payload) => {
    if (managerModal) managerModal.style.display = 'none';

    switch (action) {
        case 'openWaiterReg': openUserManagementModal(); break;
        case 'openProductHub': renderProductHub(payload || 'products'); break;
        case 'openProductManagement': renderProductHub('products'); break;
        case 'openVoucherManagement': openVoucherManagementModal(); break;
        case 'openSectorManagement': renderSectorManagementModal(); break;
        case 'openCustomerCRM': renderCustomerCrmModal(); break;
        case 'openWooSync': handleSyncAction(); break;
        case 'openCashManagementReport': openReportPanel('active-shifts'); break;
        case 'openFinancialModule': renderFinancialModule(); break;
        case 'closeDay': handleCloseDay(); break;
        case 'exportCsv': exportSalesToCSV(); break;
        case 'openHRPanel': renderHRPanel(); break; // RH adicionado
        default: console.warn(`Ação não mapeada: ${action}`);
    }
};

// =================================================================
//           6. MÓDULOS DE RENDERIZAÇÃO (UI)
// =================================================================

// --- HUB ---
async function renderProductHub(activeTab = 'products') {
    if (!managerModal) return;
    await fetchIngredients(); 
    
    // Buscamos as opções dinâmicas antes de renderizar
    let typeOptions = '<option value="">Geral</option>';
    try {
        const snapTypes = await getDocs(query(getCollectionRef('ingredient_types'), orderBy('name')));
        snapTypes.forEach(doc => { typeOptions += `<option value="${doc.data().name}">${doc.data().name}</option>`; });
    } catch(e) { console.error("Erro ao carregar tipos insumo", e); }

    let catOptionsSup = '<option value="">Geral</option>';
    try {
        const snapCats = await getDocs(query(getCollectionRef('supplier_categories'), orderBy('name')));
        snapCats.forEach(doc => { catOptionsSup += `<option value="${doc.data().name}">${doc.data().name}</option>`; });
    } catch(e) { console.error("Erro ao carregar cat fornecedor", e); }

    managerModal.innerHTML = `
        <div class="bg-dark-card border-0 md:border md:border-dark-border w-full h-full md:h-[90vh] md:max-w-6xl flex flex-col md:rounded-xl shadow-2xl overflow-hidden">
            <div class="flex justify-between items-center p-4 md:p-6 border-b border-gray-700 bg-gray-800 flex-shrink-0">
                <div><h3 class="text-xl md:text-2xl font-bold text-white">Gestão de Produtos</h3><p class="text-xs md:text-sm text-gray-400">Cardápio, Estoque e Fornecedores</p></div>
                <button class="text-gray-400 hover:text-white text-3xl leading-none p-2" onclick="document.getElementById('managerModal').style.display='none'">&times;</button>
            </div>
            <div class="flex items-center space-x-2 p-3 bg-dark-bg border-b border-gray-700 overflow-x-auto flex-shrink-0 whitespace-nowrap">
                <button class="hub-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center" onclick="window.switchHubTab('products')"><i class="fas fa-hamburger mr-2"></i> Produtos</button>
                <button class="hub-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center" onclick="window.switchHubTab('ingredients')"><i class="fas fa-cubes mr-2"></i> Insumos</button>
                <button class="hub-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center" onclick="window.switchHubTab('suppliers')"><i class="fas fa-truck mr-2"></i> Fornecedores</button>
                <button class="hub-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center" onclick="window.switchHubTab('shoppingList')"><i class="fas fa-shopping-cart mr-2"></i> Compras</button>
                <button class="hub-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center" onclick="window.switchHubTab('categories')"><i class="fas fa-tags mr-2"></i> Categorias</button>
            </div>
            <div id="productActionsToolbar" class="flex flex-col md:flex-row items-stretch md:items-center justify-between p-3 bg-dark-bg border-b border-gray-700 gap-3 flex-shrink-0"></div>
            <div id="hubContent" class="flex-grow overflow-y-auto p-3 md:p-4 custom-scrollbar bg-dark-bg relative"><div class="flex items-center justify-center h-full text-gray-500"><i class="fas fa-spinner fa-spin text-3xl"></i></div></div>
        </div>
        
        <div id="ingredientFormModal" class="absolute inset-0 bg-black/80 flex items-center justify-center z-50 hidden">
            <div class="bg-gray-800 p-6 rounded-lg w-full max-w-md border border-gray-600">
                <h3 class="text-lg font-bold text-white mb-4" id="ingModalTitle">Novo Insumo</h3>
                <input type="hidden" id="ingId">
                <div class="space-y-3">
                    <div><label class="text-xs text-gray-400">Nome</label><input id="ingName" type="text" class="input-pdv w-full p-2"></div>
                    <div>
                        <label class="text-xs text-gray-400">Tipo / Seção</label>
                        <select id="ingType" class="input-pdv w-full p-2">${typeOptions}</select>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div><label class="text-xs text-gray-400">Unidade</label><select id="ingUnit" class="input-pdv w-full p-2"><option value="un">Unidade (un)</option><option value="kg">Quilo (kg)</option><option value="l">Litro (l)</option><option value="g">Grama (g)</option><option value="ml">Mililitro (ml)</option></select></div>
                        <div><label class="text-xs text-gray-400">Custo (R$)</label><input id="ingCost" type="number" step="0.01" class="input-pdv w-full p-2"></div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div><label class="text-xs text-gray-400">Estoque Atual</label><input id="ingStock" type="number" step="0.001" class="input-pdv w-full p-2"></div>
                        <div><label class="text-xs text-gray-400">Estoque Mínimo</label><input id="ingMinStock" type="number" step="0.001" class="input-pdv w-full p-2"></div>
                    </div>
                </div>
                <div class="flex justify-end space-x-2 mt-6">
                    <button onclick="document.getElementById('ingredientFormModal').style.display='none'" class="px-4 py-2 bg-gray-600 text-white rounded">Cancelar</button>
                    <button onclick="window.saveIngredient()" class="px-4 py-2 bg-blue-600 text-white rounded font-bold">Salvar</button>
                </div>
            </div>
        </div>

        <div id="supplierFormModal" class="absolute inset-0 bg-black/80 flex items-center justify-center z-50 hidden">
            <div class="bg-gray-800 p-6 rounded-lg w-full max-w-md border border-gray-600">
                <h3 class="text-lg font-bold text-white mb-4" id="supModalTitle">Novo Fornecedor</h3>
                <input type="hidden" id="supId">
                <div class="space-y-3">
                    <div><label class="text-xs text-gray-400">Nome / Empresa</label><input id="supName" type="text" class="input-pdv w-full p-2"></div>
                    <div><label class="text-xs text-gray-400">Telefone</label><input id="supPhone" type="text" class="input-pdv w-full p-2"></div>
                    <div><label class="text-xs text-gray-400">CNPJ / CPF</label><input id="supDoc" type="text" class="input-pdv w-full p-2"></div>
                    <div><label class="text-xs text-gray-400">Categoria Principal</label><select id="supCategory" class="input-pdv w-full p-2">${catOptionsSup}</select></div>
                </div>
                <div class="flex justify-end space-x-2 mt-6">
                    <button onclick="document.getElementById('supplierFormModal').style.display='none'" class="px-4 py-2 bg-gray-600 text-white rounded">Cancelar</button>
                    <button onclick="window.saveSupplier()" class="px-4 py-2 bg-blue-600 text-white rounded font-bold">Salvar</button>
                </div>
            </div>
        </div>`;
    
    managerModal.style.display = 'flex';
    managerModal.classList.remove('p-4'); managerModal.classList.add('p-0', 'md:p-4');
    await switchHubTab(activeTab);
}

async function switchHubTab(tab) {
    currentHubTab = tab;
    const contentDiv = document.getElementById('hubContent');
    const toolbarDiv = document.getElementById('productActionsToolbar');
    
    document.querySelectorAll('.hub-tab-btn').forEach(btn => {
        const iconClass = tab === 'products' ? 'fa-hamburger' : 
                          tab === 'ingredients' ? 'fa-cubes' : 
                          tab === 'shoppingList' ? 'fa-shopping-cart' : 
                          tab === 'suppliers' ? 'fa-truck' : 'fa-tags';
        
        if(btn.innerHTML.includes(iconClass)) {
            btn.classList.add('bg-indigo-600', 'text-white'); btn.classList.remove('bg-dark-input', 'text-gray-300');
        } else {
            btn.classList.remove('bg-indigo-600', 'text-white'); btn.classList.add('bg-dark-input', 'text-gray-300');
        }
    });

    contentDiv.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500"><i class="fas fa-spinner fa-spin text-3xl"></i></div>';
    toolbarDiv.innerHTML = '';

    if (tab === 'products') await renderProductListConfig(contentDiv, toolbarDiv);
    else if (tab === 'ingredients') await renderIngredientsScreen(contentDiv, toolbarDiv);
    else if (tab === 'suppliers') await renderSuppliersScreen(contentDiv, toolbarDiv);
    else if (tab === 'shoppingList') await renderShoppingListScreen(contentDiv, toolbarDiv);
    else if (tab === 'categories') await renderCategoryManagement(contentDiv);
}

async function renderIngredientsScreen(container, toolbar) {
    toolbar.innerHTML = `<div class="flex-grow text-white font-bold text-sm items-center flex gap-2"><i class="fas fa-cubes text-blue-400"></i> Cadastro de Insumos</div><button onclick="document.getElementById('ingredientFormModal').style.display='flex'; document.getElementById('ingId').value=''; document.getElementById('ingName').value=''; document.getElementById('ingModalTitle').textContent='Novo Insumo';" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-lg flex items-center"><i class="fas fa-plus mr-2"></i> Novo</button>`;
    const ingredients = await fetchIngredients();
    if (ingredients.length === 0) { container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-gray-500"><i class="fas fa-box-open text-4xl mb-3"></i><p>Nenhum insumo cadastrado.</p></div>'; return; }
    
    container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${ingredients.map(ing => `
        <div class="bg-gray-800 p-4 rounded-lg border border-gray-700 flex justify-between items-center group hover:border-gray-500 transition">
            <div>
                <h4 class="font-bold text-white text-base">${ing.name}</h4>
                <div class="flex items-center gap-2 mt-1">
                    <span class="text-[10px] uppercase px-2 py-0.5 bg-gray-700 text-gray-300 rounded">${ing.type || 'Geral'}</span>
                </div>
                <p class="text-xs text-gray-400 mt-1">Custo: R$ ${ing.cost.toFixed(2)} / ${ing.unit}</p>
            </div>
            <div class="text-right">
                <div class="font-mono text-xl font-bold ${ing.stock <= ing.minStock ? 'text-red-500' : 'text-green-400'}">${ing.stock} <span class="text-xs text-gray-500">${ing.unit}</span></div>
                <div class="flex space-x-2 mt-2 justify-end opacity-50 group-hover:opacity-100 transition">
                    <button onclick="window.editIngredient('${ing.id}')" class="text-blue-400 hover:text-white"><i class="fas fa-edit"></i></button>
                    <button onclick="window.deleteIngredient('${ing.id}')" class="text-red-400 hover:text-white"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        </div>`).join('')}</div>`;
}

async function renderSuppliersScreen(container, toolbar) {
    toolbar.innerHTML = `<div class="flex-grow text-white font-bold text-sm items-center flex gap-2"><i class="fas fa-truck text-orange-400"></i> Base de Fornecedores</div><button onclick="document.getElementById('supplierFormModal').style.display='flex'; document.getElementById('supId').value=''; document.getElementById('supName').value=''; document.getElementById('supModalTitle').textContent='Novo Fornecedor';" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-lg flex items-center"><i class="fas fa-plus mr-2"></i> Novo</button>`;
    const suppliers = await fetchSuppliers();
    if (suppliers.length === 0) { container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-gray-500"><i class="fas fa-users-slash text-4xl mb-3"></i><p>Nenhum fornecedor cadastrado.</p></div>'; return; }
    
    container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${suppliers.map(sup => `
        <div class="bg-gray-800 p-4 rounded-lg border border-gray-700 flex justify-between items-center group hover:border-gray-500 transition">
            <div>
                <h4 class="font-bold text-white text-base">${sup.name}</h4>
                <p class="text-xs text-gray-400 mt-1"><i class="fas fa-phone mr-1"></i> ${sup.phone || 'Sem telefone'}</p>
                <span class="text-[10px] uppercase px-2 py-0.5 bg-gray-700 text-gray-300 rounded mt-2 inline-block">${sup.category || 'Geral'}</span>
            </div>
            <div class="flex flex-col space-y-2 items-end">
                <button onclick="window.editSupplier('${sup.id}')" class="text-blue-400 hover:text-white p-2"><i class="fas fa-edit"></i></button>
                <button onclick="window.deleteSupplier('${sup.id}')" class="text-red-400 hover:text-white p-2"><i class="fas fa-trash"></i></button>
            </div>
        </div>`).join('')}</div>`;
}

async function renderShoppingListScreen(container, toolbar) {
    toolbar.innerHTML = `<div class="flex-grow text-white font-bold text-sm items-center flex gap-2"><i class="fas fa-shopping-cart text-yellow-400"></i> Itens para Reposição</div><button onclick="window.print()" class="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg shadow flex items-center"><i class="fas fa-print mr-2"></i> Imprimir</button>`;
    const ingredients = await fetchIngredients();
    // Agrupa por tipo para facilitar a compra
    const shoppingList = ingredients.filter(ing => ing.stock <= ing.minStock).sort((a,b) => (a.type || '').localeCompare(b.type || ''));
    
    if (shoppingList.length === 0) { container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-green-500"><i class="fas fa-check-circle text-5xl mb-3"></i><p class="text-lg">Tudo certo! Estoque em dia.</p></div>'; return; }
    
    container.innerHTML = `<div class="bg-gray-800 rounded-xl overflow-hidden border border-gray-700"><table class="w-full text-left text-gray-300"><thead class="bg-gray-900 text-xs uppercase font-bold text-gray-500"><tr><th class="p-4">Item</th><th class="p-4">Tipo</th><th class="p-4 text-center">Estoque Atual</th><th class="p-4 text-center">Mínimo</th><th class="p-4 text-right">Comprar</th></tr></thead><tbody class="divide-y divide-gray-700">${shoppingList.map(ing => { 
        const needed = (ing.minStock - ing.stock); 
        const buyQty = needed > 0 ? needed : ing.minStock; 
        return `<tr class="hover:bg-gray-700/50">
            <td class="p-4 font-bold text-white">${ing.name}</td>
            <td class="p-4 text-xs text-gray-400 uppercase">${ing.type || '-'}</td>
            <td class="p-4 text-center text-red-400 font-mono">${ing.stock} ${ing.unit}</td>
            <td class="p-4 text-center text-gray-500 font-mono">${ing.minStock} ${ing.unit}</td>
            <td class="p-4 text-right font-bold text-yellow-400 text-lg"><i class="fas fa-arrow-right text-xs mr-2"></i> ${buyQty.toFixed(2)} ${ing.unit}</td>
        </tr>`; 
    }).join('')}</tbody></table></div>`;
}

async function renderProductListConfig(contentDiv, toolbarDiv) {
    const categories = getCategories();
    let catOptions = '<option value="all">Todas as Categorias</option>';
    if (categories.length > 0) categories.forEach(c => { if(c.id !== 'all' && c.id !== 'top10') catOptions += `<option value="${c.id}">${c.name}</option>`; });
    toolbarDiv.innerHTML = `<div class="flex items-center space-x-2 w-full md:w-auto"><select id="hubCategoryFilter" class="bg-gray-700 text-white text-sm py-3 px-3 rounded-lg border border-gray-600 w-full md:w-[200px]">${catOptions}</select></div><div class="flex items-center space-x-2 w-full md:w-auto"><div class="relative w-full md:w-64"><input type="text" id="hubSearchInput" placeholder="Pesquisar..." class="bg-dark-input text-white text-sm py-3 pl-3 pr-8 rounded-lg border border-gray-600 w-full focus:border-indigo-500"><i class="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i></div><button id="hubNewProductBtn" class="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition shadow-lg flex items-center justify-center whitespace-nowrap"><i class="fas fa-plus mr-2"></i> <span class="hidden md:inline">Novo</span></button></div>`;
    document.getElementById('hubNewProductBtn').onclick = () => renderProductForm(null, contentDiv, () => renderProductList(contentDiv, 'all', '', false));
    const catSelect = document.getElementById('hubCategoryFilter');
    const searchInput = document.getElementById('hubSearchInput');
    catSelect.onchange = (e) => { hubCategory = e.target.value; hubPage = 1; renderProductList(contentDiv, hubCategory, hubSearch, false); };
    searchInput.oninput = (e) => { hubSearch = e.target.value; hubPage = 1; clearTimeout(hubSearchTimeout); hubSearchTimeout = setTimeout(() => { renderProductList(contentDiv, hubCategory, hubSearch, false); }, 600); };
    await fetchWooCommerceProducts(1, '', 'all', false);
    await renderProductList(contentDiv, 'all', '', false);
}

async function renderProductList(container, catFilter, searchTerm, append = false) {
    if (!append) { container.innerHTML = '<div class="flex justify-center py-10"><i class="fas fa-spinner fa-spin text-3xl text-gray-500"></i></div>'; await fetchWooCommerceProducts(1, searchTerm, catFilter, false); }
    let products = getProducts();
    if (products.length === 0 && !append) { container.innerHTML = '<p class="text-center text-gray-500 py-10">Nenhum produto encontrado.</p>'; return; }
    const listHtml = products.map(p => `<div class="flex justify-between items-center bg-dark-input p-3 rounded-lg mb-2 border border-gray-700 hover:border-gray-500 transition group"><div class="flex items-center space-x-3 overflow-hidden"><div class="w-12 h-12 rounded-lg bg-gray-800 overflow-hidden flex-shrink-0 border border-gray-600"><img src="${p.image || 'https://placehold.co/50'}" class="w-full h-full object-cover"></div><div class="min-w-0"><h4 class="font-bold text-white text-sm truncate">${p.name}</h4><div class="flex items-center text-xs space-x-2 mt-1"><span class="text-green-400 font-mono bg-green-900/30 px-1.5 py-0.5 rounded">${formatCurrency(p.price)}</span>${p.status !== 'publish' ? '<span class="text-yellow-500 bg-yellow-900/30 px-1.5 rounded">Oculto</span>' : ''}</div></div></div><div class="flex space-x-2 flex-shrink-0"><button class="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg text-sm btn-edit-prod shadow" data-id="${p.id}"><i class="fas fa-edit"></i></button><button class="bg-red-600 hover:bg-red-500 text-white p-2 rounded-lg text-sm btn-del-prod shadow" data-id="${p.id}"><i class="fas fa-trash"></i></button></div></div>`).join('');
    const loadMoreHtml = `<div class="pt-4 pb-20 text-center" id="hubLoadMoreContainer"><button id="hubLoadMoreBtn" class="w-full md:w-1/2 py-3 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition font-bold border border-gray-600">Carregar Mais Produtos</button></div>`;
    if (!append) container.innerHTML = `<div class="pb-4">${listHtml}</div>${loadMoreHtml}`; else { const loadMoreContainer = document.getElementById('hubLoadMoreContainer'); if(loadMoreContainer) loadMoreContainer.remove(); container.insertAdjacentHTML('beforeend', `<div class="pb-4">${listHtml}</div>${loadMoreHtml}`); }
    container.querySelectorAll('.btn-edit-prod').forEach(btn => btn.onclick = () => { const prod = products.find(p => p.id == btn.dataset.id); renderProductForm(prod, container, () => renderProductList(container, catFilter, searchTerm, false)); });
    container.querySelectorAll('.btn-del-prod').forEach(btn => btn.onclick = () => handleDeleteProduct(btn.dataset.id, () => renderProductList(container, catFilter, searchTerm, false)));
    const loadBtn = document.getElementById('hubLoadMoreBtn');
    if (loadBtn) { loadBtn.onclick = async () => { toggleLoading(loadBtn, true, 'Carregando...'); hubPage++; const newItems = await fetchWooCommerceProducts(hubPage, searchTerm, catFilter, true); if (newItems.length === 0) { showToast("Não há mais produtos.", false); loadBtn.style.display = 'none'; } else { renderProductList(container, catFilter, searchTerm, true); } }; }
}

async function renderProductForm(product = null, container, onBack) {
    const isEdit = !!product;
    const sectorsSnap = await getDocs(query(getSectorsCollectionRef(), where('type', '==', 'production'), orderBy('name')));
    const sectors = sectorsSnap.docs.map(d => d.data().name);
    currentComposition = product?.composition || [];
    
    container.innerHTML = `
        <div class="w-full h-full flex flex-col bg-dark-bg">
            <div class="flex justify-between items-center mb-2 pb-2 border-b border-gray-700 flex-shrink-0"><h4 class="text-lg font-bold text-white flex items-center truncate"><i class="fas ${isEdit ? 'fa-edit text-blue-400' : 'fa-plus-circle text-green-400'} mr-2"></i>${isEdit ? 'Editar' : 'Novo'}</h4><button id="btnBackToHub" class="text-gray-400 hover:text-white flex items-center text-sm py-2 px-3 rounded bg-gray-800"><i class="fas fa-arrow-left mr-1"></i> Voltar</button></div>
            <div class="flex space-x-2 mb-4 overflow-x-auto pb-2 flex-shrink-0"><button class="form-tab-btn px-4 py-2 rounded-full bg-indigo-600 text-white text-sm font-bold whitespace-nowrap" data-target="tab-general">Geral</button><button class="form-tab-btn px-4 py-2 rounded-full bg-gray-700 text-gray-300 text-sm font-bold whitespace-nowrap" data-target="tab-hierarchy">Hierarquia</button><button class="form-tab-btn px-4 py-2 rounded-full bg-gray-700 text-gray-300 text-sm font-bold whitespace-nowrap" data-target="tab-recipe">Ficha Técnica</button><button class="form-tab-btn px-4 py-2 rounded-full bg-gray-700 text-gray-300 text-sm font-bold whitespace-nowrap" data-target="tab-obs">Obs</button></div>
            <div class="flex-grow overflow-y-auto custom-scrollbar pr-1 pb-20">
                <form id="productForm" class="space-y-6">
                    <div id="tab-general" class="form-tab-content"><div class="space-y-4"><div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Nome</label><input type="text" id="prodName" class="input-pdv w-full text-lg p-3" value="${product?.name || ''}" required></div><div class="grid grid-cols-2 gap-4"><div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Preço</label><input type="number" id="prodPrice" class="input-pdv w-full font-mono text-green-400 font-bold text-lg p-3" step="0.01" value="${product?.price || ''}" required></div><div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Promo</label><input type="number" id="prodRegPrice" class="input-pdv w-full font-mono text-yellow-400 text-lg p-3" step="0.01" value="${product?.regular_price || ''}"></div></div><div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Status</label><select id="prodStatus" class="input-pdv w-full p-3"><option value="publish" ${product?.status === 'publish' ? 'selected' : ''}>Publicado</option><option value="draft" ${product?.status === 'draft' ? 'selected' : ''}>Rascunho</option></select></div><div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">URL Imagem</label><input type="text" id="prodImg" class="input-pdv w-full text-xs p-3" value="${product?.image || ''}"></div><div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Descrição</label><textarea id="prodDesc" class="input-pdv w-full text-sm p-3" rows="3">${product?.description || ''}</textarea></div></div></div>
                    <div id="tab-hierarchy" class="form-tab-content hidden"><div class="bg-gray-800 p-4 rounded-xl border border-gray-600 space-y-4"><p class="text-sm text-pumpkin font-bold uppercase mb-2">Classificação</p><div><label class="text-xs text-gray-500 block mb-1">1. Grupo</label><select id="catLvl1" class="input-pdv w-full text-sm p-2"></select></div><div><label class="text-xs text-gray-500 block mb-1">2. Subgrupo</label><select id="catLvl2" class="input-pdv w-full text-sm p-2" disabled></select></div><div><label class="text-xs text-gray-500 block mb-1">3. Categoria</label><select id="catLvl3" class="input-pdv w-full text-sm p-2" disabled></select></div><div><label class="text-xs text-gray-500 block mb-1">4. Variação</label><select id="catLvl4" class="input-pdv w-full text-sm p-2" disabled></select></div><input type="hidden" id="finalCategoryId" value="${product?.categoryId || ''}"><div class="pt-4 border-t border-gray-600"><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Setor de Produção (KDS)</label><select id="prodSector" class="input-pdv w-full p-2">${sectors.length > 0 ? sectors.map(s => `<option value="${s}">${s}</option>`).join('') : '<option value="cozinha">Cozinha</option>'}</select></div></div></div>
                    <div id="tab-recipe" class="form-tab-content hidden space-y-6">
                         <div class="bg-gray-800 p-4 rounded-xl border border-gray-600"><label class="flex items-center space-x-3 cursor-pointer mb-4"><input type="checkbox" id="isComposite" class="w-6 h-6 rounded bg-dark-input border-gray-500 text-indigo-600" ${product?.composition?.length > 0 ? 'checked' : ''}><span class="text-white font-bold">Este Produto Consome Insumos?</span></label><div id="compositionContainer" class="space-y-2 ${product?.composition?.length > 0 ? '' : 'hidden'}"><h5 class="text-xs font-bold text-gray-500 uppercase mb-2">Ingredientes (Baixa Automática)</h5><div id="compositionList"></div><button type="button" onclick="window.addCompItem()" class="text-xs bg-indigo-600 text-white px-3 py-2 rounded w-full font-bold mt-2 hover:bg-indigo-500"><i class="fas fa-plus mr-2"></i> Adicionar Ingrediente</button></div></div>
                    </div>
                    <div id="tab-obs" class="form-tab-content hidden"><div class="bg-gray-800 p-4 rounded-xl border border-gray-600"><p class="text-sm text-gray-300 mb-3">Obs. específicas.</p><div class="flex space-x-2 mb-4"><input type="text" id="newQuickObsInput" placeholder="Nova obs..." class="input-pdv w-full text-sm p-3"><button type="button" id="btnAddQuickObs" class="bg-green-600 text-white px-4 rounded-lg font-bold"><i class="fas fa-plus"></i></button></div><div id="quickObsListSmall" class="grid grid-cols-2 gap-2"></div></div></div>
                </form>
            </div>
            <div class="border-t border-gray-700 pt-4 mt-auto flex space-x-3 flex-shrink-0 bg-dark-bg"><button type="button" id="btnCancelForm" class="flex-1 py-4 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-bold transition">Cancelar</button><button type="button" id="btnSaveProduct" class="flex-1 py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition shadow-lg flex items-center justify-center"><i class="fas fa-save mr-2"></i> Salvar</button></div>
        </div>`;

    await fetchIngredients();
    updateCompListUI();

    const tabBtns = container.querySelectorAll('.form-tab-btn');
    const tabContents = container.querySelectorAll('.form-tab-content');
    tabBtns.forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            tabBtns.forEach(b => { b.classList.remove('bg-indigo-600', 'text-white'); b.classList.add('bg-gray-700', 'text-gray-300'); });
            btn.classList.remove('bg-gray-700', 'text-gray-300'); btn.classList.add('bg-indigo-600', 'text-white');
            tabContents.forEach(c => c.classList.add('hidden'));
            document.getElementById(btn.dataset.target).classList.remove('hidden');
        };
    });

    const compCheck = document.getElementById('isComposite');
    const compContainer = document.getElementById('compositionContainer');
    compCheck.onchange = () => { if(compCheck.checked) compContainer.classList.remove('hidden'); else compContainer.classList.add('hidden'); };

    const allCats = getCategories();
    const selects = [document.getElementById('catLvl1'), document.getElementById('catLvl2'), document.getElementById('catLvl3'), document.getElementById('catLvl4')];
    const finalIdInput = document.getElementById('finalCategoryId');
    const populateSelect = (levelIndex, parentId) => {
        const select = selects[levelIndex];
        select.innerHTML = '<option value="">Selecione...</option>';
        const children = allCats.filter(c => c.parent == parentId && c.id !== 'all' && c.id !== 'top10');
        if (children.length === 0) { select.disabled = true; } else { select.disabled = false; children.forEach(c => { const opt = document.createElement('option'); opt.value = c.id; opt.textContent = c.name; select.appendChild(opt); }); }
        for(let i = levelIndex + 1; i < 4; i++) { selects[i].innerHTML = ''; selects[i].disabled = true; }
    };
    selects.forEach((sel, idx) => {
        sel.onchange = () => {
            const selectedVal = sel.value;
            if (selectedVal) { finalIdInput.value = selectedVal; if (idx < 3) populateSelect(idx + 1, selectedVal); } 
            else { finalIdInput.value = idx > 0 ? selects[idx-1].value : ''; for(let i = idx + 1; i < 4; i++) { selects[i].innerHTML = ''; selects[i].disabled = true; } }
        };
    });
    const getPath = (id) => { let path = []; let curr = allCats.find(c => c.id == id); while(curr) { path.unshift(curr.id); curr = allCats.find(c => c.id == curr.parent); } return path; };
    const currentPath = product?.categoryId ? getPath(product.categoryId) : [];
    populateSelect(0, 0);
    if (currentPath.length > 0) {
        selects[0].value = currentPath[0]; populateSelect(1, currentPath[0]);
        if (currentPath[1]) { selects[1].value = currentPath[1]; populateSelect(2, currentPath[1]); }
        if (currentPath[2]) { selects[2].value = currentPath[2]; populateSelect(3, currentPath[2]); }
        if (currentPath[3]) { selects[3].value = currentPath[3]; }
    }
    
    const loadMiniObs = async () => {
        const containerObs = document.getElementById('quickObsListSmall');
        const snap = await getDocs(query(getQuickObsCollectionRef(), orderBy('text')));
        containerObs.innerHTML = snap.docs.map(d => `<div class="flex justify-between items-center bg-dark-bg p-2 rounded border border-gray-600"><span class="text-xs text-gray-300">${d.data().text}</span><button type="button" class="text-red-400 hover:text-white text-xs btn-del-mini-obs" data-id="${d.id}">&times;</button></div>`).join('');
        containerObs.querySelectorAll('.btn-del-mini-obs').forEach(btn => btn.onclick = async () => { if(confirm("Apagar?")) { await deleteDoc(doc(getQuickObsCollectionRef(), btn.dataset.id)); loadMiniObs(); }});
    };
    document.getElementById('btnAddQuickObs').onclick = async () => {
        const val = document.getElementById('newQuickObsInput').value.trim();
        if(val) { await setDoc(doc(getQuickObsCollectionRef(), val.toLowerCase().replace(/[^a-z0-9]/g, '')), { text: val }); document.getElementById('newQuickObsInput').value = ''; loadMiniObs(); }
    };
    loadMiniObs();

    document.getElementById('btnSaveProduct').onclick = async () => {
        const submitBtn = document.getElementById('btnSaveProduct');
        toggleLoading(submitBtn, true, 'Salvando...');
        const selectedCatId = finalIdInput.value; 
        const isComposite = document.getElementById('isComposite').checked;
        const validComposition = isComposite ? currentComposition.filter(i => i.id && i.qty > 0) : [];
        const data = {
            name: document.getElementById('prodName').value,
            regular_price: document.getElementById('prodRegPrice').value,
            price: document.getElementById('prodPrice').value,
            categories: selectedCatId ? [{ id: parseInt(selectedCatId) }] : [],
            status: document.getElementById('prodStatus').value,
            description: document.getElementById('prodDesc').value,
            images: [{ src: document.getElementById('prodImg').value }],
            meta_data: [ { key: 'sector', value: document.getElementById('prodSector').value }, { key: 'is_composite', value: isComposite ? 'yes' : 'no' } ],
            composition: validComposition 
        };
        try { 
            if(isEdit) await updateWooProduct(product.id, data); else await createWooProduct(data); 
            showToast("Produto salvo!", false); 
            if(onBack) onBack(); 
        } catch(e) { showToast(e.message, true); } finally { toggleLoading(submitBtn, false); }
    };
    document.getElementById('btnBackToHub').onclick = onBack;
    document.getElementById('btnCancelForm').onclick = onBack;
}

// --- CATEGORIAS ---
async function renderCategoryManagement(container) {
    container.innerHTML = `<div class="flex justify-between items-center mb-4"><h4 class="font-bold text-white">Categorias</h4><button onclick="window.renderCategoryForm()" class="bg-green-600 text-white px-3 py-2 rounded hover:bg-green-700 transition"><i class="fas fa-plus"></i> Nova</button></div><div id="catList" class="space-y-2"></div>`;
    const list = document.getElementById('catList');
    const cats = await getCategories(); 
    const realCats = cats.filter(c => c.id !== 'all' && c.id !== 'top10');
    list.innerHTML = realCats.map(c => `<div class="flex justify-between items-center bg-dark-input p-3 rounded border border-gray-700"><span class="text-white">${c.name}</span><div class="space-x-2"><button onclick="window.renderCategoryForm('${c.id}')" class="text-blue-400"><i class="fas fa-edit"></i></button><button onclick="if(confirm('Excluir?')) { window.deleteWooCategory(${c.id}).then(() => window.switchHubTab('categories')); }" class="text-red-400"><i class="fas fa-trash"></i></button></div></div>`).join('');
}

async function renderCategoryForm(catId = null) {
    const isEdit = !!catId;
    const cats = getCategories();
    const cat = isEdit ? cats.find(c => c.id == catId) : null;
    const contentDiv = document.getElementById('hubContent');
    const options = cats.filter(c => c.id !== 'all' && c.id !== 'top10' && c.id != catId).map(c => `<option value="${c.id}" ${cat?.parent == c.id ? 'selected' : ''}>${c.name}</option>`).join('');
    contentDiv.innerHTML = `<div class="max-w-lg mx-auto bg-gray-800 p-6 rounded-lg border border-gray-700 mt-4"><h4 class="text-lg font-bold text-white mb-4">${isEdit ? 'Editar' : 'Nova'} Categoria</h4><div class="mb-4"><label class="block text-sm text-gray-400 mb-1">Nome</label><input type="text" id="catName" class="input-pdv w-full p-2" value="${cat?.name || ''}"></div><div class="mb-6"><label class="block text-sm text-gray-400 mb-1">Pai</label><select id="catParent" class="input-pdv w-full p-2"><option value="0">Nenhuma (Raiz)</option>${options}</select></div><div class="flex justify-end space-x-3"><button onclick="window.switchHubTab('categories')" class="px-4 py-2 bg-gray-600 text-white rounded">Cancelar</button><button id="btnSaveCat" class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">Salvar</button></div></div>`;
    document.getElementById('btnSaveCat').onclick = async () => {
        const btn = document.getElementById('btnSaveCat');
        const name = document.getElementById('catName').value;
        const parent = document.getElementById('catParent').value;
        if(!name) return alert('Nome obrigatório');
        toggleLoading(btn, true);
        try {
            if(isEdit) await updateWooCategory(catId, { name, parent: parseInt(parent) });
            else await createWooCategory(name, parseInt(parent));
            showToast('Salvo!');
            switchHubTab('categories');
        } catch(e) { console.error(e); showToast('Erro ao salvar category', true); toggleLoading(btn, false); }
    };
}

function getFormattedCategoryOptions(categories, selectedId) {
    return categories.filter(c => c.id !== 'all' && c.id !== 'top10').map(c => `<option value="${c.id}" ${c.id == selectedId ? 'selected' : ''}>${c.name}</option>`).join('');
}

// =================================================================
//           4. INICIALIZAÇÃO (INIT)
// =================================================================

export const initManagerController = () => {
    if (managerControllerInitialized) return;
    console.log("[ManagerController] Inicializando...");
    
    managerModal = document.getElementById('managerModal');
    if (managerModal) {
        managerModal.addEventListener('click', (e) => { if (e.target === managerModal) managerModal.style.display = 'none'; });
    }

    // Vouchers
    voucherManagementModal = document.getElementById('voucherManagementModal'); 
    voucherListContainer = document.getElementById('voucherListContainer');     
    voucherForm = document.getElementById('voucherForm');                       
    const voucherBtn = document.getElementById('showVoucherFormBtn');
    
    if(voucherBtn) {
        voucherBtn.addEventListener('click', () => { 
            if(voucherForm) { voucherForm.style.display = 'block'; voucherForm.reset(); }
        });
    }
    if (voucherForm) {
        voucherForm.addEventListener('submit', handleSaveVoucher);
    }

    // Relatórios
    reportDateInput = document.getElementById('reportDateInput');
    if (reportDateInput) {
        reportDateInput.valueAsDate = new Date(); 
        reportDateInput.addEventListener('change', () => {
            loadReports();
            if (managerModal && managerModal.style.display === 'flex' && document.getElementById('finContent')) {
                switchFinTab(currentFinTab);
            }
        });
    }
    
    const refreshBtn = document.getElementById('refreshReportBtn');
    if(refreshBtn) refreshBtn.addEventListener('click', loadReports);

    // Abas de Relatório
    const tabBtns = document.querySelectorAll('.report-tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => { b.classList.remove('bg-indigo-600', 'text-white'); b.classList.add('bg-dark-input', 'text-gray-300'); });
            btn.classList.remove('bg-dark-input', 'text-gray-300'); btn.classList.add('bg-indigo-600', 'text-white');
            document.querySelectorAll('.report-content').forEach(c => c.classList.add('hidden'));
            const targetContent = document.getElementById(`tab-${btn.dataset.tab}`);
            if(targetContent) targetContent.classList.remove('hidden');
            if (btn.dataset.tab === 'sales') fetchMonthlyPerformance();
            loadReports();
        });
    });

    // --- ATRIBUIÇÕES GLOBAIS (SEGURANÇA) ---
    window.handleSaveVoucher = handleSaveVoucher;
    window.handleDeleteVoucher = handleDeleteVoucher;
    window.toggleExpenseForm = toggleExpenseForm;
    window.saveExpense = saveExpense;
    window.deleteExpense = deleteExpense;
    window.handleForceCloseShift = handleForceCloseShift;
    window.openShiftDetails = openShiftDetails;
    window.deleteSector = deleteSector;
    window.setMonthlyGoal = setMonthlyGoal;
    window.runDateComparison = runDateComparison;
    window.switchFinTab = switchFinTab;
    window.openReportPanel = openReportPanel;
    
    // Hub / Estoque / Fornecedores
    window.renderProductHub = renderProductHub; 
    window.renderCategoryManagement = renderCategoryManagement; 
    window.renderCategoryForm = renderCategoryForm; 
    window.switchHubTab = switchHubTab;
    window.handleDeleteProduct = handleDeleteProduct;
    window.handleImportXML = handleImportXML;
    window.toggleCheckItem = toggleCheckItem;
    window.confirmStockEntry = confirmStockEntry;
    window.openManualStockEntry = openManualStockEntry;
    window.saveManualStockEntry = saveManualStockEntry;
    
    window.saveSupplier = saveSupplier;
    window.deleteSupplier = deleteSupplier;
    
    window.renderSectorManagementModal = renderSectorManagementModal;
    window.switchAuxTab = switchAuxTab;
    window.handleDeleteProduct = handleDeleteProduct;
    window.handleImportXML = handleImportXML;
    window.toggleCheckItem = toggleCheckItem;
    window.confirmStockEntry = confirmStockEntry;
    window.openManualStockEntry = openManualStockEntry;
    window.saveManualStockEntry = saveManualStockEntry;
    
    window.saveSupplier = saveSupplier;
    window.deleteSupplier = deleteSupplier;
    
    window.renderSectorManagementModal = renderSectorManagementModal;
    window.switchAuxTab = switchAuxTab;
    window.saveAuxiliary = saveAuxiliary;
    window.deleteAuxiliary = deleteAuxiliary;
    
    window.addCompItem = addCompItem;
    window.removeCompItem = removeCompItem;
    window.updateCompItem = updateCompItem;
    window.saveIngredient = saveIngredient;
    window.deleteIngredient = deleteIngredient;

    // RH
    window.renderHRPanel = renderHRPanel;
    window.switchHRTab = switchHRTab;
    window.generatePayslip = generatePayslip;
    window.renderExternalRecruitmentModal = renderExternalRecruitmentModal;
    
    // Helpers UI (Injetados)
    window.editIngredient = (id) => {
        const ing = ingredientsCache.find(i => i.id === id);
        if (!ing) return;
        document.getElementById('ingId').value = ing.id;
        document.getElementById('ingName').value = ing.name;
        document.getElementById('ingUnit').value = ing.unit;
        document.getElementById('ingCost').value = ing.cost;
        document.getElementById('ingStock').value = ing.stock;
        document.getElementById('ingMinStock').value = ing.minStock;
        if(document.getElementById('ingType')) document.getElementById('ingType').value = ing.type || '';
        document.getElementById('ingModalTitle').textContent = 'Editar Insumo';
        document.getElementById('ingredientFormModal').style.display = 'flex';
    };

    window.editSupplier = (id) => {
        const sup = suppliersCache.find(s => s.id === id);
        if (!sup) return;
        document.getElementById('supId').value = sup.id;
        document.getElementById('supName').value = sup.name;
        document.getElementById('supPhone').value = sup.phone || '';
        document.getElementById('supDoc').value = sup.document || '';
        document.getElementById('supCategory').value = sup.category || '';
        document.getElementById('supModalTitle').textContent = 'Editar Fornecedor';
        document.getElementById('supplierFormModal').style.display = 'flex';
    };

    managerControllerInitialized = true;
};

// =================================================================
//           5. ROTEADOR DE AÇÕES (EXPORTADO)
// =================================================================

export const handleGerencialAction = (action, payload) => {
    if (managerModal) managerModal.style.display = 'none';

    switch (action) {
        case 'openWaiterReg': openUserManagementModal(); break;
        case 'openProductHub': renderProductHub(payload || 'products'); break;
        case 'openProductManagement': renderProductHub('products'); break;
        case 'openVoucherManagement': openVoucherManagementModal(); break;
        case 'openSectorManagement': renderSectorManagementModal(); break;
        case 'openCustomerCRM': renderCustomerCrmModal(); break;
        case 'openWooSync': handleSyncAction(); break;
        case 'openCashManagementReport': openReportPanel('active-shifts'); break;
        case 'openFinancialModule': renderFinancialModule(); break;
        case 'closeDay': handleCloseDay(); break;
        case 'exportCsv': exportSalesToCSV(); break;
        case 'openHRPanel': renderHRPanel(); break; // RH adicionado
        default: console.warn(`Ação não mapeada: ${action}`);
    }
};

// =================================================================
//           6. MÓDULOS DE RENDERIZAÇÃO (UI)
// =================================================================

// --- HUB ---
async function renderProductHub(activeTab = 'products') {
    if (!managerModal) return;
    await fetchIngredients(); 
    
    // Buscamos as opções dinâmicas antes de renderizar
    let typeOptions = '<option value="">Geral</option>';
    try {
        const snapTypes = await getDocs(query(getCollectionRef('ingredient_types'), orderBy('name')));
        snapTypes.forEach(doc => { typeOptions += `<option value="${doc.data().name}">${doc.data().name}</option>`; });
    } catch(e) { console.error("Erro ao carregar tipos insumo", e); }

    let catOptionsSup = '<option value="">Geral</option>';
    try {
        const snapCats = await getDocs(query(getCollectionRef('supplier_categories'), orderBy('name')));
        snapCats.forEach(doc => { catOptionsSup += `<option value="${doc.data().name}">${doc.data().name}</option>`; });
    } catch(e) { console.error("Erro ao carregar cat fornecedor", e); }

    managerModal.innerHTML = `
        <div class="bg-dark-card border-0 md:border md:border-dark-border w-full h-full md:h-[90vh] md:max-w-6xl flex flex-col md:rounded-xl shadow-2xl overflow-hidden">
            <div class="flex justify-between items-center p-4 md:p-6 border-b border-gray-700 bg-gray-800 flex-shrink-0">
                <div><h3 class="text-xl md:text-2xl font-bold text-white">Gestão de Produtos</h3><p class="text-xs md:text-sm text-gray-400">Cardápio, Estoque e Fornecedores</p></div>
                <button class="text-gray-400 hover:text-white text-3xl leading-none p-2" onclick="document.getElementById('managerModal').style.display='none'">&times;</button>
            </div>
            <div class="flex items-center space-x-2 p-3 bg-dark-bg border-b border-gray-700 overflow-x-auto flex-shrink-0 whitespace-nowrap">
                <button class="hub-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center" onclick="window.switchHubTab('products')"><i class="fas fa-hamburger mr-2"></i> Produtos</button>
                <button class="hub-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center" onclick="window.switchHubTab('ingredients')"><i class="fas fa-cubes mr-2"></i> Insumos</button>
                <button class="hub-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center" onclick="window.switchHubTab('suppliers')"><i class="fas fa-truck mr-2"></i> Fornecedores</button>
                <button class="hub-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center" onclick="window.switchHubTab('shoppingList')"><i class="fas fa-shopping-cart mr-2"></i> Compras</button>
                <button class="hub-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center" onclick="window.switchHubTab('categories')"><i class="fas fa-tags mr-2"></i> Categorias</button>
            </div>
            <div id="productActionsToolbar" class="flex flex-col md:flex-row items-stretch md:items-center justify-between p-3 bg-dark-bg border-b border-gray-700 gap-3 flex-shrink-0"></div>
            <div id="hubContent" class="flex-grow overflow-y-auto p-3 md:p-4 custom-scrollbar bg-dark-bg relative"><div class="flex items-center justify-center h-full text-gray-500"><i class="fas fa-spinner fa-spin text-3xl"></i></div></div>
        </div>
        
        <div id="ingredientFormModal" class="absolute inset-0 bg-black/80 flex items-center justify-center z-50 hidden">
            <div class="bg-gray-800 p-6 rounded-lg w-full max-w-md border border-gray-600">
                <h3 class="text-lg font-bold text-white mb-4" id="ingModalTitle">Novo Insumo</h3>
                <input type="hidden" id="ingId">
                <div class="space-y-3">
                    <div><label class="text-xs text-gray-400">Nome</label><input id="ingName" type="text" class="input-pdv w-full p-2"></div>
                    <div>
                        <label class="text-xs text-gray-400">Tipo / Seção</label>
                        <select id="ingType" class="input-pdv w-full p-2">${typeOptions}</select>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div><label class="text-xs text-gray-400">Unidade</label><select id="ingUnit" class="input-pdv w-full p-2"><option value="un">Unidade (un)</option><option value="kg">Quilo (kg)</option><option value="l">Litro (l)</option><option value="g">Grama (g)</option><option value="ml">Mililitro (ml)</option></select></div>
                        <div><label class="text-xs text-gray-400">Custo (R$)</label><input id="ingCost" type="number" step="0.01" class="input-pdv w-full p-2"></div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div><label class="text-xs text-gray-400">Estoque Atual</label><input id="ingStock" type="number" step="0.001" class="input-pdv w-full p-2"></div>
                        <div><label class="text-xs text-gray-400">Estoque Mínimo</label><input id="ingMinStock" type="number" step="0.001" class="input-pdv w-full p-2"></div>
                    </div>
                </div>
                <div class="flex justify-end space-x-2 mt-6">
                    <button onclick="document.getElementById('ingredientFormModal').style.display='none'" class="px-4 py-2 bg-gray-600 text-white rounded">Cancelar</button>
                    <button onclick="window.saveIngredient()" class="px-4 py-2 bg-blue-600 text-white rounded font-bold">Salvar</button>
                </div>
            </div>
        </div>

        <div id="supplierFormModal" class="absolute inset-0 bg-black/80 flex items-center justify-center z-50 hidden">
            <div class="bg-gray-800 p-6 rounded-lg w-full max-w-md border border-gray-600">
                <h3 class="text-lg font-bold text-white mb-4" id="supModalTitle">Novo Fornecedor</h3>
                <input type="hidden" id="supId">
                <div class="space-y-3">
                    <div><label class="text-xs text-gray-400">Nome / Empresa</label><input id="supName" type="text" class="input-pdv w-full p-2"></div>
                    <div><label class="text-xs text-gray-400">Telefone</label><input id="supPhone" type="text" class="input-pdv w-full p-2"></div>
                    <div><label class="text-xs text-gray-400">CNPJ / CPF</label><input id="supDoc" type="text" class="input-pdv w-full p-2"></div>
                    <div><label class="text-xs text-gray-400">Categoria Principal</label><select id="supCategory" class="input-pdv w-full p-2">${catOptionsSup}</select></div>
                </div>
                <div class="flex justify-end space-x-2 mt-6">
                    <button onclick="document.getElementById('supplierFormModal').style.display='none'" class="px-4 py-2 bg-gray-600 text-white rounded">Cancelar</button>
                    <button onclick="window.saveSupplier()" class="px-4 py-2 bg-blue-600 text-white rounded font-bold">Salvar</button>
                </div>
            </div>
        </div>`;
    
    managerModal.style.display = 'flex';
    managerModal.classList.remove('p-4'); managerModal.classList.add('p-0', 'md:p-4');
    await switchHubTab(activeTab);
}

async function switchHubTab(tab) {
    currentHubTab = tab;
    const contentDiv = document.getElementById('hubContent');
    const toolbarDiv = document.getElementById('productActionsToolbar');
    
    document.querySelectorAll('.hub-tab-btn').forEach(btn => {
        const iconClass = tab === 'products' ? 'fa-hamburger' : 
                          tab === 'ingredients' ? 'fa-cubes' : 
                          tab === 'shoppingList' ? 'fa-shopping-cart' : 
                          tab === 'suppliers' ? 'fa-truck' : 'fa-tags';
        
        if(btn.innerHTML.includes(iconClass)) {
            btn.classList.add('bg-indigo-600', 'text-white'); btn.classList.remove('bg-dark-input', 'text-gray-300');
        } else {
            btn.classList.remove('bg-indigo-600', 'text-white'); btn.classList.add('bg-dark-input', 'text-gray-300');
        }
    });

    contentDiv.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500"><i class="fas fa-spinner fa-spin text-3xl"></i></div>';
    toolbarDiv.innerHTML = '';

    if (tab === 'products') await renderProductListConfig(contentDiv, toolbarDiv);
    else if (tab === 'ingredients') await renderIngredientsScreen(contentDiv, toolbarDiv);
    else if (tab === 'suppliers') await renderSuppliersScreen(contentDiv, toolbarDiv);
    else if (tab === 'shoppingList') await renderShoppingListScreen(contentDiv, toolbarDiv);
    else if (tab === 'categories') await renderCategoryManagement(contentDiv);
}

async function renderIngredientsScreen(container, toolbar) {
    toolbar.innerHTML = `<div class="flex-grow text-white font-bold text-sm items-center flex gap-2"><i class="fas fa-cubes text-blue-400"></i> Cadastro de Insumos</div><button onclick="document.getElementById('ingredientFormModal').style.display='flex'; document.getElementById('ingId').value=''; document.getElementById('ingName').value=''; document.getElementById('ingModalTitle').textContent='Novo Insumo';" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-lg flex items-center"><i class="fas fa-plus mr-2"></i> Novo</button>`;
    const ingredients = await fetchIngredients();
    if (ingredients.length === 0) { container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-gray-500"><i class="fas fa-box-open text-4xl mb-3"></i><p>Nenhum insumo cadastrado.</p></div>'; return; }
    
    container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${ingredients.map(ing => `
        <div class="bg-gray-800 p-4 rounded-lg border border-gray-700 flex justify-between items-center group hover:border-gray-500 transition">
            <div>
                <h4 class="font-bold text-white text-base">${ing.name}</h4>
                <div class="flex items-center gap-2 mt-1">
                    <span class="text-[10px] uppercase px-2 py-0.5 bg-gray-700 text-gray-300 rounded">${ing.type || 'Geral'}</span>
                </div>
                <p class="text-xs text-gray-400 mt-1">Custo: R$ ${ing.cost.toFixed(2)} / ${ing.unit}</p>
            </div>
            <div class="text-right">
                <div class="font-mono text-xl font-bold ${ing.stock <= ing.minStock ? 'text-red-500' : 'text-green-400'}">${ing.stock} <span class="text-xs text-gray-500">${ing.unit}</span></div>
                <div class="flex space-x-2 mt-2 justify-end opacity-50 group-hover:opacity-100 transition">
                    <button onclick="window.editIngredient('${ing.id}')" class="text-blue-400 hover:text-white"><i class="fas fa-edit"></i></button>
                    <button onclick="window.deleteIngredient('${ing.id}')" class="text-red-400 hover:text-white"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        </div>`).join('')}</div>`;
}

async function renderSuppliersScreen(container, toolbar) {
    toolbar.innerHTML = `<div class="flex-grow text-white font-bold text-sm items-center flex gap-2"><i class="fas fa-truck text-orange-400"></i> Base de Fornecedores</div><button onclick="document.getElementById('supplierFormModal').style.display='flex'; document.getElementById('supId').value=''; document.getElementById('supName').value=''; document.getElementById('supModalTitle').textContent='Novo Fornecedor';" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-lg flex items-center"><i class="fas fa-plus mr-2"></i> Novo</button>`;
    const suppliers = await fetchSuppliers();
    if (suppliers.length === 0) { container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-gray-500"><i class="fas fa-users-slash text-4xl mb-3"></i><p>Nenhum fornecedor cadastrado.</p></div>'; return; }
    
    container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${suppliers.map(sup => `
        <div class="bg-gray-800 p-4 rounded-lg border border-gray-700 flex justify-between items-center group hover:border-gray-500 transition">
            <div>
                <h4 class="font-bold text-white text-base">${sup.name}</h4>
                <p class="text-xs text-gray-400 mt-1"><i class="fas fa-phone mr-1"></i> ${sup.phone || 'Sem telefone'}</p>
                <span class="text-[10px] uppercase px-2 py-0.5 bg-gray-700 text-gray-300 rounded mt-2 inline-block">${sup.category || 'Geral'}</span>
            </div>
            <div class="flex flex-col space-y-2 items-end">
                <button onclick="window.editSupplier('${sup.id}')" class="text-blue-400 hover:text-white p-2"><i class="fas fa-edit"></i></button>
                <button onclick="window.deleteSupplier('${sup.id}')" class="text-red-400 hover:text-white p-2"><i class="fas fa-trash"></i></button>
            </div>
        </div>`).join('')}</div>`;
}

async function renderShoppingListScreen(container, toolbar) {
    toolbar.innerHTML = `<div class="flex-grow text-white font-bold text-sm items-center flex gap-2"><i class="fas fa-shopping-cart text-yellow-400"></i> Itens para Reposição</div><button onclick="window.print()" class="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg shadow flex items-center"><i class="fas fa-print mr-2"></i> Imprimir</button>`;
    const ingredients = await fetchIngredients();
    // Agrupa por tipo para facilitar a compra
    const shoppingList = ingredients.filter(ing => ing.stock <= ing.minStock).sort((a,b) => (a.type || '').localeCompare(b.type || ''));
    
    if (shoppingList.length === 0) { container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-green-500"><i class="fas fa-check-circle text-5xl mb-3"></i><p class="text-lg">Tudo certo! Estoque em dia.</p></div>'; return; }
    
    container.innerHTML = `<div class="bg-gray-800 rounded-xl overflow-hidden border border-gray-700"><table class="w-full text-left text-gray-300"><thead class="bg-gray-900 text-xs uppercase font-bold text-gray-500"><tr><th class="p-4">Item</th><th class="p-4">Tipo</th><th class="p-4 text-center">Estoque Atual</th><th class="p-4 text-center">Mínimo</th><th class="p-4 text-right">Comprar</th></tr></thead><tbody class="divide-y divide-gray-700">${shoppingList.map(ing => { 
        const needed = (ing.minStock - ing.stock); 
        const buyQty = needed > 0 ? needed : ing.minStock; 
        return `<tr class="hover:bg-gray-700/50">
            <td class="p-4 font-bold text-white">${ing.name}</td>
            <td class="p-4 text-xs text-gray-400 uppercase">${ing.type || '-'}</td>
            <td class="p-4 text-center text-red-400 font-mono">${ing.stock} ${ing.unit}</td>
            <td class="p-4 text-center text-gray-500 font-mono">${ing.minStock} ${ing.unit}</td>
            <td class="p-4 text-right font-bold text-yellow-400 text-lg"><i class="fas fa-arrow-right text-xs mr-2"></i> ${buyQty.toFixed(2)} ${ing.unit}</td>
        </tr>`; 
    }).join('')}</tbody></table></div>`;
}

async function renderProductListConfig(contentDiv, toolbarDiv) {
    const categories = getCategories();
    let catOptions = '<option value="all">Todas as Categorias</option>';
    if (categories.length > 0) categories.forEach(c => { if(c.id !== 'all' && c.id !== 'top10') catOptions += `<option value="${c.id}">${c.name}</option>`; });
    toolbarDiv.innerHTML = `<div class="flex items-center space-x-2 w-full md:w-auto"><select id="hubCategoryFilter" class="bg-gray-700 text-white text-sm py-3 px-3 rounded-lg border border-gray-600 w-full md:w-[200px]">${catOptions}</select></div><div class="flex items-center space-x-2 w-full md:w-auto"><div class="relative w-full md:w-64"><input type="text" id="hubSearchInput" placeholder="Pesquisar..." class="bg-dark-input text-white text-sm py-3 pl-3 pr-8 rounded-lg border border-gray-600 w-full focus:border-indigo-500"><i class="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i></div><button id="hubNewProductBtn" class="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition shadow-lg flex items-center justify-center whitespace-nowrap"><i class="fas fa-plus mr-2"></i> <span class="hidden md:inline">Novo</span></button></div>`;
    document.getElementById('hubNewProductBtn').onclick = () => renderProductForm(null, contentDiv, () => renderProductList(contentDiv, 'all', '', false));
    const catSelect = document.getElementById('hubCategoryFilter');
    const searchInput = document.getElementById('hubSearchInput');
    catSelect.onchange = (e) => { hubCategory = e.target.value; hubPage = 1; renderProductList(contentDiv, hubCategory, hubSearch, false); };
    searchInput.oninput = (e) => { hubSearch = e.target.value; hubPage = 1; clearTimeout(hubSearchTimeout); hubSearchTimeout = setTimeout(() => { renderProductList(contentDiv, hubCategory, hubSearch, false); }, 600); };
    await fetchWooCommerceProducts(1, '', 'all', false);
    await renderProductList(contentDiv, 'all', '', false);
}

async function renderProductList(container, catFilter, searchTerm, append = false) {
    if (!append) { container.innerHTML = '<div class="flex justify-center py-10"><i class="fas fa-spinner fa-spin text-3xl text-gray-500"></i></div>'; await fetchWooCommerceProducts(1, searchTerm, catFilter, false); }
    let products = getProducts();
    if (products.length === 0 && !append) { container.innerHTML = '<p class="text-center text-gray-500 py-10">Nenhum produto encontrado.</p>'; return; }
    const listHtml = products.map(p => `<div class="flex justify-between items-center bg-dark-input p-3 rounded-lg mb-2 border border-gray-700 hover:border-gray-500 transition group"><div class="flex items-center space-x-3 overflow-hidden"><div class="w-12 h-12 rounded-lg bg-gray-800 overflow-hidden flex-shrink-0 border border-gray-600"><img src="${p.image || 'https://placehold.co/50'}" class="w-full h-full object-cover"></div><div class="min-w-0"><h4 class="font-bold text-white text-sm truncate">${p.name}</h4><div class="flex items-center text-xs space-x-2 mt-1"><span class="text-green-400 font-mono bg-green-900/30 px-1.5 py-0.5 rounded">${formatCurrency(p.price)}</span>${p.status !== 'publish' ? '<span class="text-yellow-500 bg-yellow-900/30 px-1.5 rounded">Oculto</span>' : ''}</div></div></div><div class="flex space-x-2 flex-shrink-0"><button class="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg text-sm btn-edit-prod shadow" data-id="${p.id}"><i class="fas fa-edit"></i></button><button class="bg-red-600 hover:bg-red-500 text-white p-2 rounded-lg text-sm btn-del-prod shadow" data-id="${p.id}"><i class="fas fa-trash"></i></button></div></div>`).join('');
    const loadMoreHtml = `<div class="pt-4 pb-20 text-center" id="hubLoadMoreContainer"><button id="hubLoadMoreBtn" class="w-full md:w-1/2 py-3 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition font-bold border border-gray-600">Carregar Mais Produtos</button></div>`;
    if (!append) container.innerHTML = `<div class="pb-4">${listHtml}</div>${loadMoreHtml}`; else { const loadMoreContainer = document.getElementById('hubLoadMoreContainer'); if(loadMoreContainer) loadMoreContainer.remove(); container.insertAdjacentHTML('beforeend', `<div class="pb-4">${listHtml}</div>${loadMoreHtml}`); }
    container.querySelectorAll('.btn-edit-prod').forEach(btn => btn.onclick = () => { const prod = products.find(p => p.id == btn.dataset.id); renderProductForm(prod, container, () => renderProductList(container, catFilter, searchTerm, false)); });
    container.querySelectorAll('.btn-del-prod').forEach(btn => btn.onclick = () => handleDeleteProduct(btn.dataset.id, () => renderProductList(container, catFilter, searchTerm, false)));
    const loadBtn = document.getElementById('hubLoadMoreBtn');
    if (loadBtn) { loadBtn.onclick = async () => { toggleLoading(loadBtn, true, 'Carregando...'); hubPage++; const newItems = await fetchWooCommerceProducts(hubPage, searchTerm, catFilter, true); if (newItems.length === 0) { showToast("Não há mais produtos.", false); loadBtn.style.display = 'none'; } else { renderProductList(container, catFilter, searchTerm, true); } }; }
}

async function renderProductForm(product = null, container, onBack) {
    const isEdit = !!product;
    const sectorsSnap = await getDocs(query(getSectorsCollectionRef(), where('type', '==', 'production'), orderBy('name')));
    const sectors = sectorsSnap.docs.map(d => d.data().name);
    currentComposition = product?.composition || [];
    
    container.innerHTML = `
        <div class="w-full h-full flex flex-col bg-dark-bg">
            <div class="flex justify-between items-center mb-2 pb-2 border-b border-gray-700 flex-shrink-0"><h4 class="text-lg font-bold text-white flex items-center truncate"><i class="fas ${isEdit ? 'fa-edit text-blue-400' : 'fa-plus-circle text-green-400'} mr-2"></i>${isEdit ? 'Editar' : 'Novo'}</h4><button id="btnBackToHub" class="text-gray-400 hover:text-white flex items-center text-sm py-2 px-3 rounded bg-gray-800"><i class="fas fa-arrow-left mr-1"></i> Voltar</button></div>
            <div class="flex space-x-2 mb-4 overflow-x-auto pb-2 flex-shrink-0"><button class="form-tab-btn px-4 py-2 rounded-full bg-indigo-600 text-white text-sm font-bold whitespace-nowrap" data-target="tab-general">Geral</button><button class="form-tab-btn px-4 py-2 rounded-full bg-gray-700 text-gray-300 text-sm font-bold whitespace-nowrap" data-target="tab-hierarchy">Hierarquia</button><button class="form-tab-btn px-4 py-2 rounded-full bg-gray-700 text-gray-300 text-sm font-bold whitespace-nowrap" data-target="tab-recipe">Ficha Técnica</button><button class="form-tab-btn px-4 py-2 rounded-full bg-gray-700 text-gray-300 text-sm font-bold whitespace-nowrap" data-target="tab-obs">Obs</button></div>
            <div class="flex-grow overflow-y-auto custom-scrollbar pr-1 pb-20">
                <form id="productForm" class="space-y-6">
                    <div id="tab-general" class="form-tab-content"><div class="space-y-4"><div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Nome</label><input type="text" id="prodName" class="input-pdv w-full text-lg p-3" value="${product?.name || ''}" required></div><div class="grid grid-cols-2 gap-4"><div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Preço</label><input type="number" id="prodPrice" class="input-pdv w-full font-mono text-green-400 font-bold text-lg p-3" step="0.01" value="${product?.price || ''}" required></div><div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Promo</label><input type="number" id="prodRegPrice" class="input-pdv w-full font-mono text-yellow-400 text-lg p-3" step="0.01" value="${product?.regular_price || ''}"></div></div><div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Status</label><select id="prodStatus" class="input-pdv w-full p-3"><option value="publish" ${product?.status === 'publish' ? 'selected' : ''}>Publicado</option><option value="draft" ${product?.status === 'draft' ? 'selected' : ''}>Rascunho</option></select></div><div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">URL Imagem</label><input type="text" id="prodImg" class="input-pdv w-full text-xs p-3" value="${product?.image || ''}"></div><div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Descrição</label><textarea id="prodDesc" class="input-pdv w-full text-sm p-3" rows="3">${product?.description || ''}</textarea></div></div></div>
                    <div id="tab-hierarchy" class="form-tab-content hidden"><div class="bg-gray-800 p-4 rounded-xl border border-gray-600 space-y-4"><p class="text-sm text-pumpkin font-bold uppercase mb-2">Classificação</p><div><label class="text-xs text-gray-500 block mb-1">1. Grupo</label><select id="catLvl1" class="input-pdv w-full text-sm p-2"></select></div><div><label class="text-xs text-gray-500 block mb-1">2. Subgrupo</label><select id="catLvl2" class="input-pdv w-full text-sm p-2" disabled></select></div><div><label class="text-xs text-gray-500 block mb-1">3. Categoria</label><select id="catLvl3" class="input-pdv w-full text-sm p-2" disabled></select></div><div><label class="text-xs text-gray-500 block mb-1">4. Variação</label><select id="catLvl4" class="input-pdv w-full text-sm p-2" disabled></select></div><input type="hidden" id="finalCategoryId" value="${product?.categoryId || ''}"><div class="pt-4 border-t border-gray-600"><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Setor de Produção (KDS)</label><select id="prodSector" class="input-pdv w-full p-2">${sectors.length > 0 ? sectors.map(s => `<option value="${s}">${s}</option>`).join('') : '<option value="cozinha">Cozinha</option>'}</select></div></div></div>
                    <div id="tab-recipe" class="form-tab-content hidden space-y-6">
                         <div class="bg-gray-800 p-4 rounded-xl border border-gray-600"><label class="flex items-center space-x-3 cursor-pointer mb-4"><input type="checkbox" id="isComposite" class="w-6 h-6 rounded bg-dark-input border-gray-500 text-indigo-600" ${product?.composition?.length > 0 ? 'checked' : ''}><span class="text-white font-bold">Este Produto Consome Insumos?</span></label><div id="compositionContainer" class="space-y-2 ${product?.composition?.length > 0 ? '' : 'hidden'}"><h5 class="text-xs font-bold text-gray-500 uppercase mb-2">Ingredientes (Baixa Automática)</h5><div id="compositionList"></div><button type="button" onclick="window.addCompItem()" class="text-xs bg-indigo-600 text-white px-3 py-2 rounded w-full font-bold mt-2 hover:bg-indigo-500"><i class="fas fa-plus mr-2"></i> Adicionar Ingrediente</button></div></div>
                    </div>
                    <div id="tab-obs" class="form-tab-content hidden"><div class="bg-gray-800 p-4 rounded-xl border border-gray-600"><p class="text-sm text-gray-300 mb-3">Obs. específicas.</p><div class="flex space-x-2 mb-4"><input type="text" id="newQuickObsInput" placeholder="Nova obs..." class="input-pdv w-full text-sm p-3"><button type="button" id="btnAddQuickObs" class="bg-green-600 text-white px-4 rounded-lg font-bold"><i class="fas fa-plus"></i></button></div><div id="quickObsListSmall" class="grid grid-cols-2 gap-2"></div></div></div>
                </form>
            </div>
            <div class="border-t border-gray-700 pt-4 mt-auto flex space-x-3 flex-shrink-0 bg-dark-bg"><button type="button" id="btnCancelForm" class="flex-1 py-4 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-bold transition">Cancelar</button><button type="button" id="btnSaveProduct" class="flex-1 py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition shadow-lg flex items-center justify-center"><i class="fas fa-save mr-2"></i> Salvar</button></div>
        </div>`;

    await fetchIngredients();
    updateCompListUI();

    const tabBtns = container.querySelectorAll('.form-tab-btn');
    const tabContents = container.querySelectorAll('.form-tab-content');
    tabBtns.forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            tabBtns.forEach(b => { b.classList.remove('bg-indigo-600', 'text-white'); b.classList.add('bg-gray-700', 'text-gray-300'); });
            btn.classList.remove('bg-gray-700', 'text-gray-300'); btn.classList.add('bg-indigo-600', 'text-white');
            tabContents.forEach(c => c.classList.add('hidden'));
            document.getElementById(btn.dataset.target).classList.remove('hidden');
        };
    });

    const compCheck = document.getElementById('isComposite');
    const compContainer = document.getElementById('compositionContainer');
    compCheck.onchange = () => { if(compCheck.checked) compContainer.classList.remove('hidden'); else compContainer.classList.add('hidden'); };

    const allCats = getCategories();
    const selects = [document.getElementById('catLvl1'), document.getElementById('catLvl2'), document.getElementById('catLvl3'), document.getElementById('catLvl4')];
    const finalIdInput = document.getElementById('finalCategoryId');
    const populateSelect = (levelIndex, parentId) => {
        const select = selects[levelIndex];
        select.innerHTML = '<option value="">Selecione...</option>';
        const children = allCats.filter(c => c.parent == parentId && c.id !== 'all' && c.id !== 'top10');
        if (children.length === 0) { select.disabled = true; } else { select.disabled = false; children.forEach(c => { const opt = document.createElement('option'); opt.value = c.id; opt.textContent = c.name; select.appendChild(opt); }); }
        for(let i = levelIndex + 1; i < 4; i++) { selects[i].innerHTML = ''; selects[i].disabled = true; }
    };
    selects.forEach((sel, idx) => {
        sel.onchange = () => {
            const selectedVal = sel.value;
            if (selectedVal) { finalIdInput.value = selectedVal; if (idx < 3) populateSelect(idx + 1, selectedVal); } 
            else { finalIdInput.value = idx > 0 ? selects[idx-1].value : ''; for(let i = idx + 1; i < 4; i++) { selects[i].innerHTML = ''; selects[i].disabled = true; } }
        };
    });
    const getPath = (id) => { let path = []; let curr = allCats.find(c => c.id == id); while(curr) { path.unshift(curr.id); curr = allCats.find(c => c.id == curr.parent); } return path; };
    const currentPath = product?.categoryId ? getPath(product.categoryId) : [];
    populateSelect(0, 0);
    if (currentPath.length > 0) {
        selects[0].value = currentPath[0]; populateSelect(1, currentPath[0]);
        if (currentPath[1]) { selects[1].value = currentPath[1]; populateSelect(2, currentPath[1]); }
        if (currentPath[2]) { selects[2].value = currentPath[2]; populateSelect(3, currentPath[2]); }
        if (currentPath[3]) { selects[3].value = currentPath[3]; }
    }
    
    const loadMiniObs = async () => {
        const containerObs = document.getElementById('quickObsListSmall');
        const snap = await getDocs(query(getQuickObsCollectionRef(), orderBy('text')));
        containerObs.innerHTML = snap.docs.map(d => `<div class="flex justify-between items-center bg-dark-bg p-2 rounded border border-gray-600"><span class="text-xs text-gray-300">${d.data().text}</span><button type="button" class="text-red-400 hover:text-white text-xs btn-del-mini-obs" data-id="${d.id}">&times;</button></div>`).join('');
        containerObs.querySelectorAll('.btn-del-mini-obs').forEach(btn => btn.onclick = async () => { if(confirm("Apagar?")) { await deleteDoc(doc(getQuickObsCollectionRef(), btn.dataset.id)); loadMiniObs(); }});
    };
    document.getElementById('btnAddQuickObs').onclick = async () => {
        const val = document.getElementById('newQuickObsInput').value.trim();
        if(val) { await setDoc(doc(getQuickObsCollectionRef(), val.toLowerCase().replace(/[^a-z0-9]/g, '')), { text: val }); document.getElementById('newQuickObsInput').value = ''; loadMiniObs(); }
    };
    loadMiniObs();

    document.getElementById('btnSaveProduct').onclick = async () => {
        const submitBtn = document.getElementById('btnSaveProduct');
        toggleLoading(submitBtn, true, 'Salvando...');
        const selectedCatId = finalIdInput.value; 
        const isComposite = document.getElementById('isComposite').checked;
        const validComposition = isComposite ? currentComposition.filter(i => i.id && i.qty > 0) : [];
        const data = {
            name: document.getElementById('prodName').value,
            regular_price: document.getElementById('prodRegPrice').value,
            price: document.getElementById('prodPrice').value,
            categories: selectedCatId ? [{ id: parseInt(selectedCatId) }] : [],
            status: document.getElementById('prodStatus').value,
            description: document.getElementById('prodDesc').value,
            images: [{ src: document.getElementById('prodImg').value }],
            meta_data: [ { key: 'sector', value: document.getElementById('prodSector').value }, { key: 'is_composite', value: isComposite ? 'yes' : 'no' } ],
            composition: validComposition 
        };
        try { 
            if(isEdit) await updateWooProduct(product.id, data); else await createWooProduct(data); 
            showToast("Produto salvo!", false); 
            if(onBack) onBack(); 
        } catch(e) { showToast(e.message, true); } finally { toggleLoading(submitBtn, false); }
    };
    document.getElementById('btnBackToHub').onclick = onBack;
    document.getElementById('btnCancelForm').onclick = onBack;
}

// --- CATEGORIAS ---
async function renderCategoryManagement(container) {
    container.innerHTML = `<div class="flex justify-between items-center mb-4"><h4 class="font-bold text-white">Categorias</h4><button onclick="window.renderCategoryForm()" class="bg-green-600 text-white px-3 py-2 rounded hover:bg-green-700 transition"><i class="fas fa-plus"></i> Nova</button></div><div id="catList" class="space-y-2"></div>`;
    const list = document.getElementById('catList');
    const cats = await getCategories(); 
    const realCats = cats.filter(c => c.id !== 'all' && c.id !== 'top10');
    list.innerHTML = realCats.map(c => `<div class="flex justify-between items-center bg-dark-input p-3 rounded border border-gray-700"><span class="text-white">${c.name}</span><div class="space-x-2"><button onclick="window.renderCategoryForm('${c.id}')" class="text-blue-400"><i class="fas fa-edit"></i></button><button onclick="if(confirm('Excluir?')) { window.deleteWooCategory(${c.id}).then(() => window.switchHubTab('categories')); }" class="text-red-400"><i class="fas fa-trash"></i></button></div></div>`).join('');
}

async function renderCategoryForm(catId = null) {
    const isEdit = !!catId;
    const cats = getCategories();
    const cat = isEdit ? cats.find(c => c.id == catId) : null;
    const contentDiv = document.getElementById('hubContent');
    const options = cats.filter(c => c.id !== 'all' && c.id !== 'top10' && c.id != catId).map(c => `<option value="${c.id}" ${cat?.parent == c.id ? 'selected' : ''}>${c.name}</option>`).join('');
    contentDiv.innerHTML = `<div class="max-w-lg mx-auto bg-gray-800 p-6 rounded-lg border border-gray-700 mt-4"><h4 class="text-lg font-bold text-white mb-4">${isEdit ? 'Editar' : 'Nova'} Categoria</h4><div class="mb-4"><label class="block text-sm text-gray-400 mb-1">Nome</label><input type="text" id="catName" class="input-pdv w-full p-2" value="${cat?.name || ''}"></div><div class="mb-6"><label class="block text-sm text-gray-400 mb-1">Pai</label><select id="catParent" class="input-pdv w-full p-2"><option value="0">Nenhuma (Raiz)</option>${options}</select></div><div class="flex justify-end space-x-3"><button onclick="window.switchHubTab('categories')" class="px-4 py-2 bg-gray-600 text-white rounded">Cancelar</button><button id="btnSaveCat" class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">Salvar</button></div></div>`;
    document.getElementById('btnSaveCat').onclick = async () => {
        const btn = document.getElementById('btnSaveCat');
        const name = document.getElementById('catName').value;
        const parent = document.getElementById('catParent').value;
        if(!name) return alert('Nome obrigatório');
        toggleLoading(btn, true);
        try {
            if(isEdit) await updateWooCategory(catId, { name, parent: parseInt(parent) });
            else await createWooCategory(name, parseInt(parent));
            showToast('Salvo!');
            switchHubTab('categories');
        } catch(e) { console.error(e); showToast('Erro ao salvar category', true); toggleLoading(btn, false); }
    };
}

function getFormattedCategoryOptions(categories, selectedId) {
    return categories.filter(c => c.id !== 'all' && c.id !== 'top10').map(c => `<option value="${c.id}" ${c.id == selectedId ? 'selected' : ''}>${c.name}</option>`).join('');
}
