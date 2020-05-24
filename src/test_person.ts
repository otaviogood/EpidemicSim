import { create, all } from "mathjs";

const config = {};
const mathjs = create(all, config);

import RandomFast from "./random-fast";
import MersenneTwister from "mersenne-twister";
// https://github.com/boo1ean/mersenne-twister
// var MersenneTwister = require("mersenne-twister");

import { Sim } from "./sim";
import { Person, ActivityType } from "./person";
import * as Params from "./params";
import * as util from "./util";

function logStats(data: number[], message: string, multiplier: number = 1) {
    console.log(
        message +
            " mean: " +
            (mathjs.mean!(data) * multiplier).toFixed(3) +
            "  std: " +
            (mathjs.std!(data) * multiplier).toFixed(2) +
            "  min:" +
            (mathjs.min!(data) * multiplier).toFixed(3) +
            "  max:" +
            (mathjs.max!(data) * multiplier).toFixed(1)
    );
}

function check(condition: boolean, message: string) {
    if (!condition) alert(message);
}

export class StatsRecord {
    written: boolean = false;
    samples: number[] = [];

    static readonly fields = ["name", "mean", "std", "min", "max", "median", "occurrence"];

    constructor(public name: string, public conditionFunc: any) {}

    log(multiplier: number) {
        console.log(
            this.name +
                " mean: " +
                (mathjs.mean!(this.samples) * multiplier).toFixed(3) +
                "  std: " +
                (mathjs.std!(this.samples) * multiplier).toFixed(2) +
                "  min:" +
                (mathjs.min!(this.samples) * multiplier).toFixed(3) +
                "  max:" +
                (mathjs.max!(this.samples) * multiplier).toFixed(1)
        );
    }
    makeFrequencyCounts(multiplier: number = 1.0) {
        let freqs: any = {};
        for (let i = 0; i < this.samples.length; i++) {
            let t = this.samples[i] * multiplier;
            freqs[t] ? freqs[t]++ : (freqs[t] = 1);
        }
        return freqs;
    }
    makeStatsObject(multiplier: number = 1.0): any {
        // let freqs = this.makeFrequencyCounts();
        let scaled = mathjs.multiply!(this.samples, multiplier);
        let result = {
            name: this.name,
            mean: mathjs.mean!(scaled),
            std: mathjs.std!(scaled),
            min: mathjs.min!(scaled),
            max: mathjs.max!(scaled),
            median: mathjs.median!(scaled),
            occurrence: (scaled.length * 1.0) / TestPerson.numSamples,
        };
        return result;
    }
}

export class TestPerson {
    static readonly numSamples = 1000;
    selected: string = "";
    selectedStat: string = "";
    allStats: StatsRecord[] = [];
    runTests(params: Params.Base) {
        // ------------------ test Person virus model --------------------------
        console.log("-------- RUNNING " + TestPerson.numSamples + " TESTS... --------");

        let mtrand = new MersenneTwister(1234567890);
        this.allStats.push(new StatsRecord("Time till contagious", (p: Person) => p.isContagious));
        this.allStats.push(new StatsRecord("Time till symptoms", (p: Person) => p.isShowingSymptoms));
        this.allStats.push(new StatsRecord("Time till recovered", (p: Person) => p.isRecovered));
        this.allStats.push(new StatsRecord("Time till death", (p: Person) => p.dead));
        let allContagiousDurations: number[] = [];
        let allTimesTillSevere: number[] = []; // Also, critical. Also count # of severe and critical.

        for (let i = 0; i < TestPerson.numSamples; i++) {
            let p = new Person(params, mtrand, i);
            p.becomeSick(null);

            for (const stats of this.allStats) stats.written = false;

            for (let hour = 0; hour < 24 * 45; hour++) {
                for (const stats of this.allStats) {
                    if (!stats.written && stats.conditionFunc(p)) {
                        stats.samples.push(p.time_since_infected);
                        stats.written = true;
                    }
                }
                p.stepTime(null, mtrand);
            }
        }
        // for (const stats of this.allStats) stats.log(1.0 / 24.0);
        console.log("-------- DONE TESTS --------");
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
    drawHistogram(canvas: any) {
        if (!canvas) return;
        if (!canvas.getContext) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let width = canvas.width,
            height = canvas.height;
        let scale = 1.0; // 7.0 / 24.0; // 1 day = 7 pixels
        let scaley = 5.0;
        let maxRangeDays = 7 * 8;

        for (let i = 0; i < maxRangeDays; i++) {
            this.drawRect(ctx, i * 24 * scale, 0, 1, height, i % 7 == 0 ? "#405060" : "#304048");
            this.drawRect(ctx, i * 24 * scale, 0, 2, i % 7 == 0 ? 10 : 4, "#bbbbbb");
        }

        let i = 0;
        for (const stats of this.allStats) {
            let color = RandomFast.HashRGB(i + 15);
            if (this.selected != "") {
                if (stats.name == this.selected) color = "#ffffff";
                else continue;
            }

            ctx.fillStyle = color;
            let freqs = stats.makeFrequencyCounts();
            for (const key in freqs) {
                if (freqs.hasOwnProperty(key)) {
                    const val = freqs[key] * scaley;
                    const pos = parseFloat(key);
                    ctx.fillRect(pos * scale, height - val, 1, val);
                }
            }

            if (this.selectedStat && this.selectedStat != "") {
                let allStats = stats.makeStatsObject();
                if (this.selectedStat == "std") {
                    let min = allStats["min"];
                    let max = allStats["max"];
                    let mean = allStats["mean"];
                    let std = allStats["std"];
                    ctx.fillStyle = "#00ff4440";
                    ctx.beginPath();
                    let lastY = 0;
                    ctx.moveTo(min * scale, height);
                    for (let i = min; i <= max; i++) {
                        // TODO: actually draw the standard deviation lines
                        let y = (i - mean) / std;
                        y = Math.exp(-(y * y) / 2);  // https://en.wikipedia.org/wiki/Gaussian_function
                        y *= height / scaley;
                        ctx.lineTo(i * scale, height - y * scaley);
                        lastY = y;
                    }
                    ctx.lineTo(max * scale, height);
                    ctx.closePath();
                    ctx.fill();
                } else {
                    if (this.selectedStat != "occurrence") {
                        this.drawRect(ctx, allStats[this.selectedStat] * scale, 0, 2, height, "#00ff44");
                    }
                }
            }
            i++;
        }
    }
}
