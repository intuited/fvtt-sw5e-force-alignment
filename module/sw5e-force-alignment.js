const MODULE_ID = 'sw5e-force-alignment';
const MODULE_ABBREV = 'SW5EFA';

Hooks.once('devModeReady', ({ registerPackageDebugFlag }) => {
    registerPackageDebugFlag(MODULE_ID);
});

function log(...args) {
    try {
        if(game.modules.get('_dev-mode')?.api?.getPackageDebugValue(MODULE_ID)) {
            console.log(MODULE_ID, '|', ...args);
        }
    } catch (e) {}
}
function logForce(...args) {
    console.log(MODULE_ID, '|', ...args);
}

function traitExists(html) {
    // TODO: expand this stub
    return false;
}

/**
 * Event handler for clicks on the Force Alignment edit button.
 * `this` is bound to the actor character sheet
 * in addFATrait().
 */
function _onFATraitEdit(event) {
    event.preventDefault();
    log('_onFATraitEdit(event), this', event, this);
    return new ForceAlignment(this.object).render(true);
}

/**
 * Class for the dialog that presents force alignment data for the actor.
 * Code based on systems/sw5e/module/applications/trait-selector.mjs
 */
class ForceAlignment extends DocumentSheet {
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
        return {};
    }

}

/**
    const a = event.currentTarget;
    const label = a.parentElement.querySelector("label");
    const choices = CONFIG.SW5E[a.dataset.options];
    const options = {name: a.dataset.target, title: `${label.innerText}: ${this.actor.name}`, choices};
    if ( ["di", "dr", "dv"].some(t => a.dataset.target.endsWith(`.${t}`)) ) {
        options.bypasses = CONFIG.SW5E.physicalWeaponProperties;
        return new DamageTraitSelector(this.actor, options).render(true);
    } else {
        return new TraitSelector(this.actor, options).render(true);
    }
}
/**/

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
    log('renderActorSheet5eCharacter hook', app, html, data);
    if (!traitExists(html)) {
        await addFATrait(app, html, data);

    }
});
