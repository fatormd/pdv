// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { currentTableId, currentOrderSnapshot } from "/app.js";
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "/utils.js";
// --- CORREÇÃO: Importa db e getCustomersCollectionRef ---
import { getTableDocRef, getCustomersCollectionRef, db } from "/services/firebaseService.js"; 
import { 
    updateDoc, arrayUnion, arrayRemove, writeBatch, getFirestore, getDoc, serverTimestamp, 
    // --- CORREÇÃO: Importa funções Firestore adicionais ---
    collection, query, where, getDocs, addDoc, setDoc, doc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- VARIÁVEIS DE ELEMENTOS ---
let paymentSplitsContainer, addSplitAccountBtn;
let reviewItemsList;
let orderSubtotalDisplay, orderServiceTaxDisplay, orderTotalDisplay, valuePerDinerDisplay, remainingBalanceDisplay;
let toggleServiceTaxBtn, dinersSplitInput;
let paymentSummaryList, chargeInputs, openCustomerRegBtn, customerSearchInput, paymentMethodButtonsContainer, paymentValueInput, openCalculatorBtn, addPaymentBtn;
let finalizeOrderBtn, openNfeModalBtn;
let calculatorModal, calcDisplay, calcButtons, closeCalcBtnX;
let selectiveTransferModal, targetTableInput, checkTargetTableBtn, confirmTransferBtn, transferStatus, transferItemsList;
let tableTransferModal;

// Variáveis do Modal Cliente
let customerRegModal, customerSearchCpfInput, searchCustomerByCpfBtn, customerSearchResultsDiv;
let customerNameInput, customerCpfInput, customerPhoneInput, customerEmailInput;
let closeCustomerRegModalBtn, saveCustomerBtn, linkCustomerToTableBtn;
let currentFoundCustomer = null; // Guarda o cliente encontrado/selecionado { id: '...', name: '...', cpf: '...' ... }

// Estado local
let isMassSelectionActive = false;
let paymentInitialized = false;

const PAYMENT_METHODS = ['Dinheiro', 'Pix', 'Crédito', 'Débito', 'Ticket', 'Voucher'];


// --- FUNÇÕES DE CÁLCULO E UTILIDADE ---
const calculateTotal = (subtotal, applyServiceTax) => { /* ... (mantida) ... */ };
const updateText = (id, value) => { /* ... (mantida) ... */ };
const groupMainAccountItems = (orderSnapshot) => { /* ... (mantida) ... */ };

// --- FUNÇÕES DE AÇÃO ---
export const executeDeletePayment = async (timestamp) => { /* ... (mantida) ... */ };
export const deletePayment = async (timestamp) => { /* ... (mantida) ... */ };

// --- FUNÇÕES DE RENDERIZAÇÃO ---
const renderReviewItemsList = (orderSnapshot) => { /* ... (mantida) ... */ };
const renderRegisteredPayments = (payments) => { /* ... (mantida) ... */ };
const renderPaymentSplits = (orderSnapshot) => { /* ... (mantida) ... */ };
const renderPaymentMethodButtons = () => { /* ... (mantida) ... */ };
export const renderPaymentSummary = (tableId, orderSnapshot) => { 
    /* ... (mantida) ... */ 
    // Atualiza o input principal se houver cliente associado
    if (customerSearchInput && orderSnapshot?.clientName) {
        customerSearchInput.value = orderSnapshot.clientName;
        customerSearchInput.disabled = true; // Desabilita busca se já associado
    } else if (customerSearchInput) {
        customerSearchInput.value = ''; // Limpa se não houver cliente
        customerSearchInput.disabled = false;
    }
};

// --- LÓGICAS DE AÇÃO EM MASSA E TRANSFERÊNCIA ---
// window.activateItemSelection = (mode = null) => { /* ... (mantida) ... */ }; 
export const handleMassActionRequest = (action) => { /* ... (mantida) ... */ };
export const handleMassDeleteConfirmed = async () => { /* ... (mantida) ... */ };
export function openTableTransferModal() { /* ... (mantida) ... */ };
export function handleConfirmTableTransfer() { /* ... (mantida) ... */ };

// Placeholders
export const handleAddSplitAccount = async () => { alert("Divisão de conta (DEV)."); };
export const openPaymentModalForSplit = (splitKey) => { alert(`Pagar Conta ${splitKey} (DEV)`); };
export const moveItemsToMainAccount = (splitKey) => { alert(`Desfazer Conta ${splitKey} (DEV)`); };
export const openSplitTransferModal = (targetKey, mode, itemsToTransfer = null) => { alert(`Mover itens para/de ${targetKey} (DEV)`); };
export const handleFinalizeOrder = () => { alert("Finalizar Conta (DEV)"); };

// ==============================================
//     FUNÇÕES: GESTÃO DE CLIENTES (IMPLEMENTADAS)
// ==============================================

// Abre e Limpa o Modal de Cliente
const openCustomerRegModal = () => {
    if (!customerRegModal) return;
    
    // Limpa campos
    if(customerSearchCpfInput) customerSearchCpfInput.value = '';
    if(customerNameInput) customerNameInput.value = '';
    if(customerCpfInput) customerCpfInput.value = '';
    if(customerPhoneInput) customerPhoneInput.value = '';
    if(customerEmailInput) customerEmailInput.value = '';
    if(customerSearchResultsDiv) customerSearchResultsDiv.innerHTML = '<p class="text-sm text-dark-placeholder italic">Digite um CPF para buscar.</p>';
    
    // Reseta estado
    currentFoundCustomer = null;
    if(saveCustomerBtn) saveCustomerBtn.disabled = true; 
    if(linkCustomerToTableBtn) linkCustomerToTableBtn.disabled = true; 
    if(customerCpfInput) customerCpfInput.readOnly = false; 

    // Verifica se já existe cliente associado na mesa atual
    if (currentOrderSnapshot?.customerId) {
        // Se já existe, preenche o modal com os dados da mesa e permite desassociar (ou só fechar)
        if(customerNameInput) customerNameInput.value = currentOrderSnapshot.clientName || '';
        if(customerCpfInput) customerCpfInput.value = currentOrderSnapshot.clientCpf || ''; // Assumindo que guardamos CPF na mesa
        // Preencher outros campos se disponíveis...
        customerSearchResultsDiv.innerHTML = `<p class="text-sm text-green-400">Cliente <span class="font-bold">${currentOrderSnapshot.clientName || 'Associado'}</span> já vinculado a esta mesa.</p>`;
        if(saveCustomerBtn) saveCustomerBtn.textContent = "Atualizar Dados"; // Muda texto do botão
        if(saveCustomerBtn) saveCustomerBtn.disabled = false; // Permite atualizar
        // Poderia adicionar um botão "Desassociar" aqui
    }

    customerRegModal.style.display = 'flex';
    if(customerSearchCpfInput) customerSearchCpfInput.focus();
};

// Busca Cliente por CPF no Firebase
const searchCustomer = async () => {
    const cpf = customerSearchCpfInput?.value.trim().replace(/\D/g,''); // Limpa CPF
    if (!cpf || cpf.length < 11) {
        customerSearchResultsDiv.innerHTML = '<p class="text-sm text-red-400">CPF inválido. Digite apenas números (11 dígitos).</p>';
        return;
    }

    if (!db) {
        customerSearchResultsDiv.innerHTML = '<p class="text-sm text-red-400">Erro: Conexão com banco de dados indisponível.</p>';
        return;
    }

    customerSearchResultsDiv.innerHTML = '<p class="text-sm text-yellow-400 italic">Buscando...</p>';
    searchCustomerByCpfBtn.disabled = true;

    try {
        const customersRef = getCustomersCollectionRef();
        const q = query(customersRef, where("cpf", "==", cpf));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            // Cliente encontrado
            const customerDoc = querySnapshot.docs[0];
            currentFoundCustomer = { id: customerDoc.id, ...customerDoc.data() };

            customerNameInput.value = currentFoundCustomer.name || '';
            customerCpfInput.value = currentFoundCustomer.cpf || '';
            customerPhoneInput.value = currentFoundCustomer.phone || '';
            customerEmailInput.value = currentFoundCustomer.email || '';
            
            customerCpfInput.readOnly = true; // Não deixa editar CPF se encontrou
            customerSearchResultsDiv.innerHTML = `<p class="text-sm text-green-400">Cliente encontrado: <span class="font-bold">${currentFoundCustomer.name}</span></p>`;
            
            saveCustomerBtn.disabled = false; // Habilita salvar (para atualizar)
            saveCustomerBtn.textContent = "Atualizar Dados";
            linkCustomerToTableBtn.disabled = false; // Habilita associar

        } else {
            // Cliente não encontrado
            currentFoundCustomer = null; 
            customerNameInput.value = '';
            // customerCpfInput.value = cpf; // Preenche CPF buscado no campo de cadastro
            customerPhoneInput.value = '';
            customerEmailInput.value = '';

            customerCpfInput.readOnly = false; // Permite editar/digitar CPF
            customerSearchResultsDiv.innerHTML = '<p class="text-sm text-yellow-400">Cliente não encontrado. Preencha os dados abaixo para cadastrar.</p>';

            saveCustomerBtn.disabled = !(customerNameInput.value && customerCpfInput.value); // Habilita salvar se campos obrigatórios preenchidos
            saveCustomerBtn.textContent = "Salvar Novo Cliente";
            linkCustomerToTableBtn.disabled = true; // Desabilita associar
            customerNameInput.focus();
        }

    } catch (error) {
        console.error("Erro ao buscar cliente:", error);
        customerSearchResultsDiv.innerHTML = '<p class="text-sm text-red-400">Erro ao buscar cliente. Verifique o console.</p>';
        currentFoundCustomer = null;
        saveCustomerBtn.disabled = true;
        linkCustomerToTableBtn.disabled = true;
    } finally {
        searchCustomerByCpfBtn.disabled = false;
    }
};

// Salva (Novo ou Atualiza) Cliente no Firebase
const saveCustomer = async () => {
    const name = customerNameInput?.value.trim();
    const cpf = customerCpfInput?.value.trim().replace(/\D/g,'');
    const phone = customerPhoneInput?.value.trim();
    const email = customerEmailInput?.value.trim();

    if (!name || !cpf || cpf.length < 11) {
        alert("Nome e CPF (11 dígitos) são obrigatórios.");
        return;
    }

    if (!db) {
        alert("Erro: Conexão com banco de dados indisponível.");
        return;
    }

    saveCustomerBtn.disabled = true;
    saveCustomerBtn.textContent = "Salvando...";

    const customerData = { name, cpf, phone, email };

    try {
        const customersRef = getCustomersCollectionRef();
        let customerDocRef;

        if (currentFoundCustomer?.id) {
            // Atualizando cliente existente
            customerDocRef = doc(db, customersRef.path, currentFoundCustomer.id);
            await setDoc(customerDocRef, customerData, { merge: true }); // Usamos setDoc com merge para garantir a atualização
            currentFoundCustomer = { ...currentFoundCustomer, ...customerData }; // Atualiza estado local
            customerSearchResultsDiv.innerHTML = `<p class="text-sm text-green-400">Dados do cliente <span class="font-bold">${name}</span> atualizados!</p>`;
        } else {
            // Verificação extra: Cliente com este CPF já existe? (Evita duplicidade se a busca falhou antes)
            const q = query(customersRef, where("cpf", "==", cpf));
            const existingSnapshot = await getDocs(q);
            if (!existingSnapshot.empty) {
                 alert(`Erro: Já existe um cliente cadastrado com o CPF ${cpf}. Busque por ele.`);
                 saveCustomerBtn.textContent = "Salvar Novo Cliente"; // Volta texto original
                 saveCustomerBtn.disabled = false; // Reabilita
                 return;
            }

            // Criando novo cliente
            const addedDoc = await addDoc(customersRef, customerData);
            currentFoundCustomer = { id: addedDoc.id, ...customerData }; // Atualiza estado local com ID
            customerSearchResultsDiv.innerHTML = `<p class="text-sm text-green-400">Cliente <span class="font-bold">${name}</span> cadastrado com sucesso!</p>`;
            customerCpfInput.readOnly = true; // Trava CPF após salvar
        }

        linkCustomerToTableBtn.disabled = false; // Habilita associar após salvar/atualizar
        saveCustomerBtn.textContent = "Atualizar Dados"; // Muda para Atualizar caso precise editar de novo
        saveCustomerBtn.disabled = false; // Reabilita o botão

    } catch (error) {
        console.error("Erro ao salvar cliente:", error);
        alert("Erro ao salvar cliente. Verifique o console.");
        saveCustomerBtn.textContent = currentFoundCustomer?.id ? "Atualizar Dados" : "Salvar Novo Cliente"; // Volta texto
        saveCustomerBtn.disabled = false; // Reabilita
        linkCustomerToTableBtn.disabled = true;
    }
};

// Associa o Cliente Encontrado/Salvo à Mesa Atual
const linkCustomerToTable = async () => {
    if (!currentFoundCustomer?.id || !currentFoundCustomer?.name) {
        alert("Nenhum cliente válido selecionado ou salvo para associar.");
        return;
    }
    if (!currentTableId) {
        alert("Nenhuma mesa ativa para associar o cliente.");
        return;
    }

    linkCustomerToTableBtn.disabled = true;
    linkCustomerToTableBtn.textContent = "Associando...";

    try {
        const tableRef = getTableDocRef(currentTableId);
        await updateDoc(tableRef, {
            customerId: currentFoundCustomer.id,
            clientName: currentFoundCustomer.name,
            clientCpf: currentFoundCustomer.cpf // Guarda o CPF na mesa também (útil para NF-e)
        });

        console.log(`Cliente ${currentFoundCustomer.name} associado à mesa ${currentTableId}`);
        // Atualiza o input principal fora do modal
        if (customerSearchInput) {
             customerSearchInput.value = currentFoundCustomer.name;
             customerSearchInput.disabled = true;
        }
        
        // Fecha o modal
        if(customerRegModal) customerRegModal.style.display = 'none';

    } catch (error) {
        console.error(`Erro ao associar cliente à mesa ${currentTableId}:`, error);
        alert("Erro ao associar cliente à mesa.");
    } finally {
         linkCustomerToTableBtn.disabled = false; // Reabilita mesmo em caso de erro
         linkCustomerToTableBtn.textContent = "Associar à Mesa";
    }
};

// ==============================================
//           FIM DAS NOVAS FUNÇÕES
// ==============================================


// --- INICIALIZAÇÃO DO CONTROLLER ---
const attachReviewListListeners = () => { 
    const massDeleteBtn = document.getElementById('massDeleteBtn');
    const massTransferBtn = document.getElementById('massTransferBtn');
    if (massDeleteBtn) { /* ... (mantida) ... */ }
    if (massTransferBtn) { /* ... (mantida) ... */ }
};

export const initPaymentController = () => {
    if(paymentInitialized) return;
    console.log("[PaymentController] Inicializando...");

    // Mapeia Elementos Principais
    reviewItemsList = document.getElementById('reviewItemsList');
    paymentSplitsContainer = document.getElementById('paymentSplitsContainer');
    addSplitAccountBtn = document.getElementById('addSplitAccountBtn');
    orderSubtotalDisplay = document.getElementById('orderSubtotalDisplayPayment');
    orderServiceTaxDisplay = document.getElementById('orderServiceTaxDisplayPayment');
    orderTotalDisplay = document.getElementById('orderTotalDisplayPayment');
    valuePerDinerDisplay = document.getElementById('valuePerDinerDisplay');
    remainingBalanceDisplay = document.getElementById('remainingBalanceDisplay');
    toggleServiceTaxBtn = document.getElementById('toggleServiceTaxBtn');
    dinersSplitInput = document.getElementById('dinersSplitInput');
    paymentSummaryList = document.getElementById('paymentSummaryList');
    chargeInputs = document.getElementById('chargeInputs');
    openCustomerRegBtn = document.getElementById('openCustomerRegBtn'); // Botão que abre o modal cliente
    customerSearchInput = document.getElementById('customerSearchInput'); // Input principal
    paymentMethodButtonsContainer = document.getElementById('paymentMethodButtons');
    paymentValueInput = document.getElementById('paymentValueInput');
    openCalculatorBtn = document.getElementById('openCalculatorBtn');
    addPaymentBtn = document.getElementById('addPaymentBtn');
    finalizeOrderBtn = document.getElementById('finalizeOrderBtn');
    openNfeModalBtn = document.getElementById('openNfeModalBtn');
    calculatorModal = document.getElementById('calculatorModal');
    calcDisplay = document.getElementById('calcDisplay');
    calcButtons = calculatorModal?.querySelector('.grid');
    closeCalcBtnX = document.getElementById('closeCalcBtnX');
    tableTransferModal = document.getElementById('tableTransferModal');
    
    // Mapeia Elementos do Modal Cliente
    customerRegModal = document.getElementById('customerRegModal');
    customerSearchCpfInput = document.getElementById('customerSearchCpf');
    searchCustomerByCpfBtn = document.getElementById('searchCustomerByCpfBtn');
    customerSearchResultsDiv = document.getElementById('customerSearchResults');
    customerNameInput = document.getElementById('customerName');
    customerCpfInput = document.getElementById('customerCpf');
    customerPhoneInput = document.getElementById('customerPhone');
    customerEmailInput = document.getElementById('customerEmail');
    closeCustomerRegModalBtn = document.getElementById('closeCustomerRegModalBtn');
    saveCustomerBtn = document.getElementById('saveCustomerBtn');
    linkCustomerToTableBtn = document.getElementById('linkCustomerToTableBtn');

    if (tableTransferModal) { /* ... (mapeamento mantido) ... */ }
    if(selectiveTransferModal) { /* ... (mapeamento mantido) ... */ }

    if (!reviewItemsList) { console.error("[PaymentController] Erro Fatal: 'reviewItemsList' não encontrado."); return; }
    
    renderPaymentMethodButtons(); // Renderiza botões de pagamento

    // Adiciona Listeners Essenciais (Mantidos e Adicionados)
    if(toggleServiceTaxBtn) toggleServiceTaxBtn.addEventListener('click', async () => { /* ... */ });
    if(dinersSplitInput) dinersSplitInput.addEventListener('input', () => renderPaymentSummary(currentTableId, currentOrderSnapshot));
    if(paymentMethodButtonsContainer) paymentMethodButtonsContainer.addEventListener('click', (e) => { /* ... */ });
    if(paymentValueInput) paymentValueInput.addEventListener('input', (e) => { /* ... */ });
    if(addPaymentBtn) addPaymentBtn.addEventListener('click', async () => { /* ... */ });
    if(finalizeOrderBtn) finalizeOrderBtn.addEventListener('click', handleFinalizeOrder); // Placeholder
    if(openNfeModalBtn) openNfeModalBtn.addEventListener('click', window.openNfeModal); // Placeholder global
    if(addSplitAccountBtn) addSplitAccountBtn.addEventListener('click', handleAddSplitAccount); // Placeholder
    if (openCalculatorBtn) openCalculatorBtn.addEventListener('click', () => { if(calculatorModal) calculatorModal.style.display = 'flex'; });
    if (closeCalcBtnX) closeCalcBtnX.addEventListener('click', () => { if (calculatorModal) calculatorModal.style.display = 'none'; });
    if (calcButtons) calcButtons.addEventListener('click', (e) => { /* ... */ });
    if(confirmTransferBtn) { /* ... (listener mantido) ... */ }
    if (targetTableInput) { /* ... (listener mantido) ... */ }

    // --- Listeners do Modal Cliente ---
    if (openCustomerRegBtn) {
        openCustomerRegBtn.addEventListener('click', openCustomerRegModal);
    } else {
        console.error("[PaymentController] Botão 'openCustomerRegBtn' não encontrado.");
    }
    if (closeCustomerRegModalBtn) {
        closeCustomerRegModalBtn.addEventListener('click', () => {
            if(customerRegModal) customerRegModal.style.display = 'none';
        });
    }
    if (searchCustomerByCpfBtn) {
        searchCustomerByCpfBtn.addEventListener('click', searchCustomer); // Chama a função implementada
    }
    if (saveCustomerBtn) {
        saveCustomerBtn.addEventListener('click', saveCustomer); // Chama a função implementada
    }
    if (linkCustomerToTableBtn) {
        linkCustomerToTableBtn.addEventListener('click', linkCustomerToTable); // Chama a função implementada
    }
    // Habilita/Desabilita "Salvar" baseado nos campos obrigatórios
    [customerNameInput, customerCpfInput].forEach(input => {
        if (input) {
            input.addEventListener('input', () => {
                const nameValid = customerNameInput?.value.trim().length > 2;
                // Validação simples de CPF (11 dígitos numéricos)
                const cpfRaw = customerCpfInput?.value.trim().replace(/\D/g,'');
                const cpfValid = cpfRaw.length === 11; 
                
                if(saveCustomerBtn) saveCustomerBtn.disabled = !(nameValid && cpfValid);
            });
        }
    });
    // --- FIM Listeners Modal Cliente ---

    paymentInitialized = true;
    console.log("[PaymentController] Inicializado.");
};
