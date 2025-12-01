// --- CONTROLLERS/MANAGER/MODULES/FINANCEMANAGER.JS ---

import { db, appId, getTablesCollectionRef } from "/services/firebaseService.js"; 
import { 
    collection, query, where, getDocs, orderBy, limit,
    doc, deleteDoc, addDoc, serverTimestamp, Timestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { formatCurrency, toggleLoading } from "/utils.js";
import { showToast } from "/app.js"; 

// Helpers Locais
const getColRef = (name) => collection(db, 'artifacts', appId, 'public', 'data', name);
let managerModal = null;
let currentTab = 'dre';

// ==================================================================
//           1. API PÚBLICA
// ==================================================================

export const init = () => {
    console.log("[FinanceModule] Inicializado.");
    managerModal = document.getElementById('managerModal');
    
    // Expõe funções globais para os botões do HTML injetado
    window.switchFinTab = switchFinTab;
    window.toggleExpenseForm = toggleExpenseForm;
    window.saveExpense = saveExpense;
    window.deleteExpense = deleteExpense;
};

export const open = async () => {
    await renderFinancialModule();
};

// ==================================================================
//           2. INTERFACE PRINCIPAL (UI)
// ==================================================================

async function renderFinancialModule() {
    if (!managerModal) return;
    
    managerModal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 w-full max-w-6xl h-[90vh] flex flex-col rounded-xl shadow-2xl overflow-hidden animate-fade-in">
            <div class="flex justify-between items-center p-6 border-b border-gray-700 bg-gray-800 flex-shrink-0">
                <div>
                    <h3 class="text-2xl font-bold text-pink-500"><i class="fas fa-chart-pie mr-2"></i>Gestão Financeira</h3>
                    <p class="text-sm text-gray-400">DRE e Controle de Despesas</p>
                </div>
                <button class="text-gray-400 hover:text-white text-3xl leading-none" onclick="document.getElementById('managerModal').style.display='none'">&times;</button>
            </div>
            
            <div class="flex p-4 bg-dark-bg border-b border-gray-700 space-x-2 items-center overflow-x-auto flex-shrink-0">
                <button id="tab-dre" class="fin-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center" onclick="window.switchFinTab('dre')">
                    <i class="fas fa-file-invoice-dollar mr-2"></i> DRE Gerencial
                </button>
                <button id="tab-expenses" class="fin-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center" onclick="window.switchFinTab('expenses')">
                    <i class="fas fa-money-bill-wave mr-2"></i> Contas a Pagar
                </button>
            </div>

            <div id="finContent" class="flex-grow overflow-y-auto p-6 bg-dark-bg custom-scrollbar relative">
                <div class="flex justify-center py-10"><i class="fas fa-spinner fa-spin text-pink-500 text-3xl"></i></div>
            </div>
        </div>`;
    
    managerModal.style.display = 'flex';
    managerModal.classList.remove('p-4'); 
    managerModal.classList.add('p-0', 'md:p-4');
    
    await switchFinTab('dre');
}

async function switchFinTab(tab) {
    currentTab = tab;
    const content = document.getElementById('finContent');
    if(!content) return;

    // Atualiza Visual das Abas
    document.querySelectorAll('.fin-tab-btn').forEach(btn => {
        if(btn.id === `tab-${tab}`) {
            btn.classList.remove('bg-dark-input', 'text-gray-300');
            btn.classList.add('bg-pink-600', 'text-white');
        } else {
            btn.classList.remove('bg-pink-600', 'text-white');
            btn.classList.add('bg-dark-input', 'text-gray-300');
        }
    });

    content.innerHTML = '<div class="flex justify-center py-10"><i class="fas fa-spinner fa-spin text-pink-500 text-3xl"></i></div>';
    
    if (tab === 'dre') await renderDRE(content); 
    else await renderExpensesList(content);
}

// ==================================================================
//           3. CONTAS A PAGAR (DESPESAS)
// ==================================================================

async function renderExpensesList(container) {
    // Carrega fornecedores para o select
    let supplierOptions = '<option value="">Sem Fornecedor</option>';
    try {
        const supSnap = await getDocs(query(getColRef('suppliers'), orderBy('name')));
        supSnap.forEach(doc => { supplierOptions += `<option value="${doc.id}">${doc.data().name}</option>`; });
    } catch(e) { console.error("Erro ao carregar fornecedores", e); }

    container.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h4 class="text-xl font-bold text-white">Despesas & Custos</h4>
            <button onclick="window.toggleExpenseForm()" class="bg-pink-600 hover:bg-pink-700 text-white font-bold py-2 px-4 rounded-lg shadow flex items-center">
                <i class="fas fa-plus mr-2"></i> Nova Despesa
            </button>
        </div>
        
        <div id="expenseForm" class="hidden bg-gray-800 p-4 rounded-xl border border-gray-700 mb-6 animate-fade-in">
            <h5 class="text-pink-400 font-bold mb-3">Lançamento de Saída</h5>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                <input type="text" id="expDesc" placeholder="Descrição (Ex: Aluguel, Luz...)" class="input-pdv w-full p-2">
                <div class="flex space-x-2">
                    <input type="number" id="expAmount" placeholder="Valor (R$)" class="input-pdv w-full p-2" step="0.01">
                    <input type="date" id="expDate" class="input-pdv w-full p-2" value="${new Date().toISOString().split('T')[0]}">
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                <select id="expCat" class="input-pdv w-full p-2">
                    <option value="Operacional">Operacional</option>
                    <option value="CMV">CMV (Mercadoria)</option>
                    <option value="Pessoal">Pessoal / RH</option>
                    <option value="Ocupação">Ocupação (Aluguel/Luz)</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Outros">Outros</option>
                </select>
                <select id="expSupplier" class="input-pdv w-full p-2">${supplierOptions}</select>
                <input type="text" id="expDocNumber" placeholder="Nº Nota/Recibo" class="input-pdv w-full p-2">
            </div>
            <div class="mb-3">
                <input type="text" id="expBarcode" placeholder="Código de Barras (Opcional)" class="input-pdv w-full p-2">
            </div>
            <div class="flex justify-end space-x-3">
                <button onclick="window.toggleExpenseForm()" class="px-4 py-2 bg-gray-600 text-white rounded">Cancelar</button>
                <button id="btnSaveExpense" onclick="window.saveExpense()" class="px-4 py-2 bg-green-600 text-white rounded font-bold">Salvar Lançamento</button>
            </div>
        </div>

        <div class="overflow-x-auto bg-gray-800 rounded-lg border border-gray-700">
            <table class="w-full text-left text-gray-300">
                <thead class="bg-gray-900 text-xs uppercase font-bold text-gray-500">
                    <tr>
                        <th class="p-3">Data</th>
                        <th class="p-3">Descrição</th>
                        <th class="p-3">Categoria</th>
                        <th class="p-3 text-right">Valor</th>
                        <th class="p-3 text-center">Ações</th>
                    </tr>
                </thead>
                <tbody id="expensesTableBody" class="divide-y divide-gray-700">
                    <tr><td colspan="5" class="p-4 text-center text-gray-500"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    loadExpensesTable();
}

async function loadExpensesTable() {
    try {
        const q = query(getColRef('expenses'), orderBy('date', 'desc'), limit(50));
        const snap = await getDocs(q);
        const tbody = document.getElementById('expensesTableBody');
        
        if (snap.empty) { 
            tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500 italic">Nenhum lançamento encontrado.</td></tr>'; 
            return; 
        }

        tbody.innerHTML = snap.docs.map(d => {
            const i = d.data();
            let dateStr = '--';
            if(i.date) {
               const parts = i.date.split('-');
               if(parts.length === 3) dateStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
            }
            return `
                <tr class="hover:bg-gray-700/50 transition">
                    <td class="p-3 text-sm font-mono">${dateStr}</td>
                    <td class="p-3 font-bold text-white">
                        ${i.description} 
                        <span class="text-xs text-gray-500 block">${i.supplierName || ''}</span>
                    </td>
                    <td class="p-3 text-xs">
                        <span class="bg-gray-700 px-2 py-1 rounded text-gray-300 border border-gray-600">${i.category || 'Geral'}</span>
                    </td>
                    <td class="p-3 text-right text-red-400 font-bold">- ${formatCurrency(i.amount)}</td>
                    <td class="p-3 text-center">
                        <button onclick="window.deleteExpense('${d.id}')" class="text-red-500 hover:text-red-300 transition p-2" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch(e) { 
        const tbody = document.getElementById('expensesTableBody');
        if(tbody) tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-red-400">Erro ao carregar: ${e.message}</td></tr>`; 
    }
}

function toggleExpenseForm() {
    const form = document.getElementById('expenseForm');
    if(form) form.classList.toggle('hidden');
}

async function saveExpense() {
    const btn = document.getElementById('btnSaveExpense');
    const desc = document.getElementById('expDesc').value;
    const amount = parseFloat(document.getElementById('expAmount').value);
    const date = document.getElementById('expDate').value;
    const cat = document.getElementById('expCat').value;
    const supplierId = document.getElementById('expSupplier').value;
    const supplierSelect = document.getElementById('expSupplier');
    const docNum = document.getElementById('expDocNumber').value;
    const barcode = document.getElementById('expBarcode').value;

    if (!desc || isNaN(amount) || !date) { 
        showToast("Preencha descrição, valor e data.", true); 
        return; 
    }
    
    const supplierName = supplierSelect.options[supplierSelect.selectedIndex].text !== "Sem Fornecedor" 
        ? supplierSelect.options[supplierSelect.selectedIndex].text 
        : null;

    toggleLoading(btn, true, 'Salvando...');
    
    try {
        await addDoc(getColRef('expenses'), {
            description: desc, 
            amount: amount, 
            date: date, 
            category: cat,
            supplierId: supplierId || null, 
            supplierName: supplierName,
            documentNumber: docNum || null, 
            barcode: barcode || null, 
            createdAt: serverTimestamp()
        });
        
        showToast("Despesa salva com sucesso!", false); 
        toggleExpenseForm();
        loadExpensesTable(); // Recarrega tabela
        
        // Limpa campos básicos
        document.getElementById('expDesc').value = '';
        document.getElementById('expAmount').value = '';
        
    } catch (e) { 
        console.error(e);
        showToast("Erro ao salvar despesa.", true); 
    } finally { 
        toggleLoading(btn, false, 'Salvar Lançamento'); 
    }
}

async function deleteExpense(id) {
    if(confirm("Deseja realmente excluir este lançamento financeiro?")) {
        try { 
            await deleteDoc(doc(getColRef('expenses'), id)); 
            showToast("Lançamento excluído."); 
            loadExpensesTable(); 
        } 
        catch(e) { 
            showToast("Erro ao excluir.", true); 
        }
    }
}

// ==================================================================
//           4. DRE (DEMONSTRATIVO DE RESULTADO)
// ==================================================================

async function renderDRE(container) {
    const now = new Date();
    // Default: Mês atual
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    container.innerHTML = `
        <div class="text-center text-gray-400 p-6 md:p-10">
            <i class="fas fa-file-invoice-dollar text-5xl mb-4 text-gray-600"></i>
            <h2 class="text-2xl font-bold text-white mb-2">DRE Gerencial</h2>
            <p class="mb-6">Competência: <span class="text-pink-400 font-bold">${startMonth.toLocaleDateString('pt-BR', {month:'long', year:'numeric'})}</span></p>
            
            <div id="dreReportContainer" class="mt-4 max-w-2xl mx-auto bg-gray-800 p-8 rounded-xl border border-gray-700 text-left shadow-lg relative">
                <div class="absolute inset-0 flex items-center justify-center bg-gray-800/80 z-10" id="dreLoading">
                    <span class="text-pink-400 font-bold animate-pulse"><i class="fas fa-calculator mr-2"></i> Calculando resultados...</span>
                </div>
            </div>
        </div>
    `;

    try {
        // 1. Receita (Vendas Fechadas do Mês)
        const qSales = query(
            getTablesCollectionRef(), 
            where('status', '==', 'closed'), 
            where('closedAt', '>=', Timestamp.fromDate(startMonth)), 
            where('closedAt', '<=', Timestamp.fromDate(endMonth))
        );
        
        const snapSales = await getDocs(qSales);
        let grossRevenue = 0;
        
        snapSales.forEach(d => { 
             const t = d.data();
             // Soma pagamentos válidos
             (t.payments || []).forEach(p => { 
                 const v = parseFloat(p.value.toString().replace(/[^\d,.-]/g,'').replace(',','.')); 
                 if(!isNaN(v)) grossRevenue += v; 
             });
        });

        // 2. Despesas (Lançadas no módulo de despesas)
        const startStr = startMonth.toISOString().split('T')[0];
        const endStr = endMonth.toISOString().split('T')[0];
        
        const qExp = query(
            getColRef('expenses'), 
            where('date', '>=', startStr), 
            where('date', '<=', endStr)
        );
        
        const snapExp = await getDocs(qExp);
        let totalExp = 0;
        const expByCat = {};
        
        snapExp.forEach(d => {
            const e = d.data();
            const val = parseFloat(e.amount) || 0;
            totalExp += val;
            const cat = e.category || 'Outros';
            expByCat[cat] = (expByCat[cat] || 0) + val;
        });

        // 3. Resultado
        const netResult = grossRevenue - totalExp;
        const resultColor = netResult >= 0 ? 'text-green-400' : 'text-red-400';
        const margin = grossRevenue > 0 ? ((netResult / grossRevenue) * 100).toFixed(1) : 0;

        const dreHTML = `
            <div class="flex justify-between items-center mb-2 text-lg">
                <span class="font-bold text-blue-300">(=) Receita Bruta</span>
                <span class="font-bold text-blue-300">${formatCurrency(grossRevenue)}</span>
            </div>
            
            <div class="border-b border-gray-600 my-4"></div>
            
            ${Object.entries(expByCat).map(([cat, val]) => `
                <div class="flex justify-between items-center mb-2 text-sm text-gray-300">
                    <span>(-) ${cat}</span>
                    <span class="text-red-300 font-mono">- ${formatCurrency(val)}</span>
                </div>
            `).join('')}
            
            ${totalExp === 0 ? '<p class="text-xs text-gray-500 italic mb-2">Nenhuma despesa lançada neste mês.</p>' : ''}

            <div class="flex justify-between items-center mb-1 text-sm font-bold text-gray-400 mt-4 pt-2 border-t border-gray-700/50">
                <span>(-) Total Despesas</span>
                <span class="text-red-400">- ${formatCurrency(totalExp)}</span>
            </div>
            
            <div class="border-t-2 border-gray-500 my-6 pt-4">
                <div class="flex justify-between items-center text-xl md:text-2xl">
                    <span class="font-bold text-white">(=) Resultado Líquido</span>
                    <span class="font-bold ${resultColor}">${formatCurrency(netResult)}</span>
                </div>
                <p class="text-right text-xs text-gray-500 mt-1">Margem Líquida: ${margin}%</p>
            </div>
        `;
        
        const containerEl = document.getElementById('dreReportContainer');
        if(containerEl) {
            containerEl.innerHTML = dreHTML;
        }

    } catch(e) {
        console.error(e);
        const containerEl = document.getElementById('dreReportContainer');
        if(containerEl) containerEl.innerHTML = `<div class="p-4 text-center"><i class="fas fa-exclamation-triangle text-red-500 text-3xl mb-2"></i><p class="text-red-400">Erro ao calcular DRE: ${e.message}</p></div>`;
    }
}