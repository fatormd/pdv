// --- SERVICES/FIREBASESERVICE.JS (COM STORAGE & MODO OFFLINE ATIVOS) ---

// 1. Adicionamos 'enableIndexedDbPersistence' na importação
import { collection, doc, updateDoc, arrayUnion, serverTimestamp, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// Variáveis globais exportadas
export let db = null;
export let auth = null;
export let appId = null;
export let functions = null;
export let storage = null;

// Exporta as ferramentas para os outros arquivos usarem
export { arrayUnion, serverTimestamp, ref, uploadBytes, getDownloadURL };

// Função de inicialização
export const initializeFirebase = (database, authentication, appIdentifier, appFunctions) => {
    db = database;
    auth = authentication;
    appId = appIdentifier;
    functions = appFunctions;

    // 2. ATIVAÇÃO DA PERSISTÊNCIA OFFLINE (NOVO)
    // Isso permite que o sistema funcione mesmo se a internet cair
    enableIndexedDbPersistence(db)
        .then(() => {
            console.log("[FirebaseService] Modo Offline ativado com sucesso.");
        })
        .catch((err) => {
            if (err.code == 'failed-precondition') {
                // Provavelmente múltiplas abas abertas ao mesmo tempo
                console.warn('[FirebaseService] Persistência offline falhou: Múltiplas abas abertas.');
            } else if (err.code == 'unimplemented') {
                // Navegador não suporta (ex: modo anônimo de alguns browsers)
                console.warn('[FirebaseService] Persistência offline não suportada neste navegador.');
            }
        });

    // 3. INICIALIZAÇÃO AUTOMÁTICA DO STORAGE
    if (db && db.app) {
        try {
            storage = getStorage(db.app);
            console.log("[FirebaseService] Storage inicializado.");
        } catch (e) {
            console.error("[FirebaseService] Erro ao iniciar Storage:", e);
        }
    }
};

// ==================================================================
//               REFERÊNCIAS DE COLEÇÕES (Collection Refs)
// ==================================================================

export const getCollectionRef = (name) => collection(db, 'artifacts', appId, 'public', 'data', name);

// Mesas e Pedidos
export const getTablesCollectionRef = () => getCollectionRef('tables');
export const getTableDocRef = (tableNumber) => doc(db, 'artifacts', appId, 'public', 'data', 'tables', tableNumber.toString());

// KDS (Kitchen Display System)
export const getKdsCollectionRef = () => getCollectionRef('kds_orders');

// CRM e Clientes
export const getCustomersCollectionRef = () => getCollectionRef('customers');

// Configurações do Sistema
export const getQuickObsCollectionRef = () => getCollectionRef('quick_obs');
export const getVouchersCollectionRef = () => getCollectionRef('vouchers');
export const getSectorsCollectionRef = () => getCollectionRef('sectors');

// ==================================================================
//               REFERÊNCIAS DE DOCUMENTOS ÚNICOS
// ==================================================================

export const getSystemStatusDocRef = () => doc(db, 'artifacts', appId, 'public', 'data', 'system_status', 'business_day');
export const getFinancialGoalsDocRef = () => doc(db, 'artifacts', appId, 'public', 'data', 'system_status', 'financial_goals');

// ==================================================================
//               FUNÇÕES AUXILIARES
// ==================================================================

export const saveSelectedItemsToFirebase = async (tableId, selectedItems) => {
    if (!tableId || !db) return;
    const tableRef = getTableDocRef(tableId);
    try {
        await updateDoc(tableRef, { selectedItems: selectedItems });
    } catch (e) {
        console.error(`[FirebaseService] Erro ao salvar itens da mesa ${tableId}:`, e);
    }
};