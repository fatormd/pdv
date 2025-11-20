// --- SERVICES/FIREBASESERVICE.JS ---
import { collection, doc, updateDoc, arrayUnion, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Variáveis globais exportadas
export let db = null;
export let auth = null;
export let appId = null;
export let functions = null;

// Exporta funções do Firestore para uso nos controllers
export { arrayUnion, serverTimestamp };

// Função de inicialização chamada pelo app.js
export const initializeFirebase = (database, authentication, appIdentifier, appFunctions) => {
    db = database;
    auth = authentication;
    appId = appIdentifier;
    functions = appFunctions;
};

// --- REFERÊNCIAS PARA COLEÇÕES (Paths) ---
export const getTablesCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'tables');
export const getTableDocRef = (tableNumber) => doc(db, 'artifacts', appId, 'public', 'data', 'tables', tableNumber.toString());

export const getKdsCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'kds_orders');
export const getCustomersCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'customers');
export const getQuickObsCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'quick_obs');
export const getVouchersCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'vouchers');

// ==== NOVO: Coleção de Setores (Adicionado para a gestão de setores) ====
export const getSectorsCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'sectors');


// --- FUNÇÕES AUXILIARES DE PERSISTÊNCIA ---
export const saveSelectedItemsToFirebase = async (tableId, selectedItems) => {
    if (!tableId || !db) return;

    const tableRef = getTableDocRef(tableId);

    try {
        await updateDoc(tableRef, {
            selectedItems: selectedItems
        });
        console.log(`Itens da mesa ${tableId} salvos com sucesso.`);
    } catch (e) {
        console.error(`Erro ao salvar itens da mesa ${tableId}:`, e);
    }
};