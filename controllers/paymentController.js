// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { goToScreen, userRole, currentTableId, currentOrderSnapshot } from "../app.js";
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "../utils.js";
import { getTableDocRef } from "../services/firebaseService.js";
import { updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// Variáveis de estado do módulo
let currentPaymentMethod = 'Dinheiro'; // Padrão

// Função para calcular o total geral (subtotal + serviço)
const calculateTotal = (subtotal, applyServiceTax) => {
    const taxRate = applyServiceTax ? 0.10 : 0;
    const serviceValue = subtotal * taxRate;
    const total = subtotal + serviceValue;
    return { total, serviceValue };
};

// Função auxiliar para atualizar texto
const updateText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
};


// NOVO: Renderiza os botões/cards de divisão de conta (Painel 3)
export const renderPaymentSplits = (currentTableId, currentOrderSnapshot) => {
    const paymentSplitsContainer = document.getElementById('paymentSplitsContainer');
    const addSplitAccountBtn = document.getElementById('addSplitAccountBtn');
    if (!paymentSplitsContainer || !currentOrderSnapshot) return;

    const sentItems = currentOrderSnapshot.sentItems || [];
    // Inicializa splits se não existir
    const splits = currentOrderSnapshot.splits || {};
    
    // Calcula o total dos itens que JÁ FORAM MOVIMENTADOS para as subcontas
    let totalItemsInSplits = 0;
    Object.values(splits).forEach(split => totalItemsInSplits += split.items.reduce((sum, item) => sum + item.price, 0));

    const totalSentItems = sentItems.reduce((sum, item) => sum + item.price, 0);
    const totalInMainAccount = Math.max(0, totalSentItems - totalItemsInSplits);
    const itemsRemaining = sentItems.length - Object.values(splits).reduce((c, s) => c + (s.items || []).length, 0);
    
    // Apenas o Garçom/Gerente pode adicionar divisões, e se houver itens para dividir
    if (addSplitAccountBtn) {
        addSplitAccountBtn.disabled = userRole === 'client' || itemsRemaining === 0;
    }

    paymentSplitsContainer.innerHTML = '';
    let accountCounter = 0;
    
    // 1. Renderiza a Conta Principal (Restante)
    paymentSplitsContainer.innerHTML += `
        <div class="bg-gray-200 p-3 rounded-lg border border-indigo-400">
            <h4 class="font-bold text-lg flex justify-between items-center text-indigo-800">
                <span>Conta Principal (Restante)</span>
                <span class="text-xl">${formatCurrency(totalInMainAccount)}</span>
            </h4>
            <p class="text-sm text-gray-700 mt-1">
                Itens restantes a pagar: ${itemsRemaining}
            </p>
            <button class="text-xs mt-2 px-3 py-1 bg-yellow-500 text-white rounded-full hover:bg-yellow-600 transition disabled:opacity-50" 
                    onclick="window.openSplitTransferModal('main', 'move_out')" ${userRole === 'client' || totalInMainAccount === 0 ? 'disabled' : ''}>
                <i class="fas fa-cut"></i> Mover Itens
            </button>
        </div>
    `;

    // 2. Renderiza as Contas de Divisão
    Object.keys(splits).forEach(splitKey => {
        const split = splits[splitKey];
        accountCounter++;
        const splitTotal = split.total || 0;
        const splitPaymentsTotal = split.payments ? split.payments.reduce((sum, p) => sum + p.value, 0) : 0;
        const isPaid = splitTotal <= splitPaymentsTotal;
        
        paymentSplitsContainer.innerHTML += `
            <div class="bg-white p-3 rounded-lg border ${isPaid ? 'border-green-500' : 'border-red-500'} shadow">
                <h4 class="font-bold text-lg flex justify-between items-center text-gray-800">
                    <span>Conta ${accountCounter}</span>
                    <span class="text-xl ${isPaid ? 'text-green-600' : 'text-red-600'}">${formatCurrency(splitTotal)}</span>
                </h4>
                <p class="text-sm text-gray-700 mt-1">
                    Itens: ${split.items.length}. Pagamentos: ${formatCurrency(splitPaymentsTotal)}
                </p>
                <div class="flex space-x-2 mt-2">
                    <button class="text-xs px-3 py-1 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition" 
                            onclick="window.openPaymentModalForSplit('${splitKey}')" ${userRole === 'client' ? 'disabled' : ''}>
                        <i class="fas fa-credit-card"></i> Pagar
                    </button>
                    <button class="text-xs px-3 py-1 bg-gray-500 text-white rounded-full hover:bg-gray-600 transition" 
                            onclick="window.moveItemsToMainAccount('${splitKey}')" ${userRole === 'client' ? 'disabled' : ''}>
                        <i class="fas fa-arrow-left"></i> Desfazer
                    </button>
                </div>
            </div>
        `;
    });
};


// Recalcula e renderiza o resumo de pagamento
export const renderPaymentSummary = (currentTableId, currentOrderSnapshot) => {
    if (!currentOrderSnapshot) return;

    const tableData = currentOrderSnapshot;
    const subtotal = tableData.total || 0; 
    const payments = tableData.payments || [];
    const currentPaymentsTotal = payments.reduce((sum, p) => sum + p.value, 0);

    const serviceTaxApplied = tableData.serviceTaxApplied || false;

    const { total: generalTotal, serviceValue } = calculateTotal(subtotal, serviceTaxApplied);
    
    const diners = parseInt(document.getElementById('dinersSplitInput')?.value) || 1;
    const valuePerDiner = generalTotal / diners;

    const remainingBalance = generalTotal - currentPaymentsTotal;
    
    // Atualiza UI
    updateText('payment-table-number', `Mesa ${currentTableId}`);
    updateText('orderSubtotalDisplayPayment', formatCurrency(subtotal));
    updateText('orderServiceTaxDisplayPayment', formatCurrency(serviceValue));
    updateText('orderTotalDisplayPayment', formatCurrency(generalTotal));
    updateText('valuePerDinerDisplay', formatCurrency(valuePerDiner));
    
    // Valor Restante
    const remainingBalanceDisplay = document.getElementById('remainingBalanceDisplay');
    if (remainingBalanceDisplay) {
        remainingBalanceDisplay.textContent = formatCurrency(Math.abs(remainingBalance));
        remainingBalanceDisplay.classList.remove('text-red-600', 'text-green-600', 'text-gray-800');
        if (remainingBalance > 0.01) {
            remainingBalanceDisplay.classList.add('text-red-600'); 
        } else if (remainingBalance < -0.01) {
            remainingBalanceDisplay.classList.add('text-green-600'); 
            remainingBalanceDisplay.textContent = `TROCO: ${formatCurrency(Math.abs(remainingBalance))}`;
        } else {
            remainingBalanceDisplay.classList.add('text-gray-800'); 
        }
    }
    
    // Toggle do botão de serviço
    const toggleServiceTaxBtn = document.getElementById('toggleServiceTaxBtn');
    if (toggleServiceTaxBtn) {
        toggleServiceTaxBtn.textContent = serviceTaxApplied ? 'Remover' : 'Aplicar';
        toggleServiceTaxBtn.classList.toggle('bg-green-600', serviceTaxApplied);
        toggleServiceTaxBtn.classList.toggle('bg-red-600', !serviceTaxApplied);
    }
    
    // Habilita/Desabilita Finalizar
    const finalizeOrderBtn = document.getElementById('finalizeOrderBtn');
    if (finalizeOrderBtn) {
        const canFinalize = remainingBalance <= 0.01 && currentPaymentsTotal > 0;
        finalizeOrderBtn.disabled = !canFinalize;
    }
    
    // NOVO: Renderiza a lista de itens da conta (para exclusão/transferência em massa)
    // Usando a versão simples, pois a complexa foi revertida.
    renderReviewItemsList(currentOrderSnapshot);
    
    // NOVO: Renderiza os botões/cards de divisão
    renderPaymentSplits(currentTableId, currentOrderSnapshot);
};


// NOVO: Adiciona a funcionalidade de adicionar conta de divisão
export const handleAddSplitAccount = async (currentTableId, currentOrderSnapshot) => {
    if (!currentTableId || userRole === 'client') return;
    
    const splitKey = `split_${Date.now()}`;
    const tableRef = getTableDocRef(currentTableId);

    const newSplit = {
        items: [],
        total: 0,
        payments: [],
        createdAt: Date.now()
    };
    
    // Usa uma chave aninhada para adicionar o novo split
    try {
        const currentSplits = currentOrderSnapshot.splits || {};
        await updateDoc(tableRef, {
            splits: { ...currentSplits, [splitKey]: newSplit }
        });
        alert("Nova conta de divisão adicionada! Agora use o botão 'Mover Itens'.");
    } catch (e) {
        console.error("Erro ao adicionar conta de divisão:", e);
        alert("Erro ao tentar adicionar a conta de divisão.");
    }
};
window.handleAddSplitAccount = handleAddSplitAccount;

// Implementar no futuro: Lógica para mover itens para as subcontas.
const openSplitTransferModal = (targetKey, mode) => {
    // Implementação de um modal para seleção de itens será feita em uma próxima fase
    alert(`Gerenciamento da conta ${targetKey} no modo ${mode} (Em desenvolvimento).`);
};
window.openSplitTransferModal = openSplitTransferModal;


// Implementar no futuro: Lógica para fechar a conta (WooCommerce)
export const handleFinalizeOrder = () => {
    alert("Função de Fechamento de Conta (WooCommerce Sync) em desenvolvimento.");
};


// Implementar no futuro: Lógica para renderizar itens de revisão (Painel 3)
const renderReviewItemsList = (currentOrderSnapshot) => {
    const listEl = document.getElementById('reviewItemsList');
    if (!listEl) return;
    
    const sentItems = currentOrderSnapshot.sentItems || [];
    listEl.innerHTML = `<div class="text-sm text-gray-500 italic p-2">Total de ${sentItems.length} itens na conta (Funcionalidades de exclusão/transferência em desenvolvimento).</div>`;
};


// Placeholder functions para os botões do Split
const openPaymentModalForSplit = (splitKey) => {
    alert(`Pagar Conta de Divisão (${splitKey}) em desenvolvimento.`);
};
window.openPaymentModalForSplit = openPaymentModalForSplit;

const moveItemsToMainAccount = (splitKey) => {
    alert(`Desfazer itens da conta (${splitKey}) para a conta principal em desenvolvimento.`);
};
window.moveItemsToMainAccount = moveItemsToMainAccount;


// Event listener para adicionar conta de divisão e outros
document.addEventListener('DOMContentLoaded', () => {
    const addSplitAccountBtn = document.getElementById('addSplitAccountBtn');
    if (addSplitAccountBtn) {
        // Usa a função do módulo paymentController, que acessa os dados globais
        addSplitAccountBtn.addEventListener('click', () => {
             handleAddSplitAccount(window.currentTableId, window.currentOrderSnapshot);
        });
    }
    
    const toggleServiceTaxBtn = document.getElementById('toggleServiceTaxBtn');
    if (toggleServiceTaxBtn) {
        toggleServiceTaxBtn.addEventListener('click', () => alert('Funcionalidade de Toggle de Taxa de Serviço em desenvolvimento.'));
    }
    
    const addPaymentBtn = document.getElementById('addPaymentBtn');
    if (addPaymentBtn) {
        addPaymentBtn.addEventListener('click', () => alert('Funcionalidade de Adicionar Pagamento em desenvolvimento.'));
    }
    
    const finalizeOrderBtn = document.getElementById('finalizeOrderBtn');
    if (finalizeOrderBtn) {
        finalizeOrderBtn.addEventListener('click', handleFinalizeOrder);
    }
});
