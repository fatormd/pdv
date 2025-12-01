// --- CONTROLLERS/MANAGER/MODULES/CRMMANAGER.JS (FINAL - CASHBACK & HISTÓRICO) ---

import { db, appId, getCollectionRef, getTablesCollectionRef } from "/services/firebaseService.js"; 
import { query, getDocs, orderBy, limit, doc, where, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { formatCurrency } from "/utils.js";
import { showToast } from "/app.js"; 

let managerModal = null;

// Configuração de Cashback (Ex: 5% do valor gasto vira ponto)
const CASHBACK_RATE = 0.05; 

// ==================================================================
//           1. API PÚBLICA
// ==================================================================

export const init = () => {
    console.log("[CrmModule] Inicializado.");
    managerModal = document.getElementById('managerModal');
    
    // Expõe funções globais
    window.loadCrmCustomers = loadCrmCustomers;
    window.viewCustomerHistory = viewCustomerHistory;
    window.closeCustomerHistory = closeCustomerHistory;
};

export const open = async () => {
    await renderCrmPanel();
};

// ==================================================================
//           2. INTERFACE (UI)
// ==================================================================

async function renderCrmPanel() {
    if (!managerModal) return;

    managerModal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 w-full max-w-5xl h-[90vh] flex flex-col rounded-xl shadow-2xl overflow-hidden animate-fade-in relative">
            
            <div class="flex justify-between items-center p-6 border-b border-gray-700 bg-gray-800 flex-shrink-0">
                <div>
                    <h3 class="text-2xl font-bold text-blue-400"><i class="fas fa-users mr-2"></i>CRM de Clientes</h3>
                    <p class="text-sm text-gray-400">Gerencie fidelidade e histórico de compras.</p>
                </div>
                <button class="text-gray-400 hover:text-white text-3xl leading-none" onclick="document.getElementById('managerModal').style.display='none'">&times;</button>
            </div>
            
            <div class="p-4 bg-dark-bg border-b border-gray-700 flex-shrink-0">
                <div class="relative">
                    <input type="text" id="crmSearch" placeholder="Buscar por Nome, CPF, Telefone..." class="input-pdv w-full p-4 pl-12 rounded-lg border border-gray-600 focus:border-blue-500 text-white bg-dark-input text-lg">
                    <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl"></i>
                </div>
            </div>

            <div id="crmContent" class="flex-grow overflow-y-auto p-6 bg-dark-bg custom-scrollbar relative">
                <div class="flex justify-center py-10"><i class="fas fa-spinner fa-spin text-blue-500 text-3xl"></i></div>
            </div>
            
            <div id="historyOverlay" class="absolute inset-0 bg-gray-900/95 z-50 hidden flex-col transition-opacity duration-300">
                <div class="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-800">
                    <h4 class="text-xl font-bold text-white"><i class="fas fa-history mr-2"></i>Histórico do Cliente</h4>
                    <button onclick="window.closeCustomerHistory()" class="text-gray-400 hover:text-white text-2xl">&times;</button>
                </div>
                <div id="historyContent" class="flex-grow overflow-y-auto p-6 custom-scrollbar">
                    </div>
            </div>
        </div>`;
    
    managerModal.style.display = 'flex';
    managerModal.classList.remove('p-4'); 
    managerModal.classList.add('p-0', 'md:p-4');

    const searchInput = document.getElementById('crmSearch');
    let timeout = null;
    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => loadCrmCustomers(e.target.value), 500);
        });
        searchInput.focus();
    }

    await loadCrmCustomers();
}

// ==================================================================
//           3. LÓGICA DE DADOS
// ==================================================================

async function loadCrmCustomers(searchTerm = '') {
    const container = document.getElementById('crmContent');
    if(!container) return;

    if(!searchTerm) container.innerHTML = '<div class="flex justify-center py-10"><i class="fas fa-spinner fa-spin text-blue-500 text-3xl"></i></div>';

    try {
        const customersRef = getCollectionRef('customers');
        const q = query(customersRef, orderBy('name'), limit(50));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            container.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-gray-500 opacity-50"><i class="fas fa-user-slash text-6xl mb-4"></i><p>Nenhum cliente cadastrado.</p></div>`;
            return;
        }

        const customers = [];
        snapshot.forEach(doc => customers.push({id: doc.id, ...doc.data()}));

        // Filtro local
        const term = searchTerm.toLowerCase();
        const filtered = searchTerm ? customers.filter(c => 
            (c.name && c.name.toLowerCase().includes(term)) ||
            (c.cpf && c.cpf.includes(term)) || 
            (c.phone && c.phone.includes(term))
        ) : customers;

        if(filtered.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center italic mt-10">Nenhum cliente encontrado.</p>';
            return;
        }

        container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${filtered.map(c => {
                // Cálculo visual de Cashback (Valor Acumulado Estimado)
                const points = c.points || c.loyaltyPoints || 0;
                const cashbackValue = points; // Assumindo 1 ponto = R$ 1,00 para simplificar a visualização
                
                return `
                <div class="bg-gray-800 p-5 rounded-xl border border-gray-700 hover:border-blue-500 transition relative group shadow-lg flex flex-col justify-between h-full">
                    <div>
                        <div class="flex items-center space-x-3 mb-4">
                            <div class="w-12 h-12 rounded-full bg-gradient-to-br from-blue-900 to-blue-700 text-white flex items-center justify-center text-xl font-bold shadow-inner">
                                ${c.name ? c.name.charAt(0).toUpperCase() : '?'}
                            </div>
                            <div class="min-w-0 overflow-hidden">
                                <h4 class="font-bold text-white truncate text-lg">${c.name || 'Cliente'}</h4>
                                <p class="text-xs text-gray-400 truncate">${c.email || 'Sem e-mail'}</p>
                            </div>
                        </div>

                        <div class="space-y-2 text-sm text-gray-300 bg-gray-900/50 p-3 rounded-lg mb-4 border border-gray-700/50">
                            <p class="flex items-center justify-between"><span class="text-gray-500 text-xs uppercase">CPF</span> <span class="font-mono">${c.cpf || '--'}</span></p>
                            <p class="flex items-center justify-between"><span class="text-gray-500 text-xs uppercase">Tel</span> <span class="font-mono">${c.phone || '--'}</span></p>
                        </div>
                    </div>

                    <div class="pt-3 border-t border-gray-700 flex justify-between items-center">
                        <div class="flex flex-col">
                            <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Cashback</span>
                            <div class="flex items-center text-green-400 font-bold text-lg" title="${points} pontos">
                                <i class="fas fa-coins mr-1 text-xs"></i> ${formatCurrency(cashbackValue)}
                            </div>
                        </div>
                        <button onclick="window.viewCustomerHistory('${c.id}', '${c.name}', '${c.cpf}')" class="px-3 py-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white rounded-lg text-xs font-bold transition">
                            Ver Histórico
                        </button>
                    </div>
                </div>`;
            }).join('')}
        </div>`;

    } catch (e) {
        console.error(e);
        container.innerHTML = `<p class="text-red-400 text-center mt-10">Erro ao carregar: ${e.message}</p>`;
    }
}

// ==================================================================
//           4. HISTÓRICO DE PEDIDOS (REAL)
// ==================================================================

async function viewCustomerHistory(id, name, cpf) {
    const overlay = document.getElementById('historyOverlay');
    const content = document.getElementById('historyContent');
    if(!overlay || !content) return;

    overlay.classList.remove('hidden');
    content.innerHTML = '<div class="text-center py-10"><i class="fas fa-spinner fa-spin text-4xl text-blue-500"></i><p class="mt-4 text-gray-400">Buscando histórico de compras...</p></div>';

    try {
        // Busca pedidos fechados vinculados a este cliente (por ID, CPF ou Nome)
        // Nota: A busca ideal é por ID, mas o sistema legado pode ter salvo apenas Nome/CPF na mesa.
        // Vamos tentar buscar por CPF primeiro, que é mais seguro.
        
        let q;
        if(cpf && cpf !== 'undefined' && cpf !== '--') {
            q = query(getTablesCollectionRef(), where('clientCpf', '==', cpf), where('status', '==', 'closed'), orderBy('closedAt', 'desc'), limit(20));
        } else {
            // Fallback: Busca por Nome (menos preciso)
            q = query(getTablesCollectionRef(), where('clientName', '==', name), where('status', '==', 'closed'), orderBy('closedAt', 'desc'), limit(20));
        }

        const snapshot = await getDocs(q);

        if(snapshot.empty) {
            content.innerHTML = `
                <div class="text-center py-20 text-gray-500">
                    <i class="fas fa-receipt text-6xl mb-4 opacity-30"></i>
                    <h3 class="text-xl font-bold text-white">Nenhuma compra encontrada</h3>
                    <p>Este cliente ainda não possui histórico de pedidos fechados.</p>
                </div>`;
            return;
        }

        let totalSpent = 0;
        let historyHTML = `<div class="space-y-4">`;

        snapshot.forEach(doc => {
            const sale = doc.data();
            const date = sale.closedAt ? sale.closedAt.toDate().toLocaleString() : 'Data Desc.';
            const total = sale.total || 0;
            totalSpent += total;
            
            // Calcula cashback gerado nesta compra (Simulado)
            const earned = total * CASHBACK_RATE;

            const itemsList = (sale.sentItems || []).map(i => `<span class="inline-block bg-gray-700 px-2 py-1 rounded text-xs mr-1 mb-1">${i.name}</span>`).join('');

            historyHTML += `
                <div class="bg-dark-bg p-4 rounded-lg border border-gray-700 flex justify-between items-start">
                    <div class="flex-grow">
                        <div class="flex items-center mb-1">
                            <span class="text-blue-400 font-bold mr-2">Pedido #${doc.id.substring(0,6)}...</span>
                            <span class="text-gray-500 text-xs">${date}</span>
                        </div>
                        <div class="flex flex-wrap mt-2">${itemsList || '<span class="text-gray-600 italic">Sem itens listados</span>'}</div>
                    </div>
                    <div class="text-right min-w-[100px] ml-4">
                        <div class="text-white font-bold text-lg">${formatCurrency(total)}</div>
                        <div class="text-green-400 text-xs mt-1 font-mono">+${formatCurrency(earned)} cashback</div>
                    </div>
                </div>`;
        });

        historyHTML += `</div>`;

        // Cabeçalho do Resumo
        const summaryHTML = `
            <div class="grid grid-cols-2 gap-4 mb-6">
                <div class="bg-blue-900/20 p-4 rounded-xl border border-blue-500/30 text-center">
                    <p class="text-gray-400 text-xs uppercase">Total Gasto</p>
                    <p class="text-2xl font-bold text-white">${formatCurrency(totalSpent)}</p>
                </div>
                <div class="bg-green-900/20 p-4 rounded-xl border border-green-500/30 text-center">
                    <p class="text-gray-400 text-xs uppercase">Cashback Gerado (Est.)</p>
                    <p class="text-2xl font-bold text-green-400">${formatCurrency(totalSpent * CASHBACK_RATE)}</p>
                </div>
            </div>`;

        content.innerHTML = summaryHTML + historyHTML;

    } catch(e) {
        console.error(e);
        content.innerHTML = `<p class="text-red-400 text-center">Erro ao carregar histórico: ${e.message}</p>`;
    }
}

function closeCustomerHistory() {
    const overlay = document.getElementById('historyOverlay');
    if(overlay) overlay.classList.add('hidden');
}