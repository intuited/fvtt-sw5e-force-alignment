const MODULE_ID = 'sw5e-force-alignment';
const MODULE_ABBREV = 'SW5EFA';

Hooks.once('devModeReady', ({ registerPackageDebugFlag }) => {
    registerPackageDebugFlag(MODULE_ID);
});

const devModeActive = () => game.modules.get('_dev-mode')?.api?.getPackageDebugValue(MODULE_ID);

function log(...args) {
    try {
        // if(game.modules.get('_dev-mode')?.api?.getPackageDebugValue(MODULE_ID)) {
        if (devModeActive()) {
            console.log(MODULE_ID, '|', ...args);
        }
    } catch (e) {}
}
function logForce(...args) {
    console.log(MODULE_ID, '|', ...args);
}

// Map containing FAFlags objects for each actor
var actorFA = new Map();
// make the actor FA array globally accessible for debugging
Hooks.once('ready', async (app, html, data) => {
    if (devModeActive()) {
        game.sw5eFA = actorFA;
    }
});

/**
 * Event handler for clicks on the Force Alignment edit button.
 * `this` is bound to the actor character sheet
 * in addFATrait().
 */
function _onFATraitEdit(event) {
    event.preventDefault();
    log('_onFATraitEdit(event), this', event, this);
    return new ForceAlignmentDialog(this.object).render(true);
}

/**
 * Class for the dialog that presents force alignment data for the actor.
 * Code based on systems/sw5e/module/applications/trait-selector.mjs
 */
class ForceAlignmentDialog extends DocumentSheet {
    /** @inheritdoc */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "force-alignment",
            classes: ["sw5e", "force-alignment", "subconfig"],
            title: "Force Alignment",
            template: `modules/${MODULE_ID}/templates/force-alignment.hbs`,
            width: 320,
            height: "auto",
            allowCustom: true,
            minimum: 0,
            maximum: null,
            labelKey: null,
            valueKey: "value",
            customKey: "custom"
        });
    }

    /** @inheritdoc */
    get title() {
        return this.options.title || super.title;
    }

    /** @override */
    getData() {
        log('ForceAlignmentDialog.getData(), this', this);
        return {
            balance: this.object.getFlag(MODULE_ID, 'balance'),
            acknowledgedBalance: this.object.getFlag(MODULE_ID, 'acknowledged-balance'),
            benevolences: this.object.getFlag(MODULE_ID, 'benevolences'),
            corruptions: this.object.getFlag(MODULE_ID, 'corruptions')
        };
    }

}

/**
 * Encapsulates interactions with this module's actor flags.
 * All balance changes should be made via the incBalance and decBalance methods.
 * TODO: Add methods to remove transactions
 */
class FAFlags {
    /**
     * Initializes with default values unless an object is passed.
     */
    constructor(actor) {
        this.actor = actor;
        this._initializeFlags();
    }

    /**
     * Initializes actor flags fields if they do not already exist.
     */
    _initializeFlags() {
        let fields = {
            balance: 0,
            acknowledgedBalance: 0,
            benevolences: [],
            corruptions: [],
            transactions: []
        }
        Object.entries(fields).forEach(([field, def]) => {
            if (this.actor.getFlag(MODULE_ID, field) === undefined) {
                this.actor.setFlag(MODULE_ID, field, def);
            }
        });
        this.checkBalance();
    }

    get balance() {
        return this.actor.getFlag(MODULE_ID, 'balance');
    }
    get acknowledgedBalance() {
        return this.actor.getFlag(MODULE_ID, 'acknowledgedBalance');
    }
    get benevolences() {
        return this.actor.getFlag(MODULE_ID, 'benevolences');
    }
    get corruptions() {
        return this.actor.getFlag(MODULE_ID, 'corruptions');
    }

    incBalance(reason = "increment", amount = 1) {
        // TODO: is there a way to guard these methods with a semaphore or something?
        let newBalance = this.balance + amount;
        this.logTransaction(amount, reason);
        this.actor.setFlag(MODULE_ID, 'balance', newBalance);
    }
    decBalance(reason = "decrement", amount = 1) {
        let newBalance = this.balance - amount;
        this.logTransaction(-amount, reason);
        this.actor.setFlag(MODULE_ID, 'balance', newBalance);
    }

    /**
     * The acknowledgeBalance flag is changed when the user acknowledges messages
     * that their force alignment has passed a threshold, normally after adding
     * or removing a benevolence or corruption.
     */
    acknowledgeBalance() {
        this.actor.setFlag(MODULE_ID, 'acknowledgedBalance', this.balance);
    }

    /**
     * Logs a transaction, timestamping it with current GMT in milliseconds since epoch.
     * delta  [Number]: the amount the balance has changed by.
     * reason [String]: the reason for the change.
     */
    logTransaction(delta, reason) {
        let timestamp = new Date().getTime();
        let transactions = this.actor.getFlag(MODULE_ID, 'transactions');
        log('logTransaction(delta, reason): timestamp, transactions:', delta, reason, timestamp, transactions);
        transactions.push([timestamp, delta, reason]);
        this.actor.setFlag(MODULE_ID, 'transactions', transactions);
    }

    /**
     * Processes the transaction log and returns the calculated balance.
     * Also checks that transactions are in chronological order;
     * issues debug log message for discrepancies.
     */
    calcBalance(initialBalance = 0) {
        let transactions = this.actor.getFlag(MODULE_ID, 'transactions');
        let lastTimestamp = 0;
        let balance = initialBalance;
        for (const [timestamp, delta, reason] of transactions) {
            if (timestamp < lastTimestamp) {
                log(`timestamp in transaction [${timestamp}, ${delta}, ${reason}] predates previous timestamp.`);
            }
            balance += delta;
        }
        return balance;
    }

    /**
     * Processes the transaction log to verify that it is in accord with the balance.
     * Issues a ui notification if the balance does not check correctly.
     * Returns boolean indicating success or failure.
     * TODO: this is probably the part of the code that most needs some kind of synchronization guarantee.
     *       Could just be a static class variable.
     */
    checkBalance() {
        let calcedBalance = this.calcBalance();
        let ret = this.balance === calcedBalance;
        if (!ret) {
            ui.notifications.warn(`Force Alignment: balance discrepancy for actor ${this.actor.name}.` + 
                                  `  Stored balance ${this.balance} does not match calculated balance ${calcedBalance}.`
            );
        }
        return ret;
    }
}

function initFlags(actor) {
    log('initFlags(actor)', actor);
    if (!actorFA.has(actor)) {
        log('initFlags: creating entry for actor in actorFA');
        actorFA.set(actor, new FAFlags(actor));
    }
}

function traitExists(html) {
    return html.find('.resources .traits div .force-alignment').length > 0;
}

/**
 * Add another item to the list of traits in the sw5e character sheet.
 * Its title is Force Alignment and its edit button opens a dialog
 * for displaying and editing force alignment data.
 */
async function addFATrait(app, html, data) {
    let lastTrait = html.find('.resources .traits div').last();
    let faTrait = await renderTemplate(`modules/${MODULE_ID}/templates/fa-trait.hbs`, data.actor);
    log('addFATrait(app, html, data)', app, html, data);
    log('lastTrait, fatrait', lastTrait, faTrait);

    // add an event listener for the click as is done in sw5e/module/applications/actor/base-sheet.mjs
    lastTrait.after(faTrait);
    lastTrait.next().find(".trait-selector").click(_onFATraitEdit.bind(app));
}

Hooks.on("renderActorSheet5eCharacter", async (app, html, data) => {
    log('renderActorSheet5eCharacter hook: app, html, data', app, html, data);
    initFlags(app.object);
    if (!traitExists(html)) {
        await addFATrait(app, html, data);
    }
});
