// casino-utils.js
const BANKROLL_KEY = 'casino_bankroll';

// Guthaben abrufen
function getCash() {
    const val = localStorage.getItem(BANKROLL_KEY);
    return val ? parseInt(val) : 1000; // Standard: 1000 €
}

// Guthaben setzen & UI aktualisieren
function setCash(amount) {
    localStorage.setItem(BANKROLL_KEY, amount.toString());
    syncUI();
}

// UI synchronisieren (sucht nach Elementen mit Klasse 'shared-bankroll')
function syncUI() {
    const cash = getCash();
    document.querySelectorAll('.shared-bankroll').forEach(el => {
        el.textContent = cash + ' €';
    });
}

// Aktualisiert das UI automatisch, wenn sich der Wert in einem anderen Tab ändert
window.addEventListener('storage', (e) => {
    if (e.key === BANKROLL_KEY) syncUI();
});

// Initialer Sync beim Laden der Seite
document.addEventListener('DOMContentLoaded', syncUI);

// Reset-Funktion
function resetBankroll() {
    if(confirm('Möchtest du dein Guthaben wirklich auf 1000 € zurücksetzen?')) {
        setCash(1000);
    }
}
