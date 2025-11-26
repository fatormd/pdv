// --- CONTROLLERS/MANAGERCONTROLLER.JS (VERSÃO FINAL DEFINITIVA E CORRIGIDA) ---
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

// Estado do Hub e Estoque
let hubPage = 1;
let hubSearch = '';
let hubCategory = 'all';
let hubSearchTimeout = null;
let inventoryChecklist = [];
let currentComposition = []; 

// =================================================================
//           2. FUNÇÕES AUXILIARES E AÇÕES (LOGIC)
// =================================================================

const toLocalISO = (date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().split('T')[0];
};

// --- AÇÕES GERAIS ---
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

// --- AÇÕES DE VOUCHER ---
async function handleSaveVoucher(e) {
    e.preventDefault();
    const id = document.getElementById('voucherIdInput').value || doc(getVouchersCollectionRef()).id;
    await setDoc(doc(getVouchersCollectionRef(), id), { 
        id, 
        name: document.getElementById('voucherNameInput').value, 
        points: parseInt(document.getElementById('voucherPointsInput').value), 
        value: parseFloat(document.getElementById('voucherValueInput').value) 
    });
    voucherForm.style.display = 'none'; 
    fetchVouchers();
}

async function handleDeleteVoucher(id) {
    if(confirm("Excluir voucher?")) { 
        await deleteDoc(doc(getVouchersCollectionRef(), id)); 
        fetchVouchers(); 
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
    managerModal.style.display = 'none';
    voucherManagementModal.style.display = 'flex';
    await fetchVouchers();
}

// --- AÇÕES FINANCEIRAS ---
async function saveExpense() {
    const btn = document.getElementById('btnSaveExpense');
    const desc = document.getElementById('expDesc').value;
    const amount = parseFloat(document.getElementById('expAmount').value);
    const date = document.getElementById('expDate').value;
    const cat = document.getElementById('expCat').value;
    const docNum = document.getElementById('expDocNumber').value;
    const barcode = document.getElementById('expBarcode').value;

    if (!desc || isNaN(amount) || !date) { showToast("Preencha campos obrigatórios.", true); return; }
    toggleLoading(btn, true, 'Salvando...');
    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'expenses'), {
            description: desc, amount: amount, date: date, category: cat,
            documentNumber: docNum || null, barcode: barcode || null, createdAt: serverTimestamp()
        });
        showToast("Salvo!", false); 
        switchFinTab('expenses');
    } catch (e) { showToast("Erro.", true); } 
    finally { toggleLoading(btn, false, 'Salvar Lançamento'); }
}

async function deleteExpense(id) {
    if(confirm("Excluir este lançamento?")) {
        try { 
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'expenses', id)); 
            switchFinTab('expenses'); 
            showToast("Excluído."); 
        } catch(e) { showToast("Erro.", true); }
    }
}

function toggleExpenseForm() {
    document.getElementById('expenseForm').classList.toggle('hidden');
}

// --- AÇÕES DE PRODUTO E ESTOQUE ---
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

// Helpers Ficha Técnica (Insumos)
function addCompItem() { currentComposition.push({ id: '', qty: 1 }); updateCompListUI(); }
function removeCompItem(idx) { currentComposition.splice(idx, 1); updateCompListUI(); }
function updateCompItem(idx, field, val) { currentComposition[idx][field] = field === 'qty' ? parseFloat(val) : val; }

const updateCompListUI = () => {
    const list = document.getElementById('compositionList');
    if(!list) return;
    const allProducts = getProducts();
    list.innerHTML = currentComposition.map((item, idx) => `
        <div class="flex space-x-2 mb-2 items-center bg-dark-input p-2 rounded border border-gray-700">
            <select onchange="window.updateCompItem(${idx}, 'id', this.value)" class="bg-gray-700 text-white text-xs p-2 rounded flex-grow border-0">
                <option value="">Selecione...</option>
                ${allProducts.map(p => `<option value="${p.id}" ${p.id == item.id ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
            <input type="number" value="${item.qty}" onchange="window.updateCompItem(${idx}, 'qty', this.value)" class="bg-gray-700 text-white w-20 p-2 rounded text-center text-xs" placeholder="Qtd">
            <button type="button" onclick="window.removeCompItem(${idx})" class="text-red-400 hover:text-red-200 px-2"><i class="fas fa-times"></i></button>
        </div>
    `).join('');
};

// Ações de Estoque (XML e Manual)
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
    if(!prodId || !qty || qty <= 0) { showToast("Selecione produto e quantidade.", true); return; }
    const product = getProducts().find(p => p.id == prodId);
    toggleLoading(btn, true, 'Salvando...');
    const batch = writeBatch(db);
    try {
        const stockRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'stock'), prodId.toString());
        batch.set(stockRef, { quantity: increment(qty), lastUpdate: serverTimestamp(), name: product.name }, { merge: true });
        const movementRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory_movements'));
        batch.set(movementRef, { type: 'manual_in', source: note, date: serverTimestamp(), items: [{ systemId: prodId, systemName: product.name, qty: qty, cost: cost }], totalCost: qty * cost, registeredBy: 'Gerente' });
        await batch.commit();
        showToast("Estoque atualizado!", false);
        switchHubTab('inventory');
    } catch(e) { console.error(e); showToast("Erro ao salvar.", true); } finally { toggleLoading(btn, false); }
}

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
    toolbarDiv.innerHTML = `<h4 class="text-white font-bold">Conferência NF ${nNF} - ${emitente}</h4>`;
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
            const stockRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'stock'), item.systemId.toString());
            batch.set(stockRef, { quantity: increment(item.qty), lastUpdate: serverTimestamp(), name: item.systemName }, { merge: true });
            totalCost += (item.qty * item.cost);
        });
        const movementRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory_movements'));
        batch.set(movementRef, { type: 'in', source: `NF ${nNF} - ${emitente}`, date: serverTimestamp(), items: itemsToProcess, totalCost: totalCost });
        await batch.commit();
        showToast(`Estoque atualizado!`, false);
        switchHubTab('inventory');
    } catch (e) { console.error(e); showToast("Erro ao atualizar estoque.", true); } finally { toggleLoading(btn, false); }
}

// --- AÇÕES DE RELATÓRIO E CAIXA ---
async function handleForceCloseShift(shiftId, shiftUserId) {
    if (!confirm("ATENÇÃO: Deseja forçar o fechamento deste caixa?")) return;
    try {
        const shiftRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), shiftId);
        const shiftSnap = await getDoc(shiftRef);
        if (!shiftSnap.exists()) throw new Error("Turno não encontrado.");
        const shiftData = shiftSnap.data();
        const tablesQ = query(getTablesCollectionRef(), where('status', '==', 'closed'), where('closedBy', '==', shiftUserId), where('closedAt', '>=', shiftData.openedAt));
        const salesSnap = await getDocs(tablesQ);
        let totalMoney = 0, totalDigital = 0;
        salesSnap.forEach(tDoc => {
            const t = tDoc.data();
            (t.payments || []).forEach(p => {
                const val = parseFloat(p.value.replace(/[^\d,.-]/g, '').replace(',', '.'));
                if (!isNaN(val)) { if (p.method.toLowerCase().includes('dinheiro')) totalMoney += val; else totalDigital += val; }
            });
        });
        await updateDoc(shiftRef, { status: 'closed', closedAt: serverTimestamp(), finalCashInDrawer: 0, difference: 0, justification: "Fechamento Forçado Gerente", reportSalesMoney: totalMoney, reportSalesDigital: totalDigital });
        showToast("Caixa encerrado.", false); loadReports();
    } catch (e) { showToast("Erro: " + e.message, true); }
}

async function handleCloseDay() { 
    if (confirm("Encerrar Turno?")) { 
        try { await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', 'daily_reports'), `daily_${new Date().toISOString().split('T')[0]}`), { closedAt: serverTimestamp() }); showToast("Turno Encerrado!", false); loadReports(); } 
        catch (e) { showToast(e.message, true); } 
    } 
}

async function exportSalesToCSV() { 
    if (!reportDateInput) return; 
    const dateVal = reportDateInput.value; 
    if(!dateVal) { showToast("Selecione data.", true); return; } 
    const start = Timestamp.fromDate(new Date(dateVal + 'T00:00:00')); 
    const end = Timestamp.fromDate(new Date(dateVal + 'T23:59:59')); 
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'tables'), where('status', '==', 'closed'), where('closedAt', '>=', start), where('closedAt', '<=', end)); 
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
    const getDayTotal = async (dateStr) => { const start = Timestamp.fromDate(new Date(dateStr + 'T00:00:00')); const end = Timestamp.fromDate(new Date(dateStr + 'T23:59:59')); const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'tables'), where('status', '==', 'closed'), where('closedAt', '>=', start), where('closedAt', '<=', end)); const snapshot = await getDocs(q); let total = 0; snap.forEach(d => { (d.data().payments || []).forEach(p => { const v = parseFloat(p.value.toString().replace(/[^\d,.-]/g,'').replace(',','.')); if(!isNaN(v)) total += v; }); }); return total; }; 
    const [totalA, totalB] = await Promise.all([getDayTotal(dateA), getDayTotal(dateB)]); 
    document.getElementById('compValueA').textContent = formatCurrency(totalA); 
    document.getElementById('compValueB').textContent = formatCurrency(totalB); 
    const diff = totalA > 0 ? ((totalB - totalA) / totalA) * 100 : (totalB > 0 ? 100 : 0); 
    const el = document.getElementById('compDiffValue'); 
    el.textContent = `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`; 
    el.className = `text-xl font-extrabold ${diff >= 0 ? 'text-green-400' : 'text-red-400'}`; 
    document.getElementById('comparisonResult').classList.remove('hidden'); 
}


// =================================================================
//           3. INICIALIZAÇÃO E ROTEADOR
// =================================================================

export const initManagerController = () => {
    if (managerControllerInitialized) return;
    console.log("[ManagerController] Inicializando...");
    
    managerModal = document.getElementById('managerModal');
    if (managerModal) {
        managerModal.addEventListener('click', (e) => {
             if (e.target === managerModal) managerModal.style.display = 'none';
        });
    }

    document.querySelectorAll('button').forEach(btn => {
        if(btn.textContent.includes('Abrir Turno') || (btn.onclick && btn.onclick.toString().includes('openHouse'))) {
            btn.style.display = 'none';
        }
    });

    voucherManagementModal = document.getElementById('voucherManagementModal'); 
    voucherListContainer = document.getElementById('voucherListContainer');     
    voucherForm = document.getElementById('voucherForm');                       
    const voucherBtn = document.getElementById('showVoucherFormBtn');
    if(voucherBtn) {
        voucherBtn.addEventListener('click', () => { 
            if(voucherForm) { voucherForm.style.display = 'block'; voucherForm.reset(); }
        });
    }
    if (voucherForm) voucherForm.addEventListener('submit', handleSaveVoucher);

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
            
            if (btn.dataset.tab === 'sales') {
                fetchMonthlyPerformance(); 
            }
            loadReports();
        });
    });

    // --- ATRIBUIÇÕES GLOBAIS FINAIS ---
    window.toggleExpenseForm = toggleExpenseForm;
    window.saveExpense = saveExpense;
    window.deleteExpense = deleteExpense;
    window.handleForceCloseShift = handleForceCloseShift;
    window.openShiftDetails = openShiftDetails;
    window.handleDeleteVoucher = handleDeleteVoucher;
    window.deleteSector = deleteSector;
    window.setMonthlyGoal = setMonthlyGoal;
    window.runDateComparison = runDateComparison;
    window.switchFinTab = switchFinTab;
    window.handleDeleteProduct = handleDeleteProduct;
    window.switchHubTab = switchHubTab;
    window.handleImportXML = handleImportXML;
    window.toggleCheckItem = toggleCheckItem;
    window.confirmStockEntry = confirmStockEntry;
    window.openManualStockEntry = openManualStockEntry;
    window.saveManualStockEntry = saveManualStockEntry;
    window.addCompItem = addCompItem;
    window.removeCompItem = removeCompItem;
    window.updateCompItem = updateCompItem;
    window.renderProductHub = renderProductHub; 
    window.renderCategoryManagement = renderCategoryManagement; 
    window.renderCategoryForm = renderCategoryForm; 

    managerControllerInitialized = true;
};

// =================================================================
//           4. ROTEADOR DE AÇÕES
// =================================================================

export const handleGerencialAction = (action, payload) => {
    if (managerModal) managerModal.style.display = 'none';

    switch (action) {
        case 'openWaiterReg': openUserManagementModal(); break;
        case 'openProductHub': renderProductHub(payload || 'products'); break;
        case 'openQuickObsManagement': renderProductHub('obs'); break;
        case 'openProductManagement': renderProductHub('products'); break;
        case 'openInventoryManagement': renderProductHub('inventory'); break; 
        case 'openRecipesManagement': renderProductHub('recipes'); break;
        case 'openVoucherManagement': openVoucherManagementModal(); break;
        case 'openSectorManagement': renderSectorManagementModal(); break;
        case 'openCustomerCRM': renderCustomerCrmModal(); break;
        case 'openWooSync': handleSyncAction(); break;
        case 'openCashManagementReport': openReportPanel('active-shifts'); break;
        case 'openFinancialModule': renderFinancialModule(); break;
        case 'closeDay': handleCloseDay(); break;
        case 'exportCsv': exportSalesToCSV(); break;
        default: console.warn(`Ação não mapeada: ${action}`);
    }
};

// =================================================================
//           5. MÓDULOS DE RENDERIZAÇÃO
// =================================================================

// --- FINANCEIRO ---
async function renderFinancialModule() {
    if (!managerModal) return;
    managerModal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 w-full max-w-5xl h-[90vh] flex flex-col rounded-xl shadow-2xl overflow-hidden">
            <div class="flex justify-between items-center p-6 border-b border-gray-700 bg-gray-800">
                <div><h3 class="text-2xl font-bold text-pink-500"><i class="fas fa-chart-pie mr-2"></i>Financeiro</h3><p class="text-sm text-gray-400">DRE e Contas a Pagar</p></div>
                <button class="text-gray-400 hover:text-white text-3xl leading-none" onclick="document.getElementById('managerModal').style.display='none'">&times;</button>
            </div>
            <div class="flex p-4 bg-dark-bg border-b border-gray-700 space-x-2 items-center">
                <button class="fin-tab-btn px-4 py-2 rounded-lg bg-pink-600 text-white font-bold transition" onclick="window.switchFinTab('dre')">Visão Geral (DRE)</button>
                <button class="fin-tab-btn px-4 py-2 rounded-lg bg-dark-input text-gray-300 hover:bg-gray-700 transition" onclick="window.switchFinTab('expenses')">Contas a Pagar</button>
                <div class="ml-auto text-xs text-gray-500"><i class="fas fa-info-circle mr-1"></i> Baseado na data selecionada.</div>
            </div>
            <div id="finContent" class="flex-grow overflow-y-auto p-6 bg-dark-bg custom-scrollbar"><div class="flex justify-center py-10"><i class="fas fa-spinner fa-spin text-pink-500 text-3xl"></i></div></div>
        </div>
    `;
    managerModal.style.display = 'flex';
    await switchFinTab('dre');
}

async function renderDRE(container) {
    const inputDate = document.getElementById('reportDateInput').value;
    const refDate = inputDate ? new Date(inputDate + 'T00:00:00') : new Date();
    const startOfMonth = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
    const endOfMonth = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0, 23, 59, 59);
    const monthName = startOfMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    try {
        const shiftsRef = collection(db, 'artifacts', appId, 'public', 'data', 'shifts');
        const shiftsQuery = query(shiftsRef, where('status', '==', 'closed'), where('closedAt', '>=', Timestamp.fromDate(startOfMonth)), where('closedAt', '<=', Timestamp.fromDate(endOfMonth)));
        const shiftsSnap = await getDocs(shiftsQuery);
        let totalRevenue = 0;
        shiftsSnap.forEach(doc => { const s = doc.data(); totalRevenue += ((s.reportSalesMoney || 0) + (s.reportSalesDigital || 0)); });

        const expensesRef = collection(db, 'artifacts', appId, 'public', 'data', 'expenses');
        const expensesQuery = query(expensesRef, where('date', '>=', toLocalISO(startOfMonth)), where('date', '<=', toLocalISO(endOfMonth)));
        const expensesSnap = await getDocs(expensesQuery);
        let totalExpenses = 0;
        const expensesByCategory = {};
        expensesSnap.forEach(doc => { const e = doc.data(); totalExpenses += (e.amount || 0); expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + e.amount; });

        const netProfit = totalRevenue - totalExpenses;
        const profitColor = netProfit >= 0 ? 'text-green-400' : 'text-red-400';

        container.innerHTML = `
            <h4 class="text-white font-light text-xl mb-6 border-b border-gray-700 pb-2">Resultado de <strong class="text-pink-500 capitalize">${monthName}</strong></h4>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div class="p-6 bg-gray-800 rounded-xl border border-green-500/30 shadow-lg"><p class="text-gray-400 uppercase text-xs font-bold tracking-wider">Receita (Turnos)</p><h3 class="text-3xl font-bold text-green-400 mt-2">${formatCurrency(totalRevenue)}</h3></div>
                <div class="p-6 bg-gray-800 rounded-xl border border-red-500/30 shadow-lg"><p class="text-gray-400 uppercase text-xs font-bold tracking-wider">Despesas Totais</p><h3 class="text-3xl font-bold text-red-400 mt-2">${formatCurrency(totalExpenses)}</h3></div>
                <div class="p-6 bg-gray-800 rounded-xl border border-blue-500/30 shadow-lg"><p class="text-gray-400 uppercase text-xs font-bold tracking-wider">Lucro Líquido</p><h3 class="text-3xl font-bold ${profitColor} mt-2">${formatCurrency(netProfit)}</h3></div>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
                    <h4 class="text-lg font-bold text-white mb-4 flex items-center"><i class="fas fa-list-alt mr-2 text-gray-500"></i> Detalhamento de Custos</h4>
                    <div class="space-y-3 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                        ${Object.entries(expensesByCategory).sort((a,b) => b[1] - a[1]).map(([cat, amount]) => `<div class="flex justify-between items-center border-b border-gray-700/50 pb-2"><span class="text-gray-300 text-sm">${cat}</span><span class="font-mono text-white font-bold text-sm">${formatCurrency(amount)}</span></div>`).join('')}
                        ${Object.keys(expensesByCategory).length === 0 ? '<p class="text-gray-500 italic text-sm">Nenhuma despesa.</p>' : ''}
                    </div>
                </div>
            </div>`;
    } catch (e) { container.innerHTML = `<p class="text-red-400 text-center bg-red-900/20 p-4 rounded">Erro DRE: ${e.message}</p>`; }
}

async function renderExpensesList(container) {
    const expensesRef = collection(db, 'artifacts', appId, 'public', 'data', 'expenses');
    const q = query(expensesRef, orderBy('date', 'desc'), limit(50));
    let expensesDocs = [];
    try { const snap = await getDocs(q); expensesDocs = snap.docs; } catch (e) { console.error(e); }

    const listHtml = expensesDocs.map(doc => {
        const e = doc.data();
        return `<div class="flex justify-between items-center bg-dark-input p-3 rounded border border-gray-700 mb-2 hover:bg-gray-700 transition">
            <div class="min-w-0 flex-1 mr-2"><div class="flex items-center"><p class="text-white font-bold truncate mr-2">${e.description}</p>${e.category ? `<span class="text-[10px] px-1.5 py-0.5 bg-gray-600 rounded text-gray-300 uppercase">${e.category}</span>` : ''}</div><div class="flex flex-wrap items-center text-xs text-gray-400 mt-1 gap-2"><span><i class="far fa-calendar-alt mr-1"></i> ${new Date(e.date).toLocaleDateString('pt-BR')}</span>${e.documentNumber ? `<span><i class="fas fa-file-invoice mr-1"></i> NF: ${e.documentNumber}</span>` : ''}${e.barcode ? `<span class="font-mono bg-gray-800 px-1 rounded select-all cursor-pointer" title="Copiar" onclick="navigator.clipboard.writeText('${e.barcode}'); window.showToast('Copiado!')"><i class="fas fa-barcode mr-1"></i>${e.barcode.substring(0, 15)}...</span>` : ''}</div></div>
            <div class="flex items-center space-x-3 flex-shrink-0 ml-2"><span class="font-bold text-red-400 text-sm md:text-base">${formatCurrency(e.amount)}</span><button onclick="window.deleteExpense('${doc.id}')" class="text-gray-500 hover:text-red-400 transition p-2"><i class="fas fa-trash"></i></button></div></div>`;
    }).join('');

    container.innerHTML = `
        <div class="flex justify-between items-center mb-4"><h4 class="text-lg font-bold text-white">Contas e Despesas</h4><button onclick="window.toggleExpenseForm()" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center"><i class="fas fa-plus-circle mr-2"></i> Nova Conta</button></div>
        <div id="expenseForm" class="hidden bg-gray-800 p-4 rounded-lg border border-gray-600 mb-6 shadow-lg animate-fade-in">
            <h5 class="text-white font-bold mb-3 border-b border-gray-700 pb-2 flex justify-between">Adicionar Lançamento <button onclick="window.toggleExpenseForm()" class="text-gray-400 hover:text-white"><i class="fas fa-times"></i></button></h5>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div class="col-span-1 md:col-span-2"><label class="text-xs text-gray-400 font-bold">Descrição <span class="text-red-400">*</span></label><input type="text" id="expDesc" placeholder="Ex: Conta de Luz" class="input-pdv w-full"></div>
                <div><label class="text-xs text-gray-400 font-bold">Valor (R$) <span class="text-red-400">*</span></label><input type="number" id="expAmount" placeholder="0.00" step="0.01" class="input-pdv w-full font-mono"></div>
                <div><label class="text-xs text-gray-400 font-bold">Vencimento <span class="text-red-400">*</span></label><input type="date" id="expDate" class="input-pdv w-full"></div>
                <div class="col-span-1 md:col-span-2"><label class="text-xs text-gray-400 font-bold">Categoria</label><select id="expCat" class="input-pdv w-full"><option value="Custos Fixos">Custos Fixos</option><option value="Insumos">Insumos</option><option value="Pessoal">Pessoal</option><option value="Impostos">Impostos</option><option value="Manutencao">Manutenção</option><option value="Marketing">Marketing</option><option value="Outros">Outros</option></select></div>
                <div><label class="text-xs text-gray-400">Nº Nota Fiscal</label><input type="text" id="expDocNumber" placeholder="000.000" class="input-pdv w-full"></div>
                <div><label class="text-xs text-gray-400">Cód. Barras</label><input type="text" id="expBarcode" placeholder="Linha digitável" class="input-pdv w-full font-mono text-xs"></div>
            </div>
            <button id="btnSaveExpense" onclick="window.saveExpense()" class="w-full bg-pink-600 hover:bg-pink-700 text-white font-bold py-3 rounded-lg shadow-lg transition">Salvar Lançamento</button>
        </div>
        <div class="space-y-1 mt-4 pb-20">${expensesDocs.length > 0 ? listHtml : '<p class="text-gray-500 text-center italic py-10">Nenhum lançamento.</p>'}</div>`;
}

// --- RELATÓRIOS DE VENDAS ---
async function loadReports() {
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
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), where('status', '==', 'open'));
    const snap = await getDocs(q); 
    if (snap.empty) { container.innerHTML = '<p class="text-gray-500 col-span-full text-center py-8 italic">Nenhum caixa aberto.</p>'; return; }
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
            <div class="bg-gray-900/50 rounded-lg p-3 mb-4 border border-gray-700"><div class="flex justify-between text-sm mb-1"><span class="text-gray-400">Fundo Inicial:</span><span class="text-white font-mono font-bold">${formatCurrency(s.initialBalance || 0)}</span></div></div>
            <button onclick="window.handleForceCloseShift('${doc.id}', '${s.userId}')" class="w-full py-2 bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-700 rounded-lg text-sm font-bold transition flex items-center justify-center"><i class="fas fa-power-off mr-2"></i> Forçar Fechamento</button>
        </div>`; 
    }).join('');
}

async function fetchClosedShifts(start, end) {
    const container = document.getElementById('closedShiftsContainer'); if (!container) return;
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), where('status', '==', 'closed'), where('openedAt', '>=', start), where('openedAt', '<', end), orderBy('openedAt', 'desc'));
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
        const shiftSnap = await getDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), shiftId)); 
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
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'tables'), where('status', '==', 'closed'), where('closedAt', '>=', start), where('closedAt', '<', end)); 
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
    
    document.getElementById('reportTotalSales').textContent = formatCurrency(totalSales); 
    document.getElementById('reportTotalMoney').textContent = formatCurrency(totalMoney); 
    document.getElementById('reportTotalDigital').textContent = formatCurrency(totalDigital); 
    document.getElementById('reportTicketMedio').textContent = formatCurrency(count > 0 ? totalSales / count : 0);
    
    const topProducts = Object.values(productStats).sort((a, b) => b.qty - a.qty).slice(0, 10); 
    const topListEl = document.getElementById('topProductsList'); 
    if(topListEl) topListEl.innerHTML = topProducts.length ? topProducts.map((p, i) => `<div class="flex justify-between items-center text-sm border-b border-gray-700 pb-1 last:border-0"><span class="text-gray-300"><b class="text-pumpkin mr-2">#${i+1}</b> ${p.name}</span><span class="font-mono text-white font-bold">${p.qty}</span></div>`).join('') : '<p class="text-xs text-gray-500 italic">Sem dados.</p>';
    
    let peakHour = '--:--'; let peakCount = 0; Object.entries(salesByHour).forEach(([hour, count]) => { if(count > peakCount) { peakCount = count; peakHour = hour; } }); 
    document.getElementById('peakHourDisplay').textContent = peakHour; document.getElementById('peakHourVolume').textContent = `${peakCount} vendas`;
    
    const teamListEl = document.getElementById('teamPerformanceList'); 
    if (teamListEl) { const sortedTeam = Object.entries(salesByWaiter).sort(([,a], [,b]) => b - a); teamListEl.innerHTML = sortedTeam.length ? sortedTeam.map(([name, total], i) => `<div class="flex justify-between items-center text-sm border-b border-gray-700 pb-1 last:border-0"><span class="text-gray-300 truncate"><b class="text-blue-400 mr-2">${i+1}.</b> ${name}</span><span class="font-mono text-white font-bold text-xs">${formatCurrency(total)}</span></div>`).join('') : '<p class="text-xs text-gray-500 italic">Sem vendas.</p>'; }

    let originContainer = document.getElementById('salesByOriginWrapper');
    if (!originContainer && teamListEl) {
        const parent = teamListEl.closest('.bg-gray-800').parentNode;
        const newCard = document.createElement('div');
        newCard.className = "bg-gray-800 rounded-lg border border-gray-700 p-4 mt-4";
        newCard.id = "salesByOriginWrapper";
        newCard.innerHTML = `<h5 class="text-sm font-bold text-white uppercase mb-3"><i class="fas fa-map-marker-alt text-pink-500 mr-2"></i>Vendas por Origem</h5><div id="salesByOriginList" class="space-y-2 max-h-40 overflow-y-auto custom-scrollbar"></div>`;
        parent.appendChild(newCard);
    }
    const originListEl = document.getElementById('salesByOriginList');
    if (originListEl) {
        const sortedOrigins = Object.entries(salesByOrigin).sort(([,a], [,b]) => b - a);
        originListEl.innerHTML = sortedOrigins.length ? sortedOrigins.map(([name, total]) => `<div class="flex justify-between items-center text-sm border-b border-gray-700 pb-1 last:border-0"><span class="text-gray-300">${name}</span><span class="font-mono text-white font-bold text-xs">${formatCurrency(total)}</span></div>`).join('') : '<p class="text-xs text-gray-500 italic">Sem dados.</p>';
    }
}

async function fetchMonthlyPerformance() { const now = new Date(); const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1); const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59); try { const goalSnap = await getDoc(getFinancialGoalsDocRef()); const meta = goalSnap.exists() ? (goalSnap.data().monthlyGoal || 0) : 0; const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'tables'), where('status', '==', 'closed'), where('closedAt', '>=', Timestamp.fromDate(startOfMonth)), where('closedAt', '<=', Timestamp.fromDate(endOfMonth))); const snapshot = await getDocs(q); let totalMonth = 0; snapshot.forEach(doc => { (doc.data().payments || []).forEach(p => { const v = parseFloat(p.value.toString().replace(/[^\d,.-]/g,'').replace(',','.')); if (!isNaN(v)) totalMonth += v; }); }); const percent = meta > 0 ? Math.min(100, (totalMonth / meta) * 100) : 0; const missing = Math.max(0, meta - totalMonth); const projection = now.getDate() > 0 ? (totalMonth / now.getDate()) * endOfMonth.getDate() : 0; document.getElementById('monthSoldDisplay').textContent = formatCurrency(totalMonth); document.getElementById('monthGoalDisplay').textContent = formatCurrency(meta); document.getElementById('monthMissing').textContent = formatCurrency(missing); document.getElementById('monthProjection').textContent = formatCurrency(projection); document.getElementById('monthProgressBar').style.width = `${percent}%`; } catch (e) { console.error(e); } };

// --- HUB DE PRODUTOS & ESTOQUE (XML + MANUAL) ---
async function renderProductHub(activeTab = 'products') {
    if (!managerModal) return;
    const categories = getCategories();
    let catOptions = '<option value="all">Todas as Categorias</option>';
    if (categories.length > 0) {
        categories.forEach(c => { if(c.id !== 'all' && c.id !== 'top10') catOptions += `<option value="${c.id}">${c.name}</option>`; });
    }
    hubPage = 1; hubSearch = ''; hubCategory = 'all';

    managerModal.innerHTML = `
        <div class="bg-dark-card border-0 md:border md:border-dark-border w-full h-full md:h-[90vh] md:max-w-6xl flex flex-col md:rounded-xl shadow-2xl overflow-hidden">
            <div class="flex justify-between items-center p-4 md:p-6 border-b border-gray-700 bg-gray-800 flex-shrink-0">
                <div><h3 class="text-xl md:text-2xl font-bold text-white">Gestão de Produtos</h3><p class="text-xs md:text-sm text-gray-400">Produtos, Estoque e Categorias</p></div>
                <button class="text-gray-400 hover:text-white text-3xl leading-none p-2" onclick="document.getElementById('managerModal').style.display='none'">&times;</button>
            </div>
            <div class="flex items-center space-x-2 p-3 bg-dark-bg border-b border-gray-700 overflow-x-auto flex-shrink-0 whitespace-nowrap">
                <button class="hub-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center" onclick="window.switchHubTab('products')"><i class="fas fa-box mr-2"></i> Produtos</button>
                <button class="hub-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center" onclick="window.switchHubTab('inventory')"><i class="fas fa-dolly mr-2"></i> Estoque</button>
                <button class="hub-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center" onclick="window.switchHubTab('categories')"><i class="fas fa-layer-group mr-2"></i> Categorias</button>
            </div>
            <div id="productActionsToolbar" class="flex flex-col md:flex-row items-stretch md:items-center justify-between p-3 bg-dark-bg border-b border-gray-700 gap-3 flex-shrink-0"></div>
            <div id="hubContent" class="flex-grow overflow-y-auto p-3 md:p-4 custom-scrollbar bg-dark-bg relative"><div class="flex items-center justify-center h-full text-gray-500"><i class="fas fa-spinner fa-spin text-3xl"></i></div></div>
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
        if(btn.textContent.toLowerCase().includes(tab === 'products' ? 'produtos' : (tab === 'inventory' ? 'estoque' : 'categorias'))) {
            btn.classList.add('bg-indigo-600', 'text-white'); btn.classList.remove('bg-dark-input', 'text-gray-300');
        } else {
            btn.classList.remove('bg-indigo-600', 'text-white'); btn.classList.add('bg-dark-input', 'text-gray-300');
        }
    });

    contentDiv.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500"><i class="fas fa-spinner fa-spin text-3xl"></i></div>';
    toolbarDiv.innerHTML = '';

    if (tab === 'products') {
        await renderProductListConfig(contentDiv, toolbarDiv);
    } else if (tab === 'inventory') {
        await renderInventoryScreen(contentDiv, toolbarDiv);
    } else if (tab === 'categories') {
        await renderCategoryManagement(contentDiv);
    }
}

async function renderInventoryScreen(container, toolbar) {
    toolbar.innerHTML = `
        <div class="flex-grow text-white font-bold text-sm items-center flex gap-2">
             <i class="fas fa-boxes text-blue-400"></i> Controle de Estoque
        </div>
        <div class="flex space-x-2">
            <button onclick="window.openManualStockEntry()" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition shadow-lg flex items-center">
                <i class="fas fa-hand-holding-box mr-2"></i> Entrada Manual
            </button>
            <label class="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition shadow-lg cursor-pointer flex items-center">
                <i class="fas fa-file-import mr-2"></i> Ler XML
                <input type="file" id="xmlInput" accept=".xml" class="hidden" onchange="window.handleImportXML(this)">
            </label>
        </div>
    `;
    const products = getProducts(); 
    const stockSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'stock'));
    const stockMap = {};
    stockSnap.forEach(d => stockMap[d.id] = d.data().quantity);
    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${products.map(p => {
                const qty = stockMap[p.id] || 0;
                const statusColor = qty > 10 ? 'text-green-400' : (qty > 0 ? 'text-yellow-400' : 'text-red-500');
                return `<div class="bg-gray-800 p-3 rounded-lg border border-gray-700 flex justify-between items-center"><div class="overflow-hidden"><p class="text-white font-bold truncate">${p.name}</p><p class="text-xs text-gray-400">SKU: ${p.id}</p></div><div class="text-right"><p class="text-xs text-gray-500 uppercase">Atual</p><span class="font-mono text-xl font-bold ${statusColor}">${qty}</span></div></div>`;
            }).join('')}
        </div>`;
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
    if(!prodId || !qty || qty <= 0) { showToast("Selecione o produto e uma quantidade válida.", true); return; }
    const product = getProducts().find(p => p.id == prodId);
    toggleLoading(btn, true, 'Salvando...');
    const batch = writeBatch(db);
    try {
        const stockRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'stock'), prodId.toString());
        batch.set(stockRef, { quantity: increment(qty), lastUpdate: serverTimestamp(), name: product.name }, { merge: true });
        const movementRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory_movements'));
        batch.set(movementRef, { type: 'manual_in', source: note, date: serverTimestamp(), items: [{ systemId: prodId, systemName: product.name, qty: qty, cost: cost }], totalCost: qty * cost, registeredBy: 'Gerente' });
        await batch.commit();
        showToast("Estoque atualizado com sucesso!", false);
        window.switchHubTab('inventory');
    } catch(e) { console.error(e); showToast("Erro ao salvar.", true); } finally { toggleLoading(btn, false); }
}

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
    toolbarDiv.innerHTML = `<h4 class="text-white font-bold">Conferência NF ${nNF} - ${emitente}</h4>`;
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

async function toggleCheckItem(idx) { inventoryChecklist[idx].checked = !inventoryChecklist[idx].checked; }

async function confirmStockEntry(nNF, emitente) {
    const itemsToProcess = inventoryChecklist.filter(i => i.checked && i.systemId);
    if (itemsToProcess.length === 0) { showToast("Nenhum item válido.", true); return; }
    const btn = document.getElementById('btnConfirmEntry');
    toggleLoading(btn, true, 'Processando...');
    const batch = writeBatch(db);
    let totalCost = 0;
    try {
        itemsToProcess.forEach(item => {
            const stockRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'stock'), item.systemId.toString());
            batch.set(stockRef, { quantity: increment(item.qty), lastUpdate: serverTimestamp(), name: item.systemName }, { merge: true });
            totalCost += (item.qty * item.cost);
        });
        const movementRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'inventory_movements'));
        batch.set(movementRef, { type: 'in', source: `NF ${nNF} - ${emitente}`, date: serverTimestamp(), items: itemsToProcess, totalCost: totalCost });
        await batch.commit();
        showToast(`Estoque atualizado!`, false);
        window.switchHubTab('inventory');
    } catch (e) { console.error(e); showToast("Erro ao atualizar estoque.", true); } finally { toggleLoading(btn, false); }
}

async function renderProductListConfig(contentDiv, toolbarDiv) {
    const categories = getCategories();
    let catOptions = '<option value="all">Todas as Categorias</option>';
    if (categories.length > 0) categories.forEach(c => { if(c.id !== 'all' && c.id !== 'top10') catOptions += `<option value="${c.id}">${c.name}</option>`; });

    toolbarDiv.innerHTML = `
        <div class="flex items-center space-x-2 w-full md:w-auto"><select id="hubCategoryFilter" class="bg-gray-700 text-white text-sm py-3 px-3 rounded-lg border border-gray-600 w-full md:w-[200px]">${catOptions}</select></div>
        <div class="flex items-center space-x-2 w-full md:w-auto"><div class="relative w-full md:w-64"><input type="text" id="hubSearchInput" placeholder="Pesquisar..." class="bg-dark-input text-white text-sm py-3 pl-3 pr-8 rounded-lg border border-gray-600 w-full focus:border-indigo-500"><i class="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i></div><button id="hubNewProductBtn" class="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition shadow-lg flex items-center justify-center whitespace-nowrap"><i class="fas fa-plus mr-2"></i> <span class="hidden md:inline">Novo</span></button></div>`;
            
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

// --- ABA FICHA TÉCNICA (NOVA LÓGICA) ---
async function renderProductForm(product = null, container, onBack) {
    const isEdit = !!product;
    const catOptions = getFormattedCategoryOptions(getCategories(), product?.categoryId);
    const sectorsSnap = await getDocs(query(getSectorsCollectionRef(), where('type', '==', 'production'), orderBy('name')));
    const sectors = sectorsSnap.docs.map(d => d.data().name);
    
    // Inicializa composição local
    currentComposition = product?.composition || [];
    const allProducts = getProducts(); // Para o select de insumos

    container.innerHTML = `
        <div class="w-full h-full flex flex-col bg-dark-bg">
            <div class="flex justify-between items-center mb-2 pb-2 border-b border-gray-700 flex-shrink-0"><h4 class="text-lg font-bold text-white flex items-center truncate"><i class="fas ${isEdit ? 'fa-edit text-blue-400' : 'fa-plus-circle text-green-400'} mr-2"></i>${isEdit ? 'Editar' : 'Novo'}</h4><button id="btnBackToHub" class="text-gray-400 hover:text-white flex items-center text-sm py-2 px-3 rounded bg-gray-800"><i class="fas fa-arrow-left mr-1"></i> Voltar</button></div>
            <div class="flex space-x-2 mb-4 overflow-x-auto pb-2 flex-shrink-0"><button class="form-tab-btn px-4 py-2 rounded-full bg-indigo-600 text-white text-sm font-bold whitespace-nowrap" data-target="tab-general">Geral</button><button class="form-tab-btn px-4 py-2 rounded-full bg-gray-700 text-gray-300 text-sm font-bold whitespace-nowrap" data-target="tab-hierarchy">Hierarquia</button><button class="form-tab-btn px-4 py-2 rounded-full bg-gray-700 text-gray-300 text-sm font-bold whitespace-nowrap" data-target="tab-recipe">Ficha/Estoque</button><button class="form-tab-btn px-4 py-2 rounded-full bg-gray-700 text-gray-300 text-sm font-bold whitespace-nowrap" data-target="tab-obs">Obs</button></div>
            <div class="flex-grow overflow-y-auto custom-scrollbar pr-1 pb-20">
                <form id="productForm" class="space-y-6">
                    <div id="tab-general" class="form-tab-content"><div class="space-y-4"><div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Nome</label><input type="text" id="prodName" class="input-pdv w-full text-lg p-3" value="${product?.name || ''}" required></div><div class="grid grid-cols-2 gap-4"><div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Preço</label><input type="number" id="prodPrice" class="input-pdv w-full font-mono text-green-400 font-bold text-lg p-3" step="0.01" value="${product?.price || ''}" required></div><div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Promo</label><input type="number" id="prodRegPrice" class="input-pdv w-full font-mono text-yellow-400 text-lg p-3" step="0.01" value="${product?.regular_price || ''}"></div></div><div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Status</label><select id="prodStatus" class="input-pdv w-full p-3"><option value="publish" ${product?.status === 'publish' ? 'selected' : ''}>Publicado</option><option value="draft" ${product?.status === 'draft' ? 'selected' : ''}>Rascunho</option></select></div><div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">URL Imagem</label><input type="text" id="prodImg" class="input-pdv w-full text-xs p-3" value="${product?.image || ''}"></div><div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Descrição</label><textarea id="prodDesc" class="input-pdv w-full text-sm p-3" rows="3">${product?.description || ''}</textarea></div></div></div>
                    
                    <div id="tab-hierarchy" class="form-tab-content hidden"><div class="bg-gray-800 p-4 rounded-xl border border-gray-600 space-y-4"><p class="text-sm text-pumpkin font-bold uppercase mb-2">Classificação</p><div><label class="text-xs text-gray-500 block mb-1">1. Grupo</label><select id="catLvl1" class="input-pdv w-full text-sm p-2"></select></div><div><label class="text-xs text-gray-500 block mb-1">2. Subgrupo</label><select id="catLvl2" class="input-pdv w-full text-sm p-2" disabled></select></div><div><label class="text-xs text-gray-500 block mb-1">3. Categoria</label><select id="catLvl3" class="input-pdv w-full text-sm p-2" disabled></select></div><div><label class="text-xs text-gray-500 block mb-1">4. Variação</label><select id="catLvl4" class="input-pdv w-full text-sm p-2" disabled></select></div><input type="hidden" id="finalCategoryId" value="${product?.categoryId || ''}"><div class="pt-4 border-t border-gray-600"><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Setor de Produção (KDS)</label><select id="prodSector" class="input-pdv w-full p-2">${sectors.length > 0 ? sectors.map(s => `<option value="${s}">${s}</option>`).join('') : '<option value="cozinha">Cozinha</option>'}</select></div></div></div>
                    
                    <div id="tab-recipe" class="form-tab-content hidden space-y-6">
                         <div class="bg-gray-800 p-4 rounded-xl border border-gray-600 text-center"><p class="text-gray-400 mb-2 text-sm uppercase font-bold">Estoque Atual (Físico)</p><div class="flex items-center justify-center space-x-4"><button type="button" class="w-12 h-12 rounded-lg bg-red-600 text-white text-xl font-bold"><i class="fas fa-minus"></i></button><input type="number" class="input-pdv text-center text-3xl w-32 font-mono bg-transparent border-b border-gray-500" value="0" disabled><button type="button" class="w-12 h-12 rounded-lg bg-green-600 text-white text-xl font-bold"><i class="fas fa-plus"></i></button></div><p class="text-xs text-gray-500 mt-2">Use a aba Estoque para ajustes</p></div>
                         <div class="bg-gray-800 p-4 rounded-xl border border-gray-600">
                            <label class="flex items-center space-x-3 cursor-pointer mb-4"><input type="checkbox" id="isComposite" class="w-6 h-6 rounded bg-dark-input border-gray-500 text-indigo-600" ${product?.composition?.length > 0 ? 'checked' : ''}><span class="text-white font-bold">Produto Composto?</span></label>
                            <div id="compositionContainer" class="space-y-2 ${product?.composition?.length > 0 ? '' : 'hidden'}">
                                <h5 class="text-xs font-bold text-gray-500 uppercase mb-2">Insumos (Baixa Automática)</h5>
                                <div id="compositionList"></div>
                                <button type="button" onclick="window.addCompItem()" class="text-xs bg-indigo-600 text-white px-3 py-2 rounded w-full font-bold mt-2 hover:bg-indigo-500"><i class="fas fa-plus mr-2"></i> Adicionar Insumo</button>
                            </div>
                         </div>
                    </div>
                    
                    <div id="tab-obs" class="form-tab-content hidden"><div class="bg-gray-800 p-4 rounded-xl border border-gray-600"><p class="text-sm text-gray-300 mb-3">Obs. específicas deste produto.</p><div class="flex space-x-2 mb-4"><input type="text" id="newQuickObsInput" placeholder="Nova obs..." class="input-pdv w-full text-sm p-3"><button type="button" id="btnAddQuickObs" class="bg-green-600 text-white px-4 rounded-lg font-bold"><i class="fas fa-plus"></i></button></div><div id="quickObsListSmall" class="grid grid-cols-2 gap-2"></div></div></div>
                </form>
            </div>
            <div class="border-t border-gray-700 pt-4 mt-auto flex space-x-3 flex-shrink-0 bg-dark-bg"><button type="button" id="btnCancelForm" class="flex-1 py-4 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-bold transition">Cancelar</button><button type="button" id="btnSaveProduct" class="flex-1 py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition shadow-lg flex items-center justify-center"><i class="fas fa-save mr-2"></i> Salvar</button></div>
        </div>`;

    // Lógica de Abas
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

    // Renderiza lista de insumos inicial
    const updateCompListUI = () => {
        const list = document.getElementById('compositionList');
        list.innerHTML = currentComposition.map((item, idx) => `
            <div class="flex space-x-2 mb-2 items-center bg-dark-input p-2 rounded border border-gray-700">
                <select onchange="window.updateCompItem(${idx}, 'id', this.value)" class="bg-gray-700 text-white text-xs p-2 rounded flex-grow border-0">
                    <option value="">Selecione...</option>
                    ${allProducts.map(p => `<option value="${p.id}" ${p.id == item.id ? 'selected' : ''}>${p.name}</option>`).join('')}
                </select>
                <input type="number" value="${item.qty}" onchange="window.updateCompItem(${idx}, 'qty', this.value)" class="bg-gray-700 text-white w-20 p-2 rounded text-center text-xs" placeholder="Qtd">
                <button type="button" onclick="window.removeCompItem(${idx})" class="text-red-400 hover:text-red-200 px-2"><i class="fas fa-times"></i></button>
            </div>
        `).join('');
    };
    updateCompListUI();

    // Toggle Composto
    const compCheck = document.getElementById('isComposite');
    const compContainer = document.getElementById('compositionContainer');
    compCheck.onchange = () => {
        if(compCheck.checked) compContainer.classList.remove('hidden');
        else compContainer.classList.add('hidden');
    };

    // Inject helper functions for this form instance
    window.addCompItem = () => { currentComposition.push({ id: '', qty: 1 }); updateCompListUI(); };
    window.removeCompItem = (idx) => { currentComposition.splice(idx, 1); updateCompListUI(); };
    window.updateCompItem = (idx, field, val) => { currentComposition[idx][field] = field === 'qty' ? parseFloat(val) : val; };

    // ... (Restante da lógica de cascata e obs mantida) ...
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

    // SAVE COM COMPOSIÇÃO
    document.getElementById('btnSaveProduct').onclick = async () => {
        const submitBtn = document.getElementById('btnSaveProduct');
        toggleLoading(submitBtn, true, 'Salvando...');
        const selectedCatId = finalIdInput.value; 
        const isComposite = document.getElementById('isComposite').checked;
        
        // Filtra composição vazia
        const validComposition = isComposite ? currentComposition.filter(i => i.id && i.qty > 0) : [];

        const data = {
            name: document.getElementById('prodName').value,
            regular_price: document.getElementById('prodRegPrice').value,
            price: document.getElementById('prodPrice').value,
            categories: selectedCatId ? [{ id: parseInt(selectedCatId) }] : [],
            status: document.getElementById('prodStatus').value,
            description: document.getElementById('prodDesc').value,
            images: [{ src: document.getElementById('prodImg').value }],
            meta_data: [ 
                { key: 'sector', value: document.getElementById('prodSector').value }, 
                { key: 'is_composite', value: isComposite ? 'yes' : 'no' } 
            ],
            // Salva a composição no Firestore (campo customizado, o Woo ignora se não mapeado, mas o Firebase guarda)
            composition: validComposition 
        };
        
        try { 
            if(isEdit) await updateWooProduct(product.id, data); else await createWooProduct(data); 
            showToast("Produto salvo!", false); 
            if(onBack) onBack(); 
        } 
        catch(e) { showToast(e.message, true); } finally { toggleLoading(submitBtn, false); }
    };
    document.getElementById('btnBackToHub').onclick = onBack;
    document.getElementById('btnCancelForm').onclick = onBack;
}

// --- ATRIBUIÇÕES GLOBAIS FINAIS ---
window.renderProductHub = renderProductHub;
window.renderProductList = renderProductList;
window.renderProductForm = renderProductForm;
window.handleDeleteProduct = handleDeleteProduct;
window.renderCategoryManagement = renderCategoryManagement;
window.renderCategoryForm = renderCategoryForm;
window.toggleExpenseForm = toggleExpenseForm;
window.saveExpense = saveExpense;
window.deleteExpense = deleteExpense;
window.handleForceCloseShift = handleForceCloseShift;
window.openShiftDetails = openShiftDetails;
window.handleDeleteVoucher = handleDeleteVoucher;
window.deleteSector = deleteSector;
window.setMonthlyGoal = setMonthlyGoal;
window.runDateComparison = runDateComparison;
window.switchFinTab = switchFinTab;
window.switchHubTab = switchHubTab;
window.handleImportXML = handleImportXML;
window.toggleCheckItem = toggleCheckItem;
window.confirmStockEntry = confirmStockEntry;
window.openManualStockEntry = openManualStockEntry;
window.saveManualStockEntry = saveManualStockEntry;
window.addCompItem = addCompItem;
window.removeCompItem = removeCompItem;
window.updateCompItem = updateCompItem;