import { create, all } from "mathjs";

const config = {};
const mathjs = create(all, config);

import RandomFast from "./random-fast";
import MersenneTwister from "mersenne-twister";
// https://github.com/boo1ean/mersenne-twister
// var MersenneTwister = require("mersenne-twister");

import { Sim } from "./sim";
import { Person, ActivityType } from "./person";

function logStats(data: number[], message: string, multiplier: number = 1) {
    console.log(
        message +
            " mean: " +
            (mathjs.mean!(data) * multiplier).toFixed(1) +
            "  std: " +
            (mathjs.std!(data) * multiplier).toFixed(1) +
            "  min:" +
            (mathjs.min!(data) * multiplier).toFixed(1) +
            "  max:" +
            (mathjs.max!(data) * multiplier).toFixed(1)
    );
}

function check(condition:boolean, message:string) {
    if (!condition) alert(message);
}

export function runTests() {
    // ------------------ test Person virus model --------------------------
    console.log("-------- RUNNING TESTS... --------");

    let mtrand = new MersenneTwister(1234567890);
    let allTimesTillContagious: number[] = [];
    let allTimesTillSymptoms: number[] = [];
    let allTimesTillRecovered: number[] = [];
    let allTimesTillDead: number[] = [];

    let numSamples = 1000;
    for (let i = 0; i < numSamples; i++) {
        let p = new Person(mtrand, i);
        p.becomeSick(null);
        let timeTillContagious = -1;
        let timeTillSymptoms = -1;
        let timeTillRecovered = -1;
        let timeTillDead = -1;
        for (let hour = 0; hour < 1000; hour++) {
            if (timeTillContagious < 0 && p.isContagious) timeTillContagious = p.time_since_infected;
            if (timeTillSymptoms < 0 && p.isShowingSymptoms) timeTillSymptoms = p.time_since_infected;
            if (timeTillRecovered < 0 && p.isRecovered) timeTillRecovered = p.time_since_infected;
            if (timeTillDead < 0 && p.dead) timeTillDead = p.time_since_infected;
            p.stepTime(null);
        }
        allTimesTillContagious.push(timeTillContagious);
        allTimesTillSymptoms.push(timeTillSymptoms);
        allTimesTillRecovered.push(timeTillRecovered);
        if (timeTillDead >= 0) allTimesTillDead.push(timeTillDead);
    }
    logStats(allTimesTillContagious, "Time till contagious (days)", 1.0/24.0);
    logStats(allTimesTillSymptoms, "Time till symptoms (days)", 1.0/24.0);
    logStats(allTimesTillRecovered, "Time till recovered (days)", 1.0/24.0);
    if (allTimesTillDead.length > 0) logStats(allTimesTillDead, "Time till dead (days)", 1.0/24.0);
    console.log("Total dead: " + allTimesTillDead.length + "   %" + 100.0 * allTimesTillDead.length / numSamples);
    console.log("-------- DONE TESTS --------");
    
}
