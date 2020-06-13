import RandomFast from "./random-fast";
import MersenneTwister from "mersenne-twister";
// https://github.com/boo1ean/mersenne-twister
// var MersenneTwister = require("mersenne-twister");

import { Sim } from "./sim";
import { Spatial, Grid } from "./spatial";
import { GraphType } from "./county-stats";
import * as Params from "./params";
import * as util from "./util";

// hospital, school, supermarket, retirement community, prison
export enum ActivityType {
    home = "h",
    work = "w",
    shopping = "s",
    hospital = "o",
    car = "c",
    train = "t",
}

export enum SymptomsLevels {
    // 0 none, 1 is mild to moderate (80%), 2 is severe (14%), 3 is critical (6%)
    none = 0,
    mild = 1,
    severe = 2,
    critical = 3,
}

export class Person {
    // lots of sets of 24-hour periods of different behaviors that represent different people's lifestyles
    // TODO: are weekends different? Does it matter?
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

    id: number = -1;
    time_since_infected: number = -1;
    xpos: number = 0; // Are these needed since you can get x, y of the place you are in?
    ypos: number = 0;
    homeIndex = -1;
    officeIndex = -1;
    marketIndex = -1;
    hospitalIndex = -1;
    currentActivity: string = Person.activitiesNormal[0];
    county = -1;

    // flags
    //infected = false;
    //contagious = false;
    //symptomsCurrent = SymptomsLevels.none; // 0 undefined, 1 is mild to moderate (80%), 2 is severe (14%), 3 is critical (6%)
    //symptomaticOverall = true;
    //dead = false;
    //recovered = false;
    //criticalIfSevere = false;
    //isolating = false;

    // These are times of onset of various things
    /*contagiousTrigger = Number.MAX_SAFE_INTEGER;
    endContagiousTrigger = Number.MAX_SAFE_INTEGER;
    symptomsTrigger = Number.MAX_SAFE_INTEGER;
    endSymptomsTrigger = Number.MAX_SAFE_INTEGER;
    deadTrigger = Number.MAX_SAFE_INTEGER;
    severeTrigger = Number.MAX_SAFE_INTEGER;
    isolationTrigger = Number.MAX_SAFE_INTEGER; // That moment they decide they are sick af and they need to isolate better (Any data for this???)
    */

    get infected(): boolean { return <boolean>this.wasmPerson.infected }
    set infected(x: boolean) { this.wasmPerson.infected = x; }

    get contagious(): boolean { return <boolean>this.wasmPerson.contagious }
    set contagious(x: boolean) { this.wasmPerson.contagious = x; }

    get symptomsCurrent(): number { return <number>this.wasmPerson.symptomsCurrent }
    set symptomsCurrent(x: number) { this.wasmPerson.symptomsCurrent = x; }

    get symptomaticOverall(): boolean { return <boolean>this.wasmPerson.symptomaticOverall }
    set symptomaticOverall(x: boolean) { this.wasmPerson.symptomaticOverall = x; }

    get dead(): boolean { return <boolean>this.wasmPerson.dead }
    set dead(x: boolean) { this.wasmPerson.dead = x; }

    get recovered(): boolean { return <boolean>this.wasmPerson.recovered }
    set recovered(x: boolean) { this.wasmPerson.recovered = x; }

    get criticalIfSevere(): boolean { return <boolean>this.wasmPerson.criticalIfSevere }
    set criticalIfSevere(x: boolean) { this.wasmPerson.criticalIfSevere = x; }

    get isolating(): boolean { return <boolean>this.wasmPerson.isolating }
    set isolating(x: boolean) { this.wasmPerson.isolating = x; }

    get contagiousTrigger(): number { return <number>this.wasmPerson.contagiousTrigger }
    set contagiousTrigger(x: number) { this.wasmPerson.contagiousTrigger = x; }

    get endContagiousTrigger(): number { return <number>this.wasmPerson.endContagiousTrigger }
    set endContagiousTrigger(x: number) { this.wasmPerson.endContagiousTrigger = x; }

    get symptomsTrigger(): number { return <number>this.wasmPerson.symptomsTrigger }
    set symptomsTrigger(x: number) { this.wasmPerson.symptomsTrigger = x; }

    get endSymptomsTrigger(): number { return <number>this.wasmPerson.endSymptomsTrigger }
    set endSymptomsTrigger(x: number) { this.wasmPerson.endSymptomsTrigger = x; }

    get deadTrigger(): number { return <number>this.wasmPerson.deadTrigger }
    set deadTrigger(x: number) { this.wasmPerson.deadTrigger = x; }

    get severeTrigger(): number { return <number>this.wasmPerson.severeTrigger }
    set severeTrigger(x: number) { this.wasmPerson.severeTrigger = x; }

    get isolationTrigger(): number { return <number>this.wasmPerson.isolationTrigger }
    set isolationTrigger(x: number) { this.wasmPerson.isolationTrigger = x; }

    wasmPerson: any = null;

    associateWasmSimAndInit(wasmSim: any, params: Params.Base, rand: MersenneTwister) {
        this.wasmPerson = wasmSim.getPerson(this.id);
        // sync all vars!

        // Find person's main activity (what they do during the day)
        this.currentActivity = this.getPersonDefaultActivity();

        // ---- Generate trigger times when sickness events will happen ----
        [this.contagiousTrigger] = util.RandGaussian(
            rand,
            params.mean_time_till_contagious.hours,
            params.contagious_range.hours * 0.5
        );
        // Clamp to range.
        this.contagiousTrigger = util.clamp(
            this.contagiousTrigger,
            params.mean_time_till_contagious.hours - params.contagious_range.hours * 0.5,
            params.mean_time_till_contagious.hours + params.contagious_range.hours * 0.5
        );

        [this.endContagiousTrigger] = util.RandGaussian(rand, params.median_time_virus_is_communicable.hours, util.fromHours(30));
        this.endContagiousTrigger = this.endContagiousTrigger + this.contagiousTrigger;

        // Skewed distribution
        [this.symptomsTrigger] = util.RandGaussian(rand, 0.0, 0.5); // Include 2 standard deviations before clamping.
        this.symptomsTrigger = util.clamp(this.symptomsTrigger, -1.0, 1.0) * 0.5 + 0.5; //  Now show be [0..1] range
        this.symptomsTrigger = Math.pow(this.symptomsTrigger, 4.5); // skew the distribution, still [0..1] range.
        // Apply new mean and std sorta...
        this.symptomsTrigger =
            this.symptomsTrigger * util.fromDays(7.25) + params.mean_time_till_symptoms.hours - util.fromDays(1.0);
        this.symptomsTrigger = Math.min(this.symptomsTrigger, this.endContagiousTrigger - util.fromDays(1.0));

        // See if this person is overall asymptomatic and if so, backtrack the symptom onset.
        this.symptomaticOverall = util.Bernoulli(rand, 1.0 - params.prob_fully_asymptomatic);
        if (!this.symptomaticOverall) this.symptomsTrigger = Number.MAX_SAFE_INTEGER; // Never trigger symptoms for asymptomatic people

        // TODO: When do symptoms end? I couldn't find numbers for this so I made something up.
        if (this.symptomaticOverall)
            this.endSymptomsTrigger = util.randint(rand, this.symptomsTrigger + util.fromHours(1), this.endContagiousTrigger);

        // Death
        // Adjust fatality rate by asymptomatic people
        let shouldDie: boolean = util.Bernoulli(rand, params.infection_fatality_rate * (1.0 + params.prob_fully_asymptomatic));

        shouldDie = shouldDie && this.symptomaticOverall; // TODO: check - Maybe people won't die if they don't have syptoms??? How to apply this along with IFR?
        if (shouldDie) {
            [this.deadTrigger] = util.RandGaussian(rand, 0.0, 0.93);
            this.deadTrigger = util.clamp(this.deadTrigger, -1.0, 1.0) * 0.5 + 0.5; //  Now show be [0..1] range
            let span: number =
                params.range_time_till_death_relative_to_syptoms[1].hours -
                params.range_time_till_death_relative_to_syptoms[0].hours;
            // console.log(this.deadTrigger);

            util.assert(this.symptomsTrigger >= 0, "just double checking");
            util.assert(this.symptomsTrigger < Number.MAX_SAFE_INTEGER, "just double checking");
            // TODO: This span doesn't match the other data. Get things consistent. :/
            this.deadTrigger = this.symptomsTrigger + this.deadTrigger * span; // This will often get clamped down by the next line.
            this.deadTrigger = Math.min(this.deadTrigger, this.endContagiousTrigger - 1); // Make sure if you are meant to die, you do it before getting better.
        }

        // Severe disease
        if (this.symptomaticOverall && util.Bernoulli(rand, params.prob_severe_or_critical)) {
            this.severeTrigger = (this.symptomsTrigger + this.endSymptomsTrigger) * 0.5; // TODO: Fix me. Didn't find numbers that fit with other numbers.
            this.severeTrigger = util.clamp(this.severeTrigger, this.symptomsTrigger, this.endSymptomsTrigger);
            this.criticalIfSevere = util.Bernoulli(rand, params.prob_critical_given_severe_or_critical);
        }

        if (this.symptomaticOverall) {
            let [temp] = util.RandGaussian(rand, this.symptomsTrigger + util.fromDays(2), util.fromDays(1));
            this.isolationTrigger = util.clamp(temp, this.symptomsTrigger, this.endSymptomsTrigger);
        }
    }


    constructor(params: Params.Base, rand: MersenneTwister, id: number) {
        this.id = id;
    }

    getPersonDefaultActivityIndex(): number {
        return RandomFast.HashIntApprox(this.id, 0, Person.activitiesNormal.length);
    }

    getPersonDefaultActivity(): string {
        return Person.activitiesNormal[this.getPersonDefaultActivityIndex()];
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
            let info: [number, number, Params.TimeStep] = [this.xpos, this.ypos, sim.time_steps_since_start.clone()];
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
        if (sim) sim.wasmSim.updatePersonIsolating(this.id, false);
        this.currentActivity = this.getPersonDefaultActivity();
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

    becomeIsolated(sim: Sim | null) {
        this.isolating = true;
        if(sim) sim.wasmSim.updatePersonIsolating(this.id, true);
        this.currentActivity =
            Person.activitiesWhileSick[RandomFast.HashIntApprox(this.id, 0, Person.activitiesWhileSick.length)];
    }

    inRange(condition: boolean, start: number, end: number) {
        return condition && this.time_since_infected >= start && this.time_since_infected < end;
    }

    // Returns true if this person is sick.
    stepTime(sim: Sim | null, rand: MersenneTwister) {
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
            if (this.symptomsCurrent && this.time_since_infected >= this.isolationTrigger) this.becomeIsolated(sim);

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
        rand: MersenneTwister,
        prob: number,
        popSize: number,
        maxPeopleYouCanSpreadItToInYourRadius: number = 30
    ): number {
        popSize = Math.min(popSize, maxPeopleYouCanSpreadItToInYourRadius);
        let total = 0;
        for (let i = 0; i < popSize; i++) {
            if (rand.random() < prob /*- 1.0*/) total++;
            // if (rtemp.RandFloat() < prob /*- 1.0*/) total++;
        }
        return total;
    }

    spreadInAPlace(activityType: string, placeIndex: number, density: number, pop: Person[], rand: MersenneTwister, sim: Sim, seed: number) {
        let prob = sim.params.prob_baseline_timestep * this.probabilityMultiplierFromDensity(density);
        let nOccupants = sim.wasmSim.occupantCounter.getOccupantCount(activityType, placeIndex);
        let numSpread = this.howManyCatchItInThisTimeStep(rand, prob, nOccupants);
        var spreatToList = sim.wasmSim.occupantCounter.getNRandomOccupants(activityType, placeIndex, numSpread); // selects n random occupants
        for (let i = 0; i < numSpread; i++) {
            let targetIndex = spreatToList.get(i);
            if (pop[targetIndex].isVulnerable) pop[targetIndex].becomeSick(sim);
        }
        spreatToList.delete();
    }

    getCurrentActivity(currentHour: number): ActivityType {
        return this.currentActivity[currentHour] as ActivityType;
    }

    spread(time_steps_since_start: Params.TimeStep, index: number, pop: Person[], rand: MersenneTwister, sim: Sim) {
        if (this.isContagious) {
            let currentStep = sim.time_steps_since_start.getStepModDay();
            let activity = this.getCurrentActivity(currentStep);
            let seed = Math.trunc(time_steps_since_start.raw * 4096 + index); // Unique for time step and each person
            if (activity == ActivityType.home) {
                this.spreadInAPlace(
                    "h", this.homeIndex,
                    sim.params.home_density,
                    pop,
                    rand,
                    sim,
                    seed
                );
            } else if (activity == ActivityType.work) {
                this.spreadInAPlace(
                    "w", this.officeIndex,
                    sim.params.office_density,
                    pop,
                    rand,
                    sim,
                    seed
                );
            } else if (activity == ActivityType.shopping) {
                this.spreadInAPlace(
                    "s", this.marketIndex,
                    sim.params.shopping_density,
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
            if (this.severeTrigger < Number.MAX_SAFE_INTEGER) {
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
        if (this.deadTrigger < Number.MAX_SAFE_INTEGER) {
            util.drawRect(ctx, this.deadTrigger * scale, 0, 2, height, "#ffffff");
            util.drawText(ctx, this.deadTrigger * scale - 9, 16, "☠️", 16);
        }
        if (this.isolationTrigger < Number.MAX_SAFE_INTEGER) {
            util.drawRect(ctx, this.isolationTrigger * scale, 0, 2, height, "#ff5f1f");
            util.drawText(ctx, this.isolationTrigger * scale - 9, 14, "😷", 14);
        }
    }
}
