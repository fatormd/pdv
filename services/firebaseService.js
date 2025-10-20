// --- SERVICES/FIREBASESERVICE.JS ---
import { collection, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Variáveis globais (exportadas para que o app.js possa defini-las)
export let db = null;
export let auth = null;
export let appId = null;

export const initializeFirebase = (database, authentication, appIdentifier) => {
    db = database;
    auth = authentication;
    appId = appIdentifier;
};

// PATHS DE COLEÇÕES (Centralizados)
export const getTablesCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'tables');
export const getTableDocRef = (tableNumber) => doc(db, 'artifacts', appId, 'public', 'data', 'tables', tableNumber.toString());
export const getKdsCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'kds_orders');
export const getCustomersCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'customers'); 


// Funções básicas de persistência (serão usadas pelos Controllers)
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
