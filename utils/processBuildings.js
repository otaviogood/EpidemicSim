"use strict";
var assert = require("assert");
const fs = require("fs");
var MersenneTwister = require("mersenne-twister");
var rand = new MersenneTwister(1234567890);
var turf = require("@turf/turf");
const papa = require("papaparse");

const countyInfo = require("./countyUtils");
const mapBounds = require("./mapBounds");

let houseHoldFile = "processedData/" + mapBounds.defaultPlace + "_Households.json";
let officeFile = "processedData/" + mapBounds.defaultPlace + "_Offices.json";
let countyPolygonsFile = "processedData/" + mapBounds.defaultPlace + "_CountyPolygons.json";

// Round a number up or down randomly, weighted by the fractional component
function roundRandom(x) {
    let frac = x % 1;
    let r = rand.random();
    if (r < frac) return Math.floor(x) + 1;
    else return Math.floor(x);
}

async function doEverything() {
    let countyStuff = new countyInfo.CountyInfo();
    await countyStuff.readAllCountiesCensus();
    // -------------------- Households --------------------
    let buildingPositionsJSON = JSON.parse(
        fs.readFileSync("processedData/" + mapBounds.defaultPlace + "_BuildingPositions.json", "utf8")
    );

    // Append the county ID onto each location in the list.
    buildingPositionsJSON = await countyStuff.tagListWithCountyIndexAndFilter(buildingPositionsJSON);
    console.log(countyStuff.censusInfo);

    // Count the populations per county from the facebook population density data
    // so that we can correct it to match the census data.
    let numCounties = mapBounds.info[mapBounds.defaultPlace].includedCounties.length;
    let countyPopsInitial = Array(numCounties).fill(0);
    for (let i = 0; i < buildingPositionsJSON.length; i++) {
        let posAndCount = buildingPositionsJSON[i];
        let lat = posAndCount[0];
        let lon = posAndCount[1];
        let count = posAndCount[2];
        let countyIndex = posAndCount[posAndCount.length - 1];
        countyPopsInitial[countyIndex] += count;
    }
    console.log("county populations initial: ");
    console.log(countyPopsInitial);

    // Figure out the multiplier for each county that will correct the population to match the census.
    let multipliers = Array(numCounties).fill(0);
    for (let i = 0; i < numCounties; i++) {
        multipliers[i] = countyStuff.censusInfo.get(i).get("population") / countyPopsInitial[i];
    }
    console.log("Multipliers: " + multipliers);

    let households = [];
    let avgHouseholdSize = 0;
    let population = 0;
    for (let i = 0; i < buildingPositionsJSON.length; i++) {
        let posAndCount = buildingPositionsJSON[i];
        let lat = posAndCount[0];
        let lon = posAndCount[1];
        let count = posAndCount[2];
        let countyIndex = posAndCount[posAndCount.length - 1];
        count *= roundRandom(multipliers[countyIndex]);
        population += count;
        while (count > 0) {
            let rsize = 4; // TODO: get household size right.
            let r = rand.random_int31() % 3;
            if (r == 0) rsize += rand.random_int31() & 7; //  crappy distribution so we get some bigger houses
            let size = Math.min(count, rsize);
            households.push([lat, lon, size, countyIndex]);
            avgHouseholdSize += size;
            count -= size;
        }
    }
    console.log("Average household size: " + ((avgHouseholdSize * 1.0) / households.length).toFixed(2));
    console.log("Adjusted Population: " + population);

    fs.writeFileSync(houseHoldFile, JSON.stringify(households, null, "\t"));

    fs.writeFileSync(countyPolygonsFile, JSON.stringify(Object.fromEntries(countyStuff.relevantCountyPolygons)));

    // -------------------- Offices --------------------
    let businessesJSON = JSON.parse(fs.readFileSync("processedData/" + mapBounds.defaultPlace + "_Businesses.json", "utf8"));

    // Append the county ID onto each location in the list.
    businessesJSON = await countyStuff.tagListWithCountyIndexAndFilter(businessesJSON);

    // Offices are approximated, so just make more until we have an office for most people.
    // TODO: this is a bit arbitrary... look into more representative numbers.
    let multiplier = 3;
    let offices = [];
    let avgOfficeSize = 0;
    let totalOffices = 0;
    for (let i = 0; i < businessesJSON.length; i++) {
        let posAndName = businessesJSON[i];
        let lat = posAndName[0];
        let lon = posAndName[1];
        let countyIndex = posAndName[posAndName.length - 1];
        if (countyIndex == -1) continue;
        for (let i = 0; i < multiplier; i++) {
            let size = (Math.pow(rand.random(), 2.0) * 55 + 1) | 0; // skew distribution to smaller businesses
            offices.push([lat, lon, size, countyIndex]);
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
}

doEverything();
