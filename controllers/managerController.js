import { db, appId, getVouchersCollectionRef, getQuickObsCollectionRef, getTablesCollectionRef } from "/services/firebaseService.js";
import { 
    collection, query, where, getDocs, orderBy, Timestamp, 
    doc, setDoc, deleteDoc, updateDoc, serverTimestamp, getDoc, limit
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { formatCurrency } from "/utils.js";
import { openUserManagementModal } from "/controllers/userManagementController.js";
// Importando as novas funções de gestão do serviço
import { 
    syncWithWooCommerce, getProducts, getCategories, 
    createWooProduct, updateWooProduct, deleteWooProduct, fetchWooCommerceProducts 
} from "/services/wooCommerceService.js";

// Variáveis
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
    if (!managerModal) return;
    
    managerModal.addEventListener('click', (e) => {
         if (e.target === managerModal) managerModal.style.display = 'none';
    });

    // Vouchers e Relatórios (Lógica mantida)
    voucherManagementModal = document.getElementById('voucherManagementModal'); 
    voucherListContainer = document.getElementById('voucherListContainer');     
    voucherForm = document.getElementById('voucherForm');                       
    document.getElementById('showVoucherFormBtn')?.addEventListener('click', () => { 
        if(voucherForm) { voucherForm.style.display = 'block'; voucherForm.reset(); }
    });
    if (voucherForm) voucherForm.addEventListener('submit', handleSaveVoucher);

    reportDateInput = document.getElementById('reportDateInput');
    if (reportDateInput) {
        reportDateInput.valueAsDate = new Date(); 
        reportDateInput.addEventListener('change', loadReports);
    }
    document.getElementById('refreshReportBtn')?.addEventListener('click', loadReports);

    const tabBtns = document.querySelectorAll('.report-tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => { b.classList.remove('bg-indigo-600', 'text-white'); b.classList.add('bg-dark-input', 'text-gray-300'); });
            btn.classList.remove('bg-dark-input', 'text-gray-300'); btn.classList.add('bg-indigo-600', 'text-white');
            document.querySelectorAll('.report-content').forEach(c => c.classList.add('hidden'));
            document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
            if (btn.dataset.tab === 'monthly') fetchMonthlyReports();
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
        case 'openWooSync': syncWithWooCommerce(); break;
        case 'closeDay': handleCloseDay(); break;
        
        // NOVA AÇÃO: Gestão de Produtos
        case 'openProductManagement': renderProductManagementModal(); break;

        default: alert(`Em desenvolvimento: ${action}`);
    }
};

// =================================================================
//              GESTÃO DE PRODUTOS (NOVO CÓDIGO)
// =================================================================
const renderProductManagementModal = async () => {
    const modalId = 'productManagementModal';
    let modal = document.getElementById(modalId);
    
    // Garante que o modal existe
    if (!modal) {
        const modalHtml = `<div id="${modalId}" class="fixed inset-0 bg-gray-900 bg-opacity-90 flex items-center justify-center z-50 hidden p-4 print-hide"></div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById(modalId);
    }

    // Renderiza estrutura básica
    modal.innerHTML = `
        <div class="bg-dark-card border border-dark-border p-6 rounded-xl shadow-2xl w-full max-w-3xl h-[85vh] flex flex-col">
            <div class="flex justify-between items-center mb-4 flex-shrink-0">
                <h3 class="text-xl font-bold text-indigo-400">Gestão de Produtos (WooCommerce)</h3>
                <button onclick="document.getElementById('${modalId}').style.display='none'" class="text-gray-400 hover:text-white text-2xl">&times;</button>
            </div>
            
            <div id="prodListContainer" class="flex-grow overflow-y-auto custom-scrollbar mb-4">
                <div class="text-center text-gray-500 py-10"><i class="fas fa-spinner fa-spin"></i> Carregando produtos...</div>
            </div>

            <div class="pt-2 border-t border-gray-700 flex-shrink-0">
                <button id="btnNewProduct" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition">
                    <i class="fas fa-plus"></i> Novo Produto
                </button>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';

    // Renderiza a lista
    await refreshProductList();

    // Ação do botão Novo
    document.getElementById('btnNewProduct').onclick = () => renderProductForm();
};

const refreshProductList = async () => {
    const container = document.getElementById('prodListContainer');
    if (!container) return;

    // Atualiza produtos (usa cache ou busca novo)
    let products = getProducts();
    if (!products || products.length === 0) {
        products = await fetchWooCommerceProducts();
    }

    if (!products || products.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-10">Nenhum produto encontrado.</p>';
        return;
    }

    container.innerHTML = products.map(p => `
        <div class="flex justify-between items-center bg-dark-input p-3 rounded-lg mb-2 border border-gray-700">
            <div class="flex items-center space-x-3">
                <img src="${p.image || 'https://placehold.co/50'}" class="w-10 h-10 rounded object-cover bg-gray-800">
                <div>
                    <h4 class="font-bold text-dark-text">${p.name}</h4>
                    <p class="text-xs text-indigo-400">
                        ${formatCurrency(p.price)} 
                        <span class="text-gray-500 ml-2">(${p.status === 'publish' ? 'Visível' : 'Oculto'})</span>
                    </p>
                </div>
            </div>
            <div class="flex space-x-2">
                <button class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm btn-edit-prod" data-id="${p.id}"><i class="fas fa-edit"></i></button>
                <button class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm btn-del-prod" data-id="${p.id}"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');

    // Listeners dos botões
    document.querySelectorAll('.btn-edit-prod').forEach(btn => {
        btn.onclick = () => {
            const product = products.find(p => p.id == btn.dataset.id);
            renderProductForm(product);
        };
    });

    document.querySelectorAll('.btn-del-prod').forEach(btn => {
        btn.onclick = () => handleDeleteProduct(btn.dataset.id);
    });
};

const renderProductForm = (product = null) => {
    const container = document.getElementById('prodListContainer');
    const isEdit = !!product;
    const categories = getCategories().filter(c => c.id !== 'all');

    container.innerHTML = `
        <form id="productForm" class="space-y-4 p-2">
            <h4 class="text-lg font-bold text-white mb-4">${isEdit ? 'Editar Produto' : 'Novo Produto'}</h4>
            
            <div>
                <label class="block text-sm text-gray-400 mb-1">Nome</label>
                <input type="text" id="prodName" class="input-pdv w-full" value="${product?.name || ''}" required>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm text-gray-400 mb-1">Preço (R$)</label>
                    <input type="number" id="prodPrice" class="input-pdv w-full" step="0.01" value="${product?.price || ''}" required>
                </div>
                <div>
                    <label class="block text-sm text-gray-400 mb-1">Preço Regular (De)</label>
                    <input type="number" id="prodRegPrice" class="input-pdv w-full" step="0.01" value="${product?.regular_price || ''}">
                </div>
            </div>

            <div>
                <label class="block text-sm text-gray-400 mb-1">Categoria</label>
                <select id="prodCat" class="input-pdv w-full">
                    ${categories.map(c => `<option value="${c.id}" ${product?.categoryId == c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
                </select>
            </div>

            <div>
                <label class="block text-sm text-gray-400 mb-1">Status</label>
                <select id="prodStatus" class="input-pdv w-full">
                    <option value="publish" ${product?.status === 'publish' ? 'selected' : ''}>Publicado (Visível)</option>
                    <option value="draft" ${product?.status === 'draft' ? 'selected' : ''}>Rascunho (Oculto)</option>
                    <option value="private" ${product?.status === 'private' ? 'selected' : ''}>Privado</option>
                </select>
            </div>

            <div>
                <label class="block text-sm text-gray-400 mb-1">Descrição</label>
                <textarea id="prodDesc" class="input-pdv w-full" rows="3">${product?.description || ''}</textarea>
            </div>
            
            <div>
                <label class="block text-sm text-gray-400 mb-1">URL da Imagem</label>
                <input type="text" id="prodImg" class="input-pdv w-full" placeholder="https://..." value="${product?.image || ''}">
            </div>

            <div class="flex space-x-3 pt-4">
                <button type="button" class="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-3 rounded-lg" onclick="refreshProductList()">Cancelar</button>
                <button type="submit" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-bold">Salvar</button>
            </div>
        </form>
    `;

    // Esconde o botão "Novo Produto" original enquanto está no form
    document.getElementById('btnNewProduct').style.display = 'none';

    document.getElementById('productForm').onsubmit = async (e) => {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        const data = {
            name: document.getElementById('prodName').value,
            regular_price: document.getElementById('prodRegPrice').value,
            price: document.getElementById('prodPrice').value, // WooCommerce calcula sale_price automático se regular > price
            categories: [{ id: parseInt(document.getElementById('prodCat').value) }],
            status: document.getElementById('prodStatus').value,
            description: document.getElementById('prodDesc').value,
            images: document.getElementById('prodImg').value ? [{ src: document.getElementById('prodImg').value }] : []
        };

        try {
            if (isEdit) {
                await updateWooProduct(product.id, data);
            } else {
                await createWooProduct(data);
            }
            alert("Produto salvo com sucesso!");
            document.getElementById('btnNewProduct').style.display = 'block';
            refreshProductList();
        } catch (error) {
            alert("Erro ao salvar: " + error.message);
            submitBtn.disabled = false; submitBtn.textContent = 'Salvar';
        }
    };
};

const handleDeleteProduct = async (id) => {
    if (!confirm("Tem certeza que deseja excluir este produto? Ele será movido para a lixeira.")) return;
    
    try {
        await deleteWooProduct(id); // force=false por padrão (lixeira)
        alert("Produto excluído.");
        refreshProductList();
    } catch (error) {
        alert("Erro ao excluir: " + error.message);
    }
};

// =================================================================
//              FIM GESTÃO DE PRODUTOS
// =================================================================

// ... (As funções de Fechamento de Dia, Relatórios, Vouchers e Obs que já existiam continuam aqui abaixo) ...
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

        const tablesQ = query(collection(db, 'artifacts', appId, 'public', 'data', 'tables'), 
            where('status', '==', 'closed'), where('closedAt', '>=', start), where('closedAt', '<=', end));
        const tablesSnap = await getDocs(tablesQ);
        
        let totalSales = 0, money = 0, digital = 0, ordersCount = 0;
        tablesSnap.forEach(d => {
            const t = d.data(); totalSales += (t.finalTotal || t.total || 0); ordersCount++;
            (t.payments || []).forEach(p => {
                const v = parseFloat(p.value.replace(/[^\d,]/g,'').replace(',','.'));
                if(p.method.toLowerCase().includes('dinheiro')) money += v; else digital += v;
            });
        });

        const shiftsQ = query(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), where('openedAt', '>=', start), where('openedAt', '<=', end));
        const shiftsSnap = await getDocs(shiftsQ);
        const shiftIds = shiftsSnap.docs.map(d => d.id);

        await setDoc(reportRef, { date: todayStr, totalSales, totalMoney: money, totalDigital: digital, ordersCount, shiftsAudited: shiftIds, closedAt: serverTimestamp() });
        alert(`Dia encerrado com sucesso!\nTotal: ${formatCurrency(totalSales)}`);
        openReportPanel('monthly');
    } catch (e) { console.error(e); alert("Erro ao encerrar dia: " + e.message); }
};

const fetchMonthlyReports = async () => {
    const container = document.getElementById('monthlyReportsContainer');
    if (!container) return;
    container.innerHTML = '<p class="text-center py-4 text-gray-500">Carregando...</p>';
    try {
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'daily_reports'), orderBy('date', 'desc'), limit(30));
        const snap = await getDocs(q);
        if (snap.empty) { container.innerHTML = '<p class="text-center py-4 text-gray-500">Nenhum fechamento.</p>'; return; }
        container.innerHTML = snap.docs.map(d => {
            const r = d.data();
            return `<div class="bg-gray-800 p-4 rounded-lg border border-gray-700 flex justify-between items-center">
                <div><h4 class="text-white font-bold text-lg">${r.date.split('-').reverse().join('/')}</h4><p class="text-sm text-gray-400">${r.ordersCount} pedidos</p></div>
                <div class="text-right"><p class="text-green-400 font-bold text-xl">${formatCurrency(r.totalSales)}</p><p class="text-xs text-gray-500">Din: ${formatCurrency(r.totalMoney)}</p></div>
            </div>`;
        }).join('');
    } catch (e) { container.innerHTML = '<p class="text-center text-red-400">Erro.</p>'; }
};

window.showOrderDetails = async (docId) => { /* (Mantenha a função existente de showOrderDetails) */ };

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

const fetchSalesData = async (start, end) => { /* (Mantenha a função existente) */ 
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'tables'), where('status', '==', 'closed'), where('closedAt', '>=', start), where('closedAt', '<', end), orderBy('closedAt', 'desc'));
    const snapshot = await getDocs(q);
    let totalSales = 0, totalMoney = 0, totalDigital = 0, totalService = 0, rowsHtml = '';
    snapshot.forEach(docSnap => {
        const table = docSnap.data(); let tableTotal = 0;
        (table.payments || []).forEach(p => {
            const val = parseFloat(p.value.replace(/[^\d,]/g,'').replace(',','.'));
            if (!isNaN(val)) { tableTotal += val; if (p.method.toLowerCase().includes('dinheiro')) totalMoney += val; else totalDigital += val; }
        });
        totalSales += tableTotal; if (table.serviceTaxApplied) totalService += (tableTotal - (tableTotal / 1.1));
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

const fetchShiftsData = async (start, end) => { /* (Mantenha a função existente) */
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), where('openedAt', '>=', start), where('openedAt', '<', end), orderBy('openedAt', 'desc'));
    const snapshot = await getDocs(q);
    const container = document.getElementById('shiftsListContainer');
    if (snapshot.empty) { container.innerHTML = '<p class="text-center py-4">Nenhum turno.</p>'; return; }
    container.innerHTML = snapshot.docs.map(d => {
        const s = d.data(); const diff = s.difference || 0; const color = diff > 0.1 ? 'text-blue-400' : diff < -0.1 ? 'text-red-400' : 'text-green-500';
        return `<div class="bg-gray-800 p-4 rounded border border-gray-700 flex justify-between">
            <div><h4 class="text-white font-bold">${s.userName}</h4><p class="text-xs text-gray-400">${s.openedAt.toDate().toLocaleTimeString()}</p></div>
            <div class="text-right"><p class="${color} font-bold">${formatCurrency(diff)}</p><p class="text-xs text-gray-500">${s.status}</p></div>
        </div>`;
    }).join('');
};

const openVoucherManagementModal = async () => { /* (Mantenha a função existente) */ 
    if (!voucherManagementModal) return; if(managerModal) managerModal.style.display = 'none'; voucherManagementModal.style.display = 'flex'; if(voucherForm) voucherForm.style.display = 'none'; await fetchVouchers();
};
window.openVoucherManagementModal = openVoucherManagementModal;

const fetchVouchers = async () => { /* (Mantenha a função existente) */ 
    if (!voucherListContainer) return; voucherListContainer.innerHTML = '<p class="text-sm text-yellow-400 italic">Buscando...</p>';
    try {
        const q = query(getVouchersCollectionRef(), orderBy('points', 'asc'));
        const querySnapshot = await getDocs(q);
        const vouchers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        voucherListContainer.innerHTML = vouchers.length === 0 ? '<p class="text-sm text-dark-placeholder italic">Nenhum voucher.</p>' : 
        vouchers.map(v => `<div class="flex justify-between items-center bg-dark-input p-3 rounded-lg mb-2"><div><h4 class="font-bold text-dark-text">${v.name}</h4><p class="text-sm text-indigo-400">${v.points} pts = ${formatCurrency(v.value)}</p></div><button class="text-red-400 hover:text-red-500" onclick="window.handleDeleteVoucher('${v.id}')"><i class="fas fa-trash"></i></button></div>`).join('');
    } catch (error) { console.error(error); voucherListContainer.innerHTML = '<p class="text-red-400">Erro.</p>'; }
};

const handleSaveVoucher = async (e) => { /* (Mantenha a função existente) */ 
    e.preventDefault(); const id = document.getElementById('voucherIdInput').value || doc(getVouchersCollectionRef()).id;
    const name = document.getElementById('voucherNameInput').value; const points = parseInt(document.getElementById('voucherPointsInput').value); const value = parseFloat(document.getElementById('voucherValueInput').value); const saveBtn = document.getElementById('saveVoucherBtn');
    saveBtn.disabled = true; try { await setDoc(doc(getVouchersCollectionRef(), id), { id, name, points, value, createdAt: serverTimestamp() }, { merge: true }); voucherForm.style.display = 'none'; await fetchVouchers(); alert("Salvo!"); } catch (e) { alert("Erro: " + e.message); } finally { saveBtn.disabled = false; }
};

window.handleDeleteVoucher = async (id) => { /* (Mantenha a função existente) */ 
    if(confirm("Excluir voucher?")) { await deleteDoc(doc(getVouchersCollectionRef(), id)); fetchVouchers(); }
};

const renderQuickObsManagementModal = async () => { /* (Mantenha a função existente) */ 
    if (!managerModal) return;
    managerModal.innerHTML = `<div class="bg-dark-card border border-dark-border p-6 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"><div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold text-indigo-400">Obs. Rápidas</h3><button id="closeQuickObs" class="px-4 py-2 bg-gray-600 text-white rounded">Fechar</button></div><form id="addQuickObsForm" class="flex space-x-2 mb-4"><input type="text" id="newQuickObsInput" placeholder="Nova observação..." class="input-pdv w-full" required><button type="submit" class="bg-green-600 text-white px-4 rounded">Adicionar</button></form><div id="quickObsList" class="overflow-y-auto flex-grow space-y-2">Carregando...</div></div>`;
    managerModal.style.display = 'flex'; document.getElementById('closeQuickObs').onclick = () => managerModal.style.display = 'none';
    document.getElementById('addQuickObsForm').onsubmit = async (e) => { e.preventDefault(); const text = document.getElementById('newQuickObsInput').value.trim(); if(text) { const id = text.toLowerCase().replace(/[^a-z0-9]/g, ''); await setDoc(doc(getQuickObsCollectionRef(), id), { text }); loadQuickObsList(); document.getElementById('newQuickObsInput').value = ''; } }; loadQuickObsList();
};

const loadQuickObsList = async () => { /* (Mantenha a função existente) */ 
    const container = document.getElementById('quickObsList'); if(!container) return; const snap = await getDocs(query(getQuickObsCollectionRef(), orderBy('text')));
    container.innerHTML = snap.docs.map(d => `<div class="flex justify-between bg-dark-input p-2 rounded"><span class="text-white">${d.data().text}</span><button onclick="window.deleteQuickObs('${d.id}')" class="text-red-400"><i class="fas fa-trash"></i></button></div>`).join('');
};

window.deleteQuickObs = async (id) => { /* (Mantenha a função existente) */ 
    if(confirm("Excluir?")) { await deleteDoc(doc(getQuickObsCollectionRef(), id)); loadQuickObsList(); }
};