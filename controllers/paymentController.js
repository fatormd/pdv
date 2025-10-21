// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { goToScreen, userRole, currentTableId, currentOrderSnapshot } from "../app.js";
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "../utils.js";
import { getTableDocRef } from "../services/firebaseService.js";
import { updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { openManagerAuthModal } from "./managerController.js"; // Importado para proteção de exclusão


// Variáveis de estado do módulo
let currentPaymentMethod = 'Dinheiro'; // Padrão
let isMassSelectionActive = false; // NOVO: Estado para controle do modo de seleção

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

// Lógica de Agrupamento de Itens (agrupa itens idênticos para exibição)
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
        // Chave baseada em Nome e Observação (para agrupar 5x X-Bacon c/ Sem Cebola)
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


// 1. Renderiza a lista de itens da conta (Com Checkboxes desabilitadas por padrão)
const renderReviewItemsList = (currentOrderSnapshot) => {
    const listEl = document.getElementById('reviewItemsList');
    if (!listEl) return;
    
    const groupedItems = groupMainAccountItems(currentOrderSnapshot);

    const mainAccountItemsCount = Object.values(groupedItems).reduce((sum, group) => sum + group.totalCount, 0);

    // Atualiza os ícones para refletir o estado de seleção
    const transferBtn = document.getElementById('itemMassTransferBtn');
    const deleteBtn = document.getElementById('itemMassDeleteBtn');
    if (transferBtn) transferBtn.classList.toggle('text-yellow-600', isMassSelectionActive);
    if (deleteBtn) deleteBtn.classList.toggle('text-red-600', isMassSelectionActive);
    if (transferBtn) transferBtn.classList.toggle('text-gray-500', !isMassSelectionActive);
    if (deleteBtn) deleteBtn.classList.toggle('text-gray-500', !isMassSelectionActive);


    if (mainAccountItemsCount === 0) {
        listEl.innerHTML = `<div class="text-sm text-gray-500 italic p-2">Nenhum item restante na conta principal.</div>`;
        return;
    } 

    const listHtml = Object.values(groupedItems).map(group => {
        const firstItem = group.items[0];
        const groupKey = group.groupKey;
        // Chave de identificação única do grupo para a ação em massa (contém as chaves dos itens)
        const massItemKeys = group.items.map(item => `${item.orderId}_${item.sentAt}`).join(','); 
        
        // Determina se a checkbox deve estar habilitada
        const disabledAttr = isMassSelectionActive ? '' : 'disabled';
        
        // Mantém o estado visual da checkbox (importante ao re-renderizar no modo de seleção)
        const checkedAttr = document.querySelector(`.item-select-checkbox[data-group-key="${groupKey}"]:checked`) ? 'checked' : '';


        return `
            <div class="flex items-start justify-between py-1 border-b border-gray-100 hover:bg-gray-50 transition">
                
                <input type="checkbox" class="item-select-checkbox mt-1.5 ml-1 mr-2" 
                       data-group-key="${groupKey}" 
                       data-item-keys="${massItemKeys}"
                       ${disabledAttr} ${checkedAttr}>
                
                <div class="flex flex-col flex-grow min-w-0 pr-2">
                    <span class="text-sm font-semibold text-gray-800">${firstItem.name} (${group.totalCount}x)</span>
                    ${firstItem.note ? `<span class="text-xs text-gray-500 truncate">(${firstItem.note})</span>` : ''}
                </div>
                
                <span class="text-sm font-bold text-gray-700">${formatCurrency(group.totalValue)}</span>
            </div>
        `;
    }).join('');
    
    listEl.innerHTML = `
        <div class="border p-2 rounded-lg bg-gray-50 max-h-48 overflow-y-auto">
            ${listHtml}
        </div>
        <p class="text-sm text-gray-500 italic p-2 mt-2">Total de ${mainAccountItemsCount} itens na conta principal. </p>
    `;
};


// 2. Lógica de Ativação/Execução da Seleção em Massa
export const activateItemSelection = (action) => {
    const checkboxes = document.querySelectorAll('.item-select-checkbox');
    
    if (!checkboxes.length) {
        alert("Não há itens para selecionar na conta.");
        return;
    }

    if (!isMassSelectionActive) {
        // --- MODO DE ATIVAÇÃO ---
        isMassSelectionActive = true;
        
        checkboxes.forEach(cb => { 
            cb.disabled = false; 
            cb.checked = false; 
        });
        
        alert(`Modo de SELEÇÃO ATIVO para ${action.toUpperCase()}. Clique no ícone ${action.toUpperCase()} novamente para executar.`);
        renderReviewItemsList(currentOrderSnapshot); // Re-renderiza para habilitar as checkboxes

    } else {
        // --- MODO DE EXECUÇÃO (2º Clique) ---
        isMassSelectionActive = false;
        
        const selectedItemsGroups = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => ({ 
                groupKey: cb.dataset.groupKey, 
                itemKeys: cb.dataset.itemKeys.split(',') 
            }));

        // Desativa o modo de seleção e limpa visualmente
        checkboxes.forEach(cb => { cb.disabled = true; cb.checked = false; });
        
        if (selectedItemsGroups.length === 0) {
            alert("Nenhum item selecionado. Modo de seleção desativado.");
            renderReviewItemsList(currentOrderSnapshot); // Re-renderiza para atualizar os ícones
            return;
        }

        if (action === 'transfer') {
             // Lógica de Transferência de Itens
             const allItemKeys = selectedItemsGroups.flatMap(group => group.itemKeys);
             openSplitTransferModal('new_split', 'move_out', allItemKeys); 
        } else if (action === 'delete') {
             // Lógica de Exclusão de Itens
             handleMassDeleteConfirmed(selectedItemsGroups);
        }
        renderReviewItemsList(currentOrderSnapshot); // Re-renderiza para atualizar os ícones

    }
};

// 3. Ponto de entrada dos botões de ação em massa (Chamado pelo onclick do HTML)
export const handleMassActionRequest = (action) => {
    // Se a seleção estiver ativa, executa a ação imediatamente (sem senha, o gerente já inseriu a senha ou o usuário está no 2º clique)
    if (isMassSelectionActive) {
        activateItemSelection(action);
        return;
    }

    // Se o modo estiver inativo, requer senha para ATIVAR o modo de seleção
    if (action === 'delete') {
        openManagerAuthModal('openMassDelete', action);
    } else if (action === 'transfer') {
        openManagerAuthModal('openMassTransfer', action);
    }
};
window.handleMassActionRequest = handleMassActionRequest;


// 4. Exclusão em Massa (Execução após a senha)
export const handleMassDeleteConfirmed = async (selectedGroups) => {
    if (!currentTableId || !currentOrderSnapshot || selectedGroups.length === 0) return;
    
    try {
        const tableRef = getTableDocRef(currentTableId);
        
        let valueRemoved = 0;
        const groupKeysToRemove = selectedGroups.map(g => g.groupKey);
        
        // Encontra o valor total a ser removido (usando a função de agrupamento para obter os valores)
        const groupedItems = groupMainAccountItems(currentOrderSnapshot);
        groupKeysToRemove.forEach(key => {
            if (groupedItems[key]) {
                valueRemoved += groupedItems[key].totalValue;
            }
        });

        // Cria a nova lista de sentItems, excluindo os itens dos grupos selecionados
        const sentItemsAfterRemoval = currentOrderSnapshot.sentItems.filter(item => {
             const itemGroupKey = `${item.name}-${item.note || ''}`;
             return !groupKeysToRemove.includes(itemGroupKey);
        });

        // Atualiza o Firebase
        await updateDoc(tableRef, {
            sentItems: sentItemsAfterRemoval,
            total: (currentOrderSnapshot.total || 0) - valueRemoved
        });
        
        alert(`Total de ${selectedGroups.length} grupos (${selectedGroups.flatMap(g => g.itemKeys).length} itens) removidos da conta. Valor: ${formatCurrency(valueRemoved)}.`);
        
    } catch (e) {
        console.error("Erro ao remover itens em massa:", e);
        alert("Falha ao remover itens em massa da conta.");
    }
};
window.handleMassDeleteConfirmed = handleMassDeleteConfirmed;


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
    const itemCount = itemsToTransfer ? itemsToTransfer.length : 0;
    
    if (itemsToTransfer && mode === 'move_out') {
        // CORREÇÃO: Implementação do modal de seleção de destino
        
        const modal = document.getElementById('selectiveTransferModal');
        const splits = currentOrderSnapshot.splits || {};
        const splitKeys = Object.keys(splits);

        let splitOptionsHtml = splitKeys.map(key => `
            <button class="w-full px-4 py-3 bg-blue-100 text-blue-700 font-bold rounded-lg hover:bg-blue-200 transition text-base" 
                    onclick="alert('Transferindo ${itemCount} item(s) para a conta ${key}')">
                Conta de Divisão ${key.slice(6)} (${splits[key].items.length} itens)
            </button>
        `).join('');
        
        if (splitKeys.length === 0) {
            splitOptionsHtml = `<p class="text-sm text-gray-500 italic mb-4">Nenhuma conta de divisão ativa. Crie uma nova abaixo.</p>`;
        }

        modal.innerHTML = `
            <div class="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm">
                <h3 class="text-xl font-bold mb-4 text-indigo-700">Transferir ${itemCount} Item(s)</h3>
                
                <h4 class="text-lg font-semibold text-gray-700 mb-3">Contas Existentes:</h4>
                <div class="space-y-2 mb-4 max-h-48 overflow-y-auto">${splitOptionsHtml}</div>
                
                <h4 class="text-lg font-semibold text-gray-700 mb-3">Nova Conta:</h4>
                <button class="w-full px-4 py-3 bg-green-500 text-white font-bold rounded-lg hover:bg-green-600 transition text-base"
                        onclick="window.handleAddSplitAccount(window.currentTableId, window.currentOrderSnapshot); document.getElementById('selectiveTransferModal').style.display='none';">
                    + Criar Nova Conta de Divisão
                </button>
                
                <div class="flex justify-end mt-4">
                    <button class="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition text-base" 
                            onclick="document.getElementById('selectiveTransferModal').style.display='none'">Cancelar</button>
                </div>
            </div>
        `;
        modal.style.display = 'flex';
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
    
    // Item 1: NOVO: Renderiza a lista de itens da conta (agora no topo com checkboxes)
    renderReviewItemsList(currentOrderSnapshot);
    
    // NOVO: Renderiza os botões/cards de divisão
    renderPaymentSplits(currentTableId, currentOrderSnapshot);
};
// CORREÇÃO: A função deve ser explicitamente exportada para ser importada por app.js
export { renderPaymentSummary };


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
});
