// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { goToScreen, userRole, currentTableId, currentOrderSnapshot } from "../app.js";
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "../utils.js";
import { getTableDocRef, getCustomersCollectionRef } from "../services/firebaseService.js";
import { updateDoc, arrayUnion, arrayRemove, setDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { openManagerAuthModal } from "./managerController.js";


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


// 1. Lógica para alternar a taxa de serviço (Protegida)
export const handleServiceTaxToggleConfirmed = async () => {
    // Esta função é chamada SOMENTE APÓS a autenticação do gerente
    if (!currentTableId) return;

    try {
        const tableRef = getTableDocRef(currentTableId);
        const newServiceTaxApplied = !(currentOrderSnapshot?.serviceTaxApplied || false);
        
        await updateDoc(tableRef, {
            serviceTaxApplied: newServiceTaxApplied
        });

        alert(`Taxa de serviço ${newServiceTaxApplied ? 'Aplicada' : 'Removida'} com sucesso.`);
    } catch (e) {
        console.error("Erro ao alternar taxa de serviço:", e);
        alert("Falha ao atualizar a taxa de serviço.");
    }
};
window.handleServiceTaxToggleConfirmed = handleServiceTaxToggleConfirmed;

// Ponto de entrada do botão (Item 4)
export const handleToggleServiceTax = () => {
    if (!currentTableId) return;

    // Se o serviço está aplicado, para remover, precisa de gerente.
    const serviceTaxApplied = currentOrderSnapshot?.serviceTaxApplied || false;

    if (serviceTaxApplied) {
        openManagerAuthModal('disableServiceTax');
    } else {
        // Se não está aplicado, pode aplicar sem senha
        handleServiceTaxToggleConfirmed();
    }
};
window.handleToggleServiceTax = handleToggleServiceTax;


// 2. Implementa a função de registro de pagamento
export const handleAddPayment = async () => {
    if (!currentTableId || userRole === 'client') return;
    
    const paymentValueInput = document.getElementById('paymentValueInput');
    const paymentMethod = currentPaymentMethod; 

    const rawValue = getNumericValueFromCurrency(paymentValueInput.value);

    if (rawValue <= 0 || !paymentMethod) {
        alert("Selecione um método e insira um valor válido.");
        return;
    }
    
    // Gera um ID único para o pagamento para permitir a remoção (Item 8)
    const paymentId = `p_${Date.now()}_${Math.random().toString(16).slice(2, 5)}`;

    const newPayment = {
        id: paymentId,
        method: paymentMethod,
        value: rawValue,
        paidAt: Date.now()
    };
    
    try {
        const tableRef = getTableDocRef(currentTableId);
        
        await updateDoc(tableRef, {
            payments: arrayUnion(newPayment)
        });
        
        alert(`Pagamento de ${formatCurrency(rawValue)} via ${paymentMethod} registrado.`);
        
        // O valor para o próximo pagamento é o restante
        const currentTotal = currentOrderSnapshot?.total || 0;
        const currentPaymentsTotal = currentOrderSnapshot?.payments.reduce((s,p) => s + p.value, 0) || 0;
        const serviceTaxApplied = currentOrderSnapshot?.serviceTaxApplied || false;
        const { total: generalTotal } = calculateTotal(currentTotal, serviceTaxApplied);
        
        const remaining = generalTotal - (currentPaymentsTotal + rawValue);

        paymentValueInput.value = formatCurrency(Math.max(0, remaining)); 
        
    } catch (e) {
        console.error("Erro ao adicionar pagamento:", e);
        alert("Erro ao registrar pagamento. Tente novamente.");
    }
};
window.handleAddPayment = handleAddPayment;


// 3. Implementa a função de remoção de pagamento (Item 8)
export const handleDeletePaymentConfirmed = async (paymentId) => {
    // Esta função é chamada SOMENTE APÓS a autenticação do gerente
    if (!currentTableId) return;
    
    const tableRef = getTableDocRef(currentTableId);
    
    // Encontra o objeto completo do pagamento
    const paymentToRemove = currentOrderSnapshot.payments.find(p => p.id === paymentId);

    if (!paymentToRemove) {
        alert("Pagamento não encontrado.");
        return;
    }
    
    try {
        // arrayRemove precisa do objeto exato para remover
        await updateDoc(tableRef, {
            payments: arrayRemove(paymentToRemove)
        });
        alert(`Pagamento ${paymentToRemove.id.slice(2, 9)} de ${formatCurrency(paymentToRemove.value)} removido com sucesso.`);
    } catch (e) {
        console.error("Erro ao remover pagamento:", e);
        alert("Falha ao remover pagamento.");
    }
};

const handleDeletePayment = (paymentId) => {
    openManagerAuthModal('deletePayment', paymentId);
};
window.handleDeletePayment = handleDeletePayment;


// 4. Renderiza a lista de Pagamentos Registrados (Item 8)
const renderRegisteredPayments = (payments) => {
    const listEl = document.getElementById('registeredPaymentsList');
    if (!listEl) return;
    
    if (payments.length === 0) {
        listEl.innerHTML = `<div class="text-sm text-gray-500 italic p-2">Nenhum pagamento registrado.</div>`;
        return;
    }
    
    listEl.innerHTML = payments.map(p => `
        <div class="flex justify-between items-center py-2 border-b border-gray-100">
            <div class="text-sm text-gray-700">
                <span class="font-semibold">${p.method}</span>
                <span class="text-xs text-gray-500 block">ID: ${p.id.slice(2, 9)}</span>
            </div>
            <div class="flex items-center space-x-2">
                <span class="text-sm font-bold text-green-700">${formatCurrency(p.value)}</span>
                <button class="text-red-500 hover:text-red-700 transition" onclick="window.handleDeletePayment('${p.id}')" title="Excluir Pagamento (Gerente)">
                    <i class="fas fa-trash-alt text-xs"></i>
                </button>
            </div>
        </div>
    `).join('');
};


// 5. Renderiza a lista de itens da conta (Item 1, 2)
const renderReviewItemsList = (currentOrderSnapshot) => {
    const listEl = document.getElementById('reviewItemsList');
    if (!listEl) return;
    
    const sentItems = currentOrderSnapshot.sentItems || [];
    
    // Calcula itens já movidos para splits (para não listá-los na conta principal)
    const itemsInSplits = Object.values(currentOrderSnapshot.splits || {})
                                .flatMap(split => split.items.map(item => item.orderId + item.sentAt)); 
    
    const mainAccountItems = sentItems.filter(item => {
        const key = item.orderId + item.sentAt;
        return !itemsInSplits.includes(key);
    });

    if (mainAccountItems.length === 0) {
        listEl.innerHTML = `<div class="text-sm text-gray-500 italic p-2">Nenhum item restante na conta principal.</div>`;
    } else {
        // Agrupamento para exibição
        const groupedItems = mainAccountItems.reduce((acc, item) => {
            // Chave de agrupamento visual
            const groupKey = `${item.name}-${item.note || ''}`;

            if (!acc[groupKey]) {
                acc[groupKey] = { items: [], totalCount: 0, totalValue: 0 };
            }
            acc[groupKey].items.push(item);
            acc[groupKey].totalCount++;
            acc[groupKey].totalValue += item.price;
            
            return acc;
        }, {});

        const listHtml = Object.entries(groupedItems).map(([groupKey, group]) => {
            // Cria uma chave única para cada grupo/item para a checkbox
            const itemUniqueKeys = group.items.map(item => `${item.orderId}_${item.sentAt}`).join(','); 
            
            return `
                <div class="flex items-start justify-between py-1 border-b border-gray-100 hover:bg-gray-50 transition" data-item-keys="${itemUniqueKeys}">
                    <input type="checkbox" class="item-select-checkbox mt-1.5 ml-1 mr-2" data-item-keys="${itemUniqueKeys}" disabled>
                    
                    <div class="flex flex-col flex-grow min-w-0">
                        <span class="text-sm font-semibold text-gray-800">${group.items[0].name} (${group.totalCount}x)</span>
                        ${group.items[0].note ? `<span class="text-xs text-gray-500 truncate">(${group.items[0].note})</span>` : ''}
                    </div>
                    
                    <span class="text-sm font-bold text-gray-700">${formatCurrency(group.totalValue)}</span>
                </div>
            `;
        }).join('');
        
        listEl.innerHTML = `
            <div class="max-h-48 overflow-y-auto">
                ${listHtml}
            </div>
            <p class="text-sm text-gray-500 italic p-2 mt-2">Total de ${mainAccountItems.length} itens na conta principal. </p>
        `;
    }
};


// 6. Lógica de Ativação da Seleção de Itens (Item 2)
export const activateItemSelection = (action) => {
    // Alterna a desativação das checkboxes
    const checkboxes = document.querySelectorAll('.item-select-checkbox');
    const isEnabled = checkboxes.length > 0 && !checkboxes[0].disabled;
    
    if (!checkboxes.length) {
        alert("Não há itens para selecionar.");
        return;
    }

    if (!isEnabled) {
        // Ativa o modo de seleção
        checkboxes.forEach(cb => { cb.disabled = false; cb.checked = false; });
        alert(`Modo de SELEÇÃO ATIVO. Selecione os itens e clique em ${action === 'transfer' ? 'Transferir' : 'Excluir'} novamente.`);
    } else {
        // Executa a ação
        const selectedItemsKeys = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.dataset.itemKeys.split(','))
            .flat();
        
        // Desativa o modo de seleção
        checkboxes.forEach(cb => { cb.disabled = true; cb.checked = false; });
        
        if (selectedItemsKeys.length === 0) {
            alert("Nenhum item selecionado. Modo de seleção desativado.");
            return;
        }

        if (action === 'transfer') {
             // Lógica de Transferência de Itens
             openSplitTransferModal('main', 'move_out', selectedItemsKeys); 
        } else if (action === 'delete') {
             // Lógica de Exclusão de Itens
             openItemDeleteModal(selectedItemsKeys);
        }
    }
};


// Funções de Gerente para Itens (Item 2)
export const openItemTransferModal = () => {
    openManagerAuthModal('openItemTransfer', 'transfer');
};
window.openItemTransferModal = openItemTransferModal;

export const openItemDeleteModal = (selectedItemsKeys = null) => {
    // Se a função for chamada com o payload, o gerente já se autenticou.
    if (selectedItemsKeys && Array.isArray(selectedItemsKeys)) {
        alert(`Itens selecionados para exclusão: ${selectedItemsKeys.length}. Função de exclusão em massa em desenvolvimento.`);
        // Aqui deve ir a lógica para remover os itens do sentItems
    } else {
        // Ponto de entrada do botão
        openManagerAuthModal('openItemDelete', 'delete');
    }
};
window.openItemDeleteModal = openItemDeleteModal;


// 7. Lógica de manipulação de Split (Item 3)
const openPaymentModalForSplit = (splitKey) => {
    alert(`Pagar Conta de Divisão (${splitKey}) em desenvolvimento.`);
};
window.openPaymentModalForSplit = openPaymentModalForSplit;

const moveItemsToMainAccount = (splitKey) => {
    alert(`Desfazer itens da conta (${splitKey}) para a conta principal em desenvolvimento.`);
};
window.moveItemsToMainAccount = moveItemsToMainAccount;


// 8. Registro e Pesquisa de Cliente (Item 5)
export const handleCustomerRegistration = async () => {
    const customerName = document.getElementById('customerNameInput').value.trim();
    const customerWhatsApp = document.getElementById('customerWhatsAppInput').value.trim();
    const customerEmail = document.getElementById('customerEmailInput').value.trim();

    if (!customerName || !customerWhatsApp) {
        alert("Nome e WhatsApp são obrigatórios.");
        return;
    }
    
    // Simplificado: usa o WhatsApp como ID do cliente
    const customerRef = doc(getCustomersCollectionRef(), customerWhatsApp);
    
    try {
        await setDoc(customerRef, {
            name: customerName,
            whatsapp: customerWhatsApp,
            email: customerEmail,
            registeredAt: Date.now(),
        });

        alert(`Cliente ${customerName} cadastrado com sucesso!`);
        document.getElementById('customerRegModal').style.display = 'none';
        
    } catch (e) {
        console.error("Erro ao cadastrar cliente:", e);
        alert("Erro ao cadastrar cliente.");
    }
};
window.handleCustomerRegistration = handleCustomerRegistration;

export const handleSearchCustomer = async () => {
    const searchInput = document.getElementById('customerSearchInput');
    const searchTerm = searchInput.value.trim();
    
    if (!searchTerm) {
        alert("Digite o nome ou WhatsApp do cliente para buscar.");
        return;
    }

    // Lógica simplificada de busca por WhatsApp
    const customerRef = doc(getCustomersCollectionRef(), searchTerm);
    const docSnap = await getDoc(customerRef);

    if (docSnap.exists()) {
        const data = docSnap.data();
        alert(`Cliente Encontrado: ${data.name} (WhatsApp: ${data.whatsapp})`);
        // Aqui você pode implementar a lógica para "anexar" o cliente à mesa
        // Ex: updateDoc(getTableDocRef(currentTableId), { clientName: data.name, clientId: data.whatsapp });
    } else {
        alert(`Cliente '${searchTerm}' não encontrado.`);
    }
};
window.handleSearchCustomer = handleSearchCustomer;


// Implementar no futuro: Lógica para mover itens para as subcontas.
const openSplitTransferModal = (targetKey, mode, selectedItemsKeys = null) => {
    if (selectedItemsKeys) {
        alert(`Transferência de ${selectedItemsKeys.length} itens do grupo para ${targetKey} em desenvolvimento.`);
    } else {
        alert(`Gerenciamento da conta ${targetKey} no modo ${mode} (Em desenvolvimento).`);
    }
};
window.openSplitTransferModal = openSplitTransferModal;


// Implementar no futuro: Lógica para fechar a conta (WooCommerce) (Item 9)
export const handleFinalizeOrder = () => {
    if (!currentTableId || userRole === 'client') return;
    
    const { total: generalTotal } = calculateTotal(currentOrderSnapshot.total || 0, currentOrderSnapshot.serviceTaxApplied || false);
    const currentPaymentsTotal = currentOrderSnapshot?.payments.reduce((s,p) => s + p.value, 0) || 0;
    const remainingBalance = generalTotal - currentPaymentsTotal;

    if (remainingBalance > 0.01) {
        alert("O saldo restante deve ser zero para finalizar a conta.");
        return;
    }
    
    // Abre o modal de finalização (Item 9)
    document.getElementById('finalizeOrderModal').style.display = 'flex';
};
window.handleFinalizeOrder = handleFinalizeOrder;


// Recalcula e renderiza o resumo de pagamento
export const renderPaymentSummary = (currentTableId, currentOrderSnapshot) => {
    if (!currentOrderSnapshot) return;

    const tableData = currentOrderSnapshot;
    const subtotal = tableData.total || 0; 
    const payments = tableData.payments || [];
    const currentPaymentsTotal = payments.reduce((sum, p) => sum + p.value, 0);

    const serviceTaxApplied = tableData.serviceTaxApplied || false;

    const { total: generalTotal, serviceValue } = calculateTotal(subtotal, serviceTaxApplied);
    
    // Pega o input de valor por pessoa
    const dinersSplitInput = document.getElementById('dinersSplitInput');
    const diners = parseInt(dinersSplitInput?.value) || 1;
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
        toggleServiceTaxBtn.textContent = serviceTaxApplied ? 'Remover (Gerente)' : 'Aplicar';
        toggleServiceTaxBtn.classList.toggle('bg-green-600', serviceTaxApplied);
        toggleServiceTaxBtn.classList.toggle('bg-red-600', !serviceTaxApplied);
        
        // Adiciona o listener aqui (caso não exista, para evitar duplicação)
        if (!toggleServiceTaxBtn.hasAttribute('data-listener')) {
            toggleServiceTaxBtn.addEventListener('click', handleToggleServiceTax);
            toggleServiceTaxBtn.setAttribute('data-listener', 'true');
        }
    }
    
    // Habilita/Desabilita Finalizar
    const finalizeOrderBtn = document.getElementById('finalizeOrderBtn');
    if (finalizeOrderBtn) {
        const canFinalize = remainingBalance <= 0.01 && currentPaymentsTotal > 0;
        finalizeOrderBtn.disabled = !canFinalize;
    }
    
    // Listener para o input de Pessoas (Divisão)
    if (dinersSplitInput && !dinersSplitInput.hasAttribute('data-listener')) {
        dinersSplitInput.addEventListener('input', () => renderPaymentSummary(currentTableId, currentOrderSnapshot));
        dinersSplitInput.setAttribute('data-listener', 'true');
    }
    
    // Renderiza a lista de itens da conta (Item 1, 2)
    renderReviewItemsList(currentOrderSnapshot);
    
    // Renderiza os pagamentos registrados (Item 8)
    renderRegisteredPayments(payments);
    
    // Renderiza os botões/cards de divisão
    renderPaymentSplits(currentTableId, currentOrderSnapshot);
};


// Renderiza os botões/cards de divisão de conta (Item 3)
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


// NOVO: Adiciona a funcionalidade de adicionar conta de divisão
export const handleAddSplitAccount = async () => {
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


// Event listener para inicialização
document.addEventListener('DOMContentLoaded', () => {
    const addSplitAccountBtn = document.getElementById('addSplitAccountBtn');
    const paymentMethodButtons = document.getElementById('paymentMethodButtons');
    const paymentValueInput = document.getElementById('paymentValueInput');
    const addPaymentBtn = document.getElementById('addPaymentBtn');
    const finalizeOrderBtn = document.getElementById('finalizeOrderBtn');
    const openCustomerRegBtn = document.getElementById('openCustomerRegBtn');
    const itemTransferBtn = document.getElementById('itemTransferBtn');
    const itemDeleteBtn = document.getElementById('itemDeleteBtn');
    
    // 1. Adicionar Conta de Divisão
    if (addSplitAccountBtn) {
        addSplitAccountBtn.addEventListener('click', window.handleAddSplitAccount); 
    }
    
    // 2. Ações Gerenciais de Itens (Item 2)
    if (itemTransferBtn) {
        itemTransferBtn.addEventListener('click', () => {
             // O payload é a string 'transfer' que a ação do gerente usará
             const action = 'openItemTransfer';
             const payload = 'transfer';
             const checkboxes = document.querySelectorAll('.item-select-checkbox');
             const isEnabled = checkboxes.length > 0 && !checkboxes[0].disabled;
             
             if (isEnabled) {
                 activateItemSelection(payload);
             } else {
                 openManagerAuthModal(action, payload);
             }
        });
    }
    if (itemDeleteBtn) {
         itemDeleteBtn.addEventListener('click', () => {
             // O payload é a string 'delete'
             const action = 'openItemDelete';
             const payload = 'delete';
             const checkboxes = document.querySelectorAll('.item-select-checkbox');
             const isEnabled = checkboxes.length > 0 && !checkboxes[0].disabled;

             if (isEnabled) {
                 activateItemSelection(payload);
             } else {
                 openManagerAuthModal(action, payload);
             }
        });
    }

    // 3. Botões de Método de Pagamento (Seleção)
    if (paymentMethodButtons) {
        // Inicializa o primeiro como ativo
        const firstButton = paymentMethodButtons.querySelector('.payment-method-btn');
        if (firstButton) {
            firstButton.classList.add('active');
            currentPaymentMethod = firstButton.dataset.method;
        }

        paymentMethodButtons.addEventListener('click', (e) => {
            const btn = e.target.closest('.payment-method-btn');
            if (btn) {
                // Remove 'active' de todos
                document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active'));
                // Adiciona 'active' ao clicado
                btn.classList.add('active');
                currentPaymentMethod = btn.dataset.method;
                
                // Opcional: pré-preenche o valor total para Dinheiro/Pix
                if (currentOrderSnapshot) {
                     const { total: generalTotal } = calculateTotal(currentOrderSnapshot.total || 0, currentOrderSnapshot.serviceTaxApplied || false);
                     document.getElementById('paymentValueInput').value = formatCurrency(generalTotal);
                }
            }
        });
    }

    // 4. Input de Valor Pago (Máscara de Moeda)
    if (paymentValueInput) {
        // Inicializa o valor
        paymentValueInput.value = formatCurrency(0); 
        
        paymentValueInput.addEventListener('input', (e) => {
             // Simplesmente remove tudo que não for número e coloca a máscara (manualmente para evitar libs)
             let value = e.target.value.replace(/\D/g, ''); 
             if (value.length > 2) {
                 // Converte para centavos
                 value = (parseFloat(value) / 100).toFixed(2).replace('.', ',');
                 // Adiciona R$
                 e.target.value = `R$ ${value}`;
             }
        });
        
        // Seleciona o valor total ao focar
        paymentValueInput.addEventListener('focus', (e) => {
            if (currentOrderSnapshot) {
                 const { total: generalTotal } = calculateTotal(currentOrderSnapshot.total || 0, currentOrderSnapshot.serviceTaxApplied || false);
                 document.getElementById('paymentValueInput').value = formatCurrency(generalTotal);
            }
        });
    }

    // 5. Adicionar Pagamento
    if (addPaymentBtn) {
        addPaymentBtn.addEventListener('click', handleAddPayment);
    }
    
    // 6. Finalizar Conta
    if (finalizeOrderBtn) {
        finalizeOrderBtn.addEventListener('click', handleFinalizeOrder);
    }
    
    // 7. Cadastro e Busca de Cliente (Item 5)
    if (openCustomerRegBtn) {
        openCustomerRegBtn.addEventListener('click', () => {
            document.getElementById('customerRegModal').style.display = 'flex';
        });
    }
    const searchCustomerBtn = document.getElementById('searchCustomerBtn');
    if (searchCustomerBtn) {
        searchCustomerBtn.addEventListener('click', handleSearchCustomer);
    }
});
