"use strict";
var assert = require("assert");
const fs = require("fs");
var MersenneTwister = require("mersenne-twister");
var rand = new MersenneTwister(1234567890);

const mapBounds = require("./mapBounds");

let houseHoldFile = "processedData/" + mapBounds.defaultPlace + "_Households.json";
let officeFile = "processedData/" + mapBounds.defaultPlace + "_Offices.json";

function loadJSON(fname) {
    const fileContents = fs.readFileSync(fname, "utf8");
    try {
        return new Map(Object.entries(JSON.parse(fileContents)));
    } catch (err) {
        console.error(err);
    }
}

// -------------------- Households --------------------
let buildingPositionsJSON = loadJSON("processedData/" + mapBounds.defaultPlace + "_BuildingPositions.json");

let households = [];

let avgHouseholdSize = 0;
let population = 0;
for (const [index, posAndCount] of buildingPositionsJSON) {
    let lat = posAndCount[0];
    let lon = posAndCount[1];
    let count = posAndCount[2];
    population += count;
    while (count > 0) {
        let rsize = 2;
        let r = rand.random_int31() & 3;
        if (r == 0) rsize += rand.random_int31() & 3; //  crappy distribution so we get some bigger houses
        let size = Math.min(count, rsize);
        households.push([lat, lon, size]);
        avgHouseholdSize += size;
        count -= size;
    }
}
console.log("Average household size: " + ((avgHouseholdSize * 1.0) / households.length).toFixed(2));
console.log("Population: " + population);

fs.writeFileSync(houseHoldFile, JSON.stringify(households, null, "\t"));

// -------------------- Offices --------------------
let businessesJSON = loadJSON("processedData/" + mapBounds.defaultPlace + "_Businesses.json");

// Offices are approximated, so just make more until we have an office for most people.
// TODO: this is a bit arbitrary... look into more representative numbers.
let multiplier = 3;
let offices = [];
let avgOfficeSize = 0;
let totalOffices = 0;
for (const [index, posAndName] of businessesJSON) {
    let lat = posAndName[0];
    let lon = posAndName[1];
    for (let i = 0; i < multiplier; i++) {
        let size = (Math.pow(rand.random(), 2.0) * 55 + 1) | 0; // skew distribution to smaller businesses
        offices.push([lat, lon, size]);
        avgOfficeSize += size;
        totalOffices++;
    }
}
let totalOfficeSeats = avgOfficeSize;
avgOfficeSize /= 1.0 * totalOffices;

console.log("Average office size: " + avgOfficeSize);
console.log("Total offices: " + totalOffices);
console.log("Total office Seats: " + totalOfficeSeats);

fs.writeFileSync(officeFile, JSON.stringify(offices, null, "\t"));
