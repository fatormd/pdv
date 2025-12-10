// --- controllers/clientOrderAuth.js (FIX DEFINITIVO DE RACE CONDITION NO MODAL DE CADASTRO) ---
import { db, auth, getTablesCollectionRef, getTableDocRef, getCustomersCollectionRef } from "/services/firebaseService.js";
import { toggleLoading } from "/utils.js"; 
import { doc, updateDoc, setDoc, getDoc, getDocs, query, serverTimestamp, where, limit } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { showToast, setCurrentTable, setTableListener } from "/app.js"; 

// Variáveis de Módulo (Estado interno do Auth)
let tempUserData = null;
let currentAssociationTab = 'mesa';
const ESPERA_KEY = "(EM ESPERA)"; 

// Variáveis UI que serão mapeadas no initAuth
let associationModal, activateAndSendBtn, googleLoginBtn, activationForm;
let activateTableNumber, activatePickupPin, btnCallMotoboy;
let loggedInStep, loggedInUserName, assocErrorMsg;
let activateWhatsappEntrega, deliveryAddressStreet, deliveryAddressNumber, deliveryAddressNeighborhood, deliveryAddressComplement, deliveryAddressReference;
let customerRegistrationModal, customerRegistrationForm, saveRegistrationBtn, regErrorMsg;
let tabButtons, tabContents;

// Exportado para uso no Controller principal
export let localCurrentClientUser = null;
export let localCurrentTableId = null;

export const initAuth = (externalElements) => {
    // Mapeamento dos elementos passados
    ({ 
        associationModal, activateAndSendBtn, googleLoginBtn, activationForm, 
        activateTableNumber, activatePickupPin, btnCallMotoboy, 
        loggedInStep, loggedInUserName, assocErrorMsg, 
        activateWhatsappEntrega, deliveryAddressStreet, deliveryAddressNumber, deliveryAddressNeighborhood, 
        deliveryAddressComplement, deliveryAddressReference, customerRegistrationModal, customerRegistrationForm, 
        saveRegistrationBtn, regErrorMsg, tabButtons, tabContents
    } = externalElements);

    // Setup de Listeners
    if (googleLoginBtn) googleLoginBtn.onclick = signInWithGoogle;
    if (activationForm) activationForm.addEventListener('submit', handleActivationAndSend);
    if (customerRegistrationForm) customerRegistrationForm.addEventListener('submit', handleNewCustomerRegistration);

    const closeAssociationModalBtn = document.getElementById('closeAssociationModalBtn');
    if (closeAssociationModalBtn) closeAssociationModalBtn.addEventListener('click', closeAssociationModal);
    
    // Lógica de Abas
    if (tabButtons) {
        const updateInputState = (tabName) => {
            tabContents.forEach(content => {
                const isActive = content.id === `content-${tabName}`;
                content.style.display = isActive ? 'block' : 'none';
                const inputs = content.querySelectorAll('input, select, textarea');
                inputs.forEach(input => { input.disabled = !isActive; });
            });
        };

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                tabButtons.forEach(btn => btn.classList.remove('active', 'border-brand-primary', 'text-brand-primary'));
                button.classList.add('active', 'border-brand-primary', 'text-brand-primary');
                currentAssociationTab = button.dataset.tab;
                
                updateInputState(currentAssociationTab);

                const defaultActionButtons = document.getElementById('defaultActionButtons');
                if (defaultActionButtons) defaultActionButtons.style.display = 'flex'; 
                
                // Auto-focus
                if (currentAssociationTab === 'mesa' && activateTableNumber) activateTableNumber.focus(); 
                if (currentAssociationTab === 'retirada' && activatePickupPin) activatePickupPin.focus();
                if (currentAssociationTab === 'entrega' && activateWhatsappEntrega) activateWhatsappEntrega.focus();
            });
        });
        updateInputState('mesa');
    }

    // Retorna funções essenciais
    return { 
        setupAuthStateObserver, 
        handleAuthActionClick, 
        openAssociationModal, 
        localCurrentClientUser: () => localCurrentClientUser, 
        localCurrentTableId: () => localCurrentTableId 
    };
};

// --- Funções de Estado e UI ---

export function updateAuthUI(user, clientUserName, authActionBtn, goToPaymentBtnClient, headerClientNameDisplay) {
    if (clientUserName && authActionBtn) {
        if (user && !user.isAnonymous) {
            clientUserName.textContent = user.displayName || user.name || "Cliente";
            authActionBtn.textContent = "Sair";
            authActionBtn.classList.add('text-red-400');
            if (goToPaymentBtnClient) {
                if (user.photoURL) {
                    goToPaymentBtnClient.innerHTML = `<img src="${user.photoURL}" class="w-full h-full rounded-full border-2 border-brand-primary" alt="Foto">`;
                } else {
                    goToPaymentBtnClient.innerHTML = `<i class="fas fa-user text-brand-primary text-lg"></i>`;
                }
                goToPaymentBtnClient.classList.add('ring-2', 'ring-brand-primary', 'ring-offset-2', 'ring-offset-gray-900');
            }
            if (headerClientNameDisplay) {
                const firstName = (user.displayName || user.name || '').split(' ')[0];
                headerClientNameDisplay.textContent = `Olá, ${firstName}`;
                headerClientNameDisplay.style.display = 'block';
            }
        } else {
            clientUserName.textContent = "Visitante";
            authActionBtn.textContent = "Entrar";
            authActionBtn.classList.remove('text-red-400');
            if (goToPaymentBtnClient) {
                goToPaymentBtnClient.innerHTML = `<i class="fas fa-user-slash text-gray-400 text-lg"></i>`;
                goToPaymentBtnClient.classList.remove('ring-2', 'ring-brand-primary', 'ring-offset-2', 'ring-offset-gray-900');
            }
            if (headerClientNameDisplay) { headerClientNameDisplay.style.display = 'none'; }
        }
    }
}

export function openAssociationModal() {
    if (associationModal) {
        if(assocErrorMsg) assocErrorMsg.style.display = 'none';
        associationModal.style.display = 'flex';
        
        document.querySelectorAll('.assoc-tab-btn').forEach(b => b.classList.remove('active'));
        const mesaTab = document.querySelector('.assoc-tab-btn[data-tab="mesa"]');
        if(mesaTab) { mesaTab.classList.add('active'); mesaTab.click(); }
        
        const defaultActionButtons = document.getElementById('defaultActionButtons');
        if (defaultActionButtons) defaultActionButtons.style.display = 'flex';
    }
}

export function closeAssociationModal() { if (associationModal) associationModal.style.display = 'none'; }

function openCustomerRegistrationModal() {
    // Busca elementos na hora para garantir que o DOM carregou
    const nameEl = document.getElementById('regCustomerName');
    const emailEl = document.getElementById('regCustomerEmail');
    const whatsappEl = document.getElementById('regCustomerWhatsapp');
    const birthdayEl = document.getElementById('regCustomerBirthday');
    const errorEl = document.getElementById('regErrorMsg');
    
    // Checagem de existência dos elementos
    if (!customerRegistrationModal || !tempUserData || !nameEl || !whatsappEl || !birthdayEl) {
        console.error("openCustomerRegistrationModal: Falha ao encontrar elementos do formulário de cadastro.");
        if (customerRegistrationModal) customerRegistrationModal.style.display = 'none';
        showToast("Erro ao iniciar formulário de cadastro. Tente recarregar a página.", true);
        return;
    }

    if (customerRegistrationModal && tempUserData) {
        nameEl.textContent = tempUserData.name || 'Nome não encontrado';
        emailEl.textContent = tempUserData.email || 'Email não encontrado';
        whatsappEl.value = ''; 
        birthdayEl.value = ''; 
        
        if(errorEl) errorEl.style.display = 'none';
        
        customerRegistrationModal.style.display = 'flex';
        associationModal.style.display = 'none';
    }
}

function closeCustomerRegistrationModal() { if (customerRegistrationModal) customerRegistrationModal.style.display = 'none'; }
function showAssocError(message) { if (assocErrorMsg) { assocErrorMsg.textContent = message; assocErrorMsg.style.display = 'block'; } }

// --- Funções de Autenticação Firebase ---

function setupAuthStateObserver(updateAuthUICallback, checkExistingSessionCallback) {
    onAuthStateChanged(auth, async (user) => {
        const clientUserName = document.getElementById('client-user-name');
        const authActionBtn = document.getElementById('authActionBtn'); 
        const goToPaymentBtnClient = document.getElementById('goToPaymentBtnClient');
        const headerClientNameDisplay = document.getElementById('headerClientNameDisplay');

        if (user && !user.isAnonymous) {
            localCurrentClientUser = user; 
            tempUserData = { uid: user.uid, name: user.displayName, email: user.email, photoURL: user.photoURL };
            updateAuthUICallback(user, clientUserName, authActionBtn, goToPaymentBtnClient, headerClientNameDisplay);
            checkCustomerRegistration(user); 
            await checkExistingSessionCallback(user);
        } else if (user && user.isAnonymous) {
             closeAssociationModal();
             closeCustomerRegistrationModal();
        } else {
            localCurrentClientUser = null;
            tempUserData = null;
            updateAuthUICallback(null, clientUserName, authActionBtn, goToPaymentBtnClient, headerClientNameDisplay);
            updateCustomerInfo(null, false);
            if (!localCurrentTableId) { openAssociationModal(); }
        }
    });
}

async function signInWithGoogle(e) {
    e.preventDefault(); 
    const provider = new GoogleAuthProvider();
    try { await signInWithPopup(auth, provider); } 
    catch (error) { console.error("Erro Login:", error); showAssocError("Erro ao tentar logar."); }
}

async function checkCustomerRegistration(user) {
    const customerRef = doc(getCustomersCollectionRef(), user.uid);
    try {
        const docSnap = await getDoc(customerRef);
        if (docSnap.exists() && docSnap.data().phone) { 
            localCurrentClientUser.phone = docSnap.data().phone; 
            updateCustomerInfo(user, false); 
        } else {
            // CORREÇÃO CRÍTICA: Adiciona um pequeno atraso para resolver a race condition no Edge
            setTimeout(() => {
                openCustomerRegistrationModal();
            }, 50); 
        }
    } catch (error) {
        console.error("Erro check customer:", error);
        showAssocError("Erro ao verificar cadastro.");
    }
}

async function handleNewCustomerRegistration(e) {
    e.preventDefault();
    
    const whatsappEl = document.getElementById('regCustomerWhatsapp');
    const birthdayEl = document.getElementById('regCustomerBirthday');
    const errorEl = document.getElementById('regErrorMsg');

    if (!tempUserData || !whatsappEl || !birthdayEl) { showAssocError("Erro: Dados perdidos. Logue novamente."); return; }
    
    const whatsapp = whatsappEl.value;
    const birthday = birthdayEl.value;
    
    if (!whatsapp || !birthday) { 
        if(errorEl) { errorEl.textContent = "Preencha todos os campos."; errorEl.style.display = 'block'; }
        return; 
    }
    if(errorEl) errorEl.style.display = 'none';
    
    const completeUserData = { ...tempUserData, whatsapp: whatsapp, nascimento: birthday };
    saveRegistrationBtn.disabled = true; saveRegistrationBtn.textContent = "Salvando...";
    
    try {
        const customerRef = doc(getCustomersCollectionRef(), completeUserData.uid);
        await setDoc(customerRef, {
            uid: completeUserData.uid, name: completeUserData.name, email: completeUserData.email, phone: completeUserData.whatsapp,  
            birthday: completeUserData.nascimento, photoURL: completeUserData.photoURL || null, points: 0, createdAt: serverTimestamp()
        }, { merge: true });

        if(localCurrentClientUser) localCurrentClientUser.phone = whatsapp;
        showToast("Cadastro concluído!", false);
        closeCustomerRegistrationModal(); 
        openAssociationModal(); 
        updateCustomerInfo(localCurrentClientUser, false); 
    } catch (error) {
        console.error("Erro salvar:", error);
        if(errorEl) { errorEl.textContent = "Falha ao salvar."; errorEl.style.display = 'block'; }
    } finally {
        saveRegistrationBtn.disabled = false; saveRegistrationBtn.textContent = "Salvar e Continuar";
    }
}

function updateCustomerInfo(user, isNew = false) {
    if (!loggedInStep || !loggedInUserName || !googleLoginBtn) return;
    if (user && !isNew) { 
        loggedInStep.style.display = 'block';
        loggedInUserName.textContent = user.displayName || user.email;
        googleLoginBtn.style.display = 'none'; 
    } else {
        loggedInStep.style.display = 'none';
        loggedInUserName.textContent = '';
        googleLoginBtn.style.display = 'flex'; 
    }
}

export function handleAuthActionClick() {
    if (localCurrentClientUser) {
        signOut(auth).then(() => {
            showToast("Você saiu da sua conta.");
            window.location.reload();
        });
    } else {
        openAssociationModal();
    }
}

// --- Lógica de Ativação (Mesa/Retirada/Entrega) ---

export async function checkExistingSession(user) {
    if (!user) return false;
    try {
        const q = query(
            getTablesCollectionRef(),
            where('clientId', '==', user.uid),
            where('status', 'in', ['open', 'merged']),
            limit(1)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            const tableDoc = snapshot.docs[0];
            const tableId = tableDoc.id;
            const tableData = tableDoc.data();
            
            localCurrentTableId = tableId;
            setCurrentTable(tableId, true, false);
            setTableListener(tableId, true);
            
            closeAssociationModal();
            
            let msg = `Retornando à Mesa ${tableData.tableNumber}...`;
            if (tableData.isPickup) msg = `Retornando à Retirada #${tableData.tableNumber}...`;
            if (tableData.isDelivery) msg = `Visualizando Delivery ${tableData.tableNumber}...`;
            showToast(msg, false);
            return true;
        }
    } catch (e) {
        console.error("Erro ao verificar sessão existente:", e);
    }
    return false;
}

async function handleActivationAndSend(e) {
    if (e) e.preventDefault();
    
    let identifier = '';
    let isPickup = false;
    let isDelivery = false;
    let deliveryData = null;

    // Captura de Dados
    if (currentAssociationTab === 'mesa') {
        const rawValue = activateTableNumber.value.trim();
        if (!rawValue) { showAssocError("Informe o número da mesa."); return; }
        identifier = parseInt(rawValue).toString(); 
    } 
    else if (currentAssociationTab === 'retirada') {
        identifier = activatePickupPin.value.trim();
        if (!identifier || identifier.length < 4) { showAssocError("PIN inválido (min 4 dígitos)."); return; }
        isPickup = true;
    }
    else if (currentAssociationTab === 'entrega') {
        identifier = activateWhatsappEntrega.value.trim();
        if (!identifier || identifier.length < 8) { showAssocError("WhatsApp inválido."); return; }
        
        const street = deliveryAddressStreet.value.trim();
        const num = deliveryAddressNumber.value.trim();
        const hood = deliveryAddressNeighborhood.value.trim();
        
        if (!street || !num || !hood) { showAssocError("Endereço incompleto."); return; }
        
        isDelivery = true;
        deliveryData = {
            street, number: num, neighborhood: hood,
            complement: deliveryAddressComplement.value.trim(), reference: deliveryAddressReference.value.trim()
        };
    }

    if (!localCurrentClientUser) { showAssocError("Faça login para continuar."); return; }

    toggleLoading(activateAndSendBtn, true);
    if(assocErrorMsg) assocErrorMsg.style.display = 'none';

    try {
        let tableDocId = identifier;
        if (isPickup) tableDocId = `pickup_${identifier}`;
        if (isDelivery) tableDocId = `delivery_${identifier}`; 

        if (localCurrentTableId && localCurrentTableId !== tableDocId) {
             throw new Error(`Você já possui um pedido aberto (ID: ${localCurrentTableId}).`);
        }
        
        const tableRef = getTableDocRef(tableDocId);
        const tableSnap = await getDoc(tableRef);

        localCurrentTableId = tableDocId;
        setCurrentTable(tableDocId, true, false);

        const clientData = {
            uid: localCurrentClientUser.uid, name: localCurrentClientUser.displayName, phone: localCurrentClientUser.phone || null
        };

        if (tableSnap.exists() && tableSnap.data().status !== 'closed') {
             // Mesa já aberta -> Só vincula / atualiza dados do cliente
             if (tableSnap.data().clientId !== clientData.uid) {
                await updateDoc(tableRef, { clientId: clientData.uid, clientName: clientData.name, clientPhone: clientData.phone });
             }
        } else {
            // Reabre ou Cria Novo
            let sectorName = isPickup ? 'Retirada' : (isDelivery ? 'Entrega' : 'Cliente');

            await setDoc(tableRef, {
                tableNumber: isPickup || isDelivery ? identifier : parseInt(identifier), 
                status: 'open', sector: sectorName, isPickup: isPickup, isDelivery: isDelivery, deliveryAddress: deliveryData,
                createdAt: serverTimestamp(), total: 0, sentItems: [], payments: [], serviceTaxApplied: true, requestedOrders: [],
                clientId: clientData.uid, clientName: clientData.name, clientPhone: clientData.phone,
                anonymousUid: null, selectedItems: []
            });
        }

        setTableListener(tableDocId, true);
        
        let msg = `Mesa ${identifier} vinculada!`;
        if (isPickup) msg = `Retirada #${identifier} iniciada!`;
        if (isDelivery) msg = `Delivery para ${identifier} iniciado!`;
        showToast(msg, false);
        closeAssociationModal();

    } catch (error) {
        console.error(error);
        showAssocError(error.message);
    } finally {
        toggleLoading(activateAndSendBtn, false, 'Confirmar');
    }
}