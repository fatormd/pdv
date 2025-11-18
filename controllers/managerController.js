import { db, appId, getVouchersCollectionRef, getQuickObsCollectionRef, getTablesCollectionRef } from "/services/firebaseService.js";
import { 
    collection, query, where, getDocs, orderBy, Timestamp, 
    doc, setDoc, deleteDoc, updateDoc, serverTimestamp, getDoc, limit
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { formatCurrency } from "/utils.js";
import { openUserManagementModal } from "/controllers/userManagementController.js";

// Variáveis
let managerModal; 
let managerAuthCallback;
let voucherManagementModal, voucherListContainer, voucherForm;
let reportDateInput;
let managerControllerInitialized = false;


export const initManagerController = () => {
    if (managerControllerInitialized) return;
    console.log("[ManagerController] Inicializando...");
    
    managerModal = document.getElementById('managerModal');
    
    if (!managerModal) return;
    
    managerModal.addEventListener('click', (e) => {
         if (e.target === managerModal) managerModal.style.display = 'none';
    });

    // Vouchers
    voucherManagementModal = document.getElementById('voucherManagementModal'); 
    voucherListContainer = document.getElementById('voucherListContainer');     
    voucherForm = document.getElementById('voucherForm');                       
    const showVoucherFormBtn = document.getElementById('showVoucherFormBtn'); 

    if (voucherForm) voucherForm.addEventListener('submit', handleSaveVoucher);
    if (showVoucherFormBtn) showVoucherFormBtn.addEventListener('click', () => { 
        voucherForm.style.display = 'block'; 
        voucherForm.reset();
        document.getElementById('voucherFormTitle').textContent = 'Novo Voucher';
        document.getElementById('saveVoucherBtn').textContent = 'Salvar Voucher';
    });

    // Relatórios
    reportDateInput = document.getElementById('reportDateInput');
    if (reportDateInput) {
        reportDateInput.valueAsDate = new Date(); 
        reportDateInput.addEventListener('change', loadReports);
    }
    document.getElementById('refreshReportBtn')?.addEventListener('click', loadReports);

    // Abas
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
            document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
            
            if (btn.dataset.tab === 'monthly') {
                fetchMonthlyReports();
            }
        });
    });

    managerControllerInitialized = true;
};

export const handleGerencialAction = (action, payload) => {
    console.log(`[Manager] Ação: ${action}`);
    if (managerModal) managerModal.style.display = 'none';

    switch (action) {
        case 'openWaiterReg': openUserManagementModal(); break;
        case 'openQuickObsManagement': renderQuickObsManagementModal(); break;
        case 'openVoucherManagement': openVoucherManagementModal(); break;
        case 'openCashManagement': openReportPanel('shifts'); break;
        
        // AÇÃO: FECHAR DIA
        case 'closeDay': handleCloseDay(); break;

        default: alert(`Em desenvolvimento: ${action}`);
    }
};

// --- FECHAMENTO DO DIA ---
const handleCloseDay = async () => {
    if (!confirm("Tem certeza que deseja ENCERRAR O DIA?\nIsso consolidará todas as vendas e turnos de hoje em um relatório final.")) return;

    const todayStr = new Date().toISOString().split('T')[0]; 
    const reportId = `daily_${todayStr}`;
    const reportRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'daily_reports'), reportId);

    try {
        const docSnap = await getDoc(reportRef);
        if (docSnap.exists()) {
            if (!confirm("Já existe um fechamento para hoje. Deseja sobrescrever?")) return;
        }

        const start = Timestamp.fromDate(new Date(todayStr + 'T00:00:00'));
        const end = Timestamp.fromDate(new Date(todayStr + 'T23:59:59'));

        // 1. Vendas
        const tablesQ = query(collection(db, 'artifacts', appId, 'public', 'data', 'tables'), 
            where('status', '==', 'closed'), where('closedAt', '>=', start), where('closedAt', '<=', end));
        const tablesSnap = await getDocs(tablesQ);
        
        let totalSales = 0, money = 0, digital = 0;
        let ordersCount = 0;

        tablesSnap.forEach(d => {
            const t = d.data();
            totalSales += (t.finalTotal || t.total || 0);
            ordersCount++;
            (t.payments || []).forEach(p => {
                const v = parseFloat(p.value.replace(/[^\d,]/g,'').replace(',','.'));
                if(p.method.toLowerCase().includes('dinheiro')) money += v; else digital += v;
            });
        });

        // 2. Turnos
        const shiftsQ = query(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'),
            where('openedAt', '>=', start), where('openedAt', '<=', end));
        const shiftsSnap = await getDocs(shiftsQ);
        const shiftIds = shiftsSnap.docs.map(d => d.id);

        // 3. Salva
        await setDoc(reportRef, {
            date: todayStr,
            totalSales,
            totalMoney: money,
            totalDigital: digital,
            ordersCount,
            shiftsAudited: shiftIds,
            closedAt: serverTimestamp()
        });

        alert(`Dia encerrado com sucesso!\nTotal: ${formatCurrency(totalSales)}`);
        openReportPanel('monthly');

    } catch (e) {
        console.error(e);
        alert("Erro ao encerrar dia: " + e.message);
    }
};

const fetchMonthlyReports = async () => {
    const container = document.getElementById('monthlyReportsContainer');
    if (!container) return;
    container.innerHTML = '<p class="text-center py-4 text-gray-500">Carregando...</p>';

    try {
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'daily_reports'), orderBy('date', 'desc'), limit(30));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            container.innerHTML = '<p class="text-center py-4 text-gray-500">Nenhum fechamento registrado.</p>';
            return;
        }

        container.innerHTML = snap.docs.map(d => {
            const r = d.data();
            return `
            <div class="bg-gray-800 p-4 rounded-lg border border-gray-700 flex justify-between items-center">
                <div>
                    <h4 class="text-white font-bold text-lg">${r.date.split('-').reverse().join('/')}</h4>
                    <p class="text-sm text-gray-400">${r.ordersCount} pedidos</p>
                </div>
                <div class="text-right">
                    <p class="text-green-400 font-bold text-xl">${formatCurrency(r.totalSales)}</p>
                    <p class="text-xs text-gray-500">Dinheiro: ${formatCurrency(r.totalMoney)}</p>
                </div>
            </div>`;
        }).join('');

    } catch (e) {
        console.error(e);
        container.innerHTML = '<p class="text-center text-red-400">Erro ao carregar histórico.</p>';
    }
};

// --- MODAL DE DETALHES (INJETADO DINAMICAMENTE) ---
window.showOrderDetails = async (docId) => {
    let modal = document.getElementById('orderDetailsModal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="orderDetailsModal" class="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[60] hidden p-4 print-hide">
                <div class="bg-dark-card border border-dark-border w-full max-w-md rounded-xl shadow-2xl flex flex-col max-h-[80vh]">
                    <div class="p-4 border-b border-gray-700 flex justify-between items-center">
                        <h3 class="text-lg font-bold text-pumpkin">Detalhes do Pedido</h3>
                        <button onclick="document.getElementById('orderDetailsModal').style.display='none'" class="text-gray-400 hover:text-white">&times;</button>
                    </div>
                    <div id="orderDetailsContent" class="p-4 overflow-y-auto custom-scrollbar flex-grow">Carregando...</div>
                    <div class="p-4 border-t border-gray-700 bg-gray-800 rounded-b-xl text-right">
                        <button onclick="document.getElementById('orderDetailsModal').style.display='none'" class="px-4 py-2 bg-gray-600 rounded text-white">Fechar</button>
                    </div>
                </div>
            </div>
        `);
        modal = document.getElementById('orderDetailsModal');
    }
    
    modal.style.display = 'flex';
    const content = document.getElementById('orderDetailsContent');
    content.innerHTML = '<p class="text-center text-yellow-400"><i class="fas fa-spinner fa-spin"></i> Buscando dados...</p>';

    try {
        const docRef = doc(getTablesCollectionRef(), docId);
        const snap = await getDoc(docRef);
        
        if (!snap.exists()) {
            content.innerHTML = '<p class="text-red-400">Erro: Pedido não encontrado.</p>';
            return;
        }

        const data = snap.data();
        const items = data.sentItems || [];
        const payments = data.payments || [];

        let itemsHtml = items.map(item => `
            <div class="flex justify-between py-1 border-b border-gray-800 text-sm">
                <div class="flex flex-col">
                    <span class="text-white">${item.name}</span>
                    ${item.note ? `<span class="text-xs text-gray-500 italic">${item.note}</span>` : ''}
                </div>
                <span class="text-gray-300 font-mono">${formatCurrency(item.price)}</span>
            </div>
        `).join('');

        let paymentsHtml = payments.map(p => `
            <div class="flex justify-between py-1 text-xs text-green-400">
                <span>${p.method}</span>
                <span>${p.value}</span>
            </div>
        `).join('');

        content.innerHTML = `
            <div class="mb-4 border-b border-gray-700 pb-3">
                <p class="text-xs text-gray-500">ID: ${docId}</p>
                <p class="text-sm text-white font-bold">Mesa ${data.tableNumber}</p>
                <p class="text-xs text-gray-400">${new Date(data.closedAt.toDate()).toLocaleString()}</p>
                <p class="text-xs text-gray-400">Atendente: ${data.waiterId || 'N/A'}</p>
            </div>
            
            <h4 class="text-xs uppercase font-bold text-pumpkin mb-2">Itens</h4>
            <div class="mb-4 space-y-1">${itemsHtml || '<p class="italic text-gray-600">Sem itens</p>'}</div>
            
            <h4 class="text-xs uppercase font-bold text-green-400 mb-2">Pagamentos</h4>
            <div class="mb-4 space-y-1">${paymentsHtml || '<p class="italic text-gray-600">Sem pagamentos</p>'}</div>

            <div class="flex justify-between items-center pt-3 border-t border-gray-600 mt-4">
                <span class="font-bold text-white text-lg">TOTAL</span>
                <span class="font-bold text-xl text-pumpkin">${formatCurrency(data.finalTotal || data.total)}</span>
            </div>
        `;

    } catch (e) {
        console.error(e);
        content.innerHTML = `<p class="text-red-400">Erro ao carregar detalhes: ${e.message}</p>`;
    }
};

// --- FUNÇÕES DE UI EXISTENTES ---

export const openManagerAuthModal = (actionCallback) => {
    if (!managerModal) return;
    managerAuthCallback = actionCallback; 
    managerModal.innerHTML = `
        <div class="bg-dark-card border border-dark-border p-6 rounded-xl shadow-2xl w-full max-w-sm text-center">
            <h3 class="text-xl font-bold mb-4 text-red-400">Acesso Restrito</h3>
            <input type="password" id="managerPasswordInput" placeholder="Senha" class="input-pdv w-full p-4 mb-6 text-base">
            <div class="flex justify-end space-x-3">
                <button onclick="document.getElementById('managerModal').style.display='none'" class="px-4 py-3 bg-gray-600 text-gray-200 rounded-lg">Cancelar</button>
                <button id="submitManagerAuthBtn" class="px-4 py-3 bg-red-600 text-white rounded-lg">Entrar</button>
            </div>
        </div>`;
    managerModal.style.display = 'flex';
    document.getElementById('managerPasswordInput').focus();
    document.getElementById('submitManagerAuthBtn').onclick = () => {
        if(document.getElementById('managerPasswordInput').value === '1234') handleGerencialAction(managerAuthCallback);
        else alert('Senha incorreta');
    };
};

const openReportPanel = (tabName = 'sales') => {
    const modal = document.getElementById('reportsModal');
    if(modal) {
        modal.style.display = 'flex';
        const btn = document.querySelector(`.report-tab-btn[data-tab="${tabName}"]`);
        if(btn) btn.click();
        loadReports();
    }
};

const loadReports = async () => {
    if (!reportDateInput) return;
    const selectedDate = new Date(reportDateInput.value + 'T00:00:00');
    const startOfDay = Timestamp.fromDate(selectedDate);
    const nextDay = new Date(selectedDate); nextDay.setDate(nextDay.getDate() + 1);
    const endOfDay = Timestamp.fromDate(nextDay);

    try { await Promise.all([fetchSalesData(startOfDay, endOfDay), fetchShiftsData(startOfDay, endOfDay)]); } catch (e) { console.error(e); }
};

const fetchSalesData = async (start, end) => {
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'tables'), where('status', '==', 'closed'), where('closedAt', '>=', start), where('closedAt', '<', end), orderBy('closedAt', 'desc'));
    const snapshot = await getDocs(q);
    let totalSales = 0, totalMoney = 0, totalDigital = 0, totalService = 0, rowsHtml = '';

    snapshot.forEach(docSnap => {
        const table = docSnap.data();
        let tableTotal = 0;
        (table.payments || []).forEach(p => {
            const val = parseFloat(p.value.replace(/[^\d,]/g,'').replace(',','.'));
            if (!isNaN(val)) { tableTotal += val; if (p.method.toLowerCase().includes('dinheiro')) totalMoney += val; else totalDigital += val; }
        });
        totalSales += tableTotal;
        if (table.serviceTaxApplied) totalService += (tableTotal - (tableTotal / 1.1));

        rowsHtml += `<tr class="hover:bg-gray-700 transition border-b border-gray-800 cursor-pointer" onclick="window.showOrderDetails('${docSnap.id}')">
            <td class="p-3">${table.closedAt ? table.closedAt.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--'}</td>
            <td class="p-3 font-bold text-white">Mesa ${table.tableNumber}</td>
            <td class="p-3 text-gray-400">${table.waiterId || 'Staff'}</td>
            <td class="p-3 text-right text-green-400 font-bold">${formatCurrency(tableTotal)}</td></tr>`;
    });

    document.getElementById('reportTotalSales').textContent = formatCurrency(totalSales);
    document.getElementById('reportTotalMoney').textContent = formatCurrency(totalMoney);
    document.getElementById('reportTotalDigital').textContent = formatCurrency(totalDigital);
    document.getElementById('reportTotalService').textContent = formatCurrency(totalService);
    document.getElementById('reportSalesTableBody').innerHTML = rowsHtml || '<tr><td colspan="4" class="text-center p-4">Sem vendas.</td></tr>';
};

const fetchShiftsData = async (start, end) => {
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), where('openedAt', '>=', start), where('openedAt', '<', end), orderBy('openedAt', 'desc'));
    const snapshot = await getDocs(q);
    const container = document.getElementById('shiftsListContainer');
    if (snapshot.empty) { container.innerHTML = '<p class="text-center py-4">Nenhum turno.</p>'; return; }
    
    container.innerHTML = snapshot.docs.map(d => {
        const s = d.data();
        const diff = s.difference || 0;
        const color = diff > 0.1 ? 'text-blue-400' : diff < -0.1 ? 'text-red-400' : 'text-green-500';
        return `<div class="bg-gray-800 p-4 rounded border border-gray-700 flex justify-between">
            <div><h4 class="text-white font-bold">${s.userName}</h4><p class="text-xs text-gray-400">${s.openedAt.toDate().toLocaleTimeString()}</p></div>
            <div class="text-right"><p class="${color} font-bold">${formatCurrency(diff)}</p><p class="text-xs text-gray-500">${s.status}</p></div>
        </div>`;
    }).join('');
};

// --- VOUCHERS/OBS ---
const openVoucherManagementModal = async () => {
    if (!voucherManagementModal) return;
    if(managerModal) managerModal.style.display = 'none';
    voucherManagementModal.style.display = 'flex';
    if(voucherForm) voucherForm.style.display = 'none';
    await fetchVouchers();
};
window.openVoucherManagementModal = openVoucherManagementModal;

const fetchVouchers = async () => {
    if (!voucherListContainer) return;
    voucherListContainer.innerHTML = '<p class="text-sm text-yellow-400 italic">Buscando...</p>';
    try {
        const q = query(getVouchersCollectionRef(), orderBy('points', 'asc'));
        const querySnapshot = await getDocs(q);
        const vouchers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (vouchers.length === 0) {
            voucherListContainer.innerHTML = '<p class="text-sm text-dark-placeholder italic">Nenhum voucher cadastrado.</p>';
        } else {
            voucherListContainer.innerHTML = vouchers.map(v => `
                <div class="flex justify-between items-center bg-dark-input p-3 rounded-lg mb-2">
                    <div>
                        <h4 class="font-bold text-dark-text">${v.name}</h4>
                        <p class="text-sm text-indigo-400">${v.points} pts = ${formatCurrency(v.value)}</p>
                    </div>
                    <button class="text-red-400 hover:text-red-500" onclick="window.handleDeleteVoucher('${v.id}')"><i class="fas fa-trash"></i></button>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error(error);
        voucherListContainer.innerHTML = '<p class="text-red-400">Erro ao carregar.</p>';
    }
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
        alert("Salvo!");
    } catch (e) {
        alert("Erro ao salvar: " + e.message);
    } finally {
        saveBtn.disabled = false;
    }
};

window.handleDeleteVoucher = async (id) => {
    if(confirm("Excluir voucher?")) {
        await deleteDoc(doc(getVouchersCollectionRef(), id));
        fetchVouchers();
    }
};

const renderQuickObsManagementModal = async () => {
    if (!managerModal) return;
    managerModal.innerHTML = `
    <div class="bg-dark-card border border-dark-border p-6 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-bold text-indigo-400">Obs. Rápidas</h3>
            <button id="closeQuickObs" class="px-4 py-2 bg-gray-600 text-white rounded">Fechar</button>
        </div>
        <form id="addQuickObsForm" class="flex space-x-2 mb-4">
            <input type="text" id="newQuickObsInput" placeholder="Nova observação..." class="input-pdv w-full" required>
            <button type="submit" class="bg-green-600 text-white px-4 rounded">Adicionar</button>
        </form>
        <div id="quickObsList" class="overflow-y-auto flex-grow space-y-2">Carregando...</div>
    </div>`;
    
    managerModal.style.display = 'flex';
    document.getElementById('closeQuickObs').onclick = () => managerModal.style.display = 'none';
    
    document.getElementById('addQuickObsForm').onsubmit = async (e) => {
        e.preventDefault();
        const text = document.getElementById('newQuickObsInput').value.trim();
        if(text) {
            const id = text.toLowerCase().replace(/[^a-z0-9]/g, '');
            await setDoc(doc(getQuickObsCollectionRef(), id), { text });
            loadQuickObsList();
            document.getElementById('newQuickObsInput').value = '';
        }
    };
    loadQuickObsList();
};

const loadQuickObsList = async () => {
    const container = document.getElementById('quickObsList');
    if(!container) return;
    const snap = await getDocs(query(getQuickObsCollectionRef(), orderBy('text')));
    container.innerHTML = snap.docs.map(d => `
        <div class="flex justify-between bg-dark-input p-2 rounded">
            <span class="text-white">${d.data().text}</span>
            <button onclick="window.deleteQuickObs('${d.id}')" class="text-red-400"><i class="fas fa-trash"></i></button>
        </div>
    `).join('');
};

window.deleteQuickObs = async (id) => {
    if(confirm("Excluir?")) {
        await deleteDoc(doc(getQuickObsCollectionRef(), id));
        loadQuickObsList();
    }
};