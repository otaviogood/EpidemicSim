"use strict";
var assert = require("assert");
const fs = require("fs");
var flatbuffers = require("flatbuffers").flatbuffers;

class SimplePlace {
    lat=1000.0;
    lon=1000.0;
    capacity=0;
    residentCount=0;
    countyIndex=-1;
    xpos = -1;
    ypos = -1;
    name;

    constructor(lat, lon, capacity, countyIndex = -1) {
        assert(lat < 85.0 && lat > -85.0);  // realistically, we won't be doing antarctica or the north pole.
        assert(lon <= 180.0 && lon >= -180.0);
        this.lat = lat;
        this.lon = lon;
        this.capacity = capacity;
        this.countyIndex = countyIndex;
    }

    // latLonToPos(sim: Sim) {
    //     [this.xpos, this.ypos] = sim.latLonToPos(this.lat, this.lon);
    // }
    // static genPlace(sim: Sim, lat: any, lon: any, capacity: number): Place {
    //     let lat2: any = lat!;
    //     let lon2: any = lon!;
    //     let hh = new Place(parseFloat(lat2), parseFloat(lon2), capacity);
    //     hh.latLonToPos(sim);
    //     return hh;
    // }
}

function loadJSONObject(fname) {
    const fileContents = fs.readFileSync(fname, "utf8");
    try {
        return JSON.parse(fileContents);
    } catch (err) {
        console.error(err);
    }
}

function loadJSONMap(fname) {
    const fileContents = fs.readFileSync(fname, "utf8");
    try {
        return new Map(Object.entries(JSON.parse(fileContents)));
    } catch (err) {
        console.error(err);
    }
}

function saveJSONMap(fname, mapA) {
    const localNodes = JSON.stringify(Object.fromEntries(mapA));
    fs.writeFileSync(fname, localNodes);
}

class Box2 {
    min = [Number.MAX_VALUE, Number.MAX_VALUE];
    max = [-Number.MAX_VALUE, -Number.MAX_VALUE];

    get Min() {
        return min;
    }
    set Min(value) {
        min = value;
    }

    get Max() {
        return max;
    }
    set Max(value) {
        max = value;
    }

    static newBox(min, max) {
        this.min[0] = Math.min(min[0], max[0]);
        this.min[1] = Math.min(min[1], max[1]);
        this.max[0] = Math.max(min[0], max[0]);
        this.max[1] = Math.max(min[1], max[1]);
    }

    clone() {
        let b = new Box2();
        b.min = [this.min[0], this.min[1]];
        b.max = [this.max[0], this.max[1]];
        return b;
    }

    // public bool IsDefined()
    // { return ((min.x <= max.x) && (min.y <= max.y)); }

    mergePoint(point1) {
        this.min[0] = Math.min(this.min[0], point1[0]);
        this.min[1] = Math.min(this.min[1], point1[1]);
        this.max[0] = Math.max(this.max[0], point1[0]);
        this.max[1] = Math.max(this.max[1], point1[1]);
    }

    // public bool Intersects(Box2 box)
    // {
    //     if (!IsDefined()) return false;
    //     if (!box.IsDefined()) return false;
    //     if (max.x < box.min.x) return false;
    //     if (min.x > box.max.x) return false;
    //     if (max.y < box.min.y) return false;
    //     if (min.y > box.max.y) return false;
    //     return true;
    // }

    // public bool Surrounds(Box2 box)
    // {
    //     if (!IsDefined()) return false;
    //     if (!box.IsDefined()) return false;
    //     if (min.x > box.min.x) return false;
    //     if (min.y > box.min.y) return false;
    //     if (max.x < box.max.x) return false;
    //     if (max.y < box.max.y) return false;
    //     return true;
    // }

    // public bool Contains(float2 point)
    // {
    //     if (!IsDefined()) return false;
    //     if (min.x > point.x) return false;
    //     if (min.y > point.y) return false;
    //     if (max.x < point.x) return false;
    //     if (max.y < point.y) return false;
    //     return true;
    // }

    union(box) {
        this.mergePoint(box.min);
        this.mergePoint(box.max);
    }

    // public void Intersection(Box2 box)
    // {
    //     if (!Intersects(box))
    //     {
    //         SetUndefined();
    //         return;
    //     }
    //     min = min.Max(box.min);
    //     max = max.Min(box.max);
    // }

    GetCentroid() {
        return [(this.min[0] + this.max[0]) * 0.5, (this.min[1] + this.max[1]) * 0.5];
    }

    // public float2 Size()
    // {
    //     return max - min;
    // }
}

// Get dimensions of a multi-dimensional array
function getDim(a) {
    var dim = [];
    for (;;) {
        dim.push(a.length);

        if (Array.isArray(a[0])) {
            a = a[0];
        } else {
            break;
        }
    }
    return dim;
}

// Round a number up or down randomly, weighted by the fractional component
function roundRandom(rand, x) {
    let frac = x % 1;
    let r = rand.random();
    if (r < frac) return Math.floor(x) + 1;
    else return Math.floor(x);
}

function shuffleArrayInPlace(array, rand) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(rand.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function toDegrees(angle) {
    return angle * (180 / Math.PI);
}
function toRadians(angle) {
    return angle * (Math.PI / 180);
}

function loadFlatBuffer(filename) {
    let bufA = fs.readFileSync(filename, {encoding:null});
    return new flatbuffers.ByteBuffer(new Uint8Array(bufA));
}

function toRadians(angle) {
    return angle * 0.0174532925199;
}

class ProbabilityDistribution {
    probs = [];
    // Input is an array that will then be normalized to add to 1... a probability distribution.
    constructor(probs) {
        this.probs = probs.slice();
        // Normalize the distribution.
        let total = 0.0;
        for (let i = 0; i < this.probs.length; i++) {
            assert(this.probs[i] >= 0);
            total += this.probs[i];
        }
        assert(total > 0);
        for (let i = 0; i < this.probs.length; i++) {
            this.probs[i] /= total;
        }
    }

    sampleProbabilites(rand) {
        let r = rand.random();// rand.RandFloat();
        // probs needs to already be normalized.
        for (let i = 0; i < this.probs.length; i++) {
            let p = this.probs[i];
            if (r < p) return i;
            r -= p;
        }
        return this.probs.length - 1; // In theory, we shouldn't ever reach this return statement.
    }

    // static tests() {
    //     let rand = new RandomFast(12345);
    //     let pdf = new ProbabilityDistribution([1,2,30]);
    //     console.log(pdf.probs);
    //     for (let i = 0; i < 30; i++) {
    //         console.log(pdf.sampleProbabilites(rand));
    //     }
    // }
}

// Biased, but not much for small ranges.
function randint(rand, a, b) {
    let temp = rand.random_int31();
    return (temp % (b - a)) + a;
}

module.exports = { SimplePlace, loadJSONObject, loadJSONMap, saveJSONMap, Box2, getDim, roundRandom, shuffleArrayInPlace, toDegrees, toRadians, loadFlatBuffer, toRadians, ProbabilityDistribution, randint };
