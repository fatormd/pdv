// --- CONTROLLERS/CLIENTORDERCONTROLLER.JS (Layout Atualizado, Filtros Corrigidos, Comentário Removido DEFINITIVAMENTE - COMPLETO v4) ---

// Importa funções necessárias dos serviços e do app principal
import { getProducts, getCategories, fetchWooCommerceProducts, fetchWooCommerceCategories } from "/services/wooCommerceService.js";
// ATUALIZADO: Importa formatCurrency
import { formatCurrency } from "/utils.js";
import { saveSelectedItemsToFirebase } from "/services/firebaseService.js";
import { currentTableId, selectedItems, userRole, currentOrderSnapshot, goToScreen, setCurrentTable } from "/app.js";
import { arrayUnion, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getTableDocRef, getCustomersCollectionRef } from "/services/firebaseService.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// --- VARIÁVEIS DE ELEMENTOS ---
// Mapeia os elementos HTML que este controlador irá manipular
let clientObsModal, clientObsInput, clientSaveObsBtn, clientCancelObsBtn;
let clientSearchProductInput, clientCategoryFiltersContainer, clientMenuItemsGrid;
let clientObsItemName, clientEsperaSwitch; // Elementos do modal de observação
let clientAssocModal, assocTableInput, assocPhoneInput, assocNameInput, assocSendOrderBtn, assocErrorMsg, assocCancelBtn; // Elementos do modal de associação
// ATUALIZADO: Adiciona elementos do modal de info
let clientProductInfoModal, infoProductName, infoProductDescription, infoProductImage, infoProductPrice, infoProductImageLink; // Elementos do modal de informação do produto

// --- ESTADO LOCAL DO MÓDULO ---
// Guarda o estado atual da busca e filtro de categoria
let currentClientSearch = '';
let currentClientCategoryFilter = 'all';
let clientInitialized = false; // Flag para garantir que a inicialização ocorra apenas uma vez
let associatedClientDocId = null; // Guarda o ID (telefone) do cliente associado à mesa

// --- LÓGICA DE MANIPULAÇÃO DE ITENS LOCAIS (Cliente) ---
// Função interna para adicionar ou remover itens do array 'selectedItems' (carrinho local)
const _updateLocalItemQuantity = (itemId, noteKey, delta) => {
    let indexToRemove = -1;
    // Se delta < 0, procura o último item correspondente para remover
    if (delta < 0) {
        for (let i = selectedItems.length - 1; i >= 0; i--) {
            if (selectedItems[i].id == itemId && (selectedItems[i].note || '') === noteKey) {
                indexToRemove = i;
                break;
            }
        }
    }

    // Se delta > 0, adiciona uma cópia do último item correspondente (ou um novo se não existir)
    if (delta > 0) {
        const itemToCopy = selectedItems.findLast(item => item.id == itemId && (item.note || '') === noteKey);
        if (itemToCopy) {
            selectedItems.push({ ...itemToCopy }); // Adiciona cópia
        } else {
            // Se não encontrou cópia (primeira vez adicionando com essa nota), busca dados do produto
            const products = getProducts();
            const product = products.find(p => p.id == itemId);
            if (!product) {
                console.error(`Produto com ID ${itemId} não encontrado para adicionar.`);
                return; // Aborta se produto não existe
            }
            // Cria novo item
            const newItem = { id: product.id, name: product.name, price: product.price, sector: product.sector || 'cozinha', category: product.category || 'uncategorized', note: noteKey };
            selectedItems.push(newItem);
        }
    } else if (delta < 0 && indexToRemove !== -1) {
        // Remove o item se delta < 0 e um índice foi encontrado
        selectedItems.splice(indexToRemove, 1);
    }

    renderClientOrderScreen(); // Atualiza a exibição do carrinho
    if (currentTableId) {
        // Salva o estado atualizado no Firebase se houver uma mesa associada
        saveSelectedItemsToFirebase(currentTableId, selectedItems);
    }
};

// Funções exportadas que chamam a função interna (usadas pelos onClicks no HTML)
export const increaseLocalItemQuantity = (itemId, noteKey) => _updateLocalItemQuantity(itemId, noteKey, 1);
export const decreaseLocalItemQuantity = (itemId, noteKey) => _updateLocalItemQuantity(itemId, noteKey, -1);
// As funções acima são atribuídas a window dinamicamente em app.js


// Chamado pelo botão '+' ou pelo modal OBS quando um novo item é adicionado
export const addClientItemToSelection = (product) => {
    const newItem = {
        id: product.id,
        name: product.name,
        price: product.price,
        sector: product.sector || 'cozinha', // Assume 'cozinha' como padrão
        category: product.category || 'uncategorized', // Assume 'uncategorized' como padrão
        note: '' // Nota inicial vazia
    };

    selectedItems.push(newItem); // Adiciona ao array local 'selectedItems' (importado de app.js)
    renderClientOrderScreen(); // Atualiza a exibição da lista de itens selecionados

    if (currentTableId) {
        // Salva no Firebase se já houver mesa associada
        saveSelectedItemsToFirebase(currentTableId, selectedItems);
    }

    // Abre o modal de observação para o item recém-adicionado
    openClientObsModalForGroup(product.id, '');
};


// --- FUNÇÕES DE RENDERIZAÇÃO DE MENU (Cliente) ---
export const renderClientMenu = () => {
    console.log("[Client] renderClientMenu CALLED");
    if (!clientMenuItemsGrid || !clientCategoryFiltersContainer) {
        console.error("[Client] renderClientMenu ABORTED - Grid or Filters container not found.");
        return;
    }

    const products = getProducts(); // Pega a lista de produtos (já deve ter sido carregada)
    const categories = getCategories(); // Pega a lista de categorias
    console.log(`[Client] renderClientMenu - Products: ${products.length}, Categories: ${categories.length}`);

    // CORREÇÃO 1: Renderiza/Atualiza Filtros de Categoria SEMPRE que houver categorias
    if (categories.length > 0) {
        const categoryButtonsHTML = categories.map(cat => {
            const isActive = cat.slug === currentClientCategoryFilter; // Verifica se é o filtro ativo
            const inactiveClasses = 'bg-dark-input text-dark-text border border-dark-border';
            const activeClasses = 'bg-pumpkin text-white border-pumpkin';
            // Gera o HTML do botão
            return `<button class="category-btn text-base px-4 py-2 rounded-full font-semibold whitespace-nowrap ${isActive ? activeClasses : inactiveClasses}" data-category="${cat.slug || cat.id}">${cat.name}</button>`;
        }).join('');
        // Atualiza o conteúdo do container de filtros
        clientCategoryFiltersContainer.innerHTML = categoryButtonsHTML;
    } else {
        // Se não houver categorias (exceto 'Todos'), limpa a área de filtros
        clientCategoryFiltersContainer.innerHTML = '';
        console.warn("[Client] Nenhuma categoria encontrada para renderizar filtros.");
    }

    // 2. Filtra Produtos baseado na busca e categoria selecionada
    let filteredProducts = products;
    if (currentClientSearch) { // Filtra por busca (texto no nome)
        const normalizedSearch = currentClientSearch.toLowerCase();
        filteredProducts = filteredProducts.filter(p => p.name.toLowerCase().includes(normalizedSearch));
    }
    if (currentClientCategoryFilter !== 'all') { // Filtra por categoria (se não for 'Todos')
        filteredProducts = filteredProducts.filter(p => p.category === currentClientCategoryFilter);
    }

    // 3. Renderiza os Cards de Produtos filtrados (HTML ATUALIZADO e DEFINITIVAMENTE LIMPO)
    if (filteredProducts.length === 0) {
        // Mensagem se nenhum produto corresponder aos filtros
        clientMenuItemsGrid.innerHTML = `<div class="col-span-full text-center p-6 text-dark-placeholder italic">Nenhum produto encontrado com os filtros atuais.</div>`;
    } else {
        // Gera o HTML para cada card de produto
        clientMenuItemsGrid.innerHTML = filteredProducts.map(product => {
            // Prepara a string JSON do produto para ser usada nos atributos data-product dos botões
            const productDataString = JSON.stringify(product).replace(/'/g, '&#39;');

            // 
            // /===================================================\
            // | INÍCIO DA ATUALIZAÇÃO DO CARD (HTML)              |
            // \===================================================/
            //
            return `
        <div class="w-1/2 md:w-1/3 lg:w-1/4 p-0.5">
            <div class="product-card bg-dark-card border border-dark-border rounded-xl shadow-md overflow-hidden flex flex-col h-full">

                <img src="${product.image}" alt="${product.name}" class="w-full h-56 md:h-64 object-cover cursor-pointer info-img-trigger" data-product='${productDataString}'>

                <div class="p-3 flex flex-col flex-grow">

                    <h4 class="font-bold text-base text-dark-text mb-2 cursor-pointer info-name-trigger" data-product='${productDataString}'>${product.name}</h4>

                    <div class="flex justify-between items-center mt-auto mb-3">
                        <span class="font-bold text-base text-pumpkin">${formatCurrency(product.price)}</span>
                        <button class="add-item-btn bg-green-600 text-white p-2 rounded-full hover:bg-green-700 transition w-9 h-9 flex items-center justify-center"
                                data-product='${productDataString}' title="Adicionar ao Pedido">
                            <i class="fas fa-plus text-base pointer-events-none"></i>
                        </button>
                    </div>

                    <button class="info-btn w-full bg-indigo-600 text-white text-xs font-semibold py-2 rounded-lg hover:bg-indigo-700 transition"
                            data-product='${productDataString}'>
                        <i class="fas fa-info-circle mr-1"></i> Descrição
                    </button>
                </div>
            </div>
        </div>
            `;
            // 
            // /===================================================\
            // | FIM DA ATUALIZAÇÃO DO CARD (HTML)                 |
            // \===================================================/
            //
        }).join('');
    }
    console.log("[Client] renderClientMenu FINISHED rendering.");
};


// Função de Renderização da Lista de Pedidos do Cliente (Carrinho)
export const renderClientOrderScreen = () => {
    const openOrderList = document.getElementById('openOrderListClient'); // Container da lista
    const openItemsCount = document.getElementById('openItemsCountClient'); // Span do contador
    const sendBtn = document.getElementById('sendClientOrderBtn'); // Botão de enviar pedido

    if (!openOrderList) {
        console.error("Elemento openOrderListClient não encontrado.");
        return; // Aborta se o container não existe
    }

    const openItemsCountValue = selectedItems.length; // Pega o número de itens no carrinho
    if(openItemsCount) openItemsCount.textContent = openItemsCountValue; // Atualiza o contador

    // Habilita/desabilita botão de enviar pedido baseado se há itens
    if (sendBtn) {
        sendBtn.disabled = openItemsCountValue === 0;
    }

    // Se o carrinho está vazio, exibe mensagem
    if (openItemsCountValue === 0) {
        openOrderList.innerHTML = `<div class="text-sm md:text-base text-dark-placeholder italic p-2">Nenhum item selecionado.</div>`;
    } else {
        // Agrupa itens iguais com a mesma observação para exibição mais limpa
        const groupedItems = selectedItems.reduce((acc, item) => {
            const key = `${item.id}-${item.note || ''}`; // Chave única por item + nota
            if (!acc[key]) {
                acc[key] = { ...item, count: 0 }; // Inicializa grupo se não existe
            }
            acc[key].count++; // Incrementa contador do grupo
            return acc;
        }, {});

        // Gera o HTML para cada grupo de item no carrinho
        openOrderList.innerHTML = Object.values(groupedItems).map(group => `
            <div class="flex justify-between items-center bg-dark-input p-3 rounded-lg shadow-sm border border-dark-border">
                <div class="flex flex-col flex-grow min-w-0 mr-2">
                    <span class="font-semibold text-dark-text">${group.name} (${group.count}x)</span>
                    <span class="text-sm cursor-pointer text-indigo-400 hover:text-indigo-300"
                          onclick="window.openClientObsModalForGroup('${group.id}', '${group.note || ''}')">
                        ${group.note ? `(${group.note})` : `(Adicionar Obs.)`}
                    </span>
                </div>
                <div class="flex items-center space-x-2 flex-shrink-0">
                    <button class="qty-btn bg-red-600 text-white rounded-full h-8 w-8 flex items-center justify-center hover:bg-red-700 transition duration-150"
                            onclick="window.decreaseLocalItemQuantity('${group.id}', '${group.note || ''}')" title="Remover um">
                        <i class="fas fa-minus pointer-events-none"></i>
                    </button>
                    <button class="qty-btn bg-green-600 text-white rounded-full h-8 w-8 flex items-center justify-center hover:bg-green-700 transition duration-150"
                            onclick="window.increaseLocalItemQuantity('${group.id}', '${group.note || ''}')" title="Adicionar um">
                        <i class="fas fa-plus pointer-events-none"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }
};

// --- FUNÇÕES DE MODAL ---

// Abertura do Modal de Observações (Cliente - Apenas Quick Buttons)
export function openClientObsModalForGroup(itemId, noteKey) {
    const products = getProducts();
    const product = products.find(p => p.id == itemId); // Encontra o produto pelo ID

    // Validação
    if (!clientObsModal || !clientObsItemName || !clientObsInput || !product) {
        console.error("Erro ao abrir modal OBS: Elementos ou produto não encontrados.");
        return;
    }

    clientObsItemName.textContent = product.name; // Exibe nome do produto no modal

    // Limpa a tag [EM ESPERA] (não aplicável ao cliente) e preenche o input
    const currentNoteCleaned = noteKey.replace(' [EM ESPERA]', '').trim();
    clientObsInput.value = currentNoteCleaned;
    clientObsInput.readOnly = true; // Input desabilitado para digitação
    clientObsInput.placeholder = "Use os botões rápidos abaixo.";

    // Armazena dados no modal para referência ao salvar
    clientObsModal.dataset.itemId = itemId;
    clientObsModal.dataset.originalNoteKey = noteKey;

    // Garante que o switch de espera (se visível) esteja desmarcado
    if (clientEsperaSwitch) clientEsperaSwitch.checked = false;

    clientObsModal.style.display = 'flex'; // Exibe o modal
}
// Expõe a função globalmente para ser chamada pelo onclick no HTML
window.openClientObsModalForGroup = openClientObsModalForGroup;


//
// /===================================================\
// | INÍCIO DA ATUALIZAÇÃO (Lógica do Modal de Info)   |
// \===================================================/
//
// Define a função para abrir o modal de informações do produto
export const openProductInfoModal = (product) => {
    // Validação dos elementos do modal
    if (!clientProductInfoModal || !infoProductName || !infoProductDescription || !infoProductImage || !infoProductPrice || !infoProductImageLink) {
        console.error("Elementos do Modal de Informação do Produto não encontrados.");
        return;
    }
    console.log("[Client] Opening Product Info Modal for:", product.name);

    // Popula os dados do modal com as informações do produto
    infoProductName.textContent = product.name;
    // Adicionado: Popula o preço
    infoProductPrice.textContent = formatCurrency(product.price);
    // Usa innerHTML pois a descrição vinda do WooCommerce pode ter HTML (<p>, <strong>)
    infoProductDescription.innerHTML = product.description;
    infoProductImage.src = product.image; // Define a URL da imagem (ou placeholder)
    // Adicionado: Define o link da imagem (para abrir em nova aba)
    infoProductImageLink.href = product.image;
    // Adicionado: Armazena os dados do produto no próprio modal
    clientProductInfoModal.dataset.product = JSON.stringify(product);


    // Exibe o modal
    clientProductInfoModal.style.display = 'flex';
};
//
// /===================================================\
// | FIM DA ATUALIZAÇÃO (Lógica do Modal de Info)      |
// \===================================================/
//
// Atribui ao window para sobrescrever o placeholder em app.js e ser chamada pelo listener
window.openProductInfoModal = openProductInfoModal;


// --- FUNÇÃO PRINCIPAL: Envio de Pedido pelo Cliente ---
export const handleClientSendOrder = async () => {
    // Verifica se há itens no carrinho
    if (selectedItems.length === 0) {
        alert("Adicione itens ao seu pedido antes de enviar.");
        return;
    }

    // Verifica se o cliente já está associado a uma mesa
    if (!currentTableId) {
        // Se não, abre o modal de associação
        if (clientAssocModal) clientAssocModal.style.display = 'flex';
        if(assocErrorMsg) {
             assocErrorMsg.textContent = "Para enviar seu pedido, preencha a mesa e seu contato.";
             assocErrorMsg.classList.remove('text-red-400'); // Garante estilo padrão
             assocErrorMsg.classList.add('text-dark-placeholder');
             assocErrorMsg.style.display = 'block';
        }
        return; // Interrompe até associar
    }

    // Confirmação com o usuário
    if (!confirm(`Confirmar o envio de ${selectedItems.length} item(s) para o Garçom? O garçom deve aprovar o pedido antes de enviá-lo à cozinha.`)) return;

    const btn = document.getElementById('sendClientOrderBtn');
    if (btn) btn.disabled = true; // Desabilita botão

    try {
        const tableRef = getTableDocRef(currentTableId); // Referência do documento da mesa

        // Monta o objeto do pedido pendente
        const requestedOrder = {
            orderId: `req_${Date.now()}`, // ID único baseado no timestamp
            items: selectedItems.map(item => ({...item, requestedAt: Date.now()})), // Adiciona timestamp a cada item
            requestedAt: Date.now(),
            status: 'pending_waiter', // Status inicial
            clientInfo: { // Informações do cliente que fez o pedido
                 docId: associatedClientDocId, // Telefone/ID
                 name: currentOrderSnapshot?.clientName || 'Cliente Comanda', // Nome (se associado) ou padrão
                 phone: associatedClientDocId || 'N/A'
            }
        };

        // Atualiza o documento da mesa no Firestore
        await updateDoc(tableRef, {
            requestedOrders: arrayUnion(requestedOrder), // Adiciona o novo pedido à lista de pendentes
            selectedItems: [], // Limpa o carrinho 'selectedItems' (usado pelo garçom)
            clientOrderPending: true, // Liga a flag de alerta para o garçom
            waiterNotification: { type: 'client_request', timestamp: serverTimestamp() } // Objeto de notificação
        });

        // Limpa o carrinho local do cliente APÓS o envio bem-sucedido
        selectedItems.length = 0;
        renderClientOrderScreen(); // Re-renderiza a lista (agora vazia)

        alert(`Pedido enviado! Aguarde a confirmação do seu Garçom.`);

    } catch (e) {
        console.error("Erro ao enviar pedido do cliente:", e);
        alert("Falha ao enviar pedido para o Garçom/Firebase. Tente novamente.");
    } finally {
        if (btn) btn.disabled = false; // Reabilita o botão
    }
};

// Lógica de Associação à Mesa e Envio do Pedido (Chamada pelo Modal de Associação)
export const handleClientAssociationAndSend = async () => {
    const tableNumber = assocTableInput?.value.trim();
    const phone = assocPhoneInput?.value.replace(/\D/g, ''); // Remove caracteres não numéricos
    const name = assocNameInput?.value.trim() || 'Cliente Comanda'; // Nome padrão se vazio

    // Validações
    if (!tableNumber || tableNumber === '0') {
         assocErrorMsg.textContent = "Número da mesa é obrigatório.";
         assocErrorMsg.style.display = 'block';
         return;
    }
    if (phone.length < 10) { // Validação simples de telefone
         assocErrorMsg.textContent = "Telefone/WhatsApp inválido. Inclua DDD (mínimo 10 dígitos).";
         assocErrorMsg.style.display = 'block';
         return;
    }
    assocErrorMsg.style.display = 'none'; // Limpa erro

    if (assocSendOrderBtn) { assocSendOrderBtn.disabled = true; assocSendOrderBtn.textContent = 'Verificando...'; }

    try {
        // Verifica se a mesa existe e está aberta
        const tableRef = getTableDocRef(tableNumber);
        const docSnap = await getDoc(tableRef);

        if (!docSnap.exists() || docSnap.data().status?.toLowerCase() !== 'open') {
            assocErrorMsg.textContent = `Mesa ${tableNumber} não encontrada ou não está aberta. Verifique o número.`;
            assocErrorMsg.style.display = 'block';
            if (assocSendOrderBtn) { assocSendOrderBtn.disabled = false; assocSendOrderBtn.textContent = 'Enviar Pedido'; }
            return;
        }

        // Salva/Atualiza dados do cliente na coleção 'customers'
        const customersRef = getCustomersCollectionRef();
        const clientDocId = phone; // Usa o telefone como ID único do cliente
        const clientDocRef = doc(customersRef, clientDocId);
        const clientData = {
            name: name,
            phone: phone,
            associatedTable: tableNumber, // Guarda a última mesa associada
            lastVisit: serverTimestamp(), // Atualiza timestamp da última visita/associação
        };
        await setDoc(clientDocRef, clientData, { merge: true }); // Cria ou atualiza

        // Define a mesa atual no estado global e inicia o listener
        associatedClientDocId = clientDocId; // Guarda o ID do cliente
        setCurrentTable(tableNumber, true); // O 'true' indica que é o modo cliente

        // Se o cliente já tinha itens no carrinho antes de associar, salva-os na mesa
        if (selectedItems.length > 0) {
            await saveSelectedItemsToFirebase(tableNumber, selectedItems);
        }

        // Fecha o modal de associação
        if (clientAssocModal) clientAssocModal.style.display = 'none';

        // Tenta enviar o pedido que estava pendente (ou os itens recém-salvos)
        handleClientSendOrder();

    } catch (error) {
         console.error("[ASSOCIAÇÃO CLIENTE] Erro:", error);
         assocErrorMsg.textContent = `Falha na associação/cadastro: ${error.message}. Tente novamente.`;
         assocErrorMsg.style.display = 'block';
    } finally {
        if (assocSendOrderBtn) { assocSendOrderBtn.disabled = false; assocSendOrderBtn.textContent = 'Enviar Pedido'; }
    }
};


// Listener para os Botões Rápidos no Modal de Observação do Cliente
const handleQuickButtonClient = (e) => {
    const btn = e.target.closest('.quick-obs-btn'); // Encontra o botão clicado
    if (btn && clientObsInput) { // Verifica se é um botão rápido e o input existe
        const obsText = btn.dataset.obs; // Pega o texto da observação do botão
        let currentValue = clientObsInput.value.trim(); // Pega o valor atual do input

        // Adiciona vírgula e espaço antes da nova obs, se necessário
        if (currentValue && !currentValue.endsWith(',') && currentValue.length > 0) {
            currentValue += ', ';
        } else if (currentValue.endsWith(',')) {
            currentValue += ' '; // Apenas espaço se já termina com vírgula
        }
        // Concatena a nova observação
        clientObsInput.value = (currentValue + obsText).trim();
    }
};

// Função chamada ao clicar em "Salvar" no Modal de Observação do Cliente
const handleSaveClientObs = () => {
    const itemId = clientObsModal.dataset.itemId; // ID do item sendo editado
    const originalNoteKey = clientObsModal.dataset.originalNoteKey; // Nota original (chave de agrupamento)
    let newNote = clientObsInput.value.trim(); // Nova nota (montada pelos botões rápidos)

    newNote = newNote.replace(/ \[EM ESPERA\]/gi, '').trim(); // Remove tag de espera (precaução)

    let updated = false; // Flag para indicar se alguma atualização ocorreu

    // Cria um NOVO array com os itens atualizados
    const updatedItems = selectedItems.map(item => {
        // Se o item corresponde ao ID E à nota original, atualiza a nota
        if (item.id == itemId && (item.note || '') === originalNoteKey) {
            updated = true;
            return { ...item, note: newNote }; // Retorna o item com a nova nota
        }
        return item; // Retorna o item original se não corresponder
    });

    // Se houve atualização, substitui o array 'selectedItems' global
    if (updated) {
        selectedItems.length = 0; // Limpa o array original
        selectedItems.push(...updatedItems); // Adiciona os itens atualizados

        clientObsModal.style.display = 'none'; // Fecha o modal
        renderClientOrderScreen(); // Re-renderiza a lista de pedidos com a nota atualizada
        if (currentTableId) {
            saveSelectedItemsToFirebase(currentTableId, selectedItems); // Salva no Firebase
        }
    } else {
        // Caso raro onde o item foi removido enquanto o modal estava aberto
        console.warn("Nenhum item encontrado para atualizar a observação.");
        clientObsModal.style.display = 'none'; // Fecha o modal mesmo assim
    }
};

// --- INICIALIZAÇÃO DO CONTROLLER DO CLIENTE ---
export const initClientOrderController = () => {
    console.log("[ClientOrderController] initClientOrderController CALLED");
    if(clientInitialized) {
        console.log("[ClientOrderController] Already initialized.");
        return; // Impede re-inicialização
    }

    // Mapeia os elementos HTML essenciais para variáveis
    clientObsModal = document.getElementById('obsModal');
    clientObsItemName = document.getElementById('obsItemName');
    clientObsInput = document.getElementById('obsInput');
    clientSaveObsBtn = document.getElementById('saveObsBtn');
    clientCancelObsBtn = document.getElementById('cancelObsBtn');
    clientEsperaSwitch = document.getElementById('esperaSwitch'); // Mesmo oculto, mapeia por segurança

    clientAssocModal = document.getElementById('associationModal');
    assocTableInput = document.getElementById('assocTableNumber');
    assocPhoneInput = document.getElementById('assocPhone');
    assocNameInput = document.getElementById('assocName');
    assocSendOrderBtn = document.getElementById('assocSendOrderBtn');
    assocErrorMsg = document.getElementById('assocErrorMsg');
    assocCancelBtn = document.getElementById('assocCancelBtn');

    clientSearchProductInput = document.getElementById('searchProductInputClient');
    clientCategoryFiltersContainer = document.getElementById('categoryFiltersClient');
    clientMenuItemsGrid = document.getElementById('menuItemsGridClient');

    //
    // /===================================================\
    // | INÍCIO DA ATUALIZAÇÃO (Mapeamento de elementos)   |
    // \===================================================/
    //
    // Mapeia elementos do Modal de Info
    clientProductInfoModal = document.getElementById('productInfoModal');
    infoProductName = document.getElementById('infoProductName');
    infoProductDescription = document.getElementById('infoProductDescription');
    infoProductImage = document.getElementById('infoProductImage');
    // Adicionados:
    infoProductPrice = document.getElementById('infoProductPrice');
    infoProductImageLink = document.getElementById('infoProductImageLink');
    //
    // /===================================================\
    // | FIM DA ATUALIZAÇÃO (Mapeamento de elementos)      |
    // \===================================================/
    //


    // Validação CRÍTICA: Verifica se todos os elementos essenciais foram encontrados
    const essentialElements = [
        clientObsModal, clientAssocModal, clientMenuItemsGrid, clientProductInfoModal,
        clientSearchProductInput, clientCategoryFiltersContainer, clientSaveObsBtn, clientCancelObsBtn,
        assocSendOrderBtn, assocCancelBtn, 
        // Adicionados:
        infoProductName, infoProductDescription, infoProductImage, infoProductPrice, infoProductImageLink
    ];
    if (essentialElements.some(el => !el)) {
        console.error("[ClientController] Erro Fatal: Elementos críticos não encontrados no HTML. Verifique os IDs. Aborting initialization.");
        // Exibe mensagem de erro para o usuário final
        const body = document.querySelector('body');
        if (body) body.innerHTML = '<p style="color: red; text-align: center; margin-top: 50px;">Erro ao carregar a interface. Os elementos necessários não foram encontrados. Tente recarregar a página.</p>';
        return; // Aborta a inicialização
    }
    console.log("[ClientOrderController] Essential elements mapped.");


    // Adiciona os Listeners (ouvintes de eventos) aos elementos
    const sendClientBtn = document.getElementById('sendClientOrderBtn');
    if (sendClientBtn) sendClientBtn.addEventListener('click', handleClientSendOrder);

    if (assocSendOrderBtn) assocSendOrderBtn.addEventListener('click', handleClientAssociationAndSend);
    if (assocCancelBtn) assocCancelBtn.addEventListener('click', () => { if(clientAssocModal) clientAssocModal.style.display = 'none'; });

    // Listeners do Modal OBS
    if (clientSaveObsBtn) clientSaveObsBtn.addEventListener('click', handleSaveClientObs);
    if (clientCancelObsBtn) clientCancelObsBtn.addEventListener('click', () => {
        const itemId = clientObsModal.dataset.itemId;
        const originalNoteKey = clientObsModal.dataset.originalNoteKey;
        const currentNote = clientObsInput.value.trim();

        // Lógica para remover item recém-adicionado se cancelar modal OBS vazio
        if (originalNoteKey === '' && currentNote === '') {
             let lastIndex = -1;
             for (let i = selectedItems.length - 1; i >= 0; i--) { // Procura de trás pra frente
                 if (selectedItems[i].id == itemId && selectedItems[i].note === '') {
                     lastIndex = i;
                     break;
                 }
             }
             if (lastIndex > -1) {
                 selectedItems.splice(lastIndex, 1); // Remove o item
                 renderClientOrderScreen(); // Re-renderiza o carrinho
                 if (currentTableId) saveSelectedItemsToFirebase(currentTableId, selectedItems); // Salva
                 console.log("[Client] Item recém-adicionado cancelado e removido.");
             }
        }
        clientObsModal.style.display = 'none'; // Fecha o modal de qualquer forma
    });

    // Listener para input de busca
    if (clientSearchProductInput) {
        clientSearchProductInput.addEventListener('input', (e) => {
            currentClientSearch = e.target.value; // Atualiza estado da busca
            renderClientMenu(); // Re-renderiza o menu com o filtro
        });
    }

    // Listener para botões de filtro de categoria (delegação de evento)
    if (clientCategoryFiltersContainer) {
        clientCategoryFiltersContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.category-btn'); // Acha o botão clicado
            if (btn) {
                currentClientCategoryFilter = btn.dataset.category; // Atualiza estado do filtro
                renderClientMenu(); // Re-renderiza o menu
            }
        });
    }

    // Event Delegation para cliques no grid de produtos (ATUALIZADO para nova estrutura de card)
    if (clientMenuItemsGrid) {
        clientMenuItemsGrid.addEventListener('click', (e) => {
            let productData; // Variável para guardar os dados do produto
            const clickedElement = e.target; // O elemento exato que recebeu o clique

            // Tenta encontrar o elemento PAI mais próximo que contém os dados do produto
            // Isso funciona se clicar na imagem, nome, botão info ou botão add
            const dataElement = clickedElement.closest('[data-product]');

            // Se encontrou um elemento com dados, tenta parsear
            if (dataElement && dataElement.dataset.product) {
                try {
                    productData = JSON.parse(dataElement.dataset.product.replace(/&#39;/g, "'"));
                } catch (err) {
                    console.error("Erro ao parsear dados do produto no clique:", err, dataElement.dataset.product);
                    return; // Aborta se não conseguir ler os dados
                }
            } else {
                // Se o elemento clicado (ou seus pais próximos) não tem data-product, ignora
                // console.log("[Client Click] Clicked element without product data.");
                return;
            }

            // Agora, com productData disponível, verifica QUAL parte foi clicada
            if (clickedElement.closest('.info-btn')) {
                // Clicou no botão "Descrição"
                console.log("[Client Click] Info button clicked.");
                openProductInfoModal(productData);

            } else if (clickedElement.closest('.info-img-trigger') || clickedElement.closest('.info-name-trigger')) {
                // Clicou na Imagem ou no Nome (que também abrem o modal info)
                console.log("[Client Click] Info trigger (img/name) clicked.");
                openProductInfoModal(productData);

            } else if (clickedElement.closest('.add-item-btn')) {
                // Clicou no botão "+"
                console.log("[Client Click] Add button clicked.");
                addClientItemToSelection(productData);

            } else if (clickedElement.closest('.product-card')) {
                // Clicou em outra área do card (sem ação definida por enquanto)
                console.log("[Client Click] Card area clicked (no specific action).");
            }
        });
    } else {
        console.error("[ClientOrderController] menuItemsGrid NOT FOUND for attaching listener.");
    }

    // Listener para botões rápidos no modal OBS (delegação de evento)
    const quickObsButtons = document.getElementById('quickObsButtons');
    if (quickObsButtons) {
        quickObsButtons.addEventListener('click', handleQuickButtonClient);
    }
    
    //
    // /===================================================\
    // | INÍCIO DA ATUALIZAÇÃO (Listener do botão do Modal)|
    // \===================================================/
    //
    const infoProductAddBtn = document.getElementById('infoProductAddBtn');
    if (infoProductAddBtn) {
        infoProductAddBtn.addEventListener('click', () => {
            // Pega os dados do produto armazenados no modal
            const productDataString = clientProductInfoModal.dataset.product;
            if (productDataString) {
                try {
                    const product = JSON.parse(productDataString);
                    // Reutiliza a função existente para adicionar o item
                    addClientItemToSelection(product);
                    // Fecha o modal após adicionar
                    clientProductInfoModal.style.display = 'none'; 
                } catch (e) {
                    console.error("Erro ao adicionar produto pelo modal", e);
                    alert("Não foi possível adicionar o produto.");
                }
            }
        });
    }
    //
    // /===================================================\
    // | FIM DA ATUALIZAÇÃO (Listener do botão do Modal)   |
    // \===================================================/
    //


    // Busca os dados iniciais do WooCommerce (Produtos e Categorias)
    // Passa 'renderClientMenu' como callback para ser executada após cada busca bem-sucedida
    console.log("[ClientOrderController] Fetching WooCommerce data...");
    fetchWooCommerceProducts(renderClientMenu)
        .then(() => console.log("[ClientOrderController] Products fetched successfully."))
        .catch(e => console.error("[ClientController INIT] Falha CRÍTICA ao carregar produtos:", e));

    fetchWooCommerceCategories(renderClientMenu)
        .then(() => console.log("[ClientOrderController] Categories fetched successfully."))
        .catch(e => console.error("[ClientController INIT] Falha CRÍTICA ao carregar categorias:", e));


    clientInitialized = true; // Marca como inicializado para evitar re-execução
    console.log("[ClientOrderController] initClientOrderController FINISHED.");
};
