// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { goToScreen, userRole, currentTableId, currentOrderSnapshot } from "../app.js";
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "../utils.js";
import { getTableDocRef } from "../services/firebaseService.js";
import { updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { openManagerAuthModal } from "./managerController.js"; // Importado para proteção de exclusão


// Variável para manter o item selecionado para ação
let selectedItemForAction = null; 

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

// Lógica de Agrupamento de Itens (Reutilizada e aprimorada)
const groupMainAccountItems = (currentOrderSnapshot) => {
    const sentItems = currentOrderSnapshot.sentItems || [];
    
    const itemsInSplits = Object.values(currentOrderSnapshot.splits || {})
                                .flatMap(split => split.items.map(item => item.orderId + item.sentAt)); 
    
    const mainAccountItems = sentItems.filter(item => {
        const key = item.orderId + item.sentAt;
        return !itemsInSplits.includes(key);
    });

    // Agrupamento
    return mainAccountItems.reduce((acc, item) => {
        const groupKey = `${item.name}-${item.note || ''}`;

        if (!acc[groupKey]) {
            acc[groupKey] = { items: [], totalCount: 0, totalValue: 0, groupKey: groupKey };
        }
        acc[groupKey].items.push(item);
        acc[groupKey].totalCount++;
        acc[groupKey].totalValue += item.price;
        return acc;
    }, {});
};


// Implementação das Ações do Item (Item 2)
// Função para abrir o modal de ações do item (view, delete, transfer)
export const openItemActionModal = (groupKey) => {
    if (!currentOrderSnapshot) return;

    const groupedItems = groupMainAccountItems(currentOrderSnapshot);
    selectedItemForAction = groupedItems[groupKey];
    
    if (!selectedItemForAction) {
        alert('Grupo de item não encontrado.');
        return;
    }
    
    const modal = document.getElementById('itemActionModal');
    if (modal) {
        document.getElementById('itemActionName').textContent = selectedItemForAction.items[0].name;
        document.getElementById('itemActionGroupNote').textContent = selectedItemForAction.items[0].note || 'Sem observação';
        document.getElementById('itemActionQuantity').textContent = `${selectedItemForAction.totalCount}x`;
        document.getElementById('itemActionTotal').textContent = formatCurrency(selectedItemForAction.totalValue);
        
        modal.dataset.groupKey = groupKey;
        modal.style.display = 'flex';
    }
};
window.openItemActionModal = openItemActionModal;


// Ação de Exclusão: Solicitação de Gerente
export const handleItemDeleteRequest = () => {
    const groupKey = document.getElementById('itemActionModal').dataset.groupKey;
    if (groupKey && selectedItemForAction) {
        // Envia a ação para autenticação do gerente
        openManagerAuthModal('deleteReviewItem', groupKey);
    }
};
window.handleItemDeleteRequest = handleItemDeleteRequest;


// Ação de Exclusão: Confirmação e Execução
export const handleItemDeleteConfirmed = async (groupKey) => {
    // Chamado após a autenticação do gerente
    const modal = document.getElementById('itemActionModal');
    if (modal) modal.style.display = 'none';

    if (!groupKey || !currentTableId || !currentOrderSnapshot || !selectedItemForAction) return;
    
    try {
        const tableRef = getTableDocRef(currentTableId);
        
        const valueRemoved = selectedItemForAction.totalValue;

        // 1. Cria a nova lista de sentItems, excluindo os itens selecionados (melhor abordagem do que arrayRemove)
        const sentItemsAfterRemoval = currentOrderSnapshot.sentItems.filter(item => {
             const itemGroupKey = `${item.name}-${item.note || ''}`;
             return itemGroupKey !== groupKey;
        });

        // 2. Atualiza o Firebase
        await updateDoc(tableRef, {
            sentItems: sentItemsAfterRemoval,
            total: (currentOrderSnapshot.total || 0) - valueRemoved
        });
        
        alert(`Grupo de itens (${selectedItemForAction.items[0].name} - ${selectedItemForAction.totalCount}x) removido da conta.`);
        
        // Limpa o estado
        selectedItemForAction = null;
        
    } catch (e) {
        console.error("Erro ao remover item da conta:", e);
        alert("Falha ao remover item da conta.");
    }
};
window.handleItemDeleteConfirmed = handleItemDeleteConfirmed;


// Ação de Transferência: Placeholder
export const handleItemTransferRequest = () => {
    const groupKey = document.getElementById('itemActionModal').dataset.groupKey;
    if (groupKey && selectedItemForAction) {
        // Usa o placeholder da função de transferência (openSplitTransferModal)
        openSplitTransferModal('main', 'move_out', selectedItemForAction.items);
    }
};
window.handleItemTransferRequest = handleItemTransferRequest;


// 5. Renderiza a lista de itens da conta (Item 1, 2)
const renderReviewItemsList = (currentOrderSnapshot) => {
    const listEl = document.getElementById('reviewItemsList');
    if (!listEl) return;
    
    const groupedItems = groupMainAccountItems(currentOrderSnapshot);

    const mainAccountItemsCount = Object.values(groupedItems).reduce((sum, group) => sum + group.totalCount, 0);

    if (mainAccountItemsCount === 0) {
        listEl.innerHTML = `<div class="text-sm text-gray-500 italic p-2">Nenhum item restante na conta principal.</div>`;
        return;
    } 

    const listHtml = Object.values(groupedItems).map(group => {
        const firstItem = group.items[0];
        const groupKey = group.groupKey; 
        
        return `
            <div class="flex items-start justify-between py-1 border-b border-gray-100 hover:bg-gray-50 transition">
                
                <div class="flex flex-col flex-grow min-w-0 pr-2">
                    <span class="text-sm font-semibold text-gray-800">${firstItem.name} (${group.totalCount}x)</span>
                    ${firstItem.note ? `<span class="text-xs text-gray-500 truncate">(${firstItem.note})</span>` : ''}
                </div>
                
                <div class="flex items-center space-x-2">
                    <span class="text-sm font-bold text-gray-700">${formatCurrency(group.totalValue)}</span>
                    <button class="item-action-btn text-gray-500 hover:text-indigo-600 transition p-1" 
                            onclick="window.openItemActionModal('${groupKey}')"
                            title="Ações do Item">
                        <i class="fas fa-ellipsis-v text-sm"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    listEl.innerHTML = `
        <div class="border p-2 rounded-lg bg-gray-50 max-h-48 overflow-y-auto">
            ${listHtml}
        </div>
        <p class="text-sm text-gray-500 italic p-2 mt-2">Total de ${mainAccountItemsCount} itens na conta principal. Clique nos pontos (...) para ações.</p>
    `;
};


// NOVO: Renderiza os botões/cards de divisão de conta (Painel 3)
export const renderPaymentSplits = (currentTableId, currentOrderSnapshot) => {
    const paymentSplitsContainer = document.getElementById('paymentSplitsContainer');
    const addSplitAccountBtn = document.getElementById('addSplitAccountBtn');
    if (!paymentSplitsContainer || !currentOrderSnapshot) return;

    const sentItems = currentOrderSnapshot.sentItems || [];
    const splits = currentOrderSnapshot.splits || {};
    
    let totalItemsInSplits = 0;
    Object.values(splits).forEach(split => totalItemsInSplits += split.items.reduce((sum, item) => sum + item.price, 0));

    const totalSentItems = sentItems.reduce((sum, item) => sum + item.price, 0);
    const totalInMainAccount = Math.max(0, totalSentItems - totalItemsInSplits);
    const itemsRemaining = sentItems.length - Object.values(splits).reduce((c, s) => c + (s.items || []).length, 0);
    
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
    
    // Item 1: NOVO: Renderiza a lista de itens da conta (agora no topo)
    renderReviewItemsList(currentOrderSnapshot);
    
    // NOVO: Renderiza os botões/cards de divisão
    renderPaymentSplits(currentTableId, currentOrderSnapshot);
};


// Exportado para ser chamado no app.js, que acessa o estado global (currentTableId, currentOrderSnapshot)
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
window.handleAddSplitAccount = handleAddSplitAccount; // Exposto ao escopo global


// Implementar no futuro: Lógica para mover itens para as subcontas.
const openSplitTransferModal = (targetKey, mode, itemsToTransfer = null) => {
    if (itemsToTransfer) {
        alert(`Transferência de ${itemsToTransfer.length} itens para ${targetKey} em desenvolvimento.`);
    } else {
        alert(`Gerenciamento da conta ${targetKey} no modo ${mode} (Em desenvolvimento).`);
    }
};
window.openSplitTransferModal = openSplitTransferModal;


// Implementar no futuro: Lógica para fechar a conta (WooCommerce)
export const handleFinalizeOrder = () => {
    alert("Função de Fechamento de Conta (WooCommerce Sync) em desenvolvimento.");
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


// Event listener para inicialização
document.addEventListener('DOMContentLoaded', () => {
    const addSplitAccountBtn = document.getElementById('addSplitAccountBtn');
    if (addSplitAccountBtn) {
        addSplitAccountBtn.addEventListener('click', () => {
            // A função é chamada no módulo App.js para acessar o estado global
            window.handleAddSplitAccount(window.currentTableId, window.currentOrderSnapshot); 
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
    
    // Listeners do Modal de Ação do Item
    const itemActionDeleteBtn = document.getElementById('itemActionDeleteBtn');
    if (itemActionDeleteBtn) itemActionDeleteBtn.addEventListener('click', handleItemDeleteRequest);

    const itemActionTransferBtn = document.getElementById('itemActionTransferBtn');
    if (itemActionTransferBtn) itemActionTransferBtn.addEventListener('click', handleItemTransferRequest);
    
    const itemActionCloseBtn = document.getElementById('itemActionCloseBtn');
    if (itemActionCloseBtn) itemActionCloseBtn.addEventListener('click', () => {
        document.getElementById('itemActionModal').style.display = 'none';
        selectedItemForAction = null;
    });

});
