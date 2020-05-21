import "@babel/polyfill"; // This is for using ES2017 features, like async/await.
import { Person, ActivityType } from "./person";
import { Spatial, Grid } from "./spatial";
import * as Params from "./params";
import * as util from "./util";
// https://github.com/boo1ean/mersenne-twister
import MersenneTwister from "mersenne-twister";
import RandomFast from "./random-fast";
// import latlons from "../../contact_tracing/devon_since_feb.json";
// const allLocations = (<any>latlons).locations;
// console.log(allLocations);

const mapBounds = require("../utils/mapBounds");

import supermarketJSON from "../utils/processedData/sfSupermarkets.json";
import hospitalJSON from "../utils/processedData/sfHospitals.json";
// import businessJSON from "../utils/processedData/sfBusinesses.json";

class Place {
    xpos: number = 0;
    ypos: number = 0;
    residents: number[] = [];
    constructor(readonly lat: number, readonly lon: number, readonly capacity: number) {}

    latLonToPos(sim: Sim) {
        [this.xpos, this.ypos] = sim.latLonToPos(this.lat, this.lon);
    }
    static genHousehold(sim: Sim, lat: any, lon: any, capacity: number): Place {
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
    rfast: RandomFast;
    rand: MersenneTwister;
    pop: Spatial = new Spatial();

    allHouseholds: Place[] = [];
    allOffices: Place[] = [];
    allSuperMarkets: Place[] = [];
    allHospitals: Place[] = [];
    lonMin: number = mapBounds.lonMin;
    latMin: number = mapBounds.latMin;
    lonMax: number = mapBounds.lonMax;
    latMax: number = mapBounds.latMax;
    latAdjust: number;

    time_steps_since_start = 0;
    infected_array: number[] = [];
    totalInfected = 0;
    numActive = 0;
    totalDead = 0;

    selectedHouseholdIndex = -1;
    selectedPersonIndex = 0;
    lastMouseX = -1;
    lastMouseY = -1;

    // ---- visuals ----
    canvasWidth = 768;
    canvasHeight = 768;
    scalex = 1;
    scaley = 1;
    paused = false;
    infectedVisuals: number[][] = [];

    constructor(params: Params.Base) {
        this.params = params;
        this.rand = new MersenneTwister(params.randomSeed);
        this.rfast = new RandomFast(params.randomSeed);
        this.latAdjust = Math.cos(util.toRadians((this.latMin + this.latMax) * 0.5)); // Adjust for curved earth (approximately with a point)
        console.log("sim.minlat: " + this.latMin);
        console.log("sim.maxlat: " + this.latMax);
        console.log("sim.minlon: " + this.lonMin);
        console.log("sim.maxlon: " + this.lonMax);
        console.log("aspect ratio: " + (this.latMax - this.latMin) / (this.lonMax - this.lonMin));
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

    async setup() {
        console.log("-------- SETUP --------");
        img = await loadImage("sf_map_osm_hi.jpg");

        // -------- Load HOUSE position and size data --------
        let jsonTemp = await fetch("sfHouseholds.json");
        let homeDataJSON = await jsonTemp.json();
        this.allHouseholds = [];
        let totalHomeCapacity = 0;
        for (const p of homeDataJSON) {
            this.allHouseholds.push(new Place(p[0], p[1], p[2]));
            totalHomeCapacity += p[2];
        }
        console.log("Total home capacity from file: " + totalHomeCapacity);
        console.log("Total households: " + this.allHouseholds.length);
        console.log("Average household size: " + totalHomeCapacity / this.allHouseholds.length);

        // -------- Load OFFICE position and size data --------
        jsonTemp = await fetch("sfOffices.json");
        let officeDataJSON = await jsonTemp.json();
        this.allOffices = [];
        let totalOfficeCapacity = 0;
        for (const p of officeDataJSON) {
            this.allOffices.push(new Place(p[0], p[1], p[2]));
            totalOfficeCapacity += p[2];
        }
        console.log("Total office capacity from file: " + totalOfficeCapacity);
        console.log("Total offices: " + this.allOffices.length);
        console.log("Average office size: " + totalOfficeCapacity / this.allOffices.length);

        for (const sm of supermarketJSON) this.allSuperMarkets.push(Place.genHousehold(this, sm[0], sm[1], 200)); // TODO: supermarket capacity???
        for (const h of hospitalJSON) this.allHospitals.push(Place.genHousehold(this, h[0], h[1], 200)); // TODO: hospital capacity???

        util.shuffleArrayInPlace(this.allHouseholds, this.rand);
        for (let i = 0; i < this.allHouseholds.length; i++) this.allHouseholds[i].latLonToPos(this);
        util.shuffleArrayInPlace(this.allOffices, this.rand);
        for (let i = 0; i < this.allOffices.length; i++) this.allOffices[i].latLonToPos(this);

        // Allocate people to their houses and offices.
        console.log("Generating people data...");

        let householdIndex = 0;
        const numHouses = this.allHouseholds.length;
        let done = false;
        let i = 0;

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

            // Assign a semi-random, but close-to-your-house supermarket as your favorite place to go
            let randMarket = this.rfast.RandIntApprox(0, this.allSuperMarkets.length);
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
                randMarket = this.rfast.RandIntApprox(0, this.allSuperMarkets.length);
            }

            // Assign a semi-random, but close-to-your-house hospital as your favorite place to go
            let randHospital = this.rfast.RandIntApprox(0, this.allHospitals.length);
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
                randHospital = this.rfast.RandIntApprox(0, this.allHospitals.length);
            }

            this.pop.add(person);
            i++;
        }
        console.log("total people: " + this.pop.length);
        console.log("used homes: " + householdIndex);
        // console.log("used offices: " + officeIndex);

        // this.pop.index(1).occupation = 1;
        // let near = this.pop.findKNearest(1, 4);
        // for (let i = 0; i < near.length; i++) {
        //     this.pop.index(near[i]).occupation = 2;
        // }
        // this.pop.index(near).occupation = 2;
        for (let i = 0; i < 31; i++) {
            this.pop.index(i).becomeSick(this);
            // this.pop.index(i).time_since_infected = Person.mean_time_till_contagious + 1;
            // this.totalInfected++;
            this.numActive++;
        }

        this.pop.index(this.selectedPersonIndex).drawTimeline(<HTMLCanvasElement>document.getElementById("timeline-canvas"));
        window.requestAnimationFrame(() => this.draw());
    }
    run_simulation(num_time_steps: number) {
        for (let ts = 0; ts < num_time_steps; ts++) {
            this.numActive = 0;
            let currentHour = this.time_steps_since_start % 24;
            this.params.doInterventionsForThisTimestep(this.time_steps_since_start);
            for (let i = 0; i < this.pop.length; i++) {
                let person = this.pop.index(i);
                this.numActive += person.stepTime(this, this.rand) ? 1 : 0;
                person.spread(this.time_steps_since_start, i, this.pop, this.rand, currentHour, this);
            }
            this.time_steps_since_start++;
        }

        // Every day, save off total infected so i can graph it.
        if (this.time_steps_since_start % 24 == 0) this.infected_array.push(this.totalInfected);
    }
    drawGraph() {
        const canvas = <HTMLCanvasElement>document.getElementById("graph-canvas");
        if (canvas.getContext) {
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            //            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let x = this.infected_array.length - 1;

            ctx.fillStyle = "#ffcf5f";
            let height = (this.infected_array[x] / this.pop.length) * canvas.height;
            ctx.fillRect(x, canvas.height - height, 1, height);

            ctx.fillStyle = "#ffffff";
            height = (this.numActive / this.pop.length) * canvas.height;
            ctx.fillRect(x, canvas.height - height, 1, 5);

            if (this.totalDead > 0) {
                ctx.fillStyle = "#ff3711";
                height = (this.totalDead / this.pop.length) * canvas.height;
                ctx.fillRect(x, canvas.height - height, 1, 3);
            }
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
            let ratio = this.canvasWidth / imgMax;
            [this.canvasWidth, this.canvasHeight] = [canvas.width, canvas.height];
            this.scalex = canvas.width;
            this.scaley = canvas.height;

            ctx.globalAlpha = 0.3;
            ctx.drawImage(img, 0, 0, imgWidth * ratio, imgHeight * ratio);
            ctx.globalAlpha = 1.0;

            // ---- Draw selected *household* info ----
            if (this.selectedHouseholdIndex >= 0) {
                let hh: Place = this.allHouseholds[this.selectedHouseholdIndex];

                this.drawCircle(ctx, hh.xpos, hh.ypos, 8, "rgb(255,128,0)", false);

                this.drawText(ctx, hh.xpos + 0.02, hh.ypos, hh.residents.length.toString());
                for (let i = 0; i < hh.residents.length; i++) {
                    let popIndex = hh.residents[i];
                    let person: Person = this.pop.index(popIndex);
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
                let p: Person = this.pop.index(this.selectedPersonIndex);
                let market = this.allSuperMarkets[p.marketIndex];
                let house = this.allHouseholds[p.homeIndex];
                let office = this.allOffices[p.officeIndex];
                let hospital = this.allHospitals[p.hospitalIndex];

                let currentHour = this.time_steps_since_start % 24;
                let activity = p.getCurrentActivity(currentHour);
                let localx: number = house.xpos;
                let localy: number = house.ypos;
                if (activity == ActivityType.work) (localx = office.xpos), (localy = office.ypos);
                if (activity == ActivityType.shopping) (localx = market.xpos), (localy = market.ypos);
                if (activity == ActivityType.hospital) (localx = hospital.xpos), (localy = hospital.ypos);
                p.xpos = (p.xpos + localx) * 0.5;
                p.ypos = (p.ypos + localy) * 0.5;
                let px = p.xpos;
                let py = p.ypos;

                this.drawCircle(ctx, px, py, 12, "rgba(0,220,255,0.4)");
                // this.drawText(ctx, hh.xpos + 0.02, hh.ypos, hh.residents.length.toString());
                this.drawLine(ctx, px, py, market.xpos, market.ypos, "rgba(60, 255, 60, 0.5)");
                this.drawLine(ctx, px, py, house.xpos, house.ypos, "rgba(0, 0, 0, 0.5)");
                this.drawLine(ctx, px, py, office.xpos, office.ypos, "rgba(160, 160, 160, 0.5)");
                this.drawLine(ctx, px, py, hospital.xpos, hospital.ypos, "rgba(255, 25, 20, 0.5)");
                this.drawText(ctx, market.xpos - 0.0125, market.ypos, "🏪");
                this.drawText(ctx, house.xpos - 0.0125, house.ypos, "🏡");
                this.drawText(ctx, office.xpos - 0.0125, office.ypos, "🏢");
                this.drawText(ctx, hospital.xpos - 0.0125, hospital.ypos, "🏥");
            }

            if (this.paused) {
                // Rendering is by far the bottleneck, so target this many rendered points and skip the rest.
                let skip = (this.pop.length / 256) | 0;
                for (let i = 0; i < this.pop.length; i += skip) {
                    let person = this.pop.index(i);
                    let color = "#000000";
                    let radius = 1;
                    if (person.time_since_infected >= 0) {
                        color = "rgb(255, 192, 0)";
                        radius = 5;
                    }
                    if (person.time_since_infected >= this.params.mean_time_till_contagious) {
                        color = "rgb(255, 0, 0)";
                    }
                    if (person.time_since_infected >= this.params.median_time_virus_is_communicable) {
                        radius = 2;
                        color = "rgb(0, 64, 255)";
                    }
                    // if (person.debug != 0) color = RandomFast.ToRGB(person.debug);
                    this.drawCircle(ctx, person.xpos, person.ypos, radius, color);
                }
                for (let i = 0; i < Math.min(128, this.allOffices.length); i++) {
                    let office = this.allOffices[i];
                    this.drawRect(ctx, office.xpos, office.ypos, 0.0025, 0.0025, "rgb(160, 160, 160)");
                }
                for (let i = 0; i < supermarketJSON.length; i++) {
                    let market = supermarketJSON[i];
                    let lat: any = market[0]!;
                    let lon: any = market[1]!;

                    let [x, y] = this.latLonToPos(parseFloat(lat), parseFloat(lon));
                    this.drawRect(ctx, x, y, 0.0025, 0.0025, "rgb(60, 255, 60)");
                }
                for (let i = 0; i < hospitalJSON.length; i++) {
                    let hospital = hospitalJSON[i];
                    let lat: any = hospital[0]!;
                    let lon: any = hospital[1]!;

                    let [x, y] = this.latLonToPos(parseFloat(lat), parseFloat(lon));
                    this.drawRect(ctx, x, y, 0.0025, 0.0025, "rgb(255, 25, 20)");
                }
                // for (let i = 0; i < businessJSON.length; i++) {
                //     let business = businessJSON[i];
                //     let lat: any = business[0]!;
                //     let lon: any = business[1]!;

                //     let [x, y] = this.latLonToPos(parseFloat(lat), parseFloat(lon));
                //     this.drawRect(ctx, x, y, 0.0015, 0.002, "rgb(255, 0, 255)");
                // }
            }

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
            ctx.lineWidth = 2;
            for (let i = 0; i < this.infectedVisuals.length; i++) {
                let t = (this.time_steps_since_start - this.infectedVisuals[i][2]) / 2;
                let alpha = Math.max(0, 100 - t) / 100.0;
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

            this.drawGraph();
            // if ((this.numActive > 0) && (!this.paused)) {
            //     this.run_simulation(1);
            //     window.requestAnimationFrame(() => this.draw());
            // }
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
            if (scale > 0) {
                ctx.translate(canvas.width * 0.5, canvas.height * 0.5);
                ctx.scale(1 / 1.125, 1 / 1.125);
                ctx.translate(-canvas.width * 0.5, -canvas.height * 0.5);
            } else {
                ctx.translate(canvas.width * 0.5, canvas.height * 0.5);
                ctx.scale(1.125, 1.125);
                ctx.translate(-canvas.width * 0.5, -canvas.height * 0.5);
            }
        }
        this.draw();
    }
}
