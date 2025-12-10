// --- SERVICES/FIREBASESERVICE.JS (CORRIGIDO) ---

import { 
    collection, 
    doc, 
    updateDoc, 
    arrayUnion, 
    serverTimestamp, 
    initializeFirestore, 
    persistentLocalCache,
    getFirestore,
    // Novos imports necessários para a busca
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// Variáveis globais exportadas
export let db = null;
export let auth = null;
export let appId = null;
export let functions = null;
export let storage = null;

// Exporta as ferramentas para os outros arquivos usarem
export { arrayUnion, serverTimestamp, ref, uploadBytes, getDownloadURL, getDocs, query, where, collection, doc, updateDoc };

// Função de inicialização
export const initializeFirebase = (app, authentication, appIdentifier, appFunctions) => {
    auth = authentication;
    appId = appIdentifier;
    functions = appFunctions;

    // 1. INICIALIZA O FIRESTORE
    try {
        // Tenta iniciar com Cache Persistente (Modo Offline)
        db = initializeFirestore(app, {
            localCache: persistentLocalCache()
        });
        console.log("[FirebaseService] Firestore inicializado com sucesso (Modo Offline Ativo).");
    } catch (e) {
        // SE FALHAR (ex: já foi iniciado antes), usa a instância padrão para não travar o app
        if (e.code === 'failed-precondition' || e.message.includes('already been started')) {
            console.warn("[FirebaseService] Firestore já estava ativo. Usando instância existente (sem persistência nova).");
            db = getFirestore(app);
        } else {
            console.error("[FirebaseService] Erro crítico desconhecido:", e);
            db = getFirestore(app); // Tenta recuperar de qualquer jeito
        }
    }

    // 2. INICIALIZAÇÃO DO STORAGE
    if (app) {
        try {
            storage = getStorage(app);
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

// --- NOVA FUNÇÃO CORRIGIDA (Exportada corretamente) ---
export const findActiveTableByUserId = async (userId) => {
    if (!userId || !db) return null;
    try {
        // Busca mesas onde o campo 'clientId' é o usuário atual e o status é 'open' ou 'merged'
        const q = query(
            getTablesCollectionRef(),
            where("clientId", "==", userId),
            where("status", "in", ["open", "merged"])
        );

        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            // Retorna os dados da primeira mesa encontrada
            const docData = querySnapshot.docs[0].data();
            return { 
                id: querySnapshot.docs[0].id, 
                ...docData 
            };
        }
        return null;
    } catch (error) {
        console.error("Erro ao buscar mesa ativa do usuário:", error);
        return null;
    }
};