// CORREÇÃO DE ERRO: Importando as funções diretamente, pois main.js AGORA é um MÓDULO.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    onSnapshot, 
    doc, 
    setDoc, 
    updateDoc, 
    query, 
    where, 
    serverTimestamp, 
    getDoc, 
    arrayRemove, 
    arrayUnion, 
    writeBatch, 
    orderBy,
    limit, // NOVO
    getDocs // NOVO
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// O código é envolvido em DOMContentLoaded para garantir que os elementos HTML existam
document.addEventListener('DOMContentLoaded', () => {

    // --- VARIÁVEIS GLOBAIS ---
    let db, auth, userId;
    // As variáveis de configuração globais (window.__app_id) permanecem
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

    // CORRIGIDO: Função para formatar o tempo (apenas minutos) - Pedido 2
    const formatElapsedTime = (timestamp) => {
        if (!timestamp) return null; // Retorna null se não houver timestamp
        
        // Converte o timestamp para número, caso seja um objeto Timestamp do Firebase
        const timeMs = typeof timestamp.toMillis === 'function' ? timestamp.toMillis() : timestamp;
        
        const now = Date.now();
        const diffMs = now - timeMs;
        
        const seconds = Math.floor(diffMs / 1000);
        const minutes = Math.floor(seconds / 60);

        if (minutes >= 60) {
             const hours = Math.floor(minutes / 60);
             return `${hours}h atrás`;
        } else if (minutes > 0) {
            return `${minutes} min atrás`;
        } else {
            return `agora`;
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
             // Chamamos com window. para garantir acesso global
             window.openManagerAuthModal('goToManagerPanel');
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
    const managerModal = document.getElementById('managerModal');
    if (managerModal) {
        // Usa delegação de evento para o botão de autenticação
        managerModal.addEventListener('click', (e) => {
            const authBtn = e.target.closest('#authManagerBtn');
            if (!authBtn) return;
            
            const input = document.getElementById('managerPasswordInput');
            // A ação a ser executada é armazenada globalmente pelo código HTML
            const { action, payload } = window.__manager_auth_action || {};

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
                } else if (action === 'deletePayment') { // Chamada de exclusão
                    executeDeletePayment(payload); 
                }
                
                window.__manager_auth_action = null; // Limpa a ação
            } else {
                alert("Senha incorreta.");
                if (input) input.value = '';
            }
        });
    }


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
            const appContainer = document.getElementById('appContainer');
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
        // O ERRO FOI CORRIGIDO AO IMPORTAR initializeApp no topo do arquivo.
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

    // CORRIGIDO: Função para renderizar o cardápio (Menu) - MOVENDO PARA CIMA
    const renderMenu = (filterCategory = 'all', filterSearch = '') => {
        if (!menuItemsGrid) return;
        menuItemsGrid.innerHTML = '';

        const searchLower = filterSearch.toLowerCase();
        
        const filteredProducts = WOOCOMMERCE_PRODUCTS.filter(p => {
            const matchesCategory = filterCategory === 'all' || p.category.includes(filterCategory);
            const matchesSearch = !filterSearch || p.name.toLowerCase().includes(searchLower);
            return matchesCategory && matchesSearch;
        });
        
        if (filteredProducts.length === 0) {
            menuItemsGrid.innerHTML = `<div class="col-span-full text-center p-6 text-gray-500 italic">Nenhum produto encontrado.</div>`;
            return;
        }

        filteredProducts.forEach(product => {
            // Adicionado dataset com o produto completo para uso no addItemToSelection
            menuItemsGrid.innerHTML += `
                <div class="product-card bg-white p-4 rounded-xl shadow-md cursor-pointer hover:shadow-lg transition duration-150 border border-gray-200"
                     data-product='${JSON.stringify(product).replace(/'/g, '&#39;')}'
                     onclick='window.addItemToSelection(${JSON.stringify(product).replace(/'/g, '&#39;')})'>
                    <h4 class="font-bold text-base text-gray-800">${product.name}</h4>
                    <p class="text-xs text-gray-500">${product.category} (${product.sector})</p>
                    <span class="font-bold text-lg text-indigo-700 mt-2">${formatCurrency(product.price)}</span>
                </div>
            `;
        });
    };
    
    // fetchWooCommerceProducts foi movida para depois de renderMenu
    const fetchWooCommerceProducts = async () => {
        const products = await fetchWooCommerceData('products?per_page=100');
        WOOCOMMERCE_PRODUCTS = products.map(p => ({
            id: p.id,
            name: p.name,
            price: parseFloat(p.price),
            category: p.categories.length > 0 ? p.categories[0].slug : 'uncategorized',
            sector: 'cozinha' // MOCK: Definindo setor padrão
        }));
        renderMenu(); // Agora renderMenu está definido.
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

    // Atualiza o resumo da conta (Painel 3) e exibe os pagamentos
    const updatePaymentSummary = () => {
        if (!currentOrderSnapshot) return;

        const subtotal = currentOrderSnapshot.total || 0; // Usando 'total' como subtotal
        const isTaxApplied = currentOrderSnapshot.serviceTaxApplied !== false; 
        const { total, serviceValue } = calculateTotal(subtotal, isTaxApplied);
        const diners = parseInt(dinersSplitInput.value) || 1;
        const valuePerDiner = total / diners;
        
        // Atualiza UI
        updateText('payment-table-number', `Mesa ${currentTableId}`);
        updateText('orderSubtotalDisplayPayment', formatCurrency(subtotal));
        updateText('orderServiceTaxDisplayPayment', formatCurrency(serviceValue));
        updateText('orderTotalDisplayPayment', formatCurrency(total));
        updateText('valuePerDinerDisplay', formatCurrency(valuePerDiner));
        
        // Toggle do botão de serviço
        if (toggleServiceTaxBtn) {
            toggleServiceTaxBtn.textContent = isTaxApplied ? 'Remover' : 'Aplicar';
            toggleServiceTaxBtn.classList.toggle('bg-green-600', isTaxApplied);
            toggleServiceTaxBtn.classList.toggle('bg-red-600', !isTaxApplied);
            toggleServiceTaxBtn.classList.toggle('hover:bg-green-700', isTaxApplied);
            toggleServiceTaxBtn.classList.toggle('hover:bg-red-700', !isTaxApplied);
        }

        // Pagamentos Registrados
        const paymentSummaryList = document.getElementById('paymentSummaryList');
        if (paymentSummaryList) {
            const payments = currentOrderSnapshot.payments || [];
            let paidAmount = payments.reduce((sum, p) => sum + (p.value || 0), 0);
            
            paymentSummaryList.innerHTML = '';
            
            if (payments.length === 0) {
                 paymentSummaryList.innerHTML = '<p class="text-xs text-gray-500 italic p-2">Nenhum pagamento registrado.</p>';
            } else {
                payments.forEach(p => {
                    const time = new Date(p.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                    paymentSummaryList.innerHTML += `
                        <div class="flex justify-between items-center py-1 border-b border-gray-100">
                            <span class="text-xs font-semibold text-gray-700">${p.method}: ${formatCurrency(p.value)}</span>
                            <div class="flex items-center space-x-2">
                                <span class="text-xs text-gray-500">${time}</span>
                                <button class="text-red-500 hover:text-red-700 transition" 
                                        onclick="window.openManagerAuthModal('deletePayment', ${p.timestamp})"
                                        title="Excluir Pagamento">
                                    <i class="fas fa-trash-alt text-xs"></i>
                                </button>
                            </div>
                        </div>
                    `;
                });
            }

            // Valor Restante
            const remainingBalance = total - paidAmount;
            const remainingBalanceDisplay = document.getElementById('remainingBalanceDisplay');
            if (remainingBalanceDisplay) {
                remainingBalanceDisplay.textContent = formatCurrency(Math.abs(remainingBalance));
                remainingBalanceDisplay.classList.remove('text-red-600', 'text-green-600', 'text-gray-800');
                if (remainingBalance > 0.01) {
                    remainingBalanceDisplay.classList.add('text-red-600'); // Falta pagar
                } else if (remainingBalance < -0.01) {
                    remainingBalanceDisplay.classList.add('text-green-600'); // Troco
                    remainingBalanceDisplay.textContent = `TROCO: ${formatCurrency(Math.abs(remainingBalance))}`;
                } else {
                    remainingBalanceDisplay.classList.add('text-gray-800'); // Pago
                }
            }
            
            // Habilita/Desabilita Finalizar
            if (finalizeOrderBtn) {
                const canFinalize = remainingBalance <= 0.01 && paidAmount > 0;
                finalizeOrderBtn.disabled = !canFinalize;
            }
        }
        
        // Renderiza lista de itens para revisão
        renderReviewItemsList(currentOrderSnapshot.sentItems || []);
        
        // Garante que o input de valor pago reflita o restante ao entrar
        if (paymentValueInput) {
             const remaining = total - (currentOrderSnapshot.payments || []).reduce((sum, p) => sum + (p.value || 0), 0);
             paymentValueInput.value = currencyMask(Math.max(0, remaining).toFixed(2).replace('.', ''));
        }
    };

    // Renderiza a lista de itens da conta para exclusão/transferência
    const renderReviewItemsList = (items) => {
        const reviewItemsList = document.getElementById('reviewItemsList');
        if (!reviewItemsList) return;

        reviewItemsList.innerHTML = '';

        if (items.length === 0) {
             reviewItemsList.innerHTML = '<div class="text-sm text-gray-500 italic p-2">Nenhum item enviado na conta.</div>';
             return;
        }

        // Agrupa itens enviados por nome, observação, e setor para exibição
        const groupedItems = items.reduce((acc, item) => {
            const key = `${item.id}-${item.name}-${item.note || ''}-${item.sector}`;
            if (!acc[key]) {
                acc[key] = {
                    id: item.id,
                    name: item.name,
                    note: item.note,
                    sector: item.sector,
                    price: item.price,
                    count: 0,
                    totalPrice: 0,
                    // Usamos uma chave composta única para referência
                    checkboxValue: `${item.id}-${item.note || ''}`
                };
            }
            acc[key].count += 1;
            acc[key].totalPrice += item.price;
            return acc;
        }, {});

        // Adiciona cabeçalho e botões de Ações em Massa
        reviewItemsList.innerHTML += `
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

        Object.values(groupedItems).forEach(group => {
            const noteHtml = group.note ? `<p class="text-xs text-gray-500 italic ml-6">Obs: ${group.note}</p>` : '';

            reviewItemsList.innerHTML += `
                <div class="flex items-start justify-between py-2 border-b border-gray-100">
                    <div class="flex items-start space-x-2">
                        <input type="checkbox" class="item-checkbox h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 mr-2" 
                                value="${group.checkboxValue}">
                        <div>
                            <p class="font-semibold text-gray-800">(${group.count}x) ${group.name}</p>
                            ${noteHtml}
                        </div>
                    </div>
                    <span class="font-bold text-gray-700">${formatCurrency(group.totalPrice)}</span>
                </div>
            `;
        });
        
        const totalRecalculated = Object.values(groupedItems).reduce((sum, group) => sum + group.totalPrice, 0);

        if (totalRecalculated !== currentOrderSnapshot.total) {
            const tableRef = getTableDocRef(currentTableId);
            updateDoc(tableRef, { total: totalRecalculated }).catch(e => console.error("Erro ao sincronizar total:", e));
        }
        
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
        
        if (massDeleteBtn) massDeleteBtn.addEventListener('click', () => window.openManagerAuthModal('deleteMass'));
        if (massTransferBtn) massTransferBtn.addEventListener('click', () => window.openManagerAuthModal('openSelectiveTransfer'));
        
        updateMassActionButtons();
    };
    
    // --- EVENT LISTENERS DE PAGAMENTO ---
    if (toggleServiceTaxBtn) {
        toggleServiceTaxBtn.addEventListener('click', async () => {
            if (!currentTableId) return;

            const isTaxApplied = currentOrderSnapshot?.serviceTaxApplied !== false;
            const newStatus = !isTaxApplied;

            const tableRef = getTableDocRef(currentTableId);

            try {
                await updateDoc(tableRef, {
                    serviceTaxApplied: newStatus
                });
                // A atualização da UI será feita pelo onSnapshot
            } catch (e) {
                console.error("Erro ao alternar taxa de serviço:", e);
                alert("Erro ao tentar alterar a taxa de serviço.");
            }
        });
    }
    
    if (dinersSplitInput) {
        dinersSplitInput.addEventListener('change', updatePaymentSummary);
        dinersSplitInput.addEventListener('keyup', updatePaymentSummary);
    }
    
    if (addPaymentBtn) {
        addPaymentBtn.addEventListener('click', async () => {
            if (!currentTableId || !currentOrderSnapshot) return;

            const value = getNumericValueFromCurrency(paymentValueInput.value);
            const selectedMethod = document.querySelector('.payment-method-btn.bg-green-600')?.dataset.method;

            if (value <= 0) {
                alert("Insira um valor de pagamento válido.");
                return;
            }
            if (!selectedMethod) {
                alert("Selecione um método de pagamento.");
                return;
            }

            const newPayment = {
                method: selectedMethod,
                value: value,
                timestamp: Date.now(),
                user: userId
            };
            
            const tableRef = getTableDocRef(currentTableId);

            try {
                await updateDoc(tableRef, {
                    payments: arrayUnion(newPayment)
                });
                
                paymentValueInput.value = currencyMask('000'); // Reseta o input de valor
                document.querySelectorAll('.payment-method-btn').forEach(btn => {
                    btn.classList.remove('bg-green-600', 'text-white');
                    btn.classList.add('bg-gray-200', 'text-gray-700');
                });
                // A atualização da UI será feita pelo onSnapshot
            } catch (e) {
                console.error("Erro ao adicionar pagamento:", e);
                alert("Erro ao tentar adicionar o pagamento.");
            }
        });
    }

    if (paymentMethodButtonsContainer) {
        paymentMethodButtonsContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.payment-method-btn');
            if (btn) {
                document.querySelectorAll('.payment-method-btn').forEach(b => {
                    b.classList.remove('bg-green-600', 'text-white');
                    b.classList.add('bg-gray-200', 'text-gray-700');
                });

                btn.classList.remove('bg-gray-200', 'text-gray-700');
                btn.classList.add('bg-green-600', 'text-white');
            }
        });
    }

    if (finalizeOrderBtn) {
        finalizeOrderBtn.addEventListener('click', async () => {
            if (!currentTableId || !currentOrderSnapshot) return;

            if (!confirm(`Confirmar o fechamento da Mesa ${currentTableId}?`)) return;

            const tableRef = getTableDocRef(currentTableId);

            try {
                await updateDoc(tableRef, {
                    status: 'closed',
                    closedAt: serverTimestamp()
                });

                alert(`Mesa ${currentTableId} finalizada com sucesso!`);
                
                // Limpa o estado local
                currentTableId = null;
                selectedItems = [];
                currentOrderSnapshot = null;

                goToScreen('panelScreen');
            } catch (e) {
                console.error("Erro ao finalizar conta:", e);
                alert("Erro ao tentar finalizar a conta.");
            }
        });
    }

    // --- FUNÇÕES DE MESA ---
    let unsubscribeTable = null; 

    // Função que renderiza as mesas abertas (Painel 1)
    const renderTables = (docs) => {
        if (!openTablesList || !openTablesCount) return;

        openTablesList.innerHTML = '';
        let count = 0;

        docs.forEach(doc => {
            const table = doc.data();
            const tableId = doc.id;
            
            if (table.status === 'open') {
                count++;
                const total = table.total || 0;
                const cardColor = total > 0 ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200';

                // NOVO: Lógica para o ícone de Espera (Pedido 1)
                const hasAguardandoItem = (table.selectedItems || []).some(item => 
                    item.note && item.note.toLowerCase().includes('espera')
                );
                const attentionIconHtml = hasAguardandoItem 
                    ? `<i class="fas fa-exclamation-triangle attention-icon text-yellow-600 absolute top-2 left-2" title="Itens em Espera"></i>` 
                    : '';
                
                // NOVO: Lógica para o Timer (Pedido 2)
                let timerHtml = '';
                // Assume que table.lastKdsSentAt é um Timestamp (se existir)
                const lastSentAt = table.lastKdsSentAt?.toMillis() || null;
                const elapsedTime = lastSentAt ? formatElapsedTime(lastSentAt) : 'N/A';
                
                if (lastSentAt) {
                    timerHtml = `
                        <div class="table-timer flex items-center justify-center space-x-1 mt-1 text-sm text-gray-500">
                            <i class="fas fa-clock"></i> 
                            <span>Último pedido: ${elapsedTime}</span>
                        </div>
                    `;
                }
                
                // NOVO: Lógica para o Status KDS (Pedido 3)
                // O botão só aparece se houver um pedido enviado (lastSentAt)
                const statusIconHtml = lastSentAt ? `
                    <button class="status-icon-btn absolute bottom-0 right-0 p-2 text-indigo-500 hover:text-indigo-700 transition" 
                            title="Status do Último Pedido"
                            onclick="window.openKdsStatusModal(${tableId})">
                        <i class="fas fa-tasks"></i>
                    </button>
                ` : '';

                const cardHtml = `
                    <div class="table-card-panel ${cardColor} shadow-md transition-colors duration-200 relative" data-table-id="${tableId}">
                        ${attentionIconHtml}
                        <h3 class="font-bold text-2xl">Mesa ${table.tableNumber}</h3>
                        <p class="text-xs font-light">Pessoas: ${table.diners}</p>
                        <span class="font-bold text-lg mt-2">${formatCurrency(total)}</span>
                        ${timerHtml}
                        ${statusIconHtml} </div>
                `;
                openTablesList.innerHTML += cardHtml;
            }
        });

        openTablesCount.textContent = count;
        
        // Adiciona listener para abrir a mesa no Painel 2
        document.querySelectorAll('.table-card-panel').forEach(card => {
            card.addEventListener('click', (e) => {
                // Impede que o clique no ícone de status abra a mesa
                if (e.target.closest('.status-icon-btn')) {
                    return; 
                }
                const tableId = card.dataset.tableId;
                if (tableId) {
                    openTableForOrder(tableId);
                }
            });
        });
    };

    // Função que carrega as mesas abertas
    const loadOpenTables = () => {
        const tablesRef = getTablesCollectionRef();
        // ESTA QUERY REQUER UM ÍNDICE COMPOSTO NO FIRESTORE
        const q = query(tablesRef, where('status', '==', 'open'), orderBy('createdAt', 'desc'));

        onSnapshot(q, (snapshot) => {
            renderTables(snapshot.docs);
        }, (error) => {
            // O erro do índice do Firebase é capturado aqui
            console.error("Erro ao carregar mesas abertas:", error);
            document.getElementById('openTablesList').innerHTML = `<div class="col-span-full text-sm text-red-500 italic p-4 content-card bg-white">Erro ao carregar mesas. ${error.code === 'failed-precondition' ? 'Falta o índice no Firestore. Crie-o via console.' : 'Verifique a conexão.'}</div>`;
        });
    };
    
    // Função para abrir a mesa no Painel 2 (Pedido)
    const openTableForOrder = (tableId) => {
        currentTableId = tableId;
        selectedItems = []; // Reseta a lista de itens selecionados (novos)
        document.getElementById('current-table-number').textContent = `Mesa ${tableId}`;
        
        goToScreen('orderScreen');
        
        // Inicia o listener em tempo real para a mesa selecionada
        const tableRef = getTableDocRef(tableId);
        
        if (unsubscribeTable) {
            unsubscribeTable(); // Desinscreve o listener anterior
        }

        unsubscribeTable = onSnapshot(tableRef, (doc) => {
            if (doc.exists()) {
                currentOrderSnapshot = doc.data();
                renderOrderScreen(currentOrderSnapshot);
            } else {
                // A mesa foi fechada/deletada
                alert(`A Mesa ${tableId} foi fechada.`);
                goToScreen('panelScreen');
                currentTableId = null;
                currentOrderSnapshot = null;
                selectedItems = [];
                if (unsubscribeTable) {
                    unsubscribeTable();
                    unsubscribeTable = null;
                }
            }
        }, (error) => {
            console.error("Erro no listener da mesa:", error);
        });
    };

    // Função para criar uma nova mesa
    if (abrirMesaBtn) {
        abrirMesaBtn.addEventListener('click', async () => {
            const tableNumber = mesaInput.value.trim();
            const diners = pessoasInput.value.trim();

            if (!tableNumber || !diners || parseInt(tableNumber) <= 0 || parseInt(diners) <= 0) {
                alert('Preencha o número da mesa e a quantidade de pessoas corretamente.');
                return;
            }

            const tableRef = getTableDocRef(tableNumber);

            try {
                const docSnap = await getDoc(tableRef);

                if (docSnap.exists() && docSnap.data().status === 'open') {
                    alert(`A Mesa ${tableNumber} já está aberta!`);
                    mesaInput.value = '';
                    pessoasInput.value = '';
                    return;
                }

                await setDoc(tableRef, {
                    tableNumber: parseInt(tableNumber),
                    diners: parseInt(diners),
                    status: 'open',
                    createdAt: serverTimestamp(),
                    selectedItems: [], // Itens selecionados para envio
                    sentItems: [],     // Itens já enviados (na conta)
                    payments: [],      // Pagamentos efetuados
                    total: 0,          // Valor total (subtotal)
                    serviceTaxApplied: true, // Taxa de serviço por padrão
                    lastKdsSentAt: null // NOVO: Timestamp do último envio KDS
                });
                
                alert(`Mesa ${tableNumber} aberta com sucesso!`);
                
                // Limpa os inputs e move para a tela de pedidos
                openTableForOrder(tableNumber);
                mesaInput.value = '';
                pessoasInput.value = '';

            } catch (e) {
                console.error("Erro ao abrir mesa:", e);
                alert("Erro ao tentar abrir a mesa.");
            }
        });
    }

    // Função de busca de mesa
    if (searchTableBtn) {
        searchTableBtn.addEventListener('click', () => {
            const tableId = searchTableInput.value.trim();
            if (tableId) {
                 const card = document.querySelector(`.table-card-panel[data-table-id="${tableId}"]`);
                 if (card) {
                     card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                     card.classList.add('animate-pulse', 'border-4', 'border-indigo-500');
                     setTimeout(() => {
                         card.classList.remove('animate-pulse', 'border-4', 'border-indigo-500');
                     }, 3000);
                 } else {
                     alert(`Mesa ${tableId} não encontrada ou não está aberta.`);
                 }
            }
        });
    }


    // --- FUNÇÕES DE PEDIDO (PAINEL 2) ---
    // Renderiza a lista de itens selecionados (novos) e itens na conta (enviados)
    const renderOrderScreen = (tableData) => {
        if (!tableData) return;

        // Renderiza Itens Selecionados (novos)
        selectedItems = tableData.selectedItems || [];
        const openItemsCount = selectedItems.length;
        const sendBtn = document.getElementById('sendSelectedItemsBtn');
        
        updateText('openItemsCount', openItemsCount);
        if (sendBtn) sendBtn.disabled = openItemsCount === 0;

        if (openOrderList) {
            openOrderList.innerHTML = '';
            if (openItemsCount === 0) {
                 openOrderList.innerHTML = '<div class="text-base text-gray-500 italic p-2">Nenhum item selecionado.</div>';
            } else {
                // Agrupamento é feito por ID do item + nota para visualização
                const groupedItems = selectedItems.reduce((acc, item, index) => {
                    const key = `${item.id}-${item.note || ''}`;
                    if (!acc[key]) {
                        acc[key] = { ...item, count: 0, firstIndex: index };
                    }
                    acc[key].count++;
                    return acc;
                }, {});

                Object.values(groupedItems).forEach(group => {
                    const noteText = group.note || '';
                    const isEspera = noteText.toLowerCase().includes('espera');
                    const obsText = noteText 
                        ? `<span class="italic text-indigo-600 font-normal">(${noteText})</span>` 
                        : `<span class="italic text-gray-500">(Adicionar Obs.)</span>`;
                    
                    openOrderList.innerHTML += `
                        <div class="flex justify-between items-center bg-gray-50 p-3 rounded-lg shadow-sm">
                            <div class="flex flex-col flex-grow min-w-0 mr-2">
                                <span class="font-semibold text-gray-800">${group.name} (${group.count}x)</span>
                                <span class="text-sm cursor-pointer ${isEspera ? 'text-yellow-600 font-bold' : ''}" onclick="window.openObsModalForGroup('${group.id}', '${group.note || ''}')">${obsText}</span>
                            </div>

                            <div class="flex items-center space-x-2 flex-shrink-0">
                                <button class="qty-btn bg-red-500 text-white rounded-full text-lg hover:bg-red-600 transition duration-150" onclick="window.decreaseLocalItemQuantity('${group.id}', '${group.note || ''}')" title="Remover um">
                                    <i class="fas fa-minus"></i>
                                </button>
                                <button class="qty-btn bg-green-500 text-white rounded-full text-lg hover:bg-green-600 transition duration-150" onclick="window.increaseLocalItemQuantity('${group.id}', '${group.note || ''}')" title="Adicionar um">
                                    <i class="fas fa-plus"></i>
                                </button>
                            </div>
                        </div>
                    `;
                });
            }
        }
    };

    // Funções de ajuste de quantidade local para itens selecionados
    window.increaseLocalItemQuantity = (itemId, noteKey) => {
        // Encontra um item no grupo para replicar
        const itemToCopy = selectedItems.find(item => 
            item.id == itemId && (item.note || '') === noteKey
        );

        if (itemToCopy) {
            // Cria uma cópia limpa antes de adicionar para não vazar propriedades
            const newItem = {
                id: itemToCopy.id,
                name: itemToCopy.name,
                price: itemToCopy.price,
                sector: itemToCopy.sector, 
                note: itemToCopy.note,
            };
            selectedItems.push(newItem);
            renderOrderScreen(currentOrderSnapshot);
            saveSelectedItemsToFirebase(currentTableId);
        }
    };

    window.decreaseLocalItemQuantity = (itemId, noteKey) => {
        const indexToRemove = selectedItems.findIndex(item => 
            item.id == itemId && (item.note || '') === noteKey
        );

        if (indexToRemove > -1) {
            selectedItems.splice(indexToRemove, 1);
            renderOrderScreen(currentOrderSnapshot);
            saveSelectedItemsToFirebase(currentTableId);
        }
    };
    
    window.openObsModalForGroup = (itemId, noteKey) => {
        const item = WOOCOMMERCE_PRODUCTS.find(i => i.id == itemId); 
        
        if (item && obsItemName && obsInput && obsModal && esperaSwitch) {
            obsItemName.textContent = item.name;
            obsInput.value = noteKey.replace(' [EM ESPERA]', '').trim(); // Remove a tag visual para edição
            
            // Armazena a chave do grupo para a ação de salvar
            obsModal.dataset.itemId = itemId;
            obsModal.dataset.originalNoteKey = noteKey;
            
            const isAguardando = noteKey.toLowerCase().includes('espera');
            esperaSwitch.checked = isAguardando;

            obsModal.style.display = 'flex';
        }
    };


    // Adiciona um item (produto) à lista de itens selecionados
    window.addItemToSelection = (product) => {
        if (!currentTableId) {
            alert("Selecione ou abra uma mesa primeiro.");
            return;
        }

        const newItem = {
            id: product.id,
            name: product.name,
            price: product.price,
            sector: product.sector, // Cozinha/Bar
            note: ''
        };
        
        selectedItems.push(newItem); 

        renderOrderScreen(currentOrderSnapshot);
        saveSelectedItemsToFirebase(currentTableId); 

        // Abre o modal de observação para o item recém-adicionado
        const lastItem = selectedItems[selectedItems.length - 1];
        if (lastItem) {
            window.openObsModalForGroup(lastItem.id, lastItem.note || '');
            // Armazena a chave para que o CANCELAR remova o item se nenhuma obs for salva.
            obsModal.dataset.originalNoteKey = '';
        }
    };

    // Função de clique no botão de menu (no HTML)
    if (menuItemsGrid) {
        menuItemsGrid.addEventListener('click', (e) => {
            const productCard = e.target.closest('.product-card');
            if (productCard && productCard.dataset.product) {
                // CORREÇÃO: Usa o dado completo do produto
                const product = JSON.parse(productCard.dataset.product.replace(/&#39;/g, "'"));
                window.addItemToSelection(product);
            }
        });
    }

    // Função para adicionar observação rápida
    window.appendObs = (text) => {
        const currentNote = obsInput.value.trim();
        const separator = currentNote && !currentNote.endsWith('.') ? '. ' : '';
        obsInput.value = currentNote + separator + text;
    };


    // Salva a observação e fecha o modal
    if (saveObsBtn && cancelObsBtn) {
        saveObsBtn.addEventListener('click', () => {
            const itemId = obsModal.dataset.itemId;
            const originalNoteKey = obsModal.dataset.originalNoteKey; // key vazia se for um item novo
            let newNote = obsInput.value.trim();
            const isEsperaActive = esperaSwitch.checked;
            const esperaTag = ' [EM ESPERA]';

            // Remove a tag de qualquer lugar para começar com a nota limpa
            const noteCleaned = newNote.replace(esperaTag, '').trim();

            if (isEsperaActive) {
                // Adiciona a tag no final se o switch estiver ligado
                newNote = (noteCleaned + esperaTag).trim();
            } else {
                newNote = noteCleaned;
            }

            // Mapeia para atualizar o grupo de itens na lista
            selectedItems = selectedItems.map(item => {
                if (item.id == itemId && (item.note || '') === originalNoteKey) {
                    return { ...item, note: newNote };
                }
                return item;
            });

            obsModal.style.display = 'none';
            renderOrderScreen(currentOrderSnapshot);
            saveSelectedItemsToFirebase(currentTableId);
        });

        cancelObsBtn.addEventListener('click', () => {
            const itemId = obsModal.dataset.itemId;
            const originalNoteKey = obsModal.dataset.originalNoteKey; 

            // Se o item foi adicionado e o modal aberto imediatamente (originalNoteKey é vazia),
            // o cancelamento deve remover o item.
            if (originalNoteKey === '') {
                const indexToRemove = selectedItems.findIndex(item => item.id == itemId && item.note === '');
                if (indexToRemove !== -1) {
                    selectedItems.splice(indexToRemove, 1);
                }
            }

            obsModal.style.display = 'none';
            renderOrderScreen(currentOrderSnapshot);
            saveSelectedItemsToFirebase(currentTableId);
        });
    }


    // Envia os itens selecionados para a conta e KDS (MARCHA)
    if (sendSelectedItemsBtn) {
        sendSelectedItemsBtn.addEventListener('click', async () => {
            if (!currentTableId || selectedItems.length === 0) return;

            if (!confirm(`Confirmar o envio de ${selectedItems.length} item(s) para a produção (KDS)?`)) return;
            
            // Itens a serem movidos para sentItems
            const itemsToSend = selectedItems.map(item => ({
                ...item,
                sentAt: Date.now(),
                sentBy: userId
            }));

            // 1. Calcular o novo total
            const itemsToSendValue = calculateItemsValue(itemsToSend);
            const currentTotal = currentOrderSnapshot.total || 0;
            const newTotal = currentTotal + itemsToSendValue;

            // 2. Agrupar por setor para o KDS (Simulação)
            const itemsGroupedBySector = itemsToSend.reduce((acc, item) => {
                if (!acc[item.sector]) {
                    acc[item.sector] = [];
                }
                acc[item.sector].push({
                    name: item.name,
                    note: item.note,
                    price: item.price
                });
                return acc;
            }, {});

            // 3. Gravar o pedido KDS (Simulação de criação de documento)
            const kdsOrderRef = doc(getKdsCollectionRef());
            await setDoc(kdsOrderRef, {
                orderId: kdsOrderRef.id,
                tableNumber: parseInt(currentTableId),
                timestamp: Date.now(),
                sentAt: serverTimestamp(),
                sectors: itemsGroupedBySector,
                status: 'pending',
                statusHistory: [{ status: 'pending', timestamp: Date.now(), user: userId }] // NOVO: Incluir status inicial
            });

            // 4. Atualizar o documento da mesa
            const tableRef = getTableDocRef(currentTableId);
            
            const itemsForUpdate = itemsToSend.map(item => ({
                id: item.id,
                name: item.name,
                price: item.price,
                sector: item.sector,
                note: item.note,
                sentAt: item.sentAt, // timestamp em número
                sentBy: item.sentBy,
                kdsId: kdsOrderRef.id // Referência ao pedido KDS
            }));

            try {
                await updateDoc(tableRef, {
                    sentItems: arrayUnion(...itemsForUpdate), // Adiciona à lista de itens na conta
                    selectedItems: [], // Limpa os itens selecionados (novos)
                    total: newTotal,   // Atualiza o total
                    lastKdsSentAt: serverTimestamp() // NOVO: Timestamp do último envio
                });
                
                alert(`Pedido enviado para a produção! Total da conta: ${formatCurrency(newTotal)}`);
                
                // O listener da mesa (onSnapshot) irá atualizar a tela automaticamente.
            } catch (e) {
                console.error("Erro ao enviar itens:", e);
                alert("Erro ao tentar enviar o pedido para o KDS.");
            }
        });
    }

    // --- FUNÇÕES KDS STATUS (PEDIDO 3) ---

    // Define KDS statuses e correspondentes colors/icons
    const KDS_STATUSES = [
        { key: 'pending', label: 'Pendente', color: 'text-gray-500', icon: 'fa-hourglass-start' },
        { key: 'received', label: 'Recebido', color: 'text-blue-500', icon: 'fa-box' },
        { key: 'accepted', label: 'Aceito', color: 'text-green-500', icon: 'fa-check-circle' },
        { key: 'refused', label: 'Recusado', color: 'text-red-500', icon: 'fa-times-circle' },
        { key: 'in_prep', label: 'Em Preparo', color: 'text-yellow-500', icon: 'fa-fire' },
        { key: 'ready', label: 'Finalizado', color: 'text-indigo-500', icon: 'fa-bell' },
        { key: 'delivered', label: 'Entregue', color: 'text-gray-500', icon: 'fa-handshake' },
    ];
    
    // Helper para obter o documento KDS
    const getKdsDocRef = (kdsId) => doc(getKdsCollectionRef(), kdsId);


    window.openKdsStatusModal = async (tableId) => {
        const modal = document.getElementById('kdsStatusModal');
        if (!modal) return;
        
        const content = document.getElementById('kdsStatusContent');
        if (!content) return;
        
        // Exibe loading e o modal
        content.innerHTML = `<i class="fas fa-spinner fa-spin text-4xl text-indigo-500 mb-4"></i><p class="text-gray-600">Carregando status do último pedido...</p>`;
        modal.style.display = 'flex';

        try {
            // Encontra o KDS mais recente para esta mesa
            const q = query(getKdsCollectionRef(), 
                            where('tableNumber', '==', parseInt(tableId)), 
                            orderBy('sentAt', 'desc'), 
                            limit(1));
                            
            const snapshot = await getDocs(q); 
            
            if (snapshot.empty) {
                content.innerHTML = `<h3 class="text-xl font-bold mb-4 text-indigo-700">Mesa ${tableId}</h3><p>Nenhum pedido recente enviado à produção.</p>`;
                return;
            }
            
            const kdsDoc = snapshot.docs[0];
            const kdsData = kdsDoc.data();
            const kdsId = kdsDoc.id;
            const history = kdsData.statusHistory || [];
            
            let statusHistoryHtml = '';
            
            // Reversa a ordem para mostrar o status mais recente no topo (efeito sanfona reverso/cronológico)
            const reversedStatuses = [...KDS_STATUSES].reverse();
            
            reversedStatuses.forEach(statusDef => {
                const historyEntry = history.find(h => h.status === statusDef.key);
                const isChecked = !!historyEntry;
                const isDelivered = statusDef.key === 'delivered';
                const isReady = statusDef.key === 'ready';

                const time = historyEntry?.timestamp || null;
                const timeString = time 
                    ? new Date(time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    : 'Aguardando';
                
                // O checkbox é apenas visual, a ação é feita pelo botão no rodapé
                const checkboxHtml = `
                    <input type="checkbox" class="kds-status-checkbox h-4 w-4 ${isChecked ? 'text-green-600' : 'text-gray-300'} border-gray-300 rounded focus:ring-green-500 cursor-not-allowed" 
                                ${isChecked ? 'checked' : ''} disabled>`;
                
                const timeColor = isChecked ? 'text-gray-700 font-semibold' : 'text-gray-400';
                
                statusHistoryHtml = `
                    <div class="flex items-center justify-between py-2 border-b border-gray-100 ${isChecked ? 'bg-green-50' : ''}">
                        <div class="flex items-center space-x-3">
                            ${checkboxHtml}
                            <i class="fas fa-lg ${statusDef.icon} ${statusDef.color}"></i>
                            <span class="font-semibold text-gray-700">${statusDef.label}</span>
                        </div>
                        <span class="text-xs font-mono ${timeColor}">${timeString}</span>
                    </div>
                ` + statusHistoryHtml; // Prepend para ordem reversa
            });
            
            const isDelivered = history.some(h => h.status === 'delivered');
            const isReady = history.some(h => h.status === 'ready');

            content.innerHTML = `
                <h3 class="text-xl font-bold mb-4 text-indigo-700">Status Pedido #${kdsId.substring(0, 8)} - Mesa ${tableId}</h3>
                <div class="max-h-80 overflow-y-auto space-y-2 p-2 border border-gray-200 rounded-lg bg-gray-50">
                    ${statusHistoryHtml}
                </div>
                <div class="mt-4 flex justify-end">
                    <button id="updateDeliveredStatusBtn" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-base disabled:opacity-50" 
                            data-kds-id="${kdsId}" 
                            data-table-id="${tableId}"
                            data-is-delivered="${isDelivered}"
                            ${isDelivered || !isReady ? 'disabled' : ''}>
                        ${isDelivered ? 'ENTREGUE (OK)' : 'MARCAR COMO ENTREGUE'}
                    </button>
                </div>
            `;
            
            // Adiciona listener para o botão de Entregue
            document.getElementById('updateDeliveredStatusBtn').addEventListener('click', handleDeliveredUpdate);
            
        } catch (e) {
            console.error("Erro ao carregar status KDS:", e);
            content.innerHTML = `<h3 class="text-xl font-bold mb-4 text-red-600">Erro</h3><p>Falha ao carregar status do KDS: ${e.message}</p>`;
        }
    }
    
    // Função para lidar com a atualização do status 'Entregue'
    const handleDeliveredUpdate = async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        
        const kdsId = btn.dataset.kdsId;
        const tableId = btn.dataset.tableId;
        const isDelivered = btn.dataset.isDelivered === 'true';
        
        if (isDelivered || btn.disabled) {
            return;
        }

        if (confirm(`Confirmar que todos os itens do Pedido #${kdsId.substring(0, 8)} para a Mesa ${tableId} foram entregues ao cliente?`)) {
            const kdsRef = getKdsDocRef(kdsId);
            const newHistoryEntry = { 
                status: 'delivered', 
                timestamp: Date.now(), 
                user: userId 
            };
            
            try {
                // Desabilita o botão para evitar cliques duplos
                btn.disabled = true;
                btn.textContent = 'Atualizando...';

                await updateDoc(kdsRef, {
                    status: 'delivered', // Atualiza o status principal
                    statusHistory: arrayUnion(newHistoryEntry)
                });
                
                alert("Status 'Entregue' atualizado com sucesso!");
                // Reabre o modal para atualizar o visual
                window.openKdsStatusModal(tableId); 
                
            } catch (error) {
                console.error("Erro ao atualizar status KDS:", error);
                alert("Erro ao tentar atualizar o status. Tente novamente.");
                // Em caso de erro, reabilita e restaura o texto
                btn.disabled = false;
                btn.textContent = 'MARCAR COMO ENTREGUE';
            }
        }
    }
    
    // Define a função hideStatus
    const hideStatus = () => {
        if (statusScreen && mainContent) {
            statusScreen.style.display = 'none';
            mainContent.style.display = 'block';
        }
    };
    
    // Inicia a aplicação exibindo a tela de status/loading
    if (statusScreen && mainContent) {
        statusScreen.style.display = 'flex';
        mainContent.style.display = 'none';
    }
});
