// --- APP.JS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Importações dos Módulos Refatorados
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, getCustomersCollectionRef } from './services/firebaseService.js';
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from './services/wooCommerceService.js';
import { loadOpenTables, renderTableFilters, handleAbrirMesa, loadTableOrder } from './controllers/panelController.js';
import { renderMenu } from './controllers/orderController.js';
import { openManagerAuthModal } from './controllers/managerController.js';


// --- VARIÁVEIS DE ESTADO GLOBAL ---
export const screens = { 'panelScreen': 0, 'orderScreen': 1, 'paymentScreen': 2, 'managerScreen': 3 };

// NOVO: Credenciais Staff Centralizadas (para login unificado)
const STAFF_CREDENTIALS = {
    'agencia@fatormd.com': { password: '98763543210', role: 'gerente', name: 'Fmd' }, 
    // Outros funcionários seriam adicionados aqui
};

// MOCK: Credenciais do Visitante
const VISITANTE_CREDENTIALS = {
    email: 'visitante@fator.com.br',
    password: '98763543210', 
};

// Variáveis Mutáveis (Estado da Sessão)
export let currentTableId = null;
export let selectedItems = []; 
export let currentOrderSnapshot = null;
export let userRole = 'anonymous'; // 'visitante', 'cliente', 'garcom', 'gerente'
export let userId = null;
export let unsubscribeTable = null;


// --- ELEMENTOS UI ---
const statusScreen = document.getElementById('statusScreen');
const mainContent = document.getElementById('mainContent');
const appContainer = document.getElementById('appContainer');

const loginModal = document.getElementById('loginModal');
const logoutBtnHeader = document.getElementById('logoutBtnHeader');
const abrirMesaBtn = document.getElementById('abrirMesaBtn');

// Elementos de Login (Mapeamento das novas guias)
const visitanteLoginBtn = document.getElementById('visitanteLoginBtn');
const visitanteMesaInput = document.getElementById('visitanteMesa');
const visitantePessoasInput = document.getElementById('visitantePessoas');
const clienteLoginBtn = document.getElementById('clienteLoginBtn');
const clienteEmailInput = document.getElementById('clienteEmail');
const clienteSenhaInput = document.getElementById('clienteSenha');
const clienteMesaInput = document.getElementById('clienteMesa');
const clientePessoasInput = document.getElementById('clientePessoas');


// --- FUNÇÕES CORE E ROTEAMENTO ---

export const hideStatus = () => {
    if (statusScreen && mainContent) {
        statusScreen.style.display = 'none';
        mainContent.style.display = 'block';
    }
};

const showLoginModal = () => {
    if (statusScreen) statusScreen.style.display = 'none'; 
    if (mainContent) mainContent.style.display = 'none'; 
    
    if (loginModal) {
        loginModal.style.display = 'flex'; 
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


// --- LÓGICA DE AUTH/LOGIN ---

// Helper para determinar se o usuário é Staff após autenticação
const getStaffRole = (email, password) => {
    const creds = STAFF_CREDENTIALS[email];
    if (creds && creds.password === password) {
        return creds.role;
    }
    return null;
};

// 1. Login Visitante
const handleVisitanteLogin = async () => {
    const tableNumber = visitanteMesaInput.value.trim();
    const pessoas = visitantePessoasInput.value.trim();
    const email = document.getElementById('visitanteEmail').value;
    const senha = document.getElementById('visitanteSenha').value;

    if (!tableNumber || parseInt(tableNumber) < 0 || !pessoas || parseInt(pessoas) < 1) {
        alert('Preencha o Nº da Mesa (Mesa 0 é permitido para Staff) e o Nº de Pessoas (mínimo 1).');
        return;
    }
    
    if (tableNumber !== '0') {
        const tableRef = getTableDocRef(tableNumber);
        const docSnap = await getDoc(tableRef);

        if (!docSnap.exists() || docSnap.data().status !== 'open') {
            alert(`A Mesa ${tableNumber} não está aberta. Chame um garçom.`);
            return;
        }
    }

    try {
        // Simulação de login (sem Firebase Auth, apenas para setar o userRole)
        userRole = 'visitante';
        userId = `visitante_${Date.now()}`; 

        // 1. Loga anonimamente no Firebase (para ter um userId)
        await signInAnonymously(auth);

        // 2. Define o estado da mesa
        currentTableId = tableNumber;
        
        // 3. Redireciona
        document.getElementById('user-id-display').textContent = `Usuário ID: ${userId.substring(0, 8)} | Função: Visitante`;
        hideLoginModal();
        hideStatus();

        // Se for Mesa 0 (Garçom pedindo acesso rápido), vai para o Painel de Mesas
        if (tableNumber === '0') {
            alert("Acesso rápido concedido. Por favor, use a guia 'Cliente da Casa' para login Staff completo.");
            goToScreen('panelScreen');
        } else {
             // Se for Mesa > 0 (Cliente Visitante), vai para o Pedido
             // Nota: Criar ou atualizar a mesa com o número de pessoas (diners)
             const tableRef = getTableDocRef(tableNumber);
             await updateDoc(tableRef, { clientName: 'Visitante', diners: parseInt(pessoas) }, { merge: true });

             loadTableOrder(currentTableId);
             goToScreen('orderScreen');
        }

    } catch (error) {
        console.error("Erro no acesso Visitante:", error);
        alert("Falha no acesso Visitante.");
    }
};


// 2. Login Cliente da Casa / Staff
const handleClienteLogin = async () => {
    const tableNumber = clienteMesaInput.value.trim();
    const pessoas = clientePessoasInput.value.trim();
    const email = clienteEmailInput.value.trim();
    const senha = clienteSenhaInput.value.trim();

    if (!email || !senha || !tableNumber || parseInt(tableNumber) < 0 || !pessoas || parseInt(pessoas) < 1) {
        alert('Preencha E-mail, Senha (WhatsApp), Nº da Mesa e Nº de Pessoas (mínimo 1).');
        return;
    }
    
    // Checagem de Staff (Autenticação Unificada)
    let isStaff = false;
    let staffRole = getStaffRole(email, senha);

    if (staffRole) {
        isStaff = true;
        userRole = staffRole; // Define o role: 'garcom' ou 'gerente'
    }

    try {
        // 1. Autenticação Firebase: Tenta Login
        await signInWithEmailAndPassword(auth, email, senha);
        userId = auth.currentUser.uid;
        
        // 2. Lógica de Staff (Mesa 0/Painel)
        if (isStaff) {
             currentTableId = '0'; // Staff sempre opera a partir do Painel de Mesas
             
             // Redireciona para o Painel de Mesas
             document.getElementById('user-id-display').textContent = `Usuário ID: ${userId.substring(0, 8)} | Função: ${userRole.toUpperCase()}`;
             hideLoginModal();
             hideStatus();
             goToScreen('panelScreen');
             return;
        } 
        
        // 3. Lógica de Cliente da Casa (Mesa > 0)
        userRole = 'cliente';
        
        if (tableNumber === '0') {
            alert("Clientes não podem acessar 'Mesa 0'. Insira o número da sua mesa.");
            return;
        }
        
        const tableRef = getTableDocRef(tableNumber);
        const docSnap = await getDoc(tableRef);

        if (!docSnap.exists() || docSnap.data().status !== 'open') {
            alert(`A Mesa ${tableNumber} não está aberta. Chame um garçom.`);
            return;
        }

        // 4. Cadastro/Atualização do Cliente no CRM
        const customerRef = doc(getCustomersCollectionRef(), userId);
        const customerData = {
            id: userId,
            name: email.split('@')[0], 
            email: email,
            phone: senha, 
            lastSeen: serverTimestamp(),
            isCustomer: true
        };
        await setDoc(customerRef, customerData, { merge: true });
        
        // 5. Atualiza a mesa (Define o número de pessoas)
        currentTableId = tableNumber;
        await updateDoc(tableRef, { 
            clientId: userId, 
            clientName: email.split('@')[0],
            diners: parseInt(pessoas), 
            lastClientLogin: serverTimestamp() 
        });

        document.getElementById('user-id-display').textContent = `Usuário ID: ${userId.substring(0, 8)} | Função: Cliente da Casa`;
        hideLoginModal();
        hideStatus();
        loadTableOrder(currentTableId);
        goToScreen('orderScreen');


    } catch (error) {
        console.error("Erro no login/cadastro Cliente da Casa:", error.code);
        
        // Se o usuário não existe (Login falhou), tenta cadastrar
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
             try {
                // Tenta criar a conta
                await createUserWithEmailAndPassword(auth, email, senha);
                // Se o cadastro for bem-sucedido, loga automaticamente
                alert("Cadastro realizado com sucesso! Você será logado.");
                handleClienteLogin(); 
             } catch (registerError) {
                  alert(`Erro ao cadastrar. Verifique o formato do E-mail e a Senha (WhatsApp).`);
             }
        } else {
             alert(`Erro de autenticação: ${error.message}`);
        }
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

    // CRITICAL FIX: Garante que o modal de login apareça e esconde a tela de status
    onAuthStateChanged(authInstance, (user) => {
        if (!user) {
            showLoginModal();
        } 
    });


    // 1. Event Listeners de Login
    if (visitanteLoginBtn) {
        visitanteLoginBtn.addEventListener('click', handleVisitanteLogin);
    }
    if (clienteLoginBtn) {
        clienteLoginBtn.addEventListener('click', handleClienteLogin);
    }

    // 2. Event Listener para Abrir Mesa
    if (abrirMesaBtn) {
        abrirMesaBtn.addEventListener('click', handleAbrirMesa);
    }
    
    // 3. Carrega UI Inicial (Painel de Mesas e Filtros)
    loadOpenTables();
    renderTableFilters(); 
});
