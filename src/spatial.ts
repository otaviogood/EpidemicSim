import RandomFast from "./random-fast";
import MersenneTwister from "mersenne-twister";
// https://github.com/boo1ean/mersenne-twister
// var MersenneTwister = require("mersenne-twister");

import { Sim, fromDays, fromHours } from "./sim";
import { exists } from "fs";

// Input is an array that should be normalized to add up to 1... a probability distribution.
function sampleProbabilites(rand: MersenneTwister, probs: number[]) {
    let r = rand.random();
    for (let i = 0; i < probs.length; i++) {
        let p = probs[i];
        if (r < p) return i;
        r -= p;
    }
    return probs.length - 1; // In theory, we shouldn't ever reach this return statement.
}

// Linear interpolate 2 values by the 'a' value
function mix(f0: number, f1: number, a: number): number {
    return (1.0 - a) * f0 + a * f1;
}
// Polynomial smoothstep function to gently interpolate between 2 values based on a.
function mixP(f0: number, f1: number, a: number): number {
    a = Math.max(0.0, Math.min(1.0, a)); // Clamp [0..1] range
    return mix(f0, f1, a * a * (3.0 - 2.0 * a));
}

// hospital, school, supermarket, retirement community, prison
export enum ActivityType {
    home = "h",
    work = "w",
    shopping = "s",
    hospital = "o",
    car = "c",
    train = "t",
}

const home_density: number = 0.5;
const office_density: number = 1.75;
const shopping_density: number = 1.5;

let rtemp = new RandomFast(1234567);
export class Person {
    // lots of sets of 24-hour periods of different behaviors that represent different people's lifestyles
    // TODO: are weekends different? Does it matter?
    static readonly activities = [
        "hhhhhhhhcwwwswwwwwchhhhh", // needs to be 24-long
        "hhhhhhhhcshhshhhhhshhhhh",
        "hhhhhhhccsscchhhhshhhhhh",
    ];

    // This is like the "R" number, but as a probability of spreding in a timestep.
    static readonly prob_baseline_timestep = 0.01; // .002
    // https://www.nature.com/articles/s41591-020-0869-5
    static readonly mean_time_till_contagious = fromDays(3);
    // infectiousness was shown to peak at 0–2 days before symptom onset - https://www.nature.com/articles/s41591-020-0869-5
    static readonly contagious_range = fromDays(2);
    static readonly mean_time_till_symptoms = fromHours(5.25 * 24); // Rounded a little from 5.2.
    static readonly symptom_range = fromDays(2); // TODO: totally made up range...
    // https://www.who.int/docs/default-source/coronaviruse/who-china-joint-mission-on-covid-19-final-report.pdf
    static readonly time_till_severe = Person.mean_time_till_symptoms + fromDays(7);
    // median communicable period = 9.5 days https://link.springer.com/article/10.1007/s11427-020-1661-4
    // However, the communicable period could be up to three weeks
    // TODO: make this a distribution instead of a single number.
    static readonly median_time_virus_is_communicable = fromDays(9.5) + Person.mean_time_till_contagious;
    // static readonly time_till_no_symptoms = Person.mean_time_till_symptoms + fromDays(20); // TODO:??? Need reference for this one.
    // Among patients who have died, the time from symptom onset to outcome ranges from 2-8 weeks
    // https://www.who.int/docs/default-source/coronaviruse/who-china-joint-mission-on-covid-19-final-report.pdf
    static readonly range_time_till_death = [
        Person.mean_time_till_symptoms + fromDays(2 * 7),
        Person.mean_time_till_symptoms + fromDays(8 * 7),
    ];
    // https://www.statista.com/statistics/1105420/covid-icu-admission-rates-us-by-age-group/
    static readonly cases_that_go_to_ICU = 0.082; // Out of what population???
    // Probability of spreading virus multiplier if you get people to handwash
    // https://onlinelibrary.wiley.com/doi/full/10.1111/j.1365-3156.2006.01568.x
    static readonly handwashing_probability_multiplier = 0.76;
    // 4.1% of cases completely asymptomatic in a Korean call center study that made sure to do follow-up tests.
    // https://wwwnc.cdc.gov/eid/article/26/8/20-1274_article
    // Among the cases with relevant information (n=329, 28.48%), 49 (14.89%) were asymptomatic, 256 (77.81%) mild to moderate, and 24 (7.29%) severe.
    // https://www.medrxiv.org/content/10.1101/2020.03.21.20040329v1.full.pdf
    static readonly fully_asymptomatic = 0.1489;

    // From: https://science.sciencemag.org/content/early/2020/04/09/science.abb6936/tab-figures-data
    // Relative infectiousness of asymptomatics
    static readonly asymptomatic_infectiousness_multiplier = 0.2;
    // Fraction of all transmission that is environmentally mediated
    static readonly environmental_transmission_fraction = 0.2;

    // Face masks: https://www.sciencedirect.com/science/article/pii/S0196655307007742
    // Our experimental tests showed filter efficiencies ranging from 20% to 99% in the latex sphere tests and from 10% to 90% in the sodium chloride tests.
    static readonly mask_filter_for_wearer = 0.9; // Taking worst number because I'm assuming crappy masks.
    // Influenza Virus Aerosols in Human Exhaled Breath: Particle Size, Culturability, and Effect of Surgical Masks
    // https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3591312/
    static readonly mask_filter_for_others = 0.85; // TODO: is this right? Lots of different numbers in this paper... which are best?
    // Study on home-made masks: https://www.cambridge.org/core/journals/disaster-medicine-and-public-health-preparedness/article/testing-the-efficacy-of-homemade-masks-would-they-protect-in-an-influenza-pandemic/0921A05A69A9419C862FA2F35F819D55

    // Effect of temperature on R: https://papers.ssrn.com/sol3/Papers.cfm?abstract_id=3551767

    // Approximately 80% of laboratory confirmed patients have had mild to moderate disease, which includes non-pneumonia and pneumonia cases, 13.8% have severe disease (dyspnea, respiratory
    // frequency ≥30/minute, blood oxygen saturation ≤93%, PaO2/FiO2 ratio <300, and/or lung infiltrates >50% of the lung field within 24-48 hours) and 6.1% are critical (respiratory
    // failure, septic shock, and/or multiple organ dysfunction/failure).

    // https://ourworldindata.org/coronavirus?country=USA+BRA+SWE+RUS
    static readonly case_fatality_rate_US = 0.06; // 6%
    static readonly infection_fatality_rate = Person.case_fatality_rate_US / 20; // Made-up BS. TODO: better numbers here.
    // IFR by age decade, from China... 0..9, 10..19, 20..29,..., >= 80
    // https://www.thelancet.com/pdfs/journals/laninf/PIIS1473-3099(20)30243-7.pdf
    // prettier-ignore
    static readonly infection_fatality_rate_by_age = [
        0.0000161,  // 0..9
        0.0000695,  // 10..19
        0.000309,   // 20..29
        0.000844,   // 30..39
        0.00161,    // 40..49
        0.00595,    // 50..59
        0.0193,
        0.0428,
        0.078,
    ];

    // Proportions of infected individuals hospitalised, from China, by age decade... 0..9, 10..19, 20..29,..., >= 80
    // https://www.thelancet.com/pdfs/journals/laninf/PIIS1473-3099(20)30243-7.pdf
    static readonly infected_proportion_hospitalized = [0, 0.000408, 0.0104, 0.0343, 0.0425, 0.0816, 0.118, 0.166, 0.184];

    // Symptoms from: https://www.who.int/docs/default-source/coronaviruse/who-china-joint-mission-on-covid-19-final-report.pdf
    static readonly symptoms_fever_proportion = 0.879;
    static readonly symptoms_cough_proportion = 0.677;

    // Travel restrictions
    // Temperature checks at schools / workplaces
    //

    time_since_infected: number = -1;
    xpos: number = 0;
    ypos: number = 0;
    symptoms: boolean = true;
    occupation: number = 0;
    debug: number = 0;
    dead: boolean = false;
    homeIndex = -1;
    officeIndex = -1;
    marketIndex = -1;
    hospitalIndex = -1;

    constructor(generator: MersenneTwister, public id: number) {
        this.xpos = generator.random();
        this.ypos = generator.random();
    }

    get hashId() {
        return RandomFast.HashInt32(this.id);
    }
    // returns a hashed number in the range [-scale..scale]
    hashOffset(offset: number, scale: number) {
        return (RandomFast.HashFloat(this.id + offset) * 2.0 - 1.0) * scale;
    }
    // Person's properties based on hash of their id...
    get age() {
        // TODO: get good age distribution
        let h = this.hashId;
        let a = Math.abs(h >> 16) % 45;
        let b = Math.abs(h >> 8) % 45;
        return a + b;
    }
    get isSymptomatic() {
        let h = RandomFast.HashFloat(this.id);
        return h < Person.fully_asymptomatic;
    }

    // Exposed
    get isSick() {
        return this.time_since_infected >= 0.0 && this.time_since_infected < this.timeTillRecoveredHashed;
    }
    // Infectious
    get isContagious() {
        return (
            this.time_since_infected > Person.mean_time_till_contagious + this.hashOffset(5432176, Person.contagious_range * 0.45) &&
            this.time_since_infected < this.timeTillRecoveredHashed
        );
    }
    get timeTillSymptomsHashed() {
        return Person.mean_time_till_symptoms + this.hashOffset(1112345, Person.contagious_range * 0.45);
    }
    get isShowingSymptoms() {
        return this.time_since_infected > this.timeTillSymptomsHashed && this.time_since_infected < this.timeTillRecoveredHashed;
    }
    // Susceptible
    get isVulnerable() {
        return this.time_since_infected < 0;
    }
    get timeTillRecoveredHashed() {
        // skewed distribution
        // TODO: Super lame hack for skewed distribution... This one is really bad, but I don't even have good data for the details of the distribution.
        let rand0 = RandomFast.HashFloat(this.id + 7654321);
        if (rand0 > 0.5) rand0 = RandomFast.HashFloat(this.id + 19876543) * 15.0;
        return Person.median_time_virus_is_communicable + rand0 * fromDays(1) - fromDays(4.0);
    }
    get isRecovered() {
        return (
            this.time_since_infected >= this.timeTillSymptomsHashed &&
            this.time_since_infected >= this.timeTillRecoveredHashed &&
            !this.dead
        );
    }
    // Returns true if this person is sick.
    stepTime(sim: Sim | null): boolean {
        // other stuff...
        if (this.time_since_infected == Person.range_time_till_death[0] && this.isSymptomatic) {
            let h = RandomFast.HashFloat(this.id);
            if (h < Person.infection_fatality_rate) {
                // IDK if this includes asymptomatic or not, but it's approximate anyway, so maybe not big deal?
                this.dead = true;
                if (sim) sim.totalDead++;
            }
        }
        
        if (this.isSick) {
            this.time_since_infected = this.time_since_infected + 1; //Sim.time_step_hours;
            return true;
        }
        return false;
    }

    // Get exposed... won't be contagious for a while still though...
    becomeSick(sim: Sim | null) {
        this.time_since_infected = 0.0;
        if (sim) {
            let info: [number, number, number] = [this.xpos, this.ypos, sim.time_steps_since_start];
            sim.infectedVisuals.push(info);
            sim.totalInfected++;
        }
    }

    // For now, density can be thought of as your distance to the closest person.
    // Clamped at 0.5 minimum
    // This returns a [0..1] probability multiplier for probability of spreading the virus.
    probabilityMultiplierFromDensity(density: number): number {
        density = Math.max(0.5, density);
        return 0.5 / density;
    }

    // This should be a function of density and how much you mix with people.
    // How much you mix can be measured as a fraction of all the people in the space that you will come in range of???
    // Density will affect the outcome based on distance to other people???
    // TODO: optimize me using "real math". :)
    // TODO: maxPeopleYouCanSpreadItToInYourRadius is totally arbitrary
    howManyCatchItInThisTimeStep(
        generator: MersenneTwister,
        prob: number,
        popSize: number,
        maxPeopleYouCanSpreadItToInYourRadius: number = 30
    ): number {
        popSize = Math.min(popSize, maxPeopleYouCanSpreadItToInYourRadius);
        let total = 0;
        for (let i = 0; i < popSize; i++) {
            if (generator.random() < prob /*- 1.0*/) total++;
            // if (rtemp.RandFloat() < prob /*- 1.0*/) total++;
        }
        return total;
    }

    spreadInAPlace(residents: number[], density: number, pop: Spatial, generator: MersenneTwister, sim: Sim, seed: number) {
        let prob = Person.prob_baseline_timestep * this.probabilityMultiplierFromDensity(density);
        let numSpread = this.howManyCatchItInThisTimeStep(generator, prob, residents.length);
        for (let i = 0; i < numSpread; i++) {
            let targetIndex = residents[RandomFast.HashIntApprox(seed, 0, residents.length)];
            if (pop.index(targetIndex).isVulnerable) pop.index(targetIndex).becomeSick(sim);
        }
    }

    getCurrentActivity(currentHour: number): ActivityType {
        let activityStyle = Person.activities[RandomFast.HashIntApprox(this.id, 0, Person.activities.length)];
        return activityStyle[currentHour] as ActivityType;
    }

    spread(
        time_steps_since_start: number,
        index: number,
        pop: Spatial,
        generator: MersenneTwister,
        currentHour: number,
        sim: Sim
    ) {
        if (this.isContagious) {
            let activity = this.getCurrentActivity(currentHour);
            let seed = Math.trunc(time_steps_since_start + index); // Unique for time step and each person
            if (activity == ActivityType.home) {
                this.spreadInAPlace(sim.allHouseholds[this.homeIndex].residents, home_density, pop, generator, sim, seed);
            } else if (activity == ActivityType.work) {
                this.spreadInAPlace(sim.allOffices[this.officeIndex].residents, office_density, pop, generator, sim, seed);
            } else if (activity == ActivityType.shopping) {
                this.spreadInAPlace(sim.allSuperMarkets[this.marketIndex].residents, shopping_density, pop, generator, sim, seed);
            }
        }
    }
}

export class Place {
    xpos: number = 0;
    ypos: number = 0;
}

export class Spatial {
    protected population: Person[] = [];
    constructor() {}

    get length() {
        return this.population.length;
    }

    add(person: Person) {
        this.population.push(person);
    }
    index(index: number) {
        return this.population[index];
    }

    findNearest(meIndex: number): number {
        let minDist = Number.MAX_VALUE;
        let minIndex = -1;
        for (let i = 0; i < this.population.length; i++) {
            if (i == meIndex) continue;
            let personA = this.population[meIndex];
            let personB = this.population[i];
            let dx = personA.xpos - personB.xpos;
            let dy = personA.ypos - personB.ypos;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) {
                minDist = dist;
                minIndex = i;
            }
        }
        return minIndex;
    }

    findKNearest(meIndex: number, k: number): number[] {
        var map = new Map();
        for (let i = 0; i < this.population.length; i++) {
            if (i == meIndex) continue;
            let personA = this.population[meIndex];
            let personB = this.population[i];
            let dx = personA.xpos - personB.xpos;
            let dy = personA.ypos - personB.ypos;
            let dist = Math.sqrt(dx * dx + dy * dy);
            map.set(dist, i);
        }
        var mapAsc = new Map([...map.entries()].sort());
        return Array.from(mapAsc.values()).slice(0, k);
    }
}

export class Grid {
    static readonly hashScale = 8.0;
    protected population: Person[] = [];
    protected grid = new Map<number, [number]>();
    constructor() {}

    get length() {
        return this.population.length;
    }

    protected static posHash(xpos: number, ypos: number) {
        xpos *= this.hashScale;
        ypos *= this.hashScale;
        return RandomFast.HashI2(xpos, ypos);
    }

    protected getCell(xpos: number, ypos: number) {
        let hash = Grid.posHash(xpos, ypos);
        let dict = this.grid.get(hash);
        return dict;
    }

    add(person: Person) {
        let hash = Grid.posHash(person.xpos, person.ypos);
        person.debug = hash;
        let dict = this.grid.get(hash);
        if (dict) {
            dict.push(this.population.length);
        } else {
            this.grid.set(hash, [this.population.length]);
        }
        this.population.push(person);
    }

    index(index: number) {
        return this.population[index];
    }

    findKNearest(meIndex: number, k: number): number[] {
        let layer = 1;
        let leg = 0;
        let x: number = 0,
            y: number = 0; //read these as output from next, do not modify.

        let personA = this.population[meIndex];
        let map = new Map<number, number>();
        let done: boolean = false;
        while (!done) {
            let cell = this.getCell(personA.xpos + x / Grid.hashScale, personA.ypos + y / Grid.hashScale) ?? [];
            for (let i = 0; i < cell.length; i++) {
                if (cell[i] == meIndex) continue; // needed?
                let personB = this.population[cell[i]];
                let dx = personA.xpos - personB.xpos;
                let dy = personA.ypos - personB.ypos;
                let dist = Math.sqrt(dx * dx + dy * dy);
                map.set(dist, cell[i]);
            }
            if (map.size > 100) done = true;

            // Spiral out: https://stackoverflow.com/questions/3706219/algorithm-for-iterating-over-an-outward-spiral-on-a-discrete-2d-grid-from-the-or/14010215#14010215
            switch (leg) {
                case 0:
                    ++x;
                    if (x == layer) ++leg;
                    break;
                case 1:
                    ++y;
                    if (y == layer) ++leg;
                    break;
                case 2:
                    --x;
                    if (-x == layer) ++leg;
                    break;
                case 3:
                    --y;
                    if (-y == layer) {
                        leg = 0;
                        ++layer;
                    }
                    break;
            }
        }
        var mapAsc = new Map([...map.entries()].sort());
        return Array.from(mapAsc.values()).slice(0, k);
    }
}
