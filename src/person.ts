import RandomFast from "./random-fast";
// import MersenneTwister from "mersenne-twister";
// https://github.com/boo1ean/mersenne-twister
// var MersenneTwister = require("mersenne-twister");

import { Sim } from "./sim";
import { Spatial, Grid, Place } from "./spatial";
import { GraphType } from "./county-stats";
import * as Params from "./params";
import * as util from "./util";

// ---------------- Place info ----------------
// This is the number of actually fully implemented places.
export let numPlaceTypes = 3;
// hospital, school, supermarket, retirement community, prison, train, etc.
export enum PlaceType {
    home = 0,
    office,
    supermarket,
    hospital,
    car,
    train,
}

export let PlaceTypeToChar: string[] = ["h", "w", "s", "o", "c", "t"];

let ActivityMap2 = new Map<string, number>([
    ["h", PlaceType.home],
    ["w", PlaceType.office],
    ["s", PlaceType.supermarket],
    ["o", PlaceType.hospital],
    ["c", PlaceType.car],
    ["t", PlaceType.train],
]);
// --------------------------------------------

export enum SymptomsLevels {
    // 0 none, 1 is mild to moderate (80%), 2 is severe (14%), 3 is critical (6%)
    none = 0,
    mild = 1,
    severe = 2,
    critical = 3,
}

// This should be part of the Person class, but I separated it for cache reasons. I wish there was a cleaner way to do this. :/
// It could be even better for the cache if the placeIndex array was packed in instead of a pointer. But that seems hard.
// currentRoutine could be a 16 bit index instead of a 64 bit pointer if that would help anything.
export class PersonTight {
    // This is the hourly activity / place array of where the person goes during the day
    currentRoutine: Uint8Array;
    // placeIndex: Int32Array = new Int32Array(numPlaceTypes);  // This is way slower. why? Maybe array out of bounds?
    // This is like homeIndex, officeIndex, etc...
    placeIndex: number[] = [];

    constructor() {
        this.currentRoutine = Person.activitiesNormalByte[0];
    }

    getCurrentActivityChar(currentHour: number): string {
        let reverse = PlaceTypeToChar[this.currentRoutine[currentHour]];
        return reverse!;
    }
    getCurrentActivityInt(currentHour: number): number {
        return this.currentRoutine[currentHour];
    }
}

export class Person {
    tight:PersonTight;
    // flags -> I was running out of memory on SF Bay Area, so I'm packing the Person data real tight.
    // JS is super inefficient for memory. This also makes performance better because we are memory-cache-bound.
    _flags = 0;
    private setFlagInt(x: number, pos:number, mask:number) { this._flags = (this._flags & (~(mask << pos))) | (x << pos); }  // prettier-ignore
    private getFlagInt(pos:number, mask:number) : number { return (this._flags >>> pos) & mask; }  // prettier-ignore
    get _infected() : boolean { return (this._flags & 1) != 0; }  // prettier-ignore
    set _infected(x: boolean) { this._flags = (this._flags & (~1)) | (x?1:0); }  // prettier-ignore
    get _contagious() : boolean { return (this._flags & 2) != 0; }  // prettier-ignore
    set _contagious(x: boolean) { this._flags = (this._flags & (~2)) | (x?2:0); }  // prettier-ignore
    get _dead() : boolean { return (this._flags & 4) != 0; }  // prettier-ignore
    set _dead(x: boolean) { this._flags = (this._flags & (~4)) | (x?4:0); }  // prettier-ignore
    get _recovered() : boolean { return (this._flags & 8) != 0; }  // prettier-ignore
    set _recovered(x: boolean) { this._flags = (this._flags & (~8)) | (x?8:0); }  // prettier-ignore
    get _criticalIfSevere() : boolean { return (this._flags & 16) != 0; }  // prettier-ignore
    set _criticalIfSevere(x: boolean) { this._flags = (this._flags & (~16)) | (x?16:0); }  // prettier-ignore
    get _isolating() : boolean { return (this._flags & 32) != 0; }  // prettier-ignore
    set _isolating(x: boolean) { this._flags = (this._flags & (~32)) | (x?32:0); }  // prettier-ignore
    get _symptomaticOverall() : boolean { return (this._flags & 64) != 0; }  // prettier-ignore
    set _symptomaticOverall(x: boolean) { this._flags = (this._flags & (~64)) | (x?64:0); }  // prettier-ignore
    // 2 bit int
    get _symptomsCurrent() : SymptomsLevels { return this.getFlagInt(8, 3); }  // prettier-ignore
    set _symptomsCurrent(x: SymptomsLevels) { this.setFlagInt(x, 8, 3); }  // prettier-ignore
    // _infected = false;
    // _contagious = false;
    // _dead = false;
    // _recovered = false;
    // _criticalIfSevere = false;
    // _isolating = false;
    // _symptomaticOverall = true;
    // _symptomsCurrent = SymptomsLevels.none; // 0 undefined, 1 is mild to moderate (80%), 2 is severe (14%), 3 is critical (6%)

    _contagiousTrigger = util.MAX_TIME_STEPS;
    _endContagiousTrigger = util.MAX_TIME_STEPS;
    _symptomsTrigger = util.MAX_TIME_STEPS;
    _endSymptomsTrigger = util.MAX_TIME_STEPS;
    _deadTrigger = util.MAX_TIME_STEPS;
    _severeTrigger = util.MAX_TIME_STEPS;
    _isolationTrigger = util.MAX_TIME_STEPS; // That moment they decide they are sick af and they need to isolate better (Any data for this???)

    get infected(): boolean { if (!Person.useWasmSim) return this._infected; return <boolean>this.wasmPerson.infected; } // prettier-ignore
    set infected(x: boolean) { if (!Person.useWasmSim) { this._infected = x; return; } this.wasmPerson.infected = x; } // prettier-ignore

    get contagious(): boolean { if (!Person.useWasmSim) return this._contagious; return <boolean>this.wasmPerson.contagious; } // prettier-ignore
    set contagious(x: boolean) { if (!Person.useWasmSim) { this._contagious = x; return; } this.wasmPerson.contagious = x; } // prettier-ignore

    get dead(): boolean { if (!Person.useWasmSim) return this._dead; return <boolean>this.wasmPerson.dead; } // prettier-ignore
    set dead(x: boolean) { if (!Person.useWasmSim) { this._dead = x; return; } this.wasmPerson.dead = x; } // prettier-ignore

    get symptomaticOverall(): boolean { if (!Person.useWasmSim) return this._symptomaticOverall; return <boolean>this.wasmPerson.symptomaticOverall; } // prettier-ignore
    set symptomaticOverall(x: boolean) { if (!Person.useWasmSim) { this._symptomaticOverall = x; return; } this.wasmPerson.symptomaticOverall = x; } // prettier-ignore

    get recovered(): boolean { if (!Person.useWasmSim) return this._recovered; return <boolean>this.wasmPerson.recovered; } // prettier-ignore
    set recovered(x: boolean) { if (!Person.useWasmSim) { this._recovered = x; return; } this.wasmPerson.recovered = x; } // prettier-ignore

    get criticalIfSevere(): boolean { if (!Person.useWasmSim) return this._criticalIfSevere; return <boolean>this.wasmPerson.criticalIfSevere; } // prettier-ignore
    set criticalIfSevere(x: boolean) { if (!Person.useWasmSim) { this._criticalIfSevere = x; return; } this.wasmPerson.criticalIfSevere = x; } // prettier-ignore

    get isolating(): boolean { if (!Person.useWasmSim) return this._isolating; return <boolean>this.wasmPerson.isolating; } // prettier-ignore
    set isolating(x: boolean) { if (!Person.useWasmSim) { this._isolating = x; return; } this.wasmPerson.isolating = x; } // prettier-ignore

    get symptomsCurrent(): number { if (!Person.useWasmSim) return this._symptomsCurrent; return <number>this.wasmPerson.symptomsCurrent; } // prettier-ignore
    set symptomsCurrent(x: number) { if (!Person.useWasmSim) { this._symptomsCurrent = x; return; } this.wasmPerson.symptomsCurrent = x; } // prettier-ignore

    get contagiousTrigger(): number { if (!Person.useWasmSim) return this._contagiousTrigger; return <number>this.wasmPerson.contagiousTrigger; } // prettier-ignore
    set contagiousTrigger(x: number) { if (!Person.useWasmSim) { this._contagiousTrigger = x; return; } this.wasmPerson.contagiousTrigger = x; } // prettier-ignore

    get endContagiousTrigger(): number { if (!Person.useWasmSim) return this._endContagiousTrigger; return <number>this.wasmPerson.endContagiousTrigger; } // prettier-ignore
    set endContagiousTrigger(x: number) { if (!Person.useWasmSim) { this._endContagiousTrigger = x; return; } this.wasmPerson.endContagiousTrigger = x; } // prettier-ignore

    get symptomsTrigger(): number { if (!Person.useWasmSim) return this._symptomsTrigger; return <number>this.wasmPerson.symptomsTrigger; } // prettier-ignore
    set symptomsTrigger(x: number) { if (!Person.useWasmSim) { this._symptomsTrigger = x; return; } this.wasmPerson.symptomsTrigger = x; } // prettier-ignore

    get endSymptomsTrigger(): number { if (!Person.useWasmSim) return this._endSymptomsTrigger; return <number>this.wasmPerson.endSymptomsTrigger; } // prettier-ignore
    set endSymptomsTrigger(x: number) { if (!Person.useWasmSim) { this._endSymptomsTrigger = x; return; } this.wasmPerson.endSymptomsTrigger = x; } // prettier-ignore

    get deadTrigger(): number { if (!Person.useWasmSim) return this._deadTrigger; return <number>this.wasmPerson.deadTrigger; } // prettier-ignore
    set deadTrigger(x: number) { if (!Person.useWasmSim) { this._deadTrigger = x; return; } this.wasmPerson.deadTrigger = x; } // prettier-ignore

    get severeTrigger(): number { if (!Person.useWasmSim) return this._severeTrigger; return <number>this.wasmPerson.severeTrigger; } // prettier-ignore
    set severeTrigger(x: number) { if (!Person.useWasmSim) { this._severeTrigger = x; return; } this.wasmPerson.severeTrigger = x; } // prettier-ignore

    get isolationTrigger(): number { if (!Person.useWasmSim) return this._isolationTrigger; return <number>this.wasmPerson.isolationTrigger; } // prettier-ignore
    set isolationTrigger(x: number) { if (!Person.useWasmSim) { this._isolationTrigger = x; return; } this.wasmPerson.isolationTrigger = x; } // prettier-ignore

    // lots of sets of 24-hour periods of different behaviors that represent different people's lifestyles
    // TODO: use real world data to set this
    static readonly activitiesNormal = [
        "hhhhhhhhcwwwswwwwwchhhhh", // needs to be 24-long
        "hhhhhhhhcshhshhhhhshhhhh",
        "hhhhhhhccsschhhhhshhhhhh",
        // shifted duplicates - hacky way of getting variety. placeholder.
        "hhhhhhhcwwwswwwwwchhhhhh", // << 1
        "hhhhhhhcshhshhhhhshhhhhh",
        "hhhhhhccsschhhhhshhhhhhh",
        "hhhhhhcwwwswwwwwchhhhhhh", // << 2
        "hhhhhhcshhshhhhhshhhhhhh",
        "hhhhhccsschhhhhshhhhhhhh",
        "hhhhhhhhhcwwwswwwwwchhhh", // >> 1
        "hhhhhhhhhcshhshhhhhshhhh",
        "hhhhhhhhccsschhhhhshhhhh",
        "hhhhhhhhhhcwwwswwwwwchhh", // >> 2
        "hhhhhhhhhhcshhshhhhhshhh",
        "hhhhhhhhhccsschhhhhshhhh",
    ];
    static readonly activitiesWhileSick = [
        "hhhhhhhhhhhhcshhhhhhhhhh",
        // "oooooooooooooooooooooooo",  // Hospitalized
    ];

    static activitiesNormalByte: Array<Uint8Array> = [];
    static activitiesWhileSickByte: Array<Uint8Array> = [];

    id: number = -1;
    time_since_infected: number = -1;
    xpos: number = 0; // Just for visuals. Barely needed.
    ypos: number = 0;
    infectedX: number = -1;  // Where the person got infected
    infectedY: number = -1;
    // Demogaphic info
    // age = -1;
    // maleFemale = -1;
    // county = -1;
    get age() : number { return this.getFlagInt(10, 0x7f); }  // prettier-ignore
    set age(x: number) { this.setFlagInt(x, 10, 0x7f); }  // prettier-ignore
    get maleFemale() : number { return this.getFlagInt(17, 0x1); }  // prettier-ignore
    set maleFemale(x: number) { this.setFlagInt(x, 17, 0x1); }  // prettier-ignore
    get county() : number { return this.getFlagInt(18, 0xff); }  // prettier-ignore
    set county(x: number) { this.setFlagInt(x, 18, 0xff); }  // prettier-ignore

    static useWasmSim = false;
    wasmPerson: any = null;

    associateWasmSimAndInit(wasmSim: any, params: Params.Base, rand: RandomFast) {
        // getter/setters will sync all vars during init()
        this.wasmPerson = wasmSim.getPerson(this.id);
        Person.useWasmSim = true;
        this.init(params, rand);
    }

    constructor(params: Params.Base, rand: RandomFast, id: number, tight:PersonTight) {
        this.id = id;
        this.tight = tight;
        // Initialize static tables
        if (Person.activitiesNormalByte.length == 0) {
            // Convert activities from human-readable chars to bytes for fast indexing later.
            for (let i = 0; i < Person.activitiesNormal.length; i++) {
                let act = Person.activitiesNormal[i];
                Person.activitiesNormalByte[i] = new Uint8Array(act.length);
                for (let j = 0; j < act.length; j++) Person.activitiesNormalByte[i][j] = ActivityMap2.get(act[j])!;
            }
            for (let i = 0; i < Person.activitiesWhileSick.length; i++) {
                let act = Person.activitiesWhileSick[i];
                Person.activitiesWhileSickByte[i] = new Uint8Array(act.length);
                for (let j = 0; j < act.length; j++) Person.activitiesWhileSickByte[i][j] = ActivityMap2.get(act[j])!;
            }
        }
        this.symptomaticOverall = true;
    }

    init(params: Params.Base, rand: RandomFast) {
        // Initialization needs to happen after we create the WASM sim, that needs to happen after we know how many persons there are, so initialization has been moved out of constuctor

        // Find person's main activity (what they do during the day)
        this.tight.currentRoutine = this.getPersonDefaultRoutine();

        let fTemp = 0.0;
        // ---- Generate trigger times when sickness events will happen ----
        [fTemp] = util.RandGaussian(
            rand,
            params.mean_time_till_contagious.hours,
            params.contagious_range.hours * 0.5
        );
        // Clamp to range, convert to int.
        this.contagiousTrigger = Math.round(util.clamp(
            fTemp,
            params.mean_time_till_contagious.hours - params.contagious_range.hours * 0.5,
            params.mean_time_till_contagious.hours + params.contagious_range.hours * 0.5
        ));

        [fTemp] = util.RandGaussian(rand, params.median_time_virus_is_communicable.hours, util.fromHours(30));
        this.endContagiousTrigger = Math.round(fTemp + this.contagiousTrigger);

        // Skewed distribution
        [fTemp] = util.RandGaussian(rand, 0.0, 0.5); // Include 2 standard deviations before clamping.
        fTemp = util.clamp(fTemp, -1.0, 1.0) * 0.5 + 0.5; //  Now show be [0..1] range
        fTemp = Math.pow(fTemp, 4.5); // skew the distribution, still [0..1] range.
        // Apply new mean and std sorta...
        this.symptomsTrigger =
        Math.round(fTemp * util.fromDays(7.25) + params.mean_time_till_symptoms.hours - util.fromDays(1.0));
        this.symptomsTrigger = Math.min(this.symptomsTrigger, this.endContagiousTrigger - util.fromDays(1.0));

        // See if this person is overall asymptomatic and if so, backtrack the symptom onset.
        this.symptomaticOverall = util.Bernoulli(rand, 1.0 - params.prob_fully_asymptomatic);
        if (!this.symptomaticOverall) this.symptomsTrigger = util.MAX_TIME_STEPS; // Never trigger symptoms for asymptomatic people

        // TODO: When do symptoms end? I couldn't find numbers for this so I made something up.
        if (this.symptomaticOverall)
            this.endSymptomsTrigger = util.randint(rand, this.symptomsTrigger + util.fromHours(1), this.endContagiousTrigger);

        // Death
        // Adjust fatality rate by asymptomatic people
        let shouldDie: boolean = util.Bernoulli(rand, params.infection_fatality_rate * (1.0 + params.prob_fully_asymptomatic));

        shouldDie = shouldDie && this.symptomaticOverall; // TODO: check - Maybe people won't die if they don't have syptoms??? How to apply this along with IFR?
        if (shouldDie) {
            [fTemp] = util.RandGaussian(rand, 0.0, 0.93);
            fTemp = util.clamp(fTemp, -1.0, 1.0) * 0.5 + 0.5; //  Now show be [0..1] range
            let span: number =
                params.range_time_till_death_relative_to_syptoms[1].hours -
                params.range_time_till_death_relative_to_syptoms[0].hours;

            util.assert(this.symptomsTrigger >= 0, "just double checking");
            util.assert(this.symptomsTrigger < util.MAX_TIME_STEPS, "just double checking");
            // TODO: This span doesn't match the other data. Get things consistent. :/
            this.deadTrigger = Math.round(this.symptomsTrigger + fTemp * span); // This will often get clamped down by the next line.
            this.deadTrigger = Math.min(this.deadTrigger, this.endContagiousTrigger - 1); // Make sure if you are meant to die, you do it before getting better.
        }

        // Severe disease
        if (this.symptomaticOverall && util.Bernoulli(rand, params.prob_severe_or_critical)) {
            this.severeTrigger = Math.round((this.symptomsTrigger + this.endSymptomsTrigger) * 0.5); // TODO: Fix me. Didn't find numbers that fit with other numbers.
            this.severeTrigger = util.clamp(this.severeTrigger, this.symptomsTrigger, this.endSymptomsTrigger);
            this.criticalIfSevere = util.Bernoulli(rand, params.prob_critical_given_severe_or_critical);
        }

        if (this.symptomaticOverall) {
            let [temp] = util.RandGaussian(rand, this.symptomsTrigger + util.fromDays(2), util.fromDays(1));
            this.isolationTrigger = Math.round(util.clamp(temp, this.symptomsTrigger, this.endSymptomsTrigger));
        }
    }

    getPersonDefaultRoutineIndex(): number {
        return RandomFast.HashIntApprox(this.id, 0, Person.activitiesNormalByte.length);
    }

    getPersonDefaultRoutine(): Uint8Array {
        return Person.activitiesNormalByte[this.getPersonDefaultRoutineIndex()];
    }

    getCurrentLocation(sim: Sim, timeOffset=0): [number, number] {
        let currentStep = sim.time_steps_since_start.getStepModDayOffset(timeOffset);
        let activity = this.tight.getCurrentActivityInt(currentStep);
        if (activity < numPlaceTypes) {
            let place = sim.allPlaces[activity][this.tight.placeIndex[activity]];
            return [place.xpos, place.ypos];
        } else {
            let house = sim.allPlaces[PlaceType.home][this.tight.placeIndex[PlaceType.home]];
            return [house.xpos, house.ypos];
        }
    }

    get hashId() {
        return RandomFast.HashInt32(this.id);
    }
    // Susceptible
    get isVulnerable() {
        return !this.infected && !this.recovered && !this.dead;
    }
    // Exposed
    get isSick() {
        return this.infected && !this.recovered && !this.dead;
    }
    get isContagious() {
        return this.contagious && !this.recovered && !this.dead;
    }
    get isShowingSymptoms() {
        return this.symptomsCurrent != SymptomsLevels.none && this.symptomaticOverall && !this.recovered && !this.dead;
    }
    get isRecovered() {
        return this.recovered && !this.dead;
    }

    // Get exposed... won't be contagious for a while still though...
    becomeSick(sim: Sim | null) {
        this.time_since_infected = 0.0;
        this.infected = true;
        if (sim) {
            let [x, y] = this.getCurrentLocation(sim);
            let info: [number, number, Params.TimeStep] = [x, y, sim.time_steps_since_start.clone()];
            sim.infectedVisuals.push(info);
            if (this.county >= 0) {
                sim.countyStats.counters[this.county][GraphType.totalInfected]++;
                sim.countyStats.counters[this.county][GraphType.currentInfected]++;
            }
        }
    }

    becomeContagious() {
        util.assert(this.infected, "ERROR: contagious without being infected." + this.id);
        util.assert(!this.symptomsCurrent, "ERROR: contagious after having symptoms - maybe not worst thing?" + this.id);
        util.assert(!this.dead, "ERROR: already dead!" + this.id);
        util.assert(!this.recovered, "ERROR: already recovered!" + this.id);
        this.contagious = true;
    }

    becomeSymptomy() {
        util.assert(this.infected, "ERROR: symptoms without being infected." + this.id);
        util.assert(this.contagious, "ERROR: symptoms before having contagious - maybe not worst thing?" + this.id);
        util.assert(!this.dead, "ERROR: already dead!" + this.id);
        util.assert(!this.recovered, "ERROR: already recovered!" + this.id);
        this.symptomsCurrent = 1;
    }

    endSymptoms() {
        util.assert(this.infected, "ERROR: end symptoms without being infected." + this.id);
        util.assert(!this.dead, "ERROR: already dead!" + this.id);
        util.assert(!this.recovered, "ERROR: already recovered!" + this.id);
        this.symptomsCurrent = 0;
    }

    endContagious() {
        util.assert(this.infected, "ERROR: recovered without being infected." + this.id);
        util.assert(!this.dead, "ERROR: already dead!" + this.id);
        util.assert(!this.recovered, "ERROR: already recovered!" + this.id);
        this.contagious = false;
    }

    becomeRecovered(sim: Sim | null) {
        util.assert(this.infected, "ERROR: recovered without being infected." + this.id);
        util.assert(!this.dead, "ERROR: already dead!" + this.id);
        util.assert(!this.recovered, "ERROR: already recovered!" + this.id);
        this.recovered = true;
        this.infected = false;
        this.symptomsCurrent = 0;
        this.contagious = false;
        this.isolating = false;
        this.tight.currentRoutine = this.getPersonDefaultRoutine();
        if (sim && this.county >= 0) sim.countyStats.counters[this.county][GraphType.currentInfected]--;
    }

    becomeSevereOrCritical() {
        util.assert(this.infected, "ERROR: severe without being infected." + this.id);
        util.assert(this.symptomsCurrent > 0, "ERROR: must have symptoms to be severe." + this.id);
        util.assert(!this.dead, "ERROR: already dead!" + this.id);
        util.assert(!this.recovered, "ERROR: already recovered!" + this.id);

        if (this.criticalIfSevere) this.symptomsCurrent = SymptomsLevels.critical;
        else this.symptomsCurrent = SymptomsLevels.severe;
    }

    becomeDead(sim: Sim | null) {
        util.assert(this.infected, "ERROR: dead without being infected." + this.id);
        util.assert(this.contagious, "ERROR: dying without being contagious" + this.id);
        util.assert(!this.dead, "ERROR: already dead!" + this.id);
        util.assert(!this.recovered, "ERROR: already recovered!" + this.id);
        this.dead = true;
        this.infected = false;
        this.contagious = false;
        if (sim && this.county >= 0) {
            sim.countyStats.counters[this.county][GraphType.totalDead]++;
            sim.countyStats.counters[this.county][GraphType.currentInfected]--;
        }
    }

    becomeIsolated() {
        this.isolating = true;
        this.tight.currentRoutine =
            Person.activitiesWhileSickByte[RandomFast.HashIntApprox(this.id, 0, Person.activitiesWhileSickByte.length)];
    }

    inRange(condition: boolean, start: number, end: number) {
        return condition && this.time_since_infected >= start && this.time_since_infected < end;
    }

    // Returns true if this person is sick.
    stepTime(sim: Sim | null, rand: RandomFast) {
        if (this.isSick) {
            // if (util.evenDistributionInTimeRange(2*24, 7*24, this.time_since_infected, rand)) this.becomeContagious();
            if (this.inRange(!this.contagious, this.contagiousTrigger, this.endContagiousTrigger)) this.becomeContagious();
            if (this.inRange(!this.symptomsCurrent, this.symptomsTrigger, this.endSymptomsTrigger)) this.becomeSymptomy();
            if (this.symptomsCurrent && this.symptomaticOverall && this.time_since_infected >= this.endSymptomsTrigger)
                this.endSymptoms();
            if (this.contagious && this.time_since_infected >= this.endContagiousTrigger) {
                // Maybe a little redundant...
                this.endContagious();
                this.becomeRecovered(sim);
            }
            if (this.inRange(this.symptomsCurrent < SymptomsLevels.severe, this.severeTrigger, this.endSymptomsTrigger))
                // if (this.symptomsCurrent < SymptomsLevels.severe && this.time_since_infected >= this.severeTrigger)
                this.becomeSevereOrCritical();
            if (this.contagious && this.time_since_infected >= this.deadTrigger) this.becomeDead(sim);
            if (this.symptomsCurrent && this.time_since_infected >= this.isolationTrigger) this.becomeIsolated();

            this.time_since_infected = this.time_since_infected + 1;
        }
    }

    // TODO: This function can be pulled out of the inner loop.
    // For now, density can be thought of as your distance to the closest person.
    // Clamped at 0.5 minimum
    // This returns a [0..1] probability multiplier for probability of spreading the virus.
    probabilityMultiplierFromDensity(density: number): number {
        const minimumDistance = 0.5;
        density = Math.max(minimumDistance, density);
        // TODO: 1.5 is a magic number. With a perfect point source of disease, the fall-off would be 1 / (distance squared).
        // But we don't have a perfect point source, and we also have enclosed spaces. So this number adjusts
        // the distance-squared fall-off arbitrarily. :/
        return minimumDistance / Math.pow(density, 1.5);
    }

    // TODO: how do we best solve that if you visit a stadium with 10,000 people you shouldn't infect less than in a stadium with 100,000 people?
    // Should we consider how much you mix with people?
    // How much you mix can be measured as a fraction of all the people in the space that you will come in range of???
    // Density will affect the outcome based on distance to other people???
    // TODO: optimize me using "real math". :)
    // TODO: maxPeopleYouCanSpreadItToInYourRadius is totally arbitrary
    howManyCatchItInThisTimeStep(
        rand: RandomFast,
        prob: number,
        popSize: number,
        maxPeopleYouCanSpreadItToInYourRadius: number = 30
    ): number {
        popSize = Math.min(popSize, maxPeopleYouCanSpreadItToInYourRadius);
        let total = 0;
        for (let i = 0; i < popSize; i++) {
            if (rand.RandFloat() < prob /*- 1.0*/) total++;
            // if (rtemp.RandFloat() < prob /*- 1.0*/) total++;
        }
        return total;
    }

    spreadInAPlace(occupants: util.FastArrayInt32, density: number, pop: Person[], rand: RandomFast, sim: Sim, seed: number) {
        let prob = sim.params.prob_baseline_timestep * this.probabilityMultiplierFromDensity(density);
        let numSpread = this.howManyCatchItInThisTimeStep(rand, prob, occupants.length);
        for (let i = 0; i < numSpread; i++) {
            let targetIndex = occupants.buffer[rand.RandIntApprox(0, occupants.length)];
            let target = pop[targetIndex];
            if (target.isVulnerable) {
                target.becomeSick(sim);
                // Save off visualization info about where people got infected
                [target.infectedX, target.infectedY] = this.getCurrentLocation(sim);
                sim.infectionTraces.push([this.infectedX, this.infectedY, target.infectedX, target.infectedY]);
            }
        }
    }

    spread(time_steps_since_start: Params.TimeStep, index: number, pop: Person[], rand: RandomFast, sim: Sim) {
        if (this.isContagious) {
            let currentStep = sim.time_steps_since_start.getStepModDay();
            let activity = this.tight.getCurrentActivityInt(currentStep);
            // let activity = this.currentActivity;
            let seed = Math.trunc(time_steps_since_start.raw * 4096 + index); // Unique for time step and each person
            if (activity < numPlaceTypes) {
                let placeIndex = this.tight.placeIndex[activity];
                this.spreadInAPlace(
                    sim.allPlaces[activity][placeIndex].currentOccupants,
                    sim.params.placeDensities[activity],
                    pop,
                    rand,
                    sim,
                    seed
                );
            }
        }
    }

    drawTimeline(canvas: any) {
        if (!canvas) return;
        if (!canvas.getContext) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let width = canvas.width,
            height = canvas.height;
        let scale = 7.0 / 24.0; // 1 day = 7 pixels

        util.drawText(ctx, 252, 16, "Infection timeline", 14, "#aaaaaa");
        if (this.symptomaticOverall) {
            if (this.severeTrigger < util.MAX_TIME_STEPS) {
                if (this.criticalIfSevere)
                    util.drawRect(
                        ctx,
                        this.severeTrigger * scale,
                        height * 0.0,
                        (this.endSymptomsTrigger - this.severeTrigger) * scale,
                        height,
                        "#ff3f00"
                    );
                else
                    util.drawRect(
                        ctx,
                        this.severeTrigger * scale,
                        height * 0.25,
                        (this.endSymptomsTrigger - this.severeTrigger) * scale,
                        height,
                        "#ff7f00"
                    );
            }
            util.drawRect(
                ctx,
                this.symptomsTrigger * scale,
                height * 0.5,
                (this.endSymptomsTrigger - this.symptomsTrigger) * scale,
                height,
                "#ffbf00"
            );
        }
        util.drawRect(
            ctx,
            this.contagiousTrigger * scale,
            height * 0.75,
            (this.endContagiousTrigger - this.contagiousTrigger) * scale,
            height,
            "#ffef40"
        );

        for (let i = 0; i < 7 * 8; i++) {
            util.drawRect(ctx, i * 24 * scale, i % 7 == 0 ? 24 : 28, 2, 8, "#bbbbbb");
        }
        if (this.time_since_infected >= 0.0) {
            util.drawRect(ctx, this.time_since_infected * scale, height * 0.5, 2, height, "#ff4040");
            util.drawText(
                ctx,
                this.time_since_infected * scale,
                height * 0.4,
                (this.time_since_infected / 24.0).toFixed(1),
                14,
                "#ff4040"
            );
        }
        if (this.deadTrigger < util.MAX_TIME_STEPS) {
            util.drawRect(ctx, this.deadTrigger * scale, 0, 2, height, "#ffffff");
            util.drawText(ctx, this.deadTrigger * scale - 9, 16, "☠️", 16);
        }
        if (this.isolationTrigger < util.MAX_TIME_STEPS) {
            util.drawRect(ctx, this.isolationTrigger * scale, 0, 2, height, "#ff5f1f");
            util.drawText(ctx, this.isolationTrigger * scale - 9, 14, "😷", 14);
        }
    }
}
