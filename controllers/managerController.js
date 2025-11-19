import { db, appId, getVouchersCollectionRef, getQuickObsCollectionRef, getTablesCollectionRef } from "/services/firebaseService.js";
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

// Variáveis de Estado
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

    // Configuração do Modal de Vouchers
    voucherManagementModal = document.getElementById('voucherManagementModal'); 
    voucherListContainer = document.getElementById('voucherListContainer');     
    voucherForm = document.getElementById('voucherForm');                       
    document.getElementById('showVoucherFormBtn')?.addEventListener('click', () => { 
        if(voucherForm) { voucherForm.style.display = 'block'; voucherForm.reset(); }
    });
    if (voucherForm) voucherForm.addEventListener('submit', handleSaveVoucher);

    // Configuração do Painel de Gestão de Caixa (Relatórios)
    reportDateInput = document.getElementById('reportDateInput');
    if (reportDateInput) {
        reportDateInput.valueAsDate = new Date(); 
        reportDateInput.addEventListener('change', loadReports);
    }
    document.getElementById('refreshReportBtn')?.addEventListener('click', loadReports);

    // Lógica de Abas do Painel de Caixa
    const tabBtns = document.querySelectorAll('.report-tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove ativo de todas
            tabBtns.forEach(b => { 
                b.classList.remove('bg-indigo-600', 'text-white'); 
                b.classList.add('bg-dark-input', 'text-gray-300'); 
            });
            // Ativa a atual
            btn.classList.remove('bg-dark-input', 'text-gray-300'); 
            btn.classList.add('bg-indigo-600', 'text-white');
            
            // Troca o conteúdo visível
            document.querySelectorAll('.report-content').forEach(c => c.classList.add('hidden'));
            const targetContent = document.getElementById(`tab-${btn.dataset.tab}`);
            if(targetContent) targetContent.classList.remove('hidden');
            
            // Recarrega dados se necessário
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
        case 'openWooSync': syncWithWooCommerce(); break;
        case 'openProductManagement': renderProductManagementModal(); break;
        
        // Novas Ações de Caixa
        case 'openCashManagementReport': openReportPanel('active-shifts'); break;
        case 'closeDay': handleCloseDay(); break;

        // Ações "Em Breve"
        case 'openInventoryManagement': alert("Módulo de Estoque em desenvolvimento."); break;
        case 'openRecipesManagement': alert("Módulo de Ficha Técnica em desenvolvimento."); break;
        case 'openCustomerCRM': alert("Módulo de CRM em desenvolvimento."); break;
        case 'openSectorManagement': alert("Gestão de Setores em desenvolvimento."); break;

        default: console.warn(`Ação não mapeada: ${action}`);
    }
};

// =================================================================
//              GESTÃO DE PRODUTOS (WOOCOMMERCE)
// =================================================================
const renderProductManagementModal = async () => {
    const modalId = 'productManagementModal';
    let modal = document.getElementById(modalId);
    
    if (!modal) {
        const modalHtml = `<div id="${modalId}" class="fixed inset-0 bg-gray-900 bg-opacity-90 flex items-center justify-center z-50 hidden p-4 print-hide"></div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById(modalId);
    }

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
    await refreshProductList();
    document.getElementById('btnNewProduct').onclick = () => renderProductForm();
};

const refreshProductList = async () => {
    const container = document.getElementById('prodListContainer');
    if (!container) return;

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

    document.getElementById('btnNewProduct').style.display = 'none';

    document.getElementById('productForm').onsubmit = async (e) => {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        const data = {
            name: document.getElementById('prodName').value,
            regular_price: document.getElementById('prodRegPrice').value,
            price: document.getElementById('prodPrice').value,
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
        await deleteWooProduct(id);
        alert("Produto excluído.");
        refreshProductList();
    } catch (error) {
        alert("Erro ao excluir: " + error.message);
    }
};

// =================================================================
//              GESTÃO DE CAIXA E RELATÓRIOS (UNIFICADO)
// =================================================================

const openReportPanel = (tabName = 'active-shifts') => {
    const modal = document.getElementById('reportsModal');
    if(modal) {
        modal.style.display = 'flex';
        // Simula clique na aba correta
        const btn = document.querySelector(`.report-tab-btn[data-tab="${tabName}"]`);
        if(btn) btn.click();
        else loadReports(); // Carrega padrão se aba não encontrada
    }
};

const loadReports = async () => {
    if (!reportDateInput) return;
    
    const dateVal = reportDateInput.value;
    if(!dateVal) return;

    const startOfDay = Timestamp.fromDate(new Date(dateVal + 'T00:00:00'));
    const endOfDay = Timestamp.fromDate(new Date(dateVal + 'T23:59:59'));

    // Identifica qual aba está ativa para priorizar carregamento (opcional, aqui carrega tudo)
    try {
        await Promise.all([
            fetchActiveShifts(),                 // Aba: Abertos (Tempo Real)
            fetchClosedShifts(startOfDay, endOfDay), // Aba: Fechados
            fetchSalesData(startOfDay, endOfDay)     // Aba: Vendas
        ]);
    } catch (e) { 
        console.error("Erro ao carregar dados do painel de caixa:", e); 
    }
};

// ABA 1: CAIXAS ABERTOS (ACTIVE SHIFTS)
const fetchActiveShifts = async () => {
    const container = document.getElementById('activeShiftsContainer');
    if (!container) return;
    
    // Busca apenas turnos ABERTOS, independente da data do filtro (mostra o 'agora')
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
            const initial = s.initialBalance || 0;

            return `
                <div class="bg-gray-800 border border-green-500/50 rounded-xl p-5 shadow-lg relative flex flex-col">
                    <div class="absolute top-3 right-3">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-900 text-green-300 border border-green-700 animate-pulse">
                            <span class="w-2 h-2 bg-green-400 rounded-full mr-1.5"></span> Ativo
                        </span>
                    </div>
                    
                    <div class="flex items-center mb-4">
                        <div class="h-12 w-12 rounded-full bg-gray-700 flex items-center justify-center text-2xl mr-4 border border-gray-600">
                            <i class="fas fa-user-circle text-green-400"></i>
                        </div>
                        <div>
                            <h5 class="text-white font-bold text-lg leading-tight">${s.userName || 'Operador'}</h5>
                            <p class="text-xs text-gray-400 mt-1">Aberto às ${openTime}</p>
                        </div>
                    </div>
                    
                    <div class="bg-gray-900/50 rounded-lg p-3 mb-4 border border-gray-700">
                        <div class="flex justify-between text-sm mb-1">
                            <span class="text-gray-400">Fundo Inicial:</span>
                            <span class="text-white font-mono font-bold">${formatCurrency(initial)}</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-400">Setor:</span>
                            <span class="text-pumpkin font-bold">Geral</span> </div>
                    </div>

                    <button onclick="alert('Funcionalidade de Detalhes em Tempo Real será implementada na próxima atualização.')" class="mt-auto w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold transition flex items-center justify-center shadow-md">
                        <i class="fas fa-eye mr-2"></i> Ver Movimentação
                    </button>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error(e);
        container.innerHTML = '<p class="text-red-400 col-span-full text-center">Erro ao carregar caixas.</p>';
    }
};

// ABA 2: CAIXAS FECHADOS (CLOSED SHIFTS)
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
            // Cores para diferença: Vermelho (Falta > 0.50), Azul (Sobra > 0.50), Verde (Ok)
            const diffColor = diff < -0.5 ? 'text-red-400' : (diff > 0.5 ? 'text-blue-400' : 'text-green-500');
            
            const openTime = s.openedAt?.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            const closeTime = s.closedAt?.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});

            return `
                <div class="bg-gray-800 p-4 rounded-lg border border-gray-700 flex flex-col md:flex-row justify-between items-center gap-4 hover:bg-gray-750 transition">
                    <div class="flex items-center w-full md:w-1/3">
                        <div class="mr-4 text-gray-500 bg-gray-900 h-10 w-10 flex items-center justify-center rounded-full"><i class="fas fa-history"></i></div>
                        <div>
                            <h4 class="text-white font-bold text-base">${s.userName}</h4>
                            <p class="text-xs text-gray-400">
                                <i class="far fa-clock mr-1"></i> ${openTime} - ${closeTime}
                            </p>
                        </div>
                    </div>
                    
                    <div class="flex space-x-2 w-full md:w-2/3 justify-between md:justify-end bg-gray-900/30 p-2 rounded-lg md:bg-transparent md:p-0">
                        <div class="text-right px-2 md:px-4 border-r border-gray-700 last:border-0">
                            <p class="text-[10px] text-gray-500 uppercase tracking-wider">Vendas (Din)</p>
                            <p class="text-white font-bold text-sm">${formatCurrency(s.reportSalesMoney || 0)}</p>
                        </div>
                        <div class="text-right px-2 md:px-4 border-r border-gray-700 last:border-0">
                            <p class="text-[10px] text-gray-500 uppercase tracking-wider">Na Gaveta</p>
                            <p class="text-white font-bold text-sm">${formatCurrency(s.finalCashInDrawer || 0)}</p>
                        </div>
                        <div class="text-right px-2 md:px-4">
                            <p class="text-[10px] text-gray-500 uppercase tracking-wider">Quebra</p>
                            <p class="${diffColor} font-bold text-sm">${formatCurrency(diff)}</p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error(e);
        container.innerHTML = '<p class="text-red-400 text-center">Erro ao carregar histórico.</p>';
    }
};

// ABA 3: RELATÓRIO DE VENDAS (SALES DATA)
const fetchSalesData = async (start, end) => {
    const q = query(
        collection(db, 'artifacts', appId, 'public', 'data', 'tables'), 
        where('status', '==', 'closed'), 
        where('closedAt', '>=', start), 
        where('closedAt', '<', end), 
        orderBy('closedAt', 'desc')
    );
    
    const snapshot = await getDocs(q);
    
    let totalSales = 0, totalMoney = 0, totalDigital = 0, totalService = 0;
    let rowsHtml = '';

    snapshot.forEach(docSnap => {
        const table = docSnap.data(); 
        let tableTotal = 0;
        
        (table.payments || []).forEach(p => {
            const val = parseFloat(p.value.toString().replace(/[^\d,.-]/g,'').replace(',','.'));
            if (!isNaN(val)) { 
                tableTotal += val; 
                if (p.method.toLowerCase().includes('dinheiro')) totalMoney += val; 
                else totalDigital += val; 
            }
        });
        
        totalSales += tableTotal; 
        if (table.serviceTaxApplied) totalService += (tableTotal - (tableTotal / 1.1));
        
        rowsHtml += `
            <tr class="hover:bg-gray-700 transition border-b border-gray-800 cursor-pointer" onclick="window.showOrderDetails('${docSnap.id}')">
                <td class="p-3 text-gray-300">${table.closedAt ? table.closedAt.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--'}</td>
                <td class="p-3 font-bold text-white">Mesa ${table.tableNumber}</td>
                <td class="p-3 text-gray-400 text-sm">${table.waiterId || table.closedBy || 'Staff'}</td>
                <td class="p-3 text-right text-green-400 font-bold">${formatCurrency(tableTotal)}</td>
            </tr>`;
    });

    document.getElementById('reportTotalSales').textContent = formatCurrency(totalSales);
    document.getElementById('reportTotalMoney').textContent = formatCurrency(totalMoney);
    document.getElementById('reportTotalDigital').textContent = formatCurrency(totalDigital);
    document.getElementById('reportTotalService').textContent = formatCurrency(totalService);
    document.getElementById('reportSalesTableBody').innerHTML = rowsHtml || '<tr><td colspan="4" class="text-center p-8 text-gray-500 italic">Nenhuma venda registrada neste período.</td></tr>';
};

const handleCloseDay = async () => {
    if (!confirm("ATENÇÃO: Tem certeza que deseja ENCERRAR O DIA?\n\nIsso consolidará todas as vendas e turnos de hoje em um relatório final imutável.")) return;

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

        // Consolida Mesas
        const tablesQ = query(collection(db, 'artifacts', appId, 'public', 'data', 'tables'), 
            where('status', '==', 'closed'), where('closedAt', '>=', start), where('closedAt', '<=', end));
        const tablesSnap = await getDocs(tablesQ);
        
        let totalSales = 0, money = 0, digital = 0, ordersCount = 0;
        tablesSnap.forEach(d => {
            const t = d.data(); 
            // Tenta pegar do finalTotal (se existir) ou recalcula dos pagamentos
            let tableTotal = 0;
            if (t.payments) {
                t.payments.forEach(p => {
                     const v = parseFloat(p.value.toString().replace(/[^\d,.-]/g,'').replace(',','.'));
                     if(!isNaN(v)) {
                         tableTotal += v;
                         if(p.method.toLowerCase().includes('dinheiro')) money += v; else digital += v;
                     }
                });
            }
            totalSales += tableTotal;
            ordersCount++;
        });

        // Consolida Turnos
        const shiftsQ = query(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), 
            where('openedAt', '>=', start), where('openedAt', '<=', end));
        const shiftsSnap = await getDocs(shiftsQ);
        const shiftIds = shiftsSnap.docs.map(d => d.id);

        // Salva Relatório
        await setDoc(reportRef, { 
            date: todayStr, 
            totalSales, 
            totalMoney: money, 
            totalDigital: digital, 
            ordersCount, 
            shiftsAudited: shiftIds, 
            closedAt: serverTimestamp() 
        });
        
        alert(`Dia encerrado com sucesso!\n\nTotal Consolidado: ${formatCurrency(totalSales)}\nDinheiro: ${formatCurrency(money)}\nDigital: ${formatCurrency(digital)}`);
        
        // Opcional: Mudar para uma aba de "Histórico Mensal" se existisse
        loadReports(); 

    } catch (e) { 
        console.error(e); 
        alert("Erro crítico ao encerrar dia: " + e.message); 
    }
};

const fetchMonthlyReports = async () => {
    // Placeholder para aba de histórico mensal se implementada no futuro
    // Código mantido para compatibilidade
};

// --- FUNÇÕES AUXILIARES E OUTROS MODAIS ---

window.showOrderDetails = async (docId) => { 
    // Futuro: Abrir modal com detalhes do pedido (itens, pagamentos, etc.)
    console.log("Ver detalhes do pedido:", docId);
};

// Função global de autenticação gerencial
export const openManagerAuthModal = (actionCallback) => {
    if (!managerModal) return;
    managerAuthCallback = actionCallback; 
    managerModal.innerHTML = `
        <div class="bg-dark-card border border-dark-border p-6 rounded-xl shadow-2xl w-full max-w-sm text-center">
            <h3 class="text-xl font-bold mb-4 text-red-400">Acesso Restrito</h3>
            <p class="text-sm text-gray-400 mb-4">Esta ação requer privilégios de gerente.</p>
            <input type="password" id="managerPasswordInput" placeholder="Senha" class="input-pdv w-full p-4 mb-6 text-base text-center tracking-widest">
            <div class="flex justify-end space-x-3">
                <button onclick="document.getElementById('managerModal').style.display='none'" class="px-4 py-3 bg-gray-600 text-gray-200 rounded-lg hover:bg-gray-500 transition">Cancelar</button>
                <button id="submitManagerAuthBtn" class="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-bold">Entrar</button>
            </div>
        </div>`;
    managerModal.style.display = 'flex';
    const input = document.getElementById('managerPasswordInput');
    input.focus();
    
    const submit = () => {
        if(input.value === '1234') handleGerencialAction(managerAuthCallback);
        else { alert('Senha incorreta'); input.value = ''; input.focus(); }
    };

    document.getElementById('submitManagerAuthBtn').onclick = submit;
    input.onkeydown = (e) => { if(e.key === 'Enter') submit(); };
};


// --- GESTÃO DE VOUCHERS ---
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
    voucherListContainer.innerHTML = '<p class="text-sm text-yellow-400 italic text-center py-4">Buscando vouchers...</p>';
    try {
        const q = query(getVouchersCollectionRef(), orderBy('points', 'asc'));
        const querySnapshot = await getDocs(q);
        const vouchers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (vouchers.length === 0) {
            voucherListContainer.innerHTML = '<p class="text-sm text-dark-placeholder italic text-center py-4">Nenhum voucher cadastrado.</p>';
        } else {
            voucherListContainer.innerHTML = vouchers.map(v => `
                <div class="flex justify-between items-center bg-dark-input p-3 rounded-lg mb-2 border border-gray-700">
                    <div>
                        <h4 class="font-bold text-dark-text">${v.name}</h4>
                        <p class="text-sm text-indigo-400 font-mono">${v.points} pts = ${formatCurrency(v.value)}</p>
                    </div>
                    <button class="text-red-400 hover:text-red-500 p-2 rounded hover:bg-gray-700 transition" onclick="window.handleDeleteVoucher('${v.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `).join('');
        }
    } catch (error) { 
        console.error(error); 
        voucherListContainer.innerHTML = '<p class="text-red-400 text-center">Erro ao carregar.</p>'; 
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
        // alert("Voucher salvo!"); 
    } catch (e) { 
        alert("Erro: " + e.message); 
    } finally { 
        saveBtn.disabled = false; 
    }
};

window.handleDeleteVoucher = async (id) => { 
    if(confirm("Excluir voucher permanentemente?")) { 
        await deleteDoc(doc(getVouchersCollectionRef(), id)); 
        fetchVouchers(); 
    }
};


// --- OBSERVAÇÕES RÁPIDAS ---
const renderQuickObsManagementModal = async () => { 
    if (!managerModal) return;
    managerModal.innerHTML = `
        <div class="bg-dark-card border border-dark-border p-6 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-indigo-400">Observações Rápidas</h3>
                <button id="closeQuickObs" class="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded transition">&times;</button>
            </div>
            <form id="addQuickObsForm" class="flex space-x-2 mb-4">
                <input type="text" id="newQuickObsInput" placeholder="Nova observação (ex: Sem gelo)..." class="input-pdv w-full" required>
                <button type="submit" class="bg-green-600 hover:bg-green-700 text-white px-4 rounded font-bold transition"><i class="fas fa-plus"></i></button>
            </form>
            <div id="quickObsList" class="overflow-y-auto flex-grow space-y-2 pr-2 custom-scrollbar">
                <p class="text-gray-500 text-center italic">Carregando...</p>
            </div>
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
            document.getElementById('newQuickObsInput').focus();
        } 
    }; 
    loadQuickObsList();
};

const loadQuickObsList = async () => { 
    const container = document.getElementById('quickObsList'); 
    if(!container) return; 
    const snap = await getDocs(query(getQuickObsCollectionRef(), orderBy('text')));
    
    if (snap.empty) {
        container.innerHTML = '<p class="text-gray-500 text-center italic py-4">Nenhuma observação cadastrada.</p>';
        return;
    }

    container.innerHTML = snap.docs.map(d => `
        <div class="flex justify-between items-center bg-dark-input p-3 rounded border border-gray-700">
            <span class="text-white font-medium">${d.data().text}</span>
            <button onclick="window.deleteQuickObs('${d.id}')" class="text-red-400 hover:text-red-300 transition p-1">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');
};

window.deleteQuickObs = async (id) => { 
    if(confirm("Excluir observação?")) { 
        await deleteDoc(doc(getQuickObsCollectionRef(), id)); 
        loadQuickObsList(); 
    }
};