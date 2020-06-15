import RandomFast from "./random-fast";
import MersenneTwister from "mersenne-twister";

export const MAX_32BIT_INTEGER = 0x7fffffff;

export enum VizFlags {
    pop10 = 1,
    homes = 2,
    offices = 4,
    hospitals = 8,
    supermarkets = 16,
    susceptible = 32,
    infected = 64,
    recovered = 128,
}

let alreadyAlerted = false;
export function assert(condition: boolean, message: string = "ERROR") {
    if (!condition) {
        console.log(message);
        if (!alreadyAlerted) window.alert(message);
        alreadyAlerted = true;
    }
    // throw message || "Assertion failed";
}

// Biased, but not much for small ranges.
export function randint(rand: RandomFast, a: number, b: number) {
    return rand.RandIntApprox(a, b);
    // let temp = rand.random_int31();
    // return (temp % (b - a)) + a;
}

export function Bernoulli(rand: RandomFast, prob: number): boolean {
    let r = rand.RandFloat();
    if (r < prob) return true;
    else return false;
}

// Input is an array that should be normalized to add up to 1... a probability distribution.
export function sampleProbabilites(rand: RandomFast, probs: number[]) {
    let r = rand.RandFloat();
    for (let i = 0; i < probs.length; i++) {
        let p = probs[i];
        if (r < p) return i;
        r -= p;
    }
    return probs.length - 1; // In theory, we shouldn't ever reach this return statement.
}

// Linear interpolate 2 values by the 'a' value
export function mix(f0: number, f1: number, a: number): number {
    return (1.0 - a) * f0 + a * f1;
}
// Polynomial smoothstep function to gently interpolate between 2 values based on a.
export function Smoothstep(f0: number, f1: number, a: number): number {
    a = Math.max(0.0, Math.min(1.0, a)); // Clamp [0..1] range
    return mix(f0, f1, a * a * (3.0 - 2.0 * a));
}
export function Smootherstep(f0: number, f1: number, x: number): number {
    x = Math.max(0.0, Math.min(1.0, x)); // Clamp [0..1] range
    let x3 = x * x * x;
    let x4 = x3 * x;
    let x5 = x4 * x;
    return mix(f0, f1, 6 * x5 - 15 * x4 + 10 * x3);
}

// Returns random number sampled from a circular gaussian distribution
// https://en.wikipedia.org/wiki/Box%E2%80%93Muller_transform
export function RandGaussian(rand: RandomFast, mean: number = 0.0, std: number = 1.0): [number, number] {
    const twoPi: number = 2.0 * Math.PI;
    let ux = rand.RandFloat();
    let uy = rand.RandFloat();
    ux = Math.max(ux, 0.00000003); // We don't want log() to fail because it's 0.
    let a: number = Math.sqrt(-2.0 * Math.log(ux));
    let x = a * Math.cos(twoPi * uy);
    let y = a * Math.sin(twoPi * uy);
    return [x * std + mean, y * std + mean];
}

export function clamp(x: number, minVal: number, maxVal: number) {
    assert(minVal <= maxVal, "ERROR: clamp params seem wrong. max should be > min.");
    return Math.max(minVal, Math.min(maxVal, x));
}

export function toRadians(angle: number): number {
    return angle * 0.0174532925199;
}

// TODO: What is the proper mathy name for this?
// If you sample this at every time step, there will be an equal probability at every time step of being true,
// and by the last timestep, you are guaranteed to have a true condition. You will not make it through to the other side and still be false.
// Math is like this:
// For a time span that is 2 long, the first step will be 0.5 probability, the next step will be 1.0.
// p = 1/2, 1
// For 3 long, it's like this... etc.
// p = 1/3, 1/2, 1
// p = 1/4, 1/3, 1/2, 1
export function evenDistributionInTimeRange(t0: number, t1: number, tNow: number, rand: RandomFast) {
    if (tNow < t0 || tNow > t1) return false;
    let p = 1.0 / (t1 - tNow);
    return Bernoulli(rand, p);
}

// ---------------- Non-math functions ----------------
export function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function shuffleArrayInPlace(array: any, rand: RandomFast) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(rand.RandFloat() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

export function fromHours(hours: number): number {
    return hours;
}
export function fromDays(days: number): number {
    return days * 24;
}

// ---------------- Canvas functions ----------------
export function drawRect(
    ctx: any,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string = "#ffffff",
    fill: boolean = true
) {
    if (fill) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, width, height);
    } else {
        ctx.strokeStyle = color;
        ctx.drawRect(x, y, width, height);
    }
}
export function drawText(ctx: any, x: number, y: number, text: string, size: number = 16, color: string = "rgb(255, 255, 255)") {
    ctx.fillStyle = color;
    ctx.font = size.toString() + "px sans-serif";
    ctx.fillText(text, x, y);
}

export function getPaletteBasic6(i: number): string {
    let p = ["#efef70", "#ef70ef", "#ef7070", "#70efef", "#70ef70", "#7070ef"];
    return p[i % p.length];
}
export function getPaletteHappy(i: number): string {
    let p = ["#f2bb07", "#f28322", "#f2622e", "#ff2635", "#b0d9bd", "#bd0835"];
    return p[i % p.length];
}
