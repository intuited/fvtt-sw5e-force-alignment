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
var actorFAFlagsMap = new Map();
/**
 * Fetches the actor's FAFlags object from the Map,
 * initializing one if it does not already exist.
 */
function actorFlags(actor) {
    if (!actorFAFlagsMap.has(actor)) {
        log('actorFlags: creating entry for actor in actorFAFlagsMap');
        actorFAFlagsMap.set(actor, new FAFlags(actor));
    }
    return actorFAFlagsMap.get(actor);
}
// make the actor FA array globally accessible for debugging
Hooks.once('ready', async (app, html, data) => {
    if (devModeActive()) {
        game.sw5eFA = actorFAFlagsMap;
    }
});

function partial(fn, ...completedArgs) {
    return function(...args) {
        return fn.apply(this, completedArgs.concat(args));
    }
}

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
            width: 640,
            height: "auto",
            allowCustom: true,
            minimum: 0,
            maximum: null,
            labelKey: null,
            valueKey: "value",
            customKey: "custom"
        });
    }

    onClickModifyButton(event) {
        new ModifyAlignmentDialog(this.object).render(true);
    }

    /** @inheritdoc */
    get title() {
        return this.options.title || super.title;
    }

    /** @override */
    getData() {
        log('ForceAlignmentDialog.getData(), this', this);
        return actorFlags(this.object);
    }

    activateListeners(html) {
        log('ForceAlignmentDialog.activateListeners(html): this, html:', this, html);
        super.activateListeners(html);
        html.find("#sw5efa-gmbutton").click(this.onClickModifyButton.bind(this));
    }
}

class ModifyAlignmentDialog extends DocumentSheet {
    /** @inheritdoc */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "modify-alignment",
            classes: ["sw5e", "modify-alignment", "subconfig"],
            title: "Modify Force Alignment",
            template: `modules/${MODULE_ID}/templates/modify-force-alignment.hbs`,
            width: 600,
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
        log('ModifyAlignmentDialog.getData(), this', this);
        return actorFlags(this.object);
    }

    onClickButton(side, event) {
        log('onClickButton: this, side, event:', this, side, event)
        let delta = this.element.find('#sw5efa-delta')[0].value;
        let reason = this.element.find('#sw5efa-reason')[0].value;
        log('  delta, reason:', delta, reason);
        let af = actorFlags(this.object);
        let callMap = {
            light: af.incBalance.bind(af),
            dark:  af.decBalance.bind(af)
        };
        callMap[side](reason, delta);
    }

    onClickRollback(event) {
        let timestamp = event.target.id.substring(7);
        log('onClickRollback: this, event, timestamp', this, event, timestamp);
        actorFlags(this.object).rollBackTransaction(timestamp);
    }

    activateListeners(html) {
        log('ModifyAlignmentDialog.activateListeners(html): this, html:', this, html);
        super.activateListeners(html);
        html.find("#sw5efa-light").click(partial(this.onClickButton, 'light').bind(this));
        html.find("#sw5efa-dark" ).click(partial(this.onClickButton, 'dark' ).bind(this));
        let rollbackLinks = html.find("#sw5efa-transaction-log .sw5efa-rollback-link");
        log('    rollbackLinks', rollbackLinks);
        //this doesn't work for some inexplicable reason so I'm just using the root jQuery instead
        //  html.find("#sw5efa-transaction-log .sw5efa-rollback-link").click(this.onClickRollback.bind(this));
        $("#sw5efa-transaction-log .sw5efa-rollback-link").click(this.onClickRollback.bind(this));
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
            previouslyCast: [],
            benevolences: [],
            corruptions: [],
            transactions: [],
        };
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
    /**
     * Returns a copy of the previouslyCast array flag for this actor.
     */
    get previouslyCast() {
        return Array.from(this.actor.getFlag(MODULE_ID, 'previouslyCast'));
    }
    get benevolences() {
        return Array.from(this.actor.getFlag(MODULE_ID, 'benevolences'));
    }
    get corruptions() {
        return Array.from(this.actor.getFlag(MODULE_ID, 'corruptions'));
    }
    /**
     * Returns a shallow copy of this actor's transactions.
     */
    get transactions() {
        return Array.from(this.actor.getFlag(MODULE_ID, 'transactions'));
    }

    incBalance(reason = "increment", amount = 1) {
        // TODO: is there a way to guard these methods with a semaphore or something?
        let newBalance = Number(this.balance) + Number(amount);
        this.logTransaction(amount, reason);
        this.actor.setFlag(MODULE_ID, 'balance', newBalance);
    }
    decBalance(reason = "decrement", amount = 1) {
        let newBalance = Number(this.balance) - Number(amount);
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
     * Undo changes made by a transaction and remove it from the log.
     * If the transaction being rolled back was the first time a power was cast,
     * that power is removed from the list of previously cast powers.
     */
    rollBackTransaction(timestamp) {
        log('rollBackTransaction: this, timestamp', this, timestamp);
        let transactions = this.transactions
        let transaction = transactions.find(t => String(t[0]) === timestamp);
        if (transaction === undefined) {
            ui.notifications.warn(`Force Alignment: timestamp ${timestamp} not found in transaction log.`);
            return false;
        }
        let [_, delta, reason] = transaction;
        log('    timestamp, delta, reason', timestamp, delta, reason);

        // If the transaction being rolled back was the first time a power was cast,
        // we need to remove it from the list of cast powers.
        let match = reason.match(/Cast (.*) for the first time/);
        log('    match', match);
        if (match) {
            let powerName = match[1];
            let pc = this.previouslyCast;
            let powerIndex = pc.indexOf(powerName);
            if (powerIndex === -1) {
                ui.notifications.warn(`Force Alignment: Logged power "${powerName}" not found ` + 
                                      `in previouslyCast flag for actor ${actor.name}.`
                );
            } else {
                pc.splice(powerIndex, 1);
                this.actor.setFlag(MODULE_ID, 'previouslyCast', pc);
            }
        }

        /*
         * TODO: Technically we should be retaining rolled back transactions
         * and just adding another transaction to log the rollback,
         * but this requires a bit more infrastructure to prevent transactions
         * from being rolled back multiple times
         * and will be more confusing, so we're just removing them for now.
        /**
        this.logTransaction(-delta, `Rollback of transaction with timestamp ${timestamp}`);
        /*/
        let spliced = transactions.findSplice(t => String(t[0]) === timestamp);
        log('    spliced:', spliced);
        this.actor.setFlag(MODULE_ID, 'transactions', transactions);
        this.actor.setFlag(MODULE_ID, 'balance', this.balance - delta);
        /**/

        return true;
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
            balance += Number(delta);
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

    onCastPower(power) {
        log('onCastPower(power): this, power', this, power);
        let opMap = {
            lgt: this.incBalance.bind(this),
            drk: this.decBalance.bind(this),
        };
        if (power.system.level > 0
            && ['drk', 'lgt'].includes(power.system.school)
        ) {
            if (this.previouslyCast.includes(power.name)) {
                opMap[power.system.school](`Cast ${power.name} again`);
            } else {
                opMap[power.system.school](
                    `Cast ${power.name} for the first time`,
                    power.system.level
                );
                this.actor.setFlag(
                    MODULE_ID,
                    'previouslyCast',
                    [...this.previouslyCast, power.name]
                );
            }
        }
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
    if (!traitExists(html)) {
        await addFATrait(app, html, data);
    }
});
Hooks.on("sw5e.useItem", async (item, html, data) => {
    log('useItem hook: item, html, data', item, html, data);
    if (item.type === 'power' && item.parent?.type === 'character') {
        actorFlags(item.parent).onCastPower(item);
    }
});

/**
 * Checks if the current user has the Game Master role.
 */
function userIsGM() {
    return game.users.get(game.userId).hasRole(foundry.CONST.USER_ROLES['GAMEMASTER']);
}
/**
 * Conditional block helper: only display block if user has the GM role.
 * TODO: make it configurable to allow non-GMs to see this stuff.
 */
Handlebars.registerHelper("ifGM", function(options) {
    if (userIsGM()) {
        return options.fn(this);
    }
});

/**
 * Handlebars helper to iterate over transactions,
 * mapping array elements to object fields.
 */
Handlebars.registerHelper("eachTransaction", function(options) {
    log('eachTransaction helper. this, options:', this, options);
    return this.transactions.reverse().map(transaction => {
        let [timestamp, delta, reason] = transaction;
        return options.fn({
            rawTimestamp: timestamp,
            timestamp: new Date(timestamp).toISOString(),
            delta: delta,
            reason: reason
        });
    }).join("\n");
});
