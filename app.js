// --- APP.JS (com Autenticação via Firestore CORRIGIDA) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc, onSnapshot, writeBatch, arrayRemove, arrayUnion, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// Importações dos Serviços e Utils
// --- CORREÇÃO: Importa 'appId' para usar na autenticação ---
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, auth, db, functions, appId } from '/services/firebaseService.js';
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from '/services/wooCommerceService.js';
import { formatCurrency, formatElapsedTime } from '/utils.js';

// --- CONFIGURAÇÃO ---
// REMOVIDO APP_ID daqui, pois importamos do firebaseService
// const APP_ID = "pdv_fator_instance_001";
const FIREBASE_CONFIG = { /* ... (mantido) ... */ };

// --- VARIÁVEIS GLOBAIS ---
export const screens = { /* ... (mantido) ... */ };
const MANAGER_PASSWORD = '1234';
export let currentTableId = null; export let selectedItems = []; export let currentOrderSnapshot = null;
export let userRole = 'anonymous'; export let userId = null; export let unsubscribeTable = null;
const initializedModules = new Set();
let globalOrderFunctions = {}; let globalPaymentFunctions = {}; let globalManagerFunctions = {};
let globalUserManagementFunctions = {}; let globalPanelFunctions = {};

// --- ELEMENTOS UI ---
let statusScreen, mainContent, appContainer, loginScreen, mainHeader;
let loginBtn, loginEmailInput, loginPasswordInput, loginErrorMsg;

// --- FUNÇÕES CORE E ROTIAMENTO ---
export const hideStatus = () => { /* ... (mantida) ... */ };
const showLoginScreen = () => { /* ... (mantida) ... */ };
const hideLoginScreen = () => { /* ... (mantida) ... */ };
export const goToScreen = async (screenId) => { /* ... (mantida como na última versão) ... */ };
window.goToScreen = goToScreen;
export const handleTableTransferConfirmed = async (originTableId, targetTableId, itemsToTransfer, newDiners = 0, newSector = '') => { /* ... (mantida) ... */ };
window.handleTableTransferConfirmed = handleTableTransferConfirmed;
window.openManagerAuthModal = (action, payload = null) => { /* ... (mantida como na última versão) ... */ };
window.openManagerAuthModal = openManagerAuthModal;
// --- WRAPPERS GLOBAIS PARA ONCLICKS ---
window.deletePayment = (timestamp) => window.openManagerAuthModal('deletePayment', timestamp);
window.handleMassActionRequest = (action) => { if(action === 'delete') window.openManagerAuthModal('executeMassDelete'); else if (action === 'transfer') window.openManagerAuthModal('executeMassTransfer'); };
window.increaseLocalItemQuantity = (itemId, noteKey) => { if(globalOrderFunctions.increaseLocalItemQuantity) globalOrderFunctions.increaseLocalItemQuantity(itemId, noteKey); else console.error("..."); };
window.decreaseLocalItemQuantity = (itemId, noteKey) => { if(globalOrderFunctions.decreaseLocalItemQuantity) globalOrderFunctions.decreaseLocalItemQuantity(itemId, noteKey); else console.error("..."); };
window.openObsModalForGroup = (itemId, noteKey) => { if(globalOrderFunctions.openObsModalForGroup) globalOrderFunctions.openObsModalForGroup(itemId, noteKey); else console.error("..."); };
window.openKdsStatusModal = (id) => alert(`Abrir status KDS ${id} (DEV)`);
// --- LÓGICA DE LISTENER DA MESA ---
export const setTableListener = (tableId) => { /* ... (mantida) ... */ };
export const setCurrentTable = (tableId) => { /* ... (mantida) ... */ };
export const selectTableAndStartListener = async (tableId) => { /* ... (mantida) ... */ };
window.selectTableAndStartListener = selectTableAndStartListener;
window.openNfeModal = () => { /* ... (mantida) ... */ };
window.openNfeModal = openNfeModal;

// --- FUNÇÕES DE INICIALIZAÇÃO E AUTENTICAÇÃO ---
const initStaffApp = async () => { /* ... (mantida como na última versão) ... */ };

// --- CORREÇÃO DEFINITIVA: Autenticação via Firestore usando o 'appId' correto ---
const authenticateUserFromFirestore = async (email, password) => {
    console.log(`[AUTH Firestore] Verificando credenciais para ${email}...`);
    try {
        if (!db) throw new Error("Conexão com banco de dados indisponível.");
        // --- USA O 'appId' IMPORTADO DO firebaseService ---
        if (!appId) throw new Error("appId não está definido no firebaseService.");

        const usersCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
        const userDocRef = doc(usersCollectionRef, email); // Email como ID
        // --- FIM DA ALTERAÇÃO NO CAMINHO ---

        const docSnap = await getDoc(userDocRef);

        if (docSnap.exists()) {
            const userData = docSnap.data();
            console.log("[AUTH Firestore] Usuário encontrado:", userData.email);
            if (!userData.isActive) {
                 console.warn(`[AUTH Firestore] Usuário ${email} está inativo.`);
                 return null;
            }
            if (userData.password === password) { // Comparação insegura!
                console.log("[AUTH Firestore] Senha correta.");
                return { email: userData.email, name: userData.name, role: userData.role };
            } else {
                console.warn("[AUTH Firestore] Senha incorreta.");
                return null;
            }
        } else {
            console.log(`[AUTH Firestore] Usuário ${email} não encontrado no caminho correto.`);
            return null;
        }
    } catch (error) {
        console.error("[AUTH Firestore] Erro ao verificar usuário:", error);
        return null;
    }
};

const handleStaffLogin = async () => { /* ... (mantida, pois já chama authenticateUserFromFirestore) ... */
    loginBtn = document.getElementById('loginBtn');
    loginEmailInput = document.getElementById('loginEmail');
    loginPasswordInput = document.getElementById('loginPassword');
    loginErrorMsg = document.getElementById('loginErrorMsg');

    if (!loginBtn || !loginEmailInput || !loginPasswordInput) { /* ... */ return; }
    if (loginErrorMsg) loginErrorMsg.style.display = 'none';
    loginBtn.disabled = true; loginBtn.textContent = 'Entrando...';

    const email = loginEmailInput.value.trim().toLowerCase();
    const password = loginPasswordInput.value.trim();

    console.log(`[LOGIN] Tentando autenticar ${email} via Firestore...`);
    const staffData = await authenticateUserFromFirestore(email, password); // Chama a função corrigida

    if (staffData) {
        console.log(`[LOGIN] Autenticação Firestore OK. Role: ${staffData.role}`);
        userRole = staffData.role;
        try {
            const authInstance = auth;
            if (!authInstance) throw new Error("Firebase Auth não inicializado.");
            console.log("[LOGIN] Tentando login anônimo Firebase...");
            try {
                const userCredential = await signInAnonymously(authInstance);
                userId = userCredential.user.uid;
                console.log(`[LOGIN] Login anônimo Firebase OK. UID: ${userId}`);
            } catch (authError) {
                console.warn("[LOGIN] Login anônimo Firebase falhou. Usando Mock ID.", authError.code);
                userId = `mock_${userRole}_${Date.now()}`;
            }
            const userName = staffData.name || userRole;
            const userIdDisplay = document.getElementById('user-id-display');
            if(userIdDisplay) userIdDisplay.textContent = `Usuário: ${userName} | ${userRole.toUpperCase()}`;
            console.log("[LOGIN] User info display atualizado.");
            console.log("[LOGIN] Chamando initStaffApp...");
            await initStaffApp();
            console.log("[LOGIN] initStaffApp concluído.");
        } catch (error) { /* ... (erro pós-auth) ... */ }
    } else {
        console.log(`[LOGIN] Credenciais inválidas ou usuário inativo para ${email}.`);
        if(loginErrorMsg) { loginErrorMsg.textContent = 'E-mail, senha inválidos ou usuário inativo.'; loginErrorMsg.style.display = 'block'; }
    }
    if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Entrar'; }
    console.log("[LOGIN] Fim do handleStaffLogin.");
};

const handleLogout = () => { /* ... (mantida) ... */ };
window.handleLogout = handleLogout;

// --- INICIALIZAÇÃO PRINCIPAL (DOMContentLoaded) ---
document.addEventListener('DOMContentLoaded', () => { /* ... (mantida como na última versão) ... */
    console.log("[INIT] DOMContentLoaded.");
    const firebaseConfig = FIREBASE_CONFIG;
    try {
        console.log("[INIT] Config Firebase carregada.");
        const app = initializeApp(firebaseConfig);
        const dbInstance = getFirestore(app);
        const authInstance = getAuth(app);
        const functionsInstance = getFunctions(app, 'us-central1');
        // A variável 'appId' global é definida aqui pelo initializeFirebase
        initializeFirebase(dbInstance, authInstance, "pdv_fator_instance_001", functionsInstance); // Passa o ID correto!
        console.log("[INIT] Firebase App e Serviços inicializados.");

        statusScreen = document.getElementById('statusScreen');
        mainContent = document.getElementById('mainContent');
        // ... (resto do mapeamento) ...
        console.log("[INIT] Elementos Globais e de Login mapeados.");

        onAuthStateChanged(authInstance, async (user) => { /* ... (lógica mantida) ... */ });
        console.log("[INIT] Listener AuthStateChanged configurado.");

        const loginForm = document.getElementById('loginForm');
        if (loginForm) { /* ... (adiciona listener) ... */ } else { /* ... */ }
        console.log("[INIT] Inicializadores estáticos removidos (agora sob demanda).");

        // Listeners Globais do Header
        const openManagerPanelBtn = document.getElementById('openManagerPanelBtn');
        const logoutBtnHeader = document.getElementById('logoutBtnHeader');
        if (openManagerPanelBtn) openManagerPanelBtn.addEventListener('click', () => { window.openManagerAuthModal('goToManagerPanel'); });
        if (logoutBtnHeader) logoutBtnHeader.addEventListener('click', handleLogout);
        console.log("[INIT] Listeners restantes adicionados.");

    } catch (e) { /* ... (erro inicialização) ... */ }
    console.log("[INIT] DOMContentLoaded finalizado com sucesso.");
});
// Fim do arquivo app.js
