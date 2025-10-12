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


// O código é envolvido em DOMContentLoaded para garantir que os elementos HTML existam
document.addEventListener('DOMContentLoaded', () => {

    // --- VARIÁVEIS GLOBAIS ---
    let db, auth, userId;
    const appId = window.__app_id;
    let currentTableId = null;
    let selectedItems = []; // Itens selecionados na UI antes de enviar (lista de anotações)
    let currentOrderSnapshot = null; // Último estado da mesa no Firebase
    let serviceTaxApplied = false;
    let currentPayments = []; // Pagamentos registrados localmente

    // --- MAPAS DE REFERÊNCIA ---
    const screens = { 'panelScreen': 0, 'orderScreen': 1, 'paymentScreen': 2 };
    const MENU_DATA = [
        { id: 'item1', name: 'Cheeseburger Clássico', price: 35.90, category: 'main', sector: 'cozinha' },
        { id: 'item2', name: 'Refrigerante Cola Lata', price: 7.50, category: 'drinks', sector: 'bar' },
        { id: 'item3', name: 'Batata Frita Média', price: 18.00, category: 'main', sector: 'cozinha' },
        { id: 'item4', name: 'Suco Natural Laranja', price: 12.00, category: 'drinks', sector: 'bar' },
        { id: 'item5', name: 'Pudim de Leite', price: 15.00, category: 'desserts', sector: 'cozinha' },
    ];
    const password = '1234'; // Senha simulada de gerente

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
    const openActionsModalBtn = document.getElementById('openActionsModalBtn');


    // --- UTILS ---
    const formatCurrency = (value) => `R$ ${parseFloat(value || 0).toFixed(2).replace('.', ',')}`;

    // Máscara de Moeda (da esquerda para a direita)
    const currencyMask = (input) => {
        let value = input.replace(/\D/g, "");
        if (value.length > 2) {
            value = value.padStart(3, '0');
        } else if (value.length < 3) {
            value = value.padStart(3, '0');
        }
        
        const integerPart = value.substring(0, value.length - 2);
        const decimalPart = value.substring(value.length - 2);

        return `R$ ${parseInt(integerPart).toLocaleString('pt-BR')},${decimalPart}`;
    };

    // Event handler para máscara (garante apenas números e formata)
    paymentValueInput.addEventListener('input', (e) => {
        const cursorStart = e.target.selectionStart;
        const rawValue = e.target.value.replace(/\D/g, ''); // Remove tudo que não for dígito
        
        // Aplica a máscara e atualiza o campo
        e.target.value = currencyMask(rawValue);

        // Tenta manter o cursor no final da parte digitada
        const newCursorPos = e.target.value.length;
        e.target.setSelectionRange(newCursorPos, newCursorPos);
    });

    // Função de Navegação
    window.goToScreen = (screenId) => {
        const screenIndex = screens[screenId];
        if (screenIndex !== undefined) {
            appContainer.style.transform = `translateX(-${screenIndex * 100}vw)`;
        }
    };

    // --- FIREBASE PATHS ---
    const getTablesCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'tables');
    const getTableDocRef = (tableNumber) => doc(db, 'artifacts', appId, 'public', 'data', 'tables', tableNumber.toString());
    const getKdsCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'kds_orders');
    const getManagerCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'manager_logs');


    // --- FIREBASE INIT ---
    try {
        const firebaseConfig = JSON.parse(window.__firebase_config);
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                if (window.__initial_auth_token) {
                    try {
                        await signInWithCustomToken(auth, window.__initial_auth_token);
                    } catch (tokenError) {
                        await signInAnonymously(auth);
                    }
                } else {
                    await signInAnonymously(auth);
                }
            }
            userId = auth.currentUser?.uid || crypto.randomUUID();
            document.getElementById('user-id-display').textContent = `Usuário ID: ${userId.substring(0, 8)}... (${appId})`;
            hideStatus();
            loadOpenTables();
            renderMenu();
        });

    } catch (e) {
        console.error("Erro ao inicializar Firebase: ", e);
        // Atualiza a tela de status com a mensagem de erro detalhada
        document.getElementById('statusContent').innerHTML = `<h2 class="text-xl font-bold mb-2 text-red-600">Erro de Configuração</h2><p>Verifique as variáveis do Firebase. ${e.message}</p>`;
    }


    // --- FUNÇÕES DE PAGAMENTO (3) ---

    // Calcula o total geral (subtotal + serviço)
    const calculateTotal = (subtotal, applyServiceTax) => {
        const taxRate = applyServiceTax ? 0.10 : 0;
        const serviceValue = subtotal * taxRate;
        const total = subtotal + serviceValue;
        return { total, serviceValue };
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
        
        // Valores para a divisão
        const diners = parseInt(dinersSplitInput.value) || 1;
        const valuePerDiner = generalTotal / diners;

        // Calcula o saldo restante e o troco
        const remainingBalance = generalTotal - currentPaymentsTotal;
        const isClosed = remainingBalance <= 0;
        const displayBalance = isClosed ? 0 - remainingBalance : remainingBalance;
        
        // Atualiza a UI
        document.getElementById('orderSubtotalDisplayPayment').textContent = formatCurrency(subtotal);
        document.getElementById('orderServiceTaxDisplayPayment').textContent = formatCurrency(serviceValue);
        document.getElementById('orderTotalDisplayPayment').textContent = formatCurrency(generalTotal);
        document.getElementById('remainingBalanceDisplay').textContent = formatCurrency(displayBalance);
        document.getElementById('valuePerDinerDisplay').textContent = formatCurrency(valuePerDiner);

        document.getElementById('remainingBalanceDisplay').classList.toggle('text-red-600', remainingBalance > 0);
        document.getElementById('remainingBalanceDisplay').classList.toggle('text-green-600', isClosed);

        toggleServiceTaxBtn.textContent = serviceTaxApplied ? 'Remover' : 'Aplicar';
        toggleServiceTaxBtn.classList.toggle('bg-gray-400', !serviceTaxApplied);
        toggleServiceTaxBtn.classList.toggle('bg-green-600', serviceTaxApplied);

        // Habilita/Desabilita botões de fechamento
        finalizeOrderBtn.disabled = !isClosed;
        openNfeModalBtn.disabled = !isClosed;

        // Renderiza a lista de pagamentos
        const paymentListEl = document.getElementById('paymentSummaryList');
        // Remove tudo, exceto o Resumo do Saldo e Botões de Fechamento
        paymentListEl.innerHTML = ''; 

        if (payments.length === 0) {
            paymentListEl.innerHTML += `<p class="text-xs text-gray-500 italic p-2">Nenhum pagamento registrado.</p>`;
        } else {
            payments.forEach(p => {
                paymentListEl.innerHTML += `
                    <div class="flex justify-between items-center py-1 border-b border-gray-100">
                        <span class="text-xs text-gray-700">${p.method}</span>
                        <span class="font-semibold text-sm">${formatCurrency(p.value)}</span>
                    </div>
                `;
            });
        }
        
        // Adiciona de volta o Resumo do Saldo e Botões de Fechamento
        paymentListEl.innerHTML += `
            <div class="flex justify-between items-center py-1 font-bold border-t border-gray-200 mt-2 pt-2">
                <span>${remainingBalance <= 0 ? 'TROCO' : 'VALOR RESTANTE'}:</span>
                <span id="remainingBalanceDisplayNested" class="font-extrabold ${isClosed ? 'text-green-600' : 'text-red-600'}">${formatCurrency(displayBalance)}</span>
            </div>
            <div class="flex justify-between space-x-3 pt-2">
                <button id="finalizeOrderBtnNested" class="w-1/2 px-4 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition text-base disabled:opacity-50" disabled>FECHAR CONTA</button>
                <button id="openNfeModalBtnNested" class="w-1/2 px-4 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition text-base disabled:opacity-50" disabled>NF-e</button>
            </div>
        `;
        
        // Re-vincula os botões de fechamento para a UI aninhada
        const finalizeBtnNested = document.getElementById('finalizeOrderBtnNested');
        const nfeBtnNested = document.getElementById('openNfeModalBtnNested');

        finalizeBtnNested.disabled = !isClosed;
        nfeBtnNested.disabled = !isClosed;

        finalizeBtnNested.addEventListener('click', finalizeOrder);
        nfeBtnNested.addEventListener('click', openNfeModal);
        
        addPaymentBtn.disabled = !tableData.currentTotal || remainingBalance <= 0;
    };


    // Altera a taxa de serviço (10%)
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

    // Input de Divisão de Conta
    dinersSplitInput.addEventListener('input', renderPaymentSummary);

    // Adicionar Pagamento
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
            timestamp: Date.now(), // Usando timestamp local para evitar erro de array
            userId: userId
        };

        try {
            await updateDoc(tableRef, {
                payments: arrayUnion(newPayment)
            });

            // Limpa o input após o sucesso
            paymentValueInput.value = 'R$ 0,00';
            document.querySelectorAll('.payment-method-btn').forEach(btn => btn.classList.remove('active'));
            addPaymentBtn.disabled = true;

        } catch (e) {
            console.error("Erro ao adicionar pagamento:", e);
        }
    });

    // Seleção do Método de Pagamento
    document.getElementById('paymentMethodButtons').addEventListener('click', (e) => {
        const btn = e.target.closest('.payment-method-btn');
        if (btn) {
            document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active', 'bg-indigo-600', 'text-white'));
            btn.classList.add('active', 'bg-indigo-600', 'text-white');
            addPaymentBtn.disabled = false;
        }
    });
    
    // Finalizar Pedido (Gatilho de Integração WooCommerce)
    const finalizeOrder = async () => {
        if (!currentTableId || !currentOrderSnapshot) return;

        // 1. SIMULAÇÃO DA CHAMADA API DO WOOCOMMERCE
        console.log("--- INICIANDO INTEGRAÇÃO WOOCOMMERCE ---");
        const orderData = {
            tableNumber: currentTableId,
            items: currentOrderSnapshot.sentItems,
            payments: currentOrderSnapshot.payments,
            total: currentOrderSnapshot.currentTotal,
            serviceTaxApplied: currentOrderSnapshot.serviceTaxApplied,
            source: 'PDV_FATOR'
        };
        console.log("DADOS ENVIADOS PARA CRIAÇÃO DE ORDEM (API WooCommerce):", orderData);
        
        // Simulação de delay para a API
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log("Ordem de Venda Criada/Finalizada no WooCommerce.");

        // 2. FECHA A MESA NO FIREBASE
        const tableRef = getTableDocRef(currentTableId);
        try {
            await updateDoc(tableRef, {
                status: 'closed',
                closedAt: serverTimestamp(),
            });
            currentTableId = null;
            selectedItems = [];
            currentOrderSnapshot = null;
            alert("Mesa fechada com sucesso! Ordem finalizada no WooCommerce."); // Usando alert apenas neste ponto de finalização crítica
            goToScreen('panelScreen');
        } catch (e) {
            console.error("Erro ao fechar mesa:", e);
        }
    };

    // --- FUNÇÕES DO PAINEL DE MESAS (1) ---

    // Lógica de validação do botão Abrir Mesa
    const checkInputs = () => {
        const mesaValida = parseInt(mesaInput.value) > 0;
        const pessoasValida = parseInt(pessoasInput.value) > 0;
        abrirMesaBtn.disabled = !(mesaValida && pessoasValida);
    };

    mesaInput.addEventListener('input', checkInputs);
    pessoasInput.addEventListener('input', checkInputs);

    // Abrir Nova Mesa (CRUD - Create)
    abrirMesaBtn.addEventListener('click', async () => {
        // ... (lógica de abrir mesa)
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
                serviceTaxApplied: false,
            });

            currentTableId = tableNumber.toString();
            document.getElementById('current-table-number').textContent = `Mesa ${currentTableId}`;
            document.getElementById('payment-table-number').textContent = `Mesa ${currentTableId}`;

            mesaInput.value = '';
            pessoasInput.value = '';
            abrirMesaBtn.disabled = true;
            goToScreen('orderScreen');
        } catch (e) {
            console.error("Erro ao criar nova mesa: ", e);
            alert(`Erro: ${e.message}. Tente novamente.`); 
        }
    });

    // Renderiza a lista de mesas na UI (Read - Realtime)
    const renderTables = (docs) => {
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

                const cardHtml = `
                    <div class="table-card-panel ${cardColor} shadow-md transition-colors duration-200" data-table-id="${tableId}">
                        <h3 class="font-bold text-2xl">Mesa ${table.tableNumber}</h3>
                        <p class="text-xs font-light">Pessoas: ${table.diners}</p>
                        <span class="font-bold text-lg mt-2">${formatCurrency(total)}</span>
                    </div>
                `;
                openTablesList.innerHTML += cardHtml;
            }
        });

        openTablesCount.textContent = count;
    };

    // Listener em tempo real para Mesas Abertas
    const loadOpenTables = () => {
        const tablesCollection = getTablesCollectionRef();
        const q = query(tablesCollection, where('status', '==', 'open'));

        onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs;
            renderTables(docs);
        }, (error) => {
            console.error("Erro ao carregar mesas (onSnapshot):", error);
            openTablesList.innerHTML = `<div class="col-span-full text-sm text-red-500 italic p-4 content-card bg-white">Erro ao carregar mesas. Verifique as permissões.</div>`;
        });
    };

    // Clique em uma Mesa (Navegação)
    openTablesList.addEventListener('click', (e) => {
        const tableCard = e.target.closest('.table-card-panel');
        if (tableCard) {
            currentTableId = tableCard.dataset.tableId;
            document.getElementById('current-table-number').textContent = `Mesa ${currentTableId}`;
            document.getElementById('payment-table-number').textContent = `Mesa ${currentTableId}`;
            
            selectedItems = [];
            renderSelectedItems();
            loadTableOrder(currentTableId); // Inicia o listener de status KDS/Mesa
            goToScreen('orderScreen');
        }
    });

    // --- FUNÇÕES DO CARDÁPIO (2) ---
    
    // Renderiza os itens do Cardápio com botão de adição
    const renderMenu = (filter = 'all', search = '') => {
        let filteredItems = MENU_DATA;
        
        // Filtro por categoria (se implementado)
        // Filtro por busca
        if (search) {
            const normalizedSearch = search.toLowerCase();
            filteredItems = filteredItems.filter(item => 
                item.name.toLowerCase().includes(normalizedSearch)
            );
        }

        menuItemsGrid.innerHTML = '';
        
        if (filteredItems.length === 0) {
            menuItemsGrid.innerHTML = `<div class="col-span-full text-sm text-gray-500 italic p-4 content-card bg-white">Nenhum produto encontrado.</div>`;
            return;
        }

        filteredItems.forEach(item => {
            const itemHtml = `
                <div class="menu-item bg-white rounded-lg shadow-sm p-3 transition flex flex-col justify-between border border-gray-200">
                    <h4 class="font-bold text-base text-gray-800 text-left mb-1">${item.name}</h4>
                    <div class="flex justify-between items-center mt-2">
                        <p class="text-indigo-600 font-extrabold text-lg">${formatCurrency(item.price)}</p>
                        <button data-item='${JSON.stringify(item).replace(/'/g, '&#39;')}' 
                                class="add-item-btn add-icon-btn bg-green-500 text-white hover:bg-green-600 transition">
                            <i class="fas fa-plus text-lg"></i>
                        </button>
                    </div>
                </div>
            `;
            menuItemsGrid.innerHTML += itemHtml;
        });
    };

    // Renderiza a lista de itens selecionados (lista de anotações local)
    const renderSelectedItems = () => {
        openOrderList.innerHTML = '';

        const totalItemsCount = selectedItems.length;

        if (totalItemsCount === 0) {
            openOrderList.innerHTML = `<div class="text-base text-gray-500 italic p-2">Nenhum item selecionado.</div>`;
        } else {
            // Agrupa itens por ID e Observação para consolidar
            const groupedItems = selectedItems.reduce((acc, item) => {
                const key = `${item.id}-${item.note || ''}`;
                acc[key] = acc[key] || { ...item, qty: 0 };
                acc[key].qty++;
                return acc;
            }, {});

            Object.values(groupedItems).forEach((item, index) => {
                const lineTotal = item.qty * item.price;
                const obsText = item.note 
                    ? `<span class="italic text-indigo-600 font-normal">(${item.note})</span>` 
                    : `<span class="italic text-gray-500">(Adicionar Obs.)</span>`;
                
                openOrderList.innerHTML += `
                    <div class="flex justify-between items-center bg-gray-50 p-3 rounded-lg shadow-sm" data-item-id="${item.id}" data-item-note="${item.note || ''}">
                        <div class="flex flex-col flex-grow min-w-0 mr-2">
                            <span class="font-semibold text-gray-800">${item.name} (${item.qty}x)</span>
                            <span class="text-sm cursor-pointer" onclick="openObsModal(this)" data-item-id="${item.id}" data-item-note-key="${item.note || ''}">${obsText}</span>
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

        document.getElementById('openItemsCount').textContent = totalItemsCount;
    }

    // Adiciona item à lista local de itens selecionados
    const addItemToOrder = (item) => {
        if (!currentTableId) {
            alert("Selecione ou abra uma mesa primeiro.");
            return;
        }

        selectedItems.push({ ...item, note: '' }); // Adiciona sem observação
        renderSelectedItems();
    };

    // Aumenta quantidade na lista local
    window.increaseLocalItemQuantity = (itemId, noteKey) => {
        const itemToCopy = selectedItems.find(item => 
            item.id === itemId && (item.note || '') === noteKey
        );

        if (itemToCopy) {
            selectedItems.push({ ...itemToCopy, note: noteKey });
            renderSelectedItems();
        }
    };

    // Diminui/Remove quantidade na lista local
    window.decreaseLocalItemQuantity = (itemId, noteKey) => {
        const index = selectedItems.findIndex(item => 
            item.id === itemId && (item.note || '') === noteKey
        );

        if (index > -1) {
            selectedItems.splice(index, 1);
            renderSelectedItems();
        }
    };

    // Abre o Modal de Observações/Marcha
    window.openObsModal = (el) => {
        const itemId = el.dataset.itemId;
        const noteKey = el.dataset.itemNoteKey;
        
        const item = MENU_DATA.find(i => i.id === itemId);
        const currentNote = selectedItems.find(item => 
            item.id === itemId && (item.note || '') === noteKey
        )?.note || '';

        if (item) {
            obsItemName.textContent = item.name;
            obsInput.value = currentNote;
            obsModal.dataset.itemId = itemId;
            obsModal.dataset.originalNoteKey = noteKey;
            obsModal.style.display = 'flex';
        }
    };

    // Listener para o Modal de Observações (ESPERA e MARCHA)
    [saveObsBtn, cancelObsBtn].forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const action = e.target.dataset.action; // 'marcha' ou 'espera'
            
            const itemId = obsModal.dataset.itemId;
            const originalNoteKey = obsModal.dataset.originalNoteKey;
            const newNote = obsInput.value.trim();

            if (!itemId) return;

            // 1. Atualizar a observação na lista local (selectedItems)
            if (newNote !== originalNoteKey) {
                 selectedItems = selectedItems.map(item => {
                    // Encontra todos os itens com o mesmo ID e a mesma observação original
                    if (item.id === itemId && (item.note || '') === originalNoteKey) {
                        // Atualiza a observação para o novo valor
                        return { ...item, note: newNote };
                    }
                    return item;
                });
            }

            // 2. Ação de envio (MARCHA)
            if (action === 'marcha') {
                await sendItemsToKDS(itemId, newNote);
            }
            
            // 3. Fechar e Renderizar
            obsModal.style.display = 'none';
            obsInput.value = '';
            renderSelectedItems();
        });
    });

    // 4. Envia os itens para o KDS e atualiza a mesa
    const sendItemsToKDS = async (itemId, currentNote) => {
        if (!currentTableId) return;
        
        // Separa os itens a serem enviados (MARCHA) e os que ficam (ESPERA)
        const itemsToMarch = selectedItems.filter(item => 
            item.id === itemId && (item.note || '') === currentNote
        );

        if (itemsToMarch.length === 0) return;

        // Remove os itens enviados da lista local
        selectedItems = selectedItems.filter(item => 
            !(item.id === itemId && (item.note || '') === currentNote)
        );

        // Agrupa os itens para o KDS (por setor)
        const itemsGroupedBySector = itemsToMarch.reduce((acc, item) => {
            const sector = item.sector;
            const itemToSend = {};
            for (const key in item) {
                if (item[key] !== undefined) {
                    itemToSend[key] = item[key];
                }
            }
            // Garante que a nota é uma string vazia se for nula
            itemToSend.note = itemToSend.note || ''; 
            acc[sector] = acc[sector] || [];
            acc[sector].push(itemToSend);
            return acc;
        }, {});
        
        // Cria um documento de pedido KDS
        const kdsOrderRef = doc(getKdsCollectionRef());
        const timestamp = Date.now();
        
        try {
            await setDoc(kdsOrderRef, {
                orderId: kdsOrderRef.id,
                tableNumber: parseInt(currentTableId),
                timestamp: timestamp,
                sentAt: serverTimestamp(),
                sectors: itemsGroupedBySector,
                status: 'pending'
            });

            // Atualiza a mesa (total e lista de itens enviados)
            const tableRef = getTableDocRef(currentTableId);
            const itemsForUpdate = itemsToMarch.map(item => {
                const updatedItem = {};
                for (const key in item) {
                    if (item[key] !== undefined) {
                        updatedItem[key] = item[key];
                    }
                }
                updatedItem.note = updatedItem.note || '';
                updatedItem.orderId = kdsOrderRef.id; // Vincula ao pedido KDS
                return updatedItem;
            });

            await updateDoc(tableRef, {
                // Adiciona os itens à lista de sentItems
                sentItems: arrayUnion(...itemsForUpdate), 
            });

        } catch (e) {
            console.error("Erro ao enviar pedido KDS/Atualizar Mesa:", e);
        }
    }


    // Listener para os botões de adicionar item ao Cardápio
    menuItemsGrid.addEventListener('click', (e) => {
        const addButton = e.target.closest('.add-item-btn');
        if (addButton) {
            // Remove o replace, pois o JSON.stringify já trata a maioria dos caracteres
            const itemData = JSON.parse(addButton.dataset.item.replace(/&#39;/g, "'"));
            addItemToOrder(itemData);
        }
    });

    // Listener de Busca
    searchProductInput.addEventListener('input', (e) => {
        renderMenu('all', e.target.value);
    });

    // --- FUNÇÕES DE STATUS (KDS/MESA) ---

    let unsubscribeTable = null;

    // Listener para as atualizações da mesa (usado em OrderScreen e PaymentScreen)
    const loadTableOrder = (tableId) => {
        if (unsubscribeTable) unsubscribeTable(); // Limpa listener anterior

        const tableRef = getTableDocRef(tableId);

        unsubscribeTable = onSnapshot(tableRef, (docSnapshot) => {
            if (docSnapshot.exists()) {
                currentOrderSnapshot = docSnapshot.data();
                renderSentItems();
                renderPaymentSummary(); 
                subscribeToKdsNotifications(tableId); // Inicia notificação
            } else {
                console.log(`Mesa ${tableId} não encontrada.`);
                currentOrderSnapshot = null;
                renderSentItems();
                renderPaymentSummary();
            }
        }, (error) => {
            console.error("Erro ao carregar dados da mesa:", error);
        });
    };

    // Renderiza itens já enviados (Comanda Aberta)
    const renderSentItems = () => {
        const listEl = document.getElementById('reviewItemsList'); // Reutilizando a lista de pagamento aqui

        if (!currentOrderSnapshot || currentOrderSnapshot.sentItems.length === 0) {
            listEl.innerHTML = `<div class="text-sm text-gray-500 italic p-2">Nenhum item na conta para revisão.</div>`;
            return;
        }

        listEl.innerHTML = '';

        // Agrupa itens para exibição
        const groupedItems = currentOrderSnapshot.sentItems.reduce((acc, item) => {
            const key = `${item.id}-${item.note || ''}`;
            acc[key] = acc[key] || { ...item, qty: 0 };
            acc[key].qty++;
            return acc;
        }, {});

        // Recalcula o total (útil em caso de erro de sincronização)
        let totalRecalculated = 0;

        Object.values(groupedItems).forEach((item, index) => {
            const lineTotal = item.qty * item.price;
            totalRecalculated += lineTotal;
            const obsText = item.note ? ` (${item.note})` : '';

            listEl.innerHTML += `
                <div class="flex justify-between items-center py-2 border-b border-gray-100">
                    <div class="flex flex-col flex-grow min-w-0 mr-2">
                         <span class="font-semibold text-gray-800">${item.name} (${item.qty}x)</span>
                         <span class="text-xs text-gray-500 truncate">${obsText}</span>
                    </div>
                    <div class="flex items-center space-x-2 flex-shrink-0">
                        <span class="font-bold text-base text-indigo-700">${formatCurrency(lineTotal)}</span>
                        <button class="text-red-500 hover:text-red-700 transition" onclick="openManagerModal('deleteItem', '${item.id}', '${item.note || ''}')" title="Excluir Item (Gerente)">
                             <i class="fas fa-trash text-sm"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        
        // Atualiza o total da mesa no documento do Firebase (se for diferente)
        if (totalRecalculated !== currentOrderSnapshot.total) {
            const tableRef = getTableDocRef(currentTableId);
            updateDoc(tableRef, { total: totalRecalculated }).catch(e => console.error("Erro ao sincronizar total:", e));
        }

    };
    
    // --- NOTIFICAÇÃO KDS ---
    let unsubscribeKds = null;
    
    const subscribeToKdsNotifications = (tableId) => {
        if (unsubscribeKds) unsubscribeKds();
        
        const q = query(getKdsCollectionRef(), where('tableNumber', '==', parseInt(tableId)), where('status', '==', 'ready'));

        unsubscribeKds = onSnapshot(q, (snapshot) => {
            if (snapshot.docs.length > 0) {
                // Há pedidos prontos
                document.getElementById('kds-notification-badge').classList.remove('hidden');
                document.getElementById('notification-badge-container').classList.add('animate-pulse');
            } else {
                // Nenhum pedido pronto
                document.getElementById('kds-notification-badge').classList.add('hidden');
                document.getElementById('notification-badge-container').classList.remove('animate-pulse');
            }
        }, (error) => {
            console.error("Erro no listener de notificação KDS:", error);
        });
    };

    // --- FUNÇÕES DE AJUDA ---
    
    const hideStatus = () => {
        statusScreen.style.display = 'none';
        mainContent.style.display = 'block';
    };

    // --- INTEGRAÇÃO COM MODAIS E AUTENTICAÇÃO GERENCIAL ---
    // (Omitindo a lógica completa de renderização de Modais para manter o foco na separação de arquivos)

    window.openManagerModal = (action, itemId = null, itemNote = null) => {
        // Lógica para abrir o modal de gerente (senha)
        const managerModal = document.getElementById('managerModal');
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
            if (input.value === password) {
                managerModal.style.display = 'none';
                if (action === 'deleteItem') {
                    deleteSentItem(itemId, itemNote);
                } else if (action === 'openSelectiveTransfer') {
                    openSelectiveTransferModal();
                } else if (action === 'openActions') {
                    openActionsModal();
                }
            } else {
                alert("Senha incorreta.");
                input.value = '';
            }
        };
    };
    
    // Deleta item enviado (Após autenticação Gerencial)
    const deleteSentItem = async (itemId, itemNote) => {
        if (!currentTableId || !currentOrderSnapshot) return;
        
        const itemToDelete = currentOrderSnapshot.sentItems.find(item => 
            item.id === itemId && (item.note || '') === itemNote
        );

        if (!itemToDelete) return;

        const tableRef = getTableDocRef(currentTableId);

        try {
            await updateDoc(tableRef, {
                // Remove apenas o primeiro item que corresponde
                sentItems: arrayRemove(itemToDelete)
            });
            alert("Item removido da conta.");
        } catch (e) {
            console.error("Erro ao deletar item da conta:", e);
            alert("Erro ao tentar remover o item.");
        }
    };
    
    // Adiciona listener para o botão de ações gerenciais (engrenagem)
    openActionsModalBtn.addEventListener('click', () => {
        openManagerModal('openActions');
    });

    // Adiciona listener para o botão de transferência seletiva
    document.getElementById('openSelectiveTransferModalBtn').addEventListener('click', () => {
        openManagerModal('openSelectiveTransfer');
    });
    
    // Função placeholder para o modal de transferência seletiva
    const openSelectiveTransferModal = () => {
        const modal = document.getElementById('selectiveTransferModal');
        modal.innerHTML = `
            <div class="bg-white p-6 rounded-xl shadow-2xl w-full max-w-lg">
                <h3 class="text-xl font-bold mb-4 text-indigo-700">Transferência Seletiva</h3>
                <p class="text-sm text-gray-600 mb-4">Selecione os itens e a mesa de destino para transferir.</p>

                <div class="flex space-x-2 mb-4">
                    <input type="number" id="targetTableInput" placeholder="Nº Mesa Destino" class="w-2/3 p-3 border border-gray-300 rounded-lg focus:ring-indigo-500" min="1">
                    <button id="checkTargetTableBtn" class="w-1/3 bg-blue-500 text-white p-3 rounded-lg hover:bg-blue-600 transition disabled:opacity-50">Verificar</button>
                </div>
                <p id="transferStatus" class="text-sm text-red-500 mb-4 italic hidden"></p>

                <div id="transferItemsList" class="max-h-60 overflow-y-auto space-y-2 p-2 border border-gray-200 rounded-lg bg-gray-50">
                    <p class="text-center text-gray-500">Carregando itens...</p>
                </div>
                
                <div class="flex justify-end space-x-3 mt-4">
                    <button class="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition" onclick="document.getElementById('selectiveTransferModal').style.display='none'">Cancelar</button>
                    <button id="confirmTransferBtn" class="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50" disabled>Confirmar Transferência</button>
                </div>
            </div>
        `;
        
        // Renderiza a lista de itens para transferência (similar ao renderSentItems)
        const renderTransferItems = () => {
             const listEl = document.getElementById('transferItemsList');
             if (!currentOrderSnapshot || currentOrderSnapshot.sentItems.length === 0) {
                 listEl.innerHTML = `<p class="text-center text-gray-500">Nenhum item para transferir.</p>`;
                 return;
             }
             
             // Lógica simplificada de renderização para a transferência
             listEl.innerHTML = '';
             // ... [Lógica completa de transferência seletiva seria aqui, usando os arrays da comanda] ...
             listEl.innerHTML = `<p class="text-center text-gray-500">Funcionalidade de Seleção de Itens não implementada nesta versão, mas o botão está ativo.</p>`;
        };
        
        // Simulação da verificação da mesa
        document.getElementById('checkTargetTableBtn').addEventListener('click', () => {
            const targetTable = parseInt(document.getElementById('targetTableInput').value);
            if (!targetTable || targetTable === parseInt(currentTableId)) {
                document.getElementById('transferStatus').textContent = 'Mesa inválida ou igual à atual.';
                document.getElementById('transferStatus').classList.remove('hidden');
                document.getElementById('confirmTransferBtn').disabled = true;
                return;
            }
            document.getElementById('transferStatus').textContent = `Mesa ${targetTable} verificada.`;
            document.getElementById('transferStatus').classList.remove('hidden');
            document.getElementById('confirmTransferBtn').disabled = false;
        });

        // Simulação da confirmação de transferência
        document.getElementById('confirmTransferBtn').addEventListener('click', async () => {
             // ... [Lógica de mover itens entre mesas no Firestore, ajustando totais] ...
             alert(`Simulação: Itens da Mesa ${currentTableId} transferidos para Mesa ${document.getElementById('targetTableInput').value}.`);
             modal.style.display = 'none';
        });

        renderTransferItems();
        modal.style.display = 'flex';
    };
    
    // Função placeholder para o modal NF-e
    const openNfeModal = () => {
        const nfeModal = document.getElementById('nfeModal');
        nfeModal.innerHTML = `
            <div class="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm">
                <h3 class="text-xl font-bold mb-4 text-green-700">NF-e / Recibo</h3>
                <p class="text-base mb-3">Deseja incluir CPF/CNPJ?</p>
                <input type="text" id="nfeCpfCnpjInput" placeholder="CPF ou CNPJ (Opcional)" class="w-full p-3 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500 text-base">
                
                <div class="flex flex-col space-y-2 mt-4">
                    <button class="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-base">Imprimir Recibo</button>
                    <button class="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-base">Enviar por Email</button>
                </div>

                <div class="flex justify-end mt-4">
                    <button class="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition text-base" onclick="document.getElementById('nfeModal').style.display='none'">Fechar</button>
                </div>
            </div>
        `;
        nfeModal.style.display = 'flex';
    };


    // Vincula os listeners de fechamento de conta após o carregamento inicial
    if (finalizeOrderBtn) finalizeOrderBtn.addEventListener('click', finalizeOrder);
    if (openNfeModalBtn) openNfeModalBtn.addEventListener('click', openNfeModal);
    
    // Oculta a tela de status ao carregar o DOM
    document.getElementById('statusScreen').style.display = 'flex';
    document.getElementById('mainContent').style.display = 'none';

});
