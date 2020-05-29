"use strict";
var assert = require("assert");
const fs = require("fs");
var MersenneTwister = require("mersenne-twister");
var rand = new MersenneTwister(1234567890);
var turf = require("@turf/turf");

const mapBounds = require("./mapBounds");

let houseHoldFile = "processedData/" + mapBounds.defaultPlace + "_Households.json";
let officeFile = "processedData/" + mapBounds.defaultPlace + "_Offices.json";

function loadJSONMap(fname) {
    const fileContents = fs.readFileSync(fname, "utf8");
    try {
        return new Map(Object.entries(JSON.parse(fileContents)));
    } catch (err) {
        console.error(err);
    }
}

// Make a dictionary (Map) of points and which counties they are in.
// Takes lon, lat order
// returns lon, lat order.
function loadCounties(pointList, households) {
    console.log("Loading county boundaries");
    let pointToCounty = new Map();
    let ourCounties = Object.values(mapBounds.info[mapBounds.defaultPlace].includedCounties);
    let ourCountyIds = Object.keys(mapBounds.info[mapBounds.defaultPlace].includedCounties);
    // County data from here: https://public.opendatasoft.com/explore/dataset/us-county-boundaries/export/?q=santa+clara
    // Downloaded geojson, whole dataset.
    let counties = fs.readFileSync("../sourceData/us-county-boundaries.geojson", "utf8"); // lon,lat order!!!
    counties = JSON.parse(counties);
    counties = counties["features"];
    for (let i = 0; i < counties.length; i++) {
        let county = counties[i];
        for (let j = 0; j < ourCounties.length; j++) {
            let ourCounty = ourCounties[j];
            let ourCountyId = parseInt(ourCountyIds[j]);
            if (county.properties.namelsad == ourCounty || county.properties.name == ourCounty) {
                console.log("Found: " + county.properties.namelsad);
                // Use the "turf" library to find which points are in a polygon that defines a county.
                // http://turfjs.org/docs/#pointsWithinPolygon
                let searchWithin = turf.polygon(county.geometry.coordinates);
                let points = turf.points(pointList);
                let ptsWithin = turf.pointsWithinPolygon(points, searchWithin);
                // Loop through resulting points that are int the county and make a map of point to county ID.
                for (let k = 0; k < ptsWithin.features.length; k++) {
                    let point = ptsWithin.features[k];
                    pointToCounty.set(
                        point.geometry.coordinates[0].toString() + "_" + point.geometry.coordinates[1].toString(),
                        ourCountyId
                    );
                }
                console.log("Points inside county: " + ptsWithin.features.length);
            }
        }
    }
    // console.log(pointToCounty);
    return pointToCounty;
}

// -------------------- Households --------------------
let buildingPositionsJSON = loadJSONMap("processedData/" + mapBounds.defaultPlace + "_BuildingPositions.json");

let households = [];
let householdsLL = []; // Just lon, lat - for point lists to find points in counties.

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
        households.push([lat, lon, size, -1]);
        householdsLL.push([lon, lat]); // lon, lat order!
        avgHouseholdSize += size;
        count -= size;
    }
}
console.log("Average household size: " + ((avgHouseholdSize * 1.0) / households.length).toFixed(2));
console.log("Population: " + population);

// Set a county for each household (if there is one).
let pointToCounty = loadCounties(householdsLL, households);
for (let i = 0; i < households.length; i++) {
    let hh = households[i];
    let hhPos = hh[1] + "_" + hh[0]; // lon, lat order!!!!
    if (pointToCounty.has(hhPos)) households[i][3] = pointToCounty.get(hhPos);
}

fs.writeFileSync(houseHoldFile, JSON.stringify(households, null, "\t"));

// -------------------- Offices --------------------
let businessesJSON = loadJSONMap("processedData/" + mapBounds.defaultPlace + "_Businesses.json");

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
