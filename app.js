// --- APP.JS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Importações dos Módulos Refatorados
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, getCustomersCollectionRef } from './services/firebaseService.js';
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from './services/wooCommerceService.js';
import { loadOpenTables, renderTableFilters, handleAbrirMesa, loadTableOrder } from './controllers/panelController.js';
import { renderMenu } from './controllers/orderController.js';
import { openManagerAuthModal } from './controllers/managerController.js';


// --- VARIÁVEIS DE ESTADO GLOBAL ---
export const screens = { 'panelScreen': 0, 'orderScreen': 1, 'paymentScreen': 2, 'managerScreen': 3 };
export const mockUsers = { 'gerente': '1234', 'garcom': '1234' };

// Variáveis Mutáveis (Estado da Sessão)
export let currentTableId = null;
export let selectedItems = []; 
export let currentOrderSnapshot = null;
export let userRole = 'anonymous'; 
export let userId = null;
export let unsubscribeTable = null;


// --- ELEMENTOS UI ---
const statusScreen = document.getElementById('statusScreen');
const mainContent = document.getElementById('mainContent');
const appContainer = document.getElementById('appContainer');

const loginModal = document.getElementById('loginModal');
const logoutBtnHeader = document.getElementById('logoutBtnHeader');
const abrirMesaBtn = document.getElementById('abrirMesaBtn');

// Elementos de Login
const clientLoginBtn = document.getElementById('clientLoginBtn');
const clientNameInput = document.getElementById('clientNameInput');
const clientTableInput = document.getElementById('clientTableInput');
const clientPhoneInput = document.getElementById('clientPhoneInput'); 
const staffLoginBtn = document.getElementById('staffLoginBtn'); 
const loginUsernameInput = document.getElementById('loginUsername');
const loginPasswordInput = document.getElementById('loginPassword');


// --- FUNÇÕES CORE E ROTEAMENTO ---

export const hideStatus = () => {
    if (statusScreen && mainContent) {
        statusScreen.style.display = 'none';
        mainContent.style.display = 'block';
    }
};

const showLoginModal = () => {
    if (statusScreen) statusScreen.style.display = 'none'; // Garante que o status suma
    if (mainContent) mainContent.style.display = 'none'; // Garante que o conteúdo principal (por baixo) suma
    
    if (loginModal) {
        loginModal.style.display = 'flex'; // Força a exibição do modal
    }
};

const hideLoginModal = () => {
    if (loginModal) {
        loginModal.style.display = 'none';
        mainContent.style.display = 'block';
    }
};

export const goToScreen = (screenId) => {
    if (screenId === 'panelScreen' && currentTableId) {
        saveSelectedItemsToFirebase(currentTableId, selectedItems);
    }

    if (screenId === 'panelScreen' && currentTableId && unsubscribeTable) {
        unsubscribeTable(); 
        unsubscribeTable = null; 
    }

    const screenIndex = screens[screenId];
    if (screenIndex !== undefined) {
        if (appContainer) {
            appContainer.style.transform = `translateX(-${screenIndex * 100}vw)`;
        }
        document.body.classList.toggle('bg-gray-900', screenId === 'managerScreen');
        document.body.classList.toggle('bg-gray-100', screenId !== 'managerScreen');
    }
};

window.goToScreen = goToScreen; 
window.openManagerAuthModal = openManagerAuthModal; 


// --- LÓGICA DE LOGIN ---

const handleClientLogin = async () => {
    const tableNumber = clientTableInput.value.trim();
    const clientName = clientNameInput.value.trim() || 'Cliente';
    const clientPhone = clientPhoneInput.value.trim(); 
    const isRegistering = !document.getElementById('clientRegistrationFields').classList.contains('hidden');

    if (!tableNumber || parseInt(tableNumber) <= 0) {
        alert('Por favor, insira um número de Mesa/Comanda válido.');
        return;
    }

    const tableRef = getTableDocRef(tableNumber);
    const docSnap = await getDoc(tableRef);

    if (!docSnap.exists() || docSnap.data().status !== 'open') {
        alert(`A Mesa ${tableNumber} não está aberta. Chame um garçom.`);
        return;
    }
    
    try {
        const authInstance = auth;
        const userCredential = await signInAnonymously(authInstance);
        userId = userCredential.user.uid;
        userRole = 'client';

        const customerRef = doc(getCustomersCollectionRef(), userId);
        const customerData = {
            id: userId,
            name: clientName,
            phone: clientPhone,
            isRegistered: isRegistering,
            lastSeen: serverTimestamp(),
        };
        
        if (isRegistering || !(await getDoc(customerRef)).exists()) {
             await setDoc(customerRef, customerData, { merge: true }); 
        }

        currentTableId = tableNumber;
        await updateDoc(tableRef, { 
            clientId: userId, 
            clientName: clientName, 
            lastClientLogin: serverTimestamp() 
        });
        
        document.getElementById('current-table-number').textContent = `Mesa ${currentTableId} (${clientName})`;
        document.getElementById('user-id-display').textContent = `Usuário ID: ${userId.substring(0, 8)} | Função: Cliente`;
        hideLoginModal();
        hideStatus();
        
        loadTableOrder(currentTableId);
        goToScreen('orderScreen');

    } catch (error) {
        console.error("Erro no acesso à comanda digital:", error);
        alert("Falha no acesso à comanda digital.");
    }
};

const handleStaffLogin = async () => {
    const username = loginUsernameInput.value;
    const passwordAttempt = loginPasswordInput.value;
    
    const isAuthenticated = mockUsers[username] === passwordAttempt;

    if (isAuthenticated) {
        userRole = username === 'gerente' ? 'gerente' : 'garcom';
        
        try {
            const authInstance = auth;
            const userCredential = await signInAnonymously(authInstance); 
            userId = userCredential.user.uid; 
            
            hideLoginModal(); 
            hideStatus(); 
            
            document.getElementById('user-id-display').textContent = `Usuário ID: ${userId.substring(0, 8)} | Função: ${userRole}`;
            
            loadOpenTables();
            renderTableFilters(); 
            fetchWooCommerceProducts(renderMenu);
            fetchWooCommerceCategories(renderTableFilters); 
            
            goToScreen('panelScreen');
            
        } catch (error) {
             console.error("Erro ao autenticar Staff:", error);
        }
    } else {
        alert('Credenciais inválidas.');
    }
};

const handleLogout = () => {
    userId = null;
    currentTableId = null;
    selectedItems = [];
    userRole = 'anonymous'; 
    
    if (auth.currentUser) {
        auth.signOut().catch(e => console.error("Erro no sign out:", e)); 
    }
    
    goToScreen('panelScreen');
    showLoginModal();
    document.getElementById('user-id-display').textContent = 'Usuário ID: Deslogado...';
};

window.handleLogout = handleLogout;


// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {

    const firebaseConfig = JSON.parse(window.__firebase_config);
    const app = initializeApp(firebaseConfig); 
    const dbInstance = getFirestore(app);
    const authInstance = getAuth(app);
    
    initializeFirebase(dbInstance, authInstance, window.__app_id); 

    // CHAVE DA CORREÇÃO: Força a exibição do modal de login imediatamente no DOMContentLoaded
    showLoginModal(); 

    onAuthStateChanged(authInstance, (user) => {
        if (user) {
            // Se já autenticado (persistência de sessão), garante que o estado seja carregado
            // A lógica de login do Staff/Cliente cuidará da navegação
        }
    });


    // 1. Event Listeners de Login
    if (staffLoginBtn) {
        staffLoginBtn.addEventListener('click', handleStaffLogin);
    }
    if (clientLoginBtn) {
        clientLoginBtn.addEventListener('click', handleClientLogin);
    }

    // 2. Event Listener para Abrir Mesa
    if (abrirMesaBtn) {
        abrirMesaBtn.addEventListener('click', handleAbrirMesa);
    }
    
    // 3. Carrega UI Inicial (Painel de Mesas e Filtros)
    loadOpenTables();
    renderTableFilters(); 
});
