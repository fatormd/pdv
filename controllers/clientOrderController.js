// --- CONTROLLERS/CLIENTORDERCONTROLLER.JS (COMPLETO E CORRIGIDO) ---

import { db, auth, getQuickObsCollectionRef, appId, getTablesCollectionRef, getTableDocRef, getCustomersCollectionRef, getKdsCollectionRef, getSectorsCollectionRef } from "/services/firebaseService.js";
import { formatCurrency, toggleLoading, showToast } from "/utils.js"; 
import { getProducts, fetchWooCommerceProducts } from "/services/wooCommerceService.js";
import { onSnapshot, doc, updateDoc, arrayUnion, setDoc, getDoc, getDocs, query, serverTimestamp, orderBy, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// --- ESTADO GLOBAL ---
let selectedItems = []; 
let quickObsCache = []; 
let FIREBASE_SECTORS = []; 
let currentSectorFilter = 'all'; 
const ESPERA_KEY = "(EM ESPERA)"; 
let orderControllerInitialized = false;
let localCurrentTableId = null;    
let localCurrentClientUser = null; 
let tempUserData = null;
let unsubscribeClientKds = null; 
let currentAssociationTab = 'mesa';
let restaurantNameCache = "Fator PDV"; 

// --- MODO DEMO ---
let currentBusinessType = 'food'; 

const DEMO_DATA = {
    retail: {
        title: "Fator Shop",
        categories: [
            { id: 'roupas', name: 'Roupas', slug: 'roupas' },
            { id: 'acessorios', name: 'Acessórios', slug: 'acessorios' },
            { id: 'eletronicos', name: 'Eletrônicos', slug: 'eletronicos' },
            { id: 'brinquedos', name: 'Brinquedos', slug: 'brinquedos' }
        ],
        products: [
            { id: 'r1', name: 'Camiseta Básica Preta', price: 49.90, image: 'https://placehold.co/600x400/222/fff?text=Camiseta', category: 'roupas' },
            { id: 'r2', name: 'Calça Jeans Skinny', price: 129.90, image: 'https://placehold.co/600x400/333/fff?text=Jeans', category: 'roupas' },
            { id: 'r3', name: 'Boné Trucker', price: 59.90, image: 'https://placehold.co/600x400/444/fff?text=Bone', category: 'acessorios' },
            { id: 'r4', name: 'Fone Bluetooth', price: 199.90, image: 'https://placehold.co/600x400/555/fff?text=Fone', category: 'eletronicos' },
            { id: 'r5', name: 'Bola de Futebol', price: 89.90, image: 'https://placehold.co/600x400/666/fff?text=Bola', category: 'brinquedos' },
            { id: 'r6', name: 'Tênis Esportivo', price: 299.90, image: 'https://placehold.co/600x400/777/fff?text=Tenis', category: 'roupas' }
        ]
    },
    services: {
        title: "Fator Serviços",
        categories: [
            { id: 'beleza', name: 'Beleza & Estética', slug: 'beleza' },
            { id: 'manutencao', name: 'Manutenção', slug: 'manutencao' },
            { id: 'eventos', name: 'Festas & Eventos', slug: 'eventos' }
        ],
        products: [
            { id: 's1', name: 'Corte de Cabelo', price: 45.00, image: 'https://placehold.co/600x400/333/fff?text=Corte', category: 'beleza' },
            { id: 's2', name: 'Instalação Elétrica (Hora)', price: 150.00, image: 'https://placehold.co/600x400/555/fff?text=Eletrica', category: 'manutencao' },
            { id: 's3', name: 'Buffet Infantil (por pessoa)', price: 85.00, image: 'https://placehold.co/600x400/888/fff?text=Buffet', category: 'eventos' },
            { id: 's4', name: 'Troca de Óleo e Filtro', price: 120.00, image: 'https://placehold.co/600x400/444/fff?text=Oficina', category: 'manutencao' },
            { id: 's5', name: 'Massagem Relaxante', price: 100.00, image: 'https://placehold.co/600x400/666/fff?text=Massagem', category: 'beleza' }
        ]
    }
};

let currentPage = 1;
let currentSearch = '';
let searchTimeout = null;
let loadMoreBtn;

// Elementos do DOM
let clientMenuContainer, clientCategoryFilters, sendOrderBtn, clientCartCount;
let associationModal, activateAndSendBtn, googleLoginBtn, activationForm;
let activateTableNumber, activateWhatsappRetirada, activateWhatsappEntrega, btnCallMotoboy; 
let deliveryAddressCEP, deliveryAddressStreet, deliveryAddressNumber, deliveryAddressNeighborhood; 
let deliveryAddressComplement, deliveryAddressReference; 
let authActionBtn, clientUserName, clientTableNumber, loggedInStep, loggedInUserName, assocErrorMsg;
let closeAssociationModalBtn; 
let statusScreen, mainContent, appContainer;
let searchProductInputClient; 
let clientObsModal, clientObsText, clientQuickObsButtons, clientConfirmObsBtn, clientCancelObsBtn;
let tabButtons, tabContents;
let customerRegistrationModal, customerRegistrationForm, saveRegistrationBtn;
let regCustomerName, regCustomerEmail, regCustomerWhatsapp, regCustomerBirthday, regErrorMsg;
let goToPaymentBtnClient; 
let kdsTrackingIconContainer, kdsTrackingIcon, kdsTrackingStatusEl;
let headerClientNameDisplay;
let businessTypeSelector;
let btnStoreInfo, storeInfoModal;

// ==================================================================
//               1. BUSCA DE DADOS (SETORES E LOJA)
// ==================================================================

async function fetchFirebaseSectors() {
    try {
        const q = query(getSectorsCollectionRef()); 
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            FIREBASE_SECTORS = querySnapshot.docs.map(doc => ({
                id: doc.id,
                name: doc.data().name,
                order: doc.data().order || 99, 
                isActive: doc.data().isActive !== false
            })).filter(s => s.isActive);
            FIREBASE_SECTORS.sort((a, b) => a.order - b.order);
        } else {
            FIREBASE_SECTORS = [
                { id: 'cozinha', name: 'Cozinha' },
                { id: 'bar', name: 'Bar' },
                { id: 'churrasqueira', name: 'Churrasqueira' }
            ];
        }
        
        FIREBASE_SECTORS.unshift({ id: 'top10', name: '🔥 Top 10' });
        FIREBASE_SECTORS.unshift({ id: 'all', name: 'Todos' });

        renderMenu(false);

    } catch (error) {
        console.error("Erro ao buscar setores:", error);
    }
}

async function fetchRestaurantInfo() {
    if (currentBusinessType !== 'food') {
        updateRestaurantTitle();
        return;
    }
    const titleEl = document.getElementById('restaurantTitle');
    
    try {
        const configRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'store_info'); 
        const docSnap = await getDoc(configRef);
        
        const data = docSnap.exists() ? docSnap.data() : {};
        const name = data.name || "Fator PDV";
        restaurantNameCache = name; 

        if (titleEl) titleEl.textContent = name;
        
    } catch (e) {
        console.warn("Erro ao buscar nome:", e);
    }
}

async function openStoreInfoModal() {
    if (!storeInfoModal) return;
    storeInfoModal.style.display = 'flex';
    
    try {
        const configRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'store_info'); 
        const docSnap = await getDoc(configRef);
        const data = docSnap.exists() ? docSnap.data() : {};

        document.getElementById('modalStoreName').textContent = data.name || "Nossa Loja";
        document.getElementById('modalStoreAddress').textContent = data.address || "Endereço não cadastrado.";
        document.getElementById('modalStoreHours').textContent = data.openingHours || "Aberto todos os dias.";
        
        const imgEl = document.getElementById('modalStoreLogo');
        const iconEl = document.getElementById('modalStoreIconDefault');
        if (data.logoUrl) {
            imgEl.src = data.logoUrl;
            imgEl.classList.remove('hidden');
            iconEl.classList.add('hidden');
        } else {
            imgEl.classList.add('hidden');
            iconEl.classList.remove('hidden');
        }

        const phoneEl = document.getElementById('modalStorePhone');
        phoneEl.textContent = data.phone || "(00) 0000-0000";
        phoneEl.href = data.phone ? `tel:${data.phone.replace(/\D/g,'')}` : '#';

        const whatsBtn = document.getElementById('modalStoreWhatsappBtn');
        if (data.whatsapp) {
            const num = data.whatsapp.replace(/\D/g, '');
            whatsBtn.href = `https://wa.me/${num}`;
            whatsBtn.classList.remove('hidden');
        } else {
            whatsBtn.classList.add('hidden');
        }

        const socialDiv = document.getElementById('modalSocialLinks');
        socialDiv.innerHTML = '';
        if (data.instagram) {
            let url = data.instagram.includes('http') ? data.instagram : `https://instagram.com/${data.instagram.replace('@','')}`;
            socialDiv.innerHTML += `<a href="${url}" target="_blank" class="text-pink-500 hover:text-pink-400 text-3xl"><i class="fab fa-instagram"></i></a>`;
        }
        if (data.facebook) {
            socialDiv.innerHTML += `<a href="${data.facebook}" target="_blank" class="text-blue-600 hover:text-blue-500 text-3xl"><i class="fab fa-facebook"></i></a>`;
        }
        if (!data.instagram && !data.facebook) {
            socialDiv.innerHTML = '<span class="text-xs text-gray-600">Sem redes sociais cadastradas.</span>';
        }

    } catch (e) {
        console.error("Erro ao carregar loja:", e);
        showToast("Erro ao carregar informações.", true);
    }
}

// ==================================================================
//               2. RENDERIZAÇÃO DO MENU
// ==================================================================

function renderMenu(append = false) { 
    if (!clientMenuContainer) return; 
    
    if (clientCategoryFilters && (clientCategoryFilters.innerHTML.trim() === '' || !append || currentBusinessType !== 'food')) { 
        if (currentBusinessType === 'food') {
            clientCategoryFilters.innerHTML = FIREBASE_SECTORS.map(sector => {
                const isActive = sector.id === currentSectorFilter ? 'bg-brand-primary text-white shadow-lg' : 'bg-dark-input text-dark-text border border-gray-600';
                return `<button class="sector-btn px-4 py-3 rounded-full text-base font-semibold whitespace-nowrap ${isActive}" data-sector-id="${sector.id}">${sector.name}</button>`;
            }).join('');
        } else {
            const categories = DEMO_DATA[currentBusinessType].categories;
            clientCategoryFilters.innerHTML = `
            <button class="sector-btn px-4 py-3 rounded-full text-base font-semibold whitespace-nowrap ${currentSectorFilter === 'all' ? 'bg-brand-primary text-white' : 'bg-dark-input text-dark-text border border-gray-600'}" data-sector-id="all">Todos</button>
            ${categories.map(cat => { 
                const isActive = cat.slug === currentSectorFilter ? 'bg-brand-primary text-white' : 'bg-dark-input text-dark-text border border-gray-600'; 
                return `<button class="sector-btn px-4 py-3 rounded-full text-base font-semibold whitespace-nowrap ${isActive}" data-sector-id="${cat.slug || cat.id}">${cat.name}</button>`; 
            }).join('')}`;
        }
    } 
    
    let products;
    if (currentBusinessType === 'food') products = getProducts();
    else products = DEMO_DATA[currentBusinessType].products;

    let filteredProducts = products; 
    
    if (currentSectorFilter === 'top10' && currentBusinessType === 'food') {
         filteredProducts = products.slice(0, 10);
    } else if (currentSectorFilter !== 'all') {
        if (currentBusinessType === 'food') {
            const targetId = currentSectorFilter.toLowerCase();
            const sectorObj = FIREBASE_SECTORS.find(s => s.id === currentSectorFilter);
            const targetName = sectorObj ? sectorObj.name.toLowerCase() : '';

            filteredProducts = products.filter(p => {
                const pSector = (p.sector || 'cozinha').toLowerCase();
                return pSector === targetId || pSector === targetName;
            });
        } else {
            filteredProducts = products.filter(p => p.category === currentSectorFilter);
        }
    }

    if (currentSearch) {
        filteredProducts = filteredProducts.filter(p => p.name.toLowerCase().includes(currentSearch.toLowerCase()));
    }

    if (!append) clientMenuContainer.innerHTML = ''; 
    
    if (filteredProducts.length === 0) { 
        if (currentSearch || currentSectorFilter !== 'all') {
             clientMenuContainer.innerHTML = `<div class="col-span-full text-center p-6 text-yellow-400 italic">Nenhum produto encontrado neste setor.</div>`; 
        } else {
             clientMenuContainer.innerHTML = `<div class="col-span-full text-center p-6 text-dark-placeholder italic">Carregando cardápio ou sem produtos disponíveis.</div>`;
        }
    } else { 
        const html = filteredProducts.map((product, index) => { 
            let badge = ''; 
            if (currentBusinessType === 'food' && currentSectorFilter === 'top10' && index < 3) { 
                const colors = ['text-yellow-400', 'text-gray-300', 'text-orange-400']; 
                badge = `<i class="fas fa-medal ${colors[index]} absolute top-2 right-2 text-xl drop-shadow-md"></i>`; 
            } 
            return `<div class="product-card bg-dark-card border border-dark-border rounded-xl shadow-md flex flex-col overflow-hidden relative" data-product-id="${product.id}">${badge}<img src="${product.image}" alt="${product.name}" class="w-full h-32 object-cover"><div class="p-4 flex flex-col flex-grow"><h4 class="font-semibold text-base text-white mb-2 min-h-[2.5rem]">${product.name}</h4><div class="flex justify-between items-center mb-3"><span class="font-bold text-lg text-brand-primary">${formatCurrency(product.price)}</span><button class="add-item-btn bg-brand-primary text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-brand-primary-dark transition pointer-events-none"><i class="fas fa-plus"></i></button></div><div class="flex-grow"></div><button class="info-item-btn w-full bg-dark-input text-dark-text font-semibold py-2 rounded-lg hover:bg-gray-600 transition text-sm">Descrição</button></div></div>`; 
        }).join(''); 
        
        if (append) { 
            if (loadMoreBtn) loadMoreBtn.remove(); 
            clientMenuContainer.insertAdjacentHTML('beforeend', html); 
        } else { 
            clientMenuContainer.innerHTML = html; 
        } 
    } 
    renderLoadMoreButton(); 
}

function renderLoadMoreButton() {
    if (currentBusinessType !== 'food') return;
    if (loadMoreBtn) loadMoreBtn.remove(); loadMoreBtn = document.createElement('button');
    loadMoreBtn.className = 'col-span-full py-3 mt-4 bg-gray-800 text-gray-400 rounded-lg font-bold text-sm';
    loadMoreBtn.innerText = 'Ver mais produtos'; loadMoreBtn.onclick = handleLoadMore; clientMenuContainer.appendChild(loadMoreBtn);
}

// ==================================================================
//               3. HANDLERS
// ==================================================================

const handleSectorClick = async (e) => {
    const btn = e.target.closest('.sector-btn'); if (!btn) return;
    currentSectorFilter = btn.dataset.sectorId; 
    
    document.querySelectorAll('.sector-btn').forEach(b => {
        b.classList.remove('bg-brand-primary', 'text-white', 'shadow-lg');
        b.classList.add('bg-dark-input', 'text-dark-text', 'border-gray-600');
    });
    btn.classList.remove('bg-dark-input', 'text-dark-text', 'border-gray-600');
    btn.classList.add('bg-brand-primary', 'text-white', 'shadow-lg');

    currentPage = 1; 
    showMenuSkeleton();
    
    if (currentBusinessType === 'food') {
        await fetchWooCommerceProducts(1, currentSearch, '', false); 
    }
    renderMenu(false);
};

// --- FUNÇÃO CORRIGIDA DE ENVIO (COM HASNEWORDER) ---
async function sendOrderToFirebase(closeModalOnSuccess = false) {
    if (!localCurrentTableId) {
        openAssociationModal();
        return;
    }
    if (selectedItems.length === 0) {
        showToast("Seu carrinho está vazio.", true);
        return;
    }

    toggleLoading(sendOrderBtn, true, "Enviando...");

    try {
        const tableRef = getTableDocRef(localCurrentTableId);
        
        const orderPayload = selectedItems.map(item => ({
            ...item,
            timestamp: new Date(), 
            status: 'pending_client_send',
        }));
        
        // CORREÇÃO: Adicionado hasNewOrder: true para o painel detectar
        await updateDoc(tableRef, {
            clientOrderPending: arrayUnion(...orderPayload),
            hasNewOrder: true, 
            status: 'occupied', // Garante que a mesa aparece como ocupada
            lastClientOrderSent: serverTimestamp() 
        });

        selectedItems = [];

        showToast("Pedido enviado para o garçom!", false);
        if (closeModalOnSuccess) {
            closeAssociationModal();
        }

    } catch (error) {
        console.error("Erro ao enviar pedido para Firebase:", error);
        showToast("Falha ao enviar pedido. Tente novamente.", true);
    } finally {
        toggleLoading(sendOrderBtn, false, "ENVIAR");
        renderClientOrderScreen(); 
    }
}


async function handleSendOrderClick() { 
    const tableId = localCurrentTableId || window.currentTableId; 
    
    if (!tableId) { 
        openAssociationModal(); 
    } else { 
        await sendOrderToFirebase(); 
    } 
}

function handleAuthActionClick() { if (localCurrentClientUser) { if(confirm("Deseja realmente sair da sua conta?")) { signOut(auth).then(() => { showToast("Você saiu da sua conta."); window.location.reload(); }); } } else { openAssociationModal(); } }
async function signInWithGoogle(e) { if(e) e.preventDefault(); const provider = new GoogleAuthProvider(); try { await signInWithPopup(auth, provider); } catch (error) { console.error("Erro Login:", error); showAssocError("Erro ao tentar logar. Tente novamente."); } }

async function handleActivationAndSend(e) { 
    if (e) e.preventDefault(); 
    let identifier = '';
    let tableDocId = '';
    let isPickup = false;
    let isDelivery = false;
    let deliveryAddress = null;
    let whatsapp = '';
    
    if (!localCurrentClientUser) { showAssocError("Faça login para continuar."); return; }

    if (currentAssociationTab === 'mesa') {
        identifier = activateTableNumber.value.trim();
        if (!identifier) { showAssocError("Informe o número da mesa."); return; }
        tableDocId = identifier;

    } else if (currentAssociationTab === 'retirada') {
        whatsapp = (activateWhatsappRetirada.value || '').replace(/\D/g, '');
        if (whatsapp.length < 10) { showAssocError("Informe um WhatsApp válido (mín. 10 dígitos)."); return; }
        
        const pin = whatsapp.slice(-4);
        identifier = whatsapp; 
        tableDocId = `pickup_${pin}`; 
        isPickup = true;

    } else if (currentAssociationTab === 'entrega') {
        whatsapp = (activateWhatsappEntrega.value || '').replace(/\D/g, '');
        const street = deliveryAddressStreet.value.trim();
        const number = deliveryAddressNumber.value.trim();
        const neighborhood = deliveryAddressNeighborhood.value.trim();
        
        if (whatsapp.length < 10 || !street || !number || !neighborhood) {
            showAssocError("Preencha WhatsApp, Rua, Número e Bairro."); 
            return;
        }

        const pin = whatsapp.slice(-4);
        identifier = whatsapp; 
        tableDocId = `delivery_${pin}`; 
        isDelivery = true;
        
        deliveryAddress = {
            cep: deliveryAddressCEP.value.trim(),
            street: street,
            number: number,
            neighborhood: neighborhood,
            complement: deliveryAddressComplement.value.trim(),
            reference: deliveryAddressReference.value.trim(),
        };
    } else {
        showAssocError("Selecione uma opção de pedido."); return;
    }

    toggleLoading(activateAndSendBtn, true);
    assocErrorMsg.style.display = 'none';

    try {
        const tableRef = getTableDocRef(tableDocId);
        const tableSnap = await getDoc(tableRef);
        
        localCurrentTableId = tableDocId;
        if (window.setCurrentTable) window.setCurrentTable(tableDocId, true, false);

        const clientData = { 
            uid: localCurrentClientUser.uid, 
            name: localCurrentClientUser.displayName, 
            phone: whatsapp || localCurrentClientUser.phone || null 
        };

        const newTableData = {
            tableNumber: isPickup || isDelivery ? identifier : parseInt(identifier), 
            status: 'open',
            sector: isPickup ? 'Retirada' : (isDelivery ? 'Entrega' : 'Cliente'),
            isPickup: isPickup,
            isDelivery: isDelivery, 
            deliveryAddress: deliveryAddress, 
            createdAt: serverTimestamp(),
            total: 0, 
            sentItems: [], 
            payments: [], 
            serviceTaxApplied: !isDelivery, 
            selectedItems: [], 
            requestedOrders: [], 
            clientId: clientData.uid, 
            clientName: clientData.name, 
            clientPhone: clientData.phone, 
            anonymousUid: null
        };
        
        if (tableSnap.exists()) {
            const tData = tableSnap.data();

            if (tData.status === 'closed') {
                const historyRef = doc(getTablesCollectionRef(), `${tableDocId}_closed_${Date.now()}`);
                await setDoc(historyRef, tData);
                await setDoc(tableRef, newTableData);

            } else if (tData.status !== 'open' || (tData.clientId && tData.clientId !== clientData.uid)) {
                 throw new Error(`Comanda em uso por ${tData.clientName || 'outro cliente'}.`);
            } else {
                const updatePayload = {
                    clientId: clientData.uid, 
                    clientName: clientData.name, 
                    clientPhone: clientData.phone,
                    ...(isDelivery && { deliveryAddress: deliveryAddress, sector: 'Entrega' }),
                };
                await updateDoc(tableRef, updatePayload);
            }
        } else {
            if (!isPickup && !isDelivery && !confirm(`Mesa ${identifier} não existe. Abrir nova conta?`)) { 
                throw new Error("Ação cancelada."); 
            }
            await setDoc(tableRef, newTableData);
        }

        if (window.setTableListener) window.setTableListener(tableDocId, true);
        startClientKdsListener(tableDocId);
        
        if (selectedItems.length > 0) {
            await sendOrderToFirebase(true); 
        } else {
            closeAssociationModal(); 
            const pinDisplay = tableDocId.includes('_') ? tableDocId.split('_')[1] : identifier;
            let successMessage = `Mesa ${identifier} vinculada!`;
            if (isPickup) successMessage = `Retirada #${pinDisplay} iniciada!`;
            if (isDelivery) successMessage = `Delivery #${pinDisplay} iniciado!`;
            showToast(successMessage, false); 
        }

        const pinDisplay = tableDocId.includes('_') ? tableDocId.split('_')[1] : identifier;
        if(clientTableNumber) clientTableNumber.textContent = isPickup ? `Retirada: ${pinDisplay}` : (isDelivery ? `Delivery: ${pinDisplay}` : `Mesa ${identifier}`);

    } catch (error) { 
        console.error(error); 
        showAssocError(error.message); 
    } finally { 
        toggleLoading(activateAndSendBtn, false, 'Confirmar'); 
    } 
}


const handleCallMotoboy = () => { if (!localCurrentClientUser) { showAssocError("Faça login para chamar o entregador."); return; } alert("Redirecionando para o sistema de entregas... (Em Breve)"); };
async function handleNewCustomerRegistration(e) { e.preventDefault(); if (!tempUserData) { showAssocError("Erro: Dados perdidos. Logue novamente."); return; } const whatsapp = regCustomerWhatsapp.value; const birthday = regCustomerBirthday.value; if (!whatsapp || !birthday) { regErrorMsg.textContent = "Preencha todos os campos."; regErrorMsg.style.display = 'block'; return; } regErrorMsg.style.display = 'none'; const completeUserData = { ...tempUserData, whatsapp: whatsapp, nascimento: birthday }; saveRegistrationBtn.disabled = true; saveRegistrationBtn.textContent = "Salvando..."; try { await saveCustomerData(completeUserData); if(localCurrentClientUser) localCurrentClientUser.phone = whatsapp; showToast("Cadastro concluído!", false); closeCustomerRegistrationModal(); openAssociationModal(); updateCustomerInfo(localCurrentClientUser, false); } catch (error) { console.error("Erro salvar:", error); regErrorMsg.textContent = "Falha ao salvar."; regErrorMsg.style.display = 'block'; } finally { saveRegistrationBtn.disabled = false; saveRegistrationBtn.textContent = "Salvar e Continuar"; } }
const handleSearch = (e) => { currentSearch = e.target.value; currentPage = 1; clearTimeout(searchTimeout); searchTimeout = setTimeout(async () => { showMenuSkeleton(); if (currentBusinessType === 'food') { await fetchWooCommerceProducts(1, currentSearch, '', false); } renderMenu(false); }, 600); };
const handleLoadMore = async () => { currentPage++; toggleLoading(loadMoreBtn, true, 'Carregando...'); if (currentBusinessType === 'food') { const newItems = await fetchWooCommerceProducts(currentPage, currentSearch, '', true); if (newItems.length === 0) { showToast("Fim da lista.", false); loadMoreBtn.style.display = 'none'; } else { renderMenu(true); } } else { loadMoreBtn.style.display = 'none'; showToast("Fim da lista.", false); } };

function updateRestaurantTitle() { const titleEl = document.getElementById('restaurantTitle'); const headerTitleEl = document.getElementById('client-table-number'); if (currentBusinessType !== 'food') { const name = DEMO_DATA[currentBusinessType].title; restaurantNameCache = name; if(titleEl) titleEl.textContent = name; if(headerTitleEl && !localCurrentTableId) headerTitleEl.textContent = name; } }

function toggleTabInputs(activeTabName) {
    document.querySelectorAll('.assoc-tab-content').forEach(content => {
        const isActive = content.id === `content-${activeTabName}`;
        const inputs = content.querySelectorAll('input, textarea, select');
        
        inputs.forEach(input => {
            if (isActive) {
                if (input.id === 'deliveryAddressCEP' || input.id.includes('Complement') || input.id.includes('Reference')) {
                    input.disabled = (activeTabName !== 'entrega'); 
                } else {
                    input.disabled = false;
                }
            } else {
                input.disabled = true;
            }
        });
    });

    if (activeTabName === 'mesa') {
        if(activateTableNumber) activateTableNumber.disabled = false;
    }
}


// ==================================================================
//               4. INICIALIZAÇÃO
// ==================================================================

export const initClientOrderController = () => {
    if (orderControllerInitialized) return;
    console.log("[ClientOrder] Inicializando...");

    clientMenuContainer = document.getElementById('client-menu-container');
    clientCategoryFilters = document.getElementById('client-category-filters');
    sendOrderBtn = document.getElementById('sendOrderBtn');
    clientCartCount = document.getElementById('client-cart-count');
    authActionBtn = document.getElementById('authActionBtn'); 
    clientUserName = document.getElementById('client-user-name'); 
    clientTableNumber = document.getElementById('client-table-number'); 
    statusScreen = document.getElementById('statusScreen');
    mainContent = document.getElementById('mainContent');
    appContainer = document.getElementById('appContainer');
    searchProductInputClient = document.getElementById('searchProductInputClient');
    goToPaymentBtnClient = document.getElementById('goToPaymentBtnClient'); 
    kdsTrackingIconContainer = document.getElementById('kdsTrackingIconContainer');
    kdsTrackingIcon = document.getElementById('kdsTrackingIcon');
    kdsTrackingStatusEl = document.getElementById('kdsTrackingStatus');
    headerClientNameDisplay = document.getElementById('headerClientNameDisplay');
    businessTypeSelector = document.getElementById('businessTypeSelector');
    
    btnStoreInfo = document.getElementById('btnStoreInfo');
    storeInfoModal = document.getElementById('storeInfoModal');

    associationModal = document.getElementById('associationModal');
    activationForm = document.getElementById('activationForm'); 
    activateAndSendBtn = document.getElementById('activateAndSendBtn'); 
    googleLoginBtn = document.getElementById('googleLoginBtn');
    loggedInStep = document.getElementById('loggedInStep'); 
    loggedInUserName = document.getElementById('loggedInUserName'); 
    assocErrorMsg = document.getElementById('assocErrorMsg');
    
    activateTableNumber = document.getElementById('activateTableNumber'); 
    activateWhatsappRetirada = document.getElementById('activateWhatsappRetirada'); 
    activateWhatsappEntrega = document.getElementById('activateWhatsappEntrega'); 
    btnCallMotoboy = document.getElementById('btnCallMotoboy');
    closeAssociationModalBtn = document.getElementById('closeAssociationModalBtn'); 

    deliveryAddressCEP = document.getElementById('deliveryAddressCEP');
    deliveryAddressStreet = document.getElementById('deliveryAddressStreet');
    deliveryAddressNumber = document.getElementById('deliveryAddressNumber');
    deliveryAddressNeighborhood = document.getElementById('deliveryAddressNeighborhood');
    deliveryAddressComplement = document.getElementById('deliveryAddressComplement');
    deliveryAddressReference = document.getElementById('deliveryAddressReference');
    
    tabButtons = document.querySelectorAll('.assoc-tab-btn');
    tabContents = document.querySelectorAll('.assoc-tab-content');
    const defaultActionButtons = document.getElementById('defaultActionButtons');
    if (tabButtons) {
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                tabButtons.forEach(btn => btn.classList.remove('active', 'border-brand-primary', 'text-brand-primary'));
                tabContents.forEach(content => content.style.display = 'none');
                button.classList.add('active', 'border-brand-primary', 'text-brand-primary');
                const tabName = button.dataset.tab;
                currentAssociationTab = tabName;
                const contentEl = document.getElementById(`content-${tabName}`);
                if(contentEl) {
                    contentEl.style.display = 'block';
                    if (tabName === 'mesa' || tabName === 'retirada' || tabName === 'entrega') { 
                         if(defaultActionButtons) defaultActionButtons.style.display = 'flex'; 
                    } else {
                        if(defaultActionButtons) defaultActionButtons.style.display = 'none'; 
                    }
                }
                toggleTabInputs(tabName); 
            });
        });
    }

    if (closeAssociationModalBtn) {
        closeAssociationModalBtn.addEventListener('click', closeAssociationModal);
    }
    
    toggleTabInputs(currentAssociationTab);


    if (btnCallMotoboy) btnCallMotoboy.addEventListener('click', handleCallMotoboy);
    if (businessTypeSelector) {
        businessTypeSelector.addEventListener('change', (e) => {
            currentBusinessType = e.target.value;
            currentSectorFilter = 'all'; 
            renderMenu(false); 
            updateRestaurantTitle(); 
        });
    }

    customerRegistrationModal = document.getElementById('customerRegistrationModal');
    customerRegistrationForm = document.getElementById('customerRegistrationForm');
    saveRegistrationBtn = document.getElementById('saveRegistrationBtn');
    regCustomerName = document.getElementById('regCustomerName');
    regCustomerEmail = document.getElementById('regCustomerEmail');
    regCustomerWhatsapp = document.getElementById('regCustomerWhatsapp');
    regCustomerBirthday = document.getElementById('regCustomerBirthday');
    regErrorMsg = document.getElementById('regErrorMsg');
    if(customerRegistrationForm) customerRegistrationForm.addEventListener('submit', handleNewCustomerRegistration);
    
    clientObsModal = document.getElementById('clientObsModal'); 
    clientObsText = document.getElementById('clientObsText'); 
    clientQuickObsButtons = document.getElementById('clientQuickObsButtons'); 
    clientConfirmObsBtn = document.getElementById('clientConfirmObsBtn');
    clientCancelObsBtn = document.getElementById('clientCancelObsBtn'); 

    if (clientObsModal) {
        if (clientQuickObsButtons) {
            clientQuickObsButtons.addEventListener('click', (e) => {
                const btn = e.target.closest('.quick-obs-btn');
                if (btn && clientObsText) clientObsText.value = (clientObsText.value.trim() + (clientObsText.value ? ', ' : '') + btn.dataset.obs).trim();
            });
        }
        if (clientConfirmObsBtn) {
            clientConfirmObsBtn.addEventListener('click', () => {
                const itemId = clientObsModal.dataset.itemId;
                const originalNoteKey = clientObsModal.dataset.originalNoteKey;
                let newNote = clientObsText.value.trim();
                const esperaSwitch = document.getElementById('esperaSwitch');
                const isEspera = esperaSwitch ? esperaSwitch.checked : false;
                const regexEspera = new RegExp(ESPERA_KEY.replace('(', '\\(').replace(')', '\\)'), 'ig');
                const hasKey = newNote.toUpperCase().includes(ESPERA_KEY);
                if (isEspera && !hasKey) newNote = newNote ? `${ESPERA_KEY} ${newNote}` : ESPERA_KEY;
                else if (!isEspera && hasKey) newNote = newNote.replace(regexEspera, '').trim().replace(/^,/, '').trim();
                let updated = false;
                const updatedItems = selectedItems.map(item => {
                    if (item.id == itemId && (item.note || '') === originalNoteKey) { updated = true; return { ...item, note: newNote }; }
                    return item;
                });
                selectedItems.length = 0; selectedItems.push(...updatedItems);
                clientObsModal.style.display = 'none';
                if (updated) renderClientOrderScreen();
            });
        }
        if (clientCancelObsBtn) clientCancelObsBtn.addEventListener('click', () => { clientObsModal.style.display = 'none'; });
    }

    if (sendOrderBtn) sendOrderBtn.onclick = handleSendOrderClick;
    if (authActionBtn) authActionBtn.onclick = handleAuthActionClick;
    if (googleLoginBtn) googleLoginBtn.onclick = signInWithGoogle;
    if (activationForm) activationForm.onsubmit = handleActivationAndSend;
    const cancelBtn = document.getElementById('cancelActivationBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeAssociationModal(); });

    if (clientMenuContainer) {
        clientMenuContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.product-card');
            if (!card) return;
            const pid = card.dataset.productId;
            let product;
            if (currentBusinessType === 'food') product = getProducts().find(p => p.id == pid);
            else product = DEMO_DATA[currentBusinessType].products.find(p => p.id == pid);
            if (!product) return;
            if (e.target.closest('.info-item-btn')) openProductInfoModal(product);
            else addItemToCart(product);
        });
    }
    
    document.getElementById('client-cart-items-list')?.addEventListener('click', (e) => {
         const qtyBtn = e.target.closest('.qty-btn');
         const obsSpan = e.target.closest('.obs-span');
         if (qtyBtn) {
             const itemId = qtyBtn.dataset.itemId;
             const noteKey = qtyBtn.dataset.itemNoteKey;
             const action = qtyBtn.dataset.action;
             if(action === 'increase') increaseCartItemQuantity(itemId, noteKey);
             if(action === 'decrease') decreaseCartItemQuantity(itemId, noteKey);
         }
         if (obsSpan) openClientObsModal(obsSpan.dataset.itemId, obsSpan.dataset.itemNoteKey);
    });

    if (clientCategoryFilters) clientCategoryFilters.addEventListener('click', handleSectorClick);
    if (searchProductInputClient) searchProductInputClient.addEventListener('input', handleSearch);
    
    if (btnStoreInfo) btnStoreInfo.addEventListener('click', openStoreInfoModal);

    setupAuthStateObserver();
    fetchFirebaseSectors(); 
    loadMenu(); 
    fetchQuickObservations(); 
    fetchRestaurantInfo(); 
    
    if (localCurrentTableId || window.currentTableId) {
        startClientKdsListener(localCurrentTableId || window.currentTableId);
    }

    orderControllerInitialized = true;
    console.log("[ClientOrder] Inicializado.");
};

// ==================================================================
//               5. EXPORTAÇÕES E HELPERS GLOBAIS
// ==================================================================

export const renderClientOrderScreen = (orderSnapshot = null) => {
    
    if (clientCartCount) {
        const totalItems = selectedItems.length;
        clientCartCount.textContent = totalItems;
        if (totalItems > 0) {
            clientCartCount.style.display = 'flex';
            clientCartCount.classList.remove('hidden');
        } else {
            clientCartCount.style.display = 'none';
            clientCartCount.classList.add('hidden');
        }
    }

    if (sendOrderBtn) {
        if (selectedItems.length > 0) {
            sendOrderBtn.disabled = false;
        } else {
            sendOrderBtn.disabled = true;
        }
    }

    _renderClientCart();
};

async function loadMenu() {
    showMenuSkeleton();
    currentPage = 1;
    if (currentBusinessType === 'food') {
        try {
            await fetchWooCommerceProducts(1, '', '', false); 
        } catch (error) {
            console.error("Erro ao carregar menu:", error);
            showToast("Erro ao carregar cardápio.", true);
        }
    }
    renderMenu(false);
}

function startClientKdsListener(tableId) { if (unsubscribeClientKds) unsubscribeClientKds(); const tableRef = getTableDocRef(tableId); unsubscribeClientKds = onSnapshot(tableRef, (docSnap) => { if (!docSnap.exists() || docSnap.data().status === 'closed') { console.log("[ClientKDS] Mesa fechada ou removida. Resetando estado..."); showToast("Conta encerrada! Pode abrir uma nova mesa.", false); localCurrentTableId = null; window.currentTableId = null; if (clientTableNumber) clientTableNumber.textContent = restaurantNameCache; selectedItems = []; renderClientOrderScreen(); openAssociationModal(); if(unsubscribeClientKds) unsubscribeClientKds(); return; } if (kdsTrackingStatusEl) { const data = docSnap.data(); const hasPending = data.clientOrderPending; const hasItems = data.sentItems && data.sentItems.length > 0; if (hasPending) { kdsTrackingStatusEl.textContent = "Enviado à cozinha"; kdsTrackingStatusEl.className = "text-yellow-400 text-xs font-bold"; } else if (hasItems) { kdsTrackingStatusEl.textContent = "Em preparação"; kdsTrackingStatusEl.className = "text-green-400 text-xs font-bold"; } else { kdsTrackingStatusEl.textContent = "Faça seu pedido"; kdsTrackingStatusEl.className = "text-gray-400 text-xs"; } } }, (error) => { console.warn("Aviso KDS:", error); if (error.code === 'permission-denied' || error.message.includes('No document')) { localCurrentTableId = null; window.currentTableId = null; if (clientTableNumber) clientTableNumber.textContent = restaurantNameCache; openAssociationModal(); } }); }
async function restoreActiveSession(user) { try { const q = query(getTablesCollectionRef(), where('clientId', '==', user.uid), where('status', '==', 'open')); const snapshot = await getDocs(q); if (!snapshot.empty) { const tableDoc = snapshot.docs[0]; const tableId = tableDoc.id; localCurrentTableId = tableId; if(window.setCurrentTable) window.setCurrentTable(tableId, true, false); if(window.setTableListener) window.setTableListener(tableId, true); startClientKdsListener(tableId); closeAssociationModal(); showToast("Sessão ativa recuperada.", false); if(clientTableNumber) clientTableNumber.textContent = `Mesa ${tableId}`; } } catch (e) { console.error("[ClientOrder] Erro restore:", e); } }
function setupAuthStateObserver() { onAuthStateChanged(auth, (user) => { if (user && !user.isAnonymous) { localCurrentClientUser = user; tempUserData = { uid: user.uid, name: user.displayName, email: user.email, photoURL: user.photoURL }; updateAuthUI(user); checkCustomerRegistration(user); restoreActiveSession(user); } else if (user && user.isAnonymous) { closeAssociationModal(); closeCustomerRegistrationModal(); updateAuthUI(null); } else { localCurrentClientUser = null; tempUserData = null; updateAuthUI(null); updateCustomerInfo(null, false); if (!window.currentTableId) openAssociationModal(); } }); }
function updateAuthUI(user) { if (!goToPaymentBtnClient) return; if (user && !user.isAnonymous) { if (headerClientNameDisplay) { const firstName = user.displayName ? user.displayName.split(' ')[0] : 'Cliente'; headerClientNameDisplay.textContent = `Olá, ${firstName}`; headerClientNameDisplay.classList.remove('hidden'); } goToPaymentBtnClient.innerHTML = '<i class="fas fa-receipt text-lg md:text-xl"></i>'; goToPaymentBtnClient.classList.replace('bg-gray-700', 'bg-green-600'); goToPaymentBtnClient.classList.replace('hover:bg-gray-600', 'hover:bg-green-700'); goToPaymentBtnClient.title = "Ver Conta"; const newBtn = goToPaymentBtnClient.cloneNode(true); goToPaymentBtnClient.parentNode.replaceChild(newBtn, goToPaymentBtnClient); goToPaymentBtnClient = newBtn; goToPaymentBtnClient.onclick = () => window.goToScreen('clientPaymentScreen'); } else { if (headerClientNameDisplay) { headerClientNameDisplay.classList.add('hidden'); headerClientNameDisplay.textContent = ''; } goToPaymentBtnClient.innerHTML = '<i class="fas fa-user text-lg md:text-xl"></i>'; goToPaymentBtnClient.classList.replace('bg-green-600', 'bg-gray-700'); goToPaymentBtnClient.classList.replace('hover:bg-green-700', 'hover:bg-gray-600'); goToPaymentBtnClient.title = "Entrar"; const newBtn = goToPaymentBtnClient.cloneNode(true); goToPaymentBtnClient.parentNode.replaceChild(newBtn, goToPaymentBtnClient); goToPaymentBtnClient = newBtn; goToPaymentBtnClient.onclick = signInWithGoogle; } }
function updateCustomerInfo(user, isNew = false) { if (!loggedInStep || !loggedInUserName || !googleLoginBtn) return; if (user && !isNew) { loggedInStep.style.display = 'block'; loggedInUserName.textContent = user.displayName || user.email; googleLoginBtn.style.display = 'none'; } else { loggedInStep.style.display = 'none'; loggedInUserName.textContent = ''; googleLoginBtn.style.display = 'flex'; } }
async function checkCustomerRegistration(user) { const customerRef = doc(getCustomersCollectionRef(), user.uid); try { const docSnap = await getDoc(customerRef); if (!docSnap.exists()) { await setDoc(customerRef, { uid: user.uid, name: user.displayName || 'Cliente', email: user.email || '', photoURL: user.photoURL || null, createdAt: serverTimestamp(), points: 0, phone: null }); } else { const data = docSnap.data(); if (data.phone) localCurrentClientUser.phone = data.phone; } updateCustomerInfo(user, false); } catch (error) { console.error("Erro check customer:", error); updateCustomerInfo(user, false); } }
async function saveCustomerData(userData) { const customerRef = doc(getCustomersCollectionRef(), userData.uid); await setDoc(customerRef, { uid: userData.uid, name: userData.name, email: userData.email, phone: userData.whatsapp, birthday: userData.nascimento, photoURL: userData.photoURL || null, points: 0, createdAt: serverTimestamp() }, { merge: true }); }
function addItemToCart(product) { if (!product || !product.id) return; const newItem = { id: product.id, name: product.name, price: product.price, sector: product.sector || (currentBusinessType === 'food' ? 'cozinha' : 'balcao'), category: product.category || 'uncategorized', note: '' }; selectedItems.push(newItem); renderClientOrderScreen(); showToast("Item adicionado!", false); openClientObsModal(product.id, ''); }
function increaseCartItemQuantity(itemId, noteKey) { const itemToCopy = selectedItems.findLast(item => item.id == itemId && (item.note || '') === noteKey); if (itemToCopy) { selectedItems.push({ ...itemToCopy }); renderClientOrderScreen(); } }
function decreaseCartItemQuantity(itemId, noteKey) { let indexToRemove = -1; for (let i = selectedItems.length - 1; i >= 0; i--) { if (selectedItems[i].id == itemId && (selectedItems[i].note || '') === noteKey) { indexToRemove = i; break; } } if (indexToRemove > -1) { selectedItems.splice(indexToRemove, 1); renderClientOrderScreen(); } }
function openProductInfoModal(product) { if (!product) return; const modal = document.getElementById('productInfoModal'); const img = document.getElementById('infoProductImage'); const nameEl = document.getElementById('infoProductName'); const priceEl = document.getElementById('infoProductPrice'); const descEl = document.getElementById('infoProductDescription'); const addBtn = document.getElementById('infoProductAddBtn'); if (!modal) return; img.src = product.image || 'https://placehold.co/600x400/1f2937/d1d5db?text=Produto'; nameEl.textContent = product.name; priceEl.textContent = formatCurrency(product.price); descEl.innerHTML = product.description || 'Sem descrição.'; const newAddBtn = addBtn.cloneNode(true); addBtn.parentNode.replaceChild(newAddBtn, addBtn); newAddBtn.onclick = () => { addItemToCart(product); modal.style.display = 'none'; }; modal.style.display = 'flex'; }
function openClientObsModal(itemId, noteKey) { let products = currentBusinessType === 'food' ? getProducts() : DEMO_DATA[currentBusinessType].products; const product = products.find(p => p.id == itemId); const esperaSwitch = document.getElementById('esperaSwitch'); if (!clientObsModal || !product || !esperaSwitch) return; const regexEspera = new RegExp(ESPERA_KEY.replace('(', '\\(').replace(')', '\\)'), 'ig'); const isEspera = regexEspera.test(noteKey); let cleanNote = noteKey.replace(regexEspera, '').trim(); if (cleanNote.startsWith(',')) cleanNote = cleanNote.substring(1).trim(); clientObsModal.querySelector('h3').textContent = product.name; clientObsText.value = cleanNote; esperaSwitch.checked = isEspera; clientObsModal.dataset.itemId = itemId; clientObsModal.dataset.originalNoteKey = noteKey; clientObsModal.style.display = 'flex'; }
function _renderClientCart() { const cartItemsList = document.getElementById('client-cart-items-list'); if (!cartItemsList) return; if (selectedItems.length === 0) { cartItemsList.innerHTML = `<div class="text-sm md:text-base text-dark-placeholder italic p-2">Nenhum item selecionado.</div>`; } else { const groupedItems = selectedItems.reduce((acc, item) => { const key = `${item.id}-${item.note || ''}`; if (!acc[key]) acc[key] = { ...item, count: 0 }; acc[key].count++; return acc; }, {}); cartItemsList.innerHTML = Object.values(groupedItems).map(group => { const note = group.note || ''; const regexEspera = new RegExp(ESPERA_KEY.replace('(', '\\(').replace(')', '\\)'), 'ig'); const isEspera = regexEspera.test(note); let displayNote = note.replace(regexEspera, '').trim(); if (displayNote.startsWith(',')) displayNote = displayNote.substring(1).trim(); let noteHtml = ''; if (isEspera) noteHtml = `<span class="text-yellow-400 font-semibold">${ESPERA_KEY}</span>`; if (displayNote) noteHtml += ` <span class="text-brand-primary">(${displayNote})</span>`; if (!noteHtml) noteHtml = `(Adicionar Obs.)`; return `<div class="flex justify-between items-center bg-dark-input p-3 rounded-lg shadow-sm"><div class="flex flex-col flex-grow min-w-0 mr-2"><span class="font-semibold text-white">${group.name} (${group.count}x)</span><span class="text-sm cursor-pointer text-gray-400 hover:text-white obs-span" data-item-id="${group.id}" data-item-note-key="${note}">${noteHtml}</span></div><div class="flex items-center space-x-2 flex-shrink-0"><button class="qty-btn bg-red-600 text-white rounded-full h-8 w-8 flex items-center justify-center" data-item-id="${group.id}" data-item-note-key="${note}" data-action="decrease"><i class="fas fa-minus"></i></button><button class="qty-btn bg-green-600 text-white rounded-full h-8 w-8 flex items-center justify-center" data-item-id="${group.id}" data-item-note-key="${note}" data-action="increase"><i class="fas fa-plus"></i></button></div></div>`; }).join(''); } }
function showAssocError(message) { if (assocErrorMsg) { assocErrorMsg.textContent = message; assocErrorMsg.style.display = 'block'; } }
function renderClientQuickObsButtons(observations) { if (!clientQuickObsButtons) return; if (observations.length === 0) { clientQuickObsButtons.innerHTML = '<p class="text-xs italic">Nenhuma obs.</p>'; return; } clientQuickObsButtons.innerHTML = observations.map(obs => `<button class="quick-obs-btn text-xs px-3 py-1 bg-dark-input rounded-full hover:bg-gray-600" data-obs="${obs.text}">${obs.text}</button>`).join(''); }
export const fetchQuickObservations = async () => { try { if (quickObsCache.length > 0) { renderClientQuickObsButtons(quickObsCache); return quickObsCache; } const q = query(getQuickObsCollectionRef(), orderBy('text', 'asc')); const snap = await getDocs(q); quickObsCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); renderClientQuickObsButtons(quickObsCache); } catch (e) { console.error(e); } };
function showMenuSkeleton() { if (!clientMenuContainer) return; clientMenuContainer.innerHTML = Array(6).fill(0).map(() => `<div class="bg-dark-card border border-dark-border rounded-xl shadow-md flex flex-col overflow-hidden h-64"><div class="w-full h-32 skeleton"></div><div class="p-4 flex flex-col flex-grow space-y-3"><div class="h-4 w-3/4 skeleton"></div><div class="h-4 w-1/2 skeleton"></div><div class="mt-auto h-8 w-full skeleton rounded-lg"></div></div></div>`).join(''); }
function openAssociationModal() { 
    if (associationModal) { 
        if(assocErrorMsg) assocErrorMsg.style.display = 'none'; 
        associationModal.style.display = 'flex'; 
        document.querySelectorAll('.assoc-tab-btn').forEach(b => b.classList.remove('active')); 
        document.querySelectorAll('.assoc-tab-content').forEach(c => c.style.display = 'none'); 
        
        // Padrão: Abrir na aba 'mesa'
        const mesaTab = document.querySelector('.assoc-tab-btn[data-tab="mesa"]'); 
        const mesaContent = document.getElementById('content-mesa'); 
        if(mesaTab) mesaTab.classList.add('active'); 
        if(mesaContent) mesaContent.style.display = 'block'; 
        currentAssociationTab = 'mesa'; 
        
        toggleTabInputs('mesa'); // Habilita inputs da aba 'mesa'
        
        if (activateTableNumber) activateTableNumber.focus(); 
        const defaultActionButtons = document.getElementById('defaultActionButtons'); 
        if (defaultActionButtons) defaultActionButtons.style.display = 'flex'; 
    } 
}
function closeAssociationModal() { if (associationModal) associationModal.style.display = 'none'; }
function openCustomerRegistrationModal() { if (customerRegistrationModal && tempUserData) { regCustomerName.textContent = tempUserData.name || 'Nome não encontrado'; regCustomerEmail.textContent = tempUserData.email || 'Email não encontrado'; regCustomerWhatsapp.value = ''; regCustomerBirthday.value = ''; if(regErrorMsg) regErrorMsg.style.display = 'none'; customerRegistrationModal.style.display = 'flex'; associationModal.style.display = 'none'; } }
function closeCustomerRegistrationModal() { if (customerRegistrationModal) customerRegistrationModal.style.display = 'none'; }