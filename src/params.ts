import moment from "moment";
import { PlaceType, numPlaceTypes } from "./person";
import { Sim } from "./sim";
import * as util from "./util";

export class TimeStep {
    static readonly stepsInDay = 24;
    // This needs to be an integer.
    protected time: number = 0;

    static fromHours(hours: number): TimeStep {
        let t: TimeStep = new TimeStep();
        t.time = hours | 0;
        return t;
    }

    static fromDays(days: number): TimeStep {
        let t: TimeStep = new TimeStep();
        t.time = (days * 24) | 0;
        return t;
    }

    static fromMoment(dateTime: moment.Moment, startDate: moment.Moment): TimeStep {
        let t: TimeStep = new TimeStep();
        let duration = moment.duration(moment(dateTime).diff(startDate));
        t.time = duration.asHours() | 0;
        return t;
    }

    get days(): number {
        return this.time / 24.0;
    }
    get hours(): number {
        return this.time;
    }
    // Return the time variable for doing unitless things like sorting.
    get raw(): number {
        return this.time;
    }

    clone() {
        let t: TimeStep = new TimeStep();
        t.time = this.time;
        return t;
    }
    add(a: TimeStep): TimeStep {
        let t: TimeStep = new TimeStep();
        t.time = this.time + a.time;
        return t;
    }
    equals(a: TimeStep): boolean {
        return this.time === a.time;
    }
    increment() {
        this.time++;
    }
    getStepModDay(): number {
        return this.time % TimeStep.stepsInDay;
    }
    getStepModDayOffset(offset:number): number {
        return (this.time + offset) % TimeStep.stepsInDay;
    }
    toMoment(startDate: moment.Moment) {
        return moment(startDate).add(this.time, "hours");
    }
}

class Intervention {
    constructor(public time: TimeStep, public action: any, public description: string = "") {}
}

// Default parameters all wrapped up into this class that you can inherit from to make custom experiments
export class Base {
    randomSeed = 1234567890;

    readonly startDate = moment("2020-02-01"); // year-mm-dd

    // // for doubling time and r number, https://arxiv.org/ftp/arxiv/papers/2003/2003.09320.pdf page 9
    // r = 2.5; // virus reproductive number
    // r_time_interval = 4 * 24; // number of time steps (minutes) to do the r
    // r_baseline_interval = Math.exp(Math.log(this.r) / this.r_time_interval);

    // This is like the "R" number, but as a probability of spreading in a timestep.
    prob_baseline_timestep = 0.005; // .002

    // https://www.nature.com/articles/s41591-020-0869-5
    mean_time_till_contagious: TimeStep = TimeStep.fromDays(3);
    // infectiousness was shown to peak at 0–2 days before symptom onset - https://www.nature.com/articles/s41591-020-0869-5
    contagious_range: TimeStep = TimeStep.fromDays(2);
    mean_time_till_symptoms: TimeStep = TimeStep.fromHours(5.25 * 24); // Rounded a little from 5.2.
    // https://www.jhsph.edu/news/news-releases/2020/new-study-on-COVID-19-estimates-5-days-for-incubation-period.html
    // The analysis suggests that about 97.5 percent of people who develop symptoms of SARS-CoV-2 infection will do so within 11.5 days of exposure.
    // symptom_range = util.fromDays(6.25);
    // https://www.who.int/docs/default-source/coronaviruse/who-china-joint-mission-on-covid-19-final-report.pdf
    // Preliminary data suggests that the time period from [symptom???] onset to the development of severe disease, including hypoxia, is 1 week
    // TODO: This one needs some more sources.
    time_till_severe: TimeStep = TimeStep.fromDays(7);
    //  Approximately 80% of laboratory confirmed patients have had mild to moderate disease, which includes
    // non-pneumonia and pneumonia cases, 13.8% have severe disease (dyspnea, respiratory
    // frequency ≥30/minute, blood oxygen saturation ≤93%, PaO2/FiO2 ratio <300, and/or lung
    // infiltrates >50% of the lung field within 24-48 hours) and 6.1% are critical (respiratory
    // failure, septic shock, and/or multiple organ dysfunction/failure).
    prob_severe_or_critical = 0.2;
    prob_critical_given_severe_or_critical = 0.3; // 6.1 / (6.1 + 13.8)
    // median communicable period = 9.5 days https://link.springer.com/article/10.1007/s11427-020-1661-4
    // However, the communicable period could be up to ***three weeks*** (contradicted by below)
    // May 23: https://www.ams.edu.sg/view-pdf.aspx?file=media%5C5558_fi_168.pdf&ofile=Period+of+Infectivity+Position+Statement+(final)+23-5-20.pdf
    // Based on the accumulated data since the start of the COVID-19 pandemic, the infectious period of SARS-CoV-2 in symptomatic individuals may begin around 2 days
    // before the onset of symptoms, and persists for about 7 - 10 days after the onset of symptoms. Active viral replication drops quickly after the first week, and viable virus
    // was not found after the second week of illness despite the persistence of PCR detection of RNA.
    median_time_virus_is_communicable: TimeStep = TimeStep.fromDays(8.5);
    // Among patients who have died, the time from symptom onset to outcome ranges from 2-8 weeks
    // https://www.who.int/docs/default-source/coronaviruse/who-china-joint-mission-on-covid-19-final-report.pdf
    range_time_till_death_relative_to_syptoms: TimeStep[] = [TimeStep.fromDays(2 * 7), TimeStep.fromDays(8 * 7)];
    // https://www.statista.com/statistics/1105420/covid-icu-admission-rates-us-by-age-group/
    prob_cases_that_go_to_ICU = 0.082; // Out of what population???
    // Probability of spreading virus multiplier if you get people to handwash
    // https://onlinelibrary.wiley.com/doi/full/10.1111/j.1365-3156.2006.01568.x
    handwashing_probability_multiplier = 0.76;
    // 4.1% of cases completely asymptomatic in a Korean call center study that made sure to do follow-up tests.
    // https://wwwnc.cdc.gov/eid/article/26/8/20-1274_article
    // Among the cases with relevant information (n=329, 28.48%), 49 (14.89%) were asymptomatic, 256 (77.81%) mild to moderate, and 24 (7.29%) severe.
    // https://www.medrxiv.org/content/10.1101/2020.03.21.20040329v1.full.pdf
    prob_fully_asymptomatic = 0.1489;

    // From: https://science.sciencemag.org/content/early/2020/04/09/science.abb6936/tab-figures-data
    // Relative infectiousness of asymptomatics
    asymptomatic_infectiousness_multiplier = 0.2;
    // Fraction of all transmission that is environmentally mediated
    environmental_transmission_fraction = 0.2;

    // Face masks: https://www.sciencedirect.com/science/article/pii/S0196655307007742
    // Our experimental tests showed filter efficiencies ranging from 20% to 99% in the latex sphere tests and from 10% to 90% in the sodium chloride tests.
    mask_filter_for_wearer = 0.9; // Taking worst number because I'm assuming crappy masks.
    // Influenza Virus Aerosols in Human Exhaled Breath: Particle Size, Culturability, and Effect of Surgical Masks
    // https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3591312/
    mask_filter_for_others = 0.85; // TODO: is this right? Lots of different numbers in this paper... which are best?
    // Study on home-made masks: https://www.cambridge.org/core/journals/disaster-medicine-and-public-health-preparedness/article/testing-the-efficacy-of-homemade-masks-would-they-protect-in-an-influenza-pandemic/0921A05A69A9419C862FA2F35F819D55

    // Effect of temperature on R: https://papers.ssrn.com/sol3/Papers.cfm?abstract_id=3551767

    // Approximately 80% of laboratory confirmed patients have had mild to moderate disease, which includes non-pneumonia and pneumonia cases, 13.8% have severe disease (dyspnea, respiratory
    // frequency ≥30/minute, blood oxygen saturation ≤93%, PaO2/FiO2 ratio <300, and/or lung infiltrates >50% of the lung field within 24-48 hours) and 6.1% are critical (respiratory
    // failure, septic shock, and/or multiple organ dysfunction/failure).

    // https://ourworldindata.org/coronavirus?country=USA+BRA+SWE+RUS
    case_fatality_rate_US = 0.06; // 6%
    // IFR as a single number is a bit silly because it depends on hospitalization and treatment.
    infection_fatality_rate = this.case_fatality_rate_US / 20; // Made-up BS. TODO: better numbers here.

    // IFR by age decade, from China... 0..9, 10..19, 20..29,..., >= 80
    // https://www.thelancet.com/pdfs/journals/laninf/PIIS1473-3099(20)30243-7.pdf
    // prettier-ignore
    infection_fatality_rate_by_age = [
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
    infected_proportion_hospitalized = [0, 0.000408, 0.0104, 0.0343, 0.0425, 0.0816, 0.118, 0.166, 0.184];

    // Symptoms from: https://www.who.int/docs/default-source/coronaviruse/who-china-joint-mission-on-covid-19-final-report.pdf
    symptoms_fever_proportion = 0.879;
    symptoms_cough_proportion = 0.677;

    // Travel restrictions
    // Temperature checks at schools / workplaces
    //

    // For the spreading function, so each place spreads differently
    placeDensities : number[] = [];

    constructor() {
        for (let i = 0; i < numPlaceTypes; i++) this.placeDensities[i] = 1.0;  // Set default
        this.placeDensities[PlaceType.home] = 0.5;
        this.placeDensities[PlaceType.office] = 1.75;
        this.placeDensities[PlaceType.supermarket] = 1.5;
    }

    // ========================================================================
    interventions: Intervention[] = [];
    currentInterventionIndex = 0;
    makeEventFromStart(time: TimeStep, action: any, description: string = "") {
        this.interventions.push(new Intervention(time, action, description));
        this.interventions.sort((a, b) => a.time.raw - b.time.raw); // This is slow to do every time. I couldn't find a sorted list in Typescript.
    }
    // date should be yyyy-mm-dd format exactly
    makeEvent(dateStr: string, action: any, description: string = "") {
        let date = moment(dateStr);
        util.assert(date.isValid(), "ERROR: Invalid date string");
        util.assert(date.isAfter(this.startDate), "ERROR: Event date is before start date");
        let time = TimeStep.fromMoment(date, this.startDate);
        this.interventions.push(new Intervention(time, action, description));
        this.interventions.sort((a, b) => a.time.raw - b.time.raw); // This is slow to do every time. I couldn't find a sorted list in Typescript.
    }
    doInterventionsForThisTimestep(sim: Sim) {
        for (let i = this.currentInterventionIndex; i < this.interventions.length; i++) {
            let triggerTime = this.interventions[i].time;
            if (triggerTime.equals(sim.time_steps_since_start)) {
                this.interventions[i].action(sim);
                this.currentInterventionIndex++;
            } else break;
        }
    }
}

// Example subclass for running an experiment with different parameters
export class SantaCruzModel extends Base {
    startDate = moment("2020-03-09"); // year-mm-dd
    // infection_fatality_rate = 0.5;
    constructor() {
        super();
        let index = 0;
        this.makeEvent("2020-03-10", (sim: Sim) => sim.seedInfection(0), "1 become sick");
        this.makeEvent("2020-03-10", (sim: Sim) => sim.seedInfection(0), "1 become sick");
        this.makeEvent("2020-03-12", (sim: Sim) => sim.seedInfection(0), "1 become sick");
        // These are just do-nothing examples for now...
        this.makeEvent("2020-03-11", () => (this.environmental_transmission_fraction = 0.0), "50% transit level (TODO)");
        this.makeEvent("2020-03-14", () => (this.environmental_transmission_fraction = 0.0), "20% transit level (TODO)");
    }
}
