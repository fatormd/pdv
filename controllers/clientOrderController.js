// --- CONTROLLERS/CLIENTORDERCONTROLLER.JS (Layout Atualizado com Imagem e Botão Info - Completo) ---

// ATUALIZADO: Importa os 'fetchers' além dos 'getters'
import { getProducts, getCategories, fetchWooCommerceProducts, fetchWooCommerceCategories } from "/services/wooCommerceService.js";
import { formatCurrency } from "/utils.js";
import { saveSelectedItemsToFirebase } from "/services/firebaseService.js";
import { currentTableId, selectedItems, userRole, currentOrderSnapshot, goToScreen, setCurrentTable } from "/app.js";
import { arrayUnion, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getTableDocRef, getCustomersCollectionRef } from "/services/firebaseService.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// --- VARIÁVEIS DE ELEMENTOS ---
let clientObsModal, clientObsInput, clientSaveObsBtn, clientCancelObsBtn;
let clientSearchProductInput, clientCategoryFiltersContainer, clientMenuItemsGrid;
let clientObsItemName, clientEsperaSwitch;
let clientAssocModal, assocTableInput, assocPhoneInput, assocNameInput, assocSendOrderBtn, assocErrorMsg, assocCancelBtn;

// NOVO: Variáveis para o Modal de Informação do Produto
let clientProductInfoModal, infoProductName, infoProductDescription, infoProductImage;

// Estado local
let currentClientSearch = '';
let currentClientCategoryFilter = 'all';
let clientInitialized = false;
let associatedClientDocId = null;

// --- LÓGICA DE MANIPULAÇÃO DE ITENS LOCAIS (Cliente) ---
const _updateLocalItemQuantity = (itemId, noteKey, delta) => {
    let indexToRemove = -1;
    if (delta < 0) {
        for (let i = selectedItems.length - 1; i >= 0; i--) {
            if (selectedItems[i].id == itemId && (selectedItems[i].note || '') === noteKey) {
                indexToRemove = i;
                break;
            }
        }
    }

    if (delta > 0) {
        const itemToCopy = selectedItems.findLast(item => item.id == itemId && (item.note || '') === noteKey);
        if (itemToCopy) {
            selectedItems.push({ ...itemToCopy });
        } else {
            const products = getProducts();
            const product = products.find(p => p.id == itemId);
            if (!product) return;
            const newItem = { id: product.id, name: product.name, price: product.price, sector: product.sector || 'cozinha', category: product.category || 'uncategorized', note: noteKey };
            selectedItems.push(newItem);
        }
    } else if (delta < 0 && indexToRemove !== -1) {
        selectedItems.splice(indexToRemove, 1);
    }

    renderClientOrderScreen(); // Re-renderiza a lista do carrinho
    if (currentTableId) {
        // Salva o estado atualizado no Firebase se houver uma mesa associada
        saveSelectedItemsToFirebase(currentTableId, selectedItems);
    }
};

export const increaseLocalItemQuantity = (itemId, noteKey) => _updateLocalItemQuantity(itemId, noteKey, 1);
export const decreaseLocalItemQuantity = (itemId, noteKey) => _updateLocalItemQuantity(itemId, noteKey, -1);
// window.increase/decrease são definidos dinamicamente em app.js para o escopo global


// Chamado pelo botão + do cardápio do cliente (AGORA VIA EVENT DELEGATION)
export const addClientItemToSelection = (product) => {
    const newItem = {
        id: product.id,
        name: product.name,
        price: product.price,
        sector: product.sector || 'cozinha',
        category: product.category || 'uncategorized',
        note: '' // Nota inicial vazia
    };

    selectedItems.push(newItem); // Adiciona ao array local 'selectedItems' (importado de app.js)
    renderClientOrderScreen(); // Atualiza a exibição da lista de itens selecionados

    if (currentTableId) {
        // Salva o array atualizado no Firebase se já houver uma mesa associada
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

    const products = getProducts(); // Pega os produtos já buscados
    const categories = getCategories(); // Pega as categorias já buscadas
    console.log(`[Client] renderClientMenu - Products: ${products.length}, Categories: ${categories.length}`);

    // 1. Renderiza Filtros de Categoria (se ainda não renderizados)
    if (categories.length > 0 && clientCategoryFiltersContainer.innerHTML.trim() === '') {
        clientCategoryFiltersContainer.innerHTML = categories.map(cat => {
            const isActive = cat.slug === currentClientCategoryFilter;
            const inactiveClasses = 'bg-dark-input text-dark-text border border-dark-border';
            const activeClasses = 'bg-pumpkin text-white border-pumpkin';
            return `<button class="category-btn text-base px-4 py-2 rounded-full font-semibold whitespace-nowrap ${isActive ? activeClasses : inactiveClasses}" data-category="${cat.slug || cat.id}">${cat.name}</button>`;
        }).join('');
    }
     // Atualiza o estado ativo dos botões de categoria
     clientCategoryFiltersContainer.querySelectorAll('.category-btn').forEach(btn => {
        const isActive = btn.dataset.category === currentClientCategoryFilter;
        btn.classList.toggle('bg-pumpkin', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('border-pumpkin', isActive);
        btn.classList.toggle('bg-dark-input', !isActive);
        btn.classList.toggle('text-dark-text', !isActive);
        btn.classList.toggle('border-dark-border', !isActive);
    });

    // 2. Filtra Produtos baseado no estado atual (busca e categoria)
    let filteredProducts = products;
    if (currentClientSearch) {
        const normalizedSearch = currentClientSearch.toLowerCase();
        filteredProducts = filteredProducts.filter(p => p.name.toLowerCase().includes(normalizedSearch));
    }
    if (currentClientCategoryFilter !== 'all') {
        filteredProducts = filteredProducts.filter(p => p.category === currentClientCategoryFilter);
    }

    // 3. Renderiza Itens do Cardápio (HTML ATUALIZADO com novo layout)
    if (filteredProducts.length === 0) {
        clientMenuItemsGrid.innerHTML = `<div class="col-span-full text-center p-6 text-dark-placeholder italic">Nenhum produto encontrado com os filtros atuais.</div>`;
    } else {
        clientMenuItemsGrid.innerHTML = filteredProducts.map(product => {
            const productDataString = JSON.stringify(product).replace(/'/g, '&#39;'); // Prepara os dados para os botões

            return `
            <div class="product-card bg-dark-card border border-dark-border rounded-xl shadow-md overflow-hidden flex flex-col">

                <img src="${product.image}" alt="${product.name}" class="w-full h-32 md:h-40 object-cover cursor-pointer info-img-trigger" data-product='${productDataString}'>

                <div class="p-3 flex flex-col flex-grow">
                    <h4 class="font-bold text-base text-dark-text mb-2 flex-grow cursor-pointer info-name-trigger" data-product='${productDataString}'>${product.name}</h4>

                    <div class="flex justify-between items-center mt-auto mb-3"> {/* Use mt-auto para empurrar para baixo */}
                        <span class="font-bold text-lg text-pumpkin">${formatCurrency(product.price)}</span>
                        <button class="add-item-btn bg-green-600 text-white p-2 rounded-full hover:bg-green-700 transition w-9 h-9 flex items-center justify-center"
                                data-product='${productDataString}' title="Adicionar ao Pedido">
                            <i class="fas fa-plus text-base pointer-events-none"></i>
                        </button>
                    </div>

                    <button class="info-btn w-full bg-indigo-600 text-white text-xs font-semibold py-2 rounded-lg hover:bg-indigo-700 transition"
                            data-product='${productDataString}'>
                        <i class="fas fa-info-circle mr-1"></i> Informações
                    </button>
                </div>
            </div>
            `;
        }).join('');
    }
    console.log("[Client] renderClientMenu FINISHED rendering.");
};


// Função de Renderização da Lista de Pedidos do Cliente (Carrinho)
export const renderClientOrderScreen = () => {
    const openOrderList = document.getElementById('openOrderListClient');
    const openItemsCount = document.getElementById('openItemsCountClient');
    const sendBtn = document.getElementById('sendClientOrderBtn');

    if (!openOrderList) {
        console.error("Elemento openOrderListClient não encontrado.");
        return;
    }

    const openItemsCountValue = selectedItems.length;
    if(openItemsCount) openItemsCount.textContent = openItemsCountValue;

    // Habilita/desabilita botão de enviar pedido
    if (sendBtn) {
        sendBtn.disabled = openItemsCountValue === 0;
    }

    if (openItemsCountValue === 0) {
        openOrderList.innerHTML = `<div class="text-sm md:text-base text-dark-placeholder italic p-2">Nenhum item selecionado.</div>`;
    } else {
        // Agrupa itens iguais com a mesma observação para exibição
        const groupedItems = selectedItems.reduce((acc, item) => {
            const key = `${item.id}-${item.note || ''}`;
            if (!acc[key]) {
                acc[key] = { ...item, count: 0 };
            }
            acc[key].count++;
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
    const product = products.find(p => p.id == itemId);

    if (!clientObsModal || !clientObsItemName || !clientObsInput || !product) {
        console.error("Erro ao abrir modal OBS: Elementos ou produto não encontrados.");
        return;
    }

    clientObsItemName.textContent = product.name;

    // Limpa a tag [EM ESPERA] se existir (não aplicável ao cliente, mas por segurança)
    const currentNoteCleaned = noteKey.replace(' [EM ESPERA]', '').trim();
    clientObsInput.value = currentNoteCleaned;
    clientObsInput.readOnly = true; // Cliente só usa botões rápidos
    clientObsInput.placeholder = "Use os botões rápidos abaixo.";

    // Guarda o ID e a nota original para referência ao salvar
    clientObsModal.dataset.itemId = itemId;
    clientObsModal.dataset.originalNoteKey = noteKey;

    // Garante que o switch de espera (se visível) esteja desmarcado
    if (clientEsperaSwitch) clientEsperaSwitch.checked = false;

    clientObsModal.style.display = 'flex'; // Exibe o modal
}
// Expõe a função globalmente para ser chamada pelo onclick no HTML
window.openClientObsModalForGroup = openClientObsModalForGroup;

// Define a função para abrir o modal de info e a expõe globalmente
export const openProductInfoModal = (product) => {
    if (!clientProductInfoModal || !infoProductName || !infoProductDescription || !infoProductImage) {
        console.error("Elementos do Modal de Informação do Produto não encontrados.");
        return;
    }
    console.log("[Client] Opening Product Info Modal for:", product.name);
    // Popula os dados do modal
    infoProductName.textContent = product.name;
    // Usa innerHTML para renderizar a descrição formatada (pode conter <p>, <strong>, etc.)
    infoProductDescription.innerHTML = product.description;
    infoProductImage.src = product.image; // Define a URL da imagem (ou placeholder)

    // Exibe o modal
    clientProductInfoModal.style.display = 'flex';
};
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
        // Se não estiver, abre o modal de associação
        if (clientAssocModal) clientAssocModal.style.display = 'flex';
        if(assocErrorMsg) {
             assocErrorMsg.textContent = "Para enviar seu pedido, preencha a mesa e seu contato.";
             assocErrorMsg.classList.remove('text-red-400'); // Garante estilo padrão
             assocErrorMsg.classList.add('text-dark-placeholder');
             assocErrorMsg.style.display = 'block';
        }
        return; // Interrompe o envio até associar
    }

    // Confirmação com o usuário
    if (!confirm(`Confirmar o envio de ${selectedItems.length} item(s) para o Garçom? O garçom deve aprovar o pedido antes de enviá-lo à cozinha.`)) return;

    const btn = document.getElementById('sendClientOrderBtn');
    if (btn) btn.disabled = true; // Desabilita o botão durante o envio

    try {
        const tableRef = getTableDocRef(currentTableId);

        // Cria o objeto do pedido pendente
        const requestedOrder = {
            orderId: `req_${Date.now()}`, // ID único para o pedido pendente
            items: selectedItems.map(item => ({...item, requestedAt: Date.now()})), // Adiciona timestamp a cada item
            requestedAt: Date.now(),
            status: 'pending_waiter', // Status inicial
            clientInfo: {
                 docId: associatedClientDocId, // Telefone/ID do cliente
                 name: currentOrderSnapshot?.clientName || 'Cliente Comanda', // Nome associado à mesa ou padrão
                 phone: associatedClientDocId || 'N/A'
            }
        };

        // Atualiza o documento da mesa no Firestore
        await updateDoc(tableRef, {
            requestedOrders: arrayUnion(requestedOrder), // Adiciona o pedido à lista de pendentes
            selectedItems: [], // Limpa o carrinho local do garçom (embora o cliente use o seu)
            clientOrderPending: true, // Sinaliza que há pedido pendente
            waiterNotification: { type: 'client_request', timestamp: serverTimestamp() } // Notifica o garçom
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

// Lógica de Associação e Envio (Chamada pelo Modal de Associação)
export const handleClientAssociationAndSend = async () => {
    const tableNumber = assocTableInput?.value.trim();
    const phone = assocPhoneInput?.value.replace(/\D/g, ''); // Remove não-números
    const name = assocNameInput?.value.trim() || 'Cliente Comanda'; // Usa nome padrão se vazio

    // Validações básicas
    if (!tableNumber || tableNumber === '0') {
         assocErrorMsg.textContent = "Número da mesa é obrigatório.";
         assocErrorMsg.style.display = 'block';
         return;
    }
    if (phone.length < 10) { // Validação simples de telefone (DDD + 8 ou 9 dígitos)
         assocErrorMsg.textContent = "Telefone/WhatsApp inválido. Inclua DDD (mínimo 10 dígitos).";
         assocErrorMsg.style.display = 'block';
         return;
    }
    assocErrorMsg.style.display = 'none'; // Limpa erro se passou

    // Desabilita botão durante o processo
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

        // Salva/Atualiza dados do cliente (usando telefone como ID)
        const customersRef = getCustomersCollectionRef();
        const clientDocId = phone; // Telefone como ID
        const clientDocRef = doc(customersRef, clientDocId);

        const clientData = {
            name: name,
            phone: phone,
            associatedTable: tableNumber, // Guarda a mesa atual associada
            lastVisit: serverTimestamp(),
        };
        // Usa set com merge:true para criar ou atualizar o cliente
        await setDoc(clientDocRef, clientData, { merge: true });

        // Atualiza estado global
        associatedClientDocId = clientDocId;
        setCurrentTable(tableNumber, true); // Define a mesa atual E inicia o listener para ela

        // Salva itens que já estavam no carrinho ANTES de associar
        if (selectedItems.length > 0) {
            await saveSelectedItemsToFirebase(tableNumber, selectedItems);
        }

        // Fecha o modal de associação
        if (clientAssocModal) clientAssocModal.style.display = 'none';

        // Tenta enviar o pedido que estava pendente
        handleClientSendOrder();

    } catch (error) {
         console.error("[ASSOCIAÇÃO CLIENTE] Erro:", error);
         assocErrorMsg.textContent = `Falha na associação/cadastro: ${error.message}. Tente novamente.`;
         assocErrorMsg.style.display = 'block';
    } finally {
        // Reabilita o botão
        if (assocSendOrderBtn) { assocSendOrderBtn.disabled = false; assocSendOrderBtn.textContent = 'Enviar Pedido'; }
    }
};


// Listener para as Quick-Buttons do Modal de Observação (Cliente)
const handleQuickButtonClient = (e) => {
    const btn = e.target.closest('.quick-obs-btn');
    if (btn && clientObsInput) {
        const obsText = btn.dataset.obs;
        let currentValue = clientObsInput.value.trim();

        // Adiciona vírgula e espaço se necessário
        if (currentValue && !currentValue.endsWith(',') && currentValue.length > 0) {
            currentValue += ', ';
        } else if (currentValue.endsWith(',')) {
            currentValue += ' '; // Apenas espaço se já termina com vírgula
        }

        clientObsInput.value = (currentValue + obsText).trim();
    }
};

// Salvar Observação do Cliente (do modal OBS)
const handleSaveClientObs = () => {
    const itemId = clientObsModal.dataset.itemId;
    const originalNoteKey = clientObsModal.dataset.originalNoteKey;
    let newNote = clientObsInput.value.trim(); // Pega o valor do input (preenchido pelos botões)

    newNote = newNote.replace(/ \[EM ESPERA\]/gi, '').trim(); // Remove tag de espera (precaução)

    let updated = false;

    // Cria um novo array temporário com as atualizações
    const updatedItems = selectedItems.map(item => {
        // Atualiza TODAS as ocorrências do item com a nota original para a nova nota
        if (item.id == itemId && (item.note || '') === originalNoteKey) {
            updated = true;
            return { ...item, note: newNote };
        }
        return item; // Mantém o item inalterado se não corresponder
    });

    // Se houve atualização, substitui o array 'selectedItems' global
    if (updated) {
        selectedItems.length = 0; // Limpa o array original
        selectedItems.push(...updatedItems); // Adiciona os itens atualizados

        clientObsModal.style.display = 'none'; // Fecha o modal
        renderClientOrderScreen(); // Re-renderiza a lista de pedidos com a nova nota
        if (currentTableId) {
            saveSelectedItemsToFirebase(currentTableId, selectedItems); // Salva no Firebase
        }
    } else {
        // Caso raro: o item foi removido enquanto o modal estava aberto
        console.warn("Nenhum item encontrado para atualizar a observação (item pode ter sido removido).");
        clientObsModal.style.display = 'none';
    }
};

// --- INICIALIZAÇÃO DO CONTROLLER DO CLIENTE ---
export const initClientOrderController = () => {
    console.log("[ClientOrderController] initClientOrderController CALLED");
    if(clientInitialized) {
        console.log("[ClientOrderController] Already initialized.");
        return;
    }

    // Mapeia os elementos da UI
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

    // Mapeia elementos do Modal de Info
    clientProductInfoModal = document.getElementById('productInfoModal');
    infoProductName = document.getElementById('infoProductName');
    infoProductDescription = document.getElementById('infoProductDescription');
    infoProductImage = document.getElementById('infoProductImage');

    // Validação de Elementos Essenciais
    const essentialElements = [clientObsModal, clientAssocModal, clientMenuItemsGrid, clientProductInfoModal, clientSearchProductInput, clientCategoryFiltersContainer];
    if (essentialElements.some(el => !el)) {
        console.error("[ClientController] Erro Fatal: Elementos críticos (modais, grid, busca, filtros) não encontrados. Aborting initialization.");
        // Você pode querer exibir uma mensagem para o usuário aqui
        const body = document.querySelector('body');
        if (body) body.innerHTML = '<p style="color: red; text-align: center; margin-top: 50px;">Erro ao carregar a interface. Tente recarregar a página.</p>';
        return; // Aborta a inicialização
    }
    console.log("[ClientOrderController] Essential elements mapped.");


    // Adiciona Listeners Essenciais
    const sendClientBtn = document.getElementById('sendClientOrderBtn');
    if (sendClientBtn) sendClientBtn.addEventListener('click', handleClientSendOrder);

    if (assocSendOrderBtn) assocSendOrderBtn.addEventListener('click', handleClientAssociationAndSend);
    if (assocCancelBtn) assocCancelBtn.addEventListener('click', () => { if(clientAssocModal) clientAssocModal.style.display = 'none'; });

    if (clientSaveObsBtn) clientSaveObsBtn.addEventListener('click', handleSaveClientObs);
    if (clientCancelObsBtn) clientCancelObsBtn.addEventListener('click', () => {
        const itemId = clientObsModal.dataset.itemId;
        const originalNoteKey = clientObsModal.dataset.originalNoteKey;
        const currentNote = clientObsInput.value.trim();

        // Se o item foi recém-adicionado (nota original vazia) E o usuário não digitou nada (ou apagou)
        // E cancelou, remove o último item adicionado com esse ID
        if (originalNoteKey === '' && currentNote === '') {
             let lastIndex = -1;
             for (let i = selectedItems.length - 1; i >= 0; i--) {
                 if (selectedItems[i].id == itemId && selectedItems[i].note === '') {
                     lastIndex = i;
                     break;
                 }
             }
             if (lastIndex > -1) {
                 selectedItems.splice(lastIndex, 1); // Remove o item
                 renderClientOrderScreen(); // Re-renderiza
                 if (currentTableId) saveSelectedItemsToFirebase(currentTableId, selectedItems); // Salva
                 console.log("[Client] Item recém-adicionado cancelado e removido.");
             }
        }
        clientObsModal.style.display = 'none'; // Fecha o modal de qualquer forma
    });

    // Listener para busca de produtos
    if (clientSearchProductInput) {
        clientSearchProductInput.addEventListener('input', (e) => {
            currentClientSearch = e.target.value;
            renderClientMenu(); // Re-renderiza o menu com o filtro de busca
        });
    }

    // Listener para filtros de categoria
    if (clientCategoryFiltersContainer) {
        clientCategoryFiltersContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.category-btn');
            if (btn) {
                currentClientCategoryFilter = btn.dataset.category;
                renderClientMenu(); // Re-renderiza o menu com o filtro de categoria
            }
        });
    }

    // Event Delegation para cliques no grid de produtos
    if (clientMenuItemsGrid) {
        clientMenuItemsGrid.addEventListener('click', (e) => {

            // Prioridade 1: Botão de Informações
            const infoBtn = e.target.closest('.info-btn');
            if (infoBtn && infoBtn.dataset.product) {
                console.log("[Client Click] Info button clicked.");
                try {
                    const productData = JSON.parse(infoBtn.dataset.product.replace(/&#39;/g, "'"));
                    openProductInfoModal(productData);
                } catch (err) { /* ... erro ... */ }
                return; // Ação concluída
            }

             // Prioridade 2: Clique na Imagem ou Nome (também abre Info)
             const infoTrigger = e.target.closest('.info-img-trigger, .info-name-trigger');
             if (infoTrigger && infoTrigger.dataset.product) {
                 console.log("[Client Click] Info trigger (img/name) clicked.");
                 try {
                     const productData = JSON.parse(infoTrigger.dataset.product.replace(/&#39;/g, "'"));
                     openProductInfoModal(productData);
                 } catch (err) { /* ... erro ... */ }
                 return; // Ação concluída
             }

            // Prioridade 3: Botão de Adicionar
            const addBtn = e.target.closest('.add-item-btn');
            if (addBtn && addBtn.dataset.product) {
                 console.log("[Client Click] Add button clicked.");
                 try {
                     const productData = JSON.parse(addBtn.dataset.product.replace(/&#39;/g, "'"));
                     addClientItemToSelection(productData);
                 } catch (err) { /* ... erro ... */ }
                 return; // Ação concluída
            }

            // Se não foi nenhum dos botões/triggers específicos
            const card = e.target.closest('.product-card');
             if (card) {
                console.log("[Client Click] Card area clicked (no specific action).");
             }
        });
    } else {
        console.error("[ClientOrderController] menuItemsGrid NOT FOUND for attaching listener.");
    }

    // Listener para botões rápidos no modal de OBS
    const quickObsButtons = document.getElementById('quickObsButtons');
    if (quickObsButtons) {
        quickObsButtons.addEventListener('click', handleQuickButtonClient);
    }

    // Busca os dados do WooCommerce (Produtos e Categorias)
    console.log("[ClientOrderController] Fetching WooCommerce data...");
    // Chama fetchWooCommerceProducts e passa renderClientMenu como callback a ser executado quando os produtos chegarem
    fetchWooCommerceProducts(renderClientMenu)
        .then(() => console.log("[ClientOrderController] Products fetched successfully."))
        .catch(e => console.error("[ClientController INIT] Falha CRÍTICA ao carregar produtos:", e));

    // Chama fetchWooCommerceCategories e passa renderClientMenu como callback
    fetchWooCommerceCategories(renderClientMenu)
        .then(() => console.log("[ClientOrderController] Categories fetched successfully."))
        .catch(e => console.error("[ClientController INIT] Falha CRÍTICA ao carregar categorias:", e));


    clientInitialized = true;
    console.log("[ClientOrderController] initClientOrderController FINISHED.");
};
