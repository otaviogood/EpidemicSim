import "@babel/polyfill"; // This is for using ES2017 features, like async/await.
import moment from "moment";
import { Person, ActivityType } from "./person";
import { Spatial, Grid } from "./spatial";
import { CountyStats, GraphType } from "./county-stats";
import * as Params from "./params";
import * as util from "./util";
// https://github.com/boo1ean/mersenne-twister
import MersenneTwister from "mersenne-twister";
import RandomFast from "./random-fast";
import Module from "./generated_wasm/resident_counter";
var moduleInstance: any = null;
// import latlons from "../../contact_tracing/devon_since_feb.json";
// const allLocations = (<any>latlons).locations;
// console.log(allLocations);

var flatbuffers = require("flatbuffers").flatbuffers;
var FlatbufPlaces = require("../utils/flatbuffers/households_generated").Flatbuf; // Generated by flatc compiler.
// import { Flatbuf } from '../utils/flatbuffers/households_generated';

const mapBounds = require("../utils/mapBounds");

class Place {
    xpos: number = 0;
    ypos: number = 0;
    residents: number[] = [];
    currentOccupants: number[] = [];

    constructor(readonly lat: number, readonly lon: number, readonly capacity: number, readonly county: number = -1) {}

    latLonToPos(sim: Sim) {
        [this.xpos, this.ypos] = sim.latLonToPos(this.lat, this.lon);
    }
    static genPlace(sim: Sim, lat: any, lon: any, capacity: number): Place {
        let lat2: any = lat!;
        let lon2: any = lon!;
        let hh = new Place(parseFloat(lat2), parseFloat(lon2), capacity);
        hh.latLonToPos(sim);
        return hh;
    }
}

var img: any;
export function loadImage(url: string) {
    return new Promise(r => {
        console.log("Loading: " + url);
        let i = new Image();
        i.onload = () => r(i);
        i.src = url;
        // if (i.width == 0) alert("ERROR: Probably couldn't load jpg map image.");
    });
}

export class Sim {
    params: Params.Base;
    rand: RandomFast;
    pop: Person[] = [];

    allHouseholds: Place[] = [];
    allOffices: Place[] = [];
    allSuperMarkets: Place[] = [];
    allHospitals: Place[] = [];
    supermarketJSON: any;
    latMin: number = 0;
    latMax: number = 0;
    lonMin: number = 0;
    lonMax: number = 0;
    latAdjust: number = 0;
    countyPolygons: number[][] = [];
    allCountyBounds: any = [];

    time_steps_since_start: Params.TimeStep = new Params.TimeStep();

    selectedHouseholdIndex = -1;
    selectedPersonIndex = 0;
    lastMouseX = -1;
    lastMouseY = -1;
    selectedCountyIndex = -1;

    wasmSim: any = null;
    useWasmSim: boolean = true; // turn WASM sim backend on via this flag

    // ---- visuals ----
    canvasWidth = 0;
    canvasHeight = 0;
    scalex = 1;
    scaley = 1;
    paused = false;
    infectedVisuals: any[][] = [];
    visualsFlag = 0;
    countyStats: CountyStats = new CountyStats();

    constructor(params: Params.Base) {
        this.params = params;
        // this.rand = new MersenneTwister(params.randomSeed);
        this.rand = new RandomFast(params.randomSeed);
    }
    // Normalizes positions so they are in the [0..1] range on x and y.
    // Returns [x, y] tuple.
    latLonToPos(lat: number, lon: number): number[] {
        let maxDelta = Math.max(this.lonMax - this.lonMin, (this.latMax - this.latMin) / this.latAdjust);
        let xpos = (lon - this.lonMin) / maxDelta;
        let ypos = (this.latMax - lat) / maxDelta; // Flip and make it relative to the top since graphics coords are from upper-left
        ypos /= this.latAdjust; // Adjust for curved earth
        return [xpos, ypos];
    }
    latLonDistKm(latA: number, lonA: number, latB: number, lonB: number): number {
        let dx = (lonB - lonA) * this.latAdjust;
        let dy = latB - latA;
        let dx_km = dx * 111.32;
        let dy_km = dy * 110.574;
        return Math.sqrt(dx_km * dx_km + dy_km * dy_km);
    }

    async setup() {
        console.log("-------- SETUP --------");
        // Load lat/lon bounds
        let jsonTemp1 = await fetch("datafiles/" + mapBounds.defaultPlace + "_AllCountyBounds.json");
        this.allCountyBounds = await jsonTemp1.json();
        // -1 indexes the bounds for all the counties, not just one.
        this.latMin = this.allCountyBounds["-1"]["min"][0];
        this.latMax = this.allCountyBounds["-1"]["max"][0];
        this.lonMin = this.allCountyBounds["-1"]["min"][1];
        this.lonMax = this.allCountyBounds["-1"]["max"][1];
        this.latAdjust = Math.cos(util.toRadians((this.latMin + this.latMax) * 0.5)); // Adjust for curved earth (approximately with a point)

        // TODO: use promise.all() on all these awaits???
        img = await loadImage("datafiles/" + mapBounds.info[mapBounds.defaultPlace].mapImage);

        // -------- Load county polygon info --------
        let jsonTemp0 = await fetch("datafiles/" + mapBounds.defaultPlace + "_CountyPolygons.json");
        this.countyPolygons = await jsonTemp0.json();

        // -------- Load HOUSE position and size data --------
        let jsonTempA = await fetch("datafiles/" + mapBounds.defaultPlace + "_Supermarkets.json");
        this.supermarketJSON = await jsonTempA.json();

        let jsonTempB = await fetch("datafiles/" + mapBounds.defaultPlace + "_Hospitals.json");
        let hospitalJSON = await jsonTempB.json();

        // -------- Load HOUSE position and size data --------
        // let timer = performance.now();
        // let jsonTempF = await fetch("datafiles/" + mapBounds.defaultPlace + "_Households.fb");
        // let homeDataAB = await jsonTempF.arrayBuffer();
        // let buf = new flatbuffers.ByteBuffer(new Uint8Array(homeDataAB));
        // // Get an accessor to the root object inside the buffer.
        // let hhi = FlatbufPlaces.PlaceArray.getRootAsPlaceArray(buf);
        // let placeLen = hhi.placeLength();
        // this.allHouseholds = [];
        // for (let i = 0; i < placeLen; i++) {
        //     let one = hhi.place(i);
        //     this.allHouseholds.push(new Place(one.lat(), one.lon(), one.capacity(), one.countyIndex()));
        // }
        // let totalHomeCapacity = hhi.totalHomeCapacity();
        // console.log("loaded homes in: " + (performance.now() - timer).toFixed(0) + "ms");

        let timer = performance.now();
        let jsonTemp = await fetch("datafiles/" + mapBounds.defaultPlace + "_Households.json");
        let homeDataJSON = await jsonTemp.json();
        this.allHouseholds = [];
        let totalHomeCapacity = 0;
        for (const p of homeDataJSON) {
            this.allHouseholds.push(new Place(p[0], p[1], p[2], p[3]));
            totalHomeCapacity += p[2];
        }
        console.log("loaded homes in: " + (performance.now() - timer).toFixed(0) + "ms");

        console.log("Total home capacity from file: " + totalHomeCapacity);
        console.log("Total households: " + this.allHouseholds.length);
        console.log("Average household size: " + totalHomeCapacity / this.allHouseholds.length);

        // -------- Load OFFICE position and size data --------
        let jsonTempJ = await fetch("datafiles/" + mapBounds.defaultPlace + "_Offices.json");
        let officeDataJSON = await jsonTempJ.json();
        this.allOffices = [];
        let totalOfficeCapacity = 0;
        for (const p of officeDataJSON) {
            this.allOffices.push(new Place(p[0], p[1], p[2]));
            totalOfficeCapacity += p[2];
        }
        console.log("Total office capacity from file: " + totalOfficeCapacity);
        console.log("Total offices: " + this.allOffices.length);
        console.log("Average office size: " + totalOfficeCapacity / this.allOffices.length);

        for (const sm of this.supermarketJSON) this.allSuperMarkets.push(Place.genPlace(this, sm[0], sm[1], 200)); // TODO: supermarket capacity???
        for (const h of hospitalJSON) this.allHospitals.push(Place.genPlace(this, h[0], h[1], 200)); // TODO: hospital capacity???

        util.shuffleArrayInPlace(this.allHouseholds, this.rand);
        for (let i = 0; i < this.allHouseholds.length; i++) this.allHouseholds[i].latLonToPos(this);
        util.shuffleArrayInPlace(this.allOffices, this.rand);
        for (let i = 0; i < this.allOffices.length; i++) this.allOffices[i].latLonToPos(this);

        this.countyStats.init(mapBounds.info[mapBounds.defaultPlace].includedCounties.length);

        // Allocate people to their houses and offices.
        console.log("Generating people data...");

        let householdIndex = 0;
        const numHouses = this.allHouseholds.length;
        let done = false;
        let i = 0;

        let totalCommuteDistance = 0.0;
        while (!done) {
            let person = new Person(this.params, this.rand, this.pop.length);
            // Assign a random household, without overflowing the capacity
            let hh = this.allHouseholds[householdIndex];
            if (hh.residents.length >= hh.capacity) {
                householdIndex++;
                if (householdIndex == this.allHouseholds.length - 1) done = true;
                hh = this.allHouseholds[householdIndex];
            }
            hh.residents.push(this.pop.length);
            person.xpos = hh.xpos;
            person.ypos = hh.ypos;
            person.homeIndex = householdIndex;
            person.county = hh.county;
            if (person.county >= 0) this.countyStats.counters[person.county][GraphType.startingPopulation]++;

            // Assign a random office
            let randOff = RandomFast.HashIntApprox(i, 0, this.allOffices.length);
            let office = this.allOffices[randOff];
            // If the office is over capacity, do one extra try to find another office.
            // This will let offices go over capacity sometimes, but that's probably ok.
            if (office.residents.length >= office.capacity) {
                randOff = RandomFast.HashIntApprox(-i, 0, this.allOffices.length);
                office = this.allOffices[randOff];
            }
            office.residents.push(this.pop.length);
            person.officeIndex = randOff;
            let officePos = this.allOffices[person.officeIndex];
            let homePos = this.allHouseholds[person.homeIndex];
            totalCommuteDistance += this.latLonDistKm(officePos.lat, officePos.lon, homePos.lat, homePos.lon);

            
            // Assign a semi-random, but close-to-your-house supermarket as your favorite place to go
            let randMarket = this.rand.RandIntApprox(0, this.allSuperMarkets.length);
            let marketDist = Number.MAX_VALUE;
            // Gotta get spatial data structure to work so i can query for nearest things. This is a hacky patchy job for now...
            for (let j = 0; j < 20; j++) {
                let market = this.allSuperMarkets[randMarket];
                let dx = person.xpos - market.xpos;
                let dy = person.ypos - market.ypos;
                let distSq = dx * dx + dy * dy;
                if (distSq < marketDist) {
                    marketDist = distSq;
                    person.marketIndex = randMarket;
                }
                randMarket = this.rand.RandIntApprox(0, this.allSuperMarkets.length);
            }
            this.allSuperMarkets[randMarket].residents.push(this.pop.length);

            // Assign a semi-random, but close-to-your-house hospital as your favorite place to go
            let randHospital = this.rand.RandIntApprox(0, this.allHospitals.length);
            let hospitalDist = Number.MAX_VALUE;
            // Gotta get spatial data structure to work so i can query for nearest things. This is a hacky patchy job for now...
            for (let j = 0; j < 5; j++) {
                let hospital = this.allHospitals[randHospital];
                let dx = person.xpos - hospital.xpos;
                let dy = person.ypos - hospital.ypos;
                let distSq = dx * dx + dy * dy;
                if (distSq < hospitalDist) {
                    hospitalDist = distSq;
                    person.hospitalIndex = randHospital;
                }
                randHospital = this.rand.RandIntApprox(0, this.allHospitals.length);
            }

            this.pop.push(person);
            i++;
        }
        console.log("total people: " + this.pop.length);
        console.log("used homes: " + householdIndex);
        console.log("Average commute distance: " + (totalCommuteDistance / this.pop.length).toFixed(2) + "km");

        if (this.useWasmSim) {
            await this.initWasmSim();
        } else {
            for (var j = 0; j < this.pop.length; j++) {
                this.pop[j].init(this.params, this.rand);
            }
        }
        // console.log("used offices: " + officeIndex);

        // this.pop.index(1).occupation = 1;
        // let near = this.pop.findKNearest(1, 4);
        // for (let i = 0; i < near.length; i++) {
        //     this.pop.index(near[i]).occupation = 2;
        // }
        // this.pop.index(near).occupation = 2;
        // for (let i = 0; i < 31; i++) {
        //     this.pop[i].becomeSick(this);
        // }

        this.pop[this.selectedPersonIndex].drawTimeline(<HTMLCanvasElement>document.getElementById("timeline-canvas"));
        window.requestAnimationFrame(() => this.draw());
    }

    async testRNG() {
        console.log("Testing RNG implementations");

        let tsRand = new RandomFast(this.params.randomSeed);
        let wasmRand = new moduleInstance.RandomFast(this.params.randomSeed);
        let ntrials = 10;

        console.log("RandomFast.SmallHashA");
        for (let i = 0; i < ntrials; i++) {
            // console.log(i + " ts= " + RandomFast.SmallHashA(i) + "wasm=" + moduleInstance.RandomFast.SmallHashA(i));
            util.assert(RandomFast.SmallHashA(i) === moduleInstance.RandomFast.SmallHashA(i), "smallhash error");
        }

        console.log("RandFloat");
        for (let i = 0; i < ntrials; i++) {
            // console.log(i + " ts= " + tsRand.RandFloat() + "wasm=" + wasmRand.RandFloat());
            util.assert(tsRand.RandFloat() === wasmRand.RandFloat(), "randfloat error");
        }

        console.log("HashIntApprox");
        for (let i = 0; i < ntrials; i++) {
            // console.log(i + " ts= " + RandomFast.HashIntApprox(i, 0, 10000) + "wasm=" + moduleInstance.RandomFast.HashIntApprox(i, 0, 10000));
            util.assert(RandomFast.HashIntApprox(i, 0, 1000000) === moduleInstance.RandomFast.HashIntApprox(i, 0, 1000000));
        }

        // Test overhead of wasm call. Seems too big to call small functions. :(
        // C++ function should be faster if no overhead because JS does inefficient multiplies.
        ntrials = 100;
        let total = 0.0;
        let timer = performance.now();
        for (let i = 0; i < ntrials; i++) total += tsRand.RandFloat();
        console.log("ts   rand: " + (performance.now() - timer).toFixed(0) + "ms " + total.toFixed(2)); // 150 ms for 10 mil iterations

        total = 0.0;
        timer = performance.now();
        for (let i = 0; i < ntrials; i++) total += wasmRand.RandFloat();
        console.log("wasm rand: " + (performance.now() - timer).toFixed(0) + "ms " + total.toFixed(2)); // 900 ms for 10 mil iterations
    }

    async initWasmSim() {
        this.paused = true; // locks the sim while loading
        console.log("Loading wasm module");
        await Module().then(function(loadedModule: any) {
            moduleInstance = loadedModule;
        });
        console.log("Loaded wasm module");
        this.paused = false;

        // test RNG
        await this.testRNG();

        // sets up the activities
        for (var j = 0; j < Person.activitiesNormal.length; j++) {
            moduleInstance.Sim.registerNormalActivitySchedule(Person.activitiesNormal[j]);
        }
        for (var j = 0; j < Person.activitiesWhileSick.length; j++) {
            moduleInstance.Sim.registerSickActivitySchedule(Person.activitiesWhileSick[j]);
        }

        this.wasmSim = new moduleInstance.Sim(this.pop.length);
        this.wasmSim.setNumberOfPlacesForActivity("h", this.allHouseholds.length, this.params.home_density);
        this.wasmSim.setNumberOfPlacesForActivity("w", this.allOffices.length, this.params.office_density);
        this.wasmSim.setNumberOfPlacesForActivity("s", this.allSuperMarkets.length, this.params.shopping_density);
        // not used in reference js yet: this.occupantCounter.setNumberOfPlacesForActivity('o', this.allHospitals.length);

        for (var j = 0; j < this.pop.length; j++) {
            let person: Person = this.pop[j];
            var placeIndexArray = new moduleInstance.int_vector();
            placeIndexArray.push_back(person.homeIndex);
            placeIndexArray.push_back(person.officeIndex);
            placeIndexArray.push_back(person.marketIndex);
            //placeIndexArray.push_back(person.hospitalIndex);
            this.wasmSim.addPerson(
                new moduleInstance.PersonCore(person.id, placeIndexArray, person.getPersonDefaultRoutineIndex())
            );
            placeIndexArray.delete(); // annoying!
        }

        console.log("associateWasmSimAndInit start");

        for (var j = 0; j < this.pop.length; j++) {
            this.pop[j].associateWasmSimAndInit(this.wasmSim, this.params, this.rand);
        }

        this.wasmSim.prepare();

        console.log("associateWasmSimAndInit finish");
    }

    // Infect someone RANDOM in a certain county. This is just for getting things started.
    seedInfection(countyIndex: number) {
        let i = util.randint(this.rand, 0, this.pop.length);
        while (this.pop[i].county != countyIndex && this.pop[i].isVulnerable) i = util.randint(this.rand, 0, this.pop.length);
        this.pop[i].becomeSick(this);
    }

    clearOccupants() {
        for (let i = 0; i < this.allHouseholds.length; i++) this.allHouseholds[i].currentOccupants = [];
        for (let i = 0; i < this.allOffices.length; i++) this.allOffices[i].currentOccupants = [];
        for (let i = 0; i < this.allSuperMarkets.length; i++) this.allSuperMarkets[i].currentOccupants = [];
    }
    // Allocate all the people to the places they will occupy for this timestep.
    occupyPlaces() {
        this.clearOccupants();
        let currentStep = this.time_steps_since_start.getStepModDay();
        for (let i = 0; i < this.pop.length; i++) {
            let person = this.pop[i];
            // Sets activity for this time step
            let activity = person.getCurrentActivity(currentStep);
            // person.currentActivity = activity;
            if (activity == ActivityType.home) {
                this.allHouseholds[person.homeIndex].currentOccupants.push(i);
            } else if (activity == ActivityType.work) {
                this.allOffices[person.officeIndex].currentOccupants.push(i);
            } else if (activity == ActivityType.shopping) {
                this.allSuperMarkets[person.marketIndex].currentOccupants.push(i);
            }
        }
    }
    run_simulation(num_time_steps: number) {
        if (this.useWasmSim) {
            this.runWasmSimulation(num_time_steps);
            return;
        }
        for (let ts = 0; ts < num_time_steps; ts++) {
            this.params.doInterventionsForThisTimestep(this);
            this.occupyPlaces();
            for (let i = 0; i < this.pop.length; i++) {
                let person = this.pop[i];
                person.stepTime(this, this.rand);
                person.spread(this.time_steps_since_start, i, this.pop, this.rand, this);
            }
            this.time_steps_since_start.increment();

            // Update graphs with latest stats
            this.countyStats.updateTimeSeriesFromCounters();
        }
    }

    runWasmSimulation(num_time_steps: number) {
        for (let ts = 0; ts < num_time_steps; ts++) {
            this.params.doInterventionsForThisTimestep(this);

            // occupy places
            let currentStep = this.time_steps_since_start.getStepModDay();
            this.wasmSim.getOccupantCounter().countAndFillLists(currentStep);

            // calls wasm sim backend
            this.wasmSim.runPopulationStep(this.time_steps_since_start.raw);

            // update stats, given output of wasm sim
            var arr = this.wasmSim.lastStepInfected;
            for (let i = 0; i < arr.size(); i++) {
                let p = this.pop[arr.get(i)];
                this.countyStats.counters[p.county][GraphType.totalInfected]++;
                this.countyStats.counters[p.county][GraphType.currentInfected]++;
            }
            arr.delete();

            arr = this.wasmSim.lastStepRecovered;
            for (let i = 0; i < arr.size(); i++) {
                let p = this.pop[arr.get(i)];
                this.countyStats.counters[p.county][GraphType.currentInfected]--;
            }
            arr.delete();

            arr = this.wasmSim.lastStepDead;
            for (let i = 0; i < arr.size(); i++) {
                let p = this.pop[arr.get(i)];
                this.countyStats.counters[p.county][GraphType.totalDead]++;
                this.countyStats.counters[p.county][GraphType.currentInfected]--;
            }
            arr.delete();

            this.time_steps_since_start.increment();

            // Update graphs with latest stats
            this.countyStats.updateTimeSeriesFromCounters();
        }
    }

    drawLine(ctx: any, x0: number, y0: number, x1: number, y1: number, color: string) {
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(x0 * this.scalex, y0 * this.scaley);
        ctx.lineTo(x1 * this.scalex, y1 * this.scaley);
        ctx.closePath();
        ctx.stroke();
    }

    drawText(ctx: any, x: number, y: number, text: string, size: number = 16, color: string = "rgb(255, 255, 255)") {
        ctx.fillStyle = color;
        ctx.font = size.toString() + "px sans-serif";
        ctx.fillText(text, x * this.scalex, y * this.scaley);
    }

    drawCircle(ctx: any, x: number, y: number, radius: number, color: string = "rgb(255, 255, 255)", fill: boolean = true) {
        ctx.beginPath();
        ctx.arc(x * this.scalex, y * this.scaley, radius, 0, 2 * Math.PI);
        ctx.closePath();
        if (fill) {
            ctx.fillStyle = color;
            ctx.fill();
        } else {
            ctx.strokeStyle = color;
            ctx.stroke();
        }
    }

    drawRect(
        ctx: any,
        x: number,
        y: number,
        width: number,
        height: number,
        color: string = "rgb(255, 255, 255)",
        fill: boolean = true
    ) {
        if (fill) {
            ctx.fillStyle = color;
            ctx.fillRect(x * this.scalex, y * this.scaley, width * this.scalex, height * this.scaley);
        } else {
            ctx.strokeStyle = color;
            ctx.drawRect(x * this.scalex, y * this.scaley, width * this.scalex, height * this.scaley);
        }
    }

    draw() {
        const canvas = <HTMLCanvasElement>document.getElementById("map-canvas");
        if (canvas.getContext) {
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            // ctx.setTransform(this.zoom, 0, 0, this.zoom, this.centerx-canvas.width*0.5, this.centery-canvas.height*0.5);

            // Store the current transformation matrix
            ctx.save();
            // Use the identity matrix while clearing the canvas
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // Restore the transform
            ctx.restore();

            let imgWidth: number = img.width;
            let imgHeight: number = img.height;
            let imgMax = Math.max(imgWidth, imgHeight);
            let maxCanvas = Math.max(canvas.width, canvas.height);
            let ratio = maxCanvas / imgMax;
            [this.canvasWidth, this.canvasHeight] = [canvas.width, canvas.height];
            this.scalex = maxCanvas;
            this.scaley = maxCanvas;

            ctx.globalAlpha = 0.5;
            if (this.visualsFlag > 0) ctx.globalAlpha = 0.25;
            ctx.drawImage(img, 0, 0, imgWidth * ratio, imgHeight * ratio);
            ctx.globalAlpha = 1.0;

            // Draw selected county polygon outline and fill
            if (this.selectedCountyIndex >= 0) {
                ctx.lineWidth = 3;
                ctx.fillStyle = "#00ff4410";
                ctx.beginPath();
                // TODO: This is slow to convert latlon every draw. fixme.
                let poly: any = this.countyPolygons[this.selectedCountyIndex];
                let lastPos = this.latLonToPos(poly[0][0], poly[0][1]);
                ctx.moveTo(lastPos[0] * this.scalex, lastPos[1] * this.scaley);
                for (let i = 0; i < poly.length; i++) {
                    let pos = this.latLonToPos(poly[i][0], poly[i][1]);
                    ctx.lineTo(pos[0] * this.scalex, pos[1] * this.scaley);
                    lastPos = pos;
                }
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = "#ff700a";
                ctx.stroke();
                ctx.lineWidth = 1.0;
            }

            // ---- Draw selected *household* info ----
            if (this.selectedHouseholdIndex >= 0) {
                let hh: Place = this.allHouseholds[this.selectedHouseholdIndex];

                this.drawCircle(ctx, hh.xpos, hh.ypos, 8, "rgb(255,128,0)", false);

                this.drawText(ctx, hh.xpos + 0.02, hh.ypos, hh.residents.length.toString());
                for (let i = 0; i < hh.residents.length; i++) {
                    let popIndex = hh.residents[i];
                    let person: Person = this.pop[popIndex];
                    let office = this.allOffices[person.officeIndex];
                    let market = this.allSuperMarkets[person.marketIndex];
                    this.drawLine(
                        ctx,
                        hh.xpos + RandomFast.HashFloat(i) * 0.02 - 0.01,
                        hh.ypos + RandomFast.HashFloat(i + 1000) * 0.02 - 0.01,
                        market.xpos,
                        market.ypos,
                        RandomFast.HashRGB(i)
                    );
                }
            }
            // ---- Draw selected *person*'s places ----
            if (this.selectedPersonIndex >= 0) {
                let p: Person = this.pop[this.selectedPersonIndex];
                let market = this.allSuperMarkets[p.marketIndex];
                let house = this.allHouseholds[p.homeIndex];
                let office = this.allOffices[p.officeIndex];
                let hospital = this.allHospitals[p.hospitalIndex];

                let currentStep = this.time_steps_since_start.getStepModDay();  // Should this be time_step - 1????
                let activity = p.getCurrentActivity(currentStep);
                // let activity = p.currentActivity;
                let localx: number = house.xpos;
                let localy: number = house.ypos;
                if (activity == ActivityType.work) (localx = office.xpos), (localy = office.ypos);
                if (activity == ActivityType.shopping) (localx = market.xpos), (localy = market.ypos);
                if (activity == ActivityType.hospital) (localx = hospital.xpos), (localy = hospital.ypos);
                p.xpos = (p.xpos + localx) * 0.5;
                p.ypos = (p.ypos + localy) * 0.5;
                let px = p.xpos;
                let py = p.ypos;

                this.drawLine(ctx, px, py, market.xpos, market.ypos, "rgba(60, 255, 60, 0.5)");
                this.drawLine(ctx, px, py, house.xpos, house.ypos, "rgba(0, 0, 0, 0.5)");
                this.drawLine(ctx, px, py, office.xpos, office.ypos, "rgba(160, 160, 160, 0.5)");
                this.drawLine(ctx, px, py, hospital.xpos, hospital.ypos, "rgba(255, 25, 20, 0.5)");
                this.drawText(ctx, market.xpos - 0.0125, market.ypos, "🏪");
                this.drawText(ctx, house.xpos - 0.0125, house.ypos, "🏡");
                this.drawText(ctx, office.xpos - 0.0125, office.ypos, "🏢");
                this.drawText(ctx, hospital.xpos - 0.0125, hospital.ypos, "🏥");
                this.drawText(ctx, px, py, "😃");
            }

            if ((this.visualsFlag & util.VizFlags.pop10) != 0) {
                // Rendering is by far the bottleneck, so target this many rendered points and skip the rest.
                let skip = 10;
                for (let i = 0; i < this.pop.length; i += skip) {
                    let person = this.pop[i];
                    let pos = [person.xpos, person.ypos];
                    let currentStep = this.time_steps_since_start.getStepModDay();  // Should this be time_step - 1????
                    let activity = person.getCurrentActivity(currentStep);
                    // let activity = person.currentActivity;
                    if (activity == ActivityType.home) {
                        let p = this.allHouseholds[person.homeIndex];
                        pos = [p.xpos, p.ypos];
                        ctx.fillStyle = "#ccbb50";
                    } else if (activity == ActivityType.work) {
                        let p = this.allOffices[person.officeIndex];
                        pos = [p.xpos, p.ypos];
                        ctx.fillStyle = "#00bbff";
                    } else if (activity == ActivityType.shopping) {
                        let p = this.allSuperMarkets[person.marketIndex];
                        pos = [p.xpos, p.ypos];
                        ctx.fillStyle = "#88ff88";
                    } else {
                        ctx.fillStyle = "#dd8888";
                    }

                    ctx.fillRect(pos[0] * this.scalex, pos[1] * this.scaley, 1, 1);
                }
            }
            ctx.fillStyle = "#ffffff";
            if ((this.visualsFlag & util.VizFlags.homes) != 0) {
                for (let i = 0; i < this.allHouseholds.length; i++) {
                    let house = this.allHouseholds[i];
                    if (this.selectedCountyIndex == -1 || house.county == this.selectedCountyIndex)
                        ctx.fillRect(house.xpos * this.scalex, house.ypos * this.scaley, 1, 1);
                }
            }
            if ((this.visualsFlag & util.VizFlags.offices) != 0) {
                for (let i = 0; i < Math.min(1000000, this.allOffices.length); i++) {
                    let office = this.allOffices[i];
                    ctx.fillRect(office.xpos * this.scalex, office.ypos * this.scaley, 1, 1);
                }
            }
            if ((this.visualsFlag & util.VizFlags.hospitals) != 0) {
                for (let i = 0; i < this.allHospitals.length; i++) {
                    let hospital = this.allHospitals[i];
                    // Draw a happy little red cross because there's no red cross emoji.
                    this.drawCircle(ctx, hospital.xpos, hospital.ypos, 0.008 * this.scalex, "#ffffff", true);
                    this.drawRect(ctx, hospital.xpos - 0.006, hospital.ypos - 0.002, 0.012, 0.004, "rgb(255, 64, 64)");
                    this.drawRect(ctx, hospital.xpos - 0.002, hospital.ypos - 0.006, 0.004, 0.012, "rgb(255, 64, 64)");
                }
            }
            if ((this.visualsFlag & util.VizFlags.supermarkets) != 0) {
                for (let i = 0; i < this.allSuperMarkets.length; i++) {
                    let market = this.allSuperMarkets[i];
                    this.drawRect(ctx, market.xpos, market.ypos, 0.005, 0.005, "rgb(60, 255, 60)");
                }
            }
            if ((this.visualsFlag & util.VizFlags.susceptible) != 0) {
                for (let i = 0; i < this.pop.length; i++) {
                    let person = this.pop[i];
                    if (person.isVulnerable) ctx.fillRect(person.xpos * this.scalex, person.ypos * this.scaley, 1, 1);
                }
            }
            if ((this.visualsFlag & util.VizFlags.infected) != 0) {
                for (let i = 0; i < this.pop.length; i++) {
                    let person = this.pop[i];
                    if (person.isSick) ctx.fillRect(person.xpos * this.scalex, person.ypos * this.scaley, 2, 2);
                }
            }
            if ((this.visualsFlag & util.VizFlags.recovered) != 0) {
                for (let i = 0; i < this.pop.length; i++) {
                    let person = this.pop[i];
                    if (person.isRecovered) ctx.fillRect(person.xpos * this.scalex, person.ypos * this.scaley, 2, 2);
                }
            }
            // for (let i = 0; i < businessJSON.length; i++) {
            //     let business = businessJSON[i];
            //     let lat: any = business[0]!;
            //     let lon: any = business[1]!;

            //     let [x, y] = this.latLonToPos(parseFloat(lat), parseFloat(lon));
            //     this.drawRect(ctx, x, y, 0.0015, 0.002, "rgb(255, 0, 255)");
            // }

            // Reference point to check lat/lon
            // let [x, y] = this.latLonToPos(37.7615, -122.44);  // middle of range
            // this.drawCircle(ctx, x, y, 2, "rgb(60, 255, 240)");
            // [x, y] = this.latLonToPos(37.810515, -122.424476);  // aquatic park
            // this.drawCircle(ctx, x, y, 2, "rgb(6, 155, 240)");
            // [x, y] = this.latLonToPos(37.774746, -122.454676);  // upper right of GG park
            // this.drawCircle(ctx, x, y, 2, "rgb(60, 255, 40)");
            // [x, y] = this.latLonToPos(37.708787, -122.374493);  // east candlestick point
            // this.drawCircle(ctx, x, y, 2, "rgb(160, 255, 40)");

            // Animate infection circles and delete things from the list that are old.
            let tempIV: number[][] = [];
            ctx.lineWidth = 1.5;
            for (let i = 0; i < this.infectedVisuals.length; i++) {
                let t = (this.time_steps_since_start.hours - this.infectedVisuals[i][2].hours) / 2;
                let alpha = Math.max(0, 60 - t) / 60.0;
                if (alpha > 0.0) tempIV.push(this.infectedVisuals[i]);

                const maxDraws = 32; // Limit the number of circles that can be drawn for performance.
                if (i > this.infectedVisuals.length - maxDraws) {
                    let x = this.infectedVisuals[i][0];
                    let y = this.infectedVisuals[i][1];
                    this.drawCircle(ctx, x, y, t + 2, "rgba(255,100,10," + alpha.toString() + ")", false);
                }
            }
            this.infectedVisuals = tempIV;
            ctx.lineWidth = 1.0;

            // Draw map lat/lon extents around the map
            this.drawText(ctx, 0.45, -0.01, "max lat: " + this.latMax);
            this.drawText(ctx, 0.45, 1.02 * this.latAdjust, "min lat: " + this.latMin);
            this.drawText(ctx, -0.215, 0.49 * this.latAdjust, "min lon: " + this.lonMin);
            this.drawText(ctx, 1.01, 0.49 * this.latAdjust, "max lon: " + this.lonMax);

            // // Look at Google timeline data
            // for (let i = 0; i < 100; i++) {
            //     let slide = this.time_steps_since_start + i + 2200;
            //     let lat = Number.parseFloat(allLocations[slide].latitudeE7) * 0.0000001;
            //     let lon = Number.parseFloat(allLocations[slide].longitudeE7) * 0.0000001;
            //     // console.log(lat + ", " + lon);

            //     let [x,y] = this.latLonToPos(lat, lon);
            //     this.drawCircle(ctx, x, y, .2, "rgb(255,255,2)");
            // }

            // console.log(peopleJSON);

            // // Look at Population density people
            // for (let i = 0; i < peopleJSON.length; i += 100) {
            //     let p = peopleJSON[i];
            //     let lat = Number.parseFloat(p[0]);
            //     let lon = Number.parseFloat(p[1]);
            //     let [x, y] = this.latLonToPos(lat, lon);
            //     this.drawCircle(ctx, x, y, 0.5, "#ffff02");
            //     // ctx.fillRect((x * this.scalex) | 0, (y * this.scaley) | 0, 2, 2);
            // }

            this.countyStats.drawGraph(Math.max(0, this.selectedCountyIndex), this.params);
            // ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
    }
    controllerClick(x: number, y: number) {
        x = (x / this.scalex) * this.canvasWidth;
        y = (y / this.scaley) * this.canvasHeight;
        // If we're not actively dragging something, let people drag the phone screen.
        // if (this.mouse.mode != -1) event.preventDefault();
        // console.log(x.toString() + "   " + y.toString());
        let bestIndex = -1;
        let bestDist = Number.MAX_VALUE;
        for (let i = 0; i < this.allHouseholds.length; i++) {
            let hh = this.allHouseholds[i];
            let xp = hh.xpos;
            let yp = hh.ypos;
            let dx = xp - x;
            let dy = yp - y;
            let distSq = dx * dx + dy * dy;
            if (distSq < bestDist && hh.residents.length > 0) {
                bestDist = distSq;
                bestIndex = i;
            }
        }
        this.selectedHouseholdIndex = bestIndex;
        let hh = this.allHouseholds[this.selectedHouseholdIndex];
        console.log("capactity: " + hh.capacity + ",    residents: " + hh.residents.length);

        this.lastMouseX = x;
        this.lastMouseY = y;
        this.draw();
    }
    playPause() {
        if (this.paused) this.paused = false;
        else this.paused = true;

        this.draw();
    }
    translation(dx: number, dy: number) {
        const canvas = <HTMLCanvasElement>document.getElementById("map-canvas");
        if (canvas.getContext) {
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            let storedTransform = ctx.getTransform();
            let cx = storedTransform.e;
            let cy = storedTransform.f;
            let cscale = storedTransform.a; // assume aspect ratio 1

            ctx.translate(-dx / cscale, -dy / cscale);
        }
        this.draw();
    }
    changeZoom(scale: number) {
        const canvas = <HTMLCanvasElement>document.getElementById("map-canvas");
        if (canvas.getContext) {
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            let storedTransform = ctx.getTransform();
            let cx = storedTransform.e;
            let cy = storedTransform.f;
            let cscale = storedTransform.a; // assume aspect ratio 1
            let amount = 1.03125;
            if (scale > 0) {
                ctx.translate(canvas.width * 0.5, canvas.height * 0.5);
                ctx.scale(1 / amount, 1 / amount);
                ctx.translate(-canvas.width * 0.5, -canvas.height * 0.5);
            } else {
                ctx.translate(canvas.width * 0.5, canvas.height * 0.5);
                ctx.scale(amount, amount);
                ctx.translate(-canvas.width * 0.5, -canvas.height * 0.5);
            }
        }
        this.draw();
    }
}
