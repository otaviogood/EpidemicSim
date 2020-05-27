import { create, all } from "mathjs";

const config = {};
const mathjs = create(all, config);

import RandomFast from "./random-fast";
import MersenneTwister from "mersenne-twister";
// https://github.com/boo1ean/mersenne-twister
// var MersenneTwister = require("mersenne-twister");

import { Sim } from "./sim";
import { Person, SymptomsLevels } from "./person";
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

let alreadyAlerted = false;
function check(condition: boolean, message: string) {
    if (!condition && !alreadyAlerted) {
        alert(message);
        alreadyAlerted = true;
    }
}

export class StatsRecord {
    written: boolean = false;
    samples: number[] = [];
    metricsObject: any; // This will be a dictionary (js object) with the different stats

    static readonly fields = ["name", "median", "mean", "std", "min", "max", "occurrence"];

    constructor(public name: string, public conditionFunc: any, public timeFunc: any = null) {}

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
    makeMetricsObject(multiplier: number = 1.0): any {
        // let freqs = this.makeFrequencyCounts();
        let scaled = mathjs.multiply!(this.samples, multiplier);
        this.metricsObject = { name: this.name, median: 0, mean: 0, std: 0, min: 0, max: 0, occurrence: 0 };
        if (scaled.length > 0) {
            this.metricsObject = {
                name: this.name,
                median: mathjs.median!(scaled),
                mean: mathjs.mean!(scaled),
                std: mathjs.std!(scaled),
                min: mathjs.min!(scaled),
                max: mathjs.max!(scaled),
                occurrence: (scaled.length * 1.0) / TestPerson.numSamples,
            };
        }

        return this.metricsObject;
    }
    checkStatsEventHappened(p: Person) {
        if (!this.written && this.conditionFunc(p)) {
            let timeStamp = p.time_since_infected;
            if (this.timeFunc != null) timeStamp = this.timeFunc(p);
            this.samples.push(timeStamp);
            this.written = true;
        }
    }
}

export class TestPerson {
    static readonly numSamples = 1000;
    selected: string = "";
    selectedStat: string = "";
    allStats: StatsRecord[] = [];
    getStat(name: string) {
        return this.allStats.find(a => a.name == name);
    }
    getMetric(name: string, metric: string) {
        return this.allStats.find(a => a.name == name)?.metricsObject[metric];
    }
    checkInRange(name: string, stat: string, range: number[], message: string) {
        check(this.getStat(name)?.metricsObject[stat] >= range[0], "ERROR (Stats check): " + message);
        check(this.getStat(name)?.metricsObject[stat] <= range[1], "ERROR (Stats check): " + message);
    }
    allChecks() {
        check(
            this.getMetric("Time till contagious", "std") < util.fromDays(2),
            "Time till contagious standard deviation is too big."
        );
        this.checkInRange(
            "Time till contagious",
            "mean",
            [util.fromDays(2.5), util.fromDays(3.5)],
            "Time till contagious is out of range."
        );
    }
    runTests(params: Params.Base) {
        // ------------------ test Person virus model --------------------------
        console.log("-------- RUNNING " + TestPerson.numSamples + " TESTS... --------");
        let timer = performance.now();

        let mtrand = new MersenneTwister(1234567890);
        this.allStats.push(new StatsRecord("Time till contagious", (p: Person) => p.isContagious));
        this.allStats.push(new StatsRecord("Time till symptoms", (p: Person) => p.isShowingSymptoms));
        this.allStats.push(new StatsRecord("Time till recovered", (p: Person) => p.isRecovered));
        this.allStats.push(new StatsRecord("Time till death", (p: Person) => p.dead));
        this.allStats.push(new StatsRecord("Time till severe", (p: Person) => p.symptomsCurrent >= SymptomsLevels.severe));
        this.allStats.push(new StatsRecord("Time till critical", (p: Person) => p.symptomsCurrent >= SymptomsLevels.critical));
        this.allStats.push(
            new StatsRecord(
                "Span of contagious",
                (p: Person) => p.isRecovered,
                (p: Person) => p.time_since_infected - p.contagiousTrigger
            )
        );

        for (let i = 0; i < TestPerson.numSamples; i++) {
            let p = new Person(params, mtrand, i);
            p.becomeSick(null);

            for (const stats of this.allStats) stats.written = false;

            for (let hour = 0; hour < 24 * 45; hour++) {
                for (let i = 0; i < this.allStats.length; i++) this.allStats[i].checkStatsEventHappened(p);
                p.stepTime(null, mtrand);
            }
        }
        for (const stats of this.allStats) stats.makeMetricsObject();

        this.allChecks();
        console.log("-------- DONE TESTS in " + (performance.now() - timer).toFixed(0) + "ms --------");
    }

    drawHistogram(canvas: any) {
        if (!canvas) return;
        if (!canvas.getContext) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let width = canvas.width,
            height = canvas.height;
        let scale = 2.0; // 7.0 / 24.0; // 1 day = 7 pixels
        let scaley = 5.0;
        let maxRangeDays = 7 * 8;

        for (let i = 0; i < maxRangeDays; i++) {
            util.drawRect(ctx, i * 24 * scale, 0, 1, height, i % 7 == 0 ? "#405060" : "#304048");
            util.drawRect(ctx, i * 24 * scale, 0, 2, i % 7 == 0 ? 10 : 4, "#bbbbbb");
        }
        util.drawText(ctx, width - 48, 24, "Days");

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
                    ctx.fillRect(pos * scale, height - val, Math.max(scale, 1), val);
                }
            }

            if (this.selectedStat && this.selectedStat != "") {
                let allStats = stats.makeMetricsObject();
                if (allStats["occurrence"] > 0) {
                    if (this.selectedStat == "std") {
                        let min = allStats["min"];
                        let max = allStats["max"];
                        let mean = allStats["mean"];
                        let std = allStats["std"];
                        // Draw a gaussian function just because I feel like it...
                        ctx.fillStyle = "#00ff4430";
                        ctx.beginPath();
                        let lastY = 0;
                        ctx.moveTo(min * scale, height);
                        for (let i = min; i <= max; i++) {
                            let y = (i - mean) / std;
                            y = Math.exp(-(y * y) / 2); // https://en.wikipedia.org/wiki/Gaussian_function
                            y *= height / scaley;
                            ctx.lineTo(i * scale, height - y * scaley);
                            lastY = y;
                        }
                        ctx.lineTo(max * scale, height);
                        ctx.closePath();
                        ctx.fill();
                        // Actually draw the standard deviation lines
                        util.drawRect(ctx, (mean + std) * scale, 0, 2, height, "#00ff44");
                        util.drawRect(ctx, (mean - std) * scale, 0, 2, height, "#00ff44");
                        util.drawRect(ctx, mean * scale, 0, 2, height * 0.1, "#00ff44");
                    } else {
                        if (this.selectedStat != "occurrence") {
                            util.drawRect(ctx, allStats[this.selectedStat] * scale, 0, 2, height, "#00ff44");
                        }
                    }
                }
            }
            i++;
        }
    }
}
