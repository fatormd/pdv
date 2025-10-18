// O script principal agora usa as funções do Firebase expostas globalmente pelo index.html
const initializeApp = window.initializeApp;
const getAuth = window.getAuth;
const signInAnonymously = window.signInAnonymously;
const onAuthStateChanged = window.onAuthStateChanged;
const signInWithCustomToken = window.signInWithCustomToken;
const getFirestore = window.getFirestore;
const collection = window.collection;
const onSnapshot = window.onSnapshot;
const doc = window.doc;
const setDoc = window.setDoc;
const updateDoc = window.updateDoc;
const query = window.query;
const where = window.where;
const serverTimestamp = window.serverTimestamp;
const getDoc = window.getDoc;
const arrayRemove = window.arrayRemove;
const arrayUnion = window.arrayUnion;
const writeBatch = window.writeBatch;
const orderBy = window.orderBy;


// O código é envolvido em DOMContentLoaded para garantir que os elementos HTML existam
document.addEventListener('DOMContentLoaded', () => {

    // --- VARIÁVEIS GLOBAIS ---
    let db, auth, userId;
    const appId = window.__app_id;
    let currentTableId = null;
    let selectedItems = []; // Itens selecionados na UI antes de enviar (lista de anotações)
    let currentOrderSnapshot = null; // Último estado da mesa no Firebase
    let serviceTaxApplied = true; // Taxa de serviço ativa por padrão
    let WOOCOMMERCE_PRODUCTS = []; // Armazena produtos do WooCommerce
    let WOOCOMMERCE_CATEGORIES = []; // Armazena categorias do WooCommerce

    // MOCK: Usuários e Credenciais (usado para simulação de login/permissão)
    const mockUsers = { 'gerente': '1234', 'garcom': '1234' };
    const MANAGER_USERNAME = 'gerente';

    // Mapeamento de telas para 4 índices: 0, 1, 2, 3
    const screens = { 'panelScreen': 0, 'orderScreen': 1, 'paymentScreen': 2, 'managerScreen': 3 };
    const password = '1234'; // Senha simulada de gerente (usada para ações gerenciais)
    const PAYMENT_METHODS = ['Dinheiro', 'Pix', 'Crédito', 'Débito', 'Ticket', 'Voucher'];
    
    // --- WooCommerce Configuração ---
    const WOOCOMMERCE_URL = 'https://nossotempero.fatormd.com';
    const CONSUMER_KEY = 'ck_e06515127d067eff5c39d6d93b3908b1baf9158a';
    const CONSUMER_SECRET = 'cs_0a4cdf88eb7f16387cff8a6a6ee6697eb3952999';


    // --- ELEMENTOS DA UI ---
    const statusScreen = document.getElementById('statusScreen');
    const statusContent = document.getElementById('statusContent');
    const mainContent = document.getElementById('mainContent');
    const appContainer = document.getElementById('appContainer');
    const mesaInput = document.getElementById('mesaInput');
    const pessoasInput = document.getElementById('pessoasInput');
    const abrirMesaBtn = document.getElementById('abrirMesaBtn');
    const openTablesList = document.getElementById('openTablesList');
    const openTablesCount = document.getElementById('openTablesCount');
    const menuItemsGrid = document.getElementById('menuItemsGrid');
    const openOrderList = document.getElementById('openOrderList');
    const obsModal = document.getElementById('obsModal');
    const obsItemName = document.getElementById('obsItemName');
    const obsInput = document.getElementById('obsInput');
    const saveObsBtn = document.getElementById('saveObsBtn');
    const cancelObsBtn = document.getElementById('cancelObsBtn');
    const searchProductInput = document.getElementById('searchProductInput');
    const paymentValueInput = document.getElementById('paymentValueInput');
    const addPaymentBtn = document.getElementById('addPaymentBtn');
    const finalizeOrderBtn = document.getElementById('finalizeOrderBtn');
    const openNfeModalBtn = document.getElementById('openNfeModalBtn');
    const toggleServiceTaxBtn = document.getElementById('toggleServiceTaxBtn');
    const dinersSplitInput = document.getElementById('dinersSplitInput');
    const sendSelectedItemsBtn = document.getElementById('sendSelectedItemsBtn');
    const quickObsButtons = document.getElementById('quickObsButtons');
    const esperaSwitch = document.getElementById('esperaSwitch');
    const paymentMethodButtonsContainer = document.getElementById('paymentMethodButtons');

    // Elementos da calculadora
    const calculatorModal = document.getElementById('calculatorModal');
    const openCalculatorBtn = document.getElementById('openCalculatorBtn');
    const calcDisplay = document.getElementById('calcDisplay');
    const calcButtons = calculatorModal?.querySelector('.grid');
    const closeCalcBtnX = document.getElementById('closeCalcBtnX');

    // Elementos de login/logout
    const loginModal = document.getElementById('loginModal');
    const loginBtn = document.getElementById('loginBtn');
    const loginUsernameInput = document.getElementById('loginUsername');
    const loginPasswordInput = document.getElementById('loginPassword');
    const logoutBtnHeader = document.getElementById('logoutBtnHeader');
    
    // Modais Gerenciais
    const waiterRegModal = document.getElementById('waiterRegModal');
    const managerPassRegInput = document.getElementById('managerPassRegInput');
    const newWaiterNameInput = document.getElementById('newWaiterNameInput');
    const newWaiterPasswordInput = document.getElementById('newWaiterPasswordInput');
    const confirmWaiterRegBtn = document.getElementById('confirmWaiterRegBtn');
    const cancelWaiterRegBtn = document.getElementById('cancelWaiterRegBtn');
    
    // Ícone de Engrenagem (Botão de Gerente no Cabeçalho)
    const openManagerPanelBtn = document.getElementById('openManagerPanelBtn');
    
    // Elementos da Transferência em Massa
    const selectiveTransferModal = document.getElementById('selectiveTransferModal');

    // Elementos de Cliente
    const openCustomerRegBtn = document.getElementById('openCustomerRegBtn');
    const customerRegModal = document.getElementById('customerRegModal');
    const regCustomerName = document.getElementById('regCustomerName');
    const regCustomerPhone = document.getElementById('regCustomerPhone');
    const regCustomerEmail = document.getElementById('regCustomerEmail');
    const cancelCustomerRegBtn = document.getElementById('cancelCustomerRegBtn');
    const confirmCustomerRegBtn = document.getElementById('confirmCustomerRegBtn');

    // Elementos de busca de mesa
    const searchTableInput = document.getElementById('searchTableInput');
    const searchTableBtn = document.getElementById('searchTableBtn');
    
    let currentObsGroup = null;

    // --- UTILS ---
    const formatCurrency = (value) => `R$ ${parseFloat(value || 0).toFixed(2).replace('.', ',')}`;

    // Máscara de Moeda (da esquerda para a direita)
    const currencyMask = (value) => {
        if (!value) return 'R$ 0,00';
        let rawValue = value.toString().replace(/\D/g, "");
        if (rawValue.length > 2) {
            rawValue = rawValue.padStart(3, '0');
        } else if (rawValue.length < 3) {
            rawValue = rawValue.padStart(3, '0');
        }
        
        const integerPart = rawValue.substring(0, rawValue.length - 2);
        const decimalPart = rawValue.substring(rawValue.length - 2);

        // Remove zeros à esquerda da parte inteira, exceto se for '0'
        const cleanIntegerPart = integerPart.replace(/^0+/, '');
        const finalIntegerPart = cleanIntegerPart === '' ? '0' : cleanIntegerPart;


        return `R$ ${parseInt(finalIntegerPart).toLocaleString('pt-BR')},${decimalPart}`;
    };

    // NOVO: Máscara de número para a calculadora (sem R$)
    const calculatorNumberMask = (value) => {
        if (!value) return '0,00';
        let rawValue = value.toString().replace(/\D/g, "");
        if (rawValue.length > 2) {
            rawValue = rawValue.padStart(3, '0');
        } else if (rawValue.length < 3) {
            rawValue = rawValue.padStart(3, '0');
        }
        
        const integerPart = rawValue.substring(0, rawValue.length - 2);
        const decimalPart = rawValue.substring(rawValue.length - 2);

        const cleanIntegerPart = integerPart.replace(/^0+/, '');
        const finalIntegerPart = cleanIntegerPart === '' ? '0' : cleanIntegerPart;


        return `${parseInt(finalIntegerPart).toLocaleString('pt-BR')},${decimalPart}`;
    };

    // Função para obter o valor numérico (float) do R$
    const getNumericValueFromCurrency = (currencyString) => {
        return parseFloat(currencyString.replace('R$', '').replace(/\./g, '').replace(',', '.').trim()) || 0;
    };

    // CORRIGIDO: Função para formatar o tempo (apenas minutos)
    const formatElapsedTime = (timestamp) => {
        if (!timestamp) return 'N/A';
        
        const now = Date.now();
        const diffMs = now - timestamp;
        
        const seconds = Math.floor(diffMs / 1000);
        const minutes = Math.floor(seconds / 60);

        if (minutes >= 60) {
             const hours = Math.floor(minutes / 60);
             return `> ${hours}h atrás`;
        } else if (minutes > 0) {
            return `${minutes} min atrás`;
        } else {
            return `Recém-enviado`;
        }
    };


    // Event handler para máscara (garante apenas números e formata)
    if (paymentValueInput) {
      paymentValueInput.addEventListener('input', (e) => {
        const valueRaw = e.target.value.replace(/\D/g, ''); 
        e.target.value = currencyMask(valueRaw);
        const newCursorPos = e.target.value.length;
        e.target.setSelectionRange(newCursorPos, newCursorPos);
    });
    }

    // --- FUNÇÕES DA CALCULADORA (CORRIGIDO) ---
    let calcValueCents = 0; 
    let storedValueCents = 0; 
    let selectedOperator = null;
    let shouldClearDisplay = false; 

    const calculateCents = (firstCents, operator, secondCents) => {
        let first = firstCents; 
        let second = secondCents; 
        let result;

        switch (operator) {
            case '+': result = first + second; break;
            case '-': result = first - second; break;
            // Multiplicação em centavos: (1000 centavos * 200 centavos) / 100 = 2000 centavos (R$ 20,00)
            case '*': result = Math.round(first * second / 100); break; 
            case '/': result = second === 0 ? 0 : Math.round(first / second); break;
            default: result = second; break;
        }

        return result;
    };

    const updateCalcDisplay = (centsValue) => {
        calcValueCents = centsValue;
        if (calcDisplay) {
            const stringValue = centsValue.toString().padStart(3, '0');
            calcDisplay.value = calculatorNumberMask(stringValue);
        }
    };

    const handleNumberInput = (key) => {
        if (shouldClearDisplay) {
            calcValueCents = 0;
            storedValueCents = 0;
            selectedOperator = null;
            shouldClearDisplay = false;
        }

        let rawInput = calcValueCents.toString().replace(/\D/g, '');

        if (key === '00') {
            rawInput += '00';
        } else if (key === ',' || key === '.') {
            // Ignora o ponto ou vírgula no input, pois a máscara já a adiciona
            return;
        } else {
            if (rawInput === '0' && key !== '0') {
                rawInput = key;
            } else if (rawInput !== '0') {
                rawInput += key;
            } else if (rawInput === '0' && key === '0') {
                return; 
            }
        }
        
        if (rawInput.length > 12) {
             rawInput = rawInput.substring(0, 12);
        }
        
        updateCalcDisplay(parseInt(rawInput));
    };

    const handleOperator = (key) => {
        if (selectedOperator && !shouldClearDisplay) {
            performCalculation('=');
        }
        
        storedValueCents = calcValueCents;
        selectedOperator = key;
        shouldClearDisplay = true;
    };

    const performCalculation = (key) => {
        if (!selectedOperator) {
            if (key === '=') shouldClearDisplay = true;
            return;
        }

        let resultCents = calculateCents(storedValueCents, selectedOperator, calcValueCents);
        
        updateCalcDisplay(resultCents);

        if (key === '=') {
            storedValueCents = resultCents;
            selectedOperator = null;
        } else {
            storedValueCents = resultCents;
            selectedOperator = key;
        }
        shouldClearDisplay = true;
    };


    if (openCalculatorBtn) {
        openCalculatorBtn.addEventListener('click', () => {
            if (calculatorModal) {
                calculatorModal.style.display = 'flex';
                // Converte o valor do input R$ para centavos para iniciar a calculadora
                const rawValue = paymentValueInput.value.replace('R$', '').replace(/\./g, '').replace(',', '');
                calcValueCents = parseInt(rawValue) || 0;
                storedValueCents = 0;
                selectedOperator = null;
                shouldClearDisplay = false;
                updateCalcDisplay(calcValueCents);
            }
        });
    }

    // CORRIGIDO: Listener para o botão 'X' de fechar (closeCalcBtnX)
    if (closeCalcBtnX) {
        closeCalcBtnX.addEventListener('click', () => {
            if (calculatorModal) calculatorModal.style.display = 'none';
        });
    }

    if (calcButtons) {
        calcButtons.addEventListener('click', (e) => {
            const btn = e.target.closest('.calc-btn');
            if (!btn) return;

            const key = btn.dataset.key;
            const isNumber = /^[0-9]$/.test(key);
            const isDoubleZero = key === '00';
            const isOperator = ['+', '-', '*', '/'].includes(key);

            if (isNumber || isDoubleZero) {
                handleNumberInput(key);
            } else if (isOperator) {
                handleOperator(key);
            } else if (key === '=') {
                performCalculation(key);
            } else if (key === 'C') {
                calcValueCents = 0;
                storedValueCents = 0;
                selectedOperator = null;
                shouldClearDisplay = false;
                updateCalcDisplay(0);
            } else if (key === 'ok') {
                performCalculation('=');
                // Converte o resultado de centavos de volta para a máscara de moeda
                paymentValueInput.value = formatCurrency(calcValueCents / 100);
                if (calculatorModal) calculatorModal.style.display = 'none';
            } else if (key === 'close') {
                // Nova ação de fechar
                if (calculatorModal) calculatorModal.style.display = 'none';
            }
        });
    }
    // FIM - FUNÇÕES DA CALCULADORA
    
    // --- FUNÇÕES DE CADASTRO DE CLIENTE (CORRIGIDO) ---
    const registerCustomer = async (name, phone, email) => {
        console.log(`Simulação: Tentativa de cadastro de cliente no WooCommerce. Nome: ${name}, WhatsApp: ${phone}, Email: ${email}`);
        
        return { 
            id: Math.floor(Math.random() * 1000), 
            name: name,
            phone: phone 
        };
    };

    if (openCustomerRegBtn) {
        openCustomerRegBtn.addEventListener('click', () => {
            if (customerRegModal) {
                customerRegModal.style.display = 'flex';
                regCustomerName.value = '';
                regCustomerPhone.value = '';
                regCustomerEmail.value = '';
            }
        });
    }

    if (cancelCustomerRegBtn) {
        cancelCustomerRegBtn.addEventListener('click', () => {
            if (customerRegModal) customerRegModal.style.display = 'none';
        });
    }

    if (confirmCustomerRegBtn) {
        confirmCustomerRegBtn.addEventListener('click', async () => {
            const name = regCustomerName.value.trim();
            const phone = regCustomerPhone.value.trim();
            const email = regCustomerEmail.value.trim();

            if (!name || !phone) {
                alert('Nome e WhatsApp são obrigatórios.');
                return;
            }

            try {
                const customer = await registerCustomer(name, phone, email);
                alert(`Cliente ${customer.name} (WhatsApp: ${customer.phone}) cadastrado com sucesso e integrado ao WooCommerce (Simulação)!`);
                if (customerRegModal) customerRegModal.style.display = 'none';
            } catch (error) {
                console.error("Erro ao cadastrar cliente:", error);
                alert("Falha ao cadastrar cliente. Verifique a conexão com a API do WooCommerce.");
            }
        });
    }

    // --- FUNÇÕES DE CADASTRO DE GARÇOM (MANTIDAS) ---
    if (cancelWaiterRegBtn) {
        cancelWaiterRegBtn.addEventListener('click', () => {
            if (waiterRegModal) waiterRegModal.style.display = 'none';
        });
    }

    if (confirmWaiterRegBtn) {
        confirmWaiterRegBtn.addEventListener('click', async () => {
            if (!managerPassRegInput || !newWaiterNameInput || !newWaiterPasswordInput) {
                alert("Erro interno: Campos do modal de cadastro não carregados.");
                return;
            }
            
            const managerPassword = managerPassRegInput.value;
            const newWaiterUsername = newWaiterNameInput.value.trim();
            const newWaiterPassword = newWaiterPasswordInput.value.trim();
            
            if (managerPassword !== password) {
                alert("Senha do gerente incorreta.");
                return;
            }
            if (!newWaiterUsername || !newWaiterPassword) {
                alert("Nome de usuário e Senha de login do garçom são obrigatórios.");
                return;
            }

            if (mockUsers[newWaiterUsername]) {
                 alert(`Erro: O usuário "${newWaiterUsername}" já existe.`);
                 return;
            }
            
            mockUsers[newWaiterUsername] = newWaiterPassword;
            alert(`Simulação: Garçom ${newWaiterUsername} cadastrado com sucesso! Agora você pode usar estas credenciais para logar.`);
            
            if (waiterRegModal) waiterRegModal.style.display = 'none';
        });
    }

    // --- FUNÇÕES DE LOGIN/LOGOUT ---
    const showLoginModal = () => {
        if (loginModal) {
            loginModal.style.display = 'flex';
            mainContent.style.display = 'none';
            if (openManagerPanelBtn) openManagerPanelBtn.classList.add('hidden');
        }
    };

    const hideLoginModal = () => {
        if (loginModal) {
            loginModal.style.display = 'none';
            mainContent.style.display = 'block';
        }
    };

    const handleLogout = () => {
        userId = null;
        currentTableId = null;
        selectedItems = [];
        currentOrderSnapshot = null;
        
        if (openManagerPanelBtn) openManagerPanelBtn.classList.add('hidden');

        goToScreen('panelScreen');
        showLoginModal();
        document.getElementById('user-id-display').textContent = 'Usuário ID: Deslogado...';
    };

    if (logoutBtnHeader) {
        logoutBtnHeader.addEventListener('click', handleLogout);
    }
    
    // Botão de Gerente no Cabeçalho
    if (openManagerPanelBtn) {
         openManagerPanelBtn.addEventListener('click', () => {
             openManagerAuthModal('goToManagerPanel');
         });
    }

    // NOVO: Função para executar a exclusão de pagamento APÓS autenticação
    const executeDeletePayment = async (timestamp) => {
        if (!currentTableId || !currentOrderSnapshot) return;
        
        // Converte o timestamp para número para garantir a comparação
        const tsNumber = parseInt(timestamp);
        const paymentToDelete = currentOrderSnapshot.payments.find(p => p.timestamp === tsNumber);
        
        if (!paymentToDelete) {
             alert("Pagamento não encontrado.");
             return;
        }
        
        // Remoção sem confirmação extra, pois já foi autenticado e confirmado no openManagerModal
        const tableRef = getTableDocRef(currentTableId);
        try {
            await updateDoc(tableRef, {
                payments: arrayRemove(paymentToDelete)
            });
            alert("Pagamento removido da lista.");
        } catch (e) {
            console.error("Erro ao deletar pagamento:", e);
            alert("Erro ao tentar remover o pagamento.");
        }
    }


    // Modal de autenticação Gerencial (antes da ação)
    const openManagerAuthModal = (action, payload = null) => {
        const managerModal = document.getElementById('managerModal');
        if (!managerModal) return; 

        managerModal.innerHTML = `
            <div class="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm">
                <h3 class="text-xl font-bold mb-4 text-red-600">Ação Gerencial Necessária</h3>
                <p class="text-base mb-3">Insira a senha do gerente para prosseguir.</p>
                <input type="password" id="managerPasswordInput" placeholder="Senha (Ex: 1234)" class="w-full p-3 border border-gray-300 rounded-lg focus:ring-red-500 focus:border-red-500 text-base" maxlength="4">
                
                <div class="flex justify-end space-x-3 mt-4">
                    <button class="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition text-base" onclick="document.getElementById('managerModal').style.display='none'">Cancelar</button>
                    <button id="authManagerBtn" class="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-base">Autenticar</button>
                </div>
            </div>
        `;
        managerModal.style.display = 'flex';
        
        document.getElementById('authManagerBtn').onclick = () => {
            const input = document.getElementById('managerPasswordInput');
            if (input && input.value === password) {
                managerModal.style.display = 'none';
                
                if (action === 'goToManagerPanel') {
                    alert("Acesso de Gerente liberado! Entrando no Painel Gerencial.");
                    goToScreen('managerScreen'); 
                } else if (action === 'openWaiterReg') {
                     if (waiterRegModal) waiterRegModal.style.display = 'flex';
                } else if (action === 'deleteMass') {
                    deleteSelectedSentItems();
                } else if (action === 'openSelectiveTransfer') {
                    window.openSelectiveTransferModal(); 
                } else if (action === 'deletePayment') { // NOVO: Deleção de Pagamento
                    executeDeletePayment(payload); 
                }
                
            } else {
                alert("Senha incorreta.");
                if (input) input.value = '';
            }
        };
    };


    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const username = loginUsernameInput.value;
            const password = loginPasswordInput.value;
            
            const isAuthenticated = mockUsers[username] === password;

            if (isAuthenticated) {
                alert(`Login de ${username} bem-sucedido!`);
                
                hideLoginModal(); 
                hideStatus(); 
                
                userId = `${username}_id_mock`; 
                document.getElementById('user-id-display').textContent = `Usuário ID: ${userId.substring(0, 8)}... (${appId})`;

                // Botão de Gerente SEMPRE VISÍVEL após login
                if (openManagerPanelBtn) {
                    openManagerPanelBtn.classList.remove('hidden');
                }

                loadOpenTables();
                await fetchWooCommerceProducts();
                await fetchWooCommerceCategories();
                renderMenu();
                renderPaymentMethodButtons();
                goToScreen('panelScreen'); 

            } else {
                alert('Credenciais inválidas.');
            }
        });
    }

    // --- FUNÇÕES DE EXCLUSÃO/TRANSFERÊNCIA EM MASSA (CORRIGIDO RECALC TOTAL) ---
    // NOVO HELPER: Calcula o valor total (em float) de uma lista de itens
    const calculateItemsValue = (items) => {
        return items.reduce((sum, item) => sum + (item.price || 0), 0);
    };

    const deleteSelectedSentItems = async () => {
        const selectedCheckboxes = document.querySelectorAll('#reviewItemsList input[type="checkbox"].item-checkbox:checked');
        if (selectedCheckboxes.length === 0) {
            alert("Nenhum item selecionado para exclusão.");
            return;
        }

        if (!confirm(`Tem certeza que deseja EXCLUIR ${selectedCheckboxes.length} grupo(s) de item(s) da conta? Esta ação é irreversível!`)) return;

        const itemsToRemove = [];
        
        selectedCheckboxes.forEach(checkbox => {
            const itemKey = checkbox.value; 
            const [itemId, itemNote] = itemKey.split('-');
            
            if (currentOrderSnapshot && currentOrderSnapshot.sentItems) {
                currentOrderSnapshot.sentItems.forEach(sentItem => {
                    if (sentItem.id == itemId && (sentItem.note || '') === itemNote) {
                        itemsToRemove.push(sentItem);
                    }
                });
            }
        });
        
        if (itemsToRemove.length === 0) {
            alert("Nenhum item correspondente encontrado na conta.");
            return;
        }
        
        // CORREÇÃO (BUG 1): Calcula o novo total antes do commit
        const itemsToRemoveValue = calculateItemsValue(itemsToRemove);
        const currentTotal = currentOrderSnapshot.total || 0;
        const newTotal = Math.max(0, currentTotal - itemsToRemoveValue); // Garante que o total não seja negativo

        const tableRef = getTableDocRef(currentTableId);
        const batch = writeBatch(db);
        
        itemsToRemove.forEach(item => {
            batch.update(tableRef, {
                sentItems: arrayRemove(item)
            });
        });
        
        // EXPLICIT UPDATE: Atualiza o total da mesa de origem
        batch.update(tableRef, { total: newTotal });

        try {
            await batch.commit();
            alert(`${itemsToRemove.length} item(s) removido(s) da conta.`);
        } catch (e) {
            console.error("Erro ao deletar itens da conta:", e);
            alert("Erro ao tentar remover os itens.");
        }
    }
    
    // Transferência em Massa
    const transferSelectedSentItems = async () => {
        const targetTableInput = document.getElementById('targetTableInput');
        const targetTable = parseInt(targetTableInput.value);
        
        if (!targetTable || targetTable === parseInt(currentTableId)) {
            alert("Selecione uma mesa de destino válida e diferente da atual.");
            return;
        }

        const selectedCheckboxes = document.querySelectorAll('#reviewItemsList input[type="checkbox"].item-checkbox:checked');
        if (selectedCheckboxes.length === 0) {
            alert("Nenhum item selecionado para transferência.");
            return;
        }
        
        if (!confirm(`Tem certeza que deseja TRANSFERIR ${selectedCheckboxes.length} grupo(s) de item(s) para a Mesa ${targetTable}?`)) return;

        const itemsToTransfer = [];
        
        selectedCheckboxes.forEach(checkbox => {
            const itemKey = checkbox.value; 
            const [itemId, itemNote] = itemKey.split('-');
            
            if (currentOrderSnapshot && currentOrderSnapshot.sentItems) {
                currentOrderSnapshot.sentItems.forEach(sentItem => {
                    if (sentItem.id == itemId && (sentItem.note || '') === itemNote) {
                        itemsToTransfer.push(sentItem);
                    }
                });
            }
        });
        
        if (itemsToTransfer.length === 0) {
            alert("Nenhum item correspondente encontrado na conta para transferência.");
            return;
        }
        
        // CORREÇÃO (BUG 1): Calcula o novo total antes do commit
        const itemsToTransferValue = calculateItemsValue(itemsToTransfer);
        
        // 1. Source Table: Subtract item value from source total
        const sourceTableRef = getTableDocRef(currentTableId);
        const sourceCurrentTotal = currentOrderSnapshot.total || 0;
        const sourceNewTotal = Math.max(0, sourceCurrentTotal - itemsToTransferValue);

        // 2. Target Table: Fetch current total to add to it
        const targetTableRef = getTableDocRef(targetTable);
        const targetDocSnap = await getDoc(targetTableRef);
        
        if (!targetDocSnap.exists() || targetDocSnap.data().status === 'closed') {
             alert(`A Mesa de destino ${targetTable} não está aberta.`);
             return;
        }
        
        const targetCurrentTotal = targetDocSnap.data()?.total || 0;
        const targetNewTotal = targetCurrentTotal + itemsToTransferValue; 

        const batch = writeBatch(db);

        // 1. Remove os itens e atualiza o total da mesa de origem
        itemsToTransfer.forEach(item => {
            batch.update(sourceTableRef, {
                sentItems: arrayRemove(item)
            });
        });
        batch.update(sourceTableRef, { total: sourceNewTotal }); // EXPLICIT UPDATE SOURCE

        // 2. Adiciona os itens e atualiza o total da mesa de destino
        batch.update(targetTableRef, {
            sentItems: arrayUnion(...itemsToTransfer),
            total: targetNewTotal // EXPLICIT UPDATE TARGET
        });

        try {
            await batch.commit();
            alert(`${itemsToTransfer.length} item(s) transferido(s) da Mesa ${currentTableId} para a Mesa ${targetTable}.`);
            if (selectiveTransferModal) selectiveTransferModal.style.display = 'none';
        } catch (e) {
            console.error("Erro ao transferir itens:", e);
            alert("Erro ao tentar transferir os itens. Verifique se a mesa de destino existe.");
        }
    }

    // Sobrescreve a função original para usar o fluxo de massa/modal
    window.openSelectiveTransferModal = () => {
        if (!currentTableId) return;

        const modal = document.getElementById('selectiveTransferModal');
        if (!modal) return; 
        
        const selectedItemsToTransfer = document.querySelectorAll('#reviewItemsList input[type="checkbox"].item-checkbox:checked');
        if (selectedItemsToTransfer.length === 0) {
            alert("Selecione um ou mais itens no Resumo da Conta para realizar a transferência.");
            return;
        }
        
        const transferItemsList = document.getElementById('transferItemsList');
        if (transferItemsList) {
             transferItemsList.innerHTML = `<p class="text-center text-gray-500">${selectedItemsToTransfer.length} grupo(s) de item selecionado(s) para transferência.</p>`;
        }


        modal.style.display = 'flex';
        
        const checkTargetTableBtn = document.getElementById('checkTargetTableBtn');
        const confirmTransferBtn = document.getElementById('confirmTransferBtn');
        if (confirmTransferBtn) confirmTransferBtn.disabled = true; 

        if (checkTargetTableBtn) {
            checkTargetTableBtn.onclick = () => {
                const targetTable = parseInt(document.getElementById('targetTableInput')?.value);
                const transferStatus = document.getElementById('transferStatus');
                
                if (!targetTable || targetTable === parseInt(currentTableId)) {
                    if (transferStatus) {
                        transferStatus.textContent = 'Mesa inválida ou igual à atual.';
                        transferStatus.classList.remove('hidden');
                    }
                    if (confirmTransferBtn) confirmTransferBtn.disabled = true;
                    return;
                }
                
                // Simulação de verificação
                if (transferStatus) {
                    transferStatus.textContent = `Mesa ${targetTable} verificada.`;
                    transferStatus.classList.remove('hidden');
                }
                if (confirmTransferBtn) confirmTransferBtn.disabled = false;
            };
        }

        if (confirmTransferBtn) {
            confirmTransferBtn.onclick = transferSelectedSentItems;
        }
    };
    // --- FIM FUNÇÕES DE EXCLUSÃO/TRANSFERÊNCIA EM MASSA ---

    // Função de Navegação
    window.goToScreen = (screenId) => {
        if (screenId === 'panelScreen' && currentTableId) {
            saveSelectedItemsToFirebase(currentTableId);
        }
        
        // CORREÇÃO (BUG 3): Desinscreve o listener da mesa ao sair do Painel 2/3, para evitar conflitos ao abrir a próxima mesa.
        if (screenId === 'panelScreen' && currentTableId && unsubscribeTable) {
            unsubscribeTable(); 
            unsubscribeTable = null; 
        }

        const screenMap = screens; 

        const screenIndex = screenMap[screenId];

        if (screenIndex !== undefined) {
            if (appContainer) {
              appContainer.style.transform = `translateX(-${screenIndex * 100}vw)`;
            }
            
            // Lógica para alternar o modo escuro no body para a tela Gerencial
            if (screenId === 'managerScreen') {
                document.body.classList.remove('bg-gray-100');
                document.body.classList.add('bg-gray-900');
            } else {
                document.body.classList.remove('bg-gray-900');
                document.body.classList.add('bg-gray-100');
            }
        }
    };


    // --- FIREBASE PATHS ---
    const getTablesCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'tables');
    const getTableDocRef = (tableNumber) => doc(db, 'artifacts', appId, 'public', 'data', 'tables', tableNumber.toString());
    const getKdsCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'kds_orders');

    // FUNÇÃO PARA SALVAR A LISTA selectedItems NO FIREBASE
    const saveSelectedItemsToFirebase = async (tableId) => {
        if (!tableId) return;

        const tableRef = getTableDocRef(tableId);
        try {
            await updateDoc(tableRef, {
                selectedItems: selectedItems
            });
            console.log(`Itens da mesa ${tableId} salvos com sucesso.`);
        } catch (e) {
            console.error(`Erro ao salvar itens da mesa ${tableId}:`, e);
        }
    }


    // --- FIREBASE INIT ---
    try {
        const firebaseConfig = JSON.parse(window.__firebase_config);
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                showLoginModal();
            } else {
                userId = auth.currentUser?.uid || crypto.randomUUID();
                document.getElementById('user-id-display').textContent = `Usuário ID: ${userId.substring(0, 8)}... (${appId})`;
                hideStatus();
                if (openManagerPanelBtn) {
                    openManagerPanelBtn.classList.remove('hidden');
                }
                loadOpenTables();
                
                await fetchWooCommerceProducts();
                await fetchWooCommerceCategories();
                renderMenu();
                renderPaymentMethodButtons();
            }
        });

    } catch (e) {
        console.error("Erro ao inicializar Firebase: ", e);
        document.getElementById('statusContent').innerHTML = `<h2 class="text-xl font-bold mb-2 text-red-600">Erro de Configuração</h2><p>Verifique as variáveis do Firebase. ${e.message}</p>`;
    }

    // --- FUNÇÕES DE INTEGRAÇÃO WOOCOMMERCE (MANTIDAS) ---
    const fetchWooCommerceData = async (endpoint) => {
        const querySeparator = endpoint.includes('?') ? '&' : '?';
        const url = `${WOOCOMMERCE_URL}/wp-json/wc/v3/${endpoint}${querySeparator}consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                const errorBody = await response.text(); 
                console.error(`Erro ao buscar dados do WooCommerce (${endpoint}):`, errorBody);
                throw new Error(`Erro do WooCommerce: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Falha ao conectar à API do WooCommerce (${endpoint}):`, error);
            return [];
        }
    };

    const fetchWooCommerceCategories = async () => {
        const categories = await fetchWooCommerceData('products/categories');
        WOOCOMMERCE_CATEGORIES = [{ id: 'all', name: 'Todos', slug: 'all' }, ...categories];
        renderCategoryFilters();
    };

    const fetchWooCommerceProducts = async () => {
        const products = await fetchWooCommerceData('products?per_page=100');
        WOOCOMMERCE_PRODUCTS = products.map(p => ({
            id: p.id,
            name: p.name,
            price: parseFloat(p.price),
            category: p.categories.length > 0 ? p.categories[0].slug : 'uncategorized',
            sector: 'cozinha'
        }));
        renderMenu();
    };

    const renderCategoryFilters = () => {
        const categoryFiltersContainer = document.getElementById('categoryFilters');
        if (!categoryFiltersContainer) return;
        
        categoryFiltersContainer.innerHTML = '';
        WOOCOMMERCE_CATEGORIES.forEach(cat => {
            const isActive = cat.slug === 'all' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 border border-gray-300';
            categoryFiltersContainer.innerHTML += `
                <button class="category-btn px-4 py-3 rounded-full text-base font-semibold whitespace-nowrap ${isActive}" data-category="${cat.id === 'all' ? 'all' : cat.slug}">
                    ${cat.name}
                </button>
            `;
        });

        if (categoryFiltersContainer) {
            categoryFiltersContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.category-btn');
                if (btn) {
                    const category = btn.dataset.category;
                    document.querySelectorAll('.category-btn').forEach(b => {
                        b.classList.remove('bg-indigo-600', 'text-white');
                        b.classList.add('bg-white', 'text-gray-700', 'border', 'border-gray-300');
                    });
                    btn.classList.remove('bg-white', 'text-gray-700', 'border', 'border-gray-300');
                    btn.classList.add('bg-indigo-600', 'text-white');
                    
                    renderMenu(category, searchProductInput.value);
                }
            });
        }
    };

    // --- FUNÇÕES DE PAGAMENTO (3) ---

    // Renderiza os botões de método de pagamento
    const renderPaymentMethodButtons = () => {
        if (!paymentMethodButtonsContainer) return;
        paymentMethodButtonsContainer.innerHTML = '';
        PAYMENT_METHODS.forEach(method => {
            paymentMethodButtonsContainer.innerHTML += `
                <button class="payment-method-btn bg-gray-200 text-gray-700 font-bold py-3 rounded-lg hover:bg-gray-300 transition text-base" data-method="${method}">
                    ${method}
                </button>
            `;
        });
    };

    // CORRIGIDO: Função para deletar um pagamento (agora chama autenticação)
    window.deletePayment = async (timestamp) => {
        // Chama o modal de autenticação, passando a ação e o timestamp do pagamento como payload
        window.openManagerAuthModal('deletePayment', timestamp);
    }

    // Calcula o total geral (subtotal + serviço)
    const calculateTotal = (subtotal, applyServiceTax) => {
        const taxRate = applyServiceTax ? 0.10 : 0;
        const serviceValue = subtotal * taxRate;
        const total = subtotal + serviceValue;
        return { total, serviceValue };
    };

    // Função auxiliar para atualizar texto de elemento com verificação de nulo
    const updateText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    // Recalcula e renderiza o resumo de pagamento
    const renderPaymentSummary = () => {
        if (!currentOrderSnapshot) return;

        const tableData = currentOrderSnapshot;
        const subtotal = tableData.total || 0;
        const payments = tableData.payments || [];
        const currentPaymentsTotal = payments.reduce((sum, p) => sum + p.value, 0);

        serviceTaxApplied = tableData.serviceTaxApplied || false;

        const { total: generalTotal, serviceValue } = calculateTotal(subtotal, serviceTaxApplied);
        
        const diners = parseInt(dinersSplitInput.value) || 1;
        const valuePerDiner = generalTotal / diners;

        const remainingBalance = generalTotal - currentPaymentsTotal;
        const isClosed = remainingBalance <= 0;
        const displayBalance = isClosed ? 0 - remainingBalance : remainingBalance;
        
        updateText('orderSubtotalDisplayPayment', formatCurrency(subtotal));
        updateText('orderServiceTaxDisplayPayment', formatCurrency(serviceValue));
        updateText('orderTotalDisplayPayment', formatCurrency(generalTotal));
        updateText('remainingBalanceDisplay', formatCurrency(displayBalance));
        updateText('valuePerDinerDisplay', formatCurrency(valuePerDiner));
        
        const remainingBalanceDisplayEl = document.getElementById('remainingBalanceDisplay');
        if (remainingBalanceDisplayEl) {
            remainingBalanceDisplayEl.classList.toggle('text-red-600', remainingBalance > 0);
            remainingBalanceDisplayEl.classList.toggle('text-green-600', isClosed);
        }
        
        if (toggleServiceTaxBtn) {
            toggleServiceTaxBtn.textContent = serviceTaxApplied ? 'Remover' : 'Aplicar';
            toggleServiceTaxBtn.classList.toggle('bg-gray-400', !serviceTaxApplied);
            toggleServiceTaxBtn.classList.toggle('bg-green-600', serviceTaxApplied);
        }

        if (finalizeOrderBtn) finalizeOrderBtn.disabled = !isClosed;
        if (openNfeModalBtn) openNfeModalBtn.disabled = !isClosed;

        const paymentListEl = document.getElementById('paymentSummaryList');
        if (!paymentListEl) return; 

        paymentListEl.innerHTML = ''; 

        if (payments.length === 0) {
            paymentListEl.innerHTML += `<p class="text-xs text-gray-500 italic p-2">Nenhum pagamento registrado.</p>`;
        } else {
            payments.forEach(p => {
                // CORRIGIDO: Exclusão de pagamento agora exige senha de gerente
                paymentListEl.innerHTML += `
                    <div class="flex justify-between items-center py-1 border-b border-gray-100">
                        <div class="flex flex-col">
                            <span class="text-xs text-gray-700">${p.method}</span>
                            <span class="font-semibold text-sm">${formatCurrency(p.value)}</span>
                        </div>
                        <button class="text-red-500 hover:text-red-700 transition" onclick="deletePayment(${p.timestamp})" title="Excluir Pagamento (Gerente)">
                            <i class="fas fa-trash text-sm"></i>
                        </button>
                    </div>
                `;
            });
        }
        
        if (addPaymentBtn && tableData.currentTotal) addPaymentBtn.disabled = remainingBalance <= 0;
    };


    if (toggleServiceTaxBtn) {
        toggleServiceTaxBtn.addEventListener('click', async () => {
            if (!currentTableId) return;
            const tableRef = getTableDocRef(currentTableId);
            try {
                await updateDoc(tableRef, {
                    serviceTaxApplied: !serviceTaxApplied,
                });
            } catch (e) {
                console.error("Erro ao alternar taxa de serviço:", e);
            }
        });
    }

    if (dinersSplitInput) {
        dinersSplitInput.addEventListener('input', renderPaymentSummary);
    }


    if (addPaymentBtn) {
        addPaymentBtn.addEventListener('click', async () => {
            if (!currentTableId) return;

            const valueRaw = paymentValueInput.value.replace('R$', '').replace('.', '').replace(',', '.').trim();
            const value = parseFloat(valueRaw);
            const methodEl = document.querySelector('.payment-method-btn.active');
            const method = methodEl ? methodEl.dataset.method : null;

            if (!method || value <= 0) {
                alert("Selecione um método e insira um valor válido.");
                return;
            }

            const tableRef = getTableDocRef(currentTableId);
            
            const newPayment = {
                method,
                value,
                timestamp: Date.now(), 
                userId: userId
            };

            try {
                await updateDoc(tableRef, {
                    payments: arrayUnion(newPayment)
                });

                paymentValueInput.value = 'R$ 0,00';
                document.querySelectorAll('.payment-method-btn').forEach(btn => btn.classList.remove('active'));
                addPaymentBtn.disabled = true;

            } catch (e) {
                console.error("Erro ao adicionar pagamento:", e);
            }
        });
    }

    if (paymentMethodButtonsContainer) {
        paymentMethodButtonsContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.payment-method-btn');
            if (btn) {
                document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active', 'bg-indigo-600', 'text-white'));
                btn.classList.add('active', 'bg-indigo-600', 'text-white');
                addPaymentBtn.disabled = false;
            }
        });
    }

    const sendOrderToWooCommerce = async (orderData) => {
        const orderEndpoint = `${WOOCOMMERCE_URL}/wp-json/wc/v3/orders`;
        const headers = {
            'Authorization': `Basic ${btoa(`${CONSUMER_KEY}:${CONSUMER_SECRET}`)}`,
            'Content-Type': 'application/json',
        };

        const wooCommercePayload = {
            payment_method: orderData.payments.length > 0 ? orderData.payments[0].method.toLowerCase() : 'N/A',
            payment_method_title: orderData.payments.length > 0 ? orderData.payments[0].method : 'N/A',
            set_paid: true,
            billing: {
                first_name: "Garçom",
                last_name: "PDV",
                address_1: "Rua do PDV, 123",
                city: "São Paulo",
                state: "SP",
                postcode: "01000-000",
                country: "BR",
                email: "garcom@pdv.com",
                phone: "11999999999"
            },
            line_items: orderData.items.map(item => ({
                product_id: item.id,
                quantity: 1,
                meta_data: [{
                    key: 'Observacao',
                    value: item.note || 'Nenhuma'
                }]
            })),
            shipping_lines: [],
        };
        
        try {
            const response = await fetch(orderEndpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(wooCommercePayload),
            });

            if (!response.ok) {
                const errorBody = await response.json();
                console.error('Erro na API do WooCommerce:', errorBody);
                throw new Error(`Erro do WooCommerce: ${response.status} - ${errorBody.message}`);
            }

            const data = await response.json();
            console.log('WooCommerce API - Resposta de Sucesso:', data);
            alert(`Venda finalizada no WooCommerce! Pedido #${data.id}`);

        } catch (error) {
            console.error('Falha ao enviar pedido para WooCommerce:', error);
            alert(`Falha ao finalizar a venda: ${error.message}`);
        }
    };
    
    const finalizeOrder = async () => {
        if (!currentTableId || !currentOrderSnapshot) return;
        
        const orderData = {
            tableNumber: currentTableId,
            items: currentOrderSnapshot.sentItems,
            payments: currentOrderSnapshot.payments,
            total: currentOrderSnapshot.total,
            serviceTaxApplied: currentOrderSnapshot.serviceTaxApplied,
            source: 'PDV_FATOR'
        };

        try {
            await sendOrderToWooCommerce(orderData); 

            const tableRef = getTableDocRef(currentTableId);
            await updateDoc(tableRef, {
                status: 'closed',
                closedAt: serverTimestamp(),
            });

            currentTableId = null;
            selectedItems = [];
            currentOrderSnapshot = null;
            goToScreen('panelScreen');
        } catch (e) {
            console.error("Erro ao fechar mesa:", e);
        }
    };

    // --- FUNÇÕES DO PAINEL DE MESAS (1 - CORRIGIDO) ---

    const checkInputs = () => {
        const mesaValida = parseInt(mesaInput.value) > 0;
        const pessoasValida = parseInt(pessoasInput.value) > 0;
        if (abrirMesaBtn) {
            abrirMesaBtn.disabled = !(mesaValida && pessoasValida);
        }
    };

    if (mesaInput) mesaInput.addEventListener('input', checkInputs);
    if (pessoasInput) pessoasInput.addEventListener('input', checkInputs);

    if (abrirMesaBtn) {
        abrirMesaBtn.addEventListener('click', async () => {
            const tableNumber = parseInt(mesaInput.value);
            const diners = parseInt(pessoasInput.value);
            const newTableRef = getTableDocRef(tableNumber);

            try {
                await setDoc(newTableRef, {
                    tableNumber: tableNumber,
                    diners: diners,
                    status: 'open',
                    createdAt: serverTimestamp(),
                    total: 0,
                    sentItems: [], 
                    payments: [],
                    serviceTaxApplied: true, // Taxa de serviço ativa por padrão
                    selectedItems: [],
                    lastSentAt: null, // Campo para o timer
                });

                selectedItems = [];

                currentTableId = tableNumber.toString();
                document.getElementById('current-table-number').textContent = `Mesa ${currentTableId}`;
                document.getElementById('payment-table-number').textContent = `Mesa ${currentTableId}`;

                mesaInput.value = '';
                pessoasInput.value = '';
                abrirMesaBtn.disabled = true;
                goToScreen('orderScreen');
            } catch (e) {
                console.error("Erro ao criar nova mesa: ", e);
                document.getElementById('statusContent').innerHTML = `<h2 class="text-xl font-bold mb-2 text-red-600">Erro ao Abrir Mesa</h2><p>Verifique as permissões do Firebase. ${e.message}</p>`;
                if (statusScreen && mainContent) {
                    statusScreen.style.display = 'flex';
                    mainContent.style.display = 'none';
                }
            }
        });
    }

    // NOVO: Lógica de Busca de Mesa
    if (searchTableBtn) {
        searchTableBtn.addEventListener('click', async () => {
            const tableNumber = searchTableInput.value.trim();
            if (!tableNumber || isNaN(parseInt(tableNumber))) {
                alert("Insira um número de mesa válido para buscar.");
                return;
            }

            const tableRef = getTableDocRef(tableNumber);
            const docSnap = await getDoc(tableRef);

            if (docSnap.exists() && docSnap.data().status === 'open') {
                currentTableId = tableNumber;
                document.getElementById('current-table-number').textContent = `Mesa ${currentTableId}`;
                document.getElementById('payment-table-number').textContent = `Mesa ${currentTableId}`;
                
                if (docSnap.data().selectedItems) {
                    selectedItems = docSnap.data().selectedItems;
                } else {
                    selectedItems = [];
                }
                
                renderSelectedItems();
                loadTableOrder(currentTableId); 
                goToScreen('orderScreen');
            } else {
                alert(`A Mesa ${tableNumber} não está aberta.`);
            }
        });
    }

    const renderTables = (docs) => {
        if (!openTablesList || !openTablesCount) return;

        openTablesList.innerHTML = '';
        let count = 0;

        if (docs.length === 0) {
            openTablesList.innerHTML = `<div class="col-span-full text-sm text-gray-500 italic p-4 content-card bg-white">Nenhuma mesa aberta.</div>`;
            openTablesCount.textContent = 0;
            return;
        }

        docs.forEach(doc => {
            const table = doc.data();
            const tableId = doc.id;
            
            if (table.status === 'open') {
                count++;
                const total = table.total || 0;
                const cardColor = total > 0 ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200';
                
                // Lógica do Ícone de Atenção 'Espera'
                const hasEspera = (table.selectedItems || []).some(item => 
                    item.note && item.note.toLowerCase().includes('espera')
                );
                const attentionIconHtml = hasEspera 
                    ? `<i class="fas fa-exclamation-triangle attention-icon" title="Itens em Espera"></i>` 
                    : '';

                // Lógica do Timer (último pedido enviado)
                const lastSentAtTime = table.lastSentAt ? table.lastSentAt : null;
                const timerHtml = lastSentAtTime 
                    ? `<span class="table-timer">Último Pedido: ${formatElapsedTime(lastSentAtTime)}</span>`
                    : `<span class="table-timer">Nenhum pedido enviado</span>`;


                const cardHtml = `
                    <div class="table-card-panel ${cardColor} shadow-md transition-colors duration-200" data-table-id="${tableId}">
                        ${attentionIconHtml}
                        <h3 class="font-bold text-2xl">Mesa ${table.tableNumber}</h3>
                        <p class="text-xs font-light">Pessoas: ${table.diners}</p>
                        <span class="font-bold text-lg mt-2">${formatCurrency(total)}</span>
                        ${timerHtml}
                    </div>
                `;
                openTablesList.innerHTML += cardHtml;
            }
        });

        openTablesCount.textContent = count;
        
        // CORREÇÃO (BUG 2): Remoção do setTimeout/setInterval problemático. O onSnapshot agora é o único motor de atualização.
    };

    const loadOpenTables = () => {
        const tablesCollection = getTablesCollectionRef();
        const q = query(tablesCollection, where('status', '==', 'open'), orderBy('tableNumber', 'asc'));

        // Usa onSnapshot para atualizações em tempo real
        onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs;
            renderTables(docs);
        }, (error) => {
            console.error("Erro ao carregar mesas (onSnapshot):", error);
            if (openTablesList) {
                openTablesList.innerHTML = `<div class="col-span-full text-sm text-red-500 italic p-4 content-card bg-white">Erro ao carregar mesas. Verifique as permissões.</div>`;
            }
        });
    };

    if (openTablesList) {
      openTablesList.addEventListener('click', async (e) => {
        const tableCard = e.target.closest('.table-card-panel');
        if (tableCard) {
            currentTableId = tableCard.dataset.tableId;
            document.getElementById('current-table-number').textContent = `Mesa ${currentTableId}`;
            document.getElementById('payment-table-number').textContent = `Mesa ${currentTableId}`;
            
            const tableRef = getTableDocRef(currentTableId);
            const docSnap = await getDoc(tableRef);
            if (docSnap.exists() && docSnap.data().selectedItems) {
                selectedItems = docSnap.data().selectedItems;
            } else {
                selectedItems = [];
            }
            
            renderSelectedItems();
            loadTableOrder(currentTableId); 
            goToScreen('orderScreen');
        }
    });
    }


    // --- FUNÇÕES DO CARDÁPIO (2) ---
    
    // renderiza os itens do cardápio com botão de adição (MANTIDA)
    const renderMenu = (filter = 'all', search = '') => {
        let filteredItems = WOOCOMMERCE_PRODUCTS;
        
        if (search) {
            const normalizedSearch = search.toLowerCase();
            filteredItems = filteredItems.filter(item => 
                item.name.toLowerCase().includes(normalizedSearch)
            );
        }

        if (filter !== 'all') {
            filteredItems = filteredItems.filter(item => 
                item.category === filter
            );
        }

        if (menuItemsGrid) {
            menuItemsGrid.innerHTML = '';
        }
        
        if (filteredItems.length === 0) {
            if (menuItemsGrid) {
                menuItemsGrid.innerHTML = `<div class="col-span-full text-sm text-gray-500 italic p-4 content-card bg-white">Nenhum produto encontrado.</div>`;
            }
            return;
        }

        filteredItems.forEach(item => {
            const itemHtml = `
                <div class="menu-item bg-white rounded-lg shadow-sm p-3 transition flex flex-col justify-between border border-gray-200">
                    <h4 class="font-bold text-base text-gray-800 text-left mb-1">${item.name}</h4>
                    <div class="flex justify-between items-center mt-2">
                        <p class="text-indigo-600 font-extrabold text-sm">${formatCurrency(item.price)}</p>
                        <button data-item='${JSON.stringify(item).replace(/'/g, '&#39;')}' 
                                class="add-item-btn add-icon-btn bg-green-500 text-white hover:bg-green-600 transition">
                            <i class="fas fa-plus text-lg"></i>
                        </button>
                    </div>
                </div>
            `;
            if (menuItemsGrid) {
                menuItemsGrid.innerHTML += itemHtml;
            }
        });
    };

    if (document.getElementById('categoryFilters')) {
      document.getElementById('categoryFilters').addEventListener('click', (e) => {
        const btn = e.target.closest('.category-btn');
        if (btn) {
            const category = btn.dataset.category;
            document.querySelectorAll('.category-btn').forEach(b => {
                b.classList.remove('bg-indigo-600', 'text-white');
                b.classList.add('bg-white', 'text-gray-700', 'border', 'border-gray-300');
                    });
            btn.classList.remove('bg-white', 'text-gray-700', 'border', 'border-gray-300');
            btn.classList.add('bg-indigo-600', 'text-white');
            
            renderMenu(category, searchProductInput.value);
        }
    });
    }


    const renderSelectedItems = () => {
        if (!openOrderList || !openItemsCount) return;

        openOrderList.innerHTML = '';

        const totalItemsCount = selectedItems.length;

        if (totalItemsCount === 0) {
            openOrderList.innerHTML = `<div class="text-base text-gray-500 italic p-2">Nenhum item selecionado.</div>`;
            if (sendSelectedItemsBtn) sendSelectedItemsBtn.disabled = true;
        } else {
            if (sendSelectedItemsBtn) sendSelectedItemsBtn.disabled = false;
            const groupedItems = selectedItems.reduce((acc, item) => {
                const key = `${item.id}-${item.note || ''}`;
                acc[key] = acc[key] || { ...item, qty: 0, firstIndex: -1 };
                acc[key].qty++;
                if (acc[key].firstIndex === -1) {
                    acc[key].firstIndex = selectedItems.findIndex(i => i.id === item.id && (i.note || '') === (item.note || ''));
                }
                return acc;
            }, {});

            Object.values(groupedItems).forEach((item, index) => {
                const lineTotal = item.qty * item.price;
                const isEspera = item.note && item.note.toLowerCase().includes('espera');
                const obsText = item.note 
                    ? `<span class="italic text-indigo-600 font-normal">(${item.note})</span>` 
                    : `<span class="italic text-gray-500">(Adicionar Obs.)</span>`;
                
                openOrderList.innerHTML += `
                    <div class="flex justify-between items-center bg-gray-50 p-3 rounded-lg shadow-sm" data-item-id="${item.id}" data-item-note="${item.note || ''}">
                        <div class="flex flex-col flex-grow min-w-0 mr-2">
                            <span class="font-semibold text-gray-800">${item.name} (${item.qty}x)</span>
                            <span class="text-sm cursor-pointer ${isEspera ? 'text-yellow-600 font-bold' : ''}" onclick="openObsModal(this)" data-item-id="${item.id}" data-item-note-key="${item.note || ''}">${obsText}</span>
                        </div>

                        <div class="flex items-center space-x-2 flex-shrink-0">
                            <span class="font-bold text-base text-indigo-700">${formatCurrency(lineTotal)}</span>
                            <button class="qty-btn bg-red-500 text-white rounded-full text-lg hover:bg-red-600 transition duration-150" onclick="decreaseLocalItemQuantity('${item.id}', '${item.note || ''}')" title="Remover um">
                                <i class="fas fa-minus"></i>
                            </button>
                            <button class="qty-btn bg-green-500 text-white rounded-full text-lg hover:bg-green-600 transition duration-150" onclick="increaseLocalItemQuantity('${item.id}', '${item.note || ''}')" title="Adicionar um">
                                <i class="fas fa-plus"></i>
                            </button>
                        </div>
                    </div>
                `;
            });
        }

        openItemsCount.textContent = totalItemsCount;
    }

    const addItemToOrder = (item) => {
        if (!currentTableId) {
            alert("Selecione ou abra uma mesa primeiro.");
            return;
        }
        
        selectedItems.push({ ...item, note: '' }); 

        renderSelectedItems();
        
        currentObsGroup = { id: item.id, note: '' };

        if (obsItemName) obsItemName.textContent = item.name;
        if (obsInput) obsInput.value = ''; 
        if (obsModal) {
            obsModal.dataset.itemId = item.id;
            obsModal.dataset.originalNoteKey = '';
            obsModal.style.display = 'flex';
        }
        if (esperaSwitch) esperaSwitch.checked = false; 
    };

    if (menuItemsGrid) {
      menuItemsGrid.addEventListener('click', (e) => {
        const addButton = e.target.closest('.add-item-btn');
        if (addButton) {
            const itemData = JSON.parse(addButton.dataset.item.replace(/&#39;/g, "'"));
            addItemToOrder(itemData);
        }
    });
    }

    if (quickObsButtons) {
        quickObsButtons.addEventListener('click', (e) => {
            const btn = e.target.closest('.quick-obs-btn');
            if (btn) {
                const obsText = btn.textContent.trim();
                if (obsInput) {
                    const currentObs = obsInput.value.trim();
                    if (currentObs === '') {
                        obsInput.value = obsText;
                    } else {
                        const lastChar = currentObs.slice(-1);
                        const separator = (lastChar === ',' || lastChar === ';' || lastChar === ' ' || lastChar === '/') ? '' : ', ';
                        obsInput.value += separator + obsText;
                    }
                }
            }
        });
    }

    window.increaseLocalItemQuantity = (itemId, noteKey) => {
        const itemToCopy = selectedItems.find(item => 
            item.id == itemId && (item.note || '') === noteKey
        );

        if (itemToCopy) {
            selectedItems.push({ ...itemToCopy, note: noteKey });
            renderSelectedItems();
        }
    };

    window.decreaseLocalItemQuantity = (itemId, noteKey) => {
        const index = selectedItems.findIndex(item => 
            item.id == itemId && (item.note || '') === noteKey
        );

        if (index > -1) {
            selectedItems.splice(index, 1);
            renderSelectedItems();
        }
    };

    window.openObsModal = (el) => {
        const itemId = el.dataset.itemId;
        const noteKey = el.dataset.itemNoteKey;
        
        const item = WOOCOMMERCE_PRODUCTS.find(i => i.id == itemId); 
        const currentNote = selectedItems.find(item => 
            item.id == itemId && (item.note || '') === noteKey
        )?.note || '';

        if (item && obsItemName && obsInput && obsModal && esperaSwitch) {
            obsItemName.textContent = item.name;
            obsInput.value = currentNote;
            obsModal.dataset.itemId = itemId;
            obsModal.dataset.originalNoteKey = noteKey;
            
            esperaSwitch.checked = currentNote.toLowerCase().includes('espera');

            obsModal.style.display = 'flex';

            currentObsGroup = { id: itemId, note: noteKey };
        }
    };
    
    if (esperaSwitch) {
        esperaSwitch.addEventListener('change', () => {
        });
    }

    if (saveObsBtn && cancelObsBtn) {
      [saveObsBtn, cancelObsBtn].forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const action = e.target.textContent.trim(); 
            
            if (!currentObsGroup) {
                if (obsModal) obsModal.style.display = 'none';
                return;
            }

            const itemId = currentObsGroup.id;
            const originalNoteKey = currentObsGroup.note;
            let newNote = obsInput.value.trim();

            if (action === 'CANCELAR') {
                if (originalNoteKey === '' && newNote === '') {
                    const indexToRemove = selectedItems.findIndex(item => item.id == itemId && item.note === '');
                    if (indexToRemove !== -1) {
                        selectedItems.splice(index, 1);
                    }
                }
            } else { // SALVAR OBS
                 const isEsperaActive = esperaSwitch.checked;
                const hasEsperaText = newNote.toLowerCase().includes('espera');

                if (isEsperaActive && !hasEsperaText) {
                    newNote += (newNote === '' ? '' : ', ') + 'Espera';
                } else if (!isEsperaActive && hasEsperaText) {
                    newNote = newNote.replace(/(,?\s*Espera)/gi, '').trim();
                }

                if (newNote !== originalNoteKey) {
                    selectedItems = selectedItems.map(item => {
                        if (item.id == itemId && (item.note || '') === originalNoteKey) {
                            return { ...item, note: newNote };
                        }
                        return item;
                    });
                }
            }

            if (obsModal && obsInput) {
                obsModal.style.display = 'none';
                obsInput.value = '';
            }
            currentObsGroup = null;
            renderSelectedItems();
        });
    });
    }


    if (sendSelectedItemsBtn) {
        sendSelectedItemsBtn.addEventListener('click', async () => {
            if (!currentTableId) {
                alert("Selecione ou abra uma mesa primeiro.");
                return;
            }
            if (selectedItems.length === 0) {
                alert("Nenhum item para enviar.");
                return;
            }
            
            const itemsToSend = selectedItems.filter(item => !item.note || !item.note.toLowerCase().includes('espera'));
            const itemsToHold = selectedItems.filter(item => item.note && item.note.toLowerCase().includes('espera'));

            if (itemsToSend.length === 0) {
                alert("Nenhum item pronto para envio (todos estão marcados como 'Esperam').");
                return;
            }

            // A lista local de selectedItems agora é atualizada com a lista de itens a serem retidos (itensToHold)
            selectedItems = [...itemsToHold];

            const itemsGroupedBySector = itemsToSend.reduce((acc, item) => {
                const sector = item.sector;
                const itemToSend = { 
                    id: item.id, 
                    name: item.name, 
                    price: item.price,
                    category: item.category,
                    sector: item.sector,
                    note: item.note || ''
                };
                acc[sector] = acc[sector] || [];
                acc[sector].push(itemToSend);
                return acc;
            }, {});
            
            const kdsOrderRef = doc(getKdsCollectionRef());
            const currentTimestamp = Date.now();
            
            try {
                await setDoc(kdsOrderRef, {
                    orderId: kdsOrderRef.id,
                    tableNumber: parseInt(currentTableId),
                    timestamp: currentTimestamp,
                    sentAt: serverTimestamp(),
                    sectors: itemsGroupedBySector,
                    status: 'pending'
                });

                const tableRef = getTableDocRef(currentTableId);
                
                const itemsForUpdate = itemsToSend.map(item => ({
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    category: item.category,
                    sector: item.sector,
                    note: item.note || '',
                    orderId: kdsOrderRef.id,
                }));
                
                await updateDoc(tableRef, {
                    sentItems: arrayUnion(...itemsForUpdate), 
                    selectedItems: selectedItems,
                    lastSentAt: currentTimestamp // Atualiza o campo de último envio
                });
                
                renderSelectedItems(); 
                alert(`Itens enviados para a produção (KDS). ${itemsToHold.length > 0 ? `(${itemsToHold.length} itens permaneceram em Espera)` : ''}`);

            } catch (e) {
                console.error("Erro ao enviar pedido KDS/Atualizar Mesa:", e);
                alert("Erro ao enviar itens. Tente novamente.");
                selectedItems = [...itemsToSend, ...itemsToHold];
                renderSelectedItems(); 
            }
        });
    }

    if (searchProductInput) {
      searchProductInput.addEventListener('input', (e) => {
        const activeCategoryBtn = document.querySelector('#categoryFilters .bg-indigo-600');
        const activeCategory = activeCategoryBtn ? activeCategoryBtn.dataset.category : 'all';
        renderMenu(activeCategory, e.target.value);
    });
    }


    let unsubscribeTable = null;

    const loadTableOrder = (tableId) => {
        if (unsubscribeTable) unsubscribeTable(); 

        const tableRef = getTableDocRef(tableId);

        unsubscribeTable = onSnapshot(tableRef, (docSnapshot) => {
            if (docSnapshot.exists()) {
                currentOrderSnapshot = docSnapshot.data();
                selectedItems = currentOrderSnapshot.selectedItems || [];
                renderSelectedItems(); 

                renderSentItems();
                renderPaymentSummary(); 
                subscribeToKdsNotifications(tableId); 
            } else {
                console.log(`Mesa ${tableId} não encontrada.`);
                currentOrderSnapshot = null;
                selectedItems = []; 
                renderSelectedItems();
                renderSentItems();
                renderPaymentSummary();
            }
        }, (error) => {
            console.error("Erro ao carregar dados da mesa:", error);
        });
    };

    // CORRIGIDO/NOVO: Adiciona checkboxes e botões de ação em massa
    const renderSentItems = () => {
        const listEl = document.getElementById('reviewItemsList'); 

        if (!currentOrderSnapshot || currentOrderSnapshot.sentItems.length === 0) {
            if (listEl) { 
                listEl.innerHTML = `<div class="text-sm text-gray-500 italic p-2">Nenhum item na conta para revisão.</div>`;
            }
            return;
        }

        if (listEl) listEl.innerHTML = ''; 

        // Agrupa itens, mantendo a chave única para a checkbox (id-note)
        const groupedItems = currentOrderSnapshot.sentItems.reduce((acc, item) => {
            const key = `${item.id}-${item.note || ''}`;
            acc[key] = acc[key] || { ...item, qty: 0, key: key };
            acc[key].qty++;
            return acc;
        }, {});

        let totalRecalculated = 0;
        
        // Adiciona cabeçalho e botões de Ações em Massa
        if (listEl) {
             listEl.innerHTML += `
                <div class="flex justify-between items-center pb-2 border-b border-gray-200 mb-2">
                    <label class="flex items-center space-x-2 text-sm font-semibold text-gray-700">
                        <input type="checkbox" id="selectAllItems" class="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500">
                        <span>Selecionar Todos</span>
                    </label>
                    <div class="flex space-x-2">
                        <button id="massTransferBtn" class="px-2 py-1 text-xs bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition disabled:opacity-50" title="Transferir Itens Selecionados (Gerente)">
                            Transferir (<span id="selectedItemsCount">0</span>)
                        </button>
                        <button id="massDeleteBtn" class="px-2 py-1 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50" title="Excluir Itens Selecionados (Gerente)">
                            Excluir (<span id="selectedItemsCountDelete">0</span>)
                        </button>
                    </div>
                </div>
            `;
        }


        Object.values(groupedItems).forEach((item, index) => {
            const lineTotal = item.qty * item.price;
            totalRecalculated += lineTotal;
            const obsText = item.note ? ` (${item.note})` : '';
            const itemKey = `${item.id}-${item.note || ''}`; // Chave única para o valor do checkbox

            if (listEl) { 
                listEl.innerHTML += `
                    <div class="flex items-center py-2 border-b border-gray-100">
                        <input type="checkbox" class="item-checkbox h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 mr-2" value="${itemKey}">
                        <div class="flex justify-between flex-grow min-w-0">
                            <div class="flex flex-col flex-grow min-w-0 mr-2">
                                <span class="font-semibold text-gray-800">${item.name} (${item.qty}x)</span>
                                <span class="text-xs text-gray-500 truncate">${obsText}</span>
                            </div>
                            <span class="font-bold text-base text-indigo-700 flex-shrink-0">${formatCurrency(lineTotal)}</span>
                        </div>
                    </div>
                `;
            }
        });
        
        // NOTA: A atualização do campo 'total' é agora feita *explicitamente* nas funções de exclusão/transferência, 
        // e este onSnapshot garante a re-renderização completa da tela de pagamento após o commit do batch.
        
        // Adiciona event listeners para os botões e checkboxes
        const massDeleteBtn = document.getElementById('massDeleteBtn');
        const massTransferBtn = document.getElementById('massTransferBtn');
        const selectAllItems = document.getElementById('selectAllItems');
        const itemCheckboxes = document.querySelectorAll('.item-checkbox');
        const selectedItemsCountEl = document.getElementById('selectedItemsCount');
        const selectedItemsCountDeleteEl = document.getElementById('selectedItemsCountDelete');
        
        const updateMassActionButtons = () => {
            const checkedCount = document.querySelectorAll('#reviewItemsList .item-checkbox:checked').length;
            if (massDeleteBtn) massDeleteBtn.disabled = checkedCount === 0;
            if (massTransferBtn) massTransferBtn.disabled = checkedCount === 0;
            if (selectedItemsCountEl) selectedItemsCountEl.textContent = checkedCount;
            if (selectedItemsCountDeleteEl) selectedItemsCountDeleteEl.textContent = checkedCount;
            if (selectAllItems) selectAllItems.checked = checkedCount === itemCheckboxes.length && itemCheckboxes.length > 0;
        };
        
        if (selectAllItems) {
            selectAllItems.addEventListener('change', () => {
                itemCheckboxes.forEach(cb => cb.checked = selectAllItems.checked);
                updateMassActionButtons();
            });
        }
        
        itemCheckboxes.forEach(cb => cb.addEventListener('change', updateMassActionButtons));
        
        if (massDeleteBtn) massDeleteBtn.addEventListener('click', () => openManagerAuthModal('deleteMass'));
        if (massTransferBtn) massTransferBtn.addEventListener('click', () => openManagerAuthModal('openSelectiveTransfer'));
        
        updateMassActionButtons();
    };

    
    let unsubscribeKds = null;
    
    const subscribeToKdsNotifications = (tableId) => {
        if (unsubscribeKds) unsubscribeKds();
        
        const q = query(getKdsCollectionRef(), where('tableNumber', '==', parseInt(tableId)), where('status', '==', 'ready'));

        unsubscribeKds = onSnapshot(q, (snapshot) => {
            if (snapshot.docs.length > 0) {
                const badge = document.getElementById('kds-notification-badge');
                const container = document.getElementById('notification-badge-container');
                if (badge) badge.classList.remove('hidden');
                if (container) container.classList.add('animate-pulse');
            } else {
                const badge = document.getElementById('kds-notification-badge');
                const container = document.getElementById('notification-badge-container');
                if (badge) badge.classList.add('hidden');
                if (container) container.classList.remove('animate-pulse');
            }
        }, (error) => {
            console.error("Erro no listener de notificação KDS:", error);
        });
    };

    const hideStatus = () => {
        if (statusScreen && mainContent) {
            statusScreen.style.display = 'none';
            mainContent.style.display = 'block';
        }
    };

    // Usado para ações de gerente que precisam de senha
    window.openManagerModal = (action, payload = null) => {
        const managerModal = document.getElementById('managerModal');
        if (!managerModal) return; 

        managerModal.innerHTML = `
            <div class="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm">
                <h3 class="text-xl font-bold mb-4 text-red-600">Ação Gerencial Necessária</h3>
                <p class="text-base mb-3">Insira a senha do gerente para prosseguir.</p>
                <input type="password" id="managerPasswordInput" placeholder="Senha (Ex: 1234)" class="w-full p-3 border border-gray-300 rounded-lg focus:ring-red-500 focus:border-red-500 text-base" maxlength="4">
                
                <div class="flex justify-end space-x-3 mt-4">
                    <button class="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition text-base" onclick="document.getElementById('managerModal').style.display='none'">Cancelar</button>
                    <button id="authManagerBtn" class="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-base">Autenticar</button>
                </div>
            </div>
        `;
        managerModal.style.display = 'flex';
        
        document.getElementById('authManagerBtn').onclick = () => {
            const input = document.getElementById('managerPasswordInput');
            if (input && input.value === password) {
                managerModal.style.display = 'none';
                if (action === 'deleteMass') {
                    deleteSelectedSentItems();
                } else if (action === 'openSelectiveTransfer') {
                    openSelectiveTransferModal();
                } else if (action === 'deletePayment') {
                    executeDeletePayment(payload);
                }
            } else {
                alert("Senha incorreta.");
                if (input) input.value = '';
            }
        };
    };

    if (finalizeOrderBtn) finalizeOrderBtn.addEventListener('click', finalizeOrder);
    if (openNfeModalBtn) openNfeModalBtn.addEventListener('click', window.openNfeModal);

    // Garante que o status inicial seja exibido
    if (statusScreen && mainContent) {
        statusScreen.style.display = 'flex';
        mainContent.style.display = 'none';
    }

});
