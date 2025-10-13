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
    const sendSelectedItemsBtn = document.getElementById('sendSelectedItemsBtn');
    const quickObsButtons = document.getElementById('quickObsButtons');
    const esperaSwitch = document.getElementById('esperaSwitch');


    // Variável para rastrear o item/grupo que está no modal de OBS
    let currentObsGroup = null;

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
        // CORREÇÃO: Salva os itens selecionados antes de sair da tela do pedido
        if (screenId === 'panelScreen' && currentTableId) {
            saveSelectedItemsToFirebase(currentTableId);
        }

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

    // --- FUNÇÃO PARA SALVAR A LISTA selectedItems NO FIREBASE (NOVA FUNÇÃO) ---
    const saveSelectedItemsToFirebase = async (tableId) => {
        if (!tableId || selectedItems.length === 0) return;

        const tableRef = getTableDocRef(tableId);
        try {
            // Salva a lista inteira, incluindo os itens com "Espera"
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
        
        // Valores para a divisão
        const diners = parseInt(dinersSplitInput.value) || 1;
        const valuePerDiner = generalTotal / diners;

        // Calcula o saldo restante e o troco
        const remainingBalance = generalTotal - currentPaymentsTotal;
        const isClosed = remainingBalance <= 0;
        const displayBalance = isClosed ? 0 - remainingBalance : remainingBalance;
        
        // Atualiza a UI com checagem de nulo
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

        // Habilita/Desabilita botões de fechamento
        if (finalizeOrderBtn) finalizeOrderBtn.disabled = !isClosed;
        if (openNfeModalBtn) openNfeModalBtn.disabled = !isClosed;

        // Renderiza a lista de pagamentos
        const paymentListEl = document.getElementById('paymentSummaryList');
        if (!paymentListEl) return; 

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
        
        const isClosedClass = isClosed ? 'text-green-600' : 'text-red-600';

        paymentListEl.innerHTML += `
            <div class="flex justify-between items-center py-1 font-bold border-t border-gray-200 mt-2 pt-2">
                <span>${remainingBalance <= 0 ? 'TROCO' : 'VALOR RESTANTE'}:</span>
                <span id="remainingBalanceDisplayNested" class="font-extrabold ${isClosedClass}">${formatCurrency(displayBalance)}</span>
            </div>
            <div class="flex justify-between space-x-3 pt-2">
                <button id="finalizeOrderBtnNested" class="w-1/2 px-4 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition text-base disabled:opacity-50" disabled>FECHAR CONTA</button>
                <button id="openNfeModalBtnNested" class="w-1/2 px-4 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition text-base disabled:opacity-50" disabled>NF-e</button>
            </div>
        `;
        
        const finalizeBtnNested = document.getElementById('finalizeOrderBtnNested');
        const nfeBtnNested = document.getElementById('openNfeModalBtnNested');

        if (finalizeBtnNested) finalizeBtnNested.disabled = !isClosed;
        if (nfeBtnNested) nfeBtnNested.disabled = !isClosed;

        if (finalizeBtnNested) finalizeBtnNested.addEventListener('click', finalizeOrder);
        if (nfeBtnNested) nfeBtnNested.addEventListener('click', openNfeModal);
        
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

    document.getElementById('paymentMethodButtons').addEventListener('click', (e) => {
        const btn = e.target.closest('.payment-method-btn');
        if (btn) {
            document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active', 'bg-indigo-600', 'text-white'));
            btn.classList.add('active', 'bg-indigo-600', 'text-white');
            addPaymentBtn.disabled = false;
        }
    });
    
    const finalizeOrder = async () => {
        if (!currentTableId || !currentOrderSnapshot) return;

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
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log("Ordem de Venda Criada/Finalizada no WooCommerce.");

        const tableRef = getTableDocRef(currentTableId);
        try {
            await updateDoc(tableRef, {
                status: 'closed',
                closedAt: serverTimestamp(),
            });
            currentTableId = null;
            selectedItems = [];
            currentOrderSnapshot = null;
            alert("Mesa fechada com sucesso! Ordem finalizada no WooCommerce."); 
            goToScreen('panelScreen');
        } catch (e) {
            console.error("Erro ao fechar mesa:", e);
        }
    };

    // --- FUNÇÕES DO PAINEL DE MESAS (1) ---

    const checkInputs = () => {
        const mesaValida = parseInt(mesaInput.value) > 0;
        const pessoasValida = parseInt(pessoasInput.value) > 0;
        abrirMesaBtn.disabled = !(mesaValida && pessoasValida);
    };

    mesaInput.addEventListener('input', checkInputs);
    pessoasInput.addEventListener('input', checkInputs);

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
                serviceTaxApplied: false,
                selectedItems: [] // NOVO: Campo para salvar os itens em espera
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
    openTablesList.addEventListener('click', async (e) => {
        const tableCard = e.target.closest('.table-card-panel');
        if (tableCard) {
            currentTableId = tableCard.dataset.tableId;
            document.getElementById('current-table-number').textContent = `Mesa ${currentTableId}`;
            document.getElementById('payment-table-number').textContent = `Mesa ${currentTableId}`;
            
            // CARREGA ITENS SALVOS NO FIREBASE (NOVA LÓGICA)
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

    // --- FUNÇÕES DO CARDÁPIO (2) ---
    
    const renderMenu = (filter = 'all', search = '') => {
        let filteredItems = MENU_DATA;
        
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
                        <p class="text-indigo-600 font-extrabold text-sm">${formatCurrency(item.price)}</p>
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

    const renderSelectedItems = () => {
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
                            <span class="text-sm cursor-pointer ${isEspera ? 'text-yellow-600' : ''}" onclick="openObsModal(this)" data-item-id="${item.id}" data-item-note-key="${item.note || ''}">${obsText}</span>
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

    const addItemToOrder = (item) => {
        if (!currentTableId) {
            alert("Selecione ou abra uma mesa primeiro.");
            return;
        }
        
        selectedItems.push({ ...item, note: '' }); 

        renderSelectedItems();
        
        currentObsGroup = { id: item.id, note: '' };

        obsItemName.textContent = item.name;
        obsInput.value = ''; 
        obsModal.dataset.itemId = item.id;
        obsModal.dataset.originalNoteKey = '';
        
        obsModal.style.display = 'flex';
        esperaSwitch.checked = false; 
    };

    menuItemsGrid.addEventListener('click', (e) => {
        const addButton = e.target.closest('.add-item-btn');
        if (addButton) {
            const itemData = JSON.parse(addButton.dataset.item.replace(/&#39;/g, "'"));
            addItemToOrder(itemData);
        }
    });
    
    if (quickObsButtons) {
        quickObsButtons.addEventListener('click', (e) => {
            const btn = e.target.closest('.quick-obs-btn');
            if (btn) {
                const obsText = btn.textContent.trim();
                const currentObs = obsInput.value.trim();
                
                if (obsText === 'Espera') {
                    esperaSwitch.checked = !esperaSwitch.checked;
                    obsInput.value = currentObs; 
                } else if (currentObs === '') {
                    obsInput.value = obsText;
                } else {
                    const lastChar = currentObs.slice(-1);
                    const separator = (lastChar === ',' || lastChar === ';' || lastChar === ' ' || lastChar === '/') ? '' : ', ';
                    obsInput.value += separator + obsText;
                }
            }
        });
    }


    window.increaseLocalItemQuantity = (itemId, noteKey) => {
        const itemToCopy = selectedItems.find(item => 
            item.id === itemId && (item.note || '') === noteKey
        );

        if (itemToCopy) {
            selectedItems.push({ ...itemToCopy, note: noteKey });
            renderSelectedItems();
        }
    };

    window.decreaseLocalItemQuantity = (itemId, noteKey) => {
        const index = selectedItems.findIndex(item => 
            item.id === itemId && (item.note || '') === noteKey
        );

        if (index > -1) {
            selectedItems.splice(index, 1);
            renderSelectedItems();
        }
    };

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
            
            esperaSwitch.checked = currentNote.toLowerCase().includes('espera');

            obsModal.style.display = 'flex';

            currentObsGroup = { id: itemId, note: noteKey };
        }
    };
    
    // Adiciona listener para a nova chave de 'Espera'
    if (esperaSwitch) {
        esperaSwitch.addEventListener('change', () => {
            // Mantém a observação de texto, a lógica de espera é separada agora.
            // A lógica de anexar/remover "Espera" do texto é feita no botão de salvar.
        });
    }


    [saveObsBtn, cancelObsBtn].forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const action = e.target.textContent.trim(); 
            
            if (!currentObsGroup) {
                obsModal.style.display = 'none';
                return;
            }

            const itemId = currentObsGroup.id;
            const originalNoteKey = currentObsGroup.note;
            let newNote = obsInput.value.trim();

            if (action === 'CANCELAR') {
                if (originalNoteKey === '' && newNote === '') {
                    const indexToRemove = selectedItems.findIndex(item => item.id === itemId && item.note === '');
                    if (indexToRemove !== -1) {
                        selectedItems.splice(indexToRemove, 1);
                    }
                }
            } else { // SALVAR OBS
                 // Adiciona ou remove "Espera" da observação com base no switch (NOVA LÓGICA)
                const isEsperaActive = esperaSwitch.checked;
                const hasEsperaText = newNote.toLowerCase().includes('espera');

                if (isEsperaActive && !hasEsperaText) {
                    newNote += (newNote === '' ? '' : ', ') + 'Espera';
                } else if (!isEsperaActive && hasEsperaText) {
                    // Remove "Espera" se a chave estiver desativada
                    newNote = newNote.replace(/(,?\s*Espera)/gi, '').trim();
                }

                if (newNote !== originalNoteKey) {
                    selectedItems = selectedItems.map(item => {
                        if (item.id === itemId && (item.note || '') === originalNoteKey) {
                            return { ...item, note: newNote };
                        }
                        return item;
                    });
                }
            }

            obsModal.style.display = 'none';
            obsInput.value = '';
            currentObsGroup = null;
            renderSelectedItems();
        });
    });

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
            
            // FILTRA ITENS A SEREM ENVIADOS E ITENS EM ESPERA (CORREÇÃO DE LÓGICA)
            const itemsToSend = selectedItems.filter(item => !item.note || !item.note.toLowerCase().includes('espera'));
            const itemsToHold = selectedItems.filter(item => item.note && item.note.toLowerCase().includes('espera'));

            if (itemsToSend.length === 0) {
                alert("Nenhum item pronto para envio (todos estão marcados como 'Espera').");
                return;
            }

            // ATUALIZA A LISTA LOCAL APENAS COM OS ITENS EM ESPERA
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
            
            try {
                await setDoc(kdsOrderRef, {
                    orderId: kdsOrderRef.id,
                    tableNumber: parseInt(currentTableId),
                    timestamp: Date.now(),
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
                
                // ATUALIZA O FIREBASE COM OS ITENS ENVIADOS E OS ITENS SELECIONADOS RESTANTES
                await updateDoc(tableRef, {
                    sentItems: arrayUnion(...itemsForUpdate), 
                    selectedItems: selectedItems // Salva a lista com os itens em espera
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

    searchProductInput.addEventListener('input', (e) => {
        const activeCategoryBtn = document.querySelector('#categoryFilters .bg-indigo-600');
        const activeCategory = activeCategoryBtn ? activeCategoryBtn.dataset.category : 'all';
        renderMenu(activeCategory, e.target.value);
    });

    let unsubscribeTable = null;

    const loadTableOrder = (tableId) => {
        if (unsubscribeTable) unsubscribeTable(); 

        const tableRef = getTableDocRef(tableId);

        unsubscribeTable = onSnapshot(tableRef, (docSnapshot) => {
            if (docSnapshot.exists()) {
                currentOrderSnapshot = docSnapshot.data();
                // CORREÇÃO: Carrega os itens selecionados do firebase (se existirem)
                selectedItems = currentOrderSnapshot.selectedItems || [];
                renderSelectedItems(); 

                renderSentItems();
                renderPaymentSummary(); 
                subscribeToKdsNotifications(tableId); 
            } else {
                console.log(`Mesa ${tableId} não encontrada.`);
                currentOrderSnapshot = null;
                selectedItems = []; // Limpa a lista local se a mesa não for encontrada
                renderSelectedItems();
                renderSentItems();
                renderPaymentSummary();
            }
        }, (error) => {
            console.error("Erro ao carregar dados da mesa:", error);
        });
    };

    const renderSentItems = () => {
        const listEl = document.getElementById('reviewItemsList'); 

        if (!currentOrderSnapshot || currentOrderSnapshot.sentItems.length === 0) {
            if (listEl) { 
                listEl.innerHTML = `<div class="text-sm text-gray-500 italic p-2">Nenhum item na conta para revisão.</div>`;
            }
            return;
        }

        if (listEl) listEl.innerHTML = ''; 

        const groupedItems = currentOrderSnapshot.sentItems.reduce((acc, item) => {
            const key = `${item.id}-${item.note || ''}`;
            acc[key] = acc[key] || { ...item, qty: 0 };
            acc[key].qty++;
            return acc;
        }, {});

        let totalRecalculated = 0;

        Object.values(groupedItems).forEach((item, index) => {
            const lineTotal = item.qty * item.price;
            totalRecalculated += lineTotal;
            const obsText = item.note ? ` (${item.note})` : '';

            if (listEl) { 
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
            }
        });
        
        if (totalRecalculated !== currentOrderSnapshot.total) {
            const tableRef = getTableDocRef(currentTableId);
            updateDoc(tableRef, { total: totalRecalculated }).catch(e => console.error("Erro ao sincronizar total:", e));
        }

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
        statusScreen.style.display = 'none';
        mainContent.style.display = 'block';
    };

    window.openManagerModal = (action, itemId = null, itemNote = null) => {
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
    
    const deleteSentItem = async (itemId, itemNote) => {
        if (!currentTableId || !currentOrderSnapshot) return;
        
        const itemToDelete = currentOrderSnapshot.sentItems.find(item => 
            item.id === itemId && (item.note || '') === itemNote
        );

        if (!itemToDelete) return;

        const tableRef = getTableDocRef(currentTableId);

        try {
            await updateDoc(tableRef, {
                sentItems: arrayRemove(itemToDelete)
            });
            alert("Item removido da conta.");
        } catch (e) {
            console.error("Erro ao deletar item da conta:", e);
            alert("Erro ao tentar remover o item.");
        }
    };
    
    if (openActionsModalBtn) {
        openActionsModalBtn.addEventListener('click', () => {
            openManagerModal('openActions');
        });
    }

    document.getElementById('openSelectiveTransferModalBtn').addEventListener('click', () => {
        openManagerModal('openSelectiveTransfer');
    });
    
    const openSelectiveTransferModal = () => {
        const modal = document.getElementById('selectiveTransferModal');
        if (!modal) return; 

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
        
        const renderTransferItems = () => {
             const listEl = document.getElementById('transferItemsList');
             if (!currentOrderSnapshot || currentOrderSnapshot.sentItems.length === 0) {
                 if (listEl) listEl.innerHTML = `<p class="text-center text-gray-500">Nenhum item para transferir.</p>`;
                 return;
             }
             
             if (listEl) {
                 listEl.innerHTML = `<p class="text-center text-gray-500">Funcionalidade de Seleção de Itens não implementada nesta versão, mas o botão está ativo.</p>`;
             }
        };
        
        const checkTargetTableBtn = document.getElementById('checkTargetTableBtn');
        if (checkTargetTableBtn) {
            checkTargetTableBtn.addEventListener('click', () => {
                const targetTable = parseInt(document.getElementById('targetTableInput')?.value);
                const transferStatus = document.getElementById('transferStatus');
                const confirmTransferBtn = document.getElementById('confirmTransferBtn');
                
                if (!targetTable || targetTable === parseInt(currentTableId)) {
                    if (transferStatus) {
                        transferStatus.textContent = 'Mesa inválida ou igual à atual.';
                        transferStatus.classList.remove('hidden');
                    }
                    if (confirmTransferBtn) confirmTransferBtn.disabled = true;
                    return;
                }
                if (transferStatus) {
                    transferStatus.textContent = `Mesa ${targetTable} verificada.`;
                    transferStatus.classList.remove('hidden');
                }
                if (confirmTransferBtn) confirmTransferBtn.disabled = false;
            });
        }

        const confirmTransferBtn = document.getElementById('confirmTransferBtn');
        if (confirmTransferBtn) {
            confirmTransferBtn.addEventListener('click', async () => {
                alert(`Simulação: Itens da Mesa ${currentTableId} transferidos para Mesa ${document.getElementById('targetTableInput')?.value}.`);
                modal.style.display = 'none';
            });
        }

        renderTransferItems();
        modal.style.display = 'flex';
    };
    
    const openNfeModal = () => {
        const nfeModal = document.getElementById('nfeModal');
        if (!nfeModal) return; 
        
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


    if (finalizeOrderBtn) finalizeOrderBtn.addEventListener('click', finalizeOrder);
    if (openNfeModalBtn) openNfeModalBtn.addEventListener('click', openNfeModal);
    
    document.getElementById('statusScreen').style.display = 'flex';
    document.getElementById('mainContent').style.display = 'none';

});
