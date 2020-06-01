import RandomFast from "./random-fast";
import MersenneTwister from "mersenne-twister";

import { Person, ActivityType } from "./person";

export class Place {
    xpos: number = 0;
    ypos: number = 0;
}

// ******** These spatial data structures are incomplete ********
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
        // person.debug = hash;
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
