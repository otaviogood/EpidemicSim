import moment from "moment";
import * as Params from "./params";
const mapBounds = require("../utils/mapBounds");

// All the graphs need to be registered here.
export enum GraphType {
    startingPopulation = 0, // Population at the beginning before anyone dies
    totalInfected,
    currentInfected,
    totalDead,
}
const graphNames: string[] = ["Population @T-0", "Total Infected", "Current Infected", "Total Dead"];

// graph colors
function getPalette(i: number): string {
    let p = ["#ffffff", "#f2bb07", "#f28322", "#f2622e", "#ff2635", "#b0d9bd", "#bd0835"];
    return p[i % p.length];
}

// This keeps track of results, like number of people infected. It also keeps an array so
// I can draw graphs of all the values over time.
export class CountyStats {
    // Accumulators that keep track of values like (number of infected) going up and down
    // County indexes -> GraphType (index) -> counts of the data
    counters: number[][] = [];

    // County indexes -> names -> array data
    timeSeries: Map<number, Map<string, number[]>> = new Map<number, Map<string, number[]>>();
    // Allocate the multidimensional array so i don't have to keep checking if it exists.
    init(numCounties: number) {
        for (let i = 0; i < numCounties; i++) {
            this.counters.push([]);
            for (let gt in GraphType) {
                if (!isNaN(Number(gt))) {
                    this.counters[i].push(0);
                }
            }
        }
    }
    append(county: number, name: string, val: number) {
        if (!this.timeSeries.has(county)) {
            this.timeSeries.set(county, new Map<string, number[]>());
        }
        let local = this.timeSeries.get(county);
        if (!local?.has(name)) {
            local?.set(name, []);
        }
        local?.get(name)?.push(val);
    }
    // Copy the counters data into the time series for graphing
    updateTimeSeriesFromCounters() {
        for (let i = 0; i < this.counters.length; i++) {
            let county = this.counters[i];
            for (let j = 0; j < county.length; j++) {
                this.append(i, graphNames[j], this.counters[i][j]);
            }
        }
    }
    numInfected() {
        let total: number = 0;
        for (let i = 0; i < this.counters.length; i++) {
            let county = this.counters[i];
            total += county[GraphType.currentInfected];
        }
        return total;
    }
    drawGraph(countyIndex: number, params: Params.Base) {
        const canvas = <HTMLCanvasElement>document.getElementById("graph-canvas");
        if (canvas.getContext) {
            let cHeight = canvas.height;
            let cWidth = canvas.width;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = "16px sans-serif";

            let countyGraph = this.timeSeries.get(countyIndex);
            if (!countyGraph) return;
            const countyPopulation = this.counters[countyIndex][GraphType.startingPopulation];
            let scaley = (cHeight * 1.0) / countyPopulation;
            let skipX = 24; // Only draw once per day.

            // Make vertical calendar stripes to indicate months
            ctx.fillStyle = "#184062";
            ctx.fillRect(31, 0, 29, cHeight); // jan-feb
            ctx.fillRect(31 + 29 + 31, 0, 30, cHeight); // mar-apr
            ctx.fillRect(31 + 29 + 31 + 30 + 31, 0, 30, cHeight); // may-jun
            ctx.fillRect(31 + 29 + 31 + 30 + 31 + 30 + 31, 0, 31, cHeight); // jul-aug
            ctx.fillRect(31 + 29 + 31 + 30 + 31 + 30 + 31 + 31 + 30, 0, 31, cHeight); // sep-oct
            ctx.fillRect(31 + 29 + 31 + 30 + 31 + 30 + 31 + 31 + 30 + 31 + 30, 0, 31, cHeight); // nov-dec
            // Draw the first letter of each month in the correct x-position
            const months = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
            ctx.fillStyle = "#386082";
            for (let i = 0; i < months.length; i++) {
                ctx.fillText(months[i], i * 30.4 + 10, cHeight - 4);
            }
            // Draw a current-time cursor at the top
            ctx.fillStyle = "#888888";
            let currentDay = moment(params.startDate).dayOfYear() + this.timeSeries.get(0)?.get(graphNames[0])?.length! / skipX;
            ctx.fillRect(currentDay - 1, 0, 2, cHeight / 10);

            ctx.lineWidth = 2;
            ctx.textAlign = "end";
            let graphIndex = 0;
            for (const [name, arr] of countyGraph) {
                ctx.fillStyle = getPalette(graphIndex);
                ctx.fillText(name + ": " + arr[arr.length - 1].toFixed(0), cWidth - 8, 20 + graphIndex * 20);

                if (graphIndex > 0) {
                    // Don't graph population because it's constant
                    ctx.strokeStyle = getPalette(graphIndex);
                    ctx.beginPath();
                    // ctx.moveTo(, );
                    let xpos = params.startDate.dayOfYear();
                    for (let i = 0; i < arr.length; i += skipX) {
                        ctx.lineTo(xpos, cHeight - arr[i] * scaley);
                        xpos++;
                    }
                    ctx.stroke();
                }
                graphIndex++;
            }

            ctx.lineWidth = 1;
            ctx.textAlign = "start";
        }
    }
}
