import RandomFast from "./random-fast";
import MersenneTwister from "mersenne-twister";
// https://github.com/boo1ean/mersenne-twister
// var MersenneTwister = require("mersenne-twister");

import { Sim, fromDays, fromHours } from "./sim";
import { Spatial, Grid } from "./spatial";
import { start } from "repl";

function assert(condition: boolean, message: string) {
    if (!condition) console.log(message);
    // throw message || "Assertion failed";
}

// Biased, but not much for small ranges.
function randint(generator: MersenneTwister, a: number, b: number) {
    let temp = generator.random_int31();
    return (temp % (b - a)) + a;
}

function Bernoulli(rand: MersenneTwister, prob: number): boolean {
    let r = rand.random();
    if (r < prob) return true;
    else return false;
}

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
function Smoothstep(f0: number, f1: number, a: number): number {
    a = Math.max(0.0, Math.min(1.0, a)); // Clamp [0..1] range
    return mix(f0, f1, a * a * (3.0 - 2.0 * a));
}
function Smootherstep(f0: number, f1: number, x: number): number {
    x = Math.max(0.0, Math.min(1.0, x)); // Clamp [0..1] range
    let x3 = x * x * x;
    let x4 = x3 * x;
    let x5 = x4 * x;
    return mix(f0, f1, 6 * x5 - 15 * x4 + 10 * x3);
}

// Returns random number sampled from a circular gaussian distribution
// https://en.wikipedia.org/wiki/Box%E2%80%93Muller_transform
function RandGaussian(generator: MersenneTwister, mean: number = 0.0, std: number = 1.0): [number, number] {
    const twoPi: number = 2.0 * 3.14159265358979323846;
    let ux = generator.random();
    let uy = generator.random();
    ux = Math.max(ux, 0.00000003); // We don't want log() to fail because it's 0.
    let a: number = Math.sqrt(-2.0 * Math.log(ux));
    let x = a * Math.cos(twoPi * uy);
    let y = a * Math.sin(twoPi * uy);
    return [x * std + mean, y * std + mean];
}

function clamp(x: number, minVal: number, maxVal: number) {
    assert(minVal <= maxVal, "ERROR: clamp params seem wrong. max should be > min.");
    return Math.max(minVal, Math.min(maxVal, x));
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

export enum SymptomsLevels {
    // 0 none, 1 is mild to moderate (80%), 2 is severe (14%), 3 is critical (6%)
    none = 0,
    mild = 1,
    severe = 2,
    critical = 3,
}

const home_density: number = 0.5;
const office_density: number = 1.75;
const shopping_density: number = 1.5;

let rtemp = new RandomFast(1234567);

export class Person {
    // lots of sets of 24-hour periods of different behaviors that represent different people's lifestyles
    // TODO: are weekends different? Does it matter?
    static readonly activitiesNormal = [
        "hhhhhhhhcwwwswwwwwchhhhh", // needs to be 24-long
        "hhhhhhhhcshhshhhhhshhhhh",
        "hhhhhhhccsscchhhhshhhhhh",
    ];
    static readonly activitiesWhileSick = [
        "hhhhhhhhhhhhcshhhhhhhhhh",
        // "oooooooooooooooooooooooo",  // Hospitalized
    ];

    // This is like the "R" number, but as a probability of spreding in a timestep.
    static readonly prob_baseline_timestep = 0.01; // .002
    // https://www.nature.com/articles/s41591-020-0869-5
    static readonly mean_time_till_contagious = fromDays(3);
    // infectiousness was shown to peak at 0–2 days before symptom onset - https://www.nature.com/articles/s41591-020-0869-5
    static readonly contagious_range = fromDays(2);
    static readonly mean_time_till_symptoms = fromHours(5.25 * 24); // Rounded a little from 5.2.
    // https://www.jhsph.edu/news/news-releases/2020/new-study-on-COVID-19-estimates-5-days-for-incubation-period.html
    // The analysis suggests that about 97.5 percent of people who develop symptoms of SARS-CoV-2 infection will do so within 11.5 days of exposure.
    // static readonly symptom_range = fromDays(6.25);
    // https://www.thelancet.com/pdfs/journals/lancet/PIIS0140-6736(20)30566-3.pdf
    // Median duration of viral shedding was 20·0 days (IQR 17·0–24·0)
    static readonly median_contagious_duration = fromDays(20);
    // https://www.who.int/docs/default-source/coronaviruse/who-china-joint-mission-on-covid-19-final-report.pdf
    static readonly time_till_severe = Person.mean_time_till_symptoms + fromDays(7);
    //  Approximately 80% of laboratory confirmed patients have had mild to moderate disease, which includes
    // non-pneumonia and pneumonia cases, 13.8% have severe disease (dyspnea, respiratory
    // frequency ≥30/minute, blood oxygen saturation ≤93%, PaO2/FiO2 ratio <300, and/or lung
    // infiltrates >50% of the lung field within 24-48 hours) and 6.1% are critical (respiratory
    // failure, septic shock, and/or multiple organ dysfunction/failure).
    static readonly severe_or_critical = 0.2;
    static readonly critical_given_severe_or_critical = 0.3; // 6.1 / (6.1 + 13.8)
    // median communicable period = 9.5 days https://link.springer.com/article/10.1007/s11427-020-1661-4
    // However, the communicable period could be up to ***three weeks***
    // TODO: make this a distribution instead of a single number.
    static readonly median_time_virus_is_communicable = fromDays(9.5) + Person.mean_time_till_contagious;
    // Among patients who have died, the time from symptom onset to outcome ranges from 2-8 weeks
    // https://www.who.int/docs/default-source/coronaviruse/who-china-joint-mission-on-covid-19-final-report.pdf
    static readonly range_time_till_death_relative_to_syptoms = [fromDays(2 * 7), fromDays(8 * 7)];
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
    // IFR as a single number is a bit silly because it depends on hospitalization and treatment.
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

    id: number = -1;
    time_since_infected: number = -1;
    xpos: number = 0; // Are these needed since you can get x, y of the place you are in?
    ypos: number = 0;
    homeIndex = -1;
    officeIndex = -1;
    marketIndex = -1;
    hospitalIndex = -1;
    currentActivity: string = Person.activitiesNormal[0];

    // flags
    infected = false;
    contagious = false;
    symptomsCurrent = SymptomsLevels.none; // 0 undefined, 1 is mild to moderate (80%), 2 is severe (14%), 3 is critical (6%)
    symptomaticOverall = true;
    dead = false;
    recovered = false;
    criticalIfSevere = false;
    isolating = false;

    // These are times of onset of various things
    contagiousTrigger = Number.MAX_SAFE_INTEGER;
    endContagiousTrigger = Number.MAX_SAFE_INTEGER;
    symptomsTrigger = Number.MAX_SAFE_INTEGER;
    endSymptomsTrigger = Number.MAX_SAFE_INTEGER;
    deadTrigger = Number.MAX_SAFE_INTEGER;
    severeTrigger = Number.MAX_SAFE_INTEGER;
    isolationTrigger = Number.MAX_SAFE_INTEGER; // That moment they decide they are sick af and they need to isolate better (Any data for this???)

    constructor(generator: MersenneTwister, id: number) {
        this.id = id;

        // Find person's main activity (what they do during the day)
        this.currentActivity = this.getPersonDefaultActivity();

        // ---- Generate trigger times when sickness events will happen ----
        [this.contagiousTrigger] = RandGaussian(generator, Person.mean_time_till_contagious, Person.contagious_range * 0.5);
        // Clamp to range.
        this.contagiousTrigger = clamp(
            this.contagiousTrigger,
            Person.mean_time_till_contagious - Person.contagious_range * 0.5,
            Person.mean_time_till_contagious + Person.contagious_range * 0.5
        );

        // Skewed distribution
        [this.symptomsTrigger] = RandGaussian(generator, 0.0, 0.5); // Include 2 standard deviations before clamping.
        this.symptomsTrigger = clamp(this.symptomsTrigger, -1.0, 1.0) * 0.5 + 0.5; //  Now show be [0..1] range
        this.symptomsTrigger = Math.pow(this.symptomsTrigger, 4.5); // skew the distribution, still [0..1] range.
        // Apply new mean and std sorta...
        this.symptomsTrigger = this.symptomsTrigger * fromDays(7.25) + Person.mean_time_till_symptoms - fromDays(1.0);

        // See if this person is overall asymptomatic and if so, backtrack the symptom onset.
        this.symptomaticOverall = Bernoulli(generator, 1.0 - Person.fully_asymptomatic);
        if (!this.symptomaticOverall) this.symptomsTrigger = Number.MAX_SAFE_INTEGER; // Never trigger symptoms for asymptomatic people

        // TODO: Math here is a bit arbitrary. Need more data about the distribution if I wanna make it more meaningful...
        // It seems to be a skewed distribution.
        [this.endContagiousTrigger] = RandGaussian(generator, 0.0, 0.3);
        this.endContagiousTrigger = clamp(this.endContagiousTrigger, -1.0, 1.0) * 0.5 + 0.5; //  Now show be [0..1] range
        this.endContagiousTrigger = Math.pow(this.endContagiousTrigger, 1.5); // skew the distribution
        // Apply new mean and std sorta...
        this.endContagiousTrigger =
            this.endContagiousTrigger * fromDays(7) + Person.median_contagious_duration - fromDays(1) + this.contagiousTrigger;

        // TODO: When do symptoms end? I couldn't find numbers for this so I made something up.
        if (this.symptomaticOverall) this.endSymptomsTrigger = (this.symptomsTrigger + this.endContagiousTrigger) * 0.5;

        // Death
        // Adjust fatality rate by asymptomatic people
        let shouldDie: boolean = Bernoulli(generator, Person.infection_fatality_rate * (1.0 + Person.fully_asymptomatic));

        shouldDie = shouldDie && this.symptomaticOverall; // TODO: check - Maybe people won't die if they don't have syptoms??? How to apply this along with IFR?
        if (shouldDie) {
            [this.deadTrigger] = RandGaussian(generator, 0.0, 0.93);
            this.deadTrigger = clamp(this.deadTrigger, -1.0, 1.0) * 0.5 + 0.5; //  Now show be [0..1] range
            let span: number =
                Person.range_time_till_death_relative_to_syptoms[1] - Person.range_time_till_death_relative_to_syptoms[0];
            // console.log(this.deadTrigger);

            assert(this.symptomsTrigger >= 0, "just double checking");
            assert(this.symptomsTrigger < Number.MAX_SAFE_INTEGER, "just double checking");
            // TODO: This span doesn't match the other data. Get things consistent. :/
            this.deadTrigger = this.symptomsTrigger + this.deadTrigger * span; // This will often get clamped down by the next line.
            this.deadTrigger = Math.min(this.deadTrigger, this.endContagiousTrigger - 1); // Make sure if you are meant to die, you do it before getting better.
        }

        // Severe disease
        if (this.symptomaticOverall && Bernoulli(generator, Person.severe_or_critical)) {
            [this.severeTrigger] = RandGaussian(generator, Person.time_till_severe, 0.3);
            this.severeTrigger = clamp(this.severeTrigger, this.symptomsTrigger + 1, this.endSymptomsTrigger - 1);
            this.criticalIfSevere = Bernoulli(generator, Person.critical_given_severe_or_critical);
        }

        if (this.symptomaticOverall) {
            let [temp] = RandGaussian(generator, this.symptomsTrigger + fromDays(2), fromDays(1));
            this.isolationTrigger = clamp(temp, this.symptomsTrigger, this.symptomsTrigger + fromDays(4));
        }
    }

    getPersonDefaultActivity(): string {
        return Person.activitiesNormal[RandomFast.HashIntApprox(this.id, 0, Person.activitiesNormal.length)];
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
            let info: [number, number, number] = [this.xpos, this.ypos, sim.time_steps_since_start];
            sim.infectedVisuals.push(info);
            sim.totalInfected++;
        }
    }

    becomeContagious() {
        assert(this.infected, "ERROR: contagious without being infected." + this.id);
        assert(!this.symptomsCurrent, "ERROR: contagious after having symptoms - maybe not worst thing?" + this.id);
        assert(!this.dead, "ERROR: already dead!" + this.id);
        assert(!this.recovered, "ERROR: already recovered!" + this.id);
        this.contagious = true;
    }

    becomeSymptomy() {
        assert(this.infected, "ERROR: symptoms without being infected." + this.id);
        assert(this.contagious, "ERROR: symptoms before having contagious - maybe not worst thing?" + this.id);
        assert(!this.dead, "ERROR: already dead!" + this.id);
        assert(!this.recovered, "ERROR: already recovered!" + this.id);
        this.symptomsCurrent = 1;
    }

    endSymptoms() {
        assert(this.infected, "ERROR: end symptoms without being infected." + this.id);
        assert(!this.dead, "ERROR: already dead!" + this.id);
        assert(!this.recovered, "ERROR: already recovered!" + this.id);
        this.symptomsCurrent = 0;
    }

    endContagious() {
        assert(this.infected, "ERROR: recovered without being infected." + this.id);
        assert(!this.dead, "ERROR: already dead!" + this.id);
        assert(!this.recovered, "ERROR: already recovered!" + this.id);
        this.contagious = false;
    }

    becomeRecovered() {
        assert(this.infected, "ERROR: recovered without being infected." + this.id);
        assert(!this.dead, "ERROR: already dead!" + this.id);
        assert(!this.recovered, "ERROR: already recovered!" + this.id);
        this.recovered = true;
        this.infected = false;
        this.symptomsCurrent = 0;
        this.contagious = false;
        this.isolating = false;
        this.currentActivity = this.getPersonDefaultActivity();
    }

    becomeSevereOrCritical(generator: MersenneTwister) {
        assert(this.infected, "ERROR: severe without being infected." + this.id);
        assert(this.symptomsCurrent > 0, "ERROR: must have symptoms to be severe." + this.id);
        assert(!this.dead, "ERROR: already dead!" + this.id);
        assert(!this.recovered, "ERROR: already recovered!" + this.id);

        if (this.criticalIfSevere) this.symptomsCurrent = SymptomsLevels.critical;
        else this.symptomsCurrent = SymptomsLevels.severe;
    }

    becomeDead() {
        assert(this.infected, "ERROR: dead without being infected." + this.id);
        assert(this.contagious, "ERROR: dying without being contagious" + this.id);
        assert(!this.dead, "ERROR: already dead!" + this.id);
        assert(!this.recovered, "ERROR: already recovered!" + this.id);
        this.dead = true;
        this.infected = false;
        this.contagious = false;
    }

    becomeIsolated() {
        this.isolating = true;
        this.currentActivity =
            Person.activitiesWhileSick[RandomFast.HashIntApprox(this.id, 0, Person.activitiesWhileSick.length)];
    }

    inRange(condition: boolean, start: number, end: number) {
        return condition && this.time_since_infected >= start && this.time_since_infected < end;
    }

    // Returns true if this person is sick.
    stepTime(sim: Sim | null, generator: MersenneTwister): boolean {
        if (this.isSick) {
            if (this.inRange(!this.contagious, this.contagiousTrigger, this.endContagiousTrigger)) this.becomeContagious();
            if (this.inRange(!this.symptomsCurrent, this.symptomsTrigger, this.endSymptomsTrigger)) this.becomeSymptomy();
            if (this.symptomsCurrent && this.symptomaticOverall && this.time_since_infected >= this.endSymptomsTrigger)
                this.endSymptoms();
            if (this.contagious && this.time_since_infected >= this.endContagiousTrigger) {
                // Maybe a little redundant...
                this.endContagious();
                this.becomeRecovered();
            }
            if (this.inRange(this.symptomsCurrent < SymptomsLevels.severe, this.severeTrigger, this.endSymptomsTrigger))
                // if (this.symptomsCurrent < SymptomsLevels.severe && this.time_since_infected >= this.severeTrigger)
                this.becomeSevereOrCritical(generator);
            if (this.contagious && this.time_since_infected >= this.deadTrigger) {
                this.becomeDead();
                if (sim) sim.totalDead++;
            }
            if (this.symptomsCurrent && this.time_since_infected >= this.isolationTrigger) this.becomeIsolated();

            this.time_since_infected = this.time_since_infected + 1;
            return true;
        }
        return false;
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
        return this.currentActivity[currentHour] as ActivityType;
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

    drawRect(ctx: any, x: number, y: number, width: number, height: number, color: string = "#ffffff", fill: boolean = true) {
        if (fill) {
            ctx.fillStyle = color;
            ctx.fillRect(x, y, width, height);
        } else {
            ctx.strokeStyle = color;
            ctx.drawRect(x, y, width, height);
        }
    }
    drawText(ctx: any, x: number, y: number, text: string, size: number = 16, color: string = "rgb(255, 255, 255)") {
        ctx.fillStyle = color;
        ctx.font = size.toString() + "px sans-serif";
        ctx.fillText(text, x, y);
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

        this.drawText(ctx, 252, 16, "Infection timeline", 14, "#aaaaaa");
        if (this.symptomaticOverall) {
            if (this.severeTrigger < Number.MAX_SAFE_INTEGER) {
                if (this.criticalIfSevere)
                    this.drawRect(
                        ctx,
                        this.severeTrigger * scale,
                        height * 0.0,
                        (this.endSymptomsTrigger - this.severeTrigger) * scale,
                        height,
                        "#ff3f00"
                    );
                else
                    this.drawRect(
                        ctx,
                        this.severeTrigger * scale,
                        height * 0.25,
                        (this.endSymptomsTrigger - this.severeTrigger) * scale,
                        height,
                        "#ff7f00"
                    );
            }
            this.drawRect(
                ctx,
                this.symptomsTrigger * scale,
                height * 0.5,
                (this.endSymptomsTrigger - this.symptomsTrigger) * scale,
                height,
                "#ffbf00"
            );
        }
        this.drawRect(
            ctx,
            this.contagiousTrigger * scale,
            height * 0.75,
            (this.endContagiousTrigger - this.contagiousTrigger) * scale,
            height,
            "#ffef40"
        );

        for (let i = 0; i < 7 * 8; i++) {
            this.drawRect(ctx, i * 24 * scale, i % 7 == 0 ? 24 : 28, 2, 8, "#bbbbbb");
        }
        if (this.time_since_infected >= 0.0) {
            this.drawRect(ctx, this.time_since_infected * scale, height * 0.5, 2, height, "#ff4040");
            this.drawText(
                ctx,
                this.time_since_infected * scale,
                height * 0.4,
                (this.time_since_infected / 24.0).toFixed(1),
                14,
                "#ff4040"
            );
        }
        if (this.deadTrigger < Number.MAX_SAFE_INTEGER) {
            this.drawRect(ctx, this.deadTrigger * scale, 0, 2, height, "#ffffff");
            this.drawText(ctx, this.deadTrigger * scale - 9, 16, "☠️", 16);
        }
        if (this.isolationTrigger < Number.MAX_SAFE_INTEGER) {
            this.drawRect(ctx, this.isolationTrigger * scale, 0, 2, height, "#ff5f1f");
            this.drawText(ctx, this.isolationTrigger * scale - 9, 14, "😷", 14);
        }
    }
}
