// --- SERVICES/FIREBASESERVICE.JS ---
// Importa funções do Firebase Firestore e as exporta para uso nos Controllers
import { collection, doc, updateDoc, arrayUnion, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Variáveis globais (exportadas para que o app.js possa definilas)
export let db = null;
export let auth = null;
export let appId = null;
export let functions = null; // NOVO: Exporta o serviço do Functions

// Exporta funções críticas do Firestore para uso no orderController.js (KDS)
export { arrayUnion, serverTimestamp };

// ATUALIZADO: Recebe 'appFunctions'
export const initializeFirebase = (database, authentication, appIdentifier, appFunctions) => {
    db = database;
    auth = authentication;
    appId = appIdentifier;
    functions = appFunctions; // NOVO: Armazena a instância do Functions
};

// PATHS DE COLEÇÕES (Centralizados)
export const getTablesCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'tables');
export const getTableDocRef = (tableNumber) => doc(db, 'artifacts', appId, 'public', 'data', 'tables', tableNumber.toString());
export const getKdsCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'kds_orders');
export const getCustomersCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'customers');
// ==== NOVO ====
export const getQuickObsCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'quick_obs');
// ==== ADICIONADO: Coleção de Regras de Vouchers ====
export const getVouchersCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'vouchers');


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