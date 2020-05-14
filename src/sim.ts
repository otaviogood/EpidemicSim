var Papa = require("papaparse");
import "@babel/polyfill"; // This is for using ES2017 features, like async/await.
import { Person, ActivityType } from "./person";
import { Spatial, Grid } from "./spatial";
// https://github.com/boo1ean/mersenne-twister
// var MersenneTwister = require("mersenne-twister");
import MersenneTwister from "mersenne-twister";
var generator: MersenneTwister; // = new MersenneTwister(1234567890);
import RandomFast from "./random-fast";
// import latlons from "../../contact_tracing/devon_since_feb.json";
// const allLocations = (<any>latlons).locations;
// console.log(allLocations);

import supermarketJSON from "../utils/sfSupermarkets.json";
import hospitalJSON from "../utils/sfHospitals.json";

class HouseHold {
    xpos: number = 0;
    ypos: number = 0;
    residents: number[] = [];
    constructor(readonly lat: number, readonly lon: number, readonly capacity: number) {}

    latLonToPos(sim: Sim) {
        [this.xpos, this.ypos] = sim.latLonToPos(this.lat, this.lon);
    }
    static genHousehold(sim: Sim, lat: any, lon: any, capacity: number): HouseHold {
        let lat2: any = lat!;
        let lon2: any = lon!;
        let hh = new HouseHold(parseFloat(lat2), parseFloat(lon2), capacity);
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

export async function parseCSV(sim: Sim) {
    // return new Promise(function(complete:any, error:any) {
    await Papa.parse("San_Francisco_Buildings_Trimmed.csv", {
        download: true,
        header: true,
        delimiter: ",",
        error: function() {
            console.log("ERRORORORR");
        },
        complete: async function(results: any) {
            let rows;
            rows = results.data;
            console.log("Finished:", rows[0]);
            if (rows.length < 100) alert("ERROR: Probably couldn't find building csv file to load.");
            let totalHomeCapacity = 0;
            let totalOfficeCapacity = 0;
            // header = rows[0];
            for (let i = 0; i < rows.length; i++) {
                let row = rows[i];
                const lonS = row["building_latitude"].trim(); // THIS FILE HAS LAT/LON SWITCHED!!!! :(
                const latS = row["building_longitude"].trim();
                let lat = Number.parseFloat(latS);
                let lon = Number.parseFloat(lonS);

                // HACK!!!! Only 2 digits of precision in lat/lon from file, so let's randomize the rest.
                lat += generator.random() * 0.01; // + 0.005;
                lon += generator.random() * 0.01 - 0.005;

                const facility = row["residential_facility_type"];
                const units = row["dwelling_units"];
                if (facility) {
                    const res: boolean = facility.includes("RESIDENTIAL");
                    // 3 people per "dwelling unit" - arbitrary, but got SF to population 843,821 residents.
                    // https://housing.datasf.org/data-browser/population-and-households/average-household-size/
                    let capacity: number = (parseInt(units) | 0) * 3;
                    capacity = Math.max(1, capacity);
                    if (res) {
                        // home
                        totalHomeCapacity += capacity;
                        while (capacity > 0) {
                            // TODO: make house-size distribution better. This has no large houses. This has avg household size of 2.18. SF is 2.32.
                            let subUnit = Math.min(2 + (generator.random_int31() & 1), capacity);
                            sim.allHouseholds.push(new HouseHold(lat, lon, subUnit));
                            capacity -= subUnit;
                        }
                    } else {
                        // office
                        totalOfficeCapacity += capacity;
                        sim.allOffices.push(new HouseHold(lat, lon, capacity));
                    }
                    // sim.maxLat = Math.max(sim.maxLat, lat);
                    // sim.minLat = Math.min(sim.minLat, lat);
                    // sim.maxLon = Math.max(sim.maxLon, lon);
                    // sim.minLon = Math.min(sim.minLon, lon);
                }
            }
            console.log("sim.minlat: " + sim.minLat);
            console.log("sim.maxlat: " + sim.maxLat);
            console.log("sim.minlon: " + sim.minLon);
            console.log("sim.maxlon: " + sim.maxLon);
            console.log("aspect ratio: " + (sim.maxLat - sim.minLat) / (sim.maxLon - sim.minLon));

            const canvas = <HTMLCanvasElement>document.getElementById("graph-canvas");
            if (canvas.getContext) {
                const ctx = canvas.getContext("2d");
                if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
            // console.log("num buildings: " + sim.allHousePositions.length);
            console.log("total home capacity from file: " + totalHomeCapacity);
            console.log("total offices from file: " + totalOfficeCapacity);
            console.log("Total households: " + sim.allHouseholds.length);
            console.log("Average household size: " + totalHomeCapacity / sim.allHouseholds.length);

            sim.setup();
        },
    });
    // });
    // console.log("loaded CSV");

    img = await loadImage("sf_map_osm.jpg");
}

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function shuffleArrayInPlace(array: any) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(generator.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

export function fromHours(hours: number): number {
    return hours;
}
export function fromDays(days: number): number {
    return days * 24;
}

export class Sim {
    rfast: RandomFast = new RandomFast(1234567890);
    pop: Spatial = new Spatial();

    // static readonly time_step_hours = 1; // hours
    // for doubling time and r number, https://arxiv.org/ftp/arxiv/papers/2003/2003.09320.pdf page 9
    static readonly r = 2.5; // virus reproductive number
    static readonly r_time_interval = 4 * 24; // number of time steps (minutes) to do the r
    static readonly r_baseline_interval = Math.exp(Math.log(Sim.r) / Sim.r_time_interval);
    static readonly miss_rate = 0.03; // false negatives - a friend told me this number.
    static readonly time_steps_till_change_target = 4; // This changes the r number effectively. Bad I guess.???

    allHouseholds: HouseHold[] = [];
    allOffices: HouseHold[] = [];
    allSuperMarkets: HouseHold[] = [];
    allHospitals: HouseHold[] = [];
    maxLat: number = 37.815; //-Number.MAX_VALUE;
    minLat: number = 37.708; //Number.MAX_VALUE;
    maxLon: number = -122.354; //-Number.MAX_VALUE;
    minLon: number = -122.526; //Number.MAX_VALUE;

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

    constructor() {
        generator = new MersenneTwister(1234567890);
    }
    // Normalizes positions so they are in the [0..1] range on x and y.
    // Returns [x, y] tuple.
    latLonToPos(lat: number, lon: number): number[] {
        let xpos = (lon - this.minLon) / (this.maxLon - this.minLon);
        let ypos = 1.0 - (lat - this.minLat) / (this.maxLat - this.minLat);
        return [xpos, ypos];
    }

    async setup() {
        for (const sm of supermarketJSON) this.allSuperMarkets.push(HouseHold.genHousehold(this, sm[0], sm[1], 200)); // TODO: supermarket capacity???
        for (const h of hospitalJSON) this.allHospitals.push(HouseHold.genHousehold(this, h[0], h[1], 200)); // TODO: hospital capacity???

        shuffleArrayInPlace(this.allHouseholds);
        this.allHouseholds = this.allHouseholds.slice(0, Math.min(this.allHouseholds.length, 500000)); // HACK!!!! Limit # of houses for debugging
        for (let i = 0; i < this.allHouseholds.length; i++) this.allHouseholds[i].latLonToPos(this);
        shuffleArrayInPlace(this.allOffices);
        this.allOffices = this.allOffices.slice(0, this.allHouseholds.length / 2); // HACK!!!! Force offices to have half as many as there are houses
        for (let i = 0; i < this.allOffices.length; i++) this.allOffices[i].latLonToPos(this);

        // Allocate people to their houses and offices.
        console.log("Generating people data...");

        let householdIndex = 0;
        const numHouses = this.allHouseholds.length;
        let done = false;
        let i = 0;
        while (!done) {
            let person = new Person(generator, this.pop.length);

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
            for (let i = 0; i < this.pop.length; i++) {
                let person = this.pop.index(i);
                this.numActive += person.stepTime(this, generator) ? 1 : 0;
                person.spread(this.time_steps_since_start, i, this.pop, generator, currentHour, this);
            }
            this.time_steps_since_start++;
        }
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
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 0.3;
            ctx.drawImage(img, 0, 0);
            ctx.globalAlpha = 1.0;
            [this.canvasWidth, this.canvasHeight] = [canvas.width, canvas.height];
            this.scalex = canvas.width;
            this.scaley = canvas.height * 0.787;

            // ---- Draw selected *household* info ----
            if (this.selectedHouseholdIndex >= 0) {
                let hh: HouseHold = this.allHouseholds[this.selectedHouseholdIndex];

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
                let px = p.xpos; // Default to home as location.
                let py = p.ypos;
                let market = this.allSuperMarkets[p.marketIndex];
                let house = this.allHouseholds[p.homeIndex];
                let office = this.allOffices[p.officeIndex];
                let hospital = this.allHospitals[p.hospitalIndex];

                let currentHour = this.time_steps_since_start % 24;
                let activity = p.getCurrentActivity(currentHour);
                if (activity == ActivityType.work) (px = office.xpos), (py = office.ypos);
                if (activity == ActivityType.shopping) (px = market.xpos), (py = market.ypos);
                if (activity == ActivityType.work) (px = office.xpos), (py = office.ypos);
                if (activity == ActivityType.hospital) (px = hospital.xpos), (py = hospital.ypos);

                this.drawCircle(ctx, px, py, 12, "rgba(0,220,255,0.4)");
                // this.drawText(ctx, hh.xpos + 0.02, hh.ypos, hh.residents.length.toString());
                this.drawLine(ctx, px, py, market.xpos, market.ypos, "rgb(60, 255, 60)");
                this.drawLine(ctx, px, py, house.xpos, house.ypos, "rgb(0, 0, 0)");
                this.drawLine(ctx, px, py, office.xpos, office.ypos, "rgb(160, 160, 160)");
                this.drawLine(ctx, px, py, hospital.xpos, hospital.ypos, "rgb(255, 25, 20)");
                this.drawText(ctx, market.xpos-0.0125, market.ypos, "🏪");
                this.drawText(ctx, house.xpos-0.0125, house.ypos, "🏡");
                this.drawText(ctx, office.xpos-0.0125, office.ypos, "🏢");
                this.drawText(ctx, hospital.xpos-0.0125, hospital.ypos, "🏥");
            }

            // Rendering is by far the bottleneck, so target this many rendered points and skip the rest.
            let skip = (this.pop.length / 256) | 0;
            for (let i = 0; i < this.pop.length; i += skip) {
                let person = this.pop.index(i);
                let color = "#000000";
                let radius = 2;
                if (person.time_since_infected >= 0) {
                    color = "rgb(255, 192, 0)";
                    radius = 5;
                }
                if (person.time_since_infected >= Person.mean_time_till_contagious) {
                    color = "rgb(255, 0, 0)";
                }
                if (person.time_since_infected >= Person.median_time_virus_is_communicable) {
                    radius = 2;
                    color = "rgb(0, 64, 255)";
                }
                // if (person.debug != 0) color = RandomFast.ToRGB(person.debug);
                this.drawCircle(ctx, person.xpos, person.ypos, radius, color);
            }
            if (this.paused) {
                for (let i = 0; i < 128; i++) {
                    let office = this.allOffices[i];
                    this.drawRect(ctx, office.xpos, office.ypos, 0.005, 0.007, "rgb(160, 160, 160)");
                }
                for (let i = 0; i < supermarketJSON.length; i++) {
                    let market = supermarketJSON[i];
                    let lat: any = market[0]!;
                    let lon: any = market[1]!;

                    let [x, y] = this.latLonToPos(parseFloat(lat), parseFloat(lon));
                    this.drawRect(ctx, x, y, 0.005, 0.007, "rgb(60, 255, 60)");
                }
                for (let i = 0; i < hospitalJSON.length; i++) {
                    let hospital = hospitalJSON[i];
                    let lat: any = hospital[0]!;
                    let lon: any = hospital[1]!;

                    let [x, y] = this.latLonToPos(parseFloat(lat), parseFloat(lon));
                    this.drawRect(ctx, x, y, 0.005, 0.007, "rgb(255, 25, 20)");
                }
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

            // // Look at Google timeline data
            // for (let i = 0; i < 100; i++) {
            //     let slide = this.time_steps_since_start + i + 2200;
            //     let lat = Number.parseFloat(allLocations[slide].latitudeE7) * 0.0000001;
            //     let lon = Number.parseFloat(allLocations[slide].longitudeE7) * 0.0000001;
            //     // console.log(lat + ", " + lon);

            //     let [x,y] = this.latLonToPos(lat, lon);
            //     this.drawCircle(ctx, x, y, .2, "rgb(255,255,2)");
            // }

            // Every day, save off total infected so i can graph it.
            if (this.time_steps_since_start % 24 == 0) this.infected_array.push(this.totalInfected);

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
