import RandomFast from "./random-fast";
import MersenneTwister from "mersenne-twister";
// https://github.com/boo1ean/mersenne-twister
// var MersenneTwister = require("mersenne-twister");

import { Sim } from "./sim";

// hospital, school, supermarket, retirement community, prison
enum ActivityType {
    home = 1,
    work,
    car,
    train,
    shopping,
}

const home_density: number = 0.5;
const office_density: number = 1.75;
const shopping_density: number = 1.5;

let rtemp = new RandomFast(1234567);
export class Person {
    // prettier-ignore
    static readonly activities = [ActivityType.home, ActivityType.home, ActivityType.home, ActivityType.home, 
        ActivityType.home, ActivityType.home, ActivityType.home, ActivityType.home, 
        ActivityType.home, ActivityType.train, ActivityType.work, ActivityType.work,
        ActivityType.work, ActivityType.work, ActivityType.work, ActivityType.work,
        ActivityType.work, ActivityType.work, ActivityType.train, ActivityType.shopping, 
        ActivityType.shopping, ActivityType.home, ActivityType.home, ActivityType.home, ];

    time_since_start: number = -1;
    xpos: number = 0;
    ypos: number = 0;
    symptoms: boolean = true;
    occupation: number = 0;
    debug: number = 0;
    homeIndex = -1;
    officeIndex = -1;

    constructor(generator: MersenneTwister) {
        this.xpos = generator.random();
        this.ypos = generator.random();
    }

    get isSick() {
        return this.time_since_start >= 0.0 && this.time_since_start < Sim.time_virus_is_active;
    }
    get isContagious() {
        return this.time_since_start > Sim.time_till_contagious && this.time_since_start < Sim.time_virus_is_active;
    }
    get isVulnerable() {
        return this.time_since_start < 0;
    }
    // Returns true if this person is sick.
    stepTime(): boolean {
        if (this.isSick) {
            this.time_since_start = this.time_since_start + Sim.time_step_hours;
            return true;
        }
        return false;
    }

    // Get exposed... won't be contagious for a while still though...
    becomeSick(sim: Sim) {
        this.time_since_start = 0.0;
        let info: [number, number, number] = [this.xpos, this.ypos, sim.time_steps_since_start];
        sim.infectedVisuals.push(info);
        sim.totalInfected++;
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
        let prob = Sim.prob_baseline_timestep * this.probabilityMultiplierFromDensity(density);
        let numSpread = this.howManyCatchItInThisTimeStep(generator, prob, residents.length);
        for (let i = 0; i < numSpread; i++) {
            let targetIndex = residents[RandomFast.HashIntApprox(seed, 0, residents.length)];
            if (pop.index(targetIndex).isVulnerable) pop.index(targetIndex).becomeSick(sim);
        }
    }

    spread(
        time_steps_since_start: number,
        index: number,
        pop: Spatial,
        generator: MersenneTwister,
        currentHour: number,
        sim: Sim
    ) {
        let activity = Person.activities[currentHour];
        let seed = Math.trunc(time_steps_since_start + index); // Unique for time step and each person
        if (this.isContagious) {
            if (activity == ActivityType.home) {
                this.spreadInAPlace(sim.allHouseholds[this.homeIndex].residents, home_density, pop, generator, sim, seed);
            } else if (activity == ActivityType.work) {
                this.spreadInAPlace(sim.allOffices[this.officeIndex].residents, office_density, pop, generator, sim, seed);
            } else if (activity == ActivityType.shopping) {
                // // For now randomly infects _anyone_ in the city...
                let prob = Sim.prob_baseline_timestep * this.probabilityMultiplierFromDensity(shopping_density);
                let numSpread = this.howManyCatchItInThisTimeStep(generator, prob, 100);
                for (let i = 0; i < numSpread; i++) {
                    let targetIndex = RandomFast.HashIntApprox(seed, 0, sim.pop.length);
                    if (pop.index(targetIndex).isVulnerable) pop.index(targetIndex).becomeSick(sim);
                }
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
