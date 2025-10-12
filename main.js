<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gestão de Comandas (PDV Touch) - Smart Card</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
    
    <script>
        // Configuração do Tailwind para usar a fonte Inter e cores primárias
        tailwind.config = {
            theme: {
                extend: {
                    fontSize: {
                        'base': '1rem', 
                        'lg': '1.125rem',
                        'xl': '1.25rem',
                        '2xl': '1.5rem',
                        '3xl': '1.875rem',
                    },
                    fontFamily: {
                        sans: ['Inter', 'sans-serif'],
                    },
                    colors: {
                        'primary': '#4f46e5',
                    },
                }
            }
        }
    </script>
    
    <!-- Estilos CSS embutidos para o layout de slide e otimização para toque -->
    <style>
        /* Estilização específica */
        html { font-family: 'Inter', sans-serif; scroll-behavior: smooth; }
        .header-bar { background-color: #4f46e5; padding: 0.75rem 1rem; color: white; display: flex; align-items: center; justify-content: space-between; }
        .header-bar button { color: white; padding: 0.5rem; border-radius: 0.5rem; transition: background-color 0.15s; }
        .header-bar button:hover { background-color: rgba(255, 255, 255, 0.1); }

        /* Estilo para simular o efeito de navegação entre telas */
        .screen {
            width: 100%;
            transition: transform 0.3s ease-in-out;
            position: absolute;
            top: 0;
            left: 0;
            min-height: 100vh; /* Garante que a tela cubra toda a altura */
            background-color: #f3f4f6; /* Cor de fundo para telas */
        }
        .screen:not(.active-screen) {
            transform: translateX(100%);
            z-index: 0;
        }
        .active-screen {
            transform: translateX(0);
            z-index: 10;
        }
        
        /* Oculta scrollbars nos modais */
        .modal-content-scrollable {
            max-height: 70vh;
            overflow-y: auto;
            scrollbar-width: none; /* Firefox */
        }
        .modal-content-scrollable::-webkit-scrollbar {
            display: none; /* Chrome, Safari, Opera */
        }

        /* Classes para simular botão de "mensagem" (substituindo o alert) */
        #messageBox {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 500;
            padding: 1.5rem;
            border-radius: 0.75rem;
            box-shadow: 0 10px 15px rgba(0, 0, 0, 0.1);
            max-width: 90%;
            min-width: 300px;
            text-align: center;
        }
        
        /* Estilo para o separador de item no pedido */
        .order-item-separator {
            content: "";
            display: block;
            height: 1px;
            background-color: #e5e7eb;
            margin: 0.5rem 0;
        }
    </style>
</head>
<body class="bg-gray-100 antialiased overflow-x-hidden">

    <!-- Caixa de Mensagem (Substitui alert()) -->
    <div id="messageBox" class="hidden bg-white">
        <p id="messageText" class="text-gray-800 font-medium mb-4"></p>
        <button id="messageCloseBtn" class="bg-primary hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition duration-150">
            Entendi
        </button>
    </div>

    <!-- Container Principal das Telas -->
    <div class="relative w-full h-screen">

        <!-- TELA 1: Painel de Mesas/Comandas -->
        <div id="panelScreen" class="screen active-screen">
            <header class="header-bar shadow-md">
                <h1 class="text-xl font-bold">Gestão de Comandas (PDV)</h1>
                <div class="flex items-center space-x-2">
                    <span id="authStatus" class="text-sm font-light mr-2"></span>
                    <button id="refreshTablesBtn" title="Recarregar Mesas">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                    <button id="createTableBtn" title="Criar Nova Mesa" class="bg-green-600 hover:bg-green-700 rounded-full w-8 h-8 flex items-center justify-center">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </header>
            
            <main class="p-4">
                <h2 class="text-2xl font-semibold mb-4 text-gray-800">Mesas / Comandas Ativas</h2>
                <div id="tablesContainer" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                    <!-- Mesas serão renderizadas aqui -->
                    <div class="text-center text-gray-500 py-10" id="loadingMessage">Carregando mesas...</div>
                </div>
            </main>
        </div>

        <!-- TELA 2: Detalhe da Mesa / Lançamento de Itens -->
        <div id="tableScreen" class="screen hidden flex flex-col">
            <header class="header-bar shadow-md sticky top-0 z-20">
                <button id="backToPanelBtn" title="Voltar ao Painel">
                    <i class="fas fa-arrow-left"></i>
                </button>
                <div class="flex-grow text-center">
                    <h1 class="text-xl font-bold" id="tableNameHeader">Mesa X</h1>
                    <span id="tableIdHeader" class="text-xs font-light opacity-80">ID:</span>
                </div>
                <button id="openCloseModalBtn" title="Fechar/Pagar Mesa" class="bg-red-600 hover:bg-red-700">
                    <i class="fas fa-dollar-sign mr-1"></i> Fechar
                </button>
            </header>

            <main class="flex-1 overflow-auto">
                <div class="flex flex-col md:flex-row h-full">
                    
                    <!-- Coluna do Pedido Atual (Esquerda/Topo) -->
                    <div class="md:w-1/3 lg:w-1/4 bg-white shadow-xl p-4 flex flex-col">
                        <h2 class="text-xl font-bold mb-3 text-primary border-b pb-2">Pedido Atual</h2>
                        <div id="orderItems" class="flex-1 overflow-y-auto mb-4 space-y-3">
                            <!-- Itens do pedido serão listados aqui -->
                            <p id="emptyOrderMessage" class="text-gray-500 italic text-center py-4">Nenhum item adicionado.</p>
                        </div>

                        <div id="orderSummary" class="border-t pt-3 space-y-1">
                            <div class="flex justify-between font-medium text-gray-700">
                                <span>Subtotal:</span>
                                <span id="subtotalValue">R$ 0,00</span>
                            </div>
                            <div class="flex justify-between font-medium text-gray-700">
                                <span>Serviço (10%):</span>
                                <span id="serviceFeeValue">R$ 0,00</span>
                            </div>
                            <div class="flex justify-between text-2xl font-extrabold text-primary pt-1">
                                <span>TOTAL:</span>
                                <span id="totalValue">R$ 0,00</span>
                            </div>
                        </div>

                        <button id="saveOrderBtn" class="mt-4 bg-primary hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition duration-150 shadow-lg">
                            <i class="fas fa-save mr-2"></i> Salvar Pedido
                        </button>
                    </div>

                    <!-- Coluna do Cardápio (Direita/Rodapé) -->
                    <div class="md:w-2/3 lg:w-3/4 p-4 bg-gray-50 flex flex-col">
                        <div class="mb-4 flex items-center justify-between">
                            <h2 class="text-xl font-bold text-gray-800">Cardápio</h2>
                            <input type="text" id="menuSearch" placeholder="Buscar no cardápio..." class="p-2 border border-gray-300 rounded-lg w-1/2 md:w-1/3 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50 transition duration-150">
                        </div>
                        
                        <div id="menuCategories" class="flex flex-wrap gap-2 mb-4 border-b pb-2">
                            <!-- Categorias serão renderizadas aqui -->
                        </div>

                        <div id="menuItems" class="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 p-1">
                            <!-- Itens do cardápio serão renderizados aqui -->
                        </div>
                    </div>

                </div>
            </main>
        </div>

    </div> <!-- Fim Container Principal das Telas -->

    <!-- Modal de Confirmação de Fechamento de Mesa -->
    <div id="confirmCloseModal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div class="bg-white p-6 rounded-xl shadow-2xl w-full max-w-lg transform transition-all">
            <h3 class="text-2xl font-bold mb-4 text-red-600 border-b pb-2">Fechar Mesa e Pagamento</h3>
            
            <p class="mb-4 text-gray-700">Confirma o fechamento e pagamento da mesa <span id="closeModalTableName" class="font-bold"></span>?</p>
            
            <div id="closeModalOrderSummary" class="bg-gray-100 p-4 rounded-lg mb-4 space-y-1">
                <div class="flex justify-between"><span>Subtotal:</span> <span id="closeModalSubtotal">R$ 0,00</span></div>
                <div class="flex justify-between"><span>Serviço (10%):</span> <span id="closeModalServiceFee">R$ 0,00</span></div>
                <div class="flex justify-between font-bold text-lg text-primary border-t pt-2 mt-2">
                    <span>TOTAL GERAL:</span> <span id="closeModalTotal">R$ 0,00</span>
                </div>
            </div>

            <!-- Opções de Pagamento -->
            <div class="space-y-3 mb-6">
                <h4 class="font-semibold text-lg text-gray-800 border-b pb-1">Pagamentos</h4>
                <div id="paymentMethodsContainer" class="space-y-2">
                    <!-- Métodos de pagamento dinâmicos (Dinheiro, Cartão, PIX) -->
                </div>
                <div id="paymentInputContainer" class="flex space-x-2">
                    <select id="paymentMethodSelect" class="p-2 border rounded-lg flex-grow shadow-sm">
                        <option value="Dinheiro">Dinheiro</option>
                        <option value="Cartão">Cartão</option>
                        <option value="PIX">PIX</option>
                        <option value="Outro">Outro</option>
                    </select>
                    <input type="number" id="paymentValueInput" placeholder="Valor pago" class="p-2 border rounded-lg w-1/3 shadow-sm" step="0.01">
                    <button id="addPaymentBtn" class="bg-primary hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition duration-150">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
                
                <div class="flex justify-between font-bold text-red-600 text-xl pt-2 border-t mt-3">
                    <span>A Pagar (Restante):</span> <span id="remainingToPay">R$ 0,00</span>
                </div>
                <div class="flex justify-between font-bold text-green-600 text-xl">
                    <span>Troco:</span> <span id="changeValue">R$ 0,00</span>
                </div>
            </div>

            <div class="flex justify-end space-x-3">
                <button id="openTransferModalBtn" class="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg transition duration-150">
                    <i class="fas fa-exchange-alt mr-1"></i> Transferir Itens
                </button>
                <button id="openNFeModalBtn" class="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-150">
                    <i class="fas fa-file-invoice mr-1"></i> NFe
                </button>
                <button id="cancelCloseBtn" class="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-150">
                    Cancelar
                </button>
                <button id="confirmCloseBtn" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition duration-150 disabled:opacity-50" disabled>
                    <i class="fas fa-check mr-1"></i> Finalizar (R$ 0,00)
                </button>
            </div>
        </div>
    </div>

    <!-- Modal de Transferência de Itens -->
    <div id="transferModal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div class="bg-white p-6 rounded-xl shadow-2xl w-full max-w-2xl transform transition-all">
            <h3 class="text-2xl font-bold mb-4 text-yellow-600 border-b pb-2">Transferir Itens para Outra Mesa</h3>
            
            <p class="mb-4 text-gray-700">Selecione os itens para transferir e o destino.</p>

            <div class="flex space-x-4">
                <!-- Coluna de Itens da Mesa de Origem -->
                <div class="w-1/2">
                    <h4 class="font-semibold text-lg mb-2">Itens da Mesa <span id="transferOriginTableName" class="font-bold text-primary"></span></h4>
                    <div id="transferOriginItems" class="modal-content-scrollable bg-gray-50 p-3 rounded-lg space-y-2 border">
                        <!-- Itens da mesa de origem com checkboxes -->
                    </div>
                </div>

                <!-- Coluna de Seleção de Destino -->
                <div class="w-1/2">
                    <h4 class="font-semibold text-lg mb-2">Mesa de Destino</h4>
                    <select id="transferDestinationSelect" class="w-full p-2 border rounded-lg mb-4 shadow-sm">
                        <option value="">Selecione uma mesa...</option>
                        <!-- Opções de mesas ativas (exceto a atual) -->
                    </select>
                    
                    <button id="createDestinationTableBtn" class="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 rounded-lg transition duration-150 shadow-md">
                        <i class="fas fa-plus mr-1"></i> Criar Nova Mesa de Destino
                    </button>

                    <div id="transferSummary" class="mt-4 p-3 bg-yellow-100 rounded-lg">
                        <div class="flex justify-between font-semibold">
                            <span>Itens Selecionados:</span> <span id="transferItemCount">0</span>
                        </div>
                        <div class="flex justify-between font-semibold">
                            <span>Total dos Itens:</span> <span id="transferItemTotal">R$ 0,00</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="flex justify-end space-x-3 mt-6">
                <button id="cancelTransferBtn" class="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-150">
                    Cancelar
                </button>
                <button id="confirmTransferBtn" class="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded-lg transition duration-150 disabled:opacity-50" disabled>
                    <i class="fas fa-share-square mr-1"></i> Confirmar Transferência
                </button>
            </div>
        </div>
    </div>

    <!-- Modal de NFe -->
    <div id="nfeModal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div class="bg-white p-6 rounded-xl shadow-2xl w-full max-w-md transform transition-all">
            <h3 class="text-2xl font-bold mb-4 text-gray-800 border-b pb-2">Nota Fiscal Eletrônica (NFe)</h3>
            
            <p class="mb-4 text-gray-700">Informe o CPF ou CNPJ para a emissão da Nota Fiscal de Consumo Eletrônica (NFC-e).</p>
            
            <div class="mb-6">
                <label for="nfeDocInput" class="block text-sm font-medium text-gray-700 mb-1">CPF/CNPJ (Opcional)</label>
                <input type="text" id="nfeDocInput" placeholder="Ex: 123.456.789-00 ou 12.345.678/0001-90" class="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50 transition duration-150">
            </div>

            <div class="flex justify-end space-x-3">
                <button id="closeNFeModalBtn" class="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-150">
                    Cancelar
                </button>
                <button class="nfe-action-btn bg-primary hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition duration-150">
                    Emitir NFe
                </button>
                <button class="nfe-action-btn bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition duration-150">
                    NFe Sem Documento
                </button>
            </div>
        </div>
    </div>


    <script type="module">
        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { 
            getAuth, 
            signInAnonymously, 
            signInWithCustomToken, 
            onAuthStateChanged 
        } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { 
            getFirestore, 
            doc, 
            getDoc, 
            addDoc, 
            setDoc, 
            updateDoc, 
            deleteDoc, 
            onSnapshot, 
            collection, 
            query, 
            where, 
            getDocs,
            runTransaction,
            serverTimestamp
        } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
        import { setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

        // Configurações e Variáveis Globais (Fornecidas pelo ambiente Canvas)
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
        const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

        let app, db, auth, userId = null;
        let tablesUnsubscribe = null;
        let tableUnsubscribe = null; // Listener para a mesa atual
        let currentTableId = null;
        let currentTableData = null;
        let menuItems = [];
        let paymentMethods = [];

        // Ativa o log de debug do Firestore
        setLogLevel('Debug');

        // --- Funções Auxiliares de UI e Utilitários ---

        /** Exibe uma mensagem modal simples (substituindo alert) */
        function showMessage(message) {
            const messageBox = document.getElementById('messageBox');
            document.getElementById('messageText').textContent = message;
            messageBox.classList.remove('hidden', 'bg-red-100', 'border-red-500', 'text-red-700', 'bg-yellow-100', 'border-yellow-500', 'text-yellow-700');
            messageBox.classList.add('flex', 'flex-col', 'items-center', 'bg-white', 'border', 'border-primary', 'text-primary');
            document.getElementById('messageCloseBtn').focus();
        }

        /** Navega entre telas */
        function goToScreen(screenId) {
            document.querySelectorAll('.screen').forEach(screen => {
                if (screen.id === screenId) {
                    screen.classList.remove('hidden', 'z-0');
                    screen.classList.add('active-screen', 'z-10');
                } else {
                    screen.classList.remove('active-screen', 'z-10');
                    screen.classList.add('hidden', 'z-0');
                }
            });

            // Gerencia as inscrições (listeners) do Firestore
            if (screenId === 'panelScreen') {
                if (currentTableId) {
                    currentTableId = null;
                    currentTableData = null;
                    if (tableUnsubscribe) tableUnsubscribe();
                }
                subscribeToTables();
            } else if (screenId === 'tableScreen' && currentTableId) {
                if (tablesUnsubscribe) tablesUnsubscribe();
                subscribeToCurrentTable(currentTableId);
            }
        }
        
        /** Formata um número para moeda BRL */
        function formatCurrency(value) {
            return `R$ ${parseFloat(value || 0).toFixed(2).replace('.', ',')}`;
        }
        
        /** Converte data/hora do Firestore (Timestamp) para string curta */
        function formatTimestamp(timestamp) {
            if (!timestamp) return 'N/A';
            const date = timestamp.toDate();
            return date.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) + ' em ' + 
                   date.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
        }

        // --- Funções de Inicialização do Firebase e Autenticação ---

        async function initializeFirebase() {
            try {
                if (Object.keys(firebaseConfig).length === 0) {
                    console.error("Firebase config não está disponível.");
                    document.getElementById('loadingMessage').textContent = "Erro: Configuração do Firebase ausente.";
                    return;
                }
                app = initializeApp(firebaseConfig);
                db = getFirestore(app);
                auth = getAuth(app);

                // Autenticação (tentar com token personalizado primeiro)
                if (initialAuthToken) {
                    await signInWithCustomToken(auth, initialAuthToken);
                } else {
                    await signInAnonymously(auth);
                }

                onAuthStateChanged(auth, (user) => {
                    if (user) {
                        userId = user.uid;
                        document.getElementById('authStatus').textContent = `Usuário: ${userId.substring(0, 8)}...`;
                        console.log("Usuário autenticado:", userId);
                        // Inicia a aplicação após a autenticação
                        setupApp();
                    } else {
                        userId = null;
                        document.getElementById('authStatus').textContent = 'Usuário Anônimo';
                        console.log("Usuário deslogado/anônimo.");
                        // Tentativa de login anônimo
                        signInAnonymously(auth).catch(e => console.error("Erro ao tentar login anônimo:", e));
                    }
                });

            } catch (error) {
                console.error("Erro na inicialização do Firebase ou autenticação:", error);
                document.getElementById('loadingMessage').textContent = `Erro Fatal: ${error.message}`;
            }
        }

        // --- Funções de Data (Firestore) ---

        /** Obtém a referência da coleção de mesas (coleção pública) */
        function getTablesCollectionRef() {
            const path = `/artifacts/${appId}/public/data/tables`;
            return collection(db, path);
        }
        
        /** Obtém a referência da coleção de cardápio (coleção pública) */
        function getMenuCollectionRef() {
            const path = `/artifacts/${appId}/public/data/menu`;
            return collection(db, path);
        }

        /** Renderiza o cardápio e categorias a partir do Firestore (One-time fetch) */
        async function loadMenu() {
            try {
                const snapshot = await getDocs(getMenuCollectionRef());
                menuItems = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                
                // Mapeia categorias únicas
                const categories = ['Todas', ...new Set(menuItems.map(item => item.category).filter(c => c))];
                renderMenuCategories(categories);
                renderMenuItems(menuItems); // Renderiza todos inicialmente
            } catch (e) {
                console.error("Erro ao carregar cardápio:", e);
                showMessage(`Erro ao carregar o cardápio: ${e.message}`);
            }
        }

        /** Assina as atualizações das mesas (real-time) */
        function subscribeToTables() {
            if (tablesUnsubscribe) tablesUnsubscribe(); // Cancela o listener anterior
            
            const q = query(getTablesCollectionRef(), where("status", "==", "open"));
            
            tablesUnsubscribe = onSnapshot(q, (snapshot) => {
                const tables = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                renderTables(tables);
            }, (error) => {
                console.error("Erro ao ouvir mesas:", error);
                showMessage(`Erro de conexão com mesas: ${error.message}`);
            });
        }
        
        /** Assina as atualizações da mesa atual (real-time) */
        function subscribeToCurrentTable(tableId) {
            if (tableUnsubscribe) tableUnsubscribe(); // Cancela o listener anterior

            const tableRef = doc(getTablesCollectionRef(), tableId);
            
            tableUnsubscribe = onSnapshot(tableRef, (docSnap) => {
                if (docSnap.exists() && docSnap.data().status === 'open') {
                    currentTableData = { id: docSnap.id, ...docSnap.data() };
                    updateTableScreen(currentTableData);
                    calculateOrderSummary(currentTableData);
                } else {
                    // A mesa foi fechada/apagada (pode ter sido por outro usuário)
                    if (currentTableId === docSnap.id) {
                        showMessage(`A mesa ${currentTableId} foi fechada ou não existe mais.`);
                        goToScreen('panelScreen');
                    }
                }
            }, (error) => {
                console.error("Erro ao ouvir mesa atual:", error);
                showMessage(`Erro de conexão com a mesa atual: ${error.message}`);
            });
        }

        // --- Funções de Renderização e Lógica de UI (Painel) ---

        /** Renderiza a lista de mesas no painel */
        function renderTables(tables) {
            const container = document.getElementById('tablesContainer');
            container.innerHTML = '';
            
            if (tables.length === 0) {
                container.innerHTML = '<div class="col-span-full text-center text-gray-500 py-10">Nenhuma mesa ativa. Crie uma nova para começar.</div>';
                return;
            }

            tables.sort((a, b) => a.tableNumber - b.tableNumber).forEach(table => {
                // Calcula o total
                const { subtotal } = calculateTotals(table.orderItems || []);
                const total = subtotal * 1.10; // Subtotal + 10%

                const card = `
                    <div class="table-card bg-white p-4 rounded-xl shadow-lg hover:shadow-xl transition duration-300 cursor-pointer border-t-4 border-primary" data-id="${table.id}">
                        <div class="flex items-center justify-between mb-2">
                            <h3 class="text-2xl font-extrabold text-gray-800">Mesa ${table.tableNumber}</h3>
                            <span class="text-sm font-medium bg-primary text-white px-2 py-0.5 rounded-full">${table.orderItems ? table.orderItems.length : 0} Itens</span>
                        </div>
                        <p class="text-sm text-gray-500 mb-2 truncate">Criada por: ${table.createdBy.substring(0, 8)}...</p>
                        <p class="text-lg font-bold text-green-600">${formatCurrency(total)}</p>
                        <p class="text-xs text-gray-400 mt-1">Desde: ${formatTimestamp(table.createdAt)}</p>
                    </div>
                `;
                container.innerHTML += card;
            });
            
            // Adiciona evento de clique para abrir a mesa
            document.querySelectorAll('.table-card').forEach(card => {
                card.addEventListener('click', (e) => {
                    const tableId = e.currentTarget.getAttribute('data-id');
                    openTable(tableId);
                });
            });
        }
        
        /** Abre a tela de detalhe da mesa e inicia o listener */
        function openTable(tableId) {
            currentTableId = tableId;
            goToScreen('tableScreen'); // subscribeToCurrentTable é chamado dentro de goToScreen
        }
        
        /** Cria uma nova mesa */
        async function createNewTable() {
            if (!userId) {
                showMessage("Aguarde a autenticação inicial para criar uma mesa.");
                return;
            }

            // Simula a obtenção do próximo número de mesa (em um ambiente real, isto deve ser robusto)
            try {
                const snapshot = await getDocs(getTablesCollectionRef());
                const existingNumbers = snapshot.docs.map(doc => doc.data().tableNumber || 0);
                const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
                const newTableNumber = maxNumber + 1;
                
                const newTable = {
                    tableNumber: newTableNumber,
                    status: 'open',
                    createdAt: serverTimestamp(),
                    createdBy: userId,
                    orderItems: [] // Estrutura para os itens do pedido
                };

                const docRef = await addDoc(getTablesCollectionRef(), newTable);
                showMessage(`Mesa ${newTableNumber} (ID: ${docRef.id.substring(0, 8)}...) criada com sucesso!`);
                openTable(docRef.id);
                
            } catch (e) {
                console.error("Erro ao criar nova mesa:", e);
                showMessage(`Não foi possível criar a mesa: ${e.message}`);
            }
        }
        
        // --- Funções de Renderização e Lógica de UI (Mesa) ---

        /** Atualiza os dados da tela de detalhe da mesa */
        function updateTableScreen(data) {
            document.getElementById('tableNameHeader').textContent = `Mesa ${data.tableNumber}`;
            document.getElementById('tableIdHeader').textContent = `ID: ${data.id}`;
            renderOrderItems(data.orderItems || []);
        }

        /** Renderiza os itens do pedido atual */
        function renderOrderItems(items) {
            const container = document.getElementById('orderItems');
            container.innerHTML = '';
            
            if (items.length === 0) {
                document.getElementById('emptyOrderMessage').classList.remove('hidden');
                document.getElementById('saveOrderBtn').disabled = true;
                return;
            }
            document.getElementById('emptyOrderMessage').classList.add('hidden');
            document.getElementById('saveOrderBtn').disabled = false;


            items.forEach((item, index) => {
                const itemHtml = `
                    <div class="flex items-center space-x-2 p-2 bg-gray-50 rounded-lg shadow-sm">
                        <div class="flex-grow">
                            <p class="font-semibold text-gray-800">${item.name}</p>
                            <p class="text-sm text-gray-500">${item.quantity} x ${formatCurrency(item.price)}</p>
                        </div>
                        <span class="font-bold text-lg text-primary">${formatCurrency(item.quantity * item.price)}</span>
                        <button data-index="${index}" class="remove-item-btn text-red-500 hover:text-red-700 p-1 rounded-full transition duration-150" title="Remover Item">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                `;
                container.innerHTML += itemHtml;
            });

            // Adiciona listener para remover item
            document.querySelectorAll('.remove-item-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const index = parseInt(e.currentTarget.getAttribute('data-index'));
                    removeItemFromOrder(index);
                });
            });
        }
        
        /** Remove um item do pedido no front-end e prepara para salvar */
        function removeItemFromOrder(index) {
            if (currentTableData && currentTableData.orderItems && index >= 0 && index < currentTableData.orderItems.length) {
                // Remove o item no índice especificado
                currentTableData.orderItems.splice(index, 1); 
                
                // Força a atualização da UI com o novo array
                updateTableScreen(currentTableData);
                calculateOrderSummary(currentTableData);
            }
        }

        /** Adiciona um item ao pedido no front-end e prepara para salvar */
        function addItemToOrder(itemId, itemName, itemPrice) {
            if (!currentTableData) return showMessage("Erro: Mesa atual não está carregada.");

            const existingItemIndex = currentTableData.orderItems.findIndex(item => item.id === itemId);
            
            if (existingItemIndex > -1) {
                // Se o item já existe, apenas incrementa a quantidade
                currentTableData.orderItems[existingItemIndex].quantity += 1;
            } else {
                // Se o item é novo, adiciona
                currentTableData.orderItems.push({
                    id: itemId,
                    name: itemName,
                    price: itemPrice,
                    quantity: 1,
                    addedAt: serverTimestamp() // Timestamp para rastreamento (será atualizado no save)
                });
            }
            
            // Atualiza a UI e o resumo
            updateTableScreen(currentTableData);
            calculateOrderSummary(currentTableData);
        }

        /** Função para calcular o subtotal */
        function calculateTotals(items) {
            const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
            return { subtotal };
        }
        
        /** Calcula e exibe o resumo do pedido */
        function calculateOrderSummary(data) {
            if (!data || !data.orderItems) return;
            
            const { subtotal } = calculateTotals(data.orderItems);
            const serviceFee = subtotal * 0.10; // Taxa de serviço de 10%
            const total = subtotal + serviceFee;
            
            document.getElementById('subtotalValue').textContent = formatCurrency(subtotal);
            document.getElementById('serviceFeeValue').textContent = formatCurrency(serviceFee);
            document.getElementById('totalValue').textContent = formatCurrency(total);
        }

        /** Salva o pedido atual no Firestore */
        async function saveOrder() {
            if (!currentTableId || !currentTableData) {
                return showMessage("Erro ao salvar: Nenhum pedido ativo.");
            }
            
            // Certifica-se de que o timestamp de atualização é o mais recente
            const updatedOrderItems = currentTableData.orderItems.map(item => ({
                ...item,
                addedAt: item.addedAt || serverTimestamp() // Garante que todos têm timestamp
            }));
            
            try {
                const tableRef = doc(getTablesCollectionRef(), currentTableId);
                await updateDoc(tableRef, {
                    orderItems: updatedOrderItems,
                    lastUpdatedAt: serverTimestamp()
                });
                showMessage(`Pedido da Mesa ${currentTableData.tableNumber} salvo com sucesso!`);
                // O listener (onSnapshot) se encarrega de atualizar currentTableData
            } catch (e) {
                console.error("Erro ao salvar pedido:", e);
                showMessage(`Erro ao salvar pedido: ${e.message}`);
            }
        }
        
        /** Renderiza as categorias do cardápio */
        function renderMenuCategories(categories) {
            const container = document.getElementById('menuCategories');
            container.innerHTML = '';
            
            categories.forEach(category => {
                const btn = document.createElement('button');
                btn.textContent = category;
                btn.className = 'category-btn px-4 py-2 rounded-full text-sm font-medium transition duration-150';
                
                if (category === 'Todas') {
                    btn.classList.add('bg-primary', 'text-white', 'shadow-md');
                    btn.setAttribute('data-category', 'Todas');
                } else {
                    btn.classList.add('bg-gray-200', 'text-gray-700', 'hover:bg-primary', 'hover:text-white');
                    btn.setAttribute('data-category', category);
                }
                
                btn.addEventListener('click', () => filterMenuItems(category));
                container.appendChild(btn);
            });
        }
        
        /** Filtra e renderiza os itens do cardápio */
        function renderMenuItems(items) {
            const container = document.getElementById('menuItems');
            container.innerHTML = '';
            
            if (items.length === 0) {
                container.innerHTML = '<div class="col-span-full text-center text-gray-500 py-10">Nenhum item encontrado.</div>';
                return;
            }

            items.forEach(item => {
                const itemHtml = `
                    <div class="bg-white p-3 rounded-xl shadow-lg flex flex-col justify-between h-40">
                        <!-- Título (AGORA text-base) -->
                        <div class="text-base font-semibold mb-1 truncate" data-id="${item.id}">${item.name}</div>
                        
                        <!-- Valor (AGORA text-lg) -->
                        <div class="text-lg font-bold text-primary mb-2">R$ ${item.price.toFixed(2).replace('.', ',')}</div>
                        
                        <!-- Botão '+' (AGORA text-lg) -->
                        <button onclick="addItemToOrder('${item.id}', '${item.name}', ${item.price})" class="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition duration-150 text-lg">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                `;
                container.innerHTML += itemHtml;
            });
        }

        /** Lógica de filtragem dos itens do cardápio */
        function filterMenuItems(category, searchTerm = '') {
            let filtered = menuItems;

            // Filtro por categoria
            if (category && category !== 'Todas') {
                filtered = filtered.filter(item => item.category === category);
            }
            
            // Filtro por termo de busca
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                filtered = filtered.filter(item => 
                    item.name.toLowerCase().includes(term) || 
                    item.category.toLowerCase().includes(term)
                );
            }
            
            // Atualiza a UI das categorias
            document.querySelectorAll('.category-btn').forEach(btn => {
                if (btn.getAttribute('data-category') === category) {
                    btn.classList.add('bg-primary', 'text-white', 'shadow-md');
                    btn.classList.remove('bg-gray-200', 'text-gray-700', 'hover:bg-primary', 'hover:text-white');
                } else {
                    btn.classList.remove('bg-primary', 'text-white', 'shadow-md');
                    btn.classList.add('bg-gray-200', 'text-gray-700', 'hover:bg-primary', 'hover:text-white');
                }
            });

            renderMenuItems(filtered);
        }
        
        // --- Funções de Lógica de Fechamento/Pagamento (Modal) ---
        
        /** Exibe o modal de fechamento e preenche os dados */
        function showCloseModal() {
            if (!currentTableData) return;

            const { subtotal } = calculateTotals(currentTableData.orderItems || []);
            const serviceFee = subtotal * 0.10;
            const total = subtotal + serviceFee;
            
            // Variáveis globais/temporárias para controle de pagamento
            let payments = []; 
            let totalPaid = 0;
            let remaining = total;
            let change = 0;
            
            const modal = document.getElementById('confirmCloseModal');
            document.getElementById('closeModalTableName').textContent = currentTableData.tableNumber;
            document.getElementById('closeModalSubtotal').textContent = formatCurrency(subtotal);
            document.getElementById('closeModalServiceFee').textContent = formatCurrency(serviceFee);
            document.getElementById('closeModalTotal').textContent = formatCurrency(total);
            
            const paymentsContainer = document.getElementById('paymentMethodsContainer');
            const remainingToPayEl = document.getElementById('remainingToPay');
            const changeValueEl = document.getElementById('changeValue');
            const confirmCloseBtn = document.getElementById('confirmCloseBtn');
            const paymentValueInput = document.getElementById('paymentValueInput');
            
            // Função interna para renderizar e recalcular
            const updatePaymentUI = () => {
                totalPaid = payments.reduce((sum, p) => sum + p.value, 0);
                remaining = total - totalPaid;
                change = 0;
                
                if (remaining < 0) {
                    change = -remaining;
                    remaining = 0;
                    remainingToPayEl.classList.add('text-gray-500');
                    remainingToPayEl.classList.remove('text-red-600');
                    changeValueEl.classList.add('text-green-600');
                    changeValueEl.classList.remove('text-gray-500');
                    confirmCloseBtn.disabled = false;
                    confirmCloseBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
                    confirmCloseBtn.classList.add('bg-green-700', 'hover:bg-green-800');
                    confirmCloseBtn.textContent = `Troco: ${formatCurrency(change)}`;
                } else {
                    remainingToPayEl.classList.remove('text-gray-500');
                    remainingToPayEl.classList.add('text-red-600');
                    changeValueEl.classList.remove('text-green-600');
                    changeValueEl.classList.add('text-gray-500');
                    confirmCloseBtn.disabled = remaining > 0.01;
                    confirmCloseBtn.classList.add('bg-green-600', 'hover:bg-green-700');
                    confirmCloseBtn.classList.remove('bg-green-700', 'hover:bg-green-800');
                    confirmCloseBtn.textContent = `Finalizar (${formatCurrency(total)})`;
                }

                remainingToPayEl.textContent = formatCurrency(remaining);
                changeValueEl.textContent = formatCurrency(change);
                
                // Renderiza métodos de pagamento
                paymentsContainer.innerHTML = payments.map((p, index) => `
                    <div class="flex justify-between items-center text-sm bg-gray-200 p-2 rounded-lg">
                        <span>${p.method}</span>
                        <div class="flex items-center space-x-2">
                            <span class="font-semibold">${formatCurrency(p.value)}</span>
                            <button data-index="${index}" class="remove-payment-btn text-red-500 hover:text-red-700 transition duration-150" title="Remover Pagamento">
                                <i class="fas fa-times-circle"></i>
                            </button>
                        </div>
                    </div>
                `).join('');
                
                // Adiciona listeners para remover pagamento
                document.querySelectorAll('.remove-payment-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const index = parseInt(e.currentTarget.getAttribute('data-index'));
                        payments.splice(index, 1);
                        updatePaymentUI();
                    });
                });
            };

            // Inicializa a UI
            updatePaymentUI();
            
            // Listener para adicionar pagamento
            document.getElementById('addPaymentBtn').onclick = () => {
                const method = document.getElementById('paymentMethodSelect').value;
                const value = parseFloat(paymentValueInput.value);
                
                if (isNaN(value) || value <= 0) {
                    return showMessage("Por favor, insira um valor de pagamento válido.");
                }
                
                payments.push({ method, value });
                paymentValueInput.value = ''; // Limpa o input
                updatePaymentUI();
            };
            
            // Listener para o botão de confirmação de fechamento
            confirmCloseBtn.onclick = async () => {
                if (confirmCloseBtn.disabled) return;
                
                // Lógica de fechamento
                if (!currentTableId || !currentTableData) {
                    modal.classList.add('hidden');
                    return showMessage("Erro: Mesa não carregada para fechamento.");
                }
                
                try {
                    const tableRef = doc(getTablesCollectionRef(), currentTableId);
                    await updateDoc(tableRef, {
                        status: 'closed', // Marca como fechada
                        closedAt: serverTimestamp(),
                        payments: payments,
                        totalPaid: totalPaid,
                        totalAmount: total,
                        change: change
                    });

                    showMessage(`Mesa ${currentTableData.tableNumber} fechada com sucesso! Total: ${formatCurrency(total)}. Pago: ${formatCurrency(totalPaid)}. Troco: ${formatCurrency(change)}`);
                    
                    // Limpa o estado e volta para o painel
                    modal.classList.add('hidden');
                    currentTableId = null;
                    currentTableData = null;
                    if (tableUnsubscribe) tableUnsubscribe(); 
                    goToScreen('panelScreen'); 
                } catch(e) {
                    console.error("Erro ao fechar mesa:", e);
                    showMessage(`Erro ao fechar mesa: ${e.message}`);
                    modal.classList.add('hidden');
                }
            };
            
            modal.classList.remove('hidden');
            paymentValueInput.focus();
        }
        
        // --- Funções de Lógica de Transferência (Modal) ---
        
        /** Exibe o modal de transferência e preenche os dados */
        async function showTransferModal() {
            if (!currentTableData) return;

            const modal = document.getElementById('transferModal');
            document.getElementById('transferOriginTableName').textContent = currentTableData.tableNumber;
            const originItemsContainer = document.getElementById('transferOriginItems');
            const destinationSelect = document.getElementById('transferDestinationSelect');
            const transferSummaryCount = document.getElementById('transferItemCount');
            const transferSummaryTotal = document.getElementById('transferItemTotal');
            const confirmTransferBtn = document.getElementById('confirmTransferBtn');
            
            // Estado temporário para a transferência
            let selectedItems = [];
            
            // 1. Renderiza os Itens da Mesa de Origem
            originItemsContainer.innerHTML = '';
            if (!currentTableData.orderItems || currentTableData.orderItems.length === 0) {
                originItemsContainer.innerHTML = '<p class="text-gray-500 italic">Esta mesa não tem itens para transferir.</p>';
                confirmTransferBtn.disabled = true;
                return;
            }

            currentTableData.orderItems.forEach((item, index) => {
                const itemId = `transfer-item-${index}`;
                const itemHtml = `
                    <div class="flex items-center justify-between p-2 rounded-lg hover:bg-white transition duration-100 border-b last:border-b-0">
                        <label for="${itemId}" class="flex-grow flex items-center cursor-pointer">
                            <input type="checkbox" id="${itemId}" data-index="${index}" data-price="${item.price}" data-quantity="${item.quantity}" class="transfer-item-checkbox mr-3 h-4 w-4 text-yellow-600 focus:ring-yellow-500 rounded border-gray-300">
                            <span class="font-medium text-gray-800">${item.quantity}x ${item.name}</span>
                        </label>
                        <span class="font-bold text-sm text-gray-600">${formatCurrency(item.quantity * item.price)}</span>
                    </div>
                `;
                originItemsContainer.innerHTML += itemHtml;
            });

            // 2. Renderiza as Mesas de Destino Ativas
            destinationSelect.innerHTML = '<option value="">Selecione uma mesa...</option>';
            try {
                const snapshot = await getDocs(getTablesCollectionRef());
                snapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() }))
                    .filter(table => table.status === 'open' && table.id !== currentTableId) // Exclui a mesa de origem
                    .sort((a, b) => a.tableNumber - b.tableNumber)
                    .forEach(table => {
                        destinationSelect.innerHTML += `<option value="${table.id}">Mesa ${table.tableNumber} (${formatCurrency(calculateTotals(table.orderItems || []).subtotal * 1.10)})</option>`;
                    });
            } catch (e) {
                console.error("Erro ao carregar mesas para transferência:", e);
            }

            // 3. Lógica de Seleção de Itens e Atualização do Resumo
            const updateTransferSummary = () => {
                selectedItems = Array.from(document.querySelectorAll('.transfer-item-checkbox:checked')).map(cb => {
                    const index = parseInt(cb.getAttribute('data-index'));
                    return currentTableData.orderItems[index];
                });
                
                const totalSelected = selectedItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
                
                transferSummaryCount.textContent = selectedItems.length;
                transferSummaryTotal.textContent = formatCurrency(totalSelected);
                
                // Habilita o botão se houver itens selecionados E um destino válido
                const isDestinationSelected = destinationSelect.value !== '';
                confirmTransferBtn.disabled = selectedItems.length === 0 || !isDestinationSelected;
            };

            document.querySelectorAll('.transfer-item-checkbox').forEach(cb => {
                cb.addEventListener('change', updateTransferSummary);
            });
            destinationSelect.addEventListener('change', updateTransferSummary);
            
            // 4. Lógica de Confirmação de Transferência
            confirmTransferBtn.onclick = async () => {
                if (confirmTransferBtn.disabled) return;
                
                const destinationTableId = destinationSelect.value;
                if (!destinationTableId) return showMessage("Selecione uma mesa de destino.");

                // Usa Transaction para garantir atomicidade
                try {
                    await runTransaction(db, async (transaction) => {
                        const originRef = doc(getTablesCollectionRef(), currentTableId);
                        const destinationRef = doc(getTablesCollectionRef(), destinationTableId);

                        const originSnap = await transaction.get(originRef);
                        const destinationSnap = await transaction.get(destinationRef);
                        
                        if (!originSnap.exists() || !destinationSnap.exists()) {
                            throw new Error("Mesa de origem ou destino não existe mais.");
                        }

                        const originData = originSnap.data();
                        const destinationData = destinationSnap.data();
                        
                        // Array de índices dos itens selecionados (para remover da origem)
                        const selectedIndices = Array.from(document.querySelectorAll('.transfer-item-checkbox:checked'))
                                                .map(cb => parseInt(cb.getAttribute('data-index')));
                        
                        // 1. Prepara a lista de itens a ser removida (mantém os itens NÃO selecionados)
                        const newOriginItems = originData.orderItems.filter((_, index) => !selectedIndices.includes(index));
                        
                        // 2. Prepara a lista de itens a ser adicionada ao destino
                        const itemsToTransfer = selectedItems.map(item => ({
                            ...item,
                            addedAt: serverTimestamp() // Atualiza o timestamp para a nova mesa
                        }));
                        
                        const newDestinationItems = [...(destinationData.orderItems || []), ...itemsToTransfer];

                        // 3. Atualiza a mesa de origem
                        transaction.update(originRef, {
                            orderItems: newOriginItems,
                            lastUpdatedAt: serverTimestamp()
                        });

                        // 4. Atualiza a mesa de destino
                        transaction.update(destinationRef, {
                            orderItems: newDestinationItems,
                            lastUpdatedAt: serverTimestamp()
                        });
                    });
                    
                    modal.classList.add('hidden');
                    showMessage(`Transferência de ${selectedItems.length} itens da Mesa ${currentTableData.tableNumber} realizada com sucesso!`);
                    // A UI da mesa atual será automaticamente atualizada pelo onSnapshot

                } catch (e) {
                    modal.classList.add('hidden');
                    console.error("Erro na transação de transferência:", e);
                    showMessage(`Erro ao transferir: ${e.message}`);
                }
            };

            // 5. Lógica de Criar Nova Mesa de Destino
            document.getElementById('createDestinationTableBtn').onclick = async () => {
                 try {
                    const snapshot = await getDocs(getTablesCollectionRef());
                    const existingNumbers = snapshot.docs.map(doc => doc.data().tableNumber || 0);
                    const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
                    const newTableNumber = maxNumber + 1;
                    
                    const newTable = {
                        tableNumber: newTableNumber,
                        status: 'open',
                        createdAt: serverTimestamp(),
                        createdBy: userId,
                        orderItems: [] 
                    };

                    const docRef = await addDoc(getTablesCollectionRef(), newTable);
                    
                    // Recarrega as opções do select e seleciona a nova mesa
                    await showTransferModal(); 
                    destinationSelect.value = docRef.id;
                    updateTransferSummary();
                    showMessage(`Mesa ${newTableNumber} criada como destino.`);
                    
                } catch (e) {
                    console.error("Erro ao criar nova mesa de destino:", e);
                    showMessage(`Não foi possível criar a mesa de destino: ${e.message}`);
                }
            };

            modal.classList.remove('hidden');
        }
        
        // --- Setup Inicial e Listeners Globais ---
        
        function setupApp() {
            // 1. Carrega dados do Cardápio (One-time)
            loadMenu();
            
            // 2. Inicia o listener de mesas no painel
            goToScreen('panelScreen'); // Chama subscribeToTables()
            
            // 3. Configura Listeners de Navegação/Ação (fora do modal)
            document.getElementById('backToPanelBtn').addEventListener('click', () => {
                // Ao voltar, desfaz quaisquer alterações não salvas no currentTableData
                if (tableUnsubscribe) tableUnsubscribe(); // Cancela o listener
                subscribeToCurrentTable(currentTableId); // Reaplica o listener para restaurar os dados originais
                goToScreen('panelScreen');
            });
            document.getElementById('refreshTablesBtn').addEventListener('click', subscribeToTables);
            document.getElementById('createTableBtn').addEventListener('click', createNewTable);
            document.getElementById('saveOrderBtn').addEventListener('click', saveOrder);
            document.getElementById('openCloseModalBtn').addEventListener('click', showCloseModal);
            
            // 4. Configura Listener de Busca no Cardápio
            document.getElementById('menuSearch').addEventListener('input', (e) => {
                const currentCategoryBtn = document.querySelector('#menuCategories .bg-primary');
                const currentCategory = currentCategoryBtn ? currentCategoryBtn.getAttribute('data-category') : 'Todas';
                filterMenuItems(currentCategory, e.target.value);
            });
            
            // 5. Configura Listeners do Modal de Confirmação/Pagamento
            document.getElementById('cancelCloseBtn').addEventListener('click', () => {
                document.getElementById('confirmCloseModal').classList.add('hidden');
            });
            document.getElementById('openTransferModalBtn').addEventListener('click', () => {
                document.getElementById('confirmCloseModal').classList.add('hidden'); // Fecha modal principal
                showTransferModal(); // Abre modal de transferência
            });
            document.getElementById('openNFeModalBtn').addEventListener('click', () => {
                document.getElementById('confirmCloseModal').classList.add('hidden'); // Fecha modal principal
                document.getElementById('nfeModal').classList.remove('hidden'); // Abre modal NFe
            });

            // 6. Configura Listeners do Modal de NFe
            document.getElementById('closeNFeModalBtn').addEventListener('click', () => {
                document.getElementById('nfeModal').classList.add('hidden');
            });
            document.querySelectorAll('.nfe-action-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const action = btn.textContent.trim();
                    const doc = document.getElementById('nfeDocInput').value.trim();
                    showMessage(`Simulação de ${action}: Nota Fiscal emitida! CPF/CNPJ: ${doc || 'Não informado'}.`);
                    document.getElementById('nfeModal').classList.add('hidden');
                });
            });

            // 7. Configura Listeners do Modal de Transferência
            document.getElementById('cancelTransferBtn').addEventListener('click', () => {
                document.getElementById('transferModal').classList.add('hidden');
                // Opcional: Reabrir o modal de fechamento se a transferência foi iniciada a partir dele
                // showCloseModal();
            });
            
            // 8. Listener da caixa de mensagem
            document.getElementById('messageCloseBtn').addEventListener('click', () => {
                 document.getElementById('messageBox').classList.add('hidden');
            });

        } // Fim do setupApp

        window.onload = initializeFirebase;

        // Expõe funções ao escopo global (para onclick no HTML renderizado)
        window.addItemToOrder = addItemToOrder;
        window.filterMenuItems = filterMenuItems;

    </script>
</body>
</html>
